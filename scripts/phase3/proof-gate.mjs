#!/usr/bin/env node
/**
 * The Phase 3 reference-proof gate, run so that it leaves `proof-b/` exactly as it found it.
 *
 * `proof-b/` is frozen evidence: `FREEZE.md` pins its hashes, and `CLAUDE.md` treats the proof
 * phases as the record of what those phases decided. But `adv-run.js` is a harness script, and
 * harness scripts write — screenshots into `shots/adv/`, spec bundles into `specs/adv/`, and
 * render results over `fixtures/adversarial-render.json`, which is itself tracked.
 *
 * Two consequences this wrapper exists to prevent:
 *
 * 1. **transient outputs leaking into a PR.** 112 generated files reached PR #8 this way before
 *    anyone noticed. They are gitignored now, and this gate removes them regardless;
 * 2. **a frozen artifact being silently rewritten.** If the adversarial render results ever stop
 *    matching what Phase B recorded, that is a regression signal — the whole point of frozen
 *    evidence — so this gate treats `adversarial-render.json` as an assertion target and fails
 *    rather than committing the new bytes.
 *
 * Exits non-zero if a gate fails, if a frozen artifact changed, or if `proof-b/` is left dirty.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROOF = path.join(ROOT, "proof-b");

/** Outputs the harness writes that are not evidence. Removed whether or not a gate failed. */
const TRANSIENT = ["shots/adv", "specs/adv"];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
}

function cleanTransient() {
  for (const dir of TRANSIENT) {
    const full = path.join(PROOF, dir);
    if (existsSync(full)) rmSync(full, { recursive: true, force: true });
  }
}

const before = git("status", "--porcelain", "--", "proof-b");
if (before) {
  console.error("proof-b/ is dirty before the gate runs:\n" + before);
  console.error(
    "Commit, stash or clean it first — this gate cannot tell your changes from its own.",
  );
  process.exit(1);
}

let gatesPassed = true;
for (const script of ["test.js", "adv-run.js"]) {
  process.stdout.write(`\n── proof-b/${script} ─────────────────────────────────\n`);
  try {
    execFileSync("node", [script], { cwd: PROOF, stdio: "inherit" });
  } catch {
    gatesPassed = false;
    fail(`proof-b/${script} failed`);
  }
}

cleanTransient();

const after = git("status", "--porcelain", "--", "proof-b");
if (after) {
  fail(
    "the proof gates left `proof-b/` dirty:\n" +
      after +
      "\n\nIf a tracked file changed, the reference behaviour moved and that is the finding — " +
      "investigate it rather than committing the new bytes. If an untracked file appeared, add it " +
      "to TRANSIENT in this script or to .gitignore.",
  );
  // Restore tracked files so a failed run does not leave the tree modified either.
  git("checkout", "--", "proof-b");
} else if (gatesPassed) {
  console.log("\n✓ proof gates passed and proof-b/ is clean");
}
