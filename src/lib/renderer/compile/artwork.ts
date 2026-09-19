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
   * Where the text sits, when text sits over this artwork. Absent otherwise.
   *
   * This is the composition's answer to `spec.md §7.6a #2` — "the brief follows the layout … never
   * generate a picture, then find somewhere to put it". An overlay that anchors its content
   * bottom-start has told the art brief exactly where the subject must not compete, and the brief
   * asks for negative space there. It is a token, never a coordinate: the image model is told
   * *which region* to leave open, not how many pixels.
   */
  readonly textAnchor?: Anchor;
  /** The surface the artwork sits on, so the brief can answer to the right ground. */
  readonly surface: SurfaceRole;
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
  readonly textAnchor: Anchor | null;
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
    textAnchor: Anchor | null,
  ) => {
    if (node.t === "Artwork") {
      found.push({ node, id: node.id ?? path, underText, surface, textAnchor });
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
        beneath ? (node as { anchor: Anchor }).anchor : textAnchor,
      );
    }
  };

  sections.forEach((s, i) => rec(s.root as AnyNode, `sections[${i}].root`, false, s.surface, null));
  return found;
}

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
      };
      continue;
    }

    let scrim: number | null = null;
    if (hit.underText) {
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
          ...(hit.textAnchor ? { textAnchor: hit.textAnchor } : {}),
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
      ...(hit.textAnchor ? { textAnchor: hit.textAnchor } : {}),
      ...(render ? {} : { suppressedBy: "artwork-budget" as const }),
    };
  }

  return { artwork, deviations };
}
