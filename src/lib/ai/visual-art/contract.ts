/**
 * `VisualArtIntent` — what the image model is told, and what it is never told.
 *
 * Phase 4E asks one question: *can art-directed imagery raise the design ceiling?*
 * `spec.md §7.6a` approves original thematic artwork under six binding constraints, and this
 * contract is those constraints given a shape. Two of them decide almost everything about it:
 *
 * > **Art-directed to the composition.** The brief follows the layout — subject weighting,
 * > negative space, crop safety — never "generate a picture, then find somewhere to put it."
 *
 * > **The model never places the image.** No pixels, no model-authored CSS, no free positioning.
 *
 * # The ownership direction, stated once so it cannot invert
 *
 * Composition happens first and owns **where**. The tree declares an artwork leaf — a role and a
 * slot from a closed vocabulary — and the compiler resolves that leaf into real geometry. Only then
 * is this intent assembled, *from* that resolved placement, to say **what** the artwork should be.
 * The image model answers a brief; it never reads or writes a coordinate, and nothing it returns
 * can move, resize or re-place itself.
 *
 * That direction is what keeps the system acyclic. The tempting alternative — generate artwork,
 * then lay the page out around it — makes layout depend on an image whose dimensions and content
 * are unknown until it exists, and makes the image model a layout author by the back door.
 *
 * # What is deliberately absent
 *
 * There is no `x`, `y`, `width`, `height`, `top`, `left`, `zIndex`, `css`, `className`, `url` or
 * `aspectRatio` field, and no free-text placement instruction. The geometry the artwork must
 * respect arrives as **`composition`**, a description of the space in words the model can act on —
 * "wide and short, text sits across its lower half" — rather than as numbers it could try to
 * satisfy literally. `spec.md §32 #13` forbids a per-node pixel or free-text field on model
 * output, and the same reasoning applies to model *input* here: a number offered is a number that
 * will be honoured, and then the compiler no longer owns realization.
 *
 * Host constraints arrive verbatim, exactly as they do for Composition
 * (`src/lib/ai/composition/brief.ts`): `spec.md §7.6a #4` makes originality a hard rule and
 * §32 #12 keeps model taste out of host authority, so `creativeGuidance` is absent here for the
 * same reason it is absent there — there is nowhere to put it.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #13`, `#14`, `#15`, `#32`.
 */
import { z } from "zod";

import { ARTWORK_ROLES } from "@/lib/renderer/composition/tokens";

/** Bumps when this contract's fields, meanings or vocabulary change. */
export const VISUAL_ART_INTENT_VERSION = "visual_art_intent_v1";

/**
 * What the artwork is *for* on this page.
 *
 * Closed, and the four entries are `spec.md §7.6a`'s own in-scope list rather than a taxonomy
 * invented here:
 *
 * - `anchor` — a single illustrative subject that carries the page's identity;
 * - `object` — a transparent-background object or still life, composited against the page surface;
 * - `atmosphere` — subtle atmospheric or background artwork, behind text;
 * - `framed` — a framed editorial illustration occupying its own block.
 *
 * **Defined by the composition language and re-exported here, rather than declared twice.** The
 * `Artwork` leaf in the tree and `VisualArtIntent.role` are the same closed vocabulary, and the
 * tree is authored first: role is the one thing about a piece of artwork that the *composition*
 * decides, so it belongs to the composition language and this contract reads it. The dependency
 * therefore runs ai → renderer, the direction `src/lib/ai/composition/contract.ts` already
 * establishes, and the renderer keeps no import of the provider layer (nor of `zod`).
 *
 * Role decides how the compiler realizes the asset and how failure degrades, so a fifth role is a
 * compiler change and a primitive-set version bump, never a prompt tweak.
 */
export { ARTWORK_ROLES } from "@/lib/renderer/composition/tokens";
export type { ArtworkRole } from "@/lib/renderer/composition/tokens";

/**
 * Whether the asset must carry its own transparency.
 *
 * `required` is an **empirical** demand on the provider, not an assumption: whether a given image
 * model returns reliable alpha is a selection criterion to be measured, and
 * `docs/technology-decisions.md` records no image model as chosen. A role that needs transparency
 * and a provider that cannot supply it is a provider problem, surfaced rather than papered over.
 */
export const BACKGROUND_TREATMENTS = ["transparent", "opaque", "either"] as const;
export type BackgroundTreatment = (typeof BACKGROUND_TREATMENTS)[number];

