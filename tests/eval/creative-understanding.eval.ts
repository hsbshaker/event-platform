/**
 * The creative-understanding run: fourteen real model calls, then the two documents.
 *
 * Run with `npm run eval:regression` or `npm run eval:holdout`. It is its own vitest project, excluded
 * from `npm test`, because it costs money, takes minutes and talks to a live provider —
 * `docs/model-contracts.md §4.5`: "do not gate ordinary code changes on it — it measures
 * the creative stack, not the compiler."
 *
 * Two deliberate choices about how it runs:
 *
 * **Sequential, not parallel.** Fourteen concurrent calls would finish sooner and report
 * latency that no host will ever experience. `spec.md §7.10` has a latency target to answer
 * against, so each case is timed alone.
 *
 * **Failures are recorded, never retried away.** A case that fails validation after its one
 * repair retry is written into the report as a failure (`§4.9`: "Do not hide failed calls").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EventIdentityError, generateEventIdentity } from "@/lib/ai/openai/event-identity";
import { EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";
import { evaluateCase, type CorpusCase } from "@/lib/ai/evals/creative-understanding";
import { buildBlindArtifact, buildMechanicalReport, type CaseRun } from "@/lib/ai/evals/report";

const ROOT = new URL("../../", import.meta.url).pathname;
/**
 * Which corpus runs, and where its evidence lands.
 *
 * `EVAL_SET=holdout` is the fresh evidence; the default is the original fourteen, which are
 * now a REGRESSION suite rather than fresh evidence — every one of their outputs has been
 * inspected and discussed (`results/creative-understanding-v1/astra-qualitative-review.md`).
 *
 * The output directory is derived from the set, never shared. Hardcoding it meant pointing the
 * runner at a second corpus would have overwritten the immutable Phase 4A baseline in place,
 * and the first anyone would know is that the evidence no longer matched the report.
 */
const EVAL_SETS = {
  regression: {
    corpus: "docs/model-evals/creative-understanding.json",
    out: "docs/model-evals/results/creative-understanding-v1-regression",
    label: "REGRESSION RE-RUN of the original fourteen — not fresh evidence",
  },
  holdout: {
    corpus: "docs/model-evals/creative-understanding-holdout.json",
    out: "docs/model-evals/results/creative-understanding-holdout-v1",
    label: "FRESH EVIDENCE from the frozen holdout",
  },
} as const;

/**
 * No default. A bare `vitest run --project eval` must refuse rather than quietly spend money
 * and write evidence — which is exactly what it did once during the remediation, producing a
 * run against a half-finished implementation that had to be deleted unexamined. Naming the set
 * is how you say you meant it.
 */
const SET = process.env.EVAL_SET as keyof typeof EVAL_SETS | undefined;
if (!SET || !(SET in EVAL_SETS)) {
  throw new Error(
    `EVAL_SET must be set explicitly to one of ${Object.keys(EVAL_SETS).join(", ")}. ` +
      "Use `npm run eval:regression` or `npm run eval:holdout`; this run costs money and " +
      "writes evidence, so it never starts by accident.",
  );
}
const CORPUS = path.join(ROOT, EVAL_SETS[SET].corpus);
const OUT = path.join(ROOT, EVAL_SETS[SET].out);

/** The immutable baseline. No run may write here again, whatever EVAL_SET says. */
const BASELINE = path.join(ROOT, "docs/model-evals/results/creative-understanding-v1");
if (OUT === BASELINE) {
  throw new Error("refusing to overwrite the immutable Phase 4A baseline evidence");
}

/**
 * Evidence is written once. The validation set in particular is one-shot by construction — a
 * second `npm run eval:holdout` would destroy the first and only fresh evidence exactly as the
 * accidental run nearly did. `EVAL_OVERWRITE=1` is the deliberate override.
 */
if (existsSync(OUT) && process.env.EVAL_OVERWRITE !== "1") {
  throw new Error(
    `${path.relative(ROOT, OUT)} already holds evidence from a previous run. ` +
      "Move or delete it, or set EVAL_OVERWRITE=1 if replacing it is what you mean.",
  );
}

interface Corpus {
  version: string;
  cases: CorpusCase[];
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

      const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as Corpus;
      expect(corpus.cases.length).toBeGreaterThan(0);

      process.stdout.write(`\n${EVAL_SETS[SET].label}\n\n`);
      const startedAt = new Date().toISOString();
      const runs: CaseRun[] = [];

      for (const caseData of corpus.cases) {
        process.stdout.write(`${caseData.id} … `);
        const startedCase = Date.now();
        try {
          // Only the model call is guarded. `evaluateCase` runs after, because a bug in the
          // checker throwing in here would be caught below and recorded as a model failure in
          // evidence that is meant to be immutable.
          const call = await generateEventIdentity({ prompt: caseData.prompt });
          runs.push({
            caseData,
            result: call.output,
            telemetry: {
              model: call.usage.model,
              promptVersion: call.promptVersion,
              schemaVersion: call.schemaVersion,
              latencyMs: call.usage.latencyMs,
              transientRetries: call.usage.transientRetries,
              repairRetries: call.usage.repairRetries,
              schemaValidFirstCall: call.usage.schemaValidFirstCall,
              inputTokens: call.usage.inputTokens,
              cachedInputTokens: call.usage.cachedInputTokens,
              outputTokens: call.usage.outputTokens,
              reasoningTokens: call.usage.reasoningTokens,
              providerRequestId: call.usage.providerRequestId,
            },
          });
          const last = runs[runs.length - 1];
          last.evaluation = evaluateCase(caseData, call.output);
          process.stdout.write(
            `${last.telemetry.latencyMs}ms ${last.evaluation?.mechanicalPass ? "ok" : "MECHANICAL FAIL"}\n`,
          );
        } catch (error) {
          const failure = error as EventIdentityError;
          runs.push({
            caseData,
            error: {
              kind: failure.kind ?? "unknown",
              message: failure.message,
              issues: failure.issues,
            },
            telemetry: {
              model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
              promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
              schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
              latencyMs: failure.usage?.latencyMs ?? Date.now() - startedCase,
              transientRetries: failure.usage?.transientRetries ?? 0,
              repairRetries: failure.usage?.repairRetries ?? 0,
              schemaValidFirstCall: false,
            },
          });
          process.stdout.write(`FAILED (${failure.kind})\n`);
        }
      }

      mkdirSync(OUT, { recursive: true });
      writeFileSync(
        path.join(OUT, "run.json"),
        `${JSON.stringify({ evalSet: SET, label: EVAL_SETS[SET].label, corpusVersion: corpus.version, startedAt, runs }, null, 2)}\n`,
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
