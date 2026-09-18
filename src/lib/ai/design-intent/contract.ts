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
 * sibling's output, **another concept's premise** and any library recipe or silhouette identifier
 * are all out (`docs/phase-4b-plan.md §E`, `§F`; `spec.md §32 #12`).
 *
 * What it does receive, since the T22 remediation, is **its own** `ConceptPremise` alongside the
 * brief and the assignment. The shape below does not change for it: a premise is direction into
 * this call, never a field out of it, and the compiler still reads exactly seven design fields
 * (`spec.md §32 #21`). What changed is what several of those fields answer to, which is stated in
 * the model-visible descriptions because that is where the model reads it
 * (`docs/designintent-sibling-convergence.md`).
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

/** `spec.md §7.8`: a host-facing concept name, two or three words. */
export const PRESENTATION_NAME_MIN = 4;
export const PRESENTATION_NAME_MAX = 40;

/**
 * What a host-facing concept name may be made of.
 *
 * Unicode letters and **combining marks**, ordinary spaces, both apostrophes in common use, and
 * hyphen or en dash. Three consequences, each deliberate:
 *
 * - a decomposed name (`e` + U+0301) is accepted exactly as its precomposed form is, because the
 *   two are the same name and which one arrives is a property of the encoder, not of the answer;
 * - a name in a script with no case, or one carrying diacritics its language requires, is an
 *   ordinary name and not an error;
 * - digits, underscores and every other punctuation mark stay refused, so an enum id, a version
 *   string or a numbered "Concept 2" still fails.
 *
 * Case is deliberately **not** enforced here. Title-style capitalization is a request made in
 * model-visible description text, where a script without case can simply not apply it; enforcing
 * it in a pattern would reject correct names in such a script outright.
 *
 * `spec.md §7.8` gives an invalid name a deterministic fallback, so a rejection here is not a
 * failed call — it is a graded concept card silently replaced. That is why the rule has to admit
 * the names hosts actually see.
 */
export const PRESENTATION_NAME = /^[\p{L}\p{M}][\p{L}\p{M}'’ \-–]*[\p{L}\p{M}]$/u;

const hexColor = z.string().regex(HEX_COLOR);

/** Keeps `z.enum` literal-typed while the values are read from the shared vocabulary tables. */
const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

export const paletteSchema = z
  .object({
    colors: z.array(hexColor).min(PALETTE_MIN_COLORS).max(PALETTE_MAX_COLORS).meta({
      uniqueItems: true,
      description: "Creative source palette only. 3-5 unique uppercase #RRGGBB colors.",
    }),
    dominant: hexColor.describe("Must be exactly one of the values you return in colors."),
  })
  .strict();

const COMPOSITION_DESCRIPTION =
  "Composition intent. Directives to the composition call and measurements taken from the tree " +
  "afterwards; selects nothing. asymmetry, rhythm, sectionContrast and ornament answer to this " +
  "concept's premise register rather than to generally defensible taste: presence bears on " +
  "asymmetry and sectionContrast, pace on rhythm, surface richness on ornament. A bare concept " +
  "and a layered one must not arrive at the same ornament.";

const HIERARCHY_DESCRIPTION =
  "Assigned, exactly like family and tonalDirection: the runtime schema narrows this enum to the " +
  "single assigned value, and no other value is a legal answer.";

const FAMILY_DESCRIPTION =
  "Design grammar. Must exactly match the deterministic assignment; runtime schema narrows this " +
  "to one value. Not a layout: the composition call authors structure.";

const TONE_DESCRIPTION =
  "Must exactly match the deterministic assignment. The runtime schema narrows this enum to one " +
  "value.";

const PAIRING_DESCRIPTION =
  "A concrete curated pairing ID, not a category and not raw font names. Category and pairing " +
  "are different things: each of the six typography categories holds two pairings. The runtime " +
  "schema narrows this enum to the pairings in the planner-assigned typography category, and " +
  "further to pairings that hold at the assigned hierarchy — when hierarchy is monumental, " +
  "only monumental-capable pairings are offered.";

const MOTIFS_DESCRIPTION =
  "Motif requests only, from the seven curated IDs. Four are patterns (plaid, stripe, gingham, " +
  "linen) and three are arrangements (equestrian, botanical, celestial). Placement is the " +
  "composition call's, not this one's. The ornament direction in `composition` caps how many " +
  "actually render. How many earn a place is the premise's surface richness: zero is the " +
  "considered answer for a bare concept, not an omission. Never a set that would be equally " +
  "right for a concept with a different register.";

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
      .min(PRESENTATION_NAME_MIN)
      .max(PRESENTATION_NAME_MAX)
      .regex(PRESENTATION_NAME)
      .describe(
        "Two or three words evoking the concept's character, written the way the name is " +
          "properly written: natural title-style capitalization where the language or script " +
          "has case, natural orthography otherwise, with whatever letters, accents and marks " +
          "that takes. Letters, spaces, apostrophes and hyphens only — no digits, no " +
          "underscores. Not a family or enum ID, not a brand name, and not a formula of tone " +
          "plus layout word. Recognisably the concept this premise names: reuse that name where " +
          "it is already right for a host, and write a better one for the same concept where it " +
          "is not.",
      ),
    description: z
      .string()
      .min(20)
      .max(140)
      .describe(
        "One sentence describing how the concept feels, in host-facing language. No renderer or " +
          "implementation terms. It says what is different about THIS choice, not what the event " +
          "is: a host reads it beside two others, and a sentence that would fit all three has " +
          "described the brief instead of the concept.",
      ),
  })
  .strict()
  .describe(
    "Non-design presentation metadata shown to the host on concept cards. The compiler never " +
      "reads it. It is the host-facing form of this concept's premise, and its job is to make the " +
      "choice legible next to the other two.",
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
    density: enumOf(DENSITIES).describe(
      "Chosen from this concept's premise pace, the brief and the assigned family's character. A " +
        "real creative lever, not a tie-breaker: balanced is right only when this premise wants " +
        "the middle.",
    ),
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
