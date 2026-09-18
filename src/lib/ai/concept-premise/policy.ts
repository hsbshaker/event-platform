/**
 * Retry and repair policy for the ConceptPremise call.
 *
 * This is the **one** bounded repair layer the remediation adds, and it is placed here rather than
 * at the DesignIntent stage on purpose.
 *
 * `spec.md §32 #21` requires structural, coverage and diversity defects to be repaired
 * deterministically and logged, and permits re-prompting only for schema-invalid output, a
 * token-cap violation or a selector collision — the last two belonging to the composition call.
 * `docs/phase-4b-plan.md §E` adds that *no convergence-triggered re-prompt exists* at the
 * DesignIntent stage. Neither of those is relaxed: the DesignIntent call keeps exactly the policy
 * it has, one pass for schema-invalid output and no convergence re-prompt of any kind.
 *
 * What the T22 data changed is that there is now an **earlier** stage whose whole output is the
 * creative distinction between three concepts, whose response is three short objects rather than a
 * design, and whose defects are decidable deterministically before a single design is paid for.
 * Asking that stage again, once, with the validator's own findings quoted, is the cheapest place in
 * the pipeline to correct a collapsed set — and it is the only place this remediation adds a pass.
 *
 * | class | what happens | model passes it may open |
 * | --- | --- | --- |
 * | `schema` | one repair pass, then fail visibly | 1 |
 * | `set` | one repair pass, then fail visibly | 1 |
 * | `fidelity` | one repair pass, then fail visibly | 1 |
 *
 * **One pass for the whole response, not one per class and not one per issue.** A second pass is
 * not reachable: `MAX_REPAIR_RETRIES` is 1, the boundary counts passes rather than issues, and
 * `./validate.ts` returns every issue at once so a single correction turn can address all of them.
 *
 * # Why a failure is visible rather than degraded
 *
 * When the premise set cannot be made legal, the batch fails. It does **not** fall back to sending
 * three DesignIntent calls without premises.
 *
 * That fallback is tempting and it is refused deliberately. `spec.md §7.10 #5` and
 * `docs/phase-4b-plan.md §I` already settle the shape of this trade — *"fewer than three concepts
 * is a visible state, never three where one is fabricated"* — and three concepts generated from a
 * set the system has just proved collapsed is the known-defective output T22 measured. A silent
 * reversion to it would be invisible in exactly the place this project has already been burned:
 * *"A repair table that quietly did nothing for a defect it did not recognise would be the silent
 * fallback this boundary exists not to have."* The host's route out of a failed batch already
 * exists and is `spec.md §7.9`'s `Try another direction`.
 *
 * The cost is stated rather than hidden: a premise stage that refuses can cost a host a batch. That
 * is why `./validate.ts`'s thresholds are set to catch collapse rather than adjacency, and why the
 * one gating set-level rule is stated over the register axes, which cannot be unsatisfiable.
 */

/** What a caller may do about one issue. Same three words the DesignIntent policy uses. */
export type PremiseIssueDisposition = "repair_retry_once" | "fail_visibly";

/**
 * Why an issue was raised.
 *
 * Three classes, and the split is not cosmetic: `fidelity` is the class that protects correctness
 * over diversity, so it is reported separately from the distinctness class it must outrank when a
 * human reads a failed run.
 */
export type PremiseIssueClass =
  /** Shape, unknown key, enum membership, bounds, counts, malformed JSON. */
  | "schema"
  /**
   * The three premises are legal individually and are not three choices: duplicate titles,
   * restated organizing ideas, a register the set never separates on, or a declared axis
   * constraint the set does not actually honour.
   */
  | "set"
  /**
   * A premise is not supported by the brief: grounding that is not anchored in it, a specific the
   * brief does not carry, a colour value this stage has no business naming, or an excluded colour
   * the brief never mentioned. **This class exists to outrank distinctness.** One correct concept
   * plus two imaginative unsupported ones is a worse system than three that converge.
   */
  | "fidelity";

export const PREMISE_DISPOSITION: Record<PremiseIssueClass, PremiseIssueDisposition> = {
  schema: "repair_retry_once",
  set: "repair_retry_once",
  fidelity: "repair_retry_once",
};

/** One repair pass for the whole response, then fail visibly. */
export const MAX_REPAIR_RETRIES = 1;

/**
 * Which class a reader should be told about first, when a response carries more than one.
 *
 * `fidelity` outranks `set` because a set that is unsupported is not made acceptable by being
 * distinct, and a run that failed on both must not be reported as a diversity problem.
 */
export const PREMISE_CLASS_PRECEDENCE: readonly PremiseIssueClass[] = ["fidelity", "set", "schema"];

/** Conditions that may re-prompt this call. All three classes, once, for the whole response. */
export const REPROMPT_CONDITIONS = [
  "schema_invalid",
  "set_collapsed",
  "unsupported_premise",
] as const;

/**
 * Conditions that must never re-prompt a model anywhere in this pipeline.
 *
 * Kept as data beside `REPROMPT_CONDITIONS`, exactly as the DesignIntent policy does, so that
 * "we repaired it deterministically" and "we asked the model again" cannot quietly swap places in
 * a later change. The first four are the DesignIntent stage's, restated here because this is the
 * module a reader arrives at when asking whether the remediation added a critic loop. It did not.
 */
export const NEVER_REPROMPT_CONDITIONS = [
  "design_intent_sibling_convergence",
  "design_intent_motif_overlap",
  "design_intent_palette_proximity",
  "design_intent_card_duplication",
  "premise_not_expressed_by_design_intent",
] as const;
