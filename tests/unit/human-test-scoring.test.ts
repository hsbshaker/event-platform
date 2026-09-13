import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

/**
 * `score.mjs` writes into `docs/human-test-1/` by design, so exercising it necessarily touches
 * the very files the real run records its outcome in. While they do not exist there is nothing
 * to lose and the run is the best evidence available; once the study has actually been scored
 * these stand down permanently rather than overwrite a result and rely on cleanup surviving a
 * killed run.
 */
describe.skipIf(savedResults !== null || savedScore !== null)(
  "a stored response feeds the frozen scorer unchanged",
  () => {
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
  },
);

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

/**
 * The frozen scoring path, pinned by content.
 *
 * Digests rather than a diff against a ref: `origin/main` is not a fetched remote-tracking ref
 * in CI's depth-1 checkout, and a "changed since the merge base" test also becomes vacuous the
 * moment this branch merges, since the merge base is then the commit itself. A digest says the
 * same thing permanently and without git. Update one only with a deliberate, reviewed change to
 * the protocol — which is exactly the event this exists to make impossible to do by accident.
 */
const FROZEN: readonly (readonly [string, string])[] = [
  ["proof-b/score-human.js", "d2defeb6dc55f30ae57176d17f47621db44ea11fa6ac261a3d67c34448993034"],
  [
    "proof-b/human-test-key.txt",
    "fe877aff9c22c890aafa53e789aabe69f9fd82541f02ff0fa41884ab4f98a367",
  ],
  [
    "proof-b/human-test-form.md",
    "59a286805b129e44ed6881a19461423c7019a88f32695f9e1fb76fa036fbc988",
  ],
  [
    "proof-b/human-test-items.json",
    "4a126c531ba005973a1f0495827597613f2a965aeb10afb4269cf922da25e422",
  ],
  [
    "scripts/human-test/score.mjs",
    "dfcb05245588563966b6854e21ef3bfd88bbe4ecb00c640da3e8ddb668f5b2cf",
  ],
];

describe("the frozen scoring path is untouched by this change", () => {
  it.each(FROZEN)("%s is byte-for-byte the frozen file", (file, digest) => {
    const contents = readFileSync(path.join(ROOT, file));
    expect(createHash("sha256").update(contents).digest("hex")).toBe(digest);
  });

  it("pins the sheets the reviewer actually judges", () => {
    // Listed here as well as in the blinding suite: there, they must match what is published;
    // here, they must still be the artifact the key was written against.
    for (const [file, digest] of [
      ["docs/human-test-1/sheets/human-test-1280-gray-unlabeled.png", "959d65a96c043eaf"],
      ["docs/human-test-1/sheets/human-test-390-gray-unlabeled.png", "6ffeacf51e4c0cff"],
    ] as const) {
      const contents = readFileSync(path.join(ROOT, file));
      expect(createHash("sha256").update(contents).digest("hex").slice(0, 16)).toBe(digest);
    }
  });
});
