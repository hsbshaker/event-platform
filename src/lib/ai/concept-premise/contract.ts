/**
 * The ConceptPremise contract — the stage T22 proved was missing.
 *
 * `docs/designintent-sibling-convergence.md` is the argument; this module is its shape. One model
 * call per batch reads the authoritative creative brief and returns **three premises as a set**:
 * three supported creative propositions for one understanding of one event. Deterministic code
 * then binds premise `k` to the planner's sibling `k`, and each DesignIntent call receives its own
 * premise as a third input channel.
 *
 * # Why this exists at all
 *
 * `docs/phase-4b-plan.md §E` reserved the decision: *"if fresh evidence shows blind siblings
 * converge despite planner separation, that is a deliberate subsequent design and spec decision
 * argued from data, not a mechanism added on suspicion."* The T22 diagnostic produced the data —
 * 12/12 batches failed composition-vector distinctness, `composition.ornament` was `restrained` in
 * 36 of 36 responses, and one batch returned the same concept name three times. The cause was not
 * taste: three calls received a byte-identical brief and four enum values, and nothing in the
 * system ever asked what an individual concept was *about*.
 *
 * `docs/product-doctrine.md §4` already assigns this stage's question — *"What are three excellent
 * and genuinely different ways a designer could express that identity?"* — and `§8` already sets
 * the bar: *"three genuinely different creative directions that a good designer could defend from
 * the same brief."* That is a question about a **set**. It was being asked three times of three
 * callers, each of which could see one member.
 *
 * # The invariant this file exists to enforce structurally
 *
 * **A premise selects emphasis. It never reinterprets the host.**
 *
 * The strongest guarantee available is the absence of a field. There is nowhere in this shape to
 * put a host fact, a relationship, a conflict, a motive, a constraint or an emotional stake:
 * `hostConstraints` has no counterpart here, and `./validate.ts` refuses a premise whose
 * `grounding` is not anchored in the brief or which introduces a specific — a name, a number, a
 * date — the brief does not carry. `EventIdentity` remains the one authoritative understanding,
 * byte-identical for all three siblings, and this stage reads it without rewriting it.
 *
 * # What it must not become
 *
 * Not a catalogue. A premise is not selected from a list of lenses by identifier, is not ranked
 * against a library, and carries no recipe, silhouette or template id — `CLAUDE.md §5.1`'s
 * Library Boundary Invariant one stage earlier, and for the same reason. The three register axes
 * below are the one closed vocabulary in this file, and they are a **distinctness requirement on
 * the set**, never the creative answer: what a concept *is* lives in `organizingIdea`.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`, `§31 — DesignIntent,
 * composition and compiler`. Guardrails: `spec.md §32 #12`, `#21`.
 */
import { z } from "zod";

// A premise's `title` and a concept card's `name` are the same kind of thing — a host-facing
// concept name — so they answer to the same rule rather than to two copies of it. The dependency
// runs this way round because that rule was written for the card first.
import { PRESENTATION_NAME } from "@/lib/ai/design-intent/contract";

/**
 * Three premises, one per planned sibling.
 *
 * Written out rather than imported from `@/lib/generation/planner`, whose `SIBLING_COUNT` is the
 * same three. The import would drag the planner, the identity lifecycle and the renderer
 * vocabulary into the closure of a contract that needs none of them — and
 * `concept-premise.test.ts` asserts the two are equal, so the invariant is checked rather than
 * merely believed.
 */
export const PREMISE_SET_SIZE = 3;

/* ------------------------------------------------------------------ the register axes */

/**
 * How quickly the page moves a guest through the event.
 *
 * Feeds `density` and `composition.rhythm` at the DesignIntent stage without deciding either.
 */
export const PACES = ["lingering", "measured", "propulsive"] as const;

/** How much room the concept takes up. Feeds `asymmetry` and `sectionContrast`, decides neither. */
export const PRESENCES = ["understated", "poised", "commanding"] as const;

/** How much the surfaces themselves carry. Feeds `ornament` and `motifs`, decides neither. */
export const SURFACE_RICHNESSES = ["bare", "considered", "layered"] as const;

export type Pace = (typeof PACES)[number];
export type Presence = (typeof PRESENCES)[number];
export type SurfaceRichness = (typeof SURFACE_RICHNESSES)[number];

