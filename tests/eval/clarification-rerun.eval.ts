/**
 * The Phase 4B rerun-behaviour validation runner — prewired while its cases do not exist.
 *
 * This file is complete before the corpus is authored, which is the whole point. Its paths, its
 * refusals, its checker, its report shape and its acceptance criteria are frozen at T5; the cases
 * are written afterwards by someone who implemented none of it (T6), reviewed (T7) and frozen at
 * their own input SHA (T8). A harness written after the cases would be one whose author knew what
 * it had to grade.
 *
 * **`npm run eval:rerun-behaviour` refuses today**, twice over and both times at module scope,
 * before an API key is read, before a client is constructed, and a very long way before a request:
 * the corpus does not exist, and neither does the T9 input assembly this set exercises.
 *
 * **The one permitted post-freeze edit to this file** is the single line binding `run` to T9's
 * implementation of `RerunCallRunner`, in place of `rerunRunnerUnavailable`. Nothing else here
 * moves — not a path, not a refusal, not a check, not a criterion — and `rerun-behaviour.test.ts`
 * asserts that the line is the only seam. Saying so plainly is better than claiming "adding the
 * corpus is the entire change" when one line of a frozen file must also change; a freeze whose
 * terms are slightly untrue is worse than one with a named exception.
 *
 * It is never run to verify itself. `docs/model-evals/eval-incidents.md`: "Never execute the eval
 * runner to verify the harness. Not its paths, not its guards, not its schemas, not its reports,
 * not its refusals." `src/lib/ai/evals/rerun-behaviour.test.ts` asserts every property of this
 * file statically, from its source text and from the pure module beside it.
 *
 * Evidence class: **pre-registered validation evidence for the clarification-answer input
 * shape/lifecycle — NOT fresh generalization evidence for EventIdentity v5 and NOT a replacement
 * for the spent v5 sealed challenge.**
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EVAL_SETS, isProtectedOutput } from "@/lib/ai/evals/corpus";
import { isProvisional } from "@/lib/ai/event-identity/lifecycle";
import { JOURNAL_FILENAME } from "@/lib/ai/evals/journal";
import {
  buildRerunReviewArtifact,
  checkRerunCase,
  mechanicalPass,
  RERUN_ACCEPTANCE,
  rerunRunnerUnavailable,
  validateRerunCorpusShape,
  type RerunCase,
  type RerunCorpus,
  type RerunObservation,
} from "@/lib/ai/evals/rerun-behaviour";

const ROOT = new URL("../../", import.meta.url).pathname;

/** No default, for the same reason the creative-understanding runner has none. */
const SET = process.env.EVAL_SET as keyof typeof EVAL_SETS | undefined;
if (!SET || !Object.hasOwn(EVAL_SETS, SET)) {
  throw new Error(
    `EVAL_SET must be set explicitly to one of ${Object.keys(EVAL_SETS).join(", ")}. ` +
      "Use one of the `npm run eval:*` scripts; this run costs money and writes evidence, so it " +
      "never starts by accident.",
  );
}

/** A set belongs to exactly one runner, declared beside the set. */
if (EVAL_SETS[SET].runner !== "clarification-rerun") {
  throw new Error(
    `EVAL_SET=${SET} belongs to the ${EVAL_SETS[SET].runner} runner, not this one. ` +
      "No provider call is made.",
  );
}

const CORPUS = path.join(ROOT, EVAL_SETS[SET].corpus);
const OUT = path.join(ROOT, EVAL_SETS[SET].out);

/** Evidence that already exists is refused as an output, whatever `EVAL_SET` says. */
if (isProtectedOutput(EVAL_SETS[SET].out)) {
  throw new Error(
    `refusing to write over ${EVAL_SETS[SET].out}: that path holds, or sits above, a completed ` +
      "run's evidence. Point the set at a directory of its own.",
  );
}

