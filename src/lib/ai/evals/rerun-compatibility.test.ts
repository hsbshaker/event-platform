/**
 * Does the T9 assembly actually satisfy the frozen checks, on the frozen corpus?
 *
 * `menuNotResent` is an absolute check whose failure is permanent, and nothing automated protected
 * it: `prompt-leakage.test.ts` scans a case's prompt and rationale but never its option labels or
 * question texts (`docs/phase-4b-plan.md`). The T9 review closed that by hand and found no
 * collision — but a hand-check lives in a report, and the count in that report (41 labels) did not
 * match T7's inventory (42). The corpus has 42 labels, all distinct, so one was omitted.
 *
 * So the check is computed here instead of eyeballed, and kept: it runs the production assembly
 * over every frozen case and hands the result to `checkRerunCase` itself — the frozen checker,
 * unmodified, rather than a paraphrase of it. An earlier version re-implemented `menuNotResent`'s
 * predicates by hand, which graded the assembly against a copy and left `historyDelivered`'s
 * question-span masking and `answerBoundToItsQuestion` unexercised. Nothing is mocked, nothing is
 * a provider call, and neither the corpus nor the checker moves.
 *
 * What it cannot decide is the half that needs a live response: `envelopeReadable`,
 * `schemaVersionExpected`, `expectedFacts`, `noInventedFacts` and `boundaryResolves` are graded at
 * T13 against what the model returns. This asserts only that none of the five **absolute** checks
 * — the ones decided entirely from the transmitted text and the frozen case — reports `fail`.
 *
 * This is a compatibility test, not an implementation. The assembly branches on nothing in the
 * corpus; this file is where the two are allowed to meet.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/phase-4b-plan.md` Part IV T9.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assembleEventIdentityUserMessage } from "@/lib/ai/openai/event-identity-input";
import {
  EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";

import { corpusPath } from "./corpus";
import {
  buildSeededRevision,
  checkRerunCase,
  cumulativeHistory,
  type RerunCase,
  type RerunCorpus,
} from "./rerun-behaviour";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const corpus = JSON.parse(
  readFileSync(`${ROOT}${corpusPath("rerunBehaviour")}`, "utf8"),
) as RerunCorpus;

/** What the production assembly would send for a case, with no provider involved. */
function requestFor(testCase: RerunCase): string {
  return assembleEventIdentityUserMessage({
    prompt: testCase.prompt,
    priorRevisions: testCase.history.map((round, index) => ({
      revision: index + 1,
      result: buildSeededRevision(round, index + 1),
    })),
    answers: cumulativeHistory(testCase),
  });
}

describe("the T9 assembly against the frozen corpus", () => {
  it("has 42 option labels and 15 question texts, all distinct", () => {
    // The reconciliation itself: 42 total and 42 unique, so "41" was an omission from an
    // inventory rather than a total-versus-unique distinction.
    const labels = corpus.cases.flatMap((c) =>
      c.history.flatMap((r) => r.questions.flatMap((q) => q.options.map((o) => o.label))),
    );
    const questions = corpus.cases.flatMap((c) =>
      c.history.flatMap((r) => r.questions.map((q) => q.question)),
    );
    expect({ labels: labels.length, unique: new Set(labels).size }).toEqual({
      labels: 42,
      unique: 42,
    });
    expect({ questions: questions.length, unique: new Set(questions).size }).toEqual({
      questions: 15,
      unique: 15,
    });
  });

  it.each(corpus.cases.map((c) => [c.id, c] as const))(
    "%s: passes every absolute check of the frozen checker",
    (_id, testCase) => {
      const request = requestFor(testCase);
      const answers = cumulativeHistory(testCase);
      const checks = checkRerunCase(testCase, {
        caseId: testCase.id,
        promptSent: testCase.prompt,
        requestText: request,
        // The five absolute checks read none of these; they are the shape the checker requires,
        // filled with what a clean run would carry so the response-dependent checks do not throw.
        result: { suppliedFacts: {}, clarification: { needed: false, questions: [] } },
        provisional: false,
        answersAssembled: answers,
        assemblyVersion: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
        schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
      });
      const absolute = [
        "promptByteIdentical",
        "questionRenderedWithAnswer",
        "menuNotResent",
        "historyDelivered",
        "answerBoundToItsQuestion",
      ];
      const failed = checks
        .filter((check) => absolute.includes(check.name) && check.status === "fail")
        .map((check) => `${check.name}: ${check.detail}`);
      expect(failed).toEqual([]);
      // And nothing else the checker can decide from the text alone is failing either.
      expect(checks.filter((c) => c.status === "fail").map((c) => c.name)).toEqual([]);
    },
  );
});
