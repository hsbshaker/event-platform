/**
 * The production deterministic sibling planner — `spec.md §7.7`.
 *
 * Once Event Identity is valid and not provisional, this plans the three concept **assignments**
 * that the three `generateDesignIntent` calls are constrained by. It is a pure function: no model
 * call, no network, no I/O, no clock, no RNG, no environment. Everything that would want
 * randomness is seeded from the identity revision id, so the same revision always plans the same
 * three siblings.
 *
 * # What it assigns, and what it does not
 *
 * It emits an assignment, never a `DesignIntent`. `spec.md §7.7` and `docs/model-contracts.md §1`
 * are explicit: the assignment is passed to the DesignIntent call, and the strong model returns
 * the palette, the pairing, density, the composition object and the motifs. The header of
 * `src/lib/renderer/planner/index.ts` records why the proof harness's `intentFor()` is
 * deliberately not ported; that reasoning governs here too.
 *
 * # Why this is not `src/lib/renderer/planner`
 *
 * That module is the parity-checked port of `proof-b/planner.js` and is a Phase 3 regression gate
 * — its 72-concept frozen replay pins it. It draws from the **full** design vocabulary and is
 * seeded by an arbitrary `(masterSeed, batchIndex)`, because the proof harness had no Event
 * Identity in front of it.
 *
 * Production has one. `spec.md §7.7` says each sibling receives "a distinct **compatible**
 * family", a distinct tonal direction "when the brief allows", a distinct "typography category".
 * Compatible with what the identity said, and seeded from the revision that said it. So this
 * module keeps the reference's structure, seeded sequence and draw order exactly, and changes
 * only the **pools** each draw is taken from and where the seed comes from. Everything that can
 * be shared is imported rather than copied: the directive sampler, the resampler, the avoid list,
 * the token caps, the PRNG, the hash and the vocabulary.
 *
 * The draw order — family, hierarchy, category, (pairing consumed), tone — is load-bearing and is
 * the reference's. So is the fourth draw being consumed rather than emitted; see the comment at
 * that pick.
 *
 * # The assignment is internally coherent
 *
 * Every pairing in `typographyPairings` is in `typographyCategory` and holds at `hierarchy`. The
 * planner owns the assignment, so it owns that agreement: `docs/model-contracts.md §5.1` ("in the
 * assigned category"), `§5.2` ("filtered by category and by whether they hold at the assigned
 * hierarchy") and `docs/phase-4b-plan.md §E` ("within the **assigned** category") all describe one
 * set, and the planner emits that set. Runtime narrowing therefore never has to discard something
 * the planner offered. This is the one place production deliberately parts from
 * `src/lib/renderer/planner`, whose frozen replay pins the broader fallback list; see the parity
 * section of `planner.test.ts`.
 *
 * # Library Boundary Invariant
 *
 * No silhouette, recipe or template identifier is read, emitted or consulted. The planner works
 * over families, tones, typography categories, hierarchies and directive dimensions only
 * (`docs/event-renderer-system.md §7.1`, `CLAUDE.md §5.1`).
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`. Plan:
 * `docs/phase-4b-plan.md §D`, T15.
 */

import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import { PLANNER_VERSION } from "@/lib/ai/versions";
import { fnv } from "@/lib/renderer/composition/walk";
import {
  CAPS_PER_BATCH,
  directiveFor,
  emptyAvoidList,
  type AttractiveTokenId,
  type SiblingAssignment,
} from "@/lib/renderer/planner";
import { DIMENSIONS, describe, type Directive } from "@/lib/renderer/planner/directives";
import { mulberry32 } from "@/lib/renderer/seeded-random";
import {
  FAMILIES,
  FAMILY_KEYS,
  TONES,
  TYPOGRAPHY,
  TYPOGRAPHY_KEYS,
  type Family,
  type Tone,
  type TypographyCategory,
} from "@/lib/renderer/vocabulary";

/** `spec.md §7.7`: three concept assignments, at stable indexes 0, 1 and 2. */
export const SIBLING_COUNT = 3;

const TOKEN_IDS = Object.keys(CAPS_PER_BATCH) as AttractiveTokenId[];

