/**
 * The binding **T21** fills, in a file of its own so that the runner never has to change.
 *
 * `tests/eval/design-intent.eval.ts` is frozen at T19, before any 4C case exists, and a sha256 of
 * that file is asserted in `design-intent.test.ts`. It has **no permitted edit at all** — the
 * lesson Phase 4B paid for was that a freeze naming "one permitted line" is not a freeze, because
 * binding the runner to an implementation also means importing it, and the import block is inside
 * the hash. So the indirection lives here instead.
 *
 * This file is **not** frozen. At T21 exactly one thing changes: the export below points at the
 * production DesignIntent boundary rather than at the refusal. Nothing else in the frozen harness
 * is touched — not the runner, not the gate, not the checks, not the artifact.
 *
 * **Why T21 and not the harness owns the call.** `docs/phase-4b-plan.md`, after "The stop point":
 * a sealed challenge is generalization evidence *about an implementation*, so the eval seam must
 * call the same production assembly the real path calls. *"A second assembly written for the
 * harness would let the set pass while production sent something else, which is the one outcome
 * that makes the whole exercise worthless."*
 *
 * It stays one binding on purpose, so what this file does is reviewable at a glance.
 */
import {
  designIntentRunnerUnavailable,
  type DesignIntentCallRunner,
} from "./design-intent-evidence";

export const designIntentRunner: DesignIntentCallRunner = designIntentRunnerUnavailable;
