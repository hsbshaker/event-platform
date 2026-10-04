#!/usr/bin/env node
/**
 * Apply the repo's pending migrations to a hosted Supabase database, in order, each in its own
 * transaction, and record them in `supabase_migrations.schema_migrations` as the Supabase CLI
 * does. Run after a migration PR merges: preview first, then production.
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/db/push-migrations.mjs <preview|production|project-ref> [--go]
 *
 * Without --go it only lists what is pending. It refuses when the database has a migration the
 * repo does not (the history has drifted), rather than guessing.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The hosted projects (`docs/development-plan.md`, "Database"). Not secrets. */
const PROJECTS = {
  preview: "ihdaifbyvlvivuctkrwn",
  production: "oirndvezdrvdnudjicdk",
};

const [target, flag] = process.argv.slice(2);
const ref = PROJECTS[target] ?? target;
if (!ref) {
  console.error("usage: push-migrations.mjs <preview|production|project-ref> [--go]");
  process.exit(2);
}
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(2);
}

async function sql(query) {
  for (let attempt = 1; ; attempt += 1) {
    let res;
    try {
      res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 2000)}`);
    return text ? JSON.parse(text) : [];
  }
}

const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const versionOf = (file) => file.split("_")[0];

const applied = new Set(
  (await sql(`select version from supabase_migrations.schema_migrations order by version`)).map(
    (r) => r.version,
  ),
);
const unknown = [...applied].filter((v) => !files.some((f) => versionOf(f) === v));
if (unknown.length > 0) {
  console.error(`${target}: the database has migrations the repo does not: ${unknown.join(", ")}`);
  process.exit(1);
}
const pending = files.filter((f) => !applied.has(versionOf(f)));
if (pending.length === 0) {
  console.log(`${target}: up to date (${applied.size} migrations)`);
  process.exit(0);
}
console.log(`${target}: pending ${pending.join(", ")}`);
if (flag !== "--go") {
  console.log("dry run: pass --go to apply");
  process.exit(0);
}
for (const file of pending) {
  const version = versionOf(file);
  const name = file.replace(/\.sql$/, "").slice(version.length + 1);
  const body = readFileSync(path.join(dir, file), "utf8");
  await sql(
    `begin;\n${body}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');\ncommit;`,
  );
  console.log(`${target}: applied ${file}`);
}
