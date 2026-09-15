/**
 * The binding T9 fills, in a file of its own so that the runner never has to change.
 *
 * `tests/eval/clarification-rerun.eval.ts` froze at T5, before its validation cases existed, and
 * a sha256 of that file is asserted in `rerun-behaviour.test.ts`. The first version of that freeze
 * named one permitted exception — the line binding `run` — which could not actually be honoured:
 * binding `run` to a T9 implementation means importing it, and the import block is inside the
 * hash. The guaranteed outcome was a hash someone updates at T9, which is a freeze you edit when
 * you mean to, not a freeze.
 *
 * So the indirection moves here instead. This file is not frozen; the runner is, absolutely, with
 * no exception to state and none to argue about later. At T9 exactly one thing changes: the
 * export below points at the real assembly rather than at the refusal.
 *
 * What must remain true when it does: the export keeps its name and its `RerunCallRunner` type,
 * and nothing else is added to this file. The annotation is what makes the second half of that a
 * compiler rule rather than a promise — a bare re-export would let a loosely typed T9 module make
 * `outcome.requestText` an `any`, and then `answerBoundToItsQuestion` throws mid-run on a set that
 * runs once, or journals `undefined` as what was transmitted.
 */
import { rerunRunnerUnavailable, type RerunCallRunner } from "./rerun-behaviour";

export const rerunRunner: RerunCallRunner = rerunRunnerUnavailable;
