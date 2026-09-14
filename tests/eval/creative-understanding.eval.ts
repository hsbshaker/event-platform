/**
 * The creative-understanding run: fourteen real model calls, then the two documents.
 *
 * Run with `npm run eval:creative-understanding`. It is its own vitest project, excluded
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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EventIdentityError, generateEventIdentity } from "@/lib/ai/openai/event-identity";
import { evaluateCase, type CorpusCase } from "@/lib/ai/evals/creative-understanding";
import { buildBlindArtifact, buildMechanicalReport, type CaseRun } from "@/lib/ai/evals/report";

const ROOT = new URL("../../", import.meta.url).pathname;
const CORPUS = path.join(ROOT, "docs/model-evals/creative-understanding.json");
const OUT = path.join(ROOT, "docs/model-evals/results/creative-understanding-v1");

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

      const startedAt = new Date().toISOString();
      const runs: CaseRun[] = [];

      for (const caseData of corpus.cases) {
        process.stdout.write(`${caseData.id} … `);
        const startedCase = Date.now();
        try {
          const call = await generateEventIdentity({ prompt: caseData.prompt });
          runs.push({
            caseData,
            result: call.output,
            evaluation: evaluateCase(caseData, call.output),
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
              promptVersion: "event_identity_v3",
              schemaVersion: "event_identity_schema_v3",
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
        `${JSON.stringify({ corpusVersion: corpus.version, startedAt, runs }, null, 2)}\n`,
      );
      writeFileSync(path.join(OUT, "mechanical-report.md"), buildMechanicalReport(runs, startedAt));
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
