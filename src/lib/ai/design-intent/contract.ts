/**
 * The DesignIntent contract — `docs/model-contracts.md §5`, `spec.md §7.8`.
 *
 * One model call, once per sibling, returns the seven design fields the compiler consumes plus a
 * non-design `presentation` object it never reads (`spec.md §32 #21`). This module is the source
 * of truth for that shape: `docs/model-schemas/design-intent.schema.json` and its strict wire
 * projection are generated from it (`./schemas.ts`), narrowing is derived from it
 * (`./narrowing.ts`), and the application validator parses with it (`./validate.ts`).
 *
 * # The vocabulary is not redefined here
 *
 * Families, tones, hierarchies, the twelve typography pairings and the seven motif ids all come
 * from `src/lib/renderer/vocabulary`, `src/lib/renderer/design-intent` and the composition
 * language's own enum table. A second copy is how `design_intent_schema_v3` drifted from
 * production for a whole revision — six category-shaped pairing ids and a ten-item motif catalog
 * that no longer existed (`docs/model-contracts.md §5.1`, "v4 reconciliation").
 * `tests/unit/model-contract.test.ts` already fails on that drift; this module makes it
 * unrepresentable rather than merely detected.
 *
 * # Schema versus validator
 *
 * `docs/model-contracts.md §3`: the schema owns shape, required fields, enum membership and
 * strict unknown-key behaviour. Lengths, counts, cross-field rules and everything a provider
 * schema cannot express honestly belong to `./validate.ts`. Nothing here refines across fields,
 * so what is emitted to `docs/model-schemas/` is exactly what the schema really promises.
 *
 * # What this call never receives
 *
 * See `./input.ts`. The raw host prompt, raw inspiration bytes, `suppliedFacts`, `clarification`,
 * the structural directive, the token allotment, capabilities, the content profile, another
 * sibling's output and any library recipe or silhouette identifier are all out
 * (`docs/phase-4b-plan.md §E`, `§F`; `spec.md §32 #12`).
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, first bullet.
 * Plan: `docs/phase-4b-plan.md §E`, T18.
 */
import { z } from "zod";

import { ENUM } from "@/lib/renderer/composition/tokens";
import type {
  Asymmetry,
  Density,
  DesignIntent,
  MotifId,
  Ornament,
  Presentation,
  RawPalette,
  Rhythm,
  SectionContrast,
} from "@/lib/renderer/design-intent";
import {
  FAMILIES,
  FAMILY_KEYS,
  TONES,
  TYPOGRAPHY_KEYS,
  type Family,
  type Hierarchy,
  type Tone,
  type TypographyPairingId,
} from "@/lib/renderer/vocabulary";

/**
 * Every hierarchy any family admits, in `Hierarchy` declaration order.
 *
 * Taken as the union over the family table rather than written out, so a family that later gains
 * or loses a hierarchy cannot leave this list behind. "editorial happens to admit all four" is a
 * fact about the table today, not a promise the table makes.
 */
export const HIERARCHIES: readonly Hierarchy[] = (
  ["restrained", "editorial", "dramatic", "monumental"] as const
).filter((h) => FAMILY_KEYS.some((f) => FAMILIES[f].hierarchies.includes(h)));

export const DENSITIES: readonly Density[] = ["compact", "balanced", "spacious"];
export const ASYMMETRIES: readonly Asymmetry[] = ["symmetric", "gentle", "strong"];
export const RHYTHMS: readonly Rhythm[] = ["continuous", "alternating", "punctuated"];
export const SECTION_CONTRASTS: readonly SectionContrast[] = ["low", "moderate", "high"];
export const ORNAMENTS: readonly Ornament[] = ["none", "restrained", "decorative"];

/** The seven curated motif ids, from the composition language's own enum table. */
export const MOTIF_IDS: readonly MotifId[] = ENUM.MotifId;

/** `spec.md §7.8`: "3–5 validated hex colors". The compiler is the only reader (`§32 #26`). */
export const PALETTE_MIN_COLORS = 3;
export const PALETTE_MAX_COLORS = 5;

/**
 * At most three motifs, matching the widest ornament budget the compiler will honour
 * (`ORNAMENT_BUDGET.decorative.max` in `src/lib/renderer/compile/motifs.ts`). This is a request
 * ceiling, not a render count: how many actually appear is the compiler's, keyed off
 * `composition.ornament`.
 */
