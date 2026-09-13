/**
 * The terminal library fallback.
 *
 * `docs/event-renderer-system.md §3` and §5 allow the composition call exactly one re-prompt for
 * a schema-invalid response and exactly one for a selector collision. §7.1 permits the library as
 * "the terminal fallback, after the retry §3 and §5 allow has been exhausted" — after, and only
 * after. A fallback page is recorded as a fallback and never presented as a model composition
 * (`docs/model-contracts.md`).
 *
 * So this module fails closed. It does not trust the caller to have spent the retry: the request
 * must carry both attempts, and `terminalFallback` returns a refusal unless the evidence shows
 * the allowed retry was made and failed. A caller that reaches for the fallback on the first
 * failure gets nothing back.
 *
 * The two reasons below are the two the canonical documents name. There are no others, and none
 * may be added without a spec change.
 */

import type { CompositionTree } from "../composition/nodes";
import { A1_SITES, page } from "../library";

/** The terminal reasons §3 and §5 define. Not an open set. */
export type TerminalFallbackReason =
  "schema-invalid-after-retry" | "selector-collision-after-retry";

/** One composition attempt, as the schema path sees it. */
export interface SchemaAttempt {
  /** Whether `validateSchema` accepted this attempt's response. */
  readonly schemaValid: boolean;
}

/** One composition attempt, as the selector sees it. */
export interface CollisionAttempt {
  readonly schemaValid: boolean;
  /** Whether this attempt's skeleton cleared the collision threshold against its siblings. */
  readonly resolved: boolean;
}

/**
 * Evidence, not a request to be taken on trust. `attempts` is the initial call followed by the
 * one retry the contract allows, in order.
 */
export type TerminalFallbackRequest =
  | {
      readonly reason: "schema-invalid-after-retry";
      readonly seed: number;
      readonly attempts: readonly SchemaAttempt[];
    }
  | {
      readonly reason: "selector-collision-after-retry";
      readonly seed: number;
      readonly attempts: readonly CollisionAttempt[];
    };

/**
 * Why the guard said no.
 *
 * These describe the caller's *state* — a history that does not show a legitimate, exhausted
 * retry. They are not fallback reasons, are never recorded as one, and adding one here does not
 * add a terminal reason (§3, §5 define exactly two of those).
 */
export type FallbackRefusal =
  /** Fewer attempts than the contract's initial call plus one retry. */
  | "retry-not-attempted"
  /** More attempts than §3 and §5 allow — the caller ran a path the contract does not have. */
  | "retry-budget-exceeded"
  /** The first attempt did not fail, so no retry was ever authorized for this reason. */
  | "retry-not-authorized"
  /** The retry was made and succeeded, so there is nothing to fall back from. */
  | "retry-not-spent"
  /**
   * A collision history contains a schema-invalid attempt. A schema-invalid response belongs to
   * the schema-validation path; it cannot also be evidence for a collision fallback.
   */
  | "attempt-off-path";

/**
 * The record Phase 4 writes to the `GenerationRun`. Phase 3 defines the shape and fills it;
 * Phase 4 does the recording (`docs/renderer-invariant-obligations.md` rows 7 and 8).
 *
 * `fixtureId` is diagnostic only — it says which fixture a run fell back to so fallback rate can
 * be measured per fixture. It is an output of a failure, never an input to a decision, and must
 * not be fed back into generation: §7.1 forbids a recipe or silhouette identifier as a
 * candidate-choice variable.
 */
export interface FallbackTelemetry {
  readonly reason: TerminalFallbackReason;
  readonly source: "library";
  readonly seed: number;
  readonly fixtureId: string;
  /** Always 2: the initial call plus the one retry the contract allows. */
  readonly attemptsSpent: number;
}

export type TerminalFallbackResult =
  | { readonly ok: true; readonly tree: CompositionTree; readonly telemetry: FallbackTelemetry }
  | { readonly ok: false; readonly refusal: FallbackRefusal };

/** The initial call plus the one retry §3 and §5 allow. */
const ALLOWED_ATTEMPTS = 2;

/**
 * Does the history show a legitimate, exhausted retry for this reason?
 *
 * Both attempts are checked, not just the last. Two attempt objects prove nothing on their own:
 * the fallback has to see the state transition the contract describes — a first failure that
 * *authorized* the one retry, and a retry that also failed. Anything else is a history the
 * contract cannot produce, and is refused rather than served.
 */
function evidenceRefusal(request: TerminalFallbackRequest): FallbackRefusal | null {
  if (request.attempts.length < ALLOWED_ATTEMPTS) return "retry-not-attempted";
  if (request.attempts.length > ALLOWED_ATTEMPTS) return "retry-budget-exceeded";

  if (request.reason === "schema-invalid-after-retry") {
    const [first, retry] = request.attempts;
    // The schema retry is authorized by a schema-invalid first response, and by nothing else.
    if (first.schemaValid) return "retry-not-authorized";
    if (retry.schemaValid) return "retry-not-spent";
    return null;
  }

  const [first, retry] = request.attempts;
  // The selector only ever sees schema-valid trees; a schema-invalid attempt here means the
  // caller mixed the two paths.
  if (!first.schemaValid || !retry.schemaValid) return "attempt-off-path";
  // The collision retry is authorized by an unresolved first attempt, and by nothing else.
  if (first.resolved) return "retry-not-authorized";
  if (retry.resolved) return "retry-not-spent";
  return null;
}

/**
 * A composition tree for a concept whose model call could not produce one.
 *
 * Returns a refusal rather than a tree unless the request's full attempt history shows the state
 * transition §3 and §5 describe: a first failure that authorized the one retry, and a retry that
 * also failed. A caller cannot reach the library on a first failure, and cannot manufacture
 * access by supplying two attempt objects that no real run could have produced. Deterministic in
 * `seed`: the same failed concept always falls back to the same page.
 *
 * @throws TypeError if `seed` is not a non-negative safe integer. That is a programming error in
 * the caller, not a contract state, so it is not one of the refusals.
 */
export function terminalFallback(request: TerminalFallbackRequest): TerminalFallbackResult {
  if (!Number.isSafeInteger(request.seed) || request.seed < 0) {
    throw new TypeError(
      `terminalFallback: seed must be a non-negative safe integer, got ${request.seed}`,
    );
  }
  const refusal = evidenceRefusal(request);
  if (refusal) return { ok: false, refusal };

  const site = A1_SITES[request.seed % A1_SITES.length];
  return {
    ok: true,
    tree: page(site.hero, site.details, site.rsvp, site.registry, site.plan, site.align),
    telemetry: {
      reason: request.reason,
      source: "library",
      seed: request.seed,
      fixtureId: site.id,
      attemptsSpent: request.attempts.length,
    },
  };
}
