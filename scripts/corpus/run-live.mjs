#!/usr/bin/env node
/**
 * Run the creative-understanding corpus through the production generation pipeline against a
 * hosted Supabase project (`tests/live/corpus.live.test.ts`). Live and metered: real model calls,
 * about $0.10 a card, under the project's daily spend ceiling.
 *
 *   SUPABASE_ACCESS_TOKEN=… OPENAI_API_KEY=… \
 *     node scripts/corpus/run-live.mjs preview [CU-01,CU-03,…] [--out <dir>]
 *
 * The project's keys are fetched with the management token and handed to the test process in its
 * environment only; nothing is printed or written. Generation is switched on for that process
 * alone. Its rate-limit keys use a fresh per-run secret, so the run counts against the database's
 * spend ceiling but not against a deployment's host caps.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Node 22 strips types from .ts imports; the token is validated by the app's secret schema.
import { supabaseAccessToken } from "../../src/lib/env.ts";

/** The hosted projects (`docs/development-plan.md`, "Database"). Not secrets. */
const PROJECTS = { preview: "ihdaifbyvlvivuctkrwn" };

const args = process.argv.slice(2);
const target = args[0];
const ref = PROJECTS[target];
if (!ref) {
  console.error("usage: run-live.mjs preview [CASE,CASE,…] [--out <dir>]");
  process.exit(2);
}
const outFlag = args.indexOf("--out");
const out = path.resolve(outFlag >= 0 ? args[outFlag + 1] : "corpus-out");
const cases = args[1] && !args[1].startsWith("--") ? args[1] : "";

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${supabaseAccessToken()}` },
});
if (!res.ok) {
  console.error(`could not read the project's API keys: HTTP ${res.status}`);
  process.exit(1);
}
const keys = await res.json();
const anon = keys.find((k) => k.name === "anon")?.api_key;
const service = keys.find((k) => k.name === "service_role")?.api_key;
if (!anon || !service) {
  console.error("the project has no anon or service_role key");
  process.exit(1);
}

const child = spawn("npx", ["vitest", "run", "--project", "live"], {
  stdio: "inherit",
  env: {
    ...process.env,
    LIVE_CORPUS: "1",
    CORPUS_OUT: out,
    CORPUS_CASES: cases,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    GENERATION_ENABLED: "true",
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
