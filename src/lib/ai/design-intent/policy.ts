/**
 * Retry and repair policy for the DesignIntent call — `docs/model-contracts.md §8`, `spec.md §32`.
 *
 * This module **encodes** the policy; it invokes nothing. There is no provider at T18 and no
 * authorisation for a live DesignIntent call before T21 (`docs/phase-4b-plan.md` Part IV, "The
 * stop point"), so what exists here is the contract execution will follow, expressed as data a
 * test can check rather than prose an implementer can misremember.
 *
 * `§8`'s row for DesignIntent, in full:
 *
 * | Provider failure | Invalid structured output | Compatibility problem |
 * | ordinary transient retry | one repair retry, then fail visibly | deterministic repair, logged |
 *
 * And `spec.md §32 #21`: structural, coverage, capability, responsive, box-depth, motif-kind and
 * fit defects are repaired deterministically and logged by kind — "re-prompt the model only for
 * schema-invalid output, a token-cap violation or a selector collision, once each". The token-cap
 * and collision clauses belong to the **composition** call; neither is reachable from a
 * DesignIntent response, which carries no tree and no selectors. So exactly one condition
 * re-prompts here, and it re-prompts once.
 *
 * `docs/phase-4b-plan.md §E` closes the remaining door: **no convergence-triggered re-prompt
 * exists in the first implementation.** Three siblings that converge are telemetry and a
 * qualitative finding, never a fourth call.
 */

/** What a caller may do about one validation issue. */
export type IssueDisposition =
  /** One repair retry quoting the validator's errors, then fail visibly (`§8`). */
  | "repair_retry_once"
  /** Deterministic repair by the compiler, logged as a deviation. Never a model call (`§32 #21`). */
  | "deterministic_repair"
  /** Neither. Reaching it means narrowing was not applied — a defect to surface, not to smooth. */
  | "fail_visibly";

/**
 * Why an issue was raised. The class decides the disposition, so a new check has to declare which
 * of the three it is rather than inheriting one by accident.
 */
export type IssueClass =
  /** Shape, unknown key, enum membership, bounds, counts, malformed JSON. */
  | "schema"
  /**
   * A value outside the sibling's assignment. Narrowing (`./narrowing.ts`) makes this
   * structurally impossible, so it is checked anyway and, if seen, is not repaired: the
   * assignment is the batch's diversity plan (`spec.md §7.7`), and quietly rewriting the model's
   * family or tone to match would produce exactly the "one idea in three costumes" batch that
   * `docs/phase-4b-plan.md §3.7`'s systemic veto exists to catch, while reporting success.
   */
  | "assignment"
  /**
   * An internally inconsistent but well-formed response — a `dominant` outside `colors`, a
   * pairing that does not hold at the hierarchy it was returned with. `§8` calls this a
   * compatibility problem and gives it deterministic repair; `src/lib/renderer/design-intent.ts`
   * already names the deviation kinds the compiler records for it.
   */
  | "compatibility";

export const DISPOSITION: Record<IssueClass, IssueDisposition> = {
  schema: "repair_retry_once",
  assignment: "fail_visibly",
  compatibility: "deterministic_repair",
};

/** `§8`: "one repair retry, then fail visibly". One, for the whole response, not per issue. */
export const MAX_REPAIR_RETRIES = 1;

/**
 * Conditions that may re-prompt the model on this call. Exactly one, and `spec.md §32 #21` is
 * why the list is written as a list: the other two it names are the composition call's.
 */
export const REPROMPT_CONDITIONS = ["schema_invalid"] as const;

/**
 * Conditions that must **never** re-prompt the model here.
 *
 * Kept as data beside `REPROMPT_CONDITIONS` so "we repaired it deterministically" and "we asked
 * the model again" cannot quietly swap places in a later change.
 */
export const NEVER_REPROMPT_CONDITIONS = [
  "assignment_mismatch",
  "palette_inconsistency",
  "typography_incompatibility",
  "sibling_convergence",
  "motif_overlap",
  "token_allotment",
] as const;
