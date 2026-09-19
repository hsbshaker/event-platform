/**
 * Deterministic validation of the ConceptPremise response — the set-level control the system did
 * not have.
 *
 * `docs/phase-4b-plan.md §E` draws the line every validator in this repository stops at: *"this
 * decides whether an object is structurally and semantically legal, not whether it is any good"*,
 * and it says the creative-worlds question is not deterministic and no metric should pretend
 * otherwise. That still holds. What changed is that a **collapsed set** and an **unsupported
 * premise** are both decidable, and neither was being decided anywhere.
 *
 * So this module answers three questions and refuses the fourth:
 *
 * 1. is the response the shape the contract promises? (`schema`)
 * 2. are these three choices rather than one choice three times? (`set`)
 * 3. is each premise supported by the brief the host actually got? (`fidelity`)
 * 4. are they *good*? — not attempted, not approximated, and left to `§3.3`'s reviewer.
 *
 * # The one gating set-level register rule, and why it is stated where it is
 *
 * **No two premises may share the same register on every axis.**
 *
 * It is stated over `pace`, `presence` and `surfaceRichness` rather than over palette distance,
 * motif overlap or composition vectors, and that choice is the substance of the remediation rather
 * than a detail of it. Those three measurements are the instruments that *detected* the T22
 * failure; making any of them the requirement would reward three arbitrary palettes, which
 * `docs/designintent-sibling-convergence.md §6` refuses as an objective. The register axes describe
 * the design's own register, so requiring the set to separate on one cannot manufacture meaning —
 * see `./contract.ts`'s note on `REGISTER_AXES`.
 *
 * The escape is honest and bounded: a set may declare up to two axes constrained, with a reason
 * each, and a declared constraint is then **checked** — declare `pace` constrained and all three
 * premises must really share one pace. Under the corrected rule the bound is belt-and-braces
 * rather than load-bearing (declaring all three would make the registers identical and be refused
 * anyway), and it is kept because it fails with a clearer message.
 *
 * An earlier, stricter form of this rule required an axis to separate all three premises. It was
 * measurably too rigid and is corrected here; `REGISTER_SEPARATION` carries the numbers and the
 * concrete false-rejection case.
 *
 * # Correctness outranks distinctness, in the code and not only in the prose
 *
 * `fidelity` is its own class, sits first in `PREMISE_CLASS_PRECEDENCE`, and is reported separately
 * from `set`. A run that failed on both must not be read as a diversity problem. One correct
 * concept plus two imaginative unsupported ones is a worse system than three that converge, and
 * this is the module that has to enforce that ordering.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`, `§31 — DesignIntent,
 * composition and compiler`. Guardrails: `spec.md §32 #21`.
 */
import { z } from "zod";

import type { EventIdentity } from "@/lib/ai/event-identity/contract";

import {
  AXIS_VALUES,
  conceptPremiseSetSchema,
  MAX_CONSTRAINED_AXES,
  PREMISE_SET_SIZE,
  REGISTER_AXES,
  type ConceptPremise,
  type ConceptPremiseSet,
  type RegisterAxis,
} from "./contract";
import {
  PREMISE_CLASS_PRECEDENCE,
  PREMISE_DISPOSITION,
  type PremiseIssueClass,
  type PremiseIssueDisposition,
} from "./policy";
import {
  assertedSpecifics,
  containsPhrase,
  contentOverlap,
  HEX_COLOR_ANYWHERE,
  sharedContentTokens,
  titleKey,
  titleTokenKey,
} from "./text";

/* ------------------------------------------------------------------ thresholds */

/**
 * The ceiling on how much two `organizingIdea`s may share, exclusive.
 *
 * Set to catch **restatement**, not adjacency. Three premises for one event legitimately share the
 * event's own vocabulary, so a floor tight enough to separate neighbouring ideas would fail honest
 * sets and cost hosts batches (`./policy.ts` on why a failure here is visible rather than
 * degraded). At 0.5, two passages must have half their content words in common — which is what
 * rewording one idea produces and what writing two ideas does not.
 */
export const IDEA_OVERLAP_CEILING = 0.5;

/**
 * The same measurement over `experience`, reported and **never gating**.
 *
 * `experience` describes the same event three times over, so high overlap there is ordinary rather
 * than diagnostic. It is measured because a reader of a weak batch should be able to see it, and
 * `docs/phase-4b-plan.md §D`'s rule applies — *"a batch separated only by typography is the failure
 * mode worth seeing before a human does"* — but a signal that does not distinguish collapse from
 * correctness must not decide anything.
 */
