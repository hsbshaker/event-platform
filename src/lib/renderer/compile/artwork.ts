/**
 * Artwork placement, resolved deterministically before any image exists.
 *
 * The `Artwork` leaf says *where* — a role and an extent, nothing else. This module turns that
 * into the compiler's half of `spec.md §7.6a #3`, "the model never places the image": it resolves
 * the default extent per role, decides whether the page's own budget admits the node, and settles
 * the one question an image makes hard, which is whether text can still be read over it.
 *
 * # Why the readability decision can be made without the artwork
 *
 * `spec.md §7.6a #5` is absolute — "text readability always wins over artwork" — and it has to be
 * honoured at a moment when the artwork does not exist. The `ResolvedDesignSpec` is compiled,
 * geometry-verified and frozen first; the asset attaches afterwards, or never. So contrast cannot
 * be measured against the image, and anything that waited for the image would make the verified
 * spec provisional.
 *
 * A motif is safe behind text today only because the compiler draws it: a known colour at a known
 * opacity, so the ratio is computable. An image is the opposite — arbitrary and unknown. What
 * makes it tractable is that the *worst case* is not unknown at all. Any image lies between pure
 * black and pure white in every channel, so a scrim of the section's own surface colour at alpha α
 * puts the effective background somewhere between `blend(surface, #000000, α)` and
 * `blend(surface, #FFFFFF, α)`. Both endpoints are computable now. If the compiled ink clears AA
 * against *both*, it clears AA against every image that could ever arrive.
 *
 * So the scrim is chosen as the lightest approved step that survives both endpoints, and when no
 * step survives them the artwork is not drawn behind that text at all. The page never waits on the
 * asset to know it is legible.
 *
 * # What is deliberately not decided here
 *
 * Not the subject, medium, palette relationship or crop safety — those are `VisualArtIntent`'s,
 * assembled *from* this resolution (`src/lib/ai/visual-art/contract.ts`). Not the pixel box: that
 * is measured by rendered-geometry verification, which is authoritative (`spec.md §32 #24`). This
 * module is the deterministic middle: it reserves, it never measures and it never generates.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #13`, `#15`, `#21`, `#24`. Canon: `spec.md §7.6a`.
 */
import type { ArtworkDecision } from "./artwork-decision";
import type { AnyNode, CompositionTree, Section } from "../composition/nodes";
import type { Anchor, ArtworkRole, Extent, SurfaceRole } from "../composition/tokens";
import { childrenOf, hasTextDescendant } from "../composition/walk";
import type { Deviation } from "../design-intent";
import { contrastRatio, formatHex, parseHex } from "./color";
import type { SemanticPalette } from "./palette";

/**
 * The only alphas a scrim may take, lightest first.
 *
 * A closed step list for the same reason `MOTIF_OPACITY_STEPS` is one: a continuous knob is a knob
 * somebody tunes per page, and the compiler's cosmetic parameters are vocabulary, not free
 * numbers. Lightest first because the scrim is a cost — every step spent is artwork hidden — so
 * the search takes the least that works rather than the most that is safe.
 */
export const ARTWORK_SCRIM_STEPS = [0.35, 0.5, 0.65, 0.8, 0.92] as const;

/**
 * How the artwork occupies its section. Resolved here, never authored by the model.
 *
 * The model already says three things about artwork: what it is *for* (`role`), how much of the
 * section it is for (`extent`), and where in the tree it sits. That is the structural decision, and
 * `CLAUDE.md §2` gives structure to the model. *Realizing* it — a zone or an overlap, cropped or
 * whole, protected or not — is the compiler's, exactly as `spec.md §7.6a #3` says. So a treatment
 * is a resolution, not a fifth knob: adding one changes this module and nothing the model sees,
 * which is why the composition language, its schema and its prompt are untouched by this work.
 *
 * - `contained` — the artwork sits whole inside a zone of its own, nothing cropped. The page's
 *   text is laid out beside it rather than over it.
 * - `side-anchor` — a full-height column on one side of the section, cropped to fill it. The
 *   artwork carries the section; the text takes the remaining column.
 * - `field` — the artwork is the ground the section sits on, cropped to fill, with text over it.
 *   The only treatment that needs a readability scrim, because it is the only one where text and
 *   artwork genuinely share the same pixels.
 * - `framed` — its own block in normal flow, inset, read as a picture rather than as decoration.
 */
