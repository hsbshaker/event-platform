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

import type { CaseRun } from "./report";

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

/**
 * A case that completed its provider interaction, recorded completely enough to rebuild from.
 *
 * The recovery invariant: **if deterministic evaluation or report generation crashes after a
 * case has finished talking to the provider, this entry plus the frozen corpus and code must be
 * enough to reconstruct that case faithfully, with no second model call and nothing guessed.**
 *
 * So the entry carries what `run.json` carries and nothing is left in memory: the identity of
 * the case (`caseId`) and of the corpus it belongs to (`evalSet`, `corpusVersion`), so a lone
 * journal file says which prompts to join it against; the run it came from (`runStartedAt`); and
 * a fully-built `telemetry` object rather than the raw provider `usage` it is derived from —
 * including `promptVersion` and `schemaVersion`, which live there and are deliberately not
 * duplicated at this level, because two copies of a version are two chances to disagree.
 *
 * Every field here is required, so `tsc` refuses a call site that forgets one. That is the point:
 * the previous version of this file left `payload` as `unknown`, and what a recovery would have
 * needed was whatever the caller happened to pass.
 *
 * Two exceptions, both stated rather than left for a reader to discover. The optional fields
 * inside `telemetry`, where absence is itself the record — a zero token count would be a
 * measurement nobody made. And `payload.input`, which is optional because whether it is needed
 * depends on the set: for a set whose frozen corpus determines what was sent there is nothing to
 * put there, and for one whose corpus does not, it is load-bearing and its runner is what makes
 * it mandatory. `tsc` does not enforce that second one, so a new set that assembles its input
 * must be reviewed for it.
 */
export interface JournalEntry {
  caseId: string;
  status: JournalStatus;
  /** The `startedAt` of the run that produced this entry. Makes every line attributable. */
  runStartedAt: string;
  recordedAt: string;
  /**
   * Which eval set produced this, and the corpus version it read. The set names the corpus
   * indirectly via `EVAL_SETS` — two sets share the v1 challenge corpus — so a recovery joins
   * through that map rather than treating `evalSet` as a filename.
   */
  evalSet: string;
  corpusVersion: string;
  payload: JournalResponsePayload | JournalFailurePayload;
}

/** A response the provider returned and our validation accepted. */
export interface JournalResponsePayload {
  raw: string;
  output: unknown;
  telemetry: CaseTelemetry;
  /**
   * What was actually sent, for a set whose frozen corpus does not fully determine it.
   *
   * The recovery invariant above says this entry *plus the frozen corpus and code* must be enough
   * to reconstruct the case. For `creative-understanding` that holds with nothing here: `caseId`
   * names a prompt in the corpus and that prompt is what was sent. The clarification-rerun set
   * **assembles** its input — the case prompt plus the answers given in earlier rounds — so the
   * text that went to the provider is not recoverable from the corpus alone and has to be on the
   * line. Optional rather than required because a set whose corpus does determine its input has
   * nothing to put here, and an empty object would be a record of nothing.
   *
   * `Record<string, unknown>` rather than `unknown` so a value that cannot survive
   * `JSON.stringify` is caught by the compiler rather than by the append that was supposed to
   * make the response durable.
   */
  input?: Record<string, unknown>;
}

/**
 * A case that produced no accepted output. `rawResponses` is every text the provider returned
 * and we were billed for — empty only for a `no_response` entry.
 *
 * `telemetry` is what the runner recorded at failure time. `usage` fields the provider never
 * returned stay absent rather than being filled with a placeholder: a zero token count would be
 * a measurement we did not make.
 */
export interface JournalFailurePayload {
  error: { kind: string; message: string; issues?: { path: string; message: string }[] };
  rawResponses: string[];
  telemetry: CaseTelemetry;
  /** As on the response payload: what was sent, when the corpus does not determine it. */
  input?: Record<string, unknown>;
}

type CaseTelemetry = CaseRun["telemetry"];

export interface JournalReadResult {
  entries: JournalEntry[];
  /** Lines that did not parse, by 1-based position, with the text as found. */
  corruptLines: { line: number; text: string }[];
}

/**
 * Move an existing journal out of the way before a run starts, and return where it went.
 *
 * A run's reports are truncated when it writes them; the journal is appended. Under
 * `EVAL_OVERWRITE=1` that difference would blend two runs' paid responses into one file beside
 * reports describing only one of them — evidence that misrepresents what was run. (A runner that
 * writes its reports only at the end has the second half of the same problem, which is what
 * `rotateAside` below is for.)
 *
 * Rotate rather than append, and rotate rather than delete: the displaced file was paid for.
 *
 * This used to be four lines inside the eval runner, which only executes against a live
 * provider — so the mechanism discharging that hazard could be read but never asserted. It is
 * here so it can be tested.
 */
export function rotateJournal(dir: string, runStartedAt: string): string | null {
  return rotateAside(dir, JOURNAL_FILENAME, runStartedAt);
}

/**
 * The same move for any evidence file a run would otherwise leave standing.
 *
 * The journal is the one that must never be appended into, but it is not the only file whose
 * survival can misrepresent a run. A runner that truncates its reports only at the end leaves the
 * *previous* run's completed report beside the current run's partial journal if it aborts — a
 * directory that reads as a finished run and is not one. Rotating them at the start, with the
 * journal and under the same stamp, means an aborted run leaves exactly what it produced.
 */
export function rotateAside(dir: string, filename: string, runStartedAt: string): string | null {
  const file = path.join(dir, filename);
  if (!existsSync(file)) return null;
  // Stamped with the rotating run's `startedAt` — when it was displaced, not when it was
  // written. What produced each line is `runStartedAt`, inside the file.
  const rotated = path.join(dir, `${filename}.${runStartedAt.replace(/[:.]/g, "-")}`);
  renameSync(file, rotated);
  return rotated;
}

/** What a case's entry shares regardless of how the call went. */
export interface JournalCaseContext {
  caseId: string;
  runStartedAt: string;
  evalSet: string;
  corpusVersion: string;
  recordedAt: string;
}

/**
 * Build the entry for a response our validation accepted.
 *
 * `telemetry` is the same object the run report records, passed in rather than rebuilt here, so
 * the journal and `run.json` cannot drift into describing the same case differently.
 */
export function responseEntry(
  context: JournalCaseContext,
  response: JournalResponsePayload,
): JournalEntry {
  return { ...context, status: "response", payload: response };
}

/**
 * Build the entry for a case that produced no accepted output.
 *
 * The status is decided by what was actually returned, never by the error's `kind`: a provider
 * failure on the repair attempt follows a first response that was returned and billed, and
 * calling that `no_response` would assert the provider never answered.
 */
export function failureEntry(
  context: JournalCaseContext,
  failure: JournalFailurePayload,
): JournalEntry {
  return {
    ...context,
    status: failure.rawResponses.length > 0 ? "unvalidated_response" : "no_response",
    payload: failure,
  };
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
