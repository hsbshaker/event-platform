import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The half of online submission that has to keep working offline: what is stored must still
 * feed the frozen scorer.
 *
 * Reviewers used to send a JSON file, which an operator saved into
 * `docs/human-test-1/responses/` and scored with `scripts/human-test/score.mjs`. Now the same
 * object is stored as `human_test_1_responses.response_payload` and
 * `scripts/human-test/score-stored.mjs` writes it back out to the same place, in the same shape,
 * for the same script. These tests hold that equivalence to the only standard that matters:
 * the frozen scorer, actually run, against the real key.
 *
 * `proof-b/score-human.js`, `proof-b/human-test-key.txt`, `proof-b/human-test-form.md` and
 * `scripts/human-test/score.mjs` are untouched by this change. Nothing here may edit them, and
 * the run below is the evidence that nothing needed to.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const RESULTS = path.join(ROOT, "docs/human-test-1/results.json");
const SCORE = path.join(ROOT, "docs/human-test-1/score.json");

/** A stored `response_payload`: exactly what the page produces and the route stores verbatim. */
function storedPayload(reviewer: string, rate: (screen: number) => number) {
  const ratings: Record<string, number> = {};
  for (let i = 1; i <= 40; i += 1) ratings[String(i)] = rate(i);
  return {
    reviewer,
    ok: true,
    protocol: "proof-b/human-test-form.md",
    result: {
      groups: Array.from({ length: 40 }, (_, i) => [i + 1]),
      ratings,
    },
  };
}

/**
 * Runs the frozen scoring path on five stored payloads, exactly as `score-stored.mjs --write`
 * does: write each out as a reviewer file, then hand the five to `score.mjs` unmodified.
 *
 * `score.mjs` writes into `docs/human-test-1/`, so any real results are saved and restored. A
 * test must not be able to overwrite the outcome of the actual experiment.
 */
const savedResults = existsSync(RESULTS) ? readFileSync(RESULTS) : null;
const savedScore = existsSync(SCORE) ? readFileSync(SCORE) : null;
const scratch = mkdtempSync(path.join(tmpdir(), "human-test-scoring-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  for (const [file, saved] of [
    [RESULTS, savedResults],
    [SCORE, savedScore],
  ] as const) {
    if (saved) writeFileSync(file, saved);
    else rmSync(file, { force: true });
  }
});

function score(payloads: ReturnType<typeof storedPayload>[]) {
  const files = payloads.map((payload, i) => {
    const file = path.join(scratch, `reviewer-${i}.json`);
    writeFileSync(file, JSON.stringify(payload, null, 1));
    return file;
  });
  execFileSync("node", [path.join(ROOT, "scripts/human-test/score.mjs"), ...files], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(readFileSync(SCORE, "utf8"));
}

describe("a stored response feeds the frozen scorer unchanged", () => {
  it("scores five stored payloads and produces both artifacts", () => {
    const result = score([
      storedPayload("A", (n) => (n % 5) + 1),
      storedPayload("B", (n) => ((n + 1) % 5) + 1),
      storedPayload("C", (n) => ((n + 2) % 5) + 1),
      storedPayload("D", (n) => ((n + 3) % 5) + 1),
      storedPayload("E", (n) => ((n + 4) % 5) + 1),
    ]);
    expect(existsSync(RESULTS)).toBe(true);
    expect(result.summary.reviewers).toBe(5);
    expect(result.verdict.reviewers).toBe(5);
    // The bar itself, reported by the frozen scorer rather than restated here.
    expect(result.verdict).toHaveProperty("clauseRate");
    expect(result.verdict).toHaveProperty("clauseOwnGroups");
    expect(result.verdict).toHaveProperty("clauseMaxModelGroup");
    expect(typeof result.verdict.pass).toBe("boolean");
  });

  it("merges into results.json in the shape score.mjs has always written", () => {
    score([
      storedPayload("A", () => 5),
      storedPayload("B", () => 5),
      storedPayload("C", () => 5),
      storedPayload("D", () => 5),
      storedPayload("E", () => 5),
    ]);
    const merged = JSON.parse(readFileSync(RESULTS, "utf8"));
    expect(merged).toHaveLength(5);
    for (const entry of merged) {
      expect(Object.keys(entry).sort()).toEqual(["ok", "result", "reviewer"]);
      expect(Object.keys(entry.result).sort()).toEqual(["groups", "ratings"]);
    }
  });

  it("still refuses any reviewer count other than five", () => {
    expect(() => score([storedPayload("A", () => 4), storedPayload("B", () => 4)])).toThrow();
  });
});

describe("synthetic submissions cannot reach the real scorer input", () => {
  const adapter = readFileSync(path.join(ROOT, "scripts/human-test/score-stored.mjs"), "utf8");
  /** Comments stripped: the adapter documents why the synthetic table exists; its code must
   *  never name it. Asserting on the source with prose included would forbid the explanation. */
  const code = adapter.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("reads only the real table, and never names the synthetic one", () => {
    expect(code).toContain('const TABLE = "human_test_1_responses"');
    // The separation is structural: a synthetic row is in another table, so there is no row for
    // a `where` clause to miss and no filter here that could be dropped by mistake.
    expect(code).not.toContain("human_test_1_test_responses");
    const tables = [...code.matchAll(/\.from\(([^)]*)\)/g)].map((m) => m[1]!.trim());
    expect(tables).toEqual(["TABLE"]);
  });

  it("never loads the answer key or the item manifest", () => {
    expect(code).not.toMatch(/human-test-key|human-test-items/);
  });

  it("delegates scoring to the frozen script rather than reimplementing it", () => {
    expect(code).toContain("scripts/human-test/score.mjs");
    expect(code).not.toMatch(/medianModelDesignedRate|maxModelGroup|>=\s*0?\.7/);
  });
});

describe("the frozen scoring path is untouched by this change", () => {
  it.each([
    "proof-b/score-human.js",
    "proof-b/human-test-key.txt",
    "proof-b/human-test-form.md",
    "proof-b/human-test-items.json",
    "scripts/human-test/score.mjs",
  ])("%s is unmodified relative to the merge base", (file) => {
    const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    const diff = execFileSync("git", ["diff", "--name-only", base, "--", file], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(diff.trim()).toBe("");
  });
});
