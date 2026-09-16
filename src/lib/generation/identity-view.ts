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