/**
 * The dimensions telemetry reports on.
 *
 * The four assignment dimensions are `§7.7`'s separation priority, in its order. The two
 * directive dimensions are the two `§7.7` requires siblings to differ on — "siblings differ at
 * least on structure and opening". The other six directive dimensions are diversity nudges the
 * planner does not promise to separate, so reporting them would imply a guarantee that does not
 * exist.
 */
export const SEPARATION_DIMENSIONS = [
  "family",
  "tonalDirection",
  "typographyCategory",
  "hierarchy",
  "structure",
  "opening",
] as const;

export type SeparationDimension = (typeof SEPARATION_DIMENSIONS)[number];

/** `distinct` = one value per sibling; `uniform` = all three the same; `partial` = two. */
export type SeparationStatus = "distinct" | "partial" | "uniform";

/**
 * Why a dimension did not separate the siblings, or did so outside the brief.
 *
 * `tone-locked` and `pool-exhausted` mean different things and must stay distinguishable.
 * `tone-locked` is the planner obeying `spec.md §7.7` — "If tone is explicitly constrained, do
 * not force dark/mid" — and is a correct outcome. `pool-exhausted` is the planner wanting a value
 * it could not have. `constraint-relaxed` is the third case: the planner had to draw **outside**
 * the identity's compatible set to produce a usable assignment at all.
 */
export type SeparationFallback = "none" | "pool-exhausted" | "tone-locked" | "constraint-relaxed";

export interface DimensionSeparation {
  readonly dimension: SeparationDimension;
  /** How many of the three siblings' values are distinct. 1..3. */
  readonly distinctValues: number;
  /**
   * How many values the planner could legitimately draw from across this batch: the union of the
   * pools the three siblings actually drew from. It is per-batch rather than per-sibling because
   * some pools depend on a sibling's own family — `statement` offers two hierarchies, `editorial`
   * four — so a single number per sibling would not describe the batch.
   */
  readonly poolSize: number;
  readonly status: SeparationStatus;
  readonly fallback: SeparationFallback;
}

/**
 * Deterministic facts about what actually separated this batch. No scores, no judgement.
 *
 * `docs/phase-4b-plan.md §D`: "a batch separated only by typography is the failure mode worth
 * seeing before a human does". So a weak batch has to be visibly weak here — which is why
 * `separatingDimensions` counts only the dimensions that reached three distinct values, and why
 * nothing in this object averages anything.
 */
export interface PlanTelemetry {
  readonly dimensions: readonly DimensionSeparation[];
  /** Dimensions with three distinct values, in `SEPARATION_DIMENSIONS` order. */
  readonly separatingDimensions: readonly SeparationDimension[];
  /** Dimensions that took a fallback, in `SEPARATION_DIMENSIONS` order. */
  readonly fallbackDimensions: readonly SeparationDimension[];
  readonly distinctDimensionCount: number;
}

/**
 * What the planner reads.
 *
 * `identity` is the branded `AuthoritativeIdentity` from `lifecycle.ts`, which only
 * `assertAuthoritative` can produce. A provisional identity therefore cannot be planned from on
 * the ordinary typed path — it is a compile error, not a review comment (`spec.md §7.6b`).
 *
 * The brand wraps the creative brief, not the envelope, so `suppliedFacts`, `clarification` and
 * the host's raw words are not reachable from here at all
 * (`spec.md §7.5`, `src/lib/ai/raw-prompt-boundary.test.ts`).
 */
export interface PlanBatchInput {
  readonly identity: AuthoritativeIdentity;
  /** The identity revision this batch is planned from; the only seed source. */
  readonly identityRevisionId: string;
}

export interface PlannedConcept {
  /** 0, 1 or 2. The planner's index, and the key everything downstream uses. */
  readonly index: number;
  readonly seed: number;
  readonly assignment: SiblingAssignment;
  readonly directive: Directive;
  /** `spec.md §7.7`: the directive "assembled into one sentence", for the composition prompt. */
  readonly directiveSentence: string;
  readonly allowedTokens: readonly AttractiveTokenId[];
  readonly forbiddenTokens: readonly AttractiveTokenId[];
}

