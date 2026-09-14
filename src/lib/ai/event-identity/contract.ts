/**
 * The Event Identity contract — `docs/model-contracts.md §4`, `spec.md §7.5`, `§7.6b`.
 *
 * One model call returns three siblings, and the separation between them is the whole
 * point of this file:
 *
 *   identity        the creative brief. Inference is expected and generous (`spec.md §7.5`).
 *   suppliedFacts   what the host actually said. Quoted verbatim or null. Never inferred.
 *   clarification   whether a creative question would materially improve understanding.
 *
 * `spec.md §7.5` left the fact mechanism to Phase 4 and named two options: extend the
 * identity schema with an operational block, or extract on a separate channel. This is
 * the second in schema terms and neither in call terms — facts are a sibling object, so
 * the creative brief keeps `additionalProperties: false` and carries no operational
 * field, exactly as its prompt promises. They share one round trip because a second call
 * would roughly double latency (`spec.md §7.10`) to separate things the schema has
 * already separated.
 *
 * This module is the source of truth. `docs/model-schemas/event-identity-result.schema.json`
 * and the strict wire schema are generated from it and drift-tested, following the
 * composition schema's precedent (`docs/model-contracts.md §2`).
 */
import { z } from "zod";

/** Ranked catalogs. Runtime may narrow these to currently enabled values (`§4`). */
export const TONAL_DIRECTIONS = ["light", "mid", "dark"] as const;
export const FAMILIES = ["editorial", "invitation", "statement"] as const;
export const TYPOGRAPHY_CATEGORIES = [
  "heritage",
  "high_contrast_editorial",
  "oldstyle",
  "grotesk_led",
  "soft_serif",
  "transitional",
] as const;

/** `spec.md §7.6b #1` — "a hard working ceiling of 3 before concept generation". */
export const CLARIFICATION_CEILING = 3;

const shortText = z.string().trim().min(2).max(48);

/**
 * The creative brief. Shape unchanged from `event_identity_schema_v2`: this phase adds
 * siblings around it, never operational fields inside it.
 */
export const eventIdentitySchema = z
  .object({
    creativeDirection: z
      .string()
      .trim()
      .min(20)
      .max(420)
      .describe("Concise 1-3 sentence creative thesis. No renderer implementation choices."),
    toneKeywords: z
      .array(shortText)
      .min(3)
      .max(7)
      .describe("Ranked/curated tone adjectives or short phrases with minimal synonym redundancy."),
    colorsExplicitlyConstrained: z
      .boolean()
      .describe("True only when the host explicitly narrows/requires/excludes palette families."),
    paletteIntent: z
      .object({
        requiredColors: z
          .array(z.string().trim().min(2).max(60))
          .max(5)
          .describe(
            "Hard color requirements in short natural language; preserve exact user hex strings.",
          ),
        preferredColors: z
          .array(z.string().trim().min(2).max(60))
          .max(7)
          .describe("Softer palette preferences."),
        avoidColors: z
          .array(z.string().trim().min(2).max(60))
          .max(7)
          .describe(
            "Explicit color exclusions. An exclusion is absolute and covers near neighbours.",
          ),
        dominanceNotes: z
          .string()
          .max(300)
          .describe("How palette families should dominate/recede; empty string when unspecified."),
      })
      .strict(),
    tonalIntent: z
      .string()
      .trim()
      .min(5)
      .max(320)
      .describe("Natural-language brightness/depth/contrast intent."),
    toneExplicitlyConstrained: z
      .boolean()
      .describe("True only when the host explicitly constrains light/mid/dark tonal space."),
    compatibleTonalDirections: z
      .array(z.enum(TONAL_DIRECTIONS))
      .min(1)
      .max(3)
      .describe(
        "Ranked best-first compatible tonal directions. Do not pad with incompatible values.",
      ),
    compatibleFamilies: z
      .array(z.enum(FAMILIES))
      .min(1)
      .max(3)
      .describe(
        "Ranked best-first compatible design families. A family is a compositional character.",
      ),
    compatibleTypographyCategories: z
      .array(z.enum(TYPOGRAPHY_CATEGORIES))
      .min(1)
      .max(6)
      .describe("Ranked compatible broad typography categories, not a font choice."),
    visualMotifs: z
      .array(z.string().trim().min(3).max(90))
      .max(8)
      .describe("Natural-language motif ideas, not renderer motif IDs."),
    textureDirection: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .describe("Tactile/visual texture character. Never an image asset."),
    typographyDirection: z
      .string()
      .trim()
      .min(5)
      .max(300)
      .describe("Typographic character/hierarchy, not a raw font-family choice."),
    copyTone: z.string().trim().min(3).max(260).describe("Voice of guest-facing event copy."),
    designConstraints: z
      .array(z.string().trim().min(3).max(180))
      .max(10)
      .describe("Host-specific aesthetic constraints, including important negative constraints."),
    inspirationSummary: z
      .string()
      .trim()
      .min(5)
      .max(700)
      .describe(
        "Compact summary of inspiration evidence; exactly 'No visual inspiration supplied.' " +
          "when none exists.",
      ),
  })
  .strict();

