/**
 * Publishes the Human Test #1 reviewer survey to `public/human-test-1/`, so five reviewers can
 * open one link instead of unzipping a folder.
 *
 *   node scripts/human-test/publish-review.mjs           # copy, reporting what changed
 *   node scripts/human-test/publish-review.mjs --check   # verify only; non-zero if out of date
 *
 * `docs/human-test-1/review.html` stays the source of truth. This copies it and the two frozen
 * sheets verbatim — byte for byte, no rewriting, no minification, no templating — so there is
 * exactly one questionnaire in the repository and the published one cannot quietly become a
 * second, divergent copy of the experiment. `--check` is what CI runs
 * (`tests/unit/human-test-publish.test.ts`); it fails if anyone edits either side alone.
 *
 * # What is deliberately not published
 *
 * Only the files in `ASSETS`. Not `docs/human-test-1/README.md`, which describes how the sheet
 * is composed and what the pass bar is; not `responses/`; and nothing at all from `proof-b/`,
 * which holds the answer key (`human-test-key.txt`) and the per-screen provenance
 * (`human-test-items.json`). Reviewers must not be able to work out which screens came from
 * where, so the publish list is an allowlist of three files rather than a directory copy with
 * exclusions — a copy-everything-but rule is one new file away from leaking.
 * `tests/unit/human-test-blinding.test.ts` asserts the result independently.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIR = path.join(ROOT, "docs/human-test-1");
export const PUBLIC_DIR = path.join(ROOT, "public/human-test-1");

/** Source path (relative to docs/human-test-1) → published path (relative to the public dir). */
export const ASSETS = [
  ["review.html", "review.html"],
  ["sheets/human-test-1280-gray-unlabeled.png", "sheets/human-test-1280-gray-unlabeled.png"],
  ["sheets/human-test-390-gray-unlabeled.png", "sheets/human-test-390-gray-unlabeled.png"],
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** Every file currently under the published directory, as paths relative to it. */
function publishedFiles(dir = PUBLIC_DIR, prefix = "") {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? publishedFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

/**
 * Compares the published tree with the source. Reports drift in both directions: a stale or
 * missing published file, and — just as important — any file under `public/human-test-1/` that
 * the allowlist does not name, which is how something that should never have been public would
 * show up.
 */
export function check() {
  const problems = [];
  const expected = new Set(ASSETS.map(([, to]) => to));

  for (const [from, to] of ASSETS) {
    const source = readFileSync(path.join(SOURCE_DIR, from));
    let published;
    try {
      published = readFileSync(path.join(PUBLIC_DIR, to));
    } catch {
      problems.push(`missing: public/human-test-1/${to}`);
      continue;
    }
    if (sha256(source) !== sha256(published)) {
      problems.push(`stale: public/human-test-1/${to} differs from docs/human-test-1/${from}`);
    }
  }

  for (const file of publishedFiles()) {
    if (!expected.has(file))
      problems.push(`unexpected: public/human-test-1/${file} is not published by this script`);
  }

  return problems;
}

export function publish() {
  const written = [];
  // Cleared rather than merged: a file dropped from ASSETS must disappear from the published
  // survey, and the only way to guarantee that is to not carry anything over.
  rmSync(PUBLIC_DIR, { recursive: true, force: true });
  for (const [from, to] of ASSETS) {
    const source = readFileSync(path.join(SOURCE_DIR, from));
    const target = path.join(PUBLIC_DIR, to);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
    written.push(
      `public/human-test-1/${to}  ${statSync(target).size} bytes  ${sha256(source).slice(0, 12)}`,
    );
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv.includes("--check")) {
    const problems = check();
    if (problems.length > 0) {
      console.error("published survey assets are out of date:");
      for (const problem of problems) console.error(`  ${problem}`);
      console.error("\nrun: node scripts/human-test/publish-review.mjs");
      process.exit(1);
    }
    console.log("published survey assets match docs/human-test-1/");
  } else {
    for (const line of publish()) console.log(line);
  }
}
