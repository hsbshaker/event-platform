/**
 * The Phase 4C DesignIntent evidence runner — prewired while its cases do not exist.
 *
 * This file is complete before any corpus is authored, which is the whole point. Its paths, its
 * refusals, its checks, its report shape and the gate it feeds are frozen at T19; the regression
 * and pre-registered cases are written afterwards by authors who implemented none of it (T20), and
 * the sealed challenge later still, by an author who has seen neither the prompt nor prior outputs
 * (T22). A harness written after the cases would be one whose author knew what it had to grade.
 *
 * **`npm run eval:design-intent-*` refuses today**, several times over and every time at module
 * scope, before an API key is read, before a client is constructed, and a very long way before a
 * request: no 4C corpus exists, and the seam still points at a refusal because the production
 * DesignIntent boundary is T21's and does not exist either.
 *
 * **Nothing in this file may change after T19 — not one line, and no exception.** That is enforced
 * rather than asserted: `src/lib/ai/evals/design-intent.test.ts` hashes the whole file and fails if
 * a byte moves. The binding T21 fills lives in `src/lib/ai/evals/design-intent-seam.ts`, which is
 * one line long and is the only thing T21 touches here. A freeze with no exception beats one with a
 * slightly untrue one — the lesson Phase 4B paid for when its own "one permitted line" turned out
 * to be inside the hash.
 *
 * **Three paid calls per batch, and the setup is not one of them.** The authoritative EventIdentity
 * brief is frozen fixture state authored with the case, and the sibling assignments come from the
 * deterministic planner, so nothing stochastic sits upstream of the thing being measured.
 *
 * It is never run to verify itself. `docs/model-evals/eval-incidents.md`: "Never execute the eval
 * runner to verify the harness. Not its paths, not its guards, not its schemas, not its reports,
 * not its refusals." Every property of this file is asserted statically, from its source text and
 * from the pure modules beside it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EVAL_SETS, isProtectedOutput } from "@/lib/ai/evals/corpus";
import {
  buildDesignIntentBlindArtifact,
  buildDesignIntentMechanicalReport,
  buildDesignIntentReviewerPacket,
  buildIdentityEnvelope,
  checkDesignIntentBatch,
  GATED_DESIGN_INTENT_SET,
  measureCorpus,
  validateDesignIntentCorpusShape,
  type BatchObservation,
  type DesignIntentCase,
  type DesignIntentCorpus,
  type SiblingObservation,
} from "@/lib/ai/evals/design-intent-evidence";
import { designIntentRunner } from "@/lib/ai/evals/design-intent-seam";
import {
  appendJournal,
  failureEntry,
  JOURNAL_FILENAME,
  responseEntry,
  rotateAside,
  rotateJournal,
  type JournalCaseContext,
} from "@/lib/ai/evals/journal";
import { assertAuthoritative } from "@/lib/ai/event-identity/lifecycle";
import {
  DESIGN_INTENT_PROMPT_VERSION,
  DESIGN_INTENT_SCHEMA_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import { planConceptBatch } from "@/lib/generation/planner";

const ROOT = new URL("../../", import.meta.url).pathname;

/** No default, for the same reason the other two runners have none. */
const SET = process.env.EVAL_SET as keyof typeof EVAL_SETS | undefined;
if (!SET || !Object.hasOwn(EVAL_SETS, SET)) {
  throw new Error(
    `EVAL_SET must be set explicitly to one of ${Object.keys(EVAL_SETS).join(", ")}. ` +
      "Use one of the `npm run eval:*` scripts; this run costs money and writes evidence, so it " +
      "never starts by accident.",
  );
}

/** A set belongs to exactly one runner, declared beside the set. */
if (EVAL_SETS[SET].runner !== "design-intent") {
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
 * The corpus has to exist. None of the three does yet: T19 froze this machinery, and only then are
 * the cases authored — T20 for the regression and pre-registered sets, T22 for the sealed
 * challenge. Adding a corpus is the whole of that change, and this file has no permitted edit at
 * all: T21 repoints `src/lib/ai/evals/design-intent-seam.ts` instead.
 */
if (!existsSync(CORPUS)) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} does not exist, so EVAL_SET=${SET} cannot run. ` +
      "No provider call is made. Its cases are authored independently after this harness froze, " +
      "and adding them changes nothing else in this file.",
  );
}

/** Evidence is written once. Every set here is one-shot by construction. */
if (existsSync(OUT) && process.env.EVAL_OVERWRITE !== "1") {
  throw new Error(
    `${path.relative(ROOT, OUT)} already holds evidence from a previous run. ` +
      `Move it aside — it may contain ${JOURNAL_FILENAME}, the paid provider responses, which ` +
      "deleting destroys — or set EVAL_OVERWRITE=1 if replacing the reports is what you mean.",
  );
}

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as DesignIntentCorpus;
const shapeProblems = validateDesignIntentCorpusShape(corpus, {
  gated: SET === GATED_DESIGN_INTENT_SET,
});
if (shapeProblems.length > 0) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} does not satisfy the frozen corpus contract:\n  ` +
      shapeProblems.join("\n  ") +
      "\n\nThe contract was frozen before these cases existed. Fix the corpus, never the " +
      "contract (docs/phase-4b-plan.md §3.7, §3.8).",
  );
}

