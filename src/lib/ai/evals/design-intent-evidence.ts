/**
 * The Phase 4C DesignIntent evidence harness: everything except the cases.
 *
 * `docs/phase-4b-plan.md §3.1`–`§3.8` and Part IV **T19**. The corpus structural contract, the
 * per-batch and corpus-wide mechanical checks (`§3.2`), the blind artifact and the reviewer packet
 * (`§3.8`), and the seam T21 fills. `§3.7`'s gate lives next door in `design-intent-gate.ts`;
 * nothing here grades creative quality, and nothing here decides GO or NO-GO.
 *
 * **What makes this pre-registration, and why it is written now.** The harness and the gate are
 * frozen before any case exists (T19). Only then do independent authors write the regression and
 * pre-registered corpora from the published dimensions (T20), and only after the implementation
 * freeze does a third author write the sealed challenge (T22). A harness written after the cases
 * would be one whose author knew what it had to grade — the same defect as a prompt written after
 * a corpus, one level along. So **nothing in this file may change once T19 freezes it**, and
 * `design-intent.test.ts` hashes it.
 *
 * **The setup is frozen; only the three DesignIntent calls are live.** A 4C case carries a
 * hand-authored *authoritative* EventIdentity brief, not a host prompt: `§3.8` says the artifact
 * carries "the authoritative EventIdentity brief and the three DesignIntents generated from it",
 * and `§3.7` makes the corpus composition — "at least two pairs of batches sharing an event type
 * with materially different identities" — a requirement on the corpus *author*, which is only
 * meaningful if the author writes the identities. Putting a live EventIdentity call upstream would
 * also put stochastic behaviour upstream of the thing being measured, which is exactly the
 * dependency Phase 4B's rerun set was redesigned to remove.
 *
 * **A mechanical pass is necessary and never sufficient** (`§3.2`): three outputs can satisfy every
 * distance metric and still be one idea. Undecidable checks report `n/a` or `advisory` and are
 * never folded into the pass count.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.7`;
 * `docs/phase-4b-plan.md §3.1`–`§3.8`, Part IV T19.
 */
import {
  eventIdentityResultSchema,
  SUPPLIED_FACT_FIELDS,
  type EventIdentity,
  type EventIdentityResult,
  type SuppliedEventFacts,
} from "@/lib/ai/event-identity/contract";
import { validateDesignIntentResponse } from "@/lib/ai/design-intent/validate";
import type { ConceptBatchPlan } from "@/lib/generation/planner";
import {
  CAPS_PER_BATCH,
  type AttractiveTokenId,
  type SiblingAssignment,
} from "@/lib/renderer/planner";

import {
  DESIGN_INTENT_BANDS,
  EXCELLENT_IS_NOT_A_DEMAND_FOR_NOVELTY,
  EXCELLENT_REQUIREMENTS,
  MINIMUM_WOWABLE_ANSWER_INSTRUCTION,
  MINIMUM_WOWABLE_CRITERIA,
  MINIMUM_WOWABLE_QUESTION,
  MINIMUM_WOWABLE_REQUIRES_ALL_FIVE,
  SAME_EVENT_TYPE_PAIR_MINIMUM,
  SEALED_CORPUS_BATCHES,
  SYSTEMIC_CATEGORIES,
} from "./design-intent-gate";
import type { CaseRun } from "./report";

/* ------------------------------------------------------------------ published dimensions */

/**
 * `§3.1`, verbatim — what a corpus author is told, and all they are told.
 *
 * They receive these and the structural contract below. Not this repository, not the checker's
 * source, not the DesignIntent prompt, and specifically not T18's `.describe()` strings, which
 * ship to the model and are prompt text under `§3.5`.
 */
export const DESIGN_INTENT_CAPABILITY_DIMENSIONS: readonly string[] = [
  "sibling distinctness beyond palette/font swaps",
  "faithfulness of all three to the same identity",
  "`hostConstraint` preservation across all three",
  "`creativeGuidance` remaining advisory — a sibling may depart from it without penalty",
  "emotional and aesthetic range",
  "personalization versus generic premium output",
  "no convergence onto one house style",
  "useful differences in organizing idea, visual language and experience",
  "downstream suitability for materially different CompositionTrees",
  "no invented host facts, and no `creativeGuidance` promoted to `hostConstraint`",
];

/** `§3.1`: which dimensions are substantially mechanical, and which substantially qualitative. */
export const MECHANICAL_DIMENSION_INDEXES: readonly number[] = [1, 3, 4, 10];
export const QUALITATIVE_DIMENSION_INDEXES: readonly number[] = [2, 5, 6, 7, 8, 9];

/* ------------------------------------------------------------------ the structural contract */

/**
 * One batch: an authoritative EventIdentity brief, and the event type it is an instance of.
 *
 * `eventType` is a corpus-author field and never reaches the model or the blind artifact as
 * metadata. It exists for one reason: `§3.2`'s same-type measurement and `§3.7`'s S8 same-type
 * clause need to know which batches are instances of the same kind of event, and no field of the
 * brief says so reliably.
 */
export interface DesignIntentCase {
  /** Unique, non-empty. The journal's join key and the planner's only seed source. */
  readonly id: string;
  /**
   * A short lowercase label — `"quinceañera"`, `"christening"`, `"60th birthday"`. Compared only
   * for equality after trimming and case folding, so two batches of the same type must spell it
   * the same way.
   */
  readonly eventType: string;
  /** The creative brief, in exactly the shape `event_identity_revisions.result.identity` holds. */
  readonly identity: EventIdentity;
  /**
   * What the host actually supplied, where the case asserts anything about it.
   *
   * The DesignIntent call never receives `suppliedFacts` (`design-intent/input.ts`), so a value
   * here that surfaces in a `presentation` string is a fact the model invented or was leaked.
   * Optional: `noSuppliedFactSurfaced` reports `n/a` when the case asserts none.
   */
  readonly suppliedFacts?: Readonly<Record<string, string | null>>;
  /** Author's note. Never sent to the model, never shown to the reviewer. */
  readonly notes?: string;
}

