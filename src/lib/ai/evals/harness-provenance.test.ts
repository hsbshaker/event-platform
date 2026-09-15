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

import {
  CORPUS_FILES,
  corpusPath,
  EVAL_SETS,
  isProtectedOutput,
  PROTECTED_RESULT_DIRS,
  type EvalSet,
} from "./corpus";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const RUNNER = read("tests/eval/creative-understanding.eval.ts");
const SCRIPTS = JSON.parse(read("package.json")).scripts as Record<string, string>;

const sets = Object.keys(EVAL_SETS) as EvalSet[];
const V2_PRESENT = existsSync(`${ROOT}${corpusPath("challenge2")}`);

describe("the fresh v5 challenge is wired while its cases are unknown", () => {
  it("names the v2 corpus, wherever it is in its lifecycle", () => {
    // Unconditional: the name is fixed now so that adding the file later is the entire change.
    expect(CORPUS_FILES.challenge2).toBe("creative-understanding-sealed-challenge-v2.json");
  });

  // Self-retiring, like the leakage scan's absent-corpus reporter. An assertion that the corpus
  // is missing would turn `npm test` red the day it lands, forcing an edit to this very file —
  // benchmark-provenance tooling — at the one moment editing it is forbidden, under CI pressure.
  it.runIf(!V2_PRESENT)("is dormant until its cases are authored", () => {
    expect(V2_PRESENT).toBe(false);
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
    // The provider client is constructed inside `generateEventIdentity`, never at module scope
    // in either file — so importing the runner cannot open a connection.
    expect(RUNNER).not.toContain("new OpenAI");
    expect(read("src/lib/ai/openai/event-identity.ts")).not.toMatch(/^const \w+ = new OpenAI/m);
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

  it("refuses the protected directories themselves", () => {
    for (const dir of PROTECTED_RESULT_DIRS) expect(isProtectedOutput(dir)).toBe(true);
  });

  it("refuses a path inside one, or an ancestor of one", () => {
    // Writing into a protected directory destroys evidence; writing to an ancestor drops reports
    // beside it, where a reader takes them for the same run. Exact equality caught neither.
    expect(isProtectedOutput("docs/model-evals/results/creative-understanding-v1/rerun")).toBe(
      true,
    );
    expect(isProtectedOutput("docs/model-evals/results")).toBe(true);
    // Trailing and doubled slashes survive `path.join`, so they must not be an escape either.
    expect(isProtectedOutput("docs/model-evals/results/creative-understanding-v1/")).toBe(true);
    expect(isProtectedOutput("docs/model-evals//results/creative-understanding-v1")).toBe(true);
  });

  it("permits the sibling directories the other sets actually use", () => {
    // The `-v5-regression` sibling shares a prefix with the protected v1 directory and must not
    // be caught by it; a check that refused it would make the safe rerun slot unusable.
    for (const set of sets) {
      expect(isProtectedOutput(EVAL_SETS[set].out)).toBe(set === "challenge");
    }
  });

  it("is called by the runner before anything is read or written", () => {
    // Only the call site is asserted from source; the rule itself is tested above, because a
    // condition living in the runner cannot be tested without running what it guards.
    const guard = RUNNER.indexOf("if (isProtectedOutput(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(RUNNER.indexOf("if (!existsSync(CORPUS))"));
    expect(guard).toBeLessThan(RUNNER.indexOf("mkdirSync(OUT"));
    // `EVAL_OVERWRITE` is the deliberate override for the write-once rule; it must not be
    // consulted anywhere near this refusal.
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

  it("publishes every set in canon, and marks the refused one refused", () => {
    // Canon advertised `eval:challenge` as a runnable path after it had become one that always
    // throws, and omitted the two that replace it. A reader following the doc would have hit a
    // refusal and no instructions.
    const contracts = read("docs/model-contracts.md");
    for (const script of [
      "eval:regression",
      "eval:holdout",
      "eval:spent-challenge",
      "eval:challenge2",
    ]) {
      expect(contracts).toContain(`\`${script}\``);
    }
    expect(contracts).toContain("~~`eval:challenge`~~");
    expect(contracts).toMatch(/`eval:challenge` is kept and always refuses/);
    // The refusal is plural over the protected directories, not "the immutable baseline".
    expect(contracts).not.toMatch(/never the immutable baseline, which it refuses/);
  });

  it("says so in canon", () => {
    const contracts = read("docs/model-contracts.md").replace(/\s+/g, " ");
    const plan = read("docs/development-plan.md").replace(/\s+/g, " ");
    expect(contracts).toContain("Never generalization evidence again");
    expect(plan).toContain("`sealed_challenge_v1` is spent");
    // The v1 corpus must not still be described as the pending, not-yet-authored one.
    expect(contracts).toContain("when `sealed_challenge_v1` was written the corpus file was");
    expect(contracts).not.toMatch(/`sealed_challenge_v1`[^`]{0,120}is deliberately absent/i);
  });
});
