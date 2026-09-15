/**
 * Which corpus each eval set reads, where it writes, and what it may claim — asserted without
 * running anything.
 *
 * This file exists because of a mistake made three times now, most recently while verifying the
 * very slot this file describes: the eval runner is the one module here that cannot be executed
 * to find anything out, because importing it with an API key present starts paying a provider.
 * Invoking `eval:spent-challenge` to confirm its guards began a real run that had to be killed
 * and its output discarded.
 *
 * So every property below is checked against the set definitions and the runner's *source text*,
 * never by invoking it. The guarded hazard and the guard must not share a trigger.
 *
 * Acceptance criteria: N/A — benchmark integrity and evidence provenance.
 * `docs/model-contracts.md §4.5`.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CORPUS_FILES, corpusPath, EVAL_SETS, PROTECTED_RESULT_DIRS, type EvalSet } from "./corpus";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const RUNNER = read("tests/eval/creative-understanding.eval.ts");
const SCRIPTS = JSON.parse(read("package.json")).scripts as Record<string, string>;

const sets = Object.keys(EVAL_SETS) as EvalSet[];

describe("the fresh v5 challenge is wired while its cases are unknown", () => {
  it("names a corpus that does not exist yet", () => {
    // Naming it now is the whole point: when the cases arrive, adding the file is the entire
    // change, so nobody can adjust the harness after seeing what it will be graded on.
    expect(CORPUS_FILES.challenge2).toBe("creative-understanding-sealed-challenge-v2.json");
    expect(existsSync(`${ROOT}${corpusPath("challenge2")}`)).toBe(false);
  });

  it("has its own command and its own output directory", () => {
    expect(SCRIPTS["eval:challenge2"]).toBe("EVAL_SET=challenge2 vitest run --project eval");
    expect(EVAL_SETS.challenge2.out).toBe(
      "docs/model-evals/results/creative-understanding-sealed-challenge-v2",
    );
  });

  it("claims fresh generalization evidence, and is the only set that does", () => {
    expect(EVAL_SETS.challenge2.label).toMatch(/fresh/i);
    expect(EVAL_SETS.challenge2.label).toMatch(/generalization evidence for v5/i);
    const claiming = sets.filter(
      (s) => /fresh/i.test(EVAL_SETS[s].label) && !/NOT fresh/i.test(EVAL_SETS[s].label),
    );
    expect(claiming).toEqual(["challenge2"]);
  });

  it("cannot reach provider setup while its corpus is absent", () => {
    // Asserted from the runner's source rather than by invoking it. The existence check must
    // sit at module scope, ahead of the API-key check — and nothing may construct a client at
    // module scope, which is why `generateEventIdentity` builds its own inside the call.
    const existence = RUNNER.indexOf("if (!existsSync(CORPUS))");
    const apiKey = RUNNER.indexOf("OPENAI_API_KEY");
    const call = RUNNER.indexOf("await generateEventIdentity(");
    expect(existence).toBeGreaterThan(-1);
    expect(existence).toBeLessThan(apiKey);
    expect(apiKey).toBeLessThan(call);
    // The key check and the call are inside the test body; the guards are above `describe`.
    expect(existence).toBeLessThan(RUNNER.indexOf('describe("creative-understanding corpus"'));
    expect(RUNNER).not.toMatch(/^const \w+ = new OpenAI/m);
  });
});

describe("the spent v1 corpus can be re-run without touching its first-run evidence", () => {
  it("reads the existing spent corpus", () => {
    expect(EVAL_SETS.spentChallenge.corpus).toBe(corpusPath("challenge"));
    expect(existsSync(`${ROOT}${EVAL_SETS.spentChallenge.corpus}`)).toBe(true);
  });

  it("writes only to its own v5-regression directory", () => {
    expect(EVAL_SETS.spentChallenge.out).toBe(
      "docs/model-evals/results/creative-understanding-sealed-challenge-v1-v5-regression",
    );
    expect(EVAL_SETS.spentChallenge.out).not.toBe(EVAL_SETS.challenge.out);
    expect(SCRIPTS["eval:spent-challenge"]).toBe(
      "EVAL_SET=spentChallenge vitest run --project eval",
    );
  });

  it("labels itself known and not fresh, in terms that cannot be mistaken", () => {
    const label = EVAL_SETS.spentChallenge.label;
    expect(label).toMatch(/KNOWN \/ SPENT/);
    expect(label).toMatch(/regression and diagnostic evidence only/i);
    expect(label).toMatch(/NOT fresh/i);
    // The two challenge-corpus labels must not read alike at a glance.
    expect(label).not.toBe(EVAL_SETS.challenge2.label);
  });
});

describe("no set can write over evidence that already exists", () => {
  it("protects the baseline and the v1 sealed challenge", () => {
    expect([...PROTECTED_RESULT_DIRS]).toEqual([
      "docs/model-evals/results/creative-understanding-v1",
      "docs/model-evals/results/creative-understanding-sealed-challenge-v1",
    ]);
  });

  it("refuses at module scope before anything is written", () => {
    // Placed above the corpus read and the output mkdir, so a refused set leaves no trace.
    const guard = RUNNER.indexOf("for (const protectedDir of PROTECTED_RESULT_DIRS)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(RUNNER.indexOf("if (!existsSync(CORPUS))"));
    expect(guard).toBeLessThan(RUNNER.indexOf("mkdirSync(OUT"));
    // `EVAL_OVERWRITE` is the deliberate override for the write-once rule; it must not be
    // consulted anywhere near the protected-directory refusal.
    expect(RUNNER.slice(guard, RUNNER.indexOf("if (!existsSync(CORPUS))"))).not.toContain(
      "EVAL_OVERWRITE",
    );
  });

  it("gives every set a distinct output directory", () => {
    const outs = sets.map((s) => EVAL_SETS[s].out);
    expect(new Set(outs).size).toBe(outs.length);
  });

  it("aims only the historical set at protected evidence, and that set is refused", () => {
    const aimed = sets.filter((s) =>
      (PROTECTED_RESULT_DIRS as readonly string[]).includes(EVAL_SETS[s].out),
    );
    expect(aimed).toEqual(["challenge"]);
    expect(EVAL_SETS.challenge.label).toMatch(/SPENT/);
    expect(EVAL_SETS.challenge.label).toMatch(/immutable and this path is refused/i);
  });
});

describe("the runner and the leakage scan cannot disagree about a corpus", () => {
  it("draws every set's corpus from the shared map", () => {
    const known = Object.keys(CORPUS_FILES).map((k) => corpusPath(k as keyof typeof CORPUS_FILES));
    for (const set of sets) expect(known).toContain(EVAL_SETS[set].corpus);
  });

  it("gives the leakage scan the same four corpora", () => {
    const scan = read("src/lib/ai/evals/prompt-leakage.test.ts");
    expect(scan).toContain("CORPUS_FILES");
    expect(scan).toContain("corpusPath");
    expect(Object.keys(CORPUS_FILES)).toEqual(["regression", "holdout", "challenge", "challenge2"]);
  });
});

describe("no set claims the spent v1 challenge is fresh", () => {
  it("says so in the set labels", () => {
    expect(EVAL_SETS.challenge.label).not.toMatch(/\bunseen\b/i);
    expect(EVAL_SETS.challenge.label).not.toMatch(/generalization/i);
  });

  it("says so in canon", () => {
    const contracts = read("docs/model-contracts.md").replace(/\s+/g, " ");
    const plan = read("docs/development-plan.md").replace(/\s+/g, " ");
    expect(contracts).toContain("Never generalization evidence again");
    expect(plan).toContain("`sealed_challenge_v1` is spent");
    // The v1 corpus must not still be described as the pending, not-yet-authored one.
    expect(contracts).not.toMatch(
      /creative-understanding-sealed-challenge\.json[^.]*deliberately absent/i,
    );
  });
});
