/**
 * Every case in the selected corpus against the live model, then the two documents.
 *
 * A case is one model call, or two when the single repair retry is spent (`§8`), plus any
 * transient HTTP retries underneath those.
 *
 * Run with one of the `npm run eval:*` scripts; `evals/corpus.ts` defines the sets and what class
 * of evidence each one produces. It is its own vitest project, excluded from `npm test`, because
 * it costs money, takes minutes and talks to a live provider —
 * `docs/model-contracts.md §4.5`: "do not gate ordinary code changes on it — it measures
 * the creative stack, not the compiler."
 *
 * Three deliberate choices about how it runs:
 *
 * **Sequential, not parallel.** Concurrent calls would finish sooner and report a latency no
 * host will ever experience. `spec.md §7.10` has a latency target to answer against, so each
 * case is timed alone.
 *
 * **Failures are recorded, never retried away.** A case that fails validation after its one
 * repair retry is written into the report as a failure (`§4.9`: "Do not hide failed calls").
 *
 * **Paid responses are durable before anything can throw.** Each response is journaled the
 * moment it arrives, so a bug in our own deterministic code cannot destroy model calls already
 * paid for — which on a one-shot set would be unrecoverable (`evals/journal.ts`). Text paid for
 * but never accepted by validation is journaled too, carried out of the provider boundary on
 * `EventIdentityError.rawResponses`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EventIdentityError, generateEventIdentity } from "@/lib/ai/openai/event-identity";
import { EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";
import { evaluateCase, type CorpusCase } from "@/lib/ai/evals/creative-understanding";
import { EVAL_SETS, isProtectedOutput, validateCorpusShape } from "@/lib/ai/evals/corpus";
import { buildBlindArtifact, buildMechanicalReport, type CaseRun } from "@/lib/ai/evals/report";
import {
  appendJournal,
  failureEntry,
  JOURNAL_FILENAME,
  recordThenEvaluate,
  responseEntry,
  rotateJournal,
} from "@/lib/ai/evals/journal";

const ROOT = new URL("../../", import.meta.url).pathname;
/**
 * The set definitions live in `evals/corpus.ts` so the leakage scan and this runner cannot
 * disagree about which file a set means, and so the output directories can be asserted unique
 * by a unit test rather than by reading. Each carries its own evidence-class label, because a
 * report that overstates its class is how a weak result gets read as a strong one.
 */

/**
 * No default. A bare `vitest run --project eval` must refuse rather than quietly spend money
 * and write evidence — which is exactly what it did once during the remediation, producing a
 * run against a half-finished implementation that had to be deleted unexamined. Naming the set
 * is how you say you meant it.
 */
const SET = process.env.EVAL_SET as keyof typeof EVAL_SETS | undefined;
if (!SET || !Object.hasOwn(EVAL_SETS, SET)) {
  throw new Error(
    `EVAL_SET must be set explicitly to one of ${Object.keys(EVAL_SETS).join(", ")}. ` +
      "Use one of the `npm run eval:*` scripts; this run costs money and writes evidence, so " +
      "it never starts by accident.",
  );
}
const CORPUS = path.join(ROOT, EVAL_SETS[SET].corpus);
const OUT = path.join(ROOT, EVAL_SETS[SET].out);

/**
 * Evidence that already exists. No run may write over it, whatever `EVAL_SET` says — and the
 * list lives beside the set definitions so adding a set cannot quietly aim at one of them.
 */
if (isProtectedOutput(EVAL_SETS[SET].out)) {
  throw new Error(
    `refusing to write over ${EVAL_SETS[SET].out}: that path holds, or sits above, a completed ` +
      "run's evidence. " +
      (SET === "challenge"
        ? "The v1 sealed challenge is spent; `npm run eval:spent-challenge` reruns those cases " +
          "into their own directory, and `npm run eval:challenge2` is the fresh v5 corpus."
        : "Point the set at a directory of its own."),
  );
}

/**
 * The corpus has to exist before anything else happens.
 *
 * This is what keeps a fresh-challenge path safely dormant. `challenge2`'s corpus is deliberately
 * absent until after the v5 freeze, so `npm run eval:challenge2` must fail here — at module scope,
 * during collection, before the API-key check, before any client is constructed and a very long
 * way before a request — rather than partway through a run. When those cases arrive, adding the
 * file is the whole change: no runner, checker, prompt, schema or model code moves, because moving
 * any of it after seeing the cases is the thing a sealed challenge exists to prevent.
 */
