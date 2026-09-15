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
 * **Nothing in this file may change after T5 — not one line, and no exception.** That is enforced
 * rather than asserted: `rerun-behaviour.test.ts` hashes the whole file and fails if a byte moves.
 *
 * An earlier version of this freeze named one exception, the line binding `run`. It could not be
 * honoured: binding `run` to T9's implementation means importing it, and the import block is
 * inside the hash, so the hash would have had to be updated at T9 — a freeze you edit when you
 * mean to. The binding lives in `src/lib/ai/evals/rerun-seam.ts` instead, which is one line long
 * and is the only thing T9 touches here. A freeze with no exception beats a freeze with a
 * slightly untrue one.
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
import { isProvisional, UnreadableIdentityError } from "@/lib/ai/event-identity/lifecycle";
import {
  appendJournal,
  failureEntry,
  JOURNAL_FILENAME,
  responseEntry,
  rotateAside,
  rotateJournal,
  type JournalCaseContext,
} from "@/lib/ai/evals/journal";
import { rerunRunner } from "@/lib/ai/evals/rerun-seam";
import { EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";
import {
  buildRerunReviewArtifact,
  checkRerunCase,
  mechanicalPass,
  RERUN_ACCEPTANCE,
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
 * are the cases authored (T6–T8). Adding the corpus is the whole of *that* change; the one other
 * permitted edit to this file is the `run` binding named in the header.
 */
if (!existsSync(CORPUS)) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} does not exist, so EVAL_SET=${SET} cannot run. ` +
      "No provider call is made. Its cases are authored independently after this harness froze, " +
      "and adding them changes nothing else in this file.",
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
  it(
    "runs every case and records what happened",
    async () => {
      mkdirSync(OUT, { recursive: true });

      // T9 supplies the assembly, by repointing `rerun-seam.ts`. Until it does, this throws with
      // an explanation rather than silently exercising a code path that does not exist.
      const run = rerunRunner;

      /**
       * A paid response is durable the moment it arrives.
       *
       * Appended per round, before any checking, for the reason `journal.ts` spells out: a bug in
       * our own deterministic code must not be able to destroy responses already paid for. This
       * set makes at least two calls per case and runs once, so the alternative is losing the
       * whole run to a failure on the last one.
       *
       * The journal is rotated, never appended into. `EVAL_OVERWRITE=1` is the only way past the
       * refusal above, and without rotation a second run's rounds would interleave with a first
       * run's in one file beside a `mechanical-report.md` describing only the second.
       * `runStartedAt` on every line makes that attributable, which is the fallback, not the
       * control.
       *
       * This set writes no `run.json`, so the "journal with no `run.json` beside it is visibly an
       * aborted run" signal takes a different form here: `mechanical-report.md` is written only
       * after every case has finished, so a journal with no report beside it is the aborted run.
       */
      const runStartedAt = new Date().toISOString();
      const journal = path.join(OUT, JOURNAL_FILENAME);
      const rotated = [
        rotateJournal(OUT, runStartedAt),
        // The reports move too, and at the start rather than at the end. Written only after the
        // last case, they would otherwise survive an abort: run 2 dying on case 9 would leave
        // run 1's *complete* report beside run 2's partial journal, and the directory would read
        // as a finished run. Rotating all three under one stamp means an aborted run leaves
        // exactly what it produced.
        rotateAside(OUT, "mechanical-report.md", runStartedAt),
        rotateAside(OUT, "blind-review.md", runStartedAt),
      ].filter((file): file is string => file !== null);
      for (const file of rotated) {
        process.stdout.write(`kept the previous ${path.basename(file)}\n`);
      }

      /**
       * One journal line per round, so the id names the round: `<corpus case id>#<1-based round>`.
       * A recovery joins back to the corpus on the part before `#`. The corpus alone does not
       * determine what was sent — that is the whole subject of this set — so the assembled input
       * travels on the line, in `payload.input`.
       */
      const caseContext = (caseId: string, round: number): JournalCaseContext => ({
        caseId: `${caseId}#${round}`,
        runStartedAt,
        evalSet: SET,
        corpusVersion: corpus.version,
        recordedAt: new Date().toISOString(),
      });

      const observations: RerunObservation[] = [];
      const rows: string[] = [];

      for (const testCase of corpus.cases as RerunCase[]) {
        const observed: RerunObservation = {
          caseId: testCase.id,
          promptsSent: [],
          requestTexts: [],
          assemblyVersions: [],
          results: [],
          provisional: [],
          answersAssembled: [],
          schemaVersions: [],
        };
        for (const round of testCase.rounds) {
          const roundNumber = observed.results.length + 1;
          const startedRound = Date.now();

          // The call is the only statement inside the `try`, for the reason the
          // creative-understanding runner gives: anything else in here would be journaled as a
          // provider failure, writing one of our own bugs into evidence as a claim about the
          // model. The catch records what was already paid for and rethrows unchanged, so a
          // failure still fails the run loudly.
          let outcome: Awaited<ReturnType<typeof run>>;
          try {
            outcome = await run({
              prompt: testCase.prompt,
              answers: round.answers,
              // The eval's stand-in for the immutable revision a locator resolves against, so the
              // assembly can render the question it is answering without the corpus restating it.
              priorResults: [...observed.results],
            });
          } catch (error) {
            const failure = (error ?? {}) as {
              kind?: string;
              message?: string;
              issues?: { path: string; message: string }[];
              rawResponses?: string[];
              usage?: { latencyMs?: number; transientRetries?: number; repairRetries?: number };
            };
            appendJournal(
              journal,
              failureEntry(caseContext(testCase.id, roundNumber), {
                error: {
                  kind: failure.kind ?? "unknown",
                  message: failure.message ?? String(error),
                  issues: failure.issues,
                },
                // Every text the provider returned and we were billed for. `failureEntry` reads
                // this to decide between `unvalidated_response` and `no_response`, so a billed
                // call is never recorded as one that produced nothing.
                rawResponses: failure.rawResponses ?? [],
                // Synthesized, because the call threw before returning one. Two fields here are
                // weaker than they look and are recorded as such rather than trusted: `model` is
                // this runner's copy of the provider module's default and would be wrong if that
                // default moved, and `transientRetries`/`repairRetries` default to 0 — a count
                // nobody measured, which `journal.ts` warns against for token counts. Both are
                // non-optional on `CaseRun["telemetry"]`, so the shape forces a value; read a
                // failure entry's retry counts as unknown, not as zero.
                telemetry: {
                  model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
                  promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
                  schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
                  latencyMs: failure.usage?.latencyMs ?? Date.now() - startedRound,
                  transientRetries: failure.usage?.transientRetries ?? 0,
                  repairRetries: failure.usage?.repairRetries ?? 0,
                  schemaValidFirstCall: false,
                },
                input: { requested: { prompt: testCase.prompt, answers: round.answers } },
              }),
            );
            throw error;
          }

          appendJournal(
            journal,
            responseEntry(caseContext(testCase.id, roundNumber), {
              raw: outcome.raw,
              output: outcome.result,
              telemetry: outcome.telemetry,
              // Named halves, because a reader of a lone line must be able to tell the case's own
              // input from the implementation's account of what it did with it. `transmitted` is
              // the only one of the three that is not self-reported.
              input: {
                requested: { prompt: testCase.prompt, answers: round.answers },
                transmitted: outcome.requestText,
                reported: {
                  promptSent: outcome.promptSent,
                  assemblyVersion: outcome.assemblyVersion,
                  answersAssembled: outcome.answersAssembled,
                },
              },
            }),
          );

          observed.promptsSent.push(outcome.promptSent);
          observed.requestTexts.push(outcome.requestText);
          observed.assemblyVersions.push(outcome.assemblyVersion);
          observed.results.push(outcome.result);
          observed.schemaVersions.push(outcome.telemetry.schemaVersion);
          observed.answersAssembled.push(outcome.answersAssembled);
          // Asked of the lifecycle module, never assumed. Pushing a literal `false` here would
          // make `boundaryResolves` report "the final round is authoritative" about a round that
          // still carried a boundary question — the committed evidence asserting the opposite of
          // what happened, for the one dimension that check exists to measure.
          //
          // The reader fails closed, and this set is authorized exactly once: an unsupported
          // schema version or a malformed clarification block throws, and letting that abort the
          // loop would destroy the run in the very case `schemaVersionExpected` was frozen to
          // record as a mechanical failure. So it is caught and recorded as a third state.
          try {
            observed.provisional.push(
              isProvisional(outcome.result, outcome.telemetry.schemaVersion),
            );
          } catch (error) {
            if (!(error instanceof UnreadableIdentityError)) throw error;
            observed.provisional.push("unreadable");
          }
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
          // The run's own identity, so this file cannot be mistaken for another run's. It is
          // written after the last case, which is what makes its presence the completion signal
          // this set has in place of `run.json`; without the stamp, a reader could not tell which
          // run it completed.
          `Run started: \`${runStartedAt}\` · corpus \`${corpus.version}\` · set \`${SET}\``,
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
    },
    // Explicit, and generous, because the inherited 15-minute project budget was sized for a
    // twelve-call set. This one makes at least two calls per case and the corpus caps neither
    // count; at the ~23 s/call mean of the holdout run, fifteen cases of three rounds is ~17
    // minutes. A timeout here aborts a one-shot set mid-flight, which then needs
    // `EVAL_OVERWRITE=1` to resume — the exact path rotation exists to make safe, and not one to
    // walk down for the sake of a number chosen for a different set.
    45 * 60 * 1000,
  );
});