export const EXPERIENCE_OVERLAP_ADVISORY = 0.6;

/**
 * Why the set-level register rule is "no two the same" and not "some axis separates all three".
 *
 * The first version of this gate required at least one axis to take three distinct values. It was
 * too rigid, measurably: over all 19,683 register configurations of three premises across three
 * three-valued axes, it admits 52.9% — and **7,128 of the configurations it refuses have all three
 * registers already distinct**, against 27 that are genuinely one register three times. That is 264
 * honest sets refused for every collapsed one caught.
 *
 * The concrete failure mode, because a ratio is not a case. Three excellent premises at
 * `(measured, poised, considered)`, `(measured, commanding, bare)` and
 * `(lingering, poised, considered)` are three different registers by any reading — and no axis
 * takes three distinct values, so the strict rule refuses them. Nor is there an honest escape:
 * `constrainedAxes` requires the axis it names to be **uniform** across the set, and none of these
 * is. The only way through was to change a register the idea did not ask to change, which is
 * superficial forced differentiation — and since a refusal costs a host the whole batch
 * (`./policy.ts`), it is forced under pressure.
 *
 * So the gate is the property that was actually wanted: **the three registers are three registers.**
 * It admits 89.2% of configurations and refuses exactly the shapes where two or three premises sit
 * at an identical register. Whether an axis separates all three is kept as telemetry
 * (`separatingAxes`), reported and never gating, because it is a useful reading of a weak set and a
 * bad requirement.
 *
 * **Semantic distinctness stays primary, and this is the part the register rule must not be
 * mistaken for.** What makes three premises three choices is `organizingIdea` — gated at
 * `IDEA_OVERLAP_CEILING` — and their titles. The register rule is an anti-collapse floor on the
 * design's own character, and a floor is all it is.
 */
export const REGISTER_SEPARATION = "no two premises share the same register on every axis";

/**
 * How many content words a `grounding` entry must share with the brief.
 *
 * Two, against a brief of several thousand characters. Trivial for an entry that quotes or closely
 * paraphrases what the brief says, and not satisfied by an entry that names something the brief
 * never mentions. It is an anchor test, not a faithfulness proof: an entry can share vocabulary and
 * still draw the wrong conclusion, which is why `assertedSpecifics` runs beside it and why the
 * reviewer keeps the judgement.
 */
export const GROUNDING_MIN_SHARED_TOKENS = 2;

/* ------------------------------------------------------------------ the brief, as text */

/**
 * Which identity fields are prose a premise can be grounded in.
 *
 * Exhaustive over `keyof EventIdentity` so a field added to the identity contract stops the build
 * here rather than silently dropping out of the corpus a fidelity check compares against — the same
 * discipline `BRIEF_LABELS` applies to what the model is shown.
 *
 * The closed enums and the two booleans are `not-prose`: `compatibleFamilies` says `editorial`
 * because the vocabulary says so, and matching a premise against those words would measure the
 * schema rather than the brief. `avoidColors` is its own kind, because the excluded-colour check
 * has to be able to ask "does the brief mention this colour **other than** to exclude it".
 */
const PROSE_ROLE: Record<keyof EventIdentity, "prose" | "excluded-colours" | "not-prose"> = {
  creativeDirection: "prose",
  toneKeywords: "prose",
  colorsExplicitlyConstrained: "not-prose",
  paletteIntent: "prose",
  tonalIntent: "prose",
  toneExplicitlyConstrained: "not-prose",
  compatibleTonalDirections: "not-prose",
  compatibleFamilies: "not-prose",
  compatibleTypographyCategories: "not-prose",
  visualMotifs: "prose",
  textureDirection: "prose",
  typographyDirection: "prose",
  copyTone: "prose",
  hostConstraints: "prose",
  creativeGuidance: "prose",
  inspirationSummary: "prose",
};

const PROSE_KEYS = (Object.keys(PROSE_ROLE) as (keyof EventIdentity)[]).filter(
  (key) => PROSE_ROLE[key] === "prose",
);

/**
 * Every author-written string in a brief, joined.
 *
 * `includeExclusions` is false for the excluded-colour check only. With `avoidColors` in the
 * corpus, an exclusion would always appear to be "mentioned by the brief" and the check could never
 * fire; with it out of the corpus for that one comparison, a premise may still freely use a colour
 * word the brief uses elsewhere, which is what keeps the check off ordinary vocabulary.
 */
