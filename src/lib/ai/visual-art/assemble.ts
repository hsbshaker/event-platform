/**
 * The art brief, assembled from a placement the compiler has already resolved.
 *
 * `spec.md §7.6a #2` is the rule this module exists to make structural rather than aspirational:
 *
 * > **Art-directed to the composition.** The brief follows the layout — subject weighting,
 * > negative space, crop safety — never "generate a picture, then find somewhere to put it."
 *
 * So the order is fixed and this module sits at the end of it. Composition authors the tree, the
 * compiler resolves each `Artwork` leaf into a reservation — role, extent, the surface it sits on,
 * the scrim it needs and, where text crosses it, the anchor that text sits at — and only then is
 * the brief written *from* that reservation. Every field below whose value is a fact about the
 * page is derived, never chosen here, and the image model is handed the result.
 *
 * # Where the words come from, honestly
 *
 * `subject` and `medium` are built from `EventIdentity` — `creativeDirection`, `visualMotifs` and
 * `textureDirection`, the fields Composition already receives. That is a real interpretation,
 * authored once by the strong model and persisted (`docs/product-doctrine.md §4`), so the brief is
 * not a template with the event type dropped into it. It is also not *authored art direction*: no
 * model has written a sentence about what this picture should be. When a stage exists that does —
 * a field on a future `DesignIntent`, or a brief-authoring call — it replaces these two fields and
 * nothing else in this module changes. That is why they are assembled separately from the derived
 * ones rather than interleaved.
 *
 * # What is withheld, and why the type system enforces it
 *
 * `BRIEF_DISPOSITION` below is exhaustive over `keyof EventIdentity`, the same discipline
 * `src/lib/ai/composition/brief.ts` uses: adding a field to `EventIdentity` without deciding
 * whether an art brief may see it is a compile error. `creativeGuidance` is withheld for the
 * reason it is withheld there — `spec.md §32 #12` keeps advisory taste from becoming host law, and
 * absence is the only guarantee that holds.
 *
 * Host constraints are the mirror image: carried verbatim and complete. A host who wrote "no
 * cartoons" is authoritative, and a paraphrase is an interpretation this stage is not permitted.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #12`, `#13`, `#32`. Canon: `spec.md §7.6a`, `docs/product-doctrine.md §10`.
 */
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { AspectClass, ResolvedArtwork } from "@/lib/renderer/compile/artwork";
import type { SemanticPalette } from "@/lib/renderer/compile/palette";
import type { Anchor, ArtworkRole, Extent } from "@/lib/renderer/composition/tokens";
import {
  STANDING_PROHIBITIONS,
  VISUAL_ART_INTENT_VERSION,
  visualArtIntentSchema,
  type BackgroundTreatment,
  type CropSafety,
  type NegativeSpace,
  type PaletteRelationship,
  type SubjectWeight,
  type VisualArtIntent,
} from "./contract";

/**
 * What every `EventIdentity` field may do here.
 *
 * Exhaustive on purpose. See the header: a new identity field that nobody decided about is a
 * compile error rather than a silent leak into an image prompt.
 */
export const BRIEF_DISPOSITION: Record<keyof EventIdentity, "carried" | "withheld"> = {
  // Carried: this is what the artwork is *of*. The interpretation, its motif ideas and its
  // tactile character are exactly the material an art brief needs.
  creativeDirection: "carried",
  visualMotifs: "carried",
  textureDirection: "carried",
  hostConstraints: "carried",

  // Withheld: advisory taste (`spec.md §32 #12`). Absence is what keeps it from becoming law.
  creativeGuidance: "withheld",

  // Withheld: spent upstream. The compiled palette is what the artwork answers to, not the raw
  // intent behind it — `§32 #26` keeps creative colours out of rendering roles, and an image is
  // the last place a raw palette should re-enter.
  paletteIntent: "withheld",
  tonalIntent: "withheld",
  toneKeywords: "withheld",
  colorsExplicitlyConstrained: "withheld",
  toneExplicitlyConstrained: "withheld",

  // Withheld: typography is not a property of a picture, and §7.6a's standing prohibitions forbid
  // lettering in the image at all.
  typographyDirection: "withheld",
  compatibleFamilies: "withheld",
  compatibleTonalDirections: "withheld",
  compatibleTypographyCategories: "withheld",

  // Withheld: this stage authors no copy.
  copyTone: "withheld",

  // Withheld: evidence for an interpretation already made. Re-reading it would re-interpret
  // (`docs/product-doctrine.md §4`).
  inspirationSummary: "withheld",
};

