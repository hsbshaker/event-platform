/**
 * Paid responses must survive a checker that throws, and must survive it completely enough to
 * rebuild the evidence from.
 *
 * The scenario this reproduces is the one that made the guarantee necessary: several successful
 * model calls, then a bug in our own deterministic code. Before the journal, the run aborted
 * before `run.json` existed and every paid response was lost — unrecoverable on a one-shot
 * sealed challenge, and a rerun of real model calls purely because our code crashed.
 *
 * Acceptance criteria: N/A — evidence durability. `docs/model-contracts.md §4.5`.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendJournal,
  failureEntry,
  JOURNAL_FILENAME,
  readJournal,
  recordThenEvaluate,
  responseEntry,
  rotateJournal,
  type JournalCaseContext,
  type JournalEntry,
  type JournalFailurePayload,
  type JournalResponsePayload,
} from "./journal";
import type { CaseRun } from "./report";

function scratch(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "journal-")), JOURNAL_FILENAME);
}

const RUN = "2026-09-14T00:00:00.000Z";

const context = (caseId: string, runStartedAt = RUN): JournalCaseContext => ({
  caseId,
  runStartedAt,
  evalSet: "challenge",
  corpusVersion: "1.0.0",
  recordedAt: "2026-09-14T00:00:00.000Z",
});

/** What the runner records for a call that validated. */
const successTelemetry: CaseRun["telemetry"] = {
  model: "gpt-5.6-sol",
  promptVersion: "v4",
  schemaVersion: "1",
  latencyMs: 8213,
  transientRetries: 0,
  repairRetries: 0,
  schemaValidFirstCall: true,
  inputTokens: 1840,
  cachedInputTokens: 1536,
  outputTokens: 742,
  reasoningTokens: 410,
  providerRequestId: "resp_abc123",
};

const response = (caseId: string, runStartedAt = RUN): JournalEntry =>
  responseEntry(context(caseId, runStartedAt), {
    raw: `{"identity":{"creativeDirection":"brief for ${caseId}"}}`,
    output: { identity: { creativeDirection: `brief for ${caseId}` } },
    telemetry: successTelemetry,
  });

class CheckerBug extends Error {}

