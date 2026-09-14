/**
 * A paid provider response is durable the moment it arrives.
 *
 * The invariant: **once a provider response has successfully returned, it must remain
 * recoverable even if deterministic evaluation or report generation subsequently throws.**
 *
 * Before this existed, `run.json` was written only after the whole loop finished, so a checker
 * bug on case nine destroyed the eight responses already paid for. On a one-shot sealed
 * challenge that is unrecoverable — and it would force a rerun of model calls purely because
 * our own deterministic code crashed, which is both expensive and, for a one-shot set, fatal to
 * the evidence.
 *
 * What this deliberately does **not** do:
 *
 * - it does not catch the checker's exception. A checker bug must still fail the run loudly;
 * - it does not relabel one as a provider failure. They are different kinds of broken and the
 *   evidence must not confuse them;
 * - it does not let a partial run look complete. The journal is written per case; `run.json` is
 *   written only on a clean finish, so a directory holding a journal and no `run.json` is
 *   visibly an aborted run, and the runner's existing guard refuses to overwrite it.
 *
 * JSONL append, one line per case: a crash mid-write can corrupt at most the final line, never
 * a response already recorded.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

export const JOURNAL_FILENAME = "raw-responses.jsonl";

export interface JournalEntry {
  caseId: string;
  /** `response` is a paid provider output. `provider_error` is a call that never produced one. */
  status: "response" | "provider_error";
  recordedAt: string;
  payload: unknown;
}

export function appendJournal(journalPath: string, entry: JournalEntry): void {
  appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function readJournal(journalPath: string): JournalEntry[] {
  if (!existsSync(journalPath)) return [];
  return readFileSync(journalPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JournalEntry);
}

/**
 * Record the response, then evaluate it — in that order, and never the other way round.
 *
 * `evaluate` runs outside any try/catch here on purpose: whatever it throws propagates to the
 * caller unchanged, so a checker bug surfaces as itself rather than as a model failure. By the
 * time it can throw, the paid response is already on disk.
 */
export function recordThenEvaluate<T>(
  journalPath: string,
  entry: JournalEntry,
  evaluate: () => T,
): T {
  appendJournal(journalPath, entry);
  return evaluate();
}
