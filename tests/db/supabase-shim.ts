import { types as pgTypes, type Client, type QueryResult } from "pg";

import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A `SupabaseClient`-shaped adapter over a raw `pg` connection.
 *
 * T10's guarantees are transactional — a conditional state transition, a claim insert inside the
 * cap transaction, two completers racing on one row lock — and none of them can be proven against
 * a stubbed query builder. They need a real database, and the code under test speaks supabase-js.
 * So this translates the small surface the orchestrator and the T9A claim functions actually use
 * into SQL, and everything below it is genuinely Postgres.
 *
 * It is a test double for the *transport*, never for the behaviour: every query it issues is the
 * one the production client would issue, and every RPC runs the real `security definer` function.
 *
 * Two deliberate fidelity details, because getting them wrong would make the tests agree with a
 * client that does not exist:
 *
 * - **Timestamps come back as ISO strings.** PostgREST returns JSON; node-postgres parses
 *   `timestamptz` into a `Date`. Code that does `Date.parse(claim.claimed_at)` would work here and
 *   break in production, or vice versa.
 * - **`numeric` stays a string**, which is what PostgREST does with values it cannot represent
 *   exactly, and what the claim code's `Number(...)` calls already expect.
 */
const ISO_TYPES = {
  getTypeParser: (oid: number, format?: unknown) =>
    oid === 1184 || oid === 1114
      ? (value: string) => (value === null ? null : new Date(value).toISOString())
      : (pgTypes.getTypeParser as (o: number, f?: unknown) => (v: string) => unknown)(oid, format),
};

type Row = Record<string, unknown>;

interface Filter {
  column: string;
  op: "eq" | "in";
  value: unknown;
}

class QueryBuilder implements PromiseLike<{ data: Row[] | null; error: unknown }> {
  private readonly filters: Filter[] = [];
  private readonly orders: string[] = [];
  private rowLimit: number | null = null;

  constructor(
    private readonly client: Client,
    private readonly table: string,
    private readonly columns: string,
  ) {}

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ column, op: "in", value });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orders.push(`${quote(column)} ${options.ascending === false ? "desc" : "asc"}`);
    return this;
  }

  limit(count: number): this {
    this.rowLimit = count;
    return this;
  }

  private build(): { text: string; values: unknown[] } {
    const values: unknown[] = [];
    const where = this.filters.map((filter) => {
      values.push(filter.value);
      return filter.op === "eq"
        ? `${quote(filter.column)} = $${values.length}`
        : `${quote(filter.column)} = any($${values.length})`;
    });
    const parts = [`select ${this.columns} from public.${quote(this.table)}`];
    if (where.length > 0) parts.push(`where ${where.join(" and ")}`);
    if (this.orders.length > 0) parts.push(`order by ${this.orders.join(", ")}`);
    if (this.rowLimit !== null) parts.push(`limit ${Number(this.rowLimit)}`);
    return { text: parts.join(" "), values };
  }

  then<R1, R2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const { text, values } = this.build();
    return this.client
      .query({ text, values, types: ISO_TYPES })
      .then((result: QueryResult) => ({ data: result.rows as Row[], error: null }))
      .catch((error: unknown) => ({ data: null, error }))
      .then(onfulfilled, onrejected);
  }
}

/**
 * `.insert(rows).select(columns)`, as supabase-js spells it.
 *
 * Added for `reserveArtworkSlots`, whose only real logic is what it does when the insert
 * *conflicts*: a replayed driver must converge on the rows that exist rather than raise. That
 * branch is reached through `error.code === "23505"`, so it can only be exercised against a
 * database that actually raises it — a stubbed builder would be the test agreeing with itself.
 *
 * `error` is the `pg` error object, which carries `code` in the same place PostgREST's does.
 */
class InsertBuilder implements PromiseLike<{ data: Row[] | null; error: unknown }> {
  private columns: string | null = null;

  constructor(
    private readonly client: Client,
    private readonly table: string,
    private readonly rows: readonly Row[],
  ) {}

  select(columns = "*"): this {
    this.columns = columns;
    return this;
  }

  maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }> {
    return this.then((result) => ({
      data: result.data && result.data.length > 0 ? result.data[0] : null,
      error: result.error,
    }));
  }

  then<R1, R2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    if (this.rows.length === 0) {
      return Promise.resolve({ data: [] as Row[], error: null }).then(onfulfilled, onrejected);
    }
    // One multi-row INSERT, because that is what supabase-js sends: a batch that conflicts
    // conflicts as a whole, and a per-row loop would hide exactly that.
    const columns = Object.keys(this.rows[0]);
    const values: unknown[] = [];
    const tuples = this.rows.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const text =
      `insert into public.${quote(this.table)} (${columns.map(quote).join(", ")}) ` +
      `values ${tuples.join(", ")}` +
      (this.columns === null ? "" : ` returning ${this.columns}`);
    return this.client
      .query({ text, values, types: ISO_TYPES })
      .then((result: QueryResult) => ({ data: result.rows as Row[], error: null }))
      .catch((error: unknown) => ({ data: null, error }))
      .then(onfulfilled, onrejected);
  }
}

const quote = (identifier: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`unsafe identifier: ${identifier}`);
  return identifier;
};

/**
 * PostgREST returns a scalar-returning function's value directly and a set-returning one's rows as
 * an array. The single column named after the function is how it tells them apart, and so is this.
 */
function rpcResult(name: string, result: QueryResult): unknown {
  if (result.fields.length === 1 && result.fields[0].name === name) {
    return result.rows.length > 0 ? (result.rows[0] as Row)[name] : null;
  }
  return result.rows;
}

export function supabaseShim(client: Client): SupabaseClient<Database> {
  const shim = {
    from(table: string) {
      return {
        select: (columns = "*") => new QueryBuilder(client, table, columns),
        insert: (rows: Row | readonly Row[]) =>
          new InsertBuilder(client, table, Array.isArray(rows) ? rows : [rows as Row]),
      };
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const entries = Object.entries(args);
      const placeholders = entries.map(([key], i) => `${quote(key)} => $${i + 1}`);
      const text = `select * from public.${quote(name)}(${placeholders.join(", ")})`;
      try {
        const result = await client.query({
          text,
          values: entries.map(([, value]) => value),
          types: ISO_TYPES,
        });
        return { data: rpcResult(name, result), error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
  return shim as unknown as SupabaseClient<Database>;
}