export const ARTWORK_TREATMENTS = ["contained", "side-anchor", "field", "framed"] as const;
export type ArtworkTreatment = (typeof ARTWORK_TREATMENTS)[number];

/**
 * What protects text from the artwork underneath it.
 *
 * Two values, and the interesting one is `none`. The Phase 4E capability spike washed a good asset
 * out behind a flat 0.65 scrim covering its whole box — safe, and far too crude, because the scrim
 * was paying for an overlap that the layout did not have to have. Three of the four treatments
 * above put the artwork *beside* the text rather than under it, and where there is no overlap
 * there is nothing to protect: the artwork renders at full strength and text legibility is
 * untouched because no text is there.
 *
 * `scrim` keeps the original guarantee exactly for `field`, which is the one treatment where text
 * really does sit on the artwork: the lightest approved step that clears AA against both a pure
 * black and a pure white asset, computed before any image exists.
 *
 * Note what this is *not*: it is not a judgement about a particular image. Nothing here looks at a
 * pixel. The decision is made from resolved geometry — which treatment, and whether that treatment
 * puts text over artwork at all — and would be identical for every asset that could ever arrive.
 */
export const ARTWORK_PROTECTIONS = ["none", "scrim"] as const;
export type ArtworkProtection = (typeof ARTWORK_PROTECTIONS)[number];

/**
 * The shape of the space the artwork was given, bounded into four classes.
 *
 * `VisualArtIntent` needs to tell the image model what shape to compose for, and the honest answer
 * is the *resolved reservation's* shape — not the leaf's `extent`, which says how much of a section
 * the artwork is for and nothing at all about its proportions. Classes rather than a ratio because
 * a number in a brief is a number an image model will try to satisfy literally, and because the
 * reservation is a CSS proportion of a box whose pixels only rendered geometry knows.
 */
export const ASPECT_CLASSES = ["portrait", "square", "landscape", "panoramic"] as const;
export type AspectClass = (typeof ASPECT_CLASSES)[number];

/** The side of its section a zone treatment takes. `null` when the treatment takes no side. */
export const ARTWORK_SIDES = ["start", "end"] as const;
export type ArtworkSide = (typeof ARTWORK_SIDES)[number];

/** WCAG AA for normal-size text. The same floor the palette compiler holds its roles to. */
const AA_NORMAL = 4.5;

/**
 * The extent each role takes when the model did not say.
 *
 * `extent` is optional on the leaf because the product's job is to remove decisions
 * (`CLAUDE.md §2`), which means the compiler must have an answer that is *right*, not merely
 * defined. Each of these is the size that role means: an anchor carries the page's identity and
 * takes half of it, an object is composited beside content, atmosphere is the ground the section
 * sits on, and a framed illustration occupies its own block.
 */
export const DEFAULT_ARTWORK_EXTENT: Record<ArtworkRole, Extent> = {
  anchor: "half",
  object: "third",
  atmosphere: "full",
  framed: "half",
};

