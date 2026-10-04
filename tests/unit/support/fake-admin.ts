/**
 * A stand-in for the service-role Supabase client in unit tests of the meter, the provider and the
 * generation lock: it answers the ledger and lock RPCs from `state` and records every RPC and
 * insert. The SQL behind those RPCs is tested against Postgres in `tests/db/phase5.test.ts`.
 *
 * Use with `vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }))`.
 */

type DbError = { message: string; code?: string };

export interface FakeAdminState {
  /** heartbeat_generation's answer. */
  heartbeat: boolean;
  /** reserve_model_spend's answer: the day booked, or null at the ceiling. */
  day: string | null;
  /** start_generation's rows. */
  startRows: { generation_id: string | null; outcome: string }[];
  /** Errors by RPC name, or `insert:<table>`. */
  errors: Record<string, DbError | undefined>;
  rpcs: { name: string; args: Record<string, unknown> }[];
  inserts: { table: string; row: Record<string, unknown> }[];
}

export function fakeAdmin() {
  const state: FakeAdminState = {
    heartbeat: true,
    day: "2026-10-04",
    startRows: [],
    errors: {},
    rpcs: [],
    inserts: [],
  };
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcs.push({ name, args });
      const error = state.errors[name];
      if (error) return { data: null, error };
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
          const error = state.errors[`insert:${table}`];
          if (error) return { error };
          state.inserts.push({ table, row });
          return { error: null };
        },
      };
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