export interface ConceptBatchPlan {
  readonly plannerVersion: string;
  readonly identityRevisionId: string;
  readonly batchSeed: string;
  readonly siblings: readonly PlannedConcept[];
  /**
   * `hostConstraints` verbatim, in order. AUTHORITATIVE and carried untouched — the planner never
   * reads their content, never derives a draw from them and never merges them with guidance.
   */
  readonly hostConstraints: readonly string[];
  /**
   * `creativeGuidance` verbatim, in order. ADVISORY (`docs/model-contracts.md §4`): a later stage
   * may reconsider, override or evolve any of it. Carried in its own field precisely so that it
   * cannot be mistaken downstream for something the host required.
   */
  readonly creativeGuidance: readonly string[];
  readonly telemetry: PlanTelemetry;
}

/**
 * An identity the planner refuses to plan from.
 *
 * Thrown rather than repaired: an empty compatible set is a contract violation upstream
 * (`eventIdentitySchema` requires at least one of each), and silently substituting the full
 * vocabulary would turn a broken brief into three plausible-looking concepts nobody would
 * question.
 */
export class UnplannableIdentityError extends Error {
  constructor(detail: string) {
    super(`event identity cannot be planned from: ${detail}`);
    this.name = "UnplannableIdentityError";
  }
}

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];

/**
 * Prefer what no sibling has taken; fall back to the whole pool when the brief leaves no room.
 *
 * The reference's `not()`, plus the flag telemetry needs — `exhausted` is the honest signal that
 * the planner wanted a distinct value and the pool had none left.
 */
function preferFree<T>(
  pool: readonly T[],
  taken: readonly T[],
): { list: readonly T[]; exhausted: boolean } {
  const free = pool.filter((x) => !taken.includes(x));
  return free.length ? { list: free, exhausted: false } : { list: pool, exhausted: true };
}

/**
 * Narrow a catalog to the identity's compatible set, keeping the **catalog's** order.
 *
 * Order matters because a seeded pick indexes into the result, and the identity's own arrays are
 * ranked best-first by the model. Two consequences follow, and both are wanted. A rerun that
 * re-ranks the same values without changing the set plans the same batch, because re-ranking is
 * not a creative change. And when the compatible set is the whole catalog the result is the
 * catalog itself, which is what makes the parity claim in `planner.test.ts` exact.
 *
 * Rank is deliberately not weighted: `spec.md §7.7` asks for distinct compatible values, not for
 * the best-ranked ones, and weighting by rank would be new behaviour no canonical text requires.
 */
const narrow = <T>(catalog: readonly T[], compatible: readonly T[]): readonly T[] =>
  catalog.filter((value) => compatible.includes(value));

type AssignmentDimension = "family" | "tonalDirection" | "typographyCategory" | "hierarchy";

interface SiblingDraw {
  readonly assignment: SiblingAssignment;
  /** The pool each dimension was drawn from, before the taken-values preference. */
  readonly pools: Readonly<Record<AssignmentDimension, readonly string[]>>;
  /** Dimensions where nothing untaken was left. */
  readonly exhausted: readonly AssignmentDimension[];
  /** True when the resolved category lies outside the identity's compatible set. */
  readonly categoryRelaxed: boolean;
}

/**
 * Every typography category the vocabulary knows, derived from the family tables rather than
 * listed again, so it cannot drift from them. Its order is immaterial: this list is only ever
 * intersected against per-family pools, which supply the order a seeded pick indexes into.
 */
const TYPOGRAPHY_CATEGORY_KEYS: readonly TypographyCategory[] = [
  ...new Set(FAMILY_KEYS.flatMap((f) => [...FAMILIES[f].categories])),
];

interface Pools {
  readonly families: readonly Family[];
  readonly tones: readonly Tone[];
  readonly categories: readonly TypographyCategory[];
  /** `toneExplicitlyConstrained`, or a single compatible tone. */
  readonly toneLocked: boolean;
}