/**
 * How much of the frame the subject takes.
 *
 * Read from the treatment first, because the treatment is what decides how much of the *page* this
 * artwork is. A `side-anchor` carries its section and a subject that hedged inside it would waste
 * the column; a `framed` illustration is read as a picture, so it is composed rather than
 * dominated. The one role that overrides its treatment is `atmosphere`, which is defined as
 * ground rather than subject — a competing subject is its failure mode however much space it has.
 */
function subjectWeight(slot: ResolvedArtwork): SubjectWeight {
  if (slot.role === "atmosphere") return "incidental";
  return slot.treatment === "side-anchor" || slot.treatment === "field" ? "dominant" : "balanced";
}

/**
 * Whether the asset must carry its own alpha.
 *
 * `object` is defined by compositing onto the page rather than sitting in a rectangle, so
 * transparency is a requirement rather than a preference — and `docs/product-doctrine.md §10`
 * makes it a *measured* one, which is why the provider boundary verifies it from the pixels.
 */
const BACKGROUND: Record<ArtworkRole, BackgroundTreatment> = {
  anchor: "either",
  object: "transparent",
  atmosphere: "opaque",
  framed: "either",
};

/**
 * How much of the frame a responsive crop may take.
 *
 * **Read from the resolved fit, not from the leaf's `extent`.** That was the modelling gap the
 * Phase 4E capability spike exposed: `extent` says how much of a *section* the artwork is for and
 * nothing about the proportions of the box it lands in, and inside an `Overlay.decoration` the box
 * is the overlay's rather than the leaf's. A brief derived from it told the image model the frame
 * would barely be trimmed while the compiler was about to crop it to a column.
 *
 * The fit answers it exactly. `contain` shows the asset whole, so nothing is trimmed and the frame
 * may be nearly all subject. `cover` fills a box whose proportions the asset cannot know and whose
 * shape changes between 390 and 1280, so the subject needs margin on every side.
 */
const CROP_SAFETY_BY_FIT: Record<ResolvedArtwork["fit"], CropSafety> = {
  contain: "tight",
  cover: "generous",
};

/**
 * Where the artwork must leave room.
 *
 * One question decides it, and it is the one the treatment already answered: does text sit on
 * these pixels? Only a `field` puts it there, and then it is everywhere, because an overlay's
 * content is in normal flow across the whole box rather than gathered in a corner. Every other
 * treatment lays the text beside the artwork, so the whole frame is the artwork's and asking it to
 * keep a region clear would cost composition for nothing.
 *
 * An earlier revision named a side here, from a field it called `textAnchor` that actually held
 * the *artwork's* anchor — so it asked the model to leave open the very side the artwork was
 * anchored to. The field is now named for what it is and this no longer reads it at all.
 */
function negativeSpace(slot: ResolvedArtwork): NegativeSpace {
  return slot.protection === "scrim" ? "throughout" : "none";
}

/** How the artwork sits against the ground it is on. */
function paletteRelationship(slot: ResolvedArtwork): PaletteRelationship {
  // Under text and under a scrim: the artwork is the quietest thing on the page by construction,
  // and asking for saturated colour it will then lose to the scrim is asking for waste.
  if (slot.scrim !== null) return "muted";
  // An inverted band is already a counterpoint; artwork that harmonized with it would disappear.
  if (slot.surface === "contrast") return "contrast";
  return "harmonize";
}

/**
 * The space this artwork lives in, in words.
 *
 * Deliberately prose and deliberately unitless. The contract's header gives the reason: a number
 * offered to an image model is a number it will try to satisfy, and placement belongs to the
 * compiler. What the model gets is the shape of the problem — the treatment it will be realized
 * with, the shape of the reservation at *both* breakpoints, whether text crosses it, and how much
 * of it will survive a crop.
 *
 * Everything below is read from the resolved reservation. None of it is inferred from the leaf.
 */
