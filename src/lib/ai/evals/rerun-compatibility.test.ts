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
 * over every frozen case and applies the frozen checker's own text predicates to the result.
 * Nothing is mocked, nothing is a provider call, and neither the corpus nor the checker moves.
 *
 * This is a compatibility test, not an implementation. The assembly branches on nothing in the
 * corpus; this file is where the two are allowed to meet.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/phase-4b-plan.md` Part IV T9.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assembleEventIdentityUserMessage } from "@/lib/ai/openai/event-identity-input";

import { corpusPath } from "./corpus";
import {
  buildSeededRevision,
  cumulativeHistory,
  seededWhyItMatters,
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
    "%s: sends no unselected option and no model-authored rationale",
    (_id, testCase) => {
      const request = requestFor(testCase);
      const history = cumulativeHistory(testCase);
      // The checker's own allowlist: a label the host or a question already used is never counted
      // against the assembly, because its presence has a legitimate source.
      const legitimate = [
        testCase.prompt,
        ...testCase.history.flatMap((round) => [
          ...round.questions.map((q) => q.question),
          ...round.answers.flatMap((a) => [a.selectedOptionLabel ?? "", a.freeText ?? ""]),
        ]),
      ];
      const resent: string[] = [];
      testCase.history.forEach((round, roundIndex) => {
        round.questions.forEach((question, questionIndex) => {
          if (request.includes(seededWhyItMatters(roundIndex + 1, questionIndex))) {
            resent.push(`r${roundIndex + 1}q${questionIndex} whyItMatters`);
          }
          for (const option of question.options) {
            if (legitimate.some((text) => text.includes(option.label))) continue;
            if (request.includes(option.label)) resent.push(`"${option.label}"`);
          }
        });
      });
      expect(resent).toEqual([]);
      // …and every carried answer does arrive, which is the other half of the same question.
      for (const answer of history) {
        if (answer.selectedOptionLabel !== null) {
          expect(request).toContain(answer.selectedOptionLabel);
        }
        const typed = answer.freeText?.trim();
        if (typed) expect(request).toContain(typed);
      }
    },
  );

  it.each(corpus.cases.map((c) => [c.id, c] as const))(
    "%s: renders every question verbatim, chronologically, with the description untouched",
    (_id, testCase) => {
      const request = requestFor(testCase);
      expect(request).toContain(testCase.prompt);
      const positions = cumulativeHistory(testCase).map((answer) => {
        const question =
          testCase.history[answer.revision - 1].questions[answer.questionIndex].question;
        return request.indexOf(question);
      });
      expect(positions.every((at) => at >= 0)).toBe(true);
      expect(positions.every((at, i) => i === 0 || at > positions[i - 1])).toBe(true);
    },
  );
});
