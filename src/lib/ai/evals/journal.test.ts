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

const response = (caseId: string): JournalEntry => ({
  caseId,
  status: "response",
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
    expect(recovered.map((e) => e.caseId)).toEqual(["A", "B", "C", "D"]);
    expect(recovered.every((e) => e.status === "response")).toBe(true);
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
    try {
      recordThenEvaluate(journal, response("A"), () => {
        throw new CheckerBug("boom");
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CheckerBug);
      expect((error as { kind?: string }).kind).toBeUndefined();
    }
    const recovered = readJournal(journal);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].status).toBe("response");
  });

  it("writes each case exactly once", () => {
    const journal = scratch();
    for (const id of ["A", "B", "C"]) {
      recordThenEvaluate(journal, response(id), () => undefined);
    }
    const ids = readJournal(journal).map((e) => e.caseId);
    expect(ids).toEqual(["A", "B", "C"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("distinguishes a provider failure from a paid response", () => {
    const journal = scratch();
    appendJournal(journal, response("A"));
    appendJournal(journal, {
      caseId: "B",
      status: "provider_error",
      recordedAt: "2026-09-14T00:00:01.000Z",
      payload: { kind: "provider", message: "503" },
    });
    expect(readJournal(journal).map((e) => e.status)).toEqual(["response", "provider_error"]);
  });

  it("survives a truncated final line rather than losing the whole file", () => {
    // The failure mode a rewrite-the-whole-file approach would have: one bad write destroys
    // every response already recorded. Append-per-line can only damage the last.
    const journal = scratch();
    appendJournal(journal, response("A"));
    appendJournal(journal, response("B"));
    const intact = readFileSync(journal, "utf8");
    writeFileSync(journal, `${intact}{"caseId":"C","status":"resp`);

    expect(() => readJournal(journal)).toThrow(); // the truncated line is visibly broken
    // …and the intact prefix is still recoverable by hand or by trimming the last line.
    const lines = readFileSync(journal, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).caseId).toBe("A");
    expect(JSON.parse(lines[1]).caseId).toBe("B");
  });
});