/**
 * The three axes, and the reason there are exactly three of them.
 *
 * # Why these particular words
 *
 * The values are ordinary English and carry no case-specific meaning, but they are **checked
 * against every frozen eval corpus** before being chosen. `unhurried` and `quiet` were the first
 * drafts of the low end of `pace` and `presence`; both appear as author-written `toneKeywords` in a
 * frozen corpus, so both would have put benchmark input into the prompt and
 * `src/lib/ai/evals/prompt-leakage.test.ts` reported them.
 *
 * `docs/phase-4b-plan.md §3.5` settles which side gives way: a collision is resolved *at the
 * corpus*, never by relaxing the scanner. The corpora are frozen and one of them is spent
 * evidence, so neither could move — and editing the scanner after the cases exist is precisely what
 * the T19-before-T20 ordering exists to prevent. So the vocabulary moved: `lingering` and
 * `understated`. That is benchmark hygiene rather than case-fitting, and it is written down because
 * a later reader will otherwise "improve" one of these words straight back into a leak.
 *
 * They are deliberately **not** the DesignIntent enums. `density`, `asymmetry`, `rhythm`,
 * `sectionContrast`, `ornament` and `motifs` stay the DesignIntent call's to choose
 * (`docs/model-contracts.md §5.1`); these describe the register that choice has to serve. Two
 * consequences follow, and both are the point:
 *
 * - **"These three are experientially different" becomes checkable.** `./validate.ts` gates on at
 *   least one axis taking three distinct values, which is the one thing 36-of-36 `restrained`
 *   shows the system could not previously promise.
 * - **Requiring variation here cannot manufacture meaning.** An axis describes the *design's*
 *   register, not the event's facts. A memorial rendered `bare` and the same memorial rendered
 *   `considered` make no competing claim about the host's situation, so set separation can be
 *   gating without putting faithfulness at risk. That is exactly why the gate is stated over these
 *   axes and never over palette distance: a palette floor would reward three arbitrary palettes,
 *   which `docs/designintent-sibling-convergence.md §6` refuses as an objective.
 */
export const REGISTER_AXES = ["pace", "presence", "surfaceRichness"] as const;
export type RegisterAxis = (typeof REGISTER_AXES)[number];

/** Each axis's own vocabulary, keyed so a check can iterate axes without naming values twice. */
export const AXIS_VALUES: Record<RegisterAxis, readonly string[]> = {
  pace: PACES,
  presence: PRESENCES,
  surfaceRichness: SURFACE_RICHNESSES,
};

/**
 * At most two axes may be declared constrained, so at least one always remains free.
 *
 * The escape exists because an identity can genuinely admit no variation on an axis, and the
 * planner already has the vocabulary for this situation — `SeparationFallback`'s `tone-locked` is
 * *"the planner obeying `spec.md §7.7` … and is a correct outcome"*. The bound is what stops the
 * escape becoming the answer: declare two, and the third must still separate three ways.
 */
export const MAX_CONSTRAINED_AXES = REGISTER_AXES.length - 1;

/* ------------------------------------------------------------------ text bounds */

export const TITLE_MIN = 4;
export const TITLE_MAX = 40;
export const FOREGROUNDS_MIN = 12;
export const FOREGROUNDS_MAX = 160;
export const IDEA_MIN = 20;
export const IDEA_MAX = 240;
export const CONSEQUENCE_MIN = 12;
export const CONSEQUENCE_MAX = 140;
export const CONSEQUENCES_MIN_COUNT = 2;
export const CONSEQUENCES_MAX_COUNT = 4;
export const GROUNDING_MIN = 6;
export const GROUNDING_MAX = 180;
export const GROUNDING_MIN_COUNT = 1;
export const GROUNDING_MAX_COUNT = 4;
export const CONSTRAINT_REASON_MIN = 10;
export const CONSTRAINT_REASON_MAX = 180;

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

const registerSchema = z
  .object({
    pace: enumOf(PACES).describe(
      "How quickly this concept moves a guest through the event. Not a spacing value.",
    ),
    presence: enumOf(PRESENCES).describe(
      "How much room this concept takes up. Not an alignment or a size.",
    ),
    surfaceRichness: enumOf(SURFACE_RICHNESSES).describe(
      "How much the surfaces themselves carry. Not an ornament setting and not a motif list.",
    ),
  })
  .strict()
  .describe(
    "The concept's register, in three axes. A later call translates these into its own design " +
      "fields; nothing here selects one.",
  );

/**
 * One concept's premise.
 *
 * Every field is prose except `register`, and that is deliberate: a premise is an idea, and an
 * idea expressed as enum values is the parameter variation this stage exists to replace.
 */
