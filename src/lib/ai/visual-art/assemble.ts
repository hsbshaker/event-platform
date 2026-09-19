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
import type { ResolvedArtwork } from "@/lib/renderer/compile/artwork";
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
 * How much of the frame the subject takes, by what the role is *for*.
 *
 * An anchor carries the page's identity, so it dominates. Atmosphere sits behind text under a
 * scrim, so a competing subject is the failure mode. These are the roles' own definitions, not
 * taste applied on top of them.
 */
const SUBJECT_WEIGHT: Record<ArtworkRole, SubjectWeight> = {
  anchor: "dominant",
  object: "balanced",
  atmosphere: "incidental",
  framed: "balanced",
};

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
 * Read off extent, because extent is what decides how far the box's aspect ratio travels between
 * 390 and 1280. A `full` box reshapes the most, so the subject needs the most margin around it;
 * a `quarter` box barely moves, so the frame can be nearly all subject.
 */
const CROP_SAFETY_BY_EXTENT: Record<Extent, CropSafety> = {
  full: "generous",
  half: "moderate",
  third: "tight",
  quarter: "tight",
};

/**
 * Where the artwork must leave room, given where the text actually sits.
 *
 * The compiler resolved the overlay's anchor, so this is a fact about the page rather than a
 * guess. `center` is the hard case — text in the middle of the frame competes everywhere — so it
 * asks for restraint throughout rather than naming a side that would not help.
 */
const NEGATIVE_SPACE_FOR_ANCHOR: Record<Anchor, NegativeSpace> = {
  "top-start": "top",
  "top-end": "top",
  "bottom-start": "bottom",
  "bottom-end": "bottom",
  center: "throughout",
};

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
 * compiler. What the model gets is the shape of the problem — how big the area is relative to the
 * page, whether text crosses it, and where.
 */
function compositionContext(slot: ResolvedArtwork): string {
  const area: Record<Extent, string> = {
    full: "fills its section",
    half: "occupies about half of its section",
    third: "occupies about a third of its section",
    quarter: "occupies a corner of its section",
  };
  const parts = [`The artwork ${area[slot.extent]}`];

  if (slot.scrim !== null) {
    parts.push(
      slot.textAnchor && slot.textAnchor !== "center"
        ? `Text is set over it, gathered at the ${slot.textAnchor.replace("-", " ")} of the frame; ` +
            "keep that region quiet and carry the subject elsewhere"
        : "Text is set across it; no region of the frame may compete with reading",
    );
    parts.push("It sits behind a tinted wash, so fine detail and thin line work will be lost");
  } else {
    parts.push("No text is set over it, so the whole frame is the artwork's");
  }

  parts.push(
    slot.role === "framed"
      ? "It is a framed illustration in its own block, seen whole"
      : "It is cropped to fill its frame at any screen width, from a phone to a wide desktop",
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
    subjectWeight: SUBJECT_WEIGHT[slot.role],
    negativeSpace:
      slot.scrim === null
        ? "none"
        : slot.textAnchor
          ? NEGATIVE_SPACE_FOR_ANCHOR[slot.textAnchor]
          : "throughout",
    background: BACKGROUND[slot.role],
    cropSafety: slot.role === "framed" ? "tight" : CROP_SAFETY_BY_EXTENT[slot.extent],
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