export const MOTIF_MAX = 3;

/** Uppercase `#RRGGBB`. Lowercase is a schema failure, not something the validator folds. */
export const HEX_COLOR = /^#[0-9A-F]{6}$/;

const hexColor = z.string().regex(HEX_COLOR);

/** Keeps `z.enum` literal-typed while the values are read from the shared vocabulary tables. */
const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

export const paletteSchema = z
  .object({
    colors: z.array(hexColor).min(PALETTE_MIN_COLORS).max(PALETTE_MAX_COLORS).meta({
      uniqueItems: true,
      description: "Creative source palette only. 3-5 unique uppercase #RRGGBB colors.",
    }),
    dominant: hexColor.describe(
      "Must exactly equal one member of colors, character for character.",
    ),
  })
  .strict();

const COMPOSITION_DESCRIPTION =
  "Composition intent. Directives to the composition call and measurements taken from the tree " +
  "afterwards; selects nothing.";

const HIERARCHY_DESCRIPTION =
  "Must exactly match the hierarchy named in the assignment. The enum offers every hierarchy the " +
  "assigned family admits, so a departure from the assignment is visible rather than impossible; " +
  "that is not an invitation to depart from it.";

const FAMILY_DESCRIPTION =
  "Design grammar. Must exactly match the family named in the assignment. Not a layout: the " +
  "composition call authors structure.";

const TONE_DESCRIPTION = "Must exactly match the tonal direction named in the assignment.";

const PAIRING_DESCRIPTION =
  "A concrete curated pairing ID, not a category and not raw font names. Category and pairing " +
  "are different things: each of the six typography categories holds two pairings. Choose one of " +
  "the pairings offered in the assignment; they are already filtered to the assigned typography " +
  "category and to the pairings that hold at the assigned hierarchy.";

const MOTIFS_DESCRIPTION =
  "Motif requests only, from the seven curated IDs. Four are patterns (plaid, stripe, gingham, " +
  "linen) and three are arrangements (equestrian, botanical, celestial). Placement is the " +
  "composition call's, not this one's; the ornament value in `composition` caps how many " +
  "actually render.";

/**
 * A concept name's shape: a letter at each end, and letters, marks, apostrophes, hyphens and
 * spaces between them.
 *
 * **Unicode letters, not `A-Za-z`.** The ASCII class this replaces rejected every accented name,
 * and it did so silently — the wire schema carries no `pattern`, so the model was free to return
 * one, and application validation then dropped a perfectly good concept card into a deterministic
 * fallback. That is the defect class this programme keeps paying for: a rule that punishes correct
 * behaviour. It bit hardest exactly where the product most needs to be good, because the events
 * whose best card carries an accent are the ones a character class was never deciding anything
 * about. What the rule is actually for — Title Case words, not an enum id, not a formula of tone
 * plus layout word — is unaffected by an accent, and is stated in the field's own description.
 *
 * `\p{M}` is in the inner and trailing classes because a decomposed accent is a combining mark
 * following its letter: without it, `José` fails where `José` passes, which is the same
 * defect one normalization form along. A mark cannot begin a name, so the leading anchor is a
 * letter alone. `’` sits beside `'` for the same reason: a model writing Title Case English
 * may reasonably reach for a typographic apostrophe, and rejecting it decides nothing the rule
 * cares about.
 */