/**
 * The corpus has to exist. It deliberately does not yet: T4 froze this machinery, and only then
 * are the cases authored (T6–T8). Adding the file is the entire change.
 */
if (!existsSync(CORPUS)) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} does not exist, so EVAL_SET=${SET} cannot run. ` +
      "No provider call is made. Its cases are authored independently after this harness froze, " +
      "and nothing else needs to change when they land.",
  );
}

/** Evidence is written once. This set is one-shot by construction. */
if (existsSync(OUT) && process.env.EVAL_OVERWRITE !== "1") {
  throw new Error(
    `${path.relative(ROOT, OUT)} already holds evidence from a previous run. ` +
      `Move it aside — it may contain ${JOURNAL_FILENAME}, the paid provider responses, which ` +
      "deleting destroys — or set EVAL_OVERWRITE=1 if replacing the reports is what you mean.",
  );
}

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as RerunCorpus;
const shapeProblems = validateRerunCorpusShape(corpus);
if (shapeProblems.length > 0) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} does not satisfy the frozen corpus contract:\n  ` +
      shapeProblems.join("\n  ") +
      "\n\nThe contract was frozen before these cases existed. Fix the corpus, never the " +
      "contract (docs/phase-4b-plan.md §3.9).",
  );
}

describe(`${SET}: ${EVAL_SETS[SET].label}`, () => {
  it("runs every case and records what happened", async () => {
    mkdirSync(OUT, { recursive: true });

    // T9 supplies the assembly. Until it does, this throws with an explanation rather than
    // silently exercising a code path that does not exist.
    const run = rerunRunnerUnavailable;

    const observations: RerunObservation[] = [];
    const rows: string[] = [];

    for (const testCase of corpus.cases as RerunCase[]) {
      const observed: RerunObservation = {
        caseId: testCase.id,
        promptsSent: [],
        assemblyVersions: [],
        results: [],
        provisional: [],
        answersAssembled: [],
        schemaVersions: [],
      };
      for (const round of testCase.rounds) {
        const outcome = await run({ prompt: testCase.prompt, answers: round.answers });
        observed.promptsSent.push(outcome.promptSent);
        observed.assemblyVersions.push(outcome.assemblyVersion);
        observed.results.push(outcome.result);
        observed.schemaVersions.push(outcome.schemaVersion);
        observed.answersAssembled.push(outcome.answersAssembled);
        // Asked of the lifecycle module, never assumed. Pushing a literal `false` here would make
        // `boundaryResolves` report "the final round is authoritative" about a round that still
        // carried a boundary question — the committed evidence asserting the opposite of what
        // happened, for the one dimension that check exists to measure.
        observed.provisional.push(isProvisional(outcome.result, outcome.schemaVersion));
      }
      const checks = checkRerunCase(testCase, observed);
      observations.push(observed);
      rows.push(
        `| ${testCase.id} | ${mechanicalPass(checks) ? "pass" : "FAIL"} | ` +
          checks.map((c) => `${c.name}:${c.status}`).join(", ") +
          " |",
      );
    }

    writeFileSync(
      path.join(OUT, "mechanical-report.md"),
      [
        "# Clarification rerun behaviour — mechanical report",
        "",
        `Evidence class: **${RERUN_ACCEPTANCE.evidenceClass}**`,
        ...RERUN_ACCEPTANCE.notes.map((note) => `- ${note}`),
        "",
        "| Case | Mechanical | Checks |",
        "| --- | --- | --- |",
        ...rows,
        "",
        `Mechanical criterion: ${RERUN_ACCEPTANCE.mechanical}`,
        "",
        `Qualitative criterion: ${RERUN_ACCEPTANCE.qualitative}`,
      ].join("\n"),
      "utf8",
    );

    writeFileSync(
      path.join(OUT, "blind-review.md"),
      buildRerunReviewArtifact(observations),
      "utf8",
    );

    expect(observations).toHaveLength(corpus.cases.length);
  });
});
