import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

export function databaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for tests/db (see .env.example)");
  }
  return url;
}

/** Drops and recreates the schemas the migrations own, installs the auth stub, applies migrations in order. */
export async function resetDatabase(client: Client): Promise<void> {
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

/** Resolves to the Postgres error's code, message and detail when `p` rejects, otherwise null. */
export async function pgError(
  p: Promise<unknown>,
): Promise<{ code: string; message: string; detail?: string } | null> {
  try {
    await p;
    return null;
  } catch (error) {
    const e = error as { code?: string; message?: string; detail?: string };
    return { code: e.code ?? "unknown", message: e.message ?? "", detail: e.detail };
  }
}

type CardDesignFixture = { round?: number; shape?: string; layout?: string; artMode?: string };

/** Inserts a generated card design the way server code will (as the connecting superuser). */
export async function insertCardDesign(
  client: Client,
  eventId: string,
  {
    round = 1,
    shape = "rectangle",
    layout = "art-top",
    artMode = "illustration",
  }: CardDesignFixture = {},
): Promise<string> {
  const { rows } = await client.query(
    `insert into public.card_designs
       (event_id, round, name, description, shape, layout, art_mode, typography, wording,
        art_brief, raw, versions)
     values ($1, $2, 'Garden Party', 'Soft watercolour florals over a quiet centre', $3, $4, $5,
        '{"primary":"oldstyle_garamond_worksans","alternates":["soft_fraunces_manrope"]}',
        '{"title":"Oh Baby","invitationLine":"Please join us for a baby shower"}',
        '{"subject":"a cluster of peonies","medium":"watercolour","mood":"tender","palette":"blush","texture":"cold-press paper","avoid":"text"}',
        '{"presentation":{"name":"Garden Party"}}',
        '{"designPrompt":"card_design_v1","designSchema":"card_design_schema_v1","layoutSet":"card_layouts_v1","compiler":"card_compiler_v1"}')
     returning id`,
    [eventId, round, shape, layout, artMode],
  );
  return rows[0].id as string;
}

export const PORTRAIT_SHAPES = ["rectangle", "rounded-rectangle", "arch", "oval"];

/** Inserts an artwork record for a design; by default a portrait asset fitting all four 5:7 shapes. */
export async function insertCardArt(
  client: Client,
  eventId: string,
  designId: string,
  {
    proportion = "portrait_5_7",
    fitsShapes = PORTRAIT_SHAPES,
  }: { proportion?: string; fitsShapes?: string[] } = {},
): Promise<string> {
  const ink = Object.fromEntries(fitsShapes.map((shape) => [shape, { main: { ink: "#2b2118" } }]));
  const { rows } = await client.query(
    `insert into public.card_art_assets
       (event_id, card_design_id, proportion, fits_shapes, storage_key, mime_type, width, height,
        size_bytes, ink, image_model, art_prompt_version)
     values ($1, $2, $3, $4::public.card_shape[], $5, 'image/png', 1440, $6, 4200000, $7,
        'gpt-image-2.5-sunburst', 'card_art_v1')
     returning id`,
    [
      eventId,
      designId,
      proportion,
      fitsShapes,
      `events/${eventId}/${randomUUID()}.png`,
      proportion === "portrait_5_7" ? 2016 : 1440,
      ink,
    ],
  );
  return rows[0].id as string;
}