function poolsFor(identity: AuthoritativeIdentity): Pools {
  const families = narrow(FAMILY_KEYS, identity.compatibleFamilies);
  const tones = narrow(TONES, identity.compatibleTonalDirections);
  const categories = narrow(TYPOGRAPHY_CATEGORY_KEYS, identity.compatibleTypographyCategories);

  if (!families.length) throw new UnplannableIdentityError("no compatible family");
  if (!tones.length) throw new UnplannableIdentityError("no compatible tonal direction");
  if (!categories.length) throw new UnplannableIdentityError("no compatible typography category");

  return {
    families,
    tones,
    categories,
    // `spec.md §7.7`: "If tone is explicitly constrained, do not force dark/mid; diversity then
    // relies on family, directive, typography and hierarchy." A brief that admits exactly one
    // tone is the same situation arrived at from the other side, and is reported the same way.
    toneLocked: identity.toneExplicitlyConstrained || tones.length === 1,
  };
}

/**
 * One sibling's assignment, drawn from the identity's pools.
 *
 * The seeded sequence is the reference's, draw for draw: family, hierarchy, category, pairing,
 * tone. Each `pick` consumes exactly one number from the PRNG on every path — including the
 * tone-locked path — so a tone lock changes which tone is drawn and nothing else about the batch.
 */
function drawAssignment(seed: number, pools: Pools, avoid: ReturnType<typeof emptyAvoidList>) {
  const r = mulberry32(seed);
  const exhausted: AssignmentDimension[] = [];
  const note = (dimension: AssignmentDimension, wasExhausted: boolean) => {
    if (wasExhausted) exhausted.push(dimension);
  };

  const familyChoice = preferFree(pools.families, avoid.families);
  note("family", familyChoice.exhausted);
  const family = pick(r, familyChoice.list);
  const F = FAMILIES[family];

  // Hierarchy has no identity field: `spec.md §7.7` separates on it, and which hierarchies exist
  // is a property of the family the sibling just drew (`docs/model-contracts.md §5.2`).
  const hierarchyChoice = preferFree(F.hierarchies, avoid.hierarchies);
  note("hierarchy", hierarchyChoice.exhausted);
  const hierarchy = pick(r, hierarchyChoice.list);

  // Family compatibility and identity compatibility can be disjoint — `invitation` offers no
  // grotesk, `statement` no oldstyle. `§7.7` ranks family above typography category, so the
  // family stands and the category pool falls back to what the family actually offers. The
  // relaxation is detected below and reported; it is never silent.
  const categoryPool = narrow(F.categories, pools.categories);
  const categoryChoice = preferFree(
    categoryPool.length ? categoryPool : F.categories,
    avoid.categories,
  );
  note("typographyCategory", categoryChoice.exhausted);
  const drawnCategory = pick(r, categoryChoice.list);

  const holds = (id: (typeof TYPOGRAPHY_KEYS)[number]) =>
    hierarchy !== "monumental" || TYPOGRAPHY[id].holdsAtMonumental;
  let pairings = TYPOGRAPHY_KEYS.filter(
    (k) => TYPOGRAPHY[k].category === drawnCategory && holds(k),
  );
  if (!pairings.length) {
    // No pairing in the drawn category holds at this hierarchy. Prefer the identity's other
    // compatible categories before leaving its brief at all; the reference had no such set, so
    // when the identity admits every category this is byte-identical to its unconditional
    // `holdsAtMonumental` fallback.
    pairings = TYPOGRAPHY_KEYS.filter(
      (k) => holds(k) && pools.categories.includes(TYPOGRAPHY[k].category),
    );
  }
  if (!pairings.length) pairings = TYPOGRAPHY_KEYS.filter(holds);

  // The reference picked a pairing here, standing in for `generateDesignIntent`. Production hands
  // the narrowed list to the model instead, so the pick is consumed for two reasons only: it
  // resolves the assigned category on the fallback path exactly as the reference did, and it
  // keeps the seeded sequence intact so the tone drawn next matches. The pairing itself is
  // deliberately not emitted — exposing it would invite skipping the model call.
  const typographyCategory = TYPOGRAPHY[pick(r, pairings)].category;

  // The pick resolved the category; the list emitted beside it must agree with it. On the primary
  // path this is already true and the filter is a no-op. On either fallback path the pool spans
  // several categories — the pick lands in one of them — and emitting the whole pool would offer
  // the model pairings outside the category the assignment declares. `docs/model-contracts.md
  // §5.1` requires the pairing to be "in the assigned category", `§5.2` narrows "by category and
  // by whether they hold at the assigned hierarchy", and `docs/phase-4b-plan.md §E` says "within
  // the **assigned** category"; all three describe one set, so the planner emits that set rather
  // than leaving the contradiction for a later stage to reconcile.
  //
  // Two things make this safe. It cannot empty the list: the pairing the pick landed on is in the
  // resolved category by definition, so at least one member survives. And every survivor still
  // holds at this hierarchy, because every branch above filtered by `holds` before the pick. It
  // also consumes no PRNG value and runs after the pick, so the seeded sequence, the tone drawn
  // next and every other emitted field are exactly what they were.
  pairings = pairings.filter((k) => TYPOGRAPHY[k].category === typographyCategory);

  const toneChoice = pools.toneLocked
    ? { list: pools.tones, exhausted: false }
    : preferFree(pools.tones, avoid.tones);
  note("tonalDirection", toneChoice.exhausted);
  const tonalDirection = pick(r, toneChoice.list);

  const draw: SiblingDraw = {
    assignment: {
      family,
      tonalDirection,
      typographyCategory,
      hierarchy,
      typographyPairings: pairings,
    },
    pools: {
      family: pools.families as readonly string[],
      tonalDirection: pools.tones as readonly string[],
      typographyCategory: (categoryPool.length ? categoryPool : F.categories) as readonly string[],
      hierarchy: F.hierarchies as readonly string[],
    },
    exhausted,
    categoryRelaxed: !pools.categories.includes(typographyCategory),
  };
  return draw;
}

