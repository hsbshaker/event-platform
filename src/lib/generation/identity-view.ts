/**
 * What a browser is allowed to know about EventIdentity.
 *
 * T10's `IdentityOrchestrationResult` is already free of spend counters, claim ids, ordinals and
 * failure classification (`spec.md §32 #41`). This narrows it once more for the client, and the one
 * field it drops is the reason it exists as a separate type: `whyItMatters` is the model's own
 * rationale for asking, and `contract.ts` says in the schema itself that it is **not shown to the
 * host as written**. A field nobody renders still ships in the payload and sits in the DOM, so the
 * projection happens on the server rather than in a component that could forget.
 *
 * Deliberately **not** `server-only`: a client component imports these types.
 */
export type IdentityViewState =
  | "running"
  | "recovering"
  | "clarification_required"
  | "ready"
  | "retry_available"
  | "temporarily_unavailable"
  /**
   * Client-only. Not one of T10's states: it means the server refused for a reason no amount of
   * retrying will change — a missing configuration, or an unexpected server fault. Kept distinct
   * from `temporarily_unavailable` precisely so the surface does not tell the host to keep trying
   * when trying cannot work (`docs/phase-4b-plan.md §A.9`).
   */
  | "service_error";

export interface IdentityViewOption {
  label: string;
  /** The single `You decide` option a creative question carries. Never on a boundary question. */
  isDefer: boolean;
}

export interface IdentityViewQuestion {
  /** `creative` never gates; `boundary` does (`spec.md §7.6b`). */
  kind: "creative" | "boundary";
  /** The question index within the revision that asked it — half of the answer's locator. */
  index: number;
  question: string;
  options: IdentityViewOption[];
}

export interface IdentityView {
  state: IdentityViewState;
  hasAuthoritativeIdentity: boolean;
  /**
   * The round number the questions belong to.
   *
   * A host-facing ordinal, not a backend counter: it is what an answer is checked against so a
   * stale tab cannot answer a question that has already moved on. The revision's **id** is
   * deliberately absent — the server resolves it, so nothing client-supplied decides which
   * revision an answer binds to.
   */
  revision?: number;
  questions?: IdentityViewQuestion[];
  /** The frozen, reason-free sentence. `temporarily_unavailable` only. */
  message?: string;
}

/**
 * The longest free text a clarification answer may carry.
 *
 * Bounded for the same reason `events.prompt` is: it is rendered verbatim into the model input, so
 * an unbounded field is an unbounded request — and a request that fails or is truncated is still
 * charged at the per-attempt maximum. The prompt's own limit rather than a second invented number,
 * because it is the same kind of thing: the host's own words, going to the same model.
 *
 * Here rather than beside the server action because a `"use server"` module may export only async
 * functions.
 */
export const MAX_CLARIFICATION_FREE_TEXT = 4_000;

/** Pinned to `events.prompt`'s own limit by a test, so the two cannot drift apart silently. */

export interface ClarificationAnswer {
  questionIndex: number;
  selectedOptionLabel?: string | null;
  freeText?: string | null;
}

export interface ClarificationAnswerInput {
  eventId: string;
  /** The round the browser was showing. A stale tab answers nothing. */
  revision: number;
  /**
   * Every open question of that round, answered together.
   *
   * One submission per **round**, not per question. `spec.md §7.6b #1b` allows up to three creative
   * questions in one response, and a rerun is keyed to the whole answer set — so answering them one
   * at a time would buy one paid call per answer and lose the questions the first rerun replaced.
   */
  answers: ClarificationAnswer[];
}