export interface ResolvedArtwork {
  readonly role: ArtworkRole;
  /** Resolved, never absent: the leaf's `extent` or this role's default. */
  readonly extent: Extent;
  /**
   * The scrim alpha between artwork and text, or `null` when no text sits over this artwork.
   *
   * A member of `ARTWORK_SCRIM_STEPS`. The renderer applies it as the section's own surface colour
   * over the asset; it is not a filter on the image and does not change when the image does.
   */
  readonly scrim: number | null;
  /**
   * Whether this artwork is drawn. `false` keeps the entry as evidence and carries a matching
   * deviation, exactly as a suppressed motif does — the tree is never silently edited.
   */
  readonly render: boolean;
  readonly suppressedBy?: "artwork-budget" | "artwork-disabled" | "illegible";
  /**
   * The anchor the composition gave this artwork inside its `Overlay`. Absent outside one.
   *
   * **Named for what it is.** An earlier revision called this `textAnchor` and read it as "where
   * the text sits", which is wrong twice over: `Overlay.anchor` positions the *decoration*, and an
   * overlay's content is in normal flow across the whole box rather than gathered at a corner. The
   * art brief inherited the error and asked the image model to leave open the side the artwork was
   * anchored to — the opposite of what the layout wanted. It is the artwork's anchor, it decides
   * which side a zone treatment takes, and it is a token rather than a coordinate.
   */
  readonly artworkAnchor?: Anchor;
  /** The surface the artwork sits on, so the brief can answer to the right ground. */
  readonly surface: SurfaceRole;
  /** How the artwork occupies its section (`ARTWORK_TREATMENTS`). */
  readonly treatment: ArtworkTreatment;
  /** Which side a zone treatment takes, or `null` when the treatment takes no side. */
  readonly side: ArtworkSide | null;
  /** What protects text from the artwork. `none` for every treatment that does not overlap text. */
  readonly protection: ArtworkProtection;
  /**
   * The shape of the reservation at each authoritative breakpoint.
   *
   * The two can differ, and saying so is the point: an artwork given a tall column at 1280 becomes
   * a wide band at 390, and a brief that mentioned only one of those would be briefing half the
   * pages this asset appears on.
   */
  readonly aspect: { readonly desktop: AspectClass; readonly mobile: AspectClass };
  /** Whether the artwork is cropped to fill its reservation, or shown whole inside it. */
  readonly fit: "cover" | "contain";
}

/** `#RRGGBB` at `alpha` of `over` laid on `under`. Both inputs are compiler-owned colours. */
function blend(under: string, over: string, alpha: number): string {
  const u = parseHex(under);
  const o = parseHex(over);
  const mix = (a: number, b: number) => Math.round(b * alpha + a * (1 - alpha));
  return formatHex({ r: mix(u.r, o.r), g: mix(u.g, o.g), b: mix(u.b, o.b) });
}

/**
 * The lightest scrim that keeps `ink` legible over *any* image, or `null` if none does.
 *
 * "Any image" is the whole point: the two endpoints are an all-black and an all-white asset, and
 * every real image falls between them in every channel. Clearing both is therefore a proof rather
 * than an estimate, and it holds for an asset nobody has generated yet.
 */
export function scrimFor(ink: string, surface: string): number | null {
  for (const alpha of ARTWORK_SCRIM_STEPS) {
    const darkest = blend("#000000", surface, alpha);
    const lightest = blend("#FFFFFF", surface, alpha);
    if (contrastRatio(ink, darkest) >= AA_NORMAL && contrastRatio(ink, lightest) >= AA_NORMAL) {
      return alpha;
    }
  }
  return null;
}

/** The surface colour and the ink that the palette compiler pairs with a section's surface role. */
function inkAndSurface(
  palette: SemanticPalette,
  surface: SurfaceRole,
): { ink: string; ground: string } {
  switch (surface) {
    case "contrast":
      return { ink: palette.textOnContrast, ground: palette.surfaceContrast };
    case "accent":
      return { ink: palette.textOnAccent, ground: palette.surfaceAccent };
    case "alt":
      return { ink: palette.text, ground: palette.surfaceAlt };
    default:
      return { ink: palette.text, ground: palette.surfaceBase };
  }
}

interface Found {
  readonly node: Extract<AnyNode, { t: "Artwork" }>;
  readonly id: string;
  readonly underText: boolean;
  readonly surface: SurfaceRole;
  readonly artworkAnchor: Anchor | null;
}

