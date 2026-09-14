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
 *   evidence must not confuse them.
 *
 * And what it does about partial runs, stated with its actual condition rather than as an
 * unconditional guarantee: `run.json` is written only on a clean finish, so a directory holding
 * a journal and no `run.json` is visibly an aborted run. That signal is only as good as the
 * runner's refusal to write into a directory that already holds evidence — and `EVAL_OVERWRITE=1`
 * exists to override exactly that refusal. So every entry also carries `runStartedAt`, and the
 * runner rotates any existing journal aside rather than appending to it: two runs can never
 * blend into one file, and if they somehow did, the entries would still be attributable.
 *
 * JSONL append, one line per case: a crash mid-write can corrupt at most the final line, never
 * a response already recorded — and `readJournal` returns the intact entries alongside the
 * damaged lines rather than refusing the whole file, so that property is real for a reader and
 * not only for the bytes.
 */
import { appendFileSync, existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";

export const JOURNAL_FILENAME = "raw-responses.jsonl";

/**
 * What the provider actually did, named so that no status asserts something untrue.
 *
 * `unvalidated_response` is the one worth spelling out: the provider returned text — paid for,
 * sometimes twice, once for the original call and once for the repair retry — and our own
 * deterministic validation did not accept it. Calling that a provider error would claim the
 * call never produced output, which is false, and would make a recovery reader filtering on
 * `response` skip text we paid for.
 *
 * `no_response` is the complement and means exactly what it says: nothing was returned for this
 * case, so there is no paid text to keep. It is decided by what the error carries, not by its
 * kind — a provider failure on the repair attempt still has the first response.
 */
export type JournalStatus = "response" | "unvalidated_response" | "no_response";

export interface JournalEntry {
  caseId: string;
  status: JournalStatus;
  /** The `startedAt` of the run that produced this entry. Makes every line attributable. */
  runStartedAt: string;
  recordedAt: string;
  payload: unknown;
}

export interface JournalReadResult {
  entries: JournalEntry[];
  /** Lines that did not parse, by 1-based position, with the text as found. */
  corruptLines: { line: number; text: string }[];
}

/**
 * Move an existing journal out of the way before a run starts, and return where it went.
 *
 * The three reports are truncated on each run; the journal is appended. Under `EVAL_OVERWRITE=1`
 * that difference would blend two runs' paid responses into one file beside a `run.json`
 * describing only one of them — evidence that misrepresents what was run.
 *
 * Rotate rather than append, and rotate rather than delete: the displaced file was paid for. It
 * lives in the eval runner's path, which only executes against a live provider, so it is here
 * instead — the mechanism that discharges that hazard should be asserted, not read.
 */
export function rotateJournal(dir: string, runStartedAt: string): string | null {
  const journal = path.join(dir, JOURNAL_FILENAME);
  if (!existsSync(journal)) return null;
  // Stamped with the rotating run's `startedAt` — when it was displaced, not when it was
  // written. What produced each line is `runStartedAt`, inside the file.
  const rotated = path.join(dir, `${JOURNAL_FILENAME}.${runStartedAt.replace(/[:.]/g, "-")}`);
  renameSync(journal, rotated);
  return rotated;
}

export function appendJournal(journalPath: string, entry: JournalEntry): void {
  appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * Read back what survived.
 *
 * A malformed line — the truncated tail of a crashed write — costs that line and nothing else.
 * An all-or-nothing reader would have let one bad line make every intact response unreadable,
 * which is the failure the append-per-line format exists to avoid; a reader that then refuses
 * the file gives the property back with one hand and takes it with the other.
 */
export function readJournal(journalPath: string): JournalReadResult {
  const result: JournalReadResult = { entries: [], corruptLines: [] };
  if (!existsSync(journalPath)) return result;

  const lines = readFileSync(journalPath, "utf8").split("\n");
  lines.forEach((text, index) => {
    if (text.trim().length === 0) return;
    try {
      result.entries.push(JSON.parse(text) as JournalEntry);
    } catch {
      result.corruptLines.push({ line: index + 1, text });
    }
  });
  return result;
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
