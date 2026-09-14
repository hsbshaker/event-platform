/**
 * Every case in the selected corpus against the live model, then the two documents.
 *
 * A case is one model call, or two when the single repair retry is spent (`§8`), plus any
 * transient HTTP retries underneath those.
 *
 * Run with `npm run eval:regression` or `npm run eval:holdout`. It is its own vitest project,
 * excluded from `npm test`, because it costs money, takes minutes and talks to a live provider —
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
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EventIdentityError, generateEventIdentity } from "@/lib/ai/openai/event-identity";
import { EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";
import { evaluateCase, type CorpusCase } from "@/lib/ai/evals/creative-understanding";
import { buildBlindArtifact, buildMechanicalReport, type CaseRun } from "@/lib/ai/evals/report";
import { appendJournal, JOURNAL_FILENAME, recordThenEvaluate } from "@/lib/ai/evals/journal";

const ROOT = new URL("../../", import.meta.url).pathname;
/**
 * Which corpus runs, and where its evidence lands.
 *
 * There is no default — see the `EVAL_SET` check below. Neither set available here is fresh
 * generalization evidence, and the labels say so, because a report that overstates its own
 * evidence class is how a weak result gets read as a strong one:
 *
 * - **regression** — the original cases. Every output has been inspected and discussed
 *   (`results/creative-understanding-v1/astra-qualitative-review.md`), so a re-run catches
 *   regressions and nothing more.
 * - **holdout** — the pre-registered validation set. Frozen and independently reviewed before
 *   the remediation, but authored by the same person who then wrote the prompt, with knowledge
 *   of the cases. Useful validation; not the strongest evidence of generalization.
 *
 * The independently authored sealed challenge is what will provide that, and it is not here.
 *
 * The output directory is derived from the set, never shared. Hardcoding it meant pointing the
 * runner at a second corpus would have overwritten the immutable Phase 4A baseline in place,
 * and the first anyone would know is that the evidence no longer matched the report.
 */
const EVAL_SETS = {
  regression: {
    corpus: "docs/model-evals/creative-understanding.json",
    out: "docs/model-evals/results/creative-understanding-v1-regression",
    label: "REGRESSION RE-RUN — known cases, not fresh evidence",
  },
  holdout: {
    corpus: "docs/model-evals/creative-understanding-holdout.json",
    out: "docs/model-evals/results/creative-understanding-holdout-v1",
    label:
      "PRE-REGISTERED VALIDATION SET — frozen before remediation, but known to the " +
      "implementation author; useful validation evidence, not the strongest evidence of " +
      "generalization",
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
      `Move it aside — it may contain ${JOURNAL_FILENAME}, the paid provider responses, which ` +
      "deleting destroys — or set EVAL_OVERWRITE=1 if replacing the reports is what you mean.",
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

      // Created up front, not after the loop: every paid response is journaled here the moment
      // it arrives, so nothing our deterministic code does afterwards can destroy it. A
      // directory holding a journal and no `run.json` is an aborted run, visibly.
      mkdirSync(OUT, { recursive: true });
      const journal = path.join(OUT, JOURNAL_FILENAME);
      // The three reports are truncated by `writeFileSync`; the journal is appended. Under
      // `EVAL_OVERWRITE=1` that difference would blend two runs' paid responses into one file
      // beside a `run.json` describing only one of them — evidence that misrepresents what was
      // run. Rotate rather than append, and rotate rather than delete: the displaced file is
      // paid for.
      if (existsSync(journal)) {
        const rotated = path.join(OUT, `${JOURNAL_FILENAME}.${startedAt.replace(/[:.]/g, "-")}`);
        renameSync(journal, rotated);
        process.stdout.write(`kept the previous journal as ${path.basename(rotated)}\n`);
      }

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
          // `invalid_output` is not a call that produced nothing: the provider answered — twice,
          // when the repair retry was spent — and our validation rejected the text. Recording
          // that as a provider failure would claim the model never responded, and would hide
          // paid text from anyone reading the journal back.
          const rawResponses = failure.rawResponses ?? [];
          appendJournal(journal, {
            caseId: caseData.id,
            status: rawResponses.length > 0 ? "unvalidated_response" : "no_response",
            runStartedAt: startedAt,
            recordedAt: new Date().toISOString(),
            payload: { kind: failure.kind ?? "unknown", message: failure.message, rawResponses },
          });
          process.stdout.write(`FAILED (${failure.kind})\n`);
          continue;
        }

        {
          const succeeded = call;
          const evaluation = recordThenEvaluate(
            journal,
            {
              caseId: caseData.id,
              status: "response",
              runStartedAt: startedAt,
              recordedAt: new Date().toISOString(),
              payload: { raw: succeeded.raw, output: succeeded.output, usage: succeeded.usage },
            },
            () => evaluateCase(caseData, succeeded.output),
          );
          runs.push({
            caseData,
            result: call.output,
            evaluation,
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