/**
 * Every `Artwork` node in document order, each tagged with whether text sits over it.
 *
 * Its own recursion rather than `walk`, because the answer depends on *which slot* an ancestor
 * put it in: artwork inside an `Overlay.decoration` is behind that overlay's `content`, and
 * artwork anywhere else is not. `walk` reports the parent key but not the slot an arbitrary
 * ancestor used, and paths are built identically here so ids match the layout and motif maps.
 */
function findArtwork(sections: readonly Section[]): Found[] {
  const found: Found[] = [];

  const rec = (
    node: AnyNode,
    path: string,
    underText: boolean,
    surface: SurfaceRole,
    artworkAnchor: Anchor | null,
  ) => {
    if (node.t === "Artwork") {
      found.push({ node, id: node.id ?? path, underText, surface, artworkAnchor });
      return;
    }
    const overlayText = node.t === "Overlay" && hasTextDescendant(node.content);
    for (const child of childrenOf(node)) {
      // Only the decoration slot sits beneath the overlay's content. The content slot is the text
      // itself, and an overlay nested elsewhere inherits whatever it was already under.
      const beneath = overlayText && child.key === "decoration";
      rec(
        child.node,
        `${path}.${child.key}`,
        beneath || underText,
        surface,
        beneath ? (node as { anchor: Anchor }).anchor : artworkAnchor,
      );
    }
  };

  sections.forEach((s, i) => rec(s.root as AnyNode, `sections[${i}].root`, false, s.surface, null));
  return found;
}

/**
 * Which treatment a role gets, and everything that follows from it.
 *
 * A pure table plus two derivations, so the whole realization of a role is readable in one place
 * and a reviewer can see that nothing here consults an image.
 *
 * The side of a zone comes from the anchor the composition already gave the artwork: an overlay
 * that anchored its decoration to an `-end` corner wanted the artwork on that side, so the zone
 * takes that side and the text takes the other. `center` has no side to take, so an artwork
 * anchored there becomes a `field` — the only honest reading of "put it in the middle" is that the
 * text is over it.
 */
function planTreatment(
  role: ArtworkRole,
  underText: boolean,
  anchor: Anchor | null,
): {
  treatment: ArtworkTreatment;
  side: ArtworkSide | null;
  protection: ArtworkProtection;
  aspect: { desktop: AspectClass; mobile: AspectClass };
  fit: "cover" | "contain";
} {
  const centred = anchor === "center";
  const side: ArtworkSide | null =
    anchor === null || centred ? null : anchor.endsWith("-end") ? "end" : "start";

  // Two worlds, and the anchor is what tells them apart. An artwork with an anchor is in an
  // `Overlay.decoration` — it has a side to take and content to sit beside. One without is in
  // normal flow, where there is nothing above it and nothing to sit beside.
  const treatment: ArtworkTreatment =
    anchor === null
      ? role === "atmosphere"
        ? "field"
        : "framed"
      : centred || role === "atmosphere"
        ? "field"
        : role === "anchor"
          ? "side-anchor"
          : "contained";

  // `field` is the only treatment whose artwork and text share pixels. The rest are beside it, so
  // `underText` — true for anything in an overlay's decoration slot — is not by itself an overlap.
  const protection: ArtworkProtection = treatment === "field" && underText ? "scrim" : "none";

  return {
    treatment,
    side: treatment === "contained" || treatment === "side-anchor" ? side : null,
    protection,
    aspect: ASPECT_BY_TREATMENT[treatment],
    // Whole or cropped, and the difference is what the brief has to know. A `contained` or
    // `framed` artwork is shown entire, so its frame is all subject; a `side-anchor` or `field`
    // fills a box whose proportions it cannot know, so it will lose edges.
    fit: treatment === "contained" || treatment === "framed" ? "contain" : "cover",
  };
}

