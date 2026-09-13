/**
 * Human design test #1: merge per-reviewer JSON files (from docs/human-test-1/review.html)
 * into one results array and score them with the frozen proof-b scorer and key.
 *
 *   node scripts/human-test/score.mjs docs/human-test-1/responses/*.json
 *
 * Writes docs/human-test-1/results.json (the merged input) and docs/human-test-1/score.json.
 * The pass bar is the one in proof-b/human-test-form.md, all three clauses: median reviewer
 * rates >= 70% of the model screens 4 or 5; model screens form groups of their own (per
 * reviewer, at least one group contains only model screens); no model group larger than 3.
 * The frozen scorer applies the first and third clause and reports the second as
 * `mixedGroups`/`modelGroups`; this wrapper applies the second and records the combined
 * verdict as `verdict.pass`, keeping the scorer's own `summary.pass` untouched as
 * `verdict.scorerPass`. Exactly five reviewer files are required (the protocol's reviewer
 * count; the median depends on it). This first run is calibration (CHANGELOG-v6.md), not the
 * launch gate.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const REQUIRED_REVIEWERS = 5;
const files = process.argv.slice(2);
if (files.length !== REQUIRED_REVIEWERS) {
  console.error(
    `usage: node scripts/human-test/score.mjs <exactly ${REQUIRED_REVIEWERS} reviewer files>; got ${files.length}`,
  );
  process.exit(1);
}
const responses = files.map((f) => {
  const r = JSON.parse(readFileSync(f, "utf8"));
  if (!r.reviewer || !r.result?.groups || !r.result?.ratings)
    throw new Error(`${f}: not a review file`);
  return { reviewer: r.reviewer, ok: true, result: r.result };
});
const merged = path.join(ROOT, "docs/human-test-1/results.json");
writeFileSync(merged, JSON.stringify(responses, null, 1));
const out = execFileSync("node", ["score-human.js", merged], {
  cwd: path.join(ROOT, "proof-b"),
  encoding: "utf8",
});
const scored = JSON.parse(out);
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ownGroups = scored.per.map((p) => p.modelGroups - p.mixedGroups);
const verdict = {
  reviewers: scored.per.length,
  medianModelDesignedRate: scored.summary.medianModelDesignedRate,
  clauseRate: scored.summary.medianModelDesignedRate >= 0.7,
  clauseOwnGroups: med(ownGroups) >= 1,
  clauseMaxModelGroup: scored.summary.maxModelGroup <= 3,
  scorerPass: scored.summary.pass,
};
verdict.pass = verdict.clauseRate && verdict.clauseOwnGroups && verdict.clauseMaxModelGroup;
const result = { ...scored, verdict };
writeFileSync(path.join(ROOT, "docs/human-test-1/score.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
