import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

/**
 * Hosts this harness is allowed to touch.
 *
 * Every test in `tests/db` begins by dropping `public`, `auth` and `extensions`. That is correct
 * for a scratch database and catastrophic for any other one: it destroys every table, every row
 * and every auth user, and there is no undo.
 *
 * Nothing used to stop it. `TEST_DATABASE_URL` was read and handed straight to `pg`, so a
 * connection string for a real project — pasted into the wrong variable, inherited from a shell,
 * or set in an agent's environment — would have been accepted in silence and the first `beforeAll`
 * would have wiped it. That is not hypothetical: it came within one failed TCP connection of
 * happening to this project's live Supabase database, and the only thing that prevented it was an
 * unrelated network policy.
 *
 * So the harness refuses to run anywhere but loopback. A scratch database is always local — CI
 * starts one in a container on `127.0.0.1`, and `supabase start` binds locally — so this costs
 * nothing legitimate. There is deliberately **no override**: an escape hatch is the first thing
 * reached for under time pressure, which is exactly when this check is protecting something. If
 * you genuinely need to point it elsewhere, edit this list, and let the diff say so out loud.
 */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

function assertLoopback(host: string | undefined, source: string): void {
  // `127.0.0.1` covers the common case; the whole `127/8` block is loopback too.
  const normalized = (host ?? "").replace(/^\[|\]$/g, "");
  if (ALLOWED_HOSTS.has(normalized) || /^127\./.test(normalized)) return;
  throw new Error(
    `tests/db refuses to run against ${JSON.stringify(normalized)} (${source}).\n` +
      "This harness DROPS the public, auth and extensions schemas before every run. It is only " +
      "ever meant to run against a scratch database on localhost.\n" +
      "If you are trying to apply migrations to a real database, this is the wrong tool: apply " +
      "supabase/migrations directly and never through tests/db.",
  );
}

export function databaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for tests/db (see .env.example)");
  }
  // Parsed rather than pattern-matched, so a host cannot hide in userinfo or a query parameter.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  assertLoopback(parsed.hostname, "TEST_DATABASE_URL");
  return url;
}

/** Drops and recreates the schemas the migrations own, installs the auth stub, applies migrations in order. */
export async function resetDatabase(client: Client): Promise<void> {
  // Checked again, on the connection itself. `databaseUrl()` guards the URL this module hands out,
  // but `resetDatabase` takes a client someone else may have built — and this is the last line
  // before the drops, so it is the one that has to hold.
  assertLoopback(
    (client as unknown as { host?: string }).host,
    "the client passed to resetDatabase()",
  );
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists extensions cascade;
    create schema public;
    grant all on schema public to public;
  `);
  await client.query(readFileSync(path.join(import.meta.dirname, "auth-stub.sql"), "utf8"));
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await client.query(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  return client;
}

export type Actor = { kind: "anon" } | { kind: "user"; id: string } | { kind: "service" };

/**
 * Runs `fn` inside a transaction impersonating a PostgREST request for `actor`:
 * sets the role and JWT claims the way Supabase's API layer does, then rolls back
 * so each call starts from the same fixture state.
 */
export async function asActor<T>(
  client: Client,
  actor: Actor,
  fn: (q: (sql: string, params?: unknown[]) => Promise<import("pg").QueryResult>) => Promise<T>,
  { commit = false }: { commit?: boolean } = {},
): Promise<T> {
  await client.query("begin");
  try {
    if (actor.kind === "anon") {
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      await client.query("set local role anon");
    } else if (actor.kind === "user") {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: actor.id, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
    } else {
      await client.query(
        `select set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
      );
      await client.query("set local role service_role");
    }
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/** Resolves to the Postgres error code when `p` rejects, otherwise to null. */
export async function errorCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

export async function createAuthUser(
  client: Client,
  email: string,
  name?: string,
): Promise<string> {
  const { rows } = await client.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify(name ? { full_name: name } : {})],
  );
  return rows[0].id as string;
}