describe("paid responses survive a checker that throws", () => {
  it("keeps every response recorded before the throwing case", () => {
    const journal = scratch();
    const evaluated: string[] = [];

    const run = () => {
      for (const id of ["A", "B", "C", "D"]) {
        recordThenEvaluate(journal, response(id), () => {
          // The bug lands on the fourth case, after three were paid for.
          if (id === "D") throw new CheckerBug("checker blew up");
          evaluated.push(id);
        });
      }
    };

    expect(run).toThrow(CheckerBug);
    expect(evaluated).toEqual(["A", "B", "C"]);

    // All four are durable: the fourth response was paid for too, and was journaled before
    // the checker ever saw it.
    const recovered = readJournal(journal);
    expect(recovered.entries.map((e) => e.caseId)).toEqual(["A", "B", "C", "D"]);
    expect(recovered.entries.every((e) => e.status === "response")).toBe(true);
    expect(recovered.corruptLines).toEqual([]);
  });

  it("propagates the checker's own exception rather than swallowing it", () => {
    const journal = scratch();
    expect(() =>
      recordThenEvaluate(journal, response("A"), () => {
        throw new CheckerBug("boom");
      }),
    ).toThrow(CheckerBug);
  });

  it("does not relabel a checker failure as a provider failure", () => {
    // The two are different kinds of broken. A checker bug recorded as a model failure would
    // put a lie in evidence that is meant to be immutable.
    const journal = scratch();
    // Captured rather than asserted inside a `catch`: a `catch` that never runs would let this
    // test pass by not executing its own assertions.
    let thrown: unknown;
    try {
      recordThenEvaluate(journal, response("A"), () => {
        throw new CheckerBug("boom");
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CheckerBug);

    const recovered = readJournal(journal);
    expect(recovered.entries).toHaveLength(1);
    expect(recovered.entries[0].status).toBe("response");
  });

  it("writes each case exactly once", () => {
    const journal = scratch();
    for (const id of ["A", "B", "C"]) {
      recordThenEvaluate(journal, response(id), () => undefined);
    }
    const ids = readJournal(journal).entries.map((e) => e.caseId);
    expect(ids).toEqual(["A", "B", "C"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a completed provider interaction can be reconstructed from the journal alone", () => {
  /**
   * The recovery invariant, exercised rather than asserted in prose: read one line back off
   * disk and rebuild the `CaseRun` a report would have been written from, using nothing but
   * that line. `tsc` is doing half the work here — `CaseRun` is the production type, so a
   * telemetry field the journal fails to carry makes this file stop compiling.
   *
   * What is deliberately *not* reconstructed is `caseData` and `evaluation`: the corpus is
   * frozen and joined on `caseId`, and the evaluation is deterministic over the output. Those
   * are the "plus the frozen corpus and code" half of the invariant.
   */
  function rebuild(entry: JournalEntry): Omit<CaseRun, "caseData" | "evaluation"> {
    if (entry.status === "response") {
      const payload = entry.payload as JournalResponsePayload;
      return { result: payload.output as CaseRun["result"], telemetry: payload.telemetry };
    }
    const payload = entry.payload as JournalFailurePayload;
    return { error: payload.error, telemetry: payload.telemetry };
  }

  it("carries everything a successful case's evidence needs", () => {
    const journal = scratch();
    appendJournal(journal, response("HO-01"));

    const [entry] = readJournal(journal).entries;
    const payload = entry.payload as JournalResponsePayload;

    // Identity: which case, which corpus at which version, which run.
    expect(entry.caseId).toBe("HO-01");
    expect(entry.evalSet).toBe("challenge");
    expect(entry.corpusVersion).toBe("1.0.0");
    expect(entry.runStartedAt).toBe(RUN);

    // The raw text and the validated output are both kept: the report needs the output, and
    // the raw is the only record of what the provider actually sent.
    expect(payload.raw).toContain("creativeDirection");
    expect(payload.output).toEqual({ identity: { creativeDirection: "brief for HO-01" } });

    // Versions live in telemetry, once, so two copies cannot disagree.
    expect(payload.telemetry.promptVersion).toBe("v4");
    expect(payload.telemetry.schemaVersion).toBe("1");
    expect(rebuild(entry).telemetry).toEqual(successTelemetry);
  });

  it("carries everything an invalid-output case needs, after the repair retry", () => {
    // Two responses returned and billed; validation refused both. The issues are what a report
    // would print, and they are gone from memory the moment the run dies.
    const journal = scratch();
    const payload: JournalFailurePayload = {
      error: {
        kind: "invalid_output",
        message: "Event Identity output failed validation after the single repair retry.",
        issues: [{ path: "identity.toneKeywords", message: "expected array" }],
      },
      rawResponses: ['{"identity":{"toneKeywords":"warm"}}', '{"identity":{"toneKeywords":null}}'],
      telemetry: {
        model: "gpt-5.6-sol",
        promptVersion: "v4",
        schemaVersion: "1",
        latencyMs: 14_902,
        transientRetries: 0,
        repairRetries: 1,
        schemaValidFirstCall: false,
      },
    };
    appendJournal(journal, failureEntry(context("HO-02"), payload));

    const [entry] = readJournal(journal).entries;
    expect(entry.status).toBe("unvalidated_response");
    const rebuilt = rebuild(entry);
    expect(rebuilt.error?.kind).toBe("invalid_output");
    expect(rebuilt.error?.issues).toEqual([
      { path: "identity.toneKeywords", message: "expected array" },
    ]);
    expect(rebuilt.telemetry.repairRetries).toBe(1);
    // Both paid texts, in order, so the recovery has what we were billed for.
    expect((entry.payload as JournalFailurePayload).rawResponses).toHaveLength(2);
  });

  it("carries the first paid response when the repair attempt never reached the provider", () => {
    // The failure is a provider failure, but a response had already arrived and been billed.
    // The status must follow what was returned, not what the error is called.
    const journal = scratch();
    const payload: JournalFailurePayload = {
      error: { kind: "provider", message: "OpenAI request failed: 500" },
      rawResponses: ['{"identity":{"toneKeywords":"warm"}}'],
      telemetry: {
        model: "gpt-5.6-sol",
        promptVersion: "v4",
        schemaVersion: "1",
        latencyMs: 31_004,
        transientRetries: 2,
        repairRetries: 1,
        schemaValidFirstCall: false,
      },
    };
    appendJournal(journal, failureEntry(context("HO-03"), payload));

    const [entry] = readJournal(journal).entries;
    expect(entry.status).toBe("unvalidated_response");
    expect(rebuild(entry).error?.kind).toBe("provider");
    expect((entry.payload as JournalFailurePayload).rawResponses).toEqual([
      '{"identity":{"toneKeywords":"warm"}}',
    ]);
    expect(rebuild(entry).telemetry.transientRetries).toBe(2);
  });

  it("records a true no-response failure as one, without inventing what was not returned", () => {
    const journal = scratch();
    const payload: JournalFailurePayload = {
      error: { kind: "provider", message: "OpenAI request failed: 503" },
      rawResponses: [],
      telemetry: {
        model: "gpt-5.6-sol",
        promptVersion: "v4",
        schemaVersion: "1",
        latencyMs: 30_112,
        transientRetries: 2,
        repairRetries: 0,
        schemaValidFirstCall: false,
      },
    };
    appendJournal(journal, failureEntry(context("HO-04"), payload));

    const [entry] = readJournal(journal).entries;
    expect(entry.status).toBe("no_response");
    const rebuilt = rebuild(entry);
    expect((entry.payload as JournalFailurePayload).rawResponses).toEqual([]);
    // Token counts the provider never reported stay absent. A zero would be a measurement we
    // did not make, and a report reading it back would print a number nobody observed.
    expect(rebuilt.telemetry.inputTokens).toBeUndefined();
    expect(rebuilt.telemetry.outputTokens).toBeUndefined();
    expect(rebuilt.telemetry.providerRequestId).toBeUndefined();
  });

  it("survives the JSON round trip that the file format imposes", () => {
    // Everything above would still pass if the entry never reached disk. This is the one that
    // proves the recovery-critical fields are JSON-serializable rather than live objects.
    const journal = scratch();
    const entry = response("HO-05");
    appendJournal(journal, entry);
    expect(readJournal(journal).entries[0]).toEqual(JSON.parse(JSON.stringify(entry)));
  });
});

describe("a status never claims something untrue about the provider", () => {
  it("decides from what was returned, not from the error's kind", () => {
    // `failureEntry` is the only place this decision is made, which is why it is asserted here
    // rather than read in the runner, where it would execute only against a live provider.
    const telemetry: CaseRun["telemetry"] = {
      model: "gpt-5.6-sol",
      promptVersion: "v4",
      schemaVersion: "1",
      latencyMs: 1,
      transientRetries: 0,
      repairRetries: 0,
      schemaValidFirstCall: false,
    };
    const withText = failureEntry(context("A"), {
      error: { kind: "provider", message: "500" },
      rawResponses: ["{}"],
      telemetry,
    });
    const without = failureEntry(context("B"), {
      error: { kind: "invalid_output", message: "failed validation" },
      rawResponses: [],
      telemetry,
    });

    // Same `kind`, opposite statuses; opposite `kind`, same discriminator.
    expect(withText.status).toBe("unvalidated_response");
    expect(without.status).toBe("no_response");
  });
});

describe("entries stay attributable to their run", () => {
  it("carries the run's startedAt on every line", () => {
    const journal = scratch();
    recordThenEvaluate(journal, response("A"), () => undefined);
    expect(readJournal(journal).entries[0].runStartedAt).toBe(RUN);
  });

  it("makes two runs' entries distinguishable if they ever share a file", () => {
    // The runner rotates an existing journal aside rather than appending, so this should not
    // happen. If it does — a copied file, a hand-merged directory — duplicate case ids must
    // still be separable rather than silently reading as one run.
    const journal = scratch();
    appendJournal(journal, response("A", "2026-09-14T00:00:00.000Z"));
    appendJournal(journal, response("A", "2026-09-15T00:00:00.000Z"));

    const { entries } = readJournal(journal);
    expect(entries.map((e) => e.caseId)).toEqual(["A", "A"]);
    expect(new Set(entries.map((e) => e.runStartedAt)).size).toBe(2);
  });
});

describe("a new run never appends into the previous run's journal", () => {
  it("moves the existing journal aside and starts empty", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "journal-"));
    const journal = path.join(dir, JOURNAL_FILENAME);
    appendJournal(journal, response("A"));
    appendJournal(journal, response("B"));

    const rotated = rotateJournal(dir, "2026-09-15T12:30:00.000Z");
    expect(rotated).not.toBeNull();
    // Nothing is destroyed: the displaced file was paid for.
    expect(readJournal(rotated as string).entries.map((e) => e.caseId)).toEqual(["A", "B"]);
    // And the run that follows writes into an empty journal, so the two cannot blend.
    expect(readJournal(journal).entries).toEqual([]);

    appendJournal(journal, response("A", "2026-09-15T12:30:00.000Z"));
    expect(readJournal(journal).entries.map((e) => e.caseId)).toEqual(["A"]);
  });

  it("does nothing, and says so, when there is no journal to move", () => {
    expect(rotateJournal(mkdtempSync(path.join(tmpdir(), "journal-")), RUN)).toBeNull();
  });

  it("names the rotated file distinctly per rotating run", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "journal-"));
    const journal = path.join(dir, JOURNAL_FILENAME);

    appendJournal(journal, response("A"));
    const first = rotateJournal(dir, "2026-09-15T12:30:00.000Z");
    appendJournal(journal, response("B"));
    const second = rotateJournal(dir, "2026-09-16T09:00:00.000Z");

    // A third run must not clobber what the second displaced.
    expect(first).not.toBe(second);
    expect(readJournal(first as string).entries.map((e) => e.caseId)).toEqual(["A"]);
    expect(readJournal(second as string).entries.map((e) => e.caseId)).toEqual(["B"]);
    // No colons or dots from the timestamp survive into the filename.
    expect(path.basename(second as string)).toBe(`${JOURNAL_FILENAME}.2026-09-16T09-00-00-000Z`);
  });
});

describe("a damaged line costs that line and nothing else", () => {
  it("returns the intact entries and reports the truncated tail", () => {
    // The failure mode a rewrite-the-whole-file approach would have: one bad write destroys
    // every response already recorded. Append-per-line can only damage the last — but only if
    // the reader hands back what survived instead of refusing the file.
    const journal = scratch();
    appendJournal(journal, response("A"));
    appendJournal(journal, response("B"));
    const intact = readFileSync(journal, "utf8");
    writeFileSync(journal, `${intact}{"caseId":"C","status":"resp`);

    const { entries, corruptLines } = readJournal(journal);
    expect(entries.map((e) => e.caseId)).toEqual(["A", "B"]);
    expect(corruptLines).toHaveLength(1);
    expect(corruptLines[0].line).toBe(3);
    expect(corruptLines[0].text).toContain('"caseId":"C"');
  });

  it("is empty, not an error, when no journal was ever written", () => {
    expect(readJournal(scratch())).toEqual({ entries: [], corruptLines: [] });
  });
});
