/**
 * `insert` and `update` over the shared read-only shim, for smokes that drive a real PostgreSQL.
 *
 * Still transport, never behaviour: each statement is the one PostgREST would issue for the same
 * builder call, and every constraint, trigger and `security definer` function below it is the real
 * database's. It lives here rather than in `tests/db/supabase-shim.ts` so a smoke cannot change
 * what the existing DB suite is testing, and rather than inside one smoke so a second one does not
 * have to copy it and drift.
 */
import type { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export function withWrites(
  client: Client,
  base: SupabaseClient<Database>,
): SupabaseClient<Database> {
  const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;
  /**
   * `jsonb` columns take JSON text.
   *
   * PostgREST sends the whole row as JSON, so a `jsonb` column arrives as JSON either way. Over
   * `pg`, a plain object is serialized for us but a JS **array** is turned into a Postgres array
   * literal — `{}` for `[]` — which `jsonb` then rejects as invalid JSON. Every object and array
   * this path inserts targets a json column, so both are stringified and nothing else is touched.
   */
  const encode = (value: unknown) =>
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value;
  const shim = {
    rpc: base.rpc.bind(base),
    from(table: string) {
      const inner = (base as unknown as { from: (t: string) => unknown }).from(table) as Record<
        string,
        unknown
      >;
      return {
        select: inner.select,
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = Array.isArray(rows) ? rows : [rows];
          const columns = Object.keys(list[0]);
          const values: unknown[] = [];
          const tuples = list.map(
            (row) =>
              `(${columns
                .map((c) => {
                  values.push(encode(row[c]));
                  return `$${values.length}`;
                })
                .join(", ")})`,
          );
          const run = async (returning: string) => {
            try {
              const result = await client.query(
                `insert into public.${quote(table)} (${columns.map(quote).join(", ")}) ` +
                  `values ${tuples.join(", ")}${returning}`,
                values,
              );
              return { data: result.rows, error: null };
            } catch (error) {
              const e = error as { code?: string; message?: string };
              return { data: null, error: { code: e.code, message: e.message ?? String(error) } };
            }
          };
          const chain = {
            select: (cols = "*") => ({
              maybeSingle: async () => {
                const r = await run(` returning ${cols === "*" ? "*" : cols}`);
                return r.error
                  ? { data: null, error: r.error }
                  : { data: (r.data as unknown[])[0] ?? null, error: null };
              },
              then: (resolve: (v: unknown) => unknown) =>
                run(` returning ${cols === "*" ? "*" : cols}`).then(resolve),
            }),
            then: (resolve: (v: unknown) => unknown) => run("").then(resolve),
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          const sets: string[] = [];
          const values: unknown[] = [];
          for (const [k, v] of Object.entries(patch)) {
            values.push(encode(v));
            sets.push(`${quote(k)} = $${values.length}`);
          }
          return {
            eq: async (column: string, value: unknown) => {
              values.push(value);
              try {
                await client.query(
                  `update public.${quote(table)} set ${sets.join(", ")} ` +
                    `where ${quote(column)} = $${values.length}`,
                  values,
                );
                return { data: null, error: null };
              } catch (error) {
                const e = error as { code?: string; message?: string };
                return { data: null, error: { code: e.code, message: e.message ?? String(error) } };
              }
            },
          };
        },
      };
    },
  };
  return shim as unknown as SupabaseClient<Database>;
}