export function identityProse(identity: EventIdentity, includeExclusions = true): string {
  const parts: string[] = [];
  for (const key of PROSE_KEYS) {
    if (key === "paletteIntent") {
      const palette = identity.paletteIntent;
      parts.push(...palette.requiredColors, ...palette.preferredColors, palette.dominanceNotes);
      if (includeExclusions) parts.push(...palette.avoidColors);
      continue;
    }
    const value = identity[key];
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) parts.push(...(value as readonly string[]));
  }
  return parts.filter((part) => part.trim().length > 0).join("\n");
}

/* ------------------------------------------------------------------ issues and outcome */

export interface PremiseValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly class: PremiseIssueClass;
  readonly disposition: PremiseIssueDisposition;
}

export interface AxisSeparation {
  readonly axis: RegisterAxis;
  readonly values: readonly string[];
  readonly distinctValues: number;
  readonly poolSize: number;
  /** The set said the brief leaves this axis no room, and gave a reason. */
  readonly declaredConstrained: boolean;
}

/**
 * Deterministic facts about what separated this set. No scores, no judgement.
 *
 * Modelled on `PlanTelemetry` and for the same stated reason: a weak set has to be visibly weak
 * here, before a human sees three concept cards.
 */
export interface PremiseSetTelemetry {
  readonly axes: readonly AxisSeparation[];
  /** Axes with three distinct values, in `REGISTER_AXES` order. */
  readonly separatingAxes: readonly RegisterAxis[];
  readonly constrainedAxes: readonly RegisterAxis[];
  /** Pairwise `organizingIdea` overlap, in `(0,1) (0,2) (1,2)` order. */
  readonly ideaOverlap: readonly {
    readonly a: number;
    readonly b: number;
    readonly value: number;
  }[];
  /** Pairwise `experience` overlap. Advisory, and labelled as such wherever it is rendered. */
  readonly experienceOverlap: readonly {
    readonly a: number;
    readonly b: number;
    readonly value: number;
  }[];
  /** Pairs whose `experience` overlap sits at or above the advisory line. Never gating. */
  readonly experienceOverlapAdvisories: number;
  readonly groundingCounts: readonly number[];
}

export type PremiseValidationOutcome =
  | {
      readonly ok: true;
      readonly value: ConceptPremiseSet;
      readonly telemetry: PremiseSetTelemetry;
    }
  | { readonly ok: false; readonly issues: readonly PremiseValidationIssue[] };

function issue(path: string, message: string, cls: PremiseIssueClass): PremiseValidationIssue {
  return { path, message, class: cls, disposition: PREMISE_DISPOSITION[cls] };
}

function issuesOf(error: z.ZodError): PremiseValidationIssue[] {
  return error.issues.map((i) =>
    issue(i.path.length > 0 ? i.path.join(".") : "(root)", i.message, "schema"),
  );
}

/**
 * Every passage of one premise a fidelity check reads, each with its own path.
 *
 * Per passage rather than one concatenation, for two reasons. A concatenation makes each passage's
 * first word read as mid-sentence whenever the previous one did not end in punctuation, which is a
 * property of the join rather than of the text. And an issue that names `organizingIdea` is
 * actionable in a way one that names the premise is not — the correction turn gets one pass.
 *
 * `title` is included, because a title may not name a colour either, and excluded from the
 * proper-noun scan by its caller: a two-or-three-word concept name is title-cased by contract, so
 * every word in it would read as a name.
 */
function premisePassages(premise: ConceptPremise): { path: string; text: string }[] {
  return [
    { path: "foregrounds", text: premise.foregrounds },
    { path: "organizingIdea", text: premise.organizingIdea },
    { path: "experience", text: premise.experience },
    { path: "distinctFrom", text: premise.distinctFrom },
    ...premise.designConsequences.map((text, i) => ({ path: `designConsequences.${i}`, text })),
    ...premise.grounding.map((text, i) => ({ path: `grounding.${i}`, text })),
  ];
}

const PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

/* ------------------------------------------------------------------ the three checks */

/**
 * Is each premise supported by the brief? (`fidelity`)
 *
 * Four decidable questions, and the limits of each are recorded in `./text.ts` rather than implied:
 * grounding anchored in the brief; no asserted specific the brief does not carry; no hex colour,
 * which belongs to a later stage's palette and never to a premise; and no excluded colour the brief
 * mentions only in order to exclude it.
 *
 * `title` is read for hex and for grounding, and **not** for proper nouns: a two-word concept name
 * is title-cased by contract, so every word in it would read as a name.
 */