function compositionContext(slot: ResolvedArtwork): string {
  const shape: Record<AspectClass, string> = {
    portrait: "a tall upright frame",
    square: "a roughly square frame",
    landscape: "a wide frame",
    panoramic: "a very wide, shallow frame",
  };
  const treatment: Record<ResolvedArtwork["treatment"], string> = {
    contained: "The artwork sits whole in a space of its own beside the event's words",
    "side-anchor":
      "The artwork is the visual anchor of its section, filling a column down one side of it",
    field: "The artwork is the ground the whole section sits on",
    framed: "The artwork is a framed illustration in a block of its own, seen whole",
  };

  const parts = [treatment[slot.treatment]];

  if (slot.side) {
    parts.push(
      `It takes the ${slot.side === "end" ? "trailing" : "leading"} side; the words take the other`,
    );
  }

  parts.push(
    slot.aspect.desktop === slot.aspect.mobile
      ? `It is composed into ${shape[slot.aspect.desktop]} at every screen width`
      : `On a wide screen it is composed into ${shape[slot.aspect.desktop]}; on a phone the same ` +
          `artwork becomes ${shape[slot.aspect.mobile]}`,
  );

  if (slot.protection === "scrim") {
    parts.push(
      "Text is set across it, so no region of the frame may compete with reading, and it sits " +
        "behind a tinted wash that will lose fine detail and thin line work",
    );
  } else {
    parts.push("No text is set over it, so the whole frame is the artwork's");
  }

  parts.push(
    slot.fit === "contain"
      ? "It is shown entire and never cropped, so the frame can be composed edge to edge"
      : "It is cropped to fill that frame, and the crop changes between a phone and a wide " +
          "screen, so nothing that matters may sit near an edge",
  );
  return `${parts.join(". ")}.`;
}

/** What to depict, from the interpretation the strong model already authored. */
function subjectFor(identity: EventIdentity, slot: ResolvedArtwork): string {
  const motifs = identity.visualMotifs.slice(0, 3).join(", ");
  const focus: Record<ArtworkRole, string> = {
    anchor: "One illustrative subject that could carry this page on its own",
    object: "A single object or small still life, isolated with nothing behind it",
    atmosphere: "An open, unfocused field — light, ground and air rather than a subject",
    framed: "One editorial illustration, composed to be read as a picture",
  };
  const from = motifs ? `, drawn from ${motifs}` : "";
  return `${focus[slot.role]}${from}. The direction it serves: ${identity.creativeDirection}`;
}

/** The stylistic language, from the identity's own tactile reading of the event. */
function mediumFor(identity: EventIdentity): string {
  return `Original illustration. ${identity.textureDirection}`;
}

export interface AssembleArtIntentInput {
  /** The compiler's reservation for one slot. Must be one it decided to render. */
  readonly slot: ResolvedArtwork;
  readonly identity: EventIdentity;
  /** The compiled semantic palette — what the page actually is, not what was asked for. */
  readonly palette: SemanticPalette;
}

/**
 * Assemble the brief for one reserved artwork slot.
 *
 * Pure and deterministic: same reservation, same identity, same palette, same brief. It makes no
 * call, reads no clock and needs no asset — it describes a picture that does not exist yet, for a
 * frame that already does.
 *
 * Throws only for a slot the compiler suppressed. Briefing artwork that will not be drawn would
 * spend money on an image nothing can display, and the calling order — resolve, then brief — makes
 * that a programming error rather than a case to handle.
 */
export function assembleVisualArtIntent(input: AssembleArtIntentInput): VisualArtIntent {
  const { slot, identity, palette } = input;
  if (!slot.render) {
    throw new Error(
      `cannot brief a suppressed artwork slot (${slot.suppressedBy ?? "unknown reason"})`,
    );
  }

  const intent: VisualArtIntent = {
    version: VISUAL_ART_INTENT_VERSION,
    role: slot.role,
    subject: subjectFor(identity, slot),
    medium: mediumFor(identity),
    composition: compositionContext(slot),
    subjectWeight: subjectWeight(slot),
    negativeSpace: negativeSpace(slot),
    background: BACKGROUND[slot.role],
    cropSafety: CROP_SAFETY_BY_FIT[slot.fit],
    paletteRelationship: paletteRelationship(slot),
    // The compiled semantic palette, which is what the page actually renders. Never the raw
    // creative palette: `spec.md §32 #26` keeps those out of rendering roles, and an artwork brief
    // is the last door they could come back through.
    paletteHexes: [
      palette.surfaceBase,
      palette.surfaceAlt,
      palette.surfaceContrast,
      palette.surfaceAccent,
      palette.accent,
      palette.text,
    ],
    hostConstraints: [...identity.hostConstraints],
    prohibited: [...STANDING_PROHIBITIONS],
  };

  // Parsed rather than asserted. Every field above is derived from a token or a persisted string,
  // so a length or enum violation means a derivation is wrong — and a malformed brief is better
  // caught here than by an image model charging for the attempt.
  return visualArtIntentSchema.parse(intent);
}