/**
 * The shape of each treatment's reservation, at both authoritative breakpoints.
 *
 * Fixed by the stylesheet rather than measured, which is what makes it safe to put in a brief the
 * spec is frozen with: these are the proportions the CSS gives each treatment, and rendered
 * geometry only ever confirms them. The mobile column is where the interesting divergence lives —
 * a side column at 1280 is a band at 390, because a phone has no second column to give away.
 */
const ASPECT_BY_TREATMENT: Record<ArtworkTreatment, { desktop: AspectClass; mobile: AspectClass }> =
  {
    contained: { desktop: "square", mobile: "landscape" },
    "side-anchor": { desktop: "portrait", mobile: "landscape" },
    field: { desktop: "panoramic", mobile: "portrait" },
    framed: { desktop: "landscape", mobile: "landscape" },
  };

/**
 * Resolve every artwork slot in the tree.
 *
 * Deterministic in `(tree, decision, palette)` — no clock, no randomness, no asset. Document order
 * is the budget's tiebreak for the same reason it is the motif budget's: it is the only ordering
 * the model authored.
 */
export function resolveArtwork(
  tree: CompositionTree,
  decision: ArtworkDecision,
  palette: SemanticPalette,
): { artwork: Record<string, ResolvedArtwork>; deviations: Deviation[] } {
  const artwork: Record<string, ResolvedArtwork> = {};
  const deviations: Deviation[] = [];
  let spent = 0;

  for (const hit of findArtwork(tree.sections)) {
    const role = hit.node.role;
    const extent = hit.node.extent ?? DEFAULT_ARTWORK_EXTENT[role];

    const plan = planTreatment(role, hit.underText, hit.artworkAnchor);

    // Defence in depth. The validator strips an `Artwork` from a concept that was never offered
    // artwork (`capability.node`), so one reaching the compiler means that repair did not run.
    // It is recorded and not drawn rather than trusted (`spec.md §32 #21`).
    if (!decision.allowed) {
      deviations.push({
        rule: "artwork.disabled",
        detail: `artwork at ${hit.id} on a concept whose direction declined artwork (${decision.reason})`,
      });
      artwork[hit.id] = {
        role,
        extent,
        scrim: null,
        render: false,
        suppressedBy: "artwork-disabled",
        surface: hit.surface,
        ...plan,
      };
      continue;
    }

    // Only a `field` puts text on the artwork's own pixels, so only a `field` pays for a scrim.
    // The other three treatments lay the text beside the artwork, and protecting a region no text
    // occupies is what reduced a good asset to a ghost in the Phase 4E capability spike.
    let scrim: number | null = null;
    if (plan.protection === "scrim") {
      const { ink, ground } = inkAndSurface(palette, hit.surface);
      scrim = scrimFor(ink, ground);
      if (scrim === null) {
        // §7.6a #5: readability wins. No approved scrim keeps this ink legible over an arbitrary
        // image, so the artwork does not go behind this text — and nothing waits on the asset to
        // find that out.
        deviations.push({
          rule: "artwork.legibility",
          detail: `no approved scrim keeps ${ink} legible over artwork at ${hit.id}`,
        });
        artwork[hit.id] = {
          role,
          extent,
          scrim: null,
          render: false,
          suppressedBy: "illegible",
          surface: hit.surface,
          ...plan,
          ...(hit.artworkAnchor ? { artworkAnchor: hit.artworkAnchor } : {}),
        };
        continue;
      }
    }

    const render = spent < decision.maxArtwork;
    if (render) spent++;
    else {
      deviations.push({
        rule: "artwork.budget",
        detail: `artwork at ${hit.id} exceeds the direction's budget of ${decision.maxArtwork}`,
      });
    }

    artwork[hit.id] = {
      role,
      extent,
      scrim,
      render,
      surface: hit.surface,
      ...plan,
      ...(hit.artworkAnchor ? { artworkAnchor: hit.artworkAnchor } : {}),
      ...(render ? {} : { suppressedBy: "artwork-budget" as const }),
    };
  }

  return { artwork, deviations };
}