describe(`${SET}: ${EVAL_SETS[SET].label}`, () => {
  it(
    "generates three DesignIntents per batch and records what happened",
    async () => {
      mkdirSync(OUT, { recursive: true });

      /**
       * The reviewer's two files live in their own subdirectory, and the reason is the whole
       * blinding argument.
       *
       * `mechanical-report.md` is ours: it carries the check details, the corpus-wide measurements
       * and the acceptance criteria, and the batch-label-to-case-id join. Handing a reviewer "the
       * results directory" while that file sat beside the artifact would hand them part of what
       * §3.8 withholds. `review/` is what gets handed over; the rest stays here.
       *
       * The scan is belt-and-braces with it: `design-intent.test.ts` searches the rendered
       * mechanical report for the gate's arithmetic as well as the packet, so neither the
       * directory layout nor the report alone is the only thing standing between a reviewer and
       * the rule.
       */
      const REVIEW = path.join(OUT, "review");
      mkdirSync(REVIEW, { recursive: true });

      // T21 supplies the production boundary, by repointing `design-intent-seam.ts`. Until it
      // does, this throws with an explanation rather than silently exercising a code path that
      // does not exist — and rather than the harness writing a second request assembly of its own,
      // which would let the set pass while production sent something else.
      const run = designIntentRunner;

      /**
       * A paid response is durable the moment it arrives.
       *
       * Appended per sibling, before any checking, for the reason `journal.ts` spells out: a bug
       * in our own deterministic code must not be able to destroy responses already paid for. At
       * three calls a batch that is thirty-six on a twelve-batch set, and the last one must not be
       * able to take the first thirty-five with it.
       *
       * The journal is rotated, never appended into, and the three reports are rotated with it —
       * at the start, not the end. `EVAL_OVERWRITE=1` is the only way past the refusal above, and
       * without rotation a second run's entries would interleave with a first run's while the
       * previous run's completed reports sat beside the new run's partial journal.
       *
       * This set writes no `run.json`, so `mechanical-report.md` — written last, after every batch
       * has finished — is the completion signal: a journal with no report beside it is the aborted
       * run.
       */
      const runStartedAt = new Date().toISOString();
      const journal = path.join(OUT, JOURNAL_FILENAME);
      const rotated = [
        rotateJournal(OUT, runStartedAt),
        rotateAside(OUT, "mechanical-report.md", runStartedAt),
        rotateAside(REVIEW, "blind-review.md", runStartedAt),
        rotateAside(REVIEW, "reviewer-packet.md", runStartedAt),
      ].filter((file): file is string => file !== null);
      for (const file of rotated) {
        process.stdout.write(`kept the previous ${path.basename(file)}\n`);
      }

      const caseContext = (caseId: string): JournalCaseContext => ({
        caseId,
        runStartedAt,
        evalSet: SET,
        corpusVersion: corpus.version,
        recordedAt: new Date().toISOString(),
      });

      const cases = corpus.cases as DesignIntentCase[];
      const observations: BatchObservation[] = [];
      const rows: {
        caseId: string;
        label: string;
        checks: ReturnType<typeof checkDesignIntentBatch>;
      }[] = [];

      for (const [position, testCase] of cases.entries()) {
        /**
         * The frozen setup, built here and planned from exactly as production plans.
         *
         * `buildIdentityEnvelope` produces the envelope shape `event_identity_revisions.result`
         * persists, and `assertAuthoritative` is what turns it into the branded brief the planner
         * accepts — production's own route, not a cast. The case id is the identity revision id,
         * which is the planner's only seed source, so the three assignments are a deterministic
         * function of the frozen corpus and nothing else.
         */
        const identity = assertAuthoritative(
          buildIdentityEnvelope(testCase),
          EVENT_IDENTITY_SCHEMA_VERSION,
        );
        const plan = planConceptBatch({ identity, identityRevisionId: testCase.id });
        const siblings: SiblingObservation[] = [];

        for (const planned of plan.siblings) {
          const startedCall = Date.now();

          // The call is the only statement inside the `try`, for the reason the other runners
          // give: anything else here would be journaled as a provider failure, writing one of our
          // own bugs into evidence as a claim about the model. The catch records what was already
          // paid for and rethrows unchanged, so a failure still fails the run loudly.
          let outcome: Awaited<ReturnType<typeof run>>;
          try {
            outcome = await run({
              identity,
              assignment: planned.assignment,
              siblingIndex: planned.index,
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
              failureEntry(caseContext(`${testCase.id}#${planned.index}`), {
                error: {
                  kind: failure.kind ?? "unknown",
                  message: failure.message ?? String(error),
                  issues: failure.issues,
                },
                // Every text the provider returned and we were billed for. `failureEntry` reads
                // this to decide between `unvalidated_response` and `no_response`, so a billed
                // call is never recorded as one that produced nothing.
                rawResponses: failure.rawResponses ?? [],
                // Synthesized, because the call threw before returning telemetry. Two fields are
                // weaker than they look: `model` is this runner's copy of a default that would be
                // wrong if that default moved, and the retry counts default to 0 — a measurement
                // nobody made, which `journal.ts` warns against for token counts. Both are
                // non-optional on the telemetry type, so the shape forces a value; read a failure
                // entry's retry counts as unknown, not as zero.
                telemetry: {
                  model: process.env.OPENAI_MODEL ?? "unrecorded",
                  promptVersion: DESIGN_INTENT_PROMPT_VERSION,
                  schemaVersion: DESIGN_INTENT_SCHEMA_VERSION,
                  latencyMs: failure.usage?.latencyMs ?? Date.now() - startedCall,
                  transientRetries: failure.usage?.transientRetries ?? 0,
                  repairRetries: failure.usage?.repairRetries ?? 0,
                  schemaValidFirstCall: false,
                },
                input: {
                  caseId: testCase.id,
                  siblingIndex: planned.index,
                  plannerVersion: plan.plannerVersion,
                  assignment: planned.assignment,
                },
              }),
            );
            throw error;
          }

          appendJournal(
            journal,
            responseEntry(caseContext(`${testCase.id}#${planned.index}`), {
              raw: outcome.raw,
              output: outcome.response,
              telemetry: outcome.telemetry,
              // Named halves, because a reader of a lone line must be able to tell the frozen
              // setup from the implementation's account of what it did with it. `transmitted` is
              // the only one of the two that is not self-reported.
              input: {
                setup: {
                  caseId: testCase.id,
                  siblingIndex: planned.index,
                  plannerVersion: plan.plannerVersion,
                  batchSeed: plan.batchSeed,
                  assignment: planned.assignment,
                },
                transmitted: outcome.requestText,
              },
            }),
          );

          siblings.push({
            index: planned.index,
            raw: outcome.raw,
            response: outcome.response,
            requestText: outcome.requestText,
            telemetry: outcome.telemetry,
          });
        }

        const observation: BatchObservation = { caseId: testCase.id, plan, siblings };
        observations.push(observation);
        rows.push({
          caseId: testCase.id,
          label: `Batch ${position + 1}`,
          checks: checkDesignIntentBatch(testCase, observation),
        });
      }

      const measurements = measureCorpus(cases, observations);

      // The artifact first, the report last. `mechanical-report.md` is this set's completion signal
      // — this set has no `run.json` — so writing it first would leave a window in which a throw
      // produces a directory that reads as complete with no artifact in it. The reviewer packet
      // goes between them: it is what the artifact is read against, and a blind review that
      // arrived without it would be a reviewer rating against a scale they cannot see.
      writeFileSync(
        path.join(REVIEW, "blind-review.md"),
        buildDesignIntentBlindArtifact(cases, observations, measurements),
        "utf8",
      );

      writeFileSync(
        path.join(REVIEW, "reviewer-packet.md"),
        buildDesignIntentReviewerPacket(),
        "utf8",
      );

      writeFileSync(
        path.join(OUT, "mechanical-report.md"),
        buildDesignIntentMechanicalReport({
          runStartedAt,
          evalSet: SET,
          label: EVAL_SETS[SET].label,
          corpusVersion: corpus.version,
          plannerVersion: observations[0]?.plan.plannerVersion ?? "unrecorded",
          rows,
          measurements,
        }),
        "utf8",
      );

      expect(observations).toHaveLength(cases.length);
    },
    // Explicit, and generous. This set makes three calls per batch — thirty-six on the gated
    // twelve — where the project's inherited 15-minute budget was sized for a twelve-call set. A
    // timeout aborts a one-shot set mid-flight, which then needs `EVAL_OVERWRITE=1` to resume: the
    // exact path rotation exists to make safe, and not one to walk down for the sake of a number
    // chosen for a different set.
    120 * 60 * 1000,
  );
});