export const conceptPremiseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(TITLE_MIN)
      .max(TITLE_MAX)
      .regex(PRESENTATION_NAME)
      .describe(
        "Two or three words naming this concept, written the way the name is properly written. " +
          "It is the anchor for the host-facing card a later call writes, so it must name this " +
          "concept rather than restate the event. Letters, spaces, apostrophes and hyphens only.",
      ),
    foregrounds: z
      .string()
      .trim()
      .min(FOREGROUNDS_MIN)
      .max(FOREGROUNDS_MAX)
      .describe(
        "Which aspect of the brief this concept brings forward. It must already be in the brief: " +
          "you are choosing emphasis, not adding meaning.",
      ),
    organizingIdea: z
      .string()
      .trim()
      .min(IDEA_MIN)
      .max(IDEA_MAX)
      .describe(
        "The idea this concept is organized around, in one or two sentences. This is the concept, " +
          "and it is what makes it a choice rather than a variation. Never a restatement of the " +
          "brief's own thesis, and never a list of design settings.",
      ),
    experience: z
      .string()
      .trim()
      .min(IDEA_MIN)
      .max(IDEA_MAX)
      .describe(
        "What arriving on this site should feel like. Written about the guest's experience, not " +
          "about the page's construction.",
      ),
    distinctFrom: z
      .string()
      .trim()
      .min(IDEA_MIN)
      .max(IDEA_MAX)
      .describe(
        "Why this is a worthwhile alternative to the other two premises in this set — what a host " +
          "gains by choosing it over them. You are authoring all three, so answer it against the " +
          "two you actually wrote.",
      ),
    designConsequences: z
      .array(z.string().trim().min(CONSEQUENCE_MIN).max(CONSEQUENCE_MAX))
      .min(CONSEQUENCES_MIN_COUNT)
      .max(CONSEQUENCES_MAX_COUNT)
      .meta({
        uniqueItems: true,
        description:
          "What follows visually from this premise, in the language of design character rather " +
          "than of implementation. No CSS, no pixels, no font names, no hex colours, no " +
          "renderer vocabulary.",
      }),
    grounding: z
      .array(z.string().trim().min(GROUNDING_MIN).max(GROUNDING_MAX))
      .min(GROUNDING_MIN_COUNT)
      .max(GROUNDING_MAX_COUNT)
      .meta({
        uniqueItems: true,
        description:
          "What in the brief supports this emphasis — quote or closely paraphrase the brief. This " +
          "is the field that makes the premise checkable: an emphasis with nothing behind it in " +
          "the brief is refused.",
      }),
    register: registerSchema,
  })
  .strict();

/** One axis the set declares it cannot separate on, and why the brief leaves it no room. */
export const constrainedAxisSchema = z
  .object({
    axis: enumOf(REGISTER_AXES),
    why: z
      .string()
      .trim()
      .min(CONSTRAINT_REASON_MIN)
      .max(CONSTRAINT_REASON_MAX)
      .describe("What in the brief leaves this axis no room. Grounded, like every other claim."),
  })
  .strict();

/**
 * The whole response: three premises, plus any axis the brief left no room on.
 *
 * The array is the binding order — premise 0 goes to planned sibling 0 — and it is the model's
 * order rather than an assignment it was shown. This stage never sees the sibling assignments, so
 * it cannot tailor a premise to a family or a tone, which keeps semantic distinction primary and
 * visual distinction downstream of it.
 */
export const conceptPremiseSetSchema = z
  .object({
    premises: z
      .array(conceptPremiseSchema)
      .length(PREMISE_SET_SIZE)
      .describe(
        "Exactly three premises, authored together as one set of choices for one understanding.",
      ),
    constrainedAxes: z
      .array(constrainedAxisSchema)
      .max(MAX_CONSTRAINED_AXES)
      .meta({
        description:
          "Axes the brief leaves no room to vary, each with its reason. Empty is the common and " +
          "correct answer. At most two, because at least one axis must always separate the set.",
      }),
  })
  .strict();

export type ConceptPremise = z.infer<typeof conceptPremiseSchema>;
export type ConstrainedAxis = z.infer<typeof constrainedAxisSchema>;
export type ConceptPremiseSet = z.infer<typeof conceptPremiseSetSchema>;

/** Read one axis off a premise without indexing by a string literal at every call site. */
export function axisValue(premise: ConceptPremise, axis: RegisterAxis): string {
  return premise.register[axis];
}