function separation(
  dimension: SeparationDimension,
  values: readonly string[],
  pool: readonly string[],
  fallback: SeparationFallback,
): DimensionSeparation {
  const distinctValues = new Set(values).size;
  return {
    dimension,
    distinctValues,
    poolSize: new Set(pool).size,
    status:
      distinctValues === SIBLING_COUNT ? "distinct" : distinctValues === 1 ? "uniform" : "partial",
    fallback,
  };
}

function buildTelemetry(
  draws: readonly SiblingDraw[],
  directives: readonly Directive[],
  directiveExhausted: Readonly<Record<"structure" | "opening", boolean>>,
  toneLocked: boolean,
): PlanTelemetry {
  const unionPool = (dimension: AssignmentDimension) =>
    draws.flatMap((d) => [...d.pools[dimension]]);
  const assigned = (dimension: AssignmentDimension) =>
    draws.map((d) => d.assignment[dimension] as string);

  const assignmentFallback = (dimension: AssignmentDimension): SeparationFallback => {
    if (dimension === "tonalDirection" && toneLocked) return "tone-locked";
    if (dimension === "typographyCategory" && draws.some((d) => d.categoryRelaxed))
      return "constraint-relaxed";
    return draws.some((d) => d.exhausted.includes(dimension)) ? "pool-exhausted" : "none";
  };

  const dimensions: DimensionSeparation[] = [
    separation("family", assigned("family"), unionPool("family"), assignmentFallback("family")),
    separation(
      "tonalDirection",
      assigned("tonalDirection"),
      unionPool("tonalDirection"),
      assignmentFallback("tonalDirection"),
    ),
    separation(
      "typographyCategory",
      assigned("typographyCategory"),
      unionPool("typographyCategory"),
      assignmentFallback("typographyCategory"),
    ),
    separation(
      "hierarchy",
      assigned("hierarchy"),
      unionPool("hierarchy"),
      assignmentFallback("hierarchy"),
    ),
    separation(
      "structure",
      directives.map((d) => d.structure),
      DIMENSIONS.structure,
      directiveExhausted.structure ? "pool-exhausted" : "none",
    ),
    separation(
      "opening",
      directives.map((d) => d.opening),
      DIMENSIONS.opening,
      directiveExhausted.opening ? "pool-exhausted" : "none",
    ),
  ];

  const separating = dimensions.filter((d) => d.status === "distinct").map((d) => d.dimension);
  return {
    dimensions,
    separatingDimensions: separating,
    fallbackDimensions: dimensions.filter((d) => d.fallback !== "none").map((d) => d.dimension),
    distinctDimensionCount: separating.length,
  };
}

