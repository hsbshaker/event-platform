/**
 * A stand-in for the service-role Supabase client in unit tests of the meter, the provider, the
 * generation lock and the generation's orchestration: it answers the ledger and lock RPCs from
 * `state`, any other RPC from `state.rpcAnswers`, selects from `state.tables`, and Storage from
 * `state.storage`, and records every RPC, insert, select and Storage call. The SQL behind those
 * RPCs is tested against Postgres in `tests/db`.
 *
 * Use with `vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }))`,
 * or pass `fake.client` where a module takes the client as a dependency.
 */

type DbError = { message: string; code?: string };
type Row = Record<string, unknown>;

export interface FakeAdminState {
  /** heartbeat_generation's answer. */
  heartbeat: boolean;
  /** reserve_model_spend's answer: the day booked, or null at the ceiling. */
  day: string | null;
  /** start_generation's rows. */
  startRows: { generation_id: string | null; outcome: string }[];
  /** Answers for any other RPC: a value, or a function of the call's arguments. */
  rpcAnswers: Record<string, unknown>;
  /** Rows `from(table).select(...)` reads, filtered by `eq` and ordered by `order`. */
  tables: Record<string, Row[]>;
  /** Storage objects by bucket, then key. */
  storage: Record<string, Record<string, Uint8Array>>;
  /**
   * Errors by RPC name, `insert:<table>`, `select:<table>`, or `storage:<upload|remove|download|sign>`.
   */
  errors: Record<string, DbError | undefined>;
  rpcs: { name: string; args: Record<string, unknown> }[];
  inserts: { table: string; row: Record<string, unknown> }[];
  selects: { table: string; columns: string; filters: [string, unknown][] }[];
  uploads: { bucket: string; key: string; bytes: Uint8Array; options: unknown }[];
  removes: { bucket: string; keys: string[] }[];
  downloads: { bucket: string; key: string }[];
  signs: { bucket: string; key: string; expiresIn: number }[];
  /** Every call above, in order: `rpc:<name>`, `insert:<table>`, `select:<table>`, `storage:<op>`. */
  log: string[];
}

function selectQuery(state: FakeAdminState, table: string, columns: string) {
  const filters: [string, unknown][] = [];
  let ordering: { column: string; ascending: boolean } | null = null;
  let limit: number | null = null;
  const result = () => {
    state.log.push(`select:${table}`);
    state.selects.push({ table, columns, filters: [...filters] });
    const error = state.errors[`select:${table}`];
    if (error) return { data: null, error };
    let rows = (state.tables[table] ?? []).filter((row) =>
      filters.every(([column, value]) => row[column] === value),
    );
    if (ordering) {
      const { column, ascending } = ordering;
      rows = [...rows].sort((a, b) => {
        const x = a[column] as number | string;
        const y = b[column] as number | string;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (limit !== null) rows = rows.slice(0, limit);
    return { data: rows, error: null };
  };
  const query = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return query;
    },
    order(column: string, options: { ascending?: boolean } = {}) {
      ordering = { column, ascending: options.ascending ?? true };
      return query;
    },
    limit(n: number) {
      limit = n;
      return query;
    },
    async maybeSingle() {
      const { data, error } = result();
      if (error) return { data: null, error };
      return { data: data[0] ?? null, error: null };
    },
    then<T>(resolve: (value: ReturnType<typeof result>) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve(result()).then(resolve, reject);
    },
  };
  return query;
}

export function fakeAdmin() {
  const state: FakeAdminState = {
    heartbeat: true,
    day: "2026-10-04",
    startRows: [],
    rpcAnswers: {},
    tables: {},
    storage: {},
    errors: {},
    rpcs: [],
    inserts: [],
    selects: [],
    uploads: [],
    removes: [],
    downloads: [],
    signs: [],
    log: [],
  };
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      state.log.push(`rpc:${name}`);
      state.rpcs.push({ name, args });
      const error = state.errors[name];
      if (error) return { data: null, error };
      if (name in state.rpcAnswers) {
        const answer = state.rpcAnswers[name];
        return {
          data: typeof answer === "function" ? (answer as (a: unknown) => unknown)(args) : answer,
          error: null,
        };
      }
      switch (name) {
        case "heartbeat_generation":
          return { data: state.heartbeat, error: null };
        case "reserve_model_spend":
          return { data: state.day, error: null };
        case "settle_model_spend":
          return { data: null, error: null };
        case "start_generation":
          return { data: state.startRows, error: null };
        default:
          throw new Error(`unexpected rpc ${name}`);
      }
    },
    from(table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          state.log.push(`insert:${table}`);
          const error = state.errors[`insert:${table}`];
          if (error) return { error };
          state.inserts.push({ table, row });
          return { error: null };
        },
        select(columns: string) {
          return selectQuery(state, table, columns);
        },
      };
    },
    storage: {
      from(bucket: string) {
        const objects = () => (state.storage[bucket] ??= {});
        return {
          async upload(key: string, bytes: Uint8Array, options: unknown) {
            state.log.push("storage:upload");
            state.uploads.push({ bucket, key, bytes, options });
            const error = state.errors["storage:upload"];
            if (error) return { data: null, error };
            objects()[key] = bytes;
            return { data: { path: key }, error: null };
          },
          async remove(keys: string[]) {
            state.log.push("storage:remove");
            state.removes.push({ bucket, keys });
            const error = state.errors["storage:remove"];
            if (error) return { data: null, error };
            for (const key of keys) delete objects()[key];
            return { data: keys.map((name) => ({ name })), error: null };
          },
          async createSignedUrl(key: string, expiresIn: number) {
            state.log.push("storage:sign");
            state.signs.push({ bucket, key, expiresIn });
            const error = state.errors["storage:sign"];
            if (error) return { data: null, error };
            if (!objects()[key]) return { data: null, error: { message: "Object not found" } };
            return {
              data: { signedUrl: `https://storage.test/${bucket}/${key}?token=signed` },
              error: null,
            };
          },
          async download(key: string) {
            state.log.push("storage:download");
            state.downloads.push({ bucket, key });
            const error = state.errors["storage:download"];
            if (error) return { data: null, error };
            const bytes = objects()[key];
            if (!bytes) return { data: null, error: { message: "Object not found" } };
            return { data: new Blob([Buffer.from(bytes)]), error: null };
          },
        };
      },
    },
  };
  const rpcNames = () => state.rpcs.map((r) => r.name);
  const rpc = (name: string) => state.rpcs.filter((r) => r.name === name).map((r) => r.args);
  const runs = () => state.inserts.filter((i) => i.table === "generation_runs").map((i) => i.row);
  return { state, client, rpcNames, rpc, runs };
}

export type FakeAdmin = ReturnType<typeof fakeAdmin>;

export const TEST_CONTEXT = {
  eventId: "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11",
  userId: "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2",
  generationId: "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d",
  round: 1,
};

/** Enables generation with a well-formed test key; returns a restore function. */
export function enableGeneration(): () => void {
  const saved = { ...process.env };
  process.env.GENERATION_ENABLED = "true";
  process.env.OPENAI_API_KEY = `sk-test-${"a".repeat(32)}`;
  delete process.env.GENERATION_DAILY_CEILING_USD;
  delete process.env.GENERATION_EVENT_DAILY_CAP;
  delete process.env.GENERATION_HOST_DAILY_CAP;
  return () => {
    process.env = { ...saved };
  };
}
