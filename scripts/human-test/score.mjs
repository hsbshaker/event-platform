/**
 * Human design test #1: merge per-reviewer JSON files (from docs/human-test-1/review.html)
 * into one results array and score them with the frozen proof-b scorer and key.
 *
 *   node scripts/human-test/score.mjs docs/human-test-1/responses/*.json
 *
 * Writes docs/human-test-1/results.json (the merged input) and docs/human-test-1/score.json.
 * The pass bar is the one in proof-b/human-test-form.md: median reviewer rates >= 70% of the
 * model screens 4 or 5; no model group larger than 3. This first run is calibration
 * (CHANGELOG-v6.md), not the launch gate.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/human-test/score.mjs <reviewer files...>");
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
writeFileSync(path.join(ROOT, "docs/human-test-1/score.json"), out);
console.log(out);
console.log(`reviewers: ${responses.length} (protocol asks for five)`);