/**
 * Plan the three concept assignments for one identity revision.
 *
 * Deterministic in `identityRevisionId` alone. `PLANNER_VERSION` is deliberately **not** mixed
 * into the seed: it labels which algorithm produced an artifact so a historical batch can be
 * replayed by running that version against the same revision, and mixing it in would scramble
 * every plan on a bump for no gain. Replay identity is therefore the pair
 * `(identityRevisionId, PLANNER_VERSION)`, exactly as `docs/phase-4b-plan.md §D` states.
 */
export function planConceptBatch(input: PlanBatchInput): ConceptBatchPlan {
  const { identity, identityRevisionId } = input;
  if (!identityRevisionId) {
    throw new UnplannableIdentityError("identityRevisionId is empty");
  }

  const pools = poolsFor(identity);
  const batchSeed = fnv(identityRevisionId);
  const r = mulberry32(parseInt(batchSeed, 16));
  const avoid = emptyAvoidList();

  // Spread the attractive tokens across the siblings from a seeded start offset, so no sibling
  // collects every device and index 0 gains no systematic advantage. `spec.md §7.7`: each token
  // to at most one sibling in three.
  const allot: Record<AttractiveTokenId, number[]> = {} as Record<AttractiveTokenId, number[]>;
  const start = Math.floor(r() * SIBLING_COUNT);
  TOKEN_IDS.forEach((id, i) => {
    allot[id] = [...Array(CAPS_PER_BATCH[id]).keys()].map((j) => (start + i + j) % SIBLING_COUNT);
  });

  const draws: SiblingDraw[] = [];
  const siblings: PlannedConcept[] = [];
  const directiveExhausted = { structure: false, opening: false };

  for (let k = 0; k < SIBLING_COUNT; k++) {
    const seed = parseInt(fnv(`${batchSeed}|sib|${k}`), 16);
    const draw = drawAssignment(seed, pools, avoid);
    let directive = directiveFor(seed + 7, avoid);

    // A directive must not ask for a device this sibling was not allotted. Resample first; if 60
    // attempts cannot avoid it, rewrite the two offending dimensions.
    if (!allot.heroNumeral.includes(k)) {
      for (
        let i = 1;
        i < 60 && (directive.opening === "numeral" || directive.date === "numeral");
        i++
      )
        directive = directiveFor(seed + 7 + 1000 * i, avoid);
      if (directive.opening === "numeral" || directive.date === "numeral")
        directive = {
          ...directive,
          opening: directive.opening === "numeral" ? "title" : directive.opening,
          date: directive.date === "numeral" ? "inline" : directive.date,
        };
    }

    // The resampler took a value a sibling already holds: within the allotment it had nothing
    // free left on that dimension.
    if (avoid.structures.includes(directive.structure)) directiveExhausted.structure = true;
    if (avoid.openings.includes(directive.opening)) directiveExhausted.opening = true;

    avoid.families.push(draw.assignment.family);
    avoid.tones.push(draw.assignment.tonalDirection);
    avoid.categories.push(draw.assignment.typographyCategory);
    avoid.hierarchies.push(draw.assignment.hierarchy);
    avoid.structures.push(directive.structure);
    avoid.openings.push(directive.opening);

    draws.push(draw);
    siblings.push({
      index: k,
      seed,
      assignment: draw.assignment,
      directive,
      directiveSentence: describe(directive),
      allowedTokens: TOKEN_IDS.filter((id) => allot[id].includes(k)),
      forbiddenTokens: TOKEN_IDS.filter((id) => !allot[id].includes(k)),
    });
  }

  return {
    plannerVersion: PLANNER_VERSION,
    identityRevisionId,
    batchSeed,
    siblings,
    // Copied, never read. The planner draws from a closed structural vocabulary and derives
    // nothing from either list, which is what keeps a constraint a constraint and guidance
    // advisory all the way to the composition call.
    hostConstraints: [...identity.hostConstraints],
    creativeGuidance: [...identity.creativeGuidance],
    telemetry: buildTelemetry(
      draws,
      siblings.map((s) => s.directive),
      directiveExhausted,
      pools.toneLocked,
    ),
  };
}

export type { AttractiveTokenId, Directive, SiblingAssignment };
