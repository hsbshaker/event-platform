/**
 * Scores Human Test #1 from the responses reviewers submitted online.
 *
 *   node scripts/human-test/score-stored.mjs                 # list what is stored
 *   node scripts/human-test/score-stored.mjs --write         # save the five and score them
 *   node scripts/human-test/score-stored.mjs --write --id A --id B --id C --id D --id E
 *
 * Reviewers used to download a JSON file and send it back; now they tap **Submit feedback** and
 * the response lands in `human_test_1_responses`. This is the other half of that change: it
 * reads those rows, writes them to `docs/human-test-1/responses/*.json` in exactly the shape the
 * page used to produce, and then runs `scripts/human-test/score.mjs` — unmodified, on unmodified
 * files — so `docs/human-test-1/results.json` and `docs/human-test-1/score.json` come out of the
 * same frozen path against the same frozen key as before. Nothing here scores anything itself,
 * and nothing here reads the key.
 *
 * # Only the five real reviewers
 *
 * It reads `human_test_1_responses` and nothing else. Synthetic submissions used to verify the
 * deployed flow are written to a different table (`human_test_1_test_responses`), so they are
 * excluded by the schema rather than by a filter this script could get wrong.
 *
 * The protocol needs exactly five reviewers — the bar is a median over them — so a set that is
 * not exactly five is refused with the candidates printed rather than resolved by guesswork. By
 * default each distinct reviewer name contributes their earliest submission; `--id` selects rows
 * explicitly when that is not the right answer (a reviewer who submitted twice from two
 * sessions, a test row that reached the real table, a sixth person who answered).
 *
 * # Not an endpoint
 *
 * Run from a terminal with the service role. Scoring is never exposed over HTTP: the score is
 * the thing reviewers must not see.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RESPONSES_DIR = path.join(ROOT, "docs/human-test-1/responses");
const REQUIRED_REVIEWERS = 5;
const SCREEN_COUNT = 40;
/** The real table. Never `human_test_1_test_responses`. */
const TABLE = "human_test_1_responses";

/** Minimal `.env.local` support, so this runs the way the rest of the repo is configured. */
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

/**
 * A stored payload should already be well formed — the submit endpoint validated it strictly
 * before writing. This is the belt to that braces: a row that is not a complete review would
 * otherwise reach the frozen scorer, which divides by the number of rated screens and would
 * quietly produce a number rather than an error.
 */
function integrityProblems(payload) {
  const problems = [];
  if (typeof payload?.reviewer !== "string" || payload.reviewer.trim() === "") {
    problems.push("no reviewer");
  }
  const groups = payload?.result?.groups;
  const ratings = payload?.result?.ratings;
  if (!Array.isArray(groups)) problems.push("no groups");
  if (!ratings || typeof ratings !== "object") problems.push("no ratings");
  if (Array.isArray(groups) && ratings && typeof ratings === "object") {
    const seen = new Set();
    for (const group of groups) for (const n of group ?? []) seen.add(n);
    if (seen.size !== SCREEN_COUNT)
      problems.push(`groups cover ${seen.size}/${SCREEN_COUNT} screens`);
    const rated = Object.keys(ratings).length;
    if (rated !== SCREEN_COUNT) problems.push(`${rated}/${SCREEN_COUNT} ratings`);
    for (const [screen, value] of Object.entries(ratings)) {
      if (!Number.isInteger(value) || value < 1 || value > 5)
        problems.push(`rating ${screen}=${value}`);
    }
  }
  return problems;
}

function slug(reviewer, used) {
  const base =
    reviewer
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .replace(/^-|-$/g, "") || "reviewer";
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base}-${n++}`;
  used.add(name);
  return name;
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see .env.example).",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const chosenIds = args.flatMap((arg, i) => (args[i - 1] === "--id" ? [arg] : []));

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase
  .from(TABLE)
  .select("id, reviewer, response_payload, created_at")
  .order("created_at", { ascending: true });
if (error) {
  console.error(`could not read ${TABLE}: ${error.message}`);
  process.exit(1);
}

const rows = data ?? [];
console.log(`${rows.length} stored response(s) in ${TABLE}:`);
for (const row of rows) {
  const problems = integrityProblems(row.response_payload);
  console.log(
    `  ${row.id}  ${row.created_at}  ${JSON.stringify(row.reviewer)}` +
      (problems.length ? `  INCOMPLETE: ${problems.join(", ")}` : ""),
  );
}

// Default selection: the earliest submission from each distinct reviewer name.
const byReviewer = new Map();
for (const row of rows) {
  const name = row.reviewer.trim().toLowerCase();
  if (!byReviewer.has(name)) byReviewer.set(name, row);
}
const selected = chosenIds.length
  ? chosenIds.map((id) => {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        console.error(`\nno stored response with id ${id}`);
        process.exit(1);
      }
      return row;
    })
  : [...byReviewer.values()];

if (!write) {
  console.log(`\nwould score ${selected.length} response(s). Re-run with --write to score.`);
  process.exit(0);
}

if (selected.length !== REQUIRED_REVIEWERS) {
  console.error(
    `\nthe protocol requires exactly ${REQUIRED_REVIEWERS} reviewers; ${selected.length} selected.` +
      `\nSelect explicitly with: --id <id> (five times).`,
  );
  process.exit(1);
}

const incomplete = selected.filter((row) => integrityProblems(row.response_payload).length > 0);
if (incomplete.length > 0) {
  console.error(`\nrefusing to score: ${incomplete.map((r) => r.id).join(", ")} are incomplete.`);
  process.exit(1);
}

// Written in the exact shape `review.html` produced and `score.mjs` reads, so the archived
// per-reviewer files stay the same artifact they always were.
const used = new Set();
const files = selected.map((row) => {
  const payload = row.response_payload;
  const file = path.join(RESPONSES_DIR, `${slug(payload.reviewer, used)}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 1));
  console.log(`\nwrote ${path.relative(ROOT, file)}  (${row.id})`);
  return file;
});

// The frozen path, unchanged and unpatched: same script, same scorer, same key, same outputs.
execFileSync("node", [path.join(ROOT, "scripts/human-test/score.mjs"), ...files], {
  cwd: ROOT,
  stdio: "inherit",
});
