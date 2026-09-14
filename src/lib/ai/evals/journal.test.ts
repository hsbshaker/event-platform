/**
 * Paid responses must survive a checker that throws.
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
  JOURNAL_FILENAME,
  readJournal,
  recordThenEvaluate,
  type JournalEntry,
} from "./journal";

function scratch(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "journal-")), JOURNAL_FILENAME);
}

const RUN = "2026-09-14T00:00:00.000Z";

const response = (caseId: string, runStartedAt = RUN): JournalEntry => ({
  caseId,
  status: "response",
  runStartedAt,
  recordedAt: "2026-09-14T00:00:00.000Z",
  payload: { identity: { creativeDirection: `brief for ${caseId}` } },
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

describe("a status never claims something untrue about the provider", () => {
  it("separates text we paid for and rejected from a call that returned nothing", () => {
    // `invalid_output` is the case that matters: the provider answered and our own validation
    // refused the answer. Filed as a provider failure it would read as "no response", and a
    // reader recovering responses would skip text that was paid for twice.
    const journal = scratch();
    appendJournal(journal, response("A"));
    appendJournal(journal, {
      caseId: "B",
      status: "unvalidated_response",
      runStartedAt: RUN,
      recordedAt: "2026-09-14T00:00:01.000Z",
      payload: { kind: "invalid_output", rawResponses: ["{bad", "{still bad"] },
    });
    appendJournal(journal, {
      caseId: "C",
      status: "no_response",
      runStartedAt: RUN,
      recordedAt: "2026-09-14T00:00:02.000Z",
      payload: { kind: "provider", message: "503", rawResponses: [] },
    });

    const { entries } = readJournal(journal);
    expect(entries.map((e) => e.status)).toEqual([
      "response",
      "unvalidated_response",
      "no_response",
    ]);
    // Paid text is recoverable from the rejected case, which is the whole point of the status.
    expect((entries[1].payload as { rawResponses: string[] }).rawResponses).toHaveLength(2);
    expect((entries[2].payload as { rawResponses: string[] }).rawResponses).toEqual([]);
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