export interface DesignIntentCorpus {
  readonly version: string;
  readonly cases: readonly DesignIntentCase[];
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Case-folded event type. Same rule in the validator and in the measurements. */
export function normalizeEventType(eventType: string): string {
  return eventType.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/** How many unordered pairs of batches share an event type. `§3.7`'s composition requirement. */
export function sameEventTypePairCount(cases: readonly { eventType: string }[]): number {
  const counts = new Map<string, number>();
  for (const testCase of cases) {
    const key = normalizeEventType(testCase.eventType ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let pairs = 0;
  for (const count of counts.values()) pairs += (count * (count - 1)) / 2;
  return pairs;
}

/**
 * Which eval set `§3.7`'s gate is applied to, frozen at T19.
 *
 * The sealed challenge is the generalization evidence, so it is the one corpus that must be twelve
 * batches and carry at least two same-type pairs. Named here rather than inferred from a filename
 * or a label, so "which corpus the gate governs" is a frozen decision and not a naming convention
 * someone can drift.
 */
export const GATED_DESIGN_INTENT_SET = "designIntentChallenge";

export interface CorpusShapeOptions {
  /**
   * True for the set `§3.7`'s gate is applied to.
   *
   * The sealed challenge must be twelve batches and carry at least two same-type pairs; the
   * regression and pre-registered corpora are not sized by the gate and are not checked against
   * it. Pinned here rather than inferred from a filename, so which corpus the gate governs is a
   * frozen decision rather than a naming convention.
   */
  readonly gated: boolean;
}

/**
 * Every problem with the corpus, or an empty array.
 *
 * Published in `docs/model-contracts.md §4.7` so an independent author can satisfy it without
 * reading the checker, and pure so it can be unit-tested without importing the module that spends
 * money — the rule Phase 4A's incident 2 produced.
 *
 * The brief is parsed with the **real** `eventIdentityResultSchema`, not a convenient subset: the
 * runner turns each case into a schema-valid identity envelope and hands the planner an
 * `AuthoritativeIdentity`, so a brief this validator accepted and the real schema rejects would
 * throw inside the run and destroy a one-shot paid set at the first such case.
 */
export function validateDesignIntentCorpusShape(
  parsed: unknown,
  options: CorpusShapeOptions,
): string[] {
  const problems: string[] = [];
  const corpus = (parsed ?? {}) as Partial<DesignIntentCorpus>;

  if (!nonEmpty(corpus.version)) {
    problems.push("top-level `version` must be a non-empty string");
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    problems.push("`cases` must be a non-empty array");
    return problems;
  }

  const seen = new Set<string>();
  corpus.cases.forEach((testCase, index) => {
    const where = nonEmpty(testCase?.id) ? testCase.id : `cases[${index}]`;

    if (!nonEmpty(testCase?.id)) {
      problems.push(`${where}: \`id\` must be a non-empty string`);
    } else if (seen.has(testCase.id)) {
      // Ids join a journal entry back to its case, so a duplicate makes one of the two
      // unrecoverable rather than merely confusing — and the planner seeds off the id, so two
      // cases sharing one would be planned identically.
      problems.push(`${where}: duplicate \`id\``);
    } else {
      seen.add(testCase.id);
    }

    if (!nonEmpty(testCase?.eventType)) {
      problems.push(`${where}: \`eventType\` must be a non-empty string`);
    }

    const identity = eventIdentityResultSchema.safeParse({
      identity: testCase?.identity,
      suppliedFacts: emptySuppliedFacts(),
      clarification: { needed: false, questions: [] },
    });
    if (!identity.success) {
      for (const issue of identity.error.issues) {
        problems.push(`${where}: \`${issue.path.join(".") || "identity"}\`: ${issue.message}`);
      }
    }

    const facts = testCase?.suppliedFacts;
    if (facts !== undefined) {
      if (typeof facts !== "object" || facts === null || Array.isArray(facts)) {
        problems.push(`${where}: \`suppliedFacts\` must be an object`);
      } else {
        for (const [key, value] of Object.entries(facts)) {
          if (!(SUPPLIED_FACT_FIELDS as string[]).includes(key)) {
            problems.push(
              `${where}: \`suppliedFacts.${key}\` is not a supplied-fact field (${SUPPLIED_FACT_FIELDS.join(", ")})`,
            );
          }
          if (value !== null && !nonEmpty(value)) {
            problems.push(
              `${where}: \`suppliedFacts.${key}\` must be null or the host's own words`,
            );
          }
        }
      }
    }

    if (testCase?.notes !== undefined && typeof testCase.notes !== "string") {
      problems.push(`${where}: \`notes\` must be a string when present`);
    }
  });

  if (options.gated) {
    if (corpus.cases.length !== SEALED_CORPUS_BATCHES) {
      problems.push(
        `the gated corpus is ${SEALED_CORPUS_BATCHES} batches (docs/phase-4b-plan.md §3.7, frozen ` +
          `at T19 before any case existed); this one has ${corpus.cases.length}`,
      );
    }
    const pairs = sameEventTypePairCount(corpus.cases as DesignIntentCase[]);
    if (pairs < SAME_EVENT_TYPE_PAIR_MINIMUM) {
      problems.push(
        `the gated corpus needs at least ${SAME_EVENT_TYPE_PAIR_MINIMUM} pairs of batches sharing ` +
          `an event type with materially different identities (§3.7); this one has ${pairs}. ` +
          "Without them §3.2's same-type measurement has nothing to compare and S8's same-type " +
          "clause is unevidenced.",
      );
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ the fixture builder */

/** Every supplied fact null: a 4C case's brief asserts nothing about what the host supplied. */
function emptySuppliedFacts(): SuppliedEventFacts {
  return Object.fromEntries(
    SUPPLIED_FACT_FIELDS.map((field) => [field, null]),
  ) as SuppliedEventFacts;
}

/**
 * The identity envelope a persisted authoritative revision would hold for this case.
 *
 * `clarification.needed` is false with no questions, which is what makes it authoritative:
 * `assertAuthoritative` derives that from the absence of a boundary question rather than from a
 * flag, and building a real envelope means the runner reaches the planner by production's own
 * route rather than by a cast.
 *
 * `suppliedFacts` is deliberately **not** taken from the case. The envelope exists to be read by
 * `assertAuthoritative`, which returns the brief alone; a case's `suppliedFacts` are an assertion
 * about the *output*, checked by `noSuppliedFactSurfaced`, and putting them here would be the one
 * way this harness could hand a creative call the host's verbatim names, date and venue.
 */
export function buildIdentityEnvelope(testCase: DesignIntentCase): EventIdentityResult {
  return {
    identity: structuredClone(testCase.identity),
    suppliedFacts: emptySuppliedFacts(),
    clarification: { needed: false, questions: [] },
  };
}

/* ------------------------------------------------------------------ what a run observes */

export type CheckStatus = "pass" | "fail" | "advisory" | "n/a";

export interface DesignIntentCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

/** One sibling's live call. Three per batch, one paid call each. */
export interface SiblingObservation {
  /** 0, 1 or 2 — the planner's index, and the key everything downstream uses. */
  readonly index: number;
  /** The provider's response text, exactly as it arrived. Journaled before any checking. */
  readonly raw: string;
  /** The parsed response: the seven design fields plus `presentation`. */
  readonly response: unknown;
  /** The assembled user message, verbatim as transmitted. Not a reconstruction. */
  readonly requestText: string;
  readonly telemetry: DesignIntentTelemetry;
}

export interface BatchObservation {
  readonly caseId: string;
  /** The deterministic plan the three calls were made under. T15's own output, not a copy. */
  readonly plan: ConceptBatchPlan;
  readonly siblings: readonly SiblingObservation[];
}

/* ------------------------------------------------------------------ perceptual colour */

/**
 * CIE76 ΔE*ab over sRGB → D65 XYZ → CIELAB.
 *
 * Deliberately CIE76 and not CIEDE2000. The floor below separates *palettes*, not adjacent
 * swatches, and it is set an order of magnitude above the just-noticeable difference — a regime
 * where CIEDE2000's corrections change a number and not a verdict. CIE76 is forty lines a reviewer
 * can check by hand; CIEDE2000 is three hundred that nobody re-derives, in a file that is frozen
 * and can never be corrected. Choosing the reviewable one is the point.
 *
 * Whatever this returns, it is a measurement and not a judgement: `§3.2` says a mechanical pass is
 * necessary and never sufficient, and three palettes can be far apart in Lab and still be one idea.
 */
export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export function hexToLab(hex: string): Lab {
  const value = hex.trim().replace(/^#/, "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const channel = (at: number) => parseInt(expanded.slice(at, at + 2), 16) / 255;
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = linear(channel(0));
  const g = linear(channel(2));
  const b = linear(channel(4));

  // sRGB D65 → XYZ, then normalised by the D65 white point.
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

export function hexDeltaE(a: string, b: string): number {
  return deltaE76(hexToLab(a), hexToLab(b));
}

/**
 * How far apart two palettes are: the mean nearest-neighbour distance, symmetrised.
 *
 * For every colour in A the distance to its closest colour in B, and the same from B to A,
 * averaged. A palette that is a recolour of another scores near zero however the colours are
 * ordered, which is what "distinctness beyond palette swaps" needs; a single shared accent between
 * otherwise different palettes barely moves it, which is correct — sharing one colour is not
 * sharing a palette.
 */
export function paletteDistance(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const labA = a.map(hexToLab);
  const labB = b.map(hexToLab);
  const nearest = (from: readonly Lab[], to: readonly Lab[]) =>
    from.reduce((sum, colour) => sum + Math.min(...to.map((other) => deltaE76(colour, other))), 0) /
    from.length;
  return (nearest(labA, labB) + nearest(labB, labA)) / 2;
}

/**
 * A coarse deterministic bucket for `§3.2`'s "corpus-wide frequency of palette families".
 *
 * Twelve hue sectors and three lightness bands off the dominant colour, with a neutral bucket
 * below a chroma floor. It is a measurement the reviewer reads, never a threshold: a long tail is
 * expected and a short one is the finding, and which of those this is, is theirs to say.
 */
export function paletteFamily(dominant: string): string {
  const { L, a, b } = hexToLab(dominant);
  const chroma = Math.hypot(a, b);
  const lightness = L < 35 ? "dark" : L < 70 ? "mid" : "light";
  if (chroma < 10) return `neutral · ${lightness}`;
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const sector = Math.floor(((hue + 360) % 360) / 30) * 30;
  return `hue ${sector}–${sector + 30} · ${lightness}`;
}

/* ------------------------------------------------------------------ the frozen mechanical floors */

/**
 * The within-batch floors and ceilings, frozen at T19 before any case existed.
 *
 * `spec.md §11.9`'s discipline, one level down: a floor chosen after seeing a run is not a floor.
 * None of these is a creative judgement and none of them may ever stand in for one — `§3.7` is
 * explicit that no deterministic metric may later be introduced and called the minimum-wowable
 * bar.
 */
export const MECHANICAL_FLOORS = {
  /**
   * Minimum pairwise palette distance, in CIE76 ΔE*ab.
   *
   * The just-noticeable difference is about 2.3 and "obviously a different colour" is around 10.
   * Twelve puts the floor past "different colour" for the average nearest-neighbour pairing of two
   * whole palettes, which is where a recolour of the same palette lives, while leaving ample room
   * for two genuinely different worlds that happen to share a neutral.
   */
  paletteSeparationDeltaE: 12,
  /**
   * How near an avoided colour may come before it counts as that colour.
   *
   * The identity contract says an exclusion "is absolute and covers near neighbours", so exact hex
   * equality would be a check that anything could walk around. Ten is the "obviously a different
   * colour" line: inside it, the palette is showing the colour the host excluded.
   */
  avoidedColourNeighbourhoodDeltaE: 10,
  /**
   * Of the five composition dimensions, how many must differ between any two siblings.
   *
   * One differing dimension is a setting; two is the floor at which the pair is at least arguably
   * a different arrangement. Hierarchy is planner-assigned, so this is not measuring the planner:
   * four of the five are the model's own.
   */
  compositionVectorMinDiffering: 2,
  /**
   * Maximum Jaccard overlap between two siblings' motif sets.
   *
   * At or below a half, two three-motif sets share at most one motif. Sharing one curated motif
   * out of seven is ordinary; sharing most of them is a swap.
   */
  motifOverlapCeiling: 0.5,
} as const;

/* ------------------------------------------------------------------ the within-batch checks */

interface DesignFields {
  family: string;
  tonalDirection: string;
  typographyPairing: string;
  density: string;
  palette: { colors: string[]; dominant: string };
  composition: Record<string, string>;
  motifs: string[];
  presentation?: { name?: unknown; description?: unknown };
}

const COMPOSITION_DIMENSIONS = [
  "asymmetry",
  "hierarchy",
  "rhythm",
  "sectionContrast",
  "ornament",
] as const;

function fieldsOf(response: unknown): DesignFields {
  const value = (response ?? {}) as Partial<DesignFields>;
  const palette = (value.palette ?? {}) as { colors?: unknown; dominant?: unknown };
  return {
    family: typeof value.family === "string" ? value.family : "",
    tonalDirection: typeof value.tonalDirection === "string" ? value.tonalDirection : "",
    typographyPairing: typeof value.typographyPairing === "string" ? value.typographyPairing : "",
    density: typeof value.density === "string" ? value.density : "",
    palette: {
      colors: Array.isArray(palette.colors)
        ? palette.colors.filter((c): c is string => typeof c === "string")
        : [],
      dominant: typeof palette.dominant === "string" ? palette.dominant : "",
    },
    composition: Object.fromEntries(
      COMPOSITION_DIMENSIONS.map((dimension) => [
        dimension,
        typeof (value.composition as Record<string, unknown> | undefined)?.[dimension] === "string"
          ? ((value.composition as Record<string, string>)[dimension] as string)
          : "",
      ]),
    ),
    motifs: Array.isArray(value.motifs)
      ? value.motifs.filter((m): m is string => typeof m === "string")
      : [],
    presentation: (value.presentation ?? undefined) as DesignFields["presentation"],
  };
}

/** Uppercase six-digit form, so `#aabbcc` and `#AABBCC` are one colour. */
const normalizeHex = (hex: string) => {
  const value = hex.trim().replace(/^#/, "").toUpperCase();
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return `#${expanded}`;
};

/** Every `#RGB`/`#RRGGBB` a piece of host-authored text names, normalised. */
export function hexColorsIn(text: string): string[] {
  return [...text.matchAll(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)].map((match) =>
    normalizeHex(match[0]),
  );
}

const presentationText = (fields: DesignFields) =>
  [
    typeof fields.presentation?.name === "string" ? fields.presentation.name : "",
    typeof fields.presentation?.description === "string" ? fields.presentation.description : "",
  ]
    .join(" ")
    .trim();

const pairs = <T>(items: readonly T[]): [T, T][] => {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) out.push([items[i], items[j]]);
  }
  return out;
};

const round = (value: number, places = 1) => Number(value.toFixed(places));

/**
 * Could one value be drawn from each pool with no two the same?
 *
 * A system of distinct representatives, decided exactly by search rather than approximated by
 * "the union is big enough" — which is necessary and not sufficient, and wrong in the one shape
 * that actually occurs: two siblings whose narrowed pool is the same single pairing, beside a third
 * with two of its own, has a union of three and no distinct choice. Three pools of at most a
 * handful of values each, so exactness costs nothing.
 */
export function canChooseDistinct(pools: readonly (readonly string[])[]): boolean {
  const search = (index: number, taken: Set<string>): boolean => {
    if (index === pools.length) return true;
    return (pools[index] ?? []).some((value) => {
      if (taken.has(value)) return false;
      taken.add(value);
      const ok = search(index + 1, taken);
      taken.delete(value);
      return ok;
    });
  };
  return search(0, new Set());
}

/**
 * The within-batch mechanical block of `§3.2`, frozen before any case exists.
 *
 * Every check is decidable from the observation and the frozen case alone, without a judgement
 * about creative quality — that is the qualitative half's job, and `§3.7` keeps it there. A check
 * whose input is absent reports `n/a`; one that cannot be decided honestly reports `advisory`;
 * **neither is ever counted as a pass**.
 */
export function checkDesignIntentBatch(
  testCase: DesignIntentCase,
  observed: BatchObservation,
): DesignIntentCheck[] {
  const checks: DesignIntentCheck[] = [];
  const add = (name: string, status: CheckStatus, detail: string) =>
    checks.push({ name, status, detail });

  const siblings = [...observed.siblings].sort((a, b) => a.index - b.index);
  const plan = observed.plan;
  const assignments = plan.siblings.map((sibling) => sibling.assignment);
  const fields = siblings.map((sibling) => fieldsOf(sibling.response));

  /* --- schema validity, against production's own validator ---------------------------------- */

  const invalid: string[] = [];
  siblings.forEach((sibling, index) => {
    const assignment = assignments[index];
    if (assignment === undefined) {
      invalid.push(`sibling ${sibling.index}: no planned assignment`);
      return;
    }
    let outcome: ReturnType<typeof validateDesignIntentResponse>;
    try {
      outcome = validateDesignIntentResponse(sibling.response, assignment);
    } catch (error) {
      // `narrowingFor` throws on an assignment it cannot narrow. That is a planner defect, not a
      // model one, and recording it as invalid output would be a claim about the wrong thing.
      invalid.push(
        `sibling ${sibling.index}: the assignment could not be narrowed (${String(error)})`,
      );
      return;
    }
    if (!outcome.ok) {
      invalid.push(
        `sibling ${sibling.index}: ` +
          outcome.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      );
    }
  });
  add(
    "schemaValid",
    invalid.length === 0 ? "pass" : "fail",
    invalid.length === 0
      ? "all three responses satisfy the narrowed contract and its semantic invariants"
      : invalid.join(" | "),
  );

  const firstCall = siblings.filter((sibling) => sibling.telemetry.schemaValidFirstCall).length;
  add(
    "firstCallSchemaValid",
    "advisory",
    `${firstCall} of ${siblings.length} responses parsed strictly on the first call. ` +
      "Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired " +
      "response is a legal production outcome and failing the set on it would measure the retry " +
      "policy rather than the model.",
  );

  const repair = siblings.reduce((sum, sibling) => sum + sibling.telemetry.repairRetries, 0);
  const transient = siblings.reduce((sum, sibling) => sum + sibling.telemetry.transientRetries, 0);
  add(
    "retryCounts",
    "advisory",
    `${repair} repair retry(ies) and ${transient} transient retry(ies) across the batch`,
  );

  /* --- assignment conformance ---------------------------------------------------------------- */

  const deviations: string[] = [];
  fields.forEach((sibling, index) => {
    const assignment = assignments[index];
    if (assignment === undefined) return;
    if (sibling.family !== assignment.family) {
      deviations.push(`sibling ${index} family ${sibling.family} ≠ ${assignment.family}`);
    }
    if (sibling.tonalDirection !== assignment.tonalDirection) {
      deviations.push(
        `sibling ${index} tonalDirection ${sibling.tonalDirection} ≠ ${assignment.tonalDirection}`,
      );
    }
    if (sibling.composition.hierarchy !== assignment.hierarchy) {
      deviations.push(
        `sibling ${index} hierarchy ${sibling.composition.hierarchy} ≠ ${assignment.hierarchy}`,
      );
    }
    if (!(assignment.typographyPairings as readonly string[]).includes(sibling.typographyPairing)) {
      deviations.push(
        `sibling ${index} typographyPairing ${sibling.typographyPairing} is outside the assigned category`,
      );
    }
  });
  add(
    "assignmentConformance",
    deviations.length === 0 ? "pass" : "fail",
    deviations.length === 0
      ? "each sibling returned the family, tone, hierarchy and typography category it was assigned"
      : deviations.join("; "),
  );

  /* --- palette separation, in a perceptual space and not by hex equality --------------------- */

  const palettePairs = pairs(fields.map((sibling, index) => ({ index, palette: sibling.palette })));
  const paletteDistances = palettePairs.map(([a, b]) => ({
    pair: `${a.index}↔${b.index}`,
    distance: paletteDistance(a.palette.colors, b.palette.colors),
    dominant:
      a.palette.dominant && b.palette.dominant
        ? hexDeltaE(a.palette.dominant, b.palette.dominant)
        : 0,
  }));
  const anyEmpty = fields.some((sibling) => sibling.palette.colors.length === 0);
  const minPalette =
    paletteDistances.length > 0 ? Math.min(...paletteDistances.map((d) => d.distance)) : 0;
  add(
    "paletteSeparation",
    anyEmpty ? "n/a" : minPalette >= MECHANICAL_FLOORS.paletteSeparationDeltaE ? "pass" : "fail",
    anyEmpty
      ? "a sibling returned no palette, so separation is not decidable"
      : `pairwise ΔE*ab (mean nearest-neighbour): ` +
          paletteDistances.map((d) => `${d.pair}=${round(d.distance)}`).join(", ") +
          `; dominants ` +
          paletteDistances.map((d) => `${d.pair}=${round(d.dominant)}`).join(", ") +
          `; floor ${MECHANICAL_FLOORS.paletteSeparationDeltaE}`,
  );

  /* --- typography pairing distinctness ------------------------------------------------------- */

  const pairings = fields.map((sibling) => sibling.typographyPairing);
  const pairingsDistinct = new Set(pairings).size === pairings.length;
  // Decidable only where the assignment could have admitted three distinct pairings at all — and
  // that is a question about *each sibling's own* narrowed pool, not about their union. Two
  // siblings assigned the same category, and a hierarchy that cuts a category to one pairing, are
  // both ordinary planner outcomes; a batch that then repeats a pairing has broken no rule, and
  // reporting `fail` there would be measuring the planner and calling it the model.
  const couldBeDistinct = canChooseDistinct(assignments.map((a) => a.typographyPairings));
  add(
    "typographyPairingDistinct",
    pairingsDistinct ? "pass" : couldBeDistinct ? "fail" : "advisory",
    pairingsDistinct
      ? `three distinct pairings: ${pairings.join(", ")}`
      : couldBeDistinct
        ? `repeated pairing where the assignment admitted three distinct ones: ${pairings.join(", ")}`
        : `repeated pairing (${pairings.join(", ")}), and the assigned pools could not have ` +
          "yielded three distinct ones — not decidable against the model",
  );

  /* --- composition-vector distinctness across the five dimensions ---------------------------- */

  const vectorPairs = pairs(
    fields.map((sibling, index) => ({ index, composition: sibling.composition })),
  );
  const differing = vectorPairs.map(([a, b]) => ({
    pair: `${a.index}↔${b.index}`,
    count: COMPOSITION_DIMENSIONS.filter(
      (dimension) => a.composition[dimension] !== b.composition[dimension],
    ).length,
  }));
  const minDiffering = differing.length > 0 ? Math.min(...differing.map((d) => d.count)) : 0;
  add(
    "compositionVectorDistinct",
    minDiffering >= MECHANICAL_FLOORS.compositionVectorMinDiffering ? "pass" : "fail",
    `differing composition dimensions: ` +
      differing.map((d) => `${d.pair}=${d.count}/5`).join(", ") +
      `; floor ${MECHANICAL_FLOORS.compositionVectorMinDiffering}`,
  );

  /* --- motif-set overlap --------------------------------------------------------------------- */

  const motifPairs = pairs(
    fields.map((sibling, index) => ({ index, motifs: new Set(sibling.motifs) })),
  );
  const overlaps = motifPairs
    .filter(([a, b]) => a.motifs.size > 0 || b.motifs.size > 0)
    .map(([a, b]) => {
      const intersection = [...a.motifs].filter((motif) => b.motifs.has(motif)).length;
      const union = new Set([...a.motifs, ...b.motifs]).size;
      return { pair: `${a.index}↔${b.index}`, overlap: union === 0 ? 0 : intersection / union };
    });
  const maxOverlap = overlaps.length > 0 ? Math.max(...overlaps.map((o) => o.overlap)) : 0;
  add(
    "motifOverlap",
    overlaps.length === 0
      ? "n/a"
      : maxOverlap <= MECHANICAL_FLOORS.motifOverlapCeiling
        ? "pass"
        : "fail",
    overlaps.length === 0
      ? "no sibling requested a motif; `ornament: none` is a legitimate direction and there is " +
          "nothing to overlap"
      : `Jaccard overlap: ` +
          overlaps.map((o) => `${o.pair}=${round(o.overlap, 2)}`).join(", ") +
          `; ceiling ${MECHANICAL_FLOORS.motifOverlapCeiling}`,
  );

  /* --- token allotment: not decidable here, and it says so ----------------------------------- */

  /**
   * `n/a`, always — and the reason is the one this file exists to keep straight.
   *
   * §3.2 lists "token allotment respected" among the within-batch invariants, and at the
   * DesignIntent layer **the model never had the chance to violate it**: a DesignIntent carries no
   * attractive token, because the allotment constrains the *composition* call (`spec.md §7.7`), and
   * 4C runs no composition call. Emitting `pass` would put a true-looking verdict about model
   * output into an evidence report, on a property that is a fact about the planner — and a later
   * reader of a go/no-go listing "tokenAllotmentRespected: pass" among the gating checks would read
   * it as a statement about the model.
   *
   * The planner half is already proven where it belongs: `src/lib/generation/planner.test.ts`
   * covers the per-batch caps, allowed/forbidden disjointness, full coverage and the absence of
   * index-0 bias over thousands of seeded plans. Re-deciding it here would add no evidence and cost
   * a verdict that claims more than it measures.
   *
   * The plan-side facts are still computed, because a detail that says "checked, and they held" is
   * worth more to a reader than one that only says "not decidable" — they simply never produce a
   * verdict. This is the same rule every other undecidable check in this file follows, and 4B's:
   * `n/a` rather than a pass that would claim more than it measured.
   */
  const tokenIds = Object.keys(CAPS_PER_BATCH) as AttractiveTokenId[];
  const allotmentProblems: string[] = [];
  for (const token of tokenIds) {
    const holders = plan.siblings.filter((sibling) => sibling.allowedTokens.includes(token));
    if (holders.length > CAPS_PER_BATCH[token]) {
      allotmentProblems.push(
        `${token} allotted to ${holders.length} siblings, cap ${CAPS_PER_BATCH[token]}`,
      );
    }
  }
  for (const sibling of plan.siblings) {
    const both = sibling.allowedTokens.filter((token) => sibling.forbiddenTokens.includes(token));
    if (both.length > 0) {
      allotmentProblems.push(
        `sibling ${sibling.index} both allowed and forbidden ${both.join(", ")}`,
      );
    }
    const covered = new Set([...sibling.allowedTokens, ...sibling.forbiddenTokens]);
    if (covered.size !== tokenIds.length) {
      allotmentProblems.push(
        `sibling ${sibling.index} does not account for every attractive token`,
      );
    }
  }
  add(
    "tokenAllotmentRespected",
    "n/a",
    "not decidable at this layer: a DesignIntent carries no attractive token, because the " +
      "allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition " +
      "call. The plan the three calls were made under was checked anyway, and " +
      (allotmentProblems.length === 0
        ? "it holds: each attractive token is within its per-batch cap, and every sibling accounts " +
          "for every token. That is a fact about the planner, proven over thousands of seeded " +
          "plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than " +
          "scored — it is not evidence about the model"
        : `it does not: ${allotmentProblems.join("; ")}. That is a planner defect, not a model ` +
          "one; it is surfaced here and decided in `src/lib/generation/planner.test.ts`"),
  );

  /* --- host constraints, in the half that is decidable --------------------------------------- */

  const identity = testCase.identity;
  const requiredHex = [
    ...identity.hostConstraints.flatMap(hexColorsIn),
    ...identity.paletteIntent.requiredColors.flatMap(hexColorsIn),
  ];
  const avoidHex = identity.paletteIntent.avoidColors.flatMap(hexColorsIn);
  const colourProblems: string[] = [];
  for (const hex of new Set(requiredHex)) {
    fields.forEach((sibling, index) => {
      if (!sibling.palette.colors.map(normalizeHex).includes(hex)) {
        colourProblems.push(`sibling ${index} omits required ${hex}`);
      }
    });
  }
  for (const hex of new Set(avoidHex)) {
    fields.forEach((sibling, index) => {
      const near = sibling.palette.colors.filter(
        (colour) => hexDeltaE(colour, hex) <= MECHANICAL_FLOORS.avoidedColourNeighbourhoodDeltaE,
      );
      if (near.length > 0) {
        colourProblems.push(`sibling ${index} carries ${near.join(", ")} inside excluded ${hex}`);
      }
    });
  }
  const decidableColours = new Set([...requiredHex, ...avoidHex]).size;
  add(
    "hostConstraintColoursHonoured",
    decidableColours === 0 ? "n/a" : colourProblems.length === 0 ? "pass" : "fail",
    decidableColours === 0
      ? "the identity names no colour in a form a machine can decide (a hex string), so nothing " +
          "here is decidable; constraint preservation is the reviewer's, under S4"
      : colourProblems.length === 0
        ? `${decidableColours} hex constraint(s) honoured by all three siblings`
        : colourProblems.join("; "),
  );

  const indecidable = identity.hostConstraints.filter(
    (constraint) => hexColorsIn(constraint).length === 0,
  );
  add(
    "hostConstraintsForReviewer",
    indecidable.length === 0 ? "n/a" : "advisory",
    indecidable.length === 0
      ? "every host constraint had a decidable form, or there were none"
      : `${indecidable.length} host constraint(s) are natural language and are the reviewer's to ` +
          `trace into all three (S4): ${indecidable.map((c) => `“${c}”`).join("; ")}`,
  );

  /* --- creativeGuidance stays advisory -------------------------------------------------------- */

  const guidanceHex = identity.creativeGuidance.flatMap((guidance) =>
    hexColorsIn(guidance).map((hex) => ({ guidance, hex })),
  );
  const universallyAdopted = guidanceHex.filter(({ hex }) =>
    fields.every((sibling) => sibling.palette.colors.map(normalizeHex).includes(hex)),
  );
  add(
    "creativeGuidanceStaysAdvisory",
    guidanceHex.length === 0 ? "n/a" : "advisory",
    guidanceHex.length === 0
      ? "no creative guidance names a colour in a decidable form; whether guidance was promoted " +
          "to host law is the reviewer's, under S3"
      : universallyAdopted.length === 0
        ? `${guidanceHex.length} decidable guidance colour(s), none adopted by all three siblings — ` +
          "which is what `advisory` looks like from the outside"
        : `all three siblings adopted ${universallyAdopted.map((g) => g.hex).join(", ")}. ` +
          "Unanimity is not proof of promotion — guidance may simply be good — so this never " +
          "fails; it is evidence for S3, which is the reviewer's",
  );

  /* --- no supplied fact invented or altered --------------------------------------------------- */

  const assertedFacts = Object.entries(testCase.suppliedFacts ?? {}).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
  );
  if (assertedFacts.length === 0) {
    add("noSuppliedFactSurfaced", "n/a", "the case asserts no supplied facts");
  } else {
    const surfaced: string[] = [];
    fields.forEach((sibling, index) => {
      const text = presentationText(sibling).toLowerCase();
      for (const [key, value] of assertedFacts) {
        if (text.includes(value.trim().toLowerCase())) {
          surfaced.push(`sibling ${index} presentation carries ${key} “${value}”`);
        }
      }
    });
    add(
      "noSuppliedFactSurfaced",
      surfaced.length === 0 ? "pass" : "fail",
      surfaced.length === 0
        ? `none of ${assertedFacts.length} supplied fact(s) appears in any presentation — which is ` +
            "what the input contract predicts, since a DesignIntent call never receives them"
        : surfaced.join("; "),
    );
  }

  /* --- presentation, which criterion 4 is answered against ------------------------------------ */

  const missingPresentation = fields.filter((sibling) => presentationText(sibling).length === 0);
  const unparsedPresentation = fields.filter(
    (sibling) =>
      presentationText(sibling).length > 0 &&
      (typeof sibling.presentation?.name !== "string" ||
        typeof sibling.presentation?.description !== "string"),
  );
  add(
    "presentationPresent",
    missingPresentation.length > 0 ? "fail" : unparsedPresentation.length > 0 ? "advisory" : "pass",
    missingPresentation.length > 0
      ? `${missingPresentation.length} sibling(s) returned no presentation text; minimum-wowable ` +
          "criterion 4 and the `Good` band cannot be answered for this batch"
      : unparsedPresentation.length > 0
        ? "a presentation is present but not in the validated shape; `spec.md §7.8` owes it a " +
          "deterministic fallback, and the reviewer reads what the model actually wrote"
        : "all three siblings carry a host-facing name and description",
  );

  return checks;
}

/** A batch passes mechanically when no gating check failed. Necessary, never sufficient. */
export function mechanicalPass(checks: readonly DesignIntentCheck[]): boolean {
  return !checks.some((check) => check.status === "fail");
}

/* ------------------------------------------------------------------ the corpus-wide block */

export interface CrossBatchDistance {
  readonly a: string;
  readonly b: string;
  readonly index: number;
  readonly paletteDeltaE: number;
  readonly differingCompositionDimensions: number;
  readonly samePairing: boolean;
  readonly sameMotifSet: boolean;
}

export interface CorpusMeasurements {
  readonly batchCount: number;
  /** Batch id → the label the blind artifact uses. Not part of the artifact itself. */
  readonly batchLabels: Readonly<Record<string, string>>;
  readonly withinBatchPaletteDistance: readonly { batch: string; min: number; mean: number }[];
  readonly crossBatchSameIndex: readonly CrossBatchDistance[];
  readonly crossBatchSummary: {
    readonly withinBatchMean: number;
    readonly crossBatchMean: number;
    readonly crossBatchMin: number;
  };
  readonly sameEventTypePairs: readonly {
    readonly eventType: string;
    readonly a: string;
    readonly b: string;
    readonly perIndex: readonly CrossBatchDistance[];
  }[];
  readonly paletteFamilyFrequency: readonly { value: string; count: number }[];
  readonly typographyPairingFrequency: readonly { value: string; count: number }[];
  readonly motifSetFrequency: readonly { value: string; count: number }[];
  readonly recurringPresentationSpans: readonly {
    readonly span: string;
    readonly batches: readonly string[];
  }[];
  readonly signaturesAcrossEventTypes: readonly {
    readonly signature: string;
    readonly eventTypes: readonly string[];
    readonly batches: readonly string[];
  }[];
}

const frequency = (values: readonly string[]) =>
  [
    ...values.reduce(
      (map, value) => map.set(value, (map.get(value) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** Three-word spans, long enough that a shared one is recurrence rather than English. */
function prosespans(text: string, size = 3): string[] {
  const words = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,—–;:!?'"“”‘’()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + size <= words.length; i += 1) {
    const span = words.slice(i, i + size).join(" ");
    if (span.length >= 14) out.push(span);
  }
  return out;
}

const signatureOf = (sibling: DesignFields) =>
  [
    sibling.family,
    sibling.tonalDirection,
    sibling.typographyPairing,
    COMPOSITION_DIMENSIONS.map((dimension) => sibling.composition[dimension]).join("/"),
    [...sibling.motifs].sort().join("+") || "no-motifs",
  ].join(" · ");

/**
 * `§3.2`'s corpus-wide block — **not optional**, and the reason is the Library Boundary Invariant.
 *
 * *"a system that produces three vivid, distinct, assignment-conforming worlds for every event, and
 * approximately the **same three** for a christening, a 60th birthday and a quinceañera, would pass
 * all of them. That is a three-template gallery arrived at without a library."*
 *
 * Everything here is reported as a **measurement**, never as a pass or a fail: `§3.2` says so, and
 * `§3.7` puts the verdict in the reviewer's hands under S8 and S9. The one thing these numbers must
 * do is make a recurrence visible enough that a reviewer cannot miss it and then be asked to answer
 * S8 from recollection of ratings they have just given.
 *
 * The last block is a **proxy and says so**: an "organizing idea" is not a field, so what is
 * measured is the design signature and the recurring finishing language, which is the closest
 * decidable neighbour. Whether two batches are the same *idea* is the reviewer's.
 */
export function measureCorpus(
  cases: readonly DesignIntentCase[],
  observations: readonly BatchObservation[],
): CorpusMeasurements {
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const batches = observations.map((observation, position) => ({
    id: observation.caseId,
    label: `Batch ${position + 1}`,
    eventType: normalizeEventType(byId.get(observation.caseId)?.eventType ?? ""),
    siblings: [...observation.siblings]
      .sort((a, b) => a.index - b.index)
      .map((sibling) => fieldsOf(sibling.response)),
  }));

  const withinBatchPaletteDistance = batches.map((batch) => {
    const distances = pairs(batch.siblings).map(([a, b]) =>
      paletteDistance(a.palette.colors, b.palette.colors),
    );
    return {
      batch: batch.label,
      min: distances.length > 0 ? round(Math.min(...distances)) : 0,
      mean:
        distances.length > 0 ? round(distances.reduce((s, d) => s + d, 0) / distances.length) : 0,
    };
  });

  const compare = (
    a: (typeof batches)[number],
    b: (typeof batches)[number],
  ): CrossBatchDistance[] =>
    a.siblings.map((sibling, index) => {
      const other = b.siblings[index];
      return {
        a: a.label,
        b: b.label,
        index,
        paletteDeltaE: other
          ? round(paletteDistance(sibling.palette.colors, other.palette.colors))
          : 0,
        differingCompositionDimensions: other
          ? COMPOSITION_DIMENSIONS.filter(
              (dimension) => sibling.composition[dimension] !== other.composition[dimension],
            ).length
          : 0,
        samePairing: other ? sibling.typographyPairing === other.typographyPairing : false,
        sameMotifSet: other
          ? [...sibling.motifs].sort().join("+") === [...other.motifs].sort().join("+")
          : false,
      };
    });

  const crossBatchSameIndex = pairs(batches).flatMap(([a, b]) => compare(a, b));
  const crossValues = crossBatchSameIndex.map((entry) => entry.paletteDeltaE);
  const withinValues = withinBatchPaletteDistance.map((entry) => entry.mean);

  const sameEventTypePairs = pairs(batches)
    .filter(([a, b]) => a.eventType.length > 0 && a.eventType === b.eventType)
    .map(([a, b]) => ({
      eventType: a.eventType,
      a: a.label,
      b: b.label,
      perIndex: compare(a, b),
    }));

  const allSiblings = batches.flatMap((batch) =>
    batch.siblings.map((sibling) => ({ batch, sibling })),
  );

  const spanBatches = new Map<string, Set<string>>();
  for (const { batch, sibling } of allSiblings) {
    for (const span of new Set(prosespans(presentationText(sibling)))) {
      spanBatches.set(span, (spanBatches.get(span) ?? new Set()).add(batch.label));
    }
  }

  const signatureBatches = new Map<string, { eventTypes: Set<string>; batches: Set<string> }>();
  for (const { batch, sibling } of allSiblings) {
    const signature = signatureOf(sibling);
    const entry = signatureBatches.get(signature) ?? {
      eventTypes: new Set<string>(),
      batches: new Set<string>(),
    };
    entry.eventTypes.add(batch.eventType);
    entry.batches.add(batch.label);
    signatureBatches.set(signature, entry);
  }

  const mean = (values: readonly number[]) =>
    values.length === 0 ? 0 : round(values.reduce((s, v) => s + v, 0) / values.length);

  return {
    batchCount: batches.length,
    batchLabels: Object.fromEntries(batches.map((batch) => [batch.id, batch.label])),
    withinBatchPaletteDistance,
    crossBatchSameIndex,
    crossBatchSummary: {
      withinBatchMean: mean(withinValues),
      crossBatchMean: mean(crossValues),
      crossBatchMin: crossValues.length > 0 ? round(Math.min(...crossValues)) : 0,
    },
    sameEventTypePairs,
    paletteFamilyFrequency: frequency(
      allSiblings
        .filter(({ sibling }) => sibling.palette.dominant.length > 0)
        .map(({ sibling }) => paletteFamily(sibling.palette.dominant)),
    ),
    typographyPairingFrequency: frequency(
      allSiblings.map(({ sibling }) => sibling.typographyPairing).filter(Boolean),
    ),
    motifSetFrequency: frequency(
      allSiblings.map(({ sibling }) => [...sibling.motifs].sort().join("+") || "no-motifs"),
    ),
    recurringPresentationSpans: [...spanBatches]
      .filter(([, labels]) => labels.size > 1)
      .map(([span, labels]) => ({ span, batches: [...labels].sort() }))
      .sort((a, b) => b.batches.length - a.batches.length || a.span.localeCompare(b.span)),
    signaturesAcrossEventTypes: [...signatureBatches]
      .filter(([, entry]) => entry.batches.size > 1)
      .map(([signature, entry]) => ({
        signature,
        eventTypes: [...entry.eventTypes].sort(),
        batches: [...entry.batches].sort(),
      }))
      .sort(
        (a, b) => b.batches.length - a.batches.length || a.signature.localeCompare(b.signature),
      ),
  };
}

/* ------------------------------------------------------------------ acceptance criteria */

/**
 * Frozen at T19, before the cases exist, and applied to the run unchanged.
 *
 * The mechanical half is stated here; the **gate** is `§3.7` and lives in `design-intent-gate.ts`.
 * Keeping them apart is deliberate: a mechanical pass is a precondition for the evidence being
 * worth reviewing at all, and it is never a substitute for the judgement `§3.7` asks a human for.
 */
export const DESIGN_INTENT_ACCEPTANCE = {
  mechanical:
    "Every batch passes mechanically: no check reports `fail`. `schemaValid`, " +
    "`assignmentConformance`, `paletteSeparation`, `typographyPairingDistinct`, " +
    "`compositionVectorDistinct`, `motifOverlap`, `hostConstraintColoursHonoured`, " +
    "`noSuppliedFactSurfaced` and `presentationPresent` gate. `firstCallSchemaValid`, " +
    "`retryCounts`, `hostConstraintsForReviewer`, `creativeGuidanceStaysAdvisory` and " +
    "`tokenAllotmentRespected` never gate, because each of them measures something whose verdict " +
    "belongs to the reviewer, to the retry policy or to the planner rather than to the model's " +
    "creative output. `tokenAllotmentRespected` is the sharpest of those: a DesignIntent carries " +
    "no attractive token at all — the allotment constrains the composition call (`spec.md §7.7`) " +
    "and 4C runs none — so it reports `n/a`, and a `pass` there would have put a true-looking " +
    "verdict about model output into an evidence report on a property the model never had the " +
    "chance to violate. The planner facts behind it are decided in " +
    "`src/lib/generation/planner.test.ts` and reported here as detail only.",
  corpusWide:
    "The corpus-wide block is reported as measurements, not thresholds. It exists so the reviewer " +
    "can answer S8 and S9 against evidence rather than against recollection of the per-batch " +
    "ratings they have just given.",
  qualitative:
    "The gate is `docs/phase-4b-plan.md §3.7`, frozen at T19: twelve of twelve `Excellent`, " +
    "twelve of twelve minimum-wowable `YES`, and all nine systemic categories assessed and found " +
    "absent. The arithmetic happens outside the blind review, by someone applying that frozen " +
    "rule to what the reviewer returned.",
  advisoryNeverCounts: "`advisory` and `n/a` are never folded into the pass count, in either half.",
  necessaryNeverSufficient:
    "A mechanical pass is necessary and never sufficient: three outputs can satisfy every distance " +
    "metric and still be one idea.",
} as const;

/* ------------------------------------------------------------------ the blind artifact (§3.8) */

const quote = (text: string) => `> ${text.replace(/\n/g, "\n> ")}`;

const renderIdentity = (identity: EventIdentity): string[] => {
  const list = (label: string, values: readonly string[]) =>
    values.length === 0 ? `- **${label}:** —` : `- **${label}:** ${values.join("; ")}`;
  return [
    "**Creative direction**",
    "",
    quote(identity.creativeDirection),
    "",
    list("Tone keywords", identity.toneKeywords),
    `- **Tonal intent:** ${identity.tonalIntent}`,
    `- **Tone explicitly constrained:** ${identity.toneExplicitlyConstrained ? "yes" : "no"}`,
    `- **Colors explicitly constrained:** ${identity.colorsExplicitlyConstrained ? "yes" : "no"}`,
    list("Required colors", identity.paletteIntent.requiredColors),
    list("Preferred colors", identity.paletteIntent.preferredColors),
    list("Avoid colors", identity.paletteIntent.avoidColors),
    `- **Dominance notes:** ${identity.paletteIntent.dominanceNotes}`,
    list("Compatible tonal directions", identity.compatibleTonalDirections),
    list("Compatible families", identity.compatibleFamilies),
    list("Compatible typography categories", identity.compatibleTypographyCategories),
    list("Visual motifs", identity.visualMotifs),
    `- **Texture direction:** ${identity.textureDirection}`,
    `- **Typography direction:** ${identity.typographyDirection}`,
    `- **Copy tone:** ${identity.copyTone}`,
    list("Host constraints (AUTHORITATIVE)", identity.hostConstraints),
    list("Creative guidance (ADVISORY)", identity.creativeGuidance),
    `- **Inspiration:** ${identity.inspirationSummary}`,
  ];
};

/**
 * What the reviewer sees, per batch: the brief, and the three DesignIntents with their
 * `presentation` objects. Nothing else.
 *
 * `§3.8`: *"Nothing else — no case metadata, no expectations, no clarification labels, no prior
 * evidence."* Batches are labelled positionally, because `§3.7` condition 2 requires citations "by
 * id" and the reviewer must have an id to cite that is not the corpus's own case name.
 *
 * The identity is included **deliberately**, and the plan explains why at length: `§3.3` asks
 * whether each direction is rooted in *this* event, S5 and S6 ask whether a treatment is supported
 * by the identity, and systemic condition 4 asks whether a pattern belongs to the system or to the
 * input — *"none of which is answerable from outputs alone. A blinding that withheld the identity
 * would make the veto structurally undeclinable-but-unprovable, which is worse than no veto."*
 */
export function buildDesignIntentBlindArtifact(
  cases: readonly DesignIntentCase[],
  observations: readonly BatchObservation[],
  measurements: CorpusMeasurements,
): string {
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const lines: string[] = [
    "# DesignIntent — blind review artifact",
    "",
    "Each block is one event. It carries the **authoritative creative brief** the three concepts",
    "were generated from, and the **three DesignIntents** that came back, each with the",
    "host-facing `presentation` the concept card would show.",
    "",
    "The brief is frozen fixture state written by hand with the case; no model produced it. Only",
    "the three concepts in each block came from a live call. Cite batches and siblings by the",
    "labels used here.",
    "",
    "Read the reviewer packet beside this file for what you are being asked.",
    "",
  ];

  observations.forEach((observation, position) => {
    const testCase = byId.get(observation.caseId);
    lines.push(`## Batch ${position + 1}`, "");
    if (testCase) lines.push(...renderIdentity(testCase.identity), "");
    [...observation.siblings]
      .sort((a, b) => a.index - b.index)
      .forEach((sibling) => {
        const fields = fieldsOf(sibling.response);
        lines.push(
          `### Batch ${position + 1} · Concept ${sibling.index + 1}`,
          "",
          `**${typeof fields.presentation?.name === "string" ? fields.presentation.name : "(no name returned)"}**`,
          "",
          typeof fields.presentation?.description === "string"
            ? fields.presentation.description
            : "(no description returned)",
          "",
          "```json",
          JSON.stringify(sibling.response ?? null, null, 2),
          "```",
          "",
        );
      });
  });

  lines.push(...renderCorpusMeasurements(measurements));
  return lines.join("\n");
}

/** The corpus-wide block, rendered once for the reviewer (`§3.8`). */
export function renderCorpusMeasurements(measurements: CorpusMeasurements): string[] {
  const table = (
    heading: string,
    rows: readonly { value: string; count: number }[],
    label: string,
  ) => [
    `### ${heading}`,
    "",
    `| ${label} | Concepts |`,
    "| --- | --- |",
    ...rows.map((row) => `| ${row.value} | ${row.count} |`),
    "",
  ];

  return [
    "## Corpus-wide measurements",
    "",
    "Measurements, not verdicts. They are here so a cross-batch question is answered against",
    "evidence rather than against recollection of the per-batch answers already given.",
    "",
    "### Concept separation, within a batch and across batches",
    "",
    "Palette distance is the mean nearest-neighbour ΔE*ab between two palettes: near zero means",
    "one palette is a recolour of the other.",
    "",
    `- mean **within**-batch palette distance: ${measurements.crossBatchSummary.withinBatchMean}`,
    `- mean **across**-batch distance between concepts at the same position: ${measurements.crossBatchSummary.crossBatchMean}`,
    `- smallest such across-batch distance: ${measurements.crossBatchSummary.crossBatchMin}`,
    "",
    "### Batches that are instances of the same kind of event",
    "",
    ...(measurements.sameEventTypePairs.length === 0
      ? ["No two batches in this corpus are instances of the same kind of event.", ""]
      : [
          "| Batches | Concept | Palette ΔE | Composition dimensions differing | Same typography | Same motifs |",
          "| --- | --- | --- | --- | --- | --- |",
          ...measurements.sameEventTypePairs.flatMap((pair) =>
            pair.perIndex.map(
              (entry) =>
                `| ${pair.a} ↔ ${pair.b} | ${entry.index + 1} | ${entry.paletteDeltaE} | ${entry.differingCompositionDimensions}/5 | ${entry.samePairing ? "yes" : "no"} | ${entry.sameMotifSet ? "yes" : "no"} |`,
            ),
          ),
          "",
        ]),
    ...table("Palette families", measurements.paletteFamilyFrequency, "Family"),
    ...table("Typography pairings", measurements.typographyPairingFrequency, "Pairing"),
    ...table("Motif sets", measurements.motifSetFrequency, "Motifs"),
    "### Language repeating across batches",
    "",
    ...(measurements.recurringPresentationSpans.length === 0
      ? ["No three-word span of concept language recurs in more than one batch.", ""]
      : [
          "| Span | Batches |",
          "| --- | --- |",
          ...measurements.recurringPresentationSpans.map(
            (entry) => `| ${entry.span} | ${entry.batches.join(", ")} |`,
          ),
          "",
        ]),
    "### Design signatures recurring across batches",
    "",
    "A signature is family · tone · typography · composition · motifs. This is a **proxy**: an",
    "organizing idea is not a field, and whether two concepts are the same idea is yours to say.",
    "",
    ...(measurements.signaturesAcrossEventTypes.length === 0
      ? ["No design signature recurs in more than one batch.", ""]
      : [
          "| Signature | Batches |",
          "| --- | --- |",
          ...measurements.signaturesAcrossEventTypes.map(
            (entry) => `| ${entry.signature} | ${entry.batches.join(", ")} |`,
          ),
          "",
        ]),
  ];
}

/* ------------------------------------------------------------------ the reviewer packet (§3.8) */

/**
 * The definitions, and none of the arithmetic.
 *
 * `§3.8`: the packet *"includes the four band definitions with `Excellent`'s six requirements, the
 * minimum-wowable question with its five criteria, and the S1–S9 definitions — a reviewer asked to
 * rate against a scale they cannot see is guessing, and a checklist they have not been given is one
 * they cannot complete. It excludes the distribution rule, the systemic thresholds, how many
 * `Excellent`s a GO needs, that `Good` does not pass, any expected outcome, any prior review, and
 * anything about what this project hopes the answer is."*
 *
 * Every band's text here is `reviewerFacing`, which is a **prefix** of the frozen definition —
 * `Good`'s row ends in the one clause `§3.8` withholds, and truncating a prefix cannot invent a
 * softer definition the way a paraphrase could. `design-intent.test.ts` searches the rendered
 * packet for the withheld arithmetic and fails on any of it; that test is the blinding guarantee,
 * so it looks for the numbers, the phrases and the gate module's own constants rather than for a
 * single sentinel string.
 */
export function buildDesignIntentReviewerPacket(): string {
  return [
    "# DesignIntent — independent reviewer packet",
    "",
    "You are reviewing sets of three design concepts. Each set was generated for one event from",
    "the creative brief shown beside it in the artifact. You have the brief and the three",
    "concepts, and nothing else about how any of this was made.",
    "",
    "Work through every batch in the artifact. For each one, answer **A** and **B**. When you have",
    "finished all of them, answer **C** once, against the corpus-wide measurements at the end of",
    "the artifact rather than from memory of the answers you have just given.",
    "",
    "## A. Which band is this batch?",
    "",
    "Choose exactly one, and say why.",
    "",
    "| Band | Definition |",
    "| --- | --- |",
    ...DESIGN_INTENT_BANDS.map((band) => `| **${band.band}** | ${band.reviewerFacing} |`),
    "",
    "**What `Excellent` requires, beyond the row above.** An `Excellent` batch satisfies",
    "everything in its row **and** all six of:",
    "",
    ...EXCELLENT_REQUIREMENTS.map((requirement, index) => `${index + 1}. ${requirement}`),
    "",
    EXCELLENT_IS_NOT_A_DEMAND_FOR_NOVELTY,
    "",
    "## B. Does this batch clear the minimum-wowable bar?",
    "",
    MINIMUM_WOWABLE_QUESTION,
    "",
    MINIMUM_WOWABLE_ANSWER_INSTRUCTION,
    "",
    MINIMUM_WOWABLE_REQUIRES_ALL_FIVE,
    "",
    "| | Criterion |",
    "| --- | --- |",
    ...MINIMUM_WOWABLE_CRITERIA.map((criterion) => `| ${criterion.id} | ${criterion.criterion} |`),
    "",
    "This judgement is qualitative and stays qualitative. There is no score to compute.",
    "",
    "## C. The cross-batch checklist",
    "",
    "Answer **every** row as present or absent — including the absent ones — and cite the batch,",
    "the concept within it and the output text for anything you mark present. Write this section",
    "against the corpus-wide measurements, not from recollection.",
    "",
    "| | Pattern |",
    "| --- | --- |",
    ...SYSTEMIC_CATEGORIES.map((category) => `| ${category.id} | ${category.pattern} |`),
    "",
    "Where a row asks you to name something yourself, name and define it in the same terms as the",
    "others.",
    "",
    "## What to return",
    "",
    "1. one band per batch, with reasons;",
    "2. one minimum-wowable YES or NO per batch, with the text that decided it quoted, and on a",
    "   NO, which of the five criteria is missing;",
    "3. the checklist above, every row answered present or absent, with citations;",
    "4. prose: anything you noticed that the structure above did not ask for.",
    "",
    "You are not asked whether this passes, and you are not being told what any answer would mean.",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ the mechanical report (ours) */

export function buildDesignIntentMechanicalReport(context: {
  readonly runStartedAt: string;
  readonly evalSet: string;
  readonly label: string;
  readonly corpusVersion: string;
  readonly plannerVersion: string;
  readonly rows: readonly { caseId: string; label: string; checks: readonly DesignIntentCheck[] }[];
  readonly measurements: CorpusMeasurements;
}): string {
  return [
    "# DesignIntent — mechanical report",
    "",
    `Run started: \`${context.runStartedAt}\` · corpus \`${context.corpusVersion}\` · set \`${context.evalSet}\` · planner \`${context.plannerVersion}\``,
    "",
    `Evidence class: **${context.label}**`,
    "",
    `- ${DESIGN_INTENT_ACCEPTANCE.necessaryNeverSufficient}`,
    `- ${DESIGN_INTENT_ACCEPTANCE.advisoryNeverCounts}`,
    "",
    "## Per batch",
    "",
    "| Batch | Case | Mechanical | Checks |",
    "| --- | --- | --- | --- |",
    ...context.rows.map(
      (row) =>
        `| ${row.label} | ${row.caseId} | ${mechanicalPass(row.checks) ? "pass" : "FAIL"} | ` +
        row.checks.map((check) => `${check.name}:${check.status}`).join(", ") +
        " |",
    ),
    "",
    "## Detail",
    "",
    ...context.rows.flatMap((row) => [
      `### ${row.label} — \`${row.caseId}\``,
      "",
      ...row.checks.map((check) => `- **${check.name}** · ${check.status} — ${check.detail}`),
      "",
    ]),
    ...renderCorpusMeasurements(context.measurements),
    "## Acceptance criteria, frozen at T19",
    "",
    `- **Mechanical:** ${DESIGN_INTENT_ACCEPTANCE.mechanical}`,
    `- **Corpus-wide:** ${DESIGN_INTENT_ACCEPTANCE.corpusWide}`,
    `- **Qualitative:** ${DESIGN_INTENT_ACCEPTANCE.qualitative}`,
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ the T21 seam */

export type DesignIntentTelemetry = CaseRun["telemetry"];

/**
 * One DesignIntent call, as T21 receives it.
 *
 * Exactly `DesignIntentCallInput`'s two channels and nothing more: the creative brief, and this
 * sibling's assignment. The brief travels as the plain identity object rather than the branded
 * type because the runner has already proved it authoritative through `assertAuthoritative` — the
 * brand is a compile-time guarantee about a call site, and re-declaring it here would only mean
 * the seam's implementer had to launder it again.
 */
export interface DesignIntentCallRequest {
  readonly identity: EventIdentity;
  readonly assignment: SiblingAssignment;
  /** 0, 1 or 2. Carried so a journal line and a report row can be joined without guessing. */
  readonly siblingIndex: number;
}

/**
 * What T21's boundary must provide for this set to run.
 *
 * Declared here, at T19, so the runner is complete before the implementation exists and the
 * implementation cannot quietly change what the runner expects.
 *
 * **On failure**, an implementation throws — the run must fail loudly, not degrade — and the thrown
 * value carries what was already paid for: `rawResponses?: string[]` (every text the provider
 * returned, including the repair retry's) and `usage?: { latencyMs?, transientRetries?,
 * repairRetries? }`. The runner journals that before rethrowing. Text the provider returned and our
 * validation then rejected is a call that was answered and billed; an implementation that swallows
 * it makes this set the one place a paid response vanishes.
 */
export type DesignIntentCallRunner = (request: DesignIntentCallRequest) => Promise<{
  /** The provider's response text, exactly as it arrived. Journaled before any checking. */
  raw: string;
  /** The parsed and validated response: seven design fields plus `presentation`. */
  response: unknown;
  /**
   * The assembled user message, verbatim as transmitted.
   *
   * Not an encoded request body — a JSON body escapes the quotes and newlines of brief text out of
   * existence — and not a reconstruction of what should have been sent. It is recorded so the
   * evidence says what the model was actually asked, and so `§3.5`'s leakage question can be asked
   * of a real transmission rather than of a source file.
   *
   * It is **your assembled user message and nothing else**: not the correction turn a repair retry
   * appends, and not the assistant echo of a schema-invalid previous response that sits between
   * them. That echo is raw model output, and a permanent verdict must never turn on a stochastic
   * one — the defect that reopened Phase 4B's freeze, one level along.
   */
  requestText: string;
  telemetry: DesignIntentTelemetry;
}>;

export const designIntentRunnerUnavailable: DesignIntentCallRunner = () => {
  throw new Error(
    "the DesignIntent prompt and provider boundary do not exist yet: they are Phase 4C T21, " +
      "which owns the production call this harness must go through. T19 prewired this seam; T21 " +
      "repoints `src/lib/ai/evals/design-intent-seam.ts` and touches nothing else in the frozen " +
      "harness. No set here runs before T21 is complete, frozen, independently reviewed and " +
      "explicitly approved (docs/phase-4b-plan.md Part IV, 'The stop point').",
  );
};