/**
 * Facts the host supplied, as the host wrote them.
 *
 * Every field is the host's literal substring or `null`. The `Text` suffix is the
 * contract: these are quotations, not parsed values. `spec.md §7.5` — "whatever the
 * prompt supplies is carried forward; where the prompt is silent, the field is absent".
 *
 * Normalization is deterministic application work downstream and is never asked of the
 * model: rewriting `1pm` as `1:00 PM` is a paraphrase of the host
 * (`docs/model-evals/creative-understanding.json` CU-11).
 */
export const suppliedEventFactsSchema = z
  .object({
    hostNames: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullable()
      .describe(
        "Who is hosting, as written. Quoted from the host verbatim, or null. Never inferred.",
      ),
    honoreeName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullable()
      .describe(
        "Who the event is for, as written. Quoted from the host verbatim, or null. Never inferred.",
      ),
    eventType: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe(
        "The kind of event, as the host named it. Quoted from the host verbatim, or null. Never inferred.",
      ),
    dateText: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe(
        "The date exactly as written, however partial. A month is not a date. Quoted from the host verbatim, or null. Never inferred.",
      ),
    timeText: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .nullable()
      .describe(
        "The time exactly as written. Do not reformat: '1pm' stays '1pm'. Quoted from the host verbatim, or null. Never inferred.",
      ),
    venueText: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullable()
      .describe(
        "The venue as named or described. Quoted from the host verbatim, or null. Never inferred.",
      ),
    addressText: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .nullable()
      .describe(
        "A street address, only if the host gave one. A description is not an address. Quoted from the host verbatim, or null. Never inferred.",
      ),
    localityText: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullable()
      .describe(
        "Town/city/region as written. A city named as aesthetic flavour is not a location. Quoted from the host verbatim, or null. Never inferred.",
      ),
    rsvpDeadlineText: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe(
        "The RSVP deadline as written. Quoted from the host verbatim, or null. Never inferred.",
      ),
  })
  .strict();

export const SUPPLIED_FACT_FIELDS = Object.keys(
  suppliedEventFactsSchema.shape,
) as (keyof SuppliedEventFacts)[];

/**
 * One answer option. `isDefer` marks the `You decide` / `Surprise me` option that
 * `spec.md §7.6b #4` requires on every question — structural rather than textual, so the
 * requirement is mechanically checkable instead of guessed at from wording.
 */
export const clarificationOptionSchema = z
  .object({
    label: z.string().trim().min(1).max(80).describe("The option as the host would read it."),
    isDefer: z
      .boolean()
      .describe(
        "True on the single 'You decide' / 'Surprise me' option every question must offer.",
      ),
  })
  .strict();

export const clarificationQuestionSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(8)
      .max(240)
      .describe("A question about taste only. Never logistics, never a low-level design choice."),
    /** `§7.6b #3` — why different answers would produce meaningfully different identities. */
    whyItMatters: z
      .string()
      .trim()
      .min(10)
      .max(300)
      .describe("How the answers would diverge creatively. Not shown to the host as written."),
    options: z
      .array(clarificationOptionSchema)
      .min(2)
      .max(5)
      .describe("Answer options. Exactly one must have isDefer: true."),
  })
  .strict()
  .refine((q) => q.options.filter((o) => o.isDefer).length === 1, {
    message: "exactly one option must be the defer option (spec.md §7.6b #4)",
  });

export const clarificationDecisionSchema = z
  .object({
    needed: z
      .boolean()
      .describe("True when and only when `questions` is non-empty. Prefer zero questions."),
    questions: z
      .array(clarificationQuestionSchema)
      .max(CLARIFICATION_CEILING)
      .describe(
        "At most three, and usually none. Ask only when different answers would produce " +
          "meaningfully different creative identities.",
      ),
  })
  .strict()
  .refine((c) => c.needed === c.questions.length > 0, {
    message: "`needed` must agree with whether questions were asked",
  });

export const eventIdentityResultSchema = z
  .object({
    identity: eventIdentitySchema.describe(
      "The creative brief. Inference is expected and generous. Carries no operational data.",
    ),
    suppliedFacts: suppliedEventFactsSchema.describe(
      "What the host actually said. Every value is a quotation or null.",
    ),
    clarification: clarificationDecisionSchema.describe(
      "Whether a creative question would materially improve understanding. Usually not.",
    ),
  })
  .strict();

export type EventIdentity = z.infer<typeof eventIdentitySchema>;
export type SuppliedEventFacts = z.infer<typeof suppliedEventFactsSchema>;
export type ClarificationOption = z.infer<typeof clarificationOptionSchema>;
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;
export type ClarificationDecision = z.infer<typeof clarificationDecisionSchema>;
export type EventIdentityResult = z.infer<typeof eventIdentityResultSchema>;