export const PRESENTATION_NAME = /^\p{L}[\p{L}\p{M}'’ -]*[\p{L}\p{M}]$/u;

/**
 * Host-facing concept metadata. Never compiled.
 *
 * `spec.md §7.8`: "host-facing metadata, validated separately, persisted on `DesignConcept`, and
 * never read by the compiler. If it is missing, invalid, or duplicates another concept's name, a
 * deterministic fallback name is derived." That is why `./validate.ts` parses it on its own and a
 * failure here does not condemn the design semantics beside it.
 */
export const presentationSchema = z
  .object({
    name: z
      .string()
      .min(4)
      .max(40)
      .regex(PRESENTATION_NAME)
      .describe(
        "Two or three Title Case words evoking the concept's character. Not a family or enum ID, " +
          "not a brand name, and not a formula of tone plus layout word.",
      ),
    description: z
      .string()
      .min(20)
      .max(140)
      .describe(
        "One sentence describing how the concept feels, in host-facing language. No renderer or " +
          "implementation terms.",
      ),
  })
  .strict()
  .describe(
    "Non-design presentation metadata shown to the host on concept cards. The compiler never " +
      "reads it.",
  );

/** What `./narrowing.ts` replaces when it builds one sibling's schema. */
export interface SemanticsNarrowing {
  readonly families: readonly Family[];
  readonly tones: readonly Tone[];
  readonly pairings: readonly TypographyPairingId[];
  readonly hierarchies: readonly Hierarchy[];
}

export const UNNARROWED: SemanticsNarrowing = {
  families: FAMILY_KEYS,
  tones: TONES,
  pairings: TYPOGRAPHY_KEYS,
  hierarchies: HIERARCHIES,
};

/**
 * The seven design fields, in `docs/model-contracts.md §5.1`'s order.
 *
 * A factory rather than a constant because the committed superset schema and each sibling's
 * narrowed schema are the same shape over different enum pools. Two hand-maintained copies is
 * the drift the module header describes, one level down.
 */
export function designSemanticsShape(narrowing: SemanticsNarrowing = UNNARROWED) {
  return {
    family: enumOf(narrowing.families).describe(FAMILY_DESCRIPTION),
    tonalDirection: enumOf(narrowing.tones).describe(TONE_DESCRIPTION),
    palette: paletteSchema,
    typographyPairing: enumOf(narrowing.pairings).describe(PAIRING_DESCRIPTION),
    density: enumOf(DENSITIES),
    composition: z
      .object({
        asymmetry: enumOf(ASYMMETRIES),
        hierarchy: enumOf(narrowing.hierarchies).describe(HIERARCHY_DESCRIPTION),
        rhythm: enumOf(RHYTHMS),
        sectionContrast: enumOf(SECTION_CONTRASTS),
        ornament: enumOf(ORNAMENTS),
      })
      .strict()
      .describe(COMPOSITION_DESCRIPTION),
    motifs: z
      .array(enumOf(MOTIF_IDS))
      .max(MOTIF_MAX)
      .meta({ uniqueItems: true, description: MOTIFS_DESCRIPTION }),
  };
}

/** The seven design fields alone — what the compiler consumes (`spec.md §32 #21`). */
export function designSemanticsSchemaFor(narrowing: SemanticsNarrowing = UNNARROWED) {
  return z.object(designSemanticsShape(narrowing)).strict();
}

/** The whole response: the seven design fields plus `presentation`. */
export function designIntentResponseSchemaFor(narrowing: SemanticsNarrowing = UNNARROWED) {
  return z
    .object({ ...designSemanticsShape(narrowing), presentation: presentationSchema })
    .strict();
}

/**
 * The response envelope with `presentation` left unparsed.
 *
 * `spec.md §7.8` requires `presentation` to be "validated separately", and a deterministic
 * fallback exists precisely for the case where it is missing or invalid. Folding it into the same
 * parse would make a bad concept *name* condemn a good design, which is the opposite of what
 * canon asks for — so the envelope accepts whatever arrived and `./validate.ts` parses it on its
 * own. `.strict()` still holds: an unknown *ninth* key is refused here, as it must be.
 */
export function designIntentEnvelopeSchemaFor(narrowing: SemanticsNarrowing = UNNARROWED) {
  return z.object({ ...designSemanticsShape(narrowing), presentation: z.unknown() }).strict();
}

/** The committed superset — what `docs/model-schemas/design-intent.schema.json` holds. */
export const designSemanticsSchema = designSemanticsSchemaFor();
export const designIntentResponseSchema = designIntentResponseSchemaFor();

export type DesignSemantics = z.infer<typeof designSemanticsSchema>;
export type DesignIntentResponse = z.infer<typeof designIntentResponseSchema>;

/**
 * The validated design fields *are* the renderer's `DesignIntent`, structurally.
 *
 * Asserted at the type level rather than by a cast at the boundary: if the two shapes ever
 * diverge, compilation stops here instead of producing a compiler input that type-checks and
 * cannot be rendered.
 */
type Assert<A extends B, B> = A;
export type _SemanticsIsDesignIntent = Assert<DesignSemantics, DesignIntent>;
export type _PaletteIsRawPalette = Assert<DesignSemantics["palette"], RawPalette>;
export type _PresentationIsPresentation = Assert<z.infer<typeof presentationSchema>, Presentation>;
