#!/usr/bin/env node
/**
 * Split shared Vercel environment variables into per-target values.
 *
 * Vercel lets one entry cover Production and Preview at once, which is convenient until the two
 * environments must differ — a separate database per environment, or a secret that must not be
 * shared so a token minted in preview cannot be replayed against production. Splitting by hand is
 * error-prone in a specific way: the obvious route is to delete the combined entry and recreate
 * two, and `sensitive`-typed values cannot be read back, so the preview value is destroyed in the
 * process.
 *
 * So this narrows the existing entry to Preview with a PATCH — which preserves a value nobody can
 * read — and only then adds a Production entry. Nothing is ever deleted.
 *
 * Reads `VERCEL_TOKEN` from the environment, or `--token <value>` when the environment cannot
 * carry it. Values are never printed.
 *
 * Usage:
 *   node scripts/ops/vercel-env-split.mjs --project <prj_id> --plan <file.json> [--apply]
 *
 * The plan file holds no secrets, so it can live in the repository as a record of the split. Each
 * entry names a type and how to source its production value:
 *
 *   { "value": "literal" }                 a non-secret literal, e.g. a URL
 *   { "fromSupabase": "publishable" }      fetched from --supabase-ref at run time
 *   { "fromSupabase": "secret" }           likewise
 *   { "generate": "base64:48" }            a fresh random secret, generated and never printed
 *
 * Without `--apply` it reports what it would do and changes nothing.
 */

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const APPLY = args.includes("--apply");
const PROJECT = arg("project");
const PLAN_FILE = arg("plan");
const SUPABASE_REF = arg("supabase-ref");
const TOKEN = arg("token") ?? process.env.VERCEL_TOKEN;
const SUPABASE_TOKEN = arg("supabase-token") ?? process.env.SUPABASE_ACCESS_TOKEN;

if (!PROJECT || !PLAN_FILE || !TOKEN) {
  console.error("usage: --project <prj_id> --plan <file.json> [--token <t>] [--apply]");
  console.error("       VERCEL_TOKEN may supply the token instead of --token");
  process.exit(2);
}

const api = (path, init = {}) =>
  fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

const plan = JSON.parse(await (await import("node:fs/promises")).readFile(PLAN_FILE, "utf8"));

/** Resolves each entry's production value. Secrets are fetched or generated here and never logged. */
async function resolveValues(entries) {
  const needsSupabase = entries.some(([, s]) => s.fromSupabase);
  let keys = null;
  if (needsSupabase) {
    if (!SUPABASE_REF || !SUPABASE_TOKEN) {
      console.error("plan needs Supabase keys: pass --supabase-ref and SUPABASE_ACCESS_TOKEN");
      process.exit(2);
    }
    const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/api-keys`, {
      headers: { Authorization: `Bearer ${SUPABASE_TOKEN}` },
    });
    if (!res.ok) {
      console.error(`could not read Supabase keys: HTTP ${res.status}`);
      process.exit(1);
    }
    keys = await res.json();
  }
  const { randomBytes } = await import("node:crypto");
  return entries.map(([key, spec]) => {
    let value = spec.value;
    if (spec.fromSupabase) {
      value = keys.find((k) => k.type === spec.fromSupabase)?.api_key;
      if (!value) {
        console.error(`Supabase project has no ${spec.fromSupabase} key`);
        process.exit(1);
      }
    } else if (spec.generate) {
      const [, bytes] = spec.generate.split(":");
      value = randomBytes(Number(bytes)).toString("base64");
    }
    if (value === undefined) {
      console.error(`${key}: no value, fromSupabase or generate`);
      process.exit(2);
    }
    return [key, { ...spec, value }];
  });
}

const listed = await api(`/v9/projects/${PROJECT}/env?decrypt=false`);
if (!listed.ok) {
  console.error(`could not list env: HTTP ${listed.status}`);
  process.exit(1);
}
const envs = (await listed.json()).envs ?? [];

console.log(APPLY ? "APPLYING" : "DRY RUN — nothing will change");
console.log();

let failures = 0;
for (const [key, spec] of await resolveValues(Object.entries(plan))) {
  const combined = envs.filter(
    (e) =>
      e.key === key &&
      (e.target ?? []).includes("production") &&
      (e.target ?? []).includes("preview"),
  );
  if (combined.length !== 1) {
    console.log(`  ~ ${key}: expected one combined entry, found ${combined.length} — skipped`);
    continue;
  }
  const [existing] = combined;
  console.log(`  ${key}`);
  console.log(`     narrow existing entry to preview (preserves its unreadable value)`);
  const source = spec.fromSupabase
    ? `supabase ${spec.fromSupabase} key`
    : spec.generate
      ? `freshly generated (${spec.generate})`
      : "literal from plan";
  console.log(`     add production entry, type=${spec.type}, value: ${source}`);
  if (!APPLY) continue;

  const narrowed = await api(`/v9/projects/${PROJECT}/env/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ target: ["preview"] }),
  });
  if (!narrowed.ok) {
    console.log(`     ! PATCH failed: HTTP ${narrowed.status} — production entry NOT added`);
    failures++;
    continue;
  }
  const added = await api(`/v10/projects/${PROJECT}/env`, {
    method: "POST",
    body: JSON.stringify({ key, value: spec.value, type: spec.type, target: ["production"] }),
  });
  if (!added.ok) {
    const body = await added.text();
    console.log(`     ! POST failed: HTTP ${added.status} ${body.slice(0, 140)}`);
    console.log(
      `       NOTE: the existing entry is now preview-only. Re-run to finish, or restore by hand.`,
    );
    failures++;
    continue;
  }
  console.log(`     done`);
}

console.log();
console.log(failures ? `${failures} failure(s)` : APPLY ? "all applied" : "dry run complete");
process.exit(failures ? 1 : 0);