export function fidelityIssues(
  set: ConceptPremiseSet,
  identity: EventIdentity,
): PremiseValidationIssue[] {
  const out: PremiseValidationIssue[] = [];
  const brief = identityProse(identity);
  const briefWithoutExclusions = identityProse(identity, false);

  set.premises.forEach((premise, index) => {
    const where = `premises.${index}`;
    const passages = premisePassages(premise);

    premise.grounding.forEach((entry, entryIndex) => {
      const shared = sharedContentTokens(entry, brief);
      if (shared < GROUNDING_MIN_SHARED_TOKENS) {
        out.push(
          issue(
            `${where}.grounding.${entryIndex}`,
            `grounding "${entry}" shares ${shared} content word(s) with the brief; at least ` +
              `${GROUNDING_MIN_SHARED_TOKENS} are required, so quote or closely paraphrase what ` +
              "the brief actually says",
            "fidelity",
          ),
        );
      }
    });

    for (const passage of passages) {
      const novel = assertedSpecifics(passage.text).filter(
        (token) => !containsPhrase(brief, token),
      );
      if (novel.length > 0) {
        out.push(
          issue(
            `${where}.${passage.path}`,
            `introduces specific(s) the brief does not carry: ${novel.join(", ")}. A premise ` +
              "selects emphasis from the brief; it never adds a name, a number, a date or a " +
              "named reference of its own",
            "fidelity",
          ),
        );
      }
    }

    for (const passage of [{ path: "title", text: premise.title }, ...passages]) {
      if (HEX_COLOR_ANYWHERE.test(passage.text)) {
        out.push(
          issue(
            `${where}.${passage.path}`,
            "names a hex colour. The palette belongs to the DesignIntent call; a premise directs " +
              "character, never a colour value",
            "fidelity",
          ),
        );
      }
      for (const excluded of identity.paletteIntent.avoidColors) {
        if (
          containsPhrase(passage.text, excluded) &&
          !containsPhrase(briefWithoutExclusions, excluded)
        ) {
          out.push(
            issue(
              `${where}.${passage.path}`,
              `uses "${excluded}", which the brief excludes and mentions nowhere else. An ` +
                "exclusion is absolute and binds all three premises",
              "fidelity",
            ),
          );
        }
      }
    }
  });

  return out;
}

/** Are these three choices, or one choice three times? (`set`) */
export function setIssues(set: ConceptPremiseSet): PremiseValidationIssue[] {
  const out: PremiseValidationIssue[] = [];
  const { premises } = set;

  const declared = set.constrainedAxes.map((entry) => entry.axis);
  const duplicateAxes = declared.filter((axis, i) => declared.indexOf(axis) !== i);
  if (duplicateAxes.length > 0) {
    out.push(
      issue(
        "constrainedAxes",
        `axis declared more than once: ${[...new Set(duplicateAxes)].join(", ")}`,
        "set",
      ),
    );
  }
  if (declared.length > MAX_CONSTRAINED_AXES) {
    out.push(
      issue(
        "constrainedAxes",
        `${declared.length} axes declared constrained; at most ${MAX_CONSTRAINED_AXES} may be, ` +
          "because at least one axis has to separate the set",
        "set",
      ),
    );
  }

  // A declared constraint is a claim about the brief, so it is checked like any other.
  for (const axis of new Set(declared)) {
    const values = new Set(premises.map((premise) => premise.register[axis]));
    if (values.size > 1) {
      out.push(
        issue(
          "constrainedAxes",
          `${axis} is declared constrained but takes ${values.size} values ` +
            `(${[...values].join(", ")}); a constrained axis is one the set really does not vary`,
          "set",
        ),
      );
    }
  }

  // The three registers must be three registers. Stated as "no two premises share all three axis
  // values" rather than "some axis takes three distinct values" — see `REGISTER_SEPARATION` below
  // for why the stricter form was wrong.
  const registerKey = (premise: ConceptPremise) =>
    REGISTER_AXES.map((axis) => premise.register[axis]).join("/");
  const registers = new Map<string, number[]>();
  premises.forEach((premise, index) => {
    const key = registerKey(premise);
    registers.set(key, [...(registers.get(key) ?? []), index]);
  });
  for (const [key, indexes] of registers) {
    if (indexes.length > 1) {
      out.push(
        issue(
          "premises.register",
          `premises ${indexes.join(" and ")} share the same register on every axis (${key}). ` +
            "Three concepts at one register is one concept three times",
          "set",
        ),
      );
    }
  }

  const exact = new Map<string, number[]>();
  const reordered = new Map<string, number[]>();
  premises.forEach((premise, index) => {
    for (const [map, key] of [
      [exact, titleKey(premise.title)],
      [reordered, titleTokenKey(premise.title)],
    ] as const) {
      map.set(key, [...(map.get(key) ?? []), index]);
    }
  });
  for (const [key, indexes] of exact) {
    if (indexes.length > 1) {
      out.push(
        issue(
          "premises.title",
          `premises ${indexes.join(" and ")} carry the same title ("${key}")`,
          "set",
        ),
      );
    }
  }
  for (const [key, indexes] of reordered) {
    // Skip only where the exact check already reported *this* collision. `exact.has(key)` is the
    // wrong guard: two titles with the same words in a different order produce two distinct exact
    // keys, one of which happens to equal the sorted key, so the reordered report was suppressed by
    // a group of one. What matters is whether the exact map found a duplicate under this key.
    if (indexes.length > 1 && (exact.get(key)?.length ?? 0) <= 1) {
      out.push(
        issue(
          "premises.title",
          `premises ${indexes.join(" and ")} carry the same words in a different order ` +
            `("${key}"), which is the same name`,
          "set",
        ),
      );
    }
  }

  for (const [a, b] of PAIRS) {
    const overlap = contentOverlap(premises[a].organizingIdea, premises[b].organizingIdea);
    if (overlap >= IDEA_OVERLAP_CEILING) {
      out.push(
        issue(
          "premises.organizingIdea",
          `premises ${a} and ${b} share ${(overlap * 100).toFixed(0)}% of their organizing idea's ` +
            `content words, at or above the ${(IDEA_OVERLAP_CEILING * 100).toFixed(0)}% ceiling; ` +
            "these are one idea reworded rather than two choices",
          "set",
        ),
      );
    }
  }

  return out;
}