if (!existsSync(CORPUS)) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} does not exist, so EVAL_SET=${SET} cannot run. ` +
      "No provider call is made. If this is the sealed challenge, its corpus is authored " +
      "independently and added after the implementation freeze; nothing else needs to change.",
  );
}

/**
 * Evidence is written once. The validation set and a fresh sealed challenge are one-shot by
 * construction — a second `npm run eval:holdout` would destroy the pre-registered validation
 * evidence, and a second `npm run eval:challenge2` the generalization evidence, exactly as the
 * accidental run nearly did. `EVAL_OVERWRITE=1` is the deliberate override, and it cannot reach
 * the protected directories above.
 */
if (existsSync(OUT) && process.env.EVAL_OVERWRITE !== "1") {
  throw new Error(
    `${path.relative(ROOT, OUT)} already holds evidence from a previous run. ` +
      `Move it aside — it may contain ${JOURNAL_FILENAME}, the paid provider responses, which ` +
      "deleting destroys — or set EVAL_OVERWRITE=1 if replacing the reports is what you mean.",
  );
}

interface Corpus {
  version: string;
  cases: CorpusCase[];
}

/**
 * The corpus has to be the right shape before a single case is spent.
 *
 * Nothing validated this, and the sealed challenge is the one corpus we cannot afford that on:
 * it is authored by someone else, run once, and costs money per case. `evals/corpus.ts` says
 * which fields matter and why, and — unlike this file — can be unit-tested without paying a
 * provider, which is the whole reason the rule lives there rather than here.
 *
 * It runs at module scope for the same reason the existence check does: this is the last moment
 * a malformed corpus costs nothing.
 */
let corpus: Corpus;
try {
  corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as Corpus;
} catch (error) {
  // A bare `SyntaxError` names neither the file nor the set, which is a poor first thing for an
  // independent corpus author to see.
  throw new Error(
    `${path.relative(ROOT, CORPUS)} is not valid JSON, so EVAL_SET=${SET} cannot run. ` +
      `No provider call is made. ${(error as Error).message}`,
  );
}
const shapeProblems = validateCorpusShape(corpus);
if (shapeProblems.length > 0) {
  throw new Error(
    `${path.relative(ROOT, CORPUS)} is not a usable corpus, so EVAL_SET=${SET} cannot run. ` +
      `No provider call is made. The contract is in docs/model-contracts.md §4.5. ` +
      `${shapeProblems.length} problem(s):\n  - ${shapeProblems.join("\n  - ")}`,
  );
}

describe("creative-understanding corpus", () => {
  it(
    "runs every case against the production Event Identity call",
    { timeout: 15 * 60_000 },
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          "OPENAI_API_KEY is not set. This run makes real model calls by design " +
            "(docs/model-contracts.md §4.5); there is no mock mode, because a mocked run " +
            "would produce evidence about nothing.",
        );
      }

      process.stdout.write(`\n${EVAL_SETS[SET].label}\n\n`);
      const startedAt = new Date().toISOString();
      const runs: CaseRun[] = [];

      // Created up front, not after the loop: every paid response is journaled here the moment
      // it arrives, so nothing our deterministic code does afterwards can destroy it. A
      // directory holding a journal and no `run.json` is an aborted run, visibly.
      mkdirSync(OUT, { recursive: true });
      const journal = path.join(OUT, JOURNAL_FILENAME);
      // Never append into a previous run's journal: `evals/journal.ts` says why, and is where
      // this is asserted rather than only read.
      const rotated = rotateJournal(OUT, startedAt);
      if (rotated) process.stdout.write(`kept the previous journal as ${path.basename(rotated)}\n`);

      // Which corpus a `caseId` indexes into, and at what version, so a lone journal file names
      // the prompts it should be joined against rather than leaving a recovery to infer them.
      const caseContext = (caseId: string) => ({
        caseId,
        runStartedAt: startedAt,
        evalSet: SET,
        corpusVersion: corpus.version,
        recordedAt: new Date().toISOString(),
      });

      for (const caseData of corpus.cases) {
        process.stdout.write(`${caseData.id} … `);
        const startedCase = Date.now();
        // The model call is the only statement inside the `try`. Anything else in here would be
        // caught below and recorded as a model failure — a checker bug written into evidence
        // meant to be immutable, as a lie about what the model did.
        //
        // The boundary is not quite the HTTP response: parsing and schema validation run inside
        // `generateEventIdentity`, after the money is spent, and a throw from there does land in
        // this catch. It cannot destroy the text, which leaves on `rawResponses` and is journaled
        // below — but it is recorded as `kind: "unknown"`, so read such an entry as our bug until
        // proven otherwise.
        let call: Awaited<ReturnType<typeof generateEventIdentity>> | undefined;
        try {
          call = await generateEventIdentity({ prompt: caseData.prompt });
        } catch (error) {
          const failure = error as EventIdentityError;
          // Built once and journaled as well as reported, so the two records of this case cannot
          // describe it differently. `failureEntry` decides the status from what was actually
          // returned rather than from `kind`.
          const payload = {
            error: {
              kind: failure.kind ?? "unknown",
              message: failure.message,
              issues: failure.issues,
            },
            rawResponses: failure.rawResponses ?? [],
            telemetry: {
              model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
              promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
              schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
              latencyMs: failure.usage?.latencyMs ?? Date.now() - startedCase,
              transientRetries: failure.usage?.transientRetries ?? 0,
              repairRetries: failure.usage?.repairRetries ?? 0,
              schemaValidFirstCall: false,
            },
          };
          appendJournal(journal, failureEntry(caseContext(caseData.id), payload));
          runs.push({ caseData, error: payload.error, telemetry: payload.telemetry });
          process.stdout.write(`FAILED (${failure.kind})\n`);
          continue;
        }

        {
          const succeeded = call;
          // Built before the journal write and shared with `run.json`: a plain object literal
          // over values already in hand, so nothing here can throw between the response arriving
          // and it being on disk, and the two records cannot drift.
          const telemetry = {
            model: succeeded.usage.model,
            promptVersion: succeeded.promptVersion,
            schemaVersion: succeeded.schemaVersion,
            latencyMs: succeeded.usage.latencyMs,
            transientRetries: succeeded.usage.transientRetries,
            repairRetries: succeeded.usage.repairRetries,
            schemaValidFirstCall: succeeded.usage.schemaValidFirstCall,
            inputTokens: succeeded.usage.inputTokens,
            cachedInputTokens: succeeded.usage.cachedInputTokens,
            outputTokens: succeeded.usage.outputTokens,
            reasoningTokens: succeeded.usage.reasoningTokens,
            providerRequestId: succeeded.usage.providerRequestId,
          };
          const evaluation = recordThenEvaluate(
            journal,
            responseEntry(caseContext(caseData.id), {
              raw: succeeded.raw,
              output: succeeded.output,
              telemetry,
            }),
            () => evaluateCase(caseData, succeeded.output),
          );
          runs.push({ caseData, result: succeeded.output, evaluation, telemetry });
          const last = runs[runs.length - 1];
          process.stdout.write(
            `${last.telemetry.latencyMs}ms ${last.evaluation?.mechanicalPass ? "ok" : "MECHANICAL FAIL"}\n`,
          );
        }
      }

      // Written only here, on a clean finish. Its absence beside a journal is what makes a
      // partial run unable to masquerade as a complete one; `complete: true` is a constant, and
      // says so only for a reader holding the JSON without the directory around it.
      writeFileSync(
        path.join(OUT, "run.json"),
        `${JSON.stringify({ evalSet: SET, label: EVAL_SETS[SET].label, corpusVersion: corpus.version, startedAt, complete: true, runs }, null, 2)}\n`,
      );
      writeFileSync(
        path.join(OUT, "mechanical-report.md"),
        buildMechanicalReport(runs, startedAt, {
          corpusPath: EVAL_SETS[SET].corpus,
          corpusVersion: corpus.version,
          label: EVAL_SETS[SET].label,
        }),
      );
      writeFileSync(path.join(OUT, "blind-review.md"), buildBlindArtifact(runs));

      const completed = runs.filter((r) => r.result).length;
      const passed = runs.filter((r) => r.evaluation?.mechanicalPass).length;
      process.stdout.write(
        `\nstructured output ${completed}/${runs.length} · mechanical pass ${passed}/${runs.length}\n` +
          `wrote ${path.relative(ROOT, OUT)}/{run.json,mechanical-report.md,blind-review.md}\n\n` +
          "A clean mechanical run is not a Phase 4A pass. Send blind-review.md to an\n" +
          "independent reviewer before drawing any conclusion about understanding.\n",
      );

      // The run itself succeeds as long as it produced evidence. Whether the evidence is
      // good is not this file's judgement to make, and failing here on a low score would
      // turn an evaluation into a gate the rubric says it must not be (§4.5).
      expect(runs).toHaveLength(corpus.cases.length);
    },
  );
});