/** Where the composition has room, in terms the brief can act on without coordinates. */
export const NEGATIVE_SPACE = [
  "top",
  "bottom",
  "left",
  "right",
  "center",
  /** Text crosses the artwork; the subject must not compete anywhere it lands. */
  "throughout",
  "none",
] as const;
export type NegativeSpace = (typeof NEGATIVE_SPACE)[number];

/** How much of the frame the subject should occupy. Weighting, never pixels. */
export const SUBJECT_WEIGHTS = ["dominant", "balanced", "incidental"] as const;
export type SubjectWeight = (typeof SUBJECT_WEIGHTS)[number];

/**
 * How much of the frame may be lost to a responsive crop.
 *
 * The compiler knows the answer because it resolved the placement; the image model needs it so the
 * subject survives. `tight` means the frame is nearly all subject and little can be trimmed.
 */
export const CROP_SAFETY = ["tight", "moderate", "generous"] as const;
export type CropSafety = (typeof CROP_SAFETY)[number];

/** How the artwork should sit against the compiled semantic palette. */
export const PALETTE_RELATIONSHIPS = [
  /** Drawn from the page's own palette. */
  "harmonize",
  /** A deliberate counterpoint within the same world. */
  "contrast",
  /** Largely tonal, letting the page supply the colour. */
  "muted",
] as const;
export type PaletteRelationship = (typeof PALETTE_RELATIONSHIPS)[number];

const shortText = (min: number, max: number) => z.string().trim().min(min).max(max);

export const visualArtIntentSchema = z
  .object({
    version: z.literal(VISUAL_ART_INTENT_VERSION),
    role: z.enum(ARTWORK_ROLES),
    /**
     * What to depict, in the creative direction's own terms. Original language only: a named
     * reference is translated, never reproduced (`spec.md §7.6`, `§7.6a #4`).
     */
    subject: shortText(8, 400),
    /** The medium and stylistic language — "loose gouache", "fine line engraving". */
    medium: shortText(4, 240),
    /**
     * The space this artwork must live in, described rather than measured.
     *
     * Assembled by the compiler from the resolved placement. Deliberately prose and deliberately
     * unitless: a number here would be a placement instruction, and placement is not the image
     * model's.
     */
    composition: shortText(8, 400),
    subjectWeight: z.enum(SUBJECT_WEIGHTS),
    negativeSpace: z.enum(NEGATIVE_SPACE),
    background: z.enum(BACKGROUND_TREATMENTS),
    cropSafety: z.enum(CROP_SAFETY),
    paletteRelationship: z.enum(PALETTE_RELATIONSHIPS),
    /** The page's semantic palette, so the artwork can answer to it. Read, never authored. */
    paletteHexes: z
      .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
      .min(1)
      .max(6),
    /** Authoritative host constraints, verbatim and complete, exactly as Composition receives them. */
    hostConstraints: z.array(shortText(3, 180)).max(10),
    /**
     * What must not appear. Seeded with the standing prohibitions rather than left to the caller,
     * so a caller that forgets cannot produce a request without them.
     */
    prohibited: z.array(shortText(3, 180)).min(1).max(20),
  })
  .strict();

export type VisualArtIntent = z.infer<typeof visualArtIntentSchema>;

/**
 * The prohibitions every brief carries, whatever the event.
 *
 * `spec.md §7.6a #4` and `#6`, and `§32 #32`. Stated as data so a test can assert they are present
 * on every intent, rather than living only in prose the assembly might drift from.
 */
export const STANDING_PROHIBITIONS = [
  "No logos, trademarks, brand marks or wordmarks.",
  "No proprietary characters, licensed figures or campaign artwork.",
  "No copying of a named artist's or studio's work; translate influence, never reproduce it.",
  "No photography or photorealistic likeness of real people.",
  "No text, lettering, numerals or captions anywhere in the image.",
] as const;

/** Every field of this contract, so a test can assert nothing placement-shaped has crept in. */
export const VISUAL_ART_INTENT_FIELDS = Object.keys(
  visualArtIntentSchema.shape,
) as readonly (keyof VisualArtIntent)[];

/**
 * Field names this contract must never acquire.
 *
 * A guard rather than a comment: the failure mode is gradual, and it looks reasonable each time —
 * one aspect ratio "just so it fits", one offset "just for the hero". Each would move placement
 * authority out of the compiler, which `spec.md §7.6a #3` reserves to it.
 */
export const FORBIDDEN_INTENT_FIELDS = [
  "x",
  "y",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "aspectRatio",
  "zIndex",
  "css",
  "className",
  "style",
  "url",
  "src",
  "position",
  "placement",
  "coordinates",
] as const;