function buildTelemetry(set: ConceptPremiseSet): PremiseSetTelemetry {
  const { premises } = set;
  const declared = new Set(set.constrainedAxes.map((entry) => entry.axis));
  const axes: AxisSeparation[] = REGISTER_AXES.map((axis) => {
    const values = premises.map((premise) => premise.register[axis]);
    return {
      axis,
      values,
      distinctValues: new Set(values).size,
      poolSize: AXIS_VALUES[axis].length,
      declaredConstrained: declared.has(axis),
    };
  });
  const overlaps = (read: (premise: ConceptPremise) => string) =>
    PAIRS.map(([a, b]) => ({ a, b, value: contentOverlap(read(premises[a]), read(premises[b])) }));
  const experienceOverlap = overlaps((premise) => premise.experience);
  return {
    axes,
    separatingAxes: axes
      .filter((axis) => axis.distinctValues === PREMISE_SET_SIZE)
      .map((axis) => axis.axis),
    constrainedAxes: axes.filter((axis) => axis.declaredConstrained).map((axis) => axis.axis),
    ideaOverlap: overlaps((premise) => premise.organizingIdea),
    experienceOverlap,
    experienceOverlapAdvisories: experienceOverlap.filter(
      (pair) => pair.value >= EXPERIENCE_OVERLAP_ADVISORY,
    ).length,
    groundingCounts: premises.map((premise) => premise.grounding.length),
  };
}

/* ------------------------------------------------------------------ the entry points */

/**
 * Validate an already-parsed response against the contract and the brief it was authored from.
 *
 * Every issue at once, never the first: one correction turn has to be able to address all of them,
 * because there is only ever one (`./policy.ts`).
 */
export function validateConceptPremiseSet(
  value: unknown,
  identity: EventIdentity,
): PremiseValidationOutcome {
  const parsed = conceptPremiseSetSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };

  const set = parsed.data;
  const issues = [...fidelityIssues(set, identity), ...setIssues(set)];
  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, value: set, telemetry: buildTelemetry(set) };
}

/** Parse raw provider text, then validate. Unparseable JSON is a `schema` failure at the root. */
export function parseAndValidateConceptPremiseSet(
  raw: string,
  identity: EventIdentity,
): PremiseValidationOutcome {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      issues: [issue("(root)", `response was not valid JSON: ${String(error)}`, "schema")],
    };
  }
  return validateConceptPremiseSet(value, identity);
}

/** Which class a reader is told about first. `fidelity` outranks `set`, which outranks `schema`. */
export function dominantPremiseIssueClass(
  issues: readonly PremiseValidationIssue[],
): PremiseIssueClass {
  for (const candidate of PREMISE_CLASS_PRECEDENCE) {
    if (issues.some((entry) => entry.class === candidate)) return candidate;
  }
  return "schema";
}

/** Compact, quotable rendering of the issues, for the single repair turn. */
export function describePremiseIssues(issues: readonly PremiseValidationIssue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join("\n");
}
