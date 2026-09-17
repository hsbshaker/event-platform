import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";
import { supabaseShim } from "./supabase-shim";
import { AUTHORITATIVE, creativeResult } from "./phase4b-t10-fixtures";
// Types only, so this static import erases and the `vi.mock` above still applies to the runtime
// module graph the dynamic imports below build.
import type { BatchLimits } from "@/lib/generation/batch";

/**
 * Phase 4C T16 — `generation_batches`, and the batch/sibling half of the spend controls.
 *
 * `docs/phase-4b-plan.md §G.5`, `§H.2` (the seven controls), `§I` (failure semantics) and `§C`
 * (Route A behaviour, whose **persisted half** this task inherits from the 4B gate). `spec.md §10`,
 * `§27`, `§6`, `§32 #41`.
 *
 * **No model call is made here, or anywhere in T16.** The provider module is mocked; the identity
 * revisions these batches are planned from are produced by the real T10 orchestrator over a real
 * database, because the inherited obligation is explicit that the proofs must run against a real
 * `planned` or `running` batch row and production code paths — "never a mock, a fake batch object
 * or a test double".
 *
 * The properties, in the order they cost money or lie about state when they are wrong:
 *
 *   * one batch in flight per event, refused by the **database**, not by application ordering;
 *   * a refused admission consumes nothing — not a cap unit, not a batch row, not a sibling;
 *   * a ceiling breach refuses new batches and never truncates a running one;
 *   * a duplicated sibling call collides on its derived key instead of paying twice;
 *   * resumption re-issues only siblings with no successful run, under the same keys;
 *   * a late Route A answer leaves an in-flight batch entirely alone.
 *
 * Acceptance criteria: `spec.md §31 — Creation Mode` ("A clarification answer that arrives after
 * generation has started is persisted and offered as a new round; the running generation is not
 * cancelled or rebased"); `§31 — Event Identity and diversity` (the per-concept assignment); §10's
 * backend safety limits.
 */
const generate = vi.fn();

vi.mock("@/lib/ai/openai/event-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/openai/event-identity")>();
  return { ...actual, generateEventIdentity: (input: unknown) => generate(input) };
});

const {
  DESIGN_INTENT_PROMPT_VERSION,
  DESIGN_INTENT_SCHEMA_VERSION,
  EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
  PLANNER_VERSION,
} = await import("@/lib/ai/versions");
const { assertAuthoritative } = await import("@/lib/ai/event-identity/lifecycle");
const { resetEnvCache } = await import("@/lib/env");
const { runEventIdentity } = await import("@/lib/generation/identity-orchestrator");
const {
  batchIdempotencyKey,
  batchLimits,
  batchSiblings,
  findInFlightBatch,
  issueSibling,
  planConceptBatchForEvent,
  recordSiblingRun,
  resumableSiblings,
  settleBatch,
  siblingIdempotencyKey,
  startBatch,
  SIBLING_OPERATION,
} = await import("@/lib/generation/batch");

type Admin = Parameters<typeof runEventIdentity>[0];

const MODEL = "gpt-5.6-sol";
const PROMPT = "a spring garden baby shower for my sister";

let db: Client;
let admin: Admin;
let owner: string;
let eventId: string;

/* ------------------------------------------------------------------ identity fixtures (mocked) */

const usage = () => ({
  provider: "openai" as const,
  model: MODEL,
  providerRequestId: "resp_accepted",
  inputTokens: 4_000,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 900,
  reasoningTokens: 400,
  responses: [
    {
      inputTokens: 4_000,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 900,
      reasoningTokens: 400,
      servedServiceTier: "default",
    },
  ],
  providerResponses: 1,
  providerAttempts: 1,
  unknownUsageAttempts: 0,
  latencyMs: 1_234,
  transientRetries: 0,
  schemaValidFirstCall: true,
  repairRetries: 0,
});

const callResult = (output: unknown) => ({
  raw: JSON.stringify(output),
  rawResponses: [JSON.stringify(output)],
  output,
  promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
  schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
  requestText: "the assembled user message",
  inputAssemblyVersion: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
  usage: usage(),
});

const answers = (result: unknown) => generate.mockResolvedValue(callResult(result));

const runIdentity = () => runEventIdentity(admin, { eventId, userId: owner });

/* ------------------------------------------------------------------ reads */

const revisions = async () =>
  (
    await db.query(
      `select id, revision, is_provisional, result, created_at
         from public.event_identity_revisions where event_id=$1 order by revision`,
      [eventId],
    )
  ).rows as { id: string; revision: number; is_provisional: boolean; result: unknown }[];

const batchRows = async () =>
  (
    await db.query(`select * from public.generation_batches where event_id=$1 order by round`, [
      eventId,
    ])
  ).rows;

const siblingRows = async (batchId: string) =>
  (
    await db.query(
      `select * from public.generation_batch_siblings where batch_id=$1 order by concept_index`,
      [batchId],
    )
  ).rows;

const buckets = async () =>
  (
    await db.query(
      `select bucket, count from public.rate_limits where bucket like 'batch:%' order by bucket`,
    )
  ).rows as { bucket: string; count: number }[];

/** The authoritative identity, read back through the production lifecycle guard. */
async function authoritativeIdentity() {
  const { rows } = await db.query(
    `select r.result, r.schema_version, r.id
       from public.events e
       join public.event_identity_revisions r on r.id = e.authoritative_identity_revision_id
      where e.id = $1`,
    [eventId],
  );
  const row = rows[0] as { result: unknown; schema_version: string; id: string };
  return { identity: assertAuthoritative(row.result, row.schema_version), revisionId: row.id };
}

async function plan(options: { newRound?: boolean; limits?: BatchLimits } = {}, client = admin) {
  const { identity, revisionId } = await authoritativeIdentity();
  return planConceptBatchForEvent(client, {
    eventId,
    userId: owner,
    identity,
    identityRevisionId: revisionId,
    ...options,
  });
}

/** Answers the question a revision asked, exactly as the binding trigger requires (T10's shape). */
async function answerQuestion(
  revisionId: string,
  round: number,
  patch: { selected?: string | null } = {},
): Promise<string> {
  const { rows } = await db.query(
    `select result -> 'clarification' -> 'questions' -> 0 as q from public.event_identity_revisions
      where id=$1`,
    [revisionId],
  );
  const question = rows[0].q as { kind: string; question: string; options: unknown };
  const inserted = await db.query(
    `insert into public.clarification_answers
       (event_id, identity_revision_id, question_index, round, kind, question_text, options,
        selected_option_label, free_text, is_defer, answered_by)
     values ($1,$2,0,$3,$4,$5,$6::jsonb,$7,null,false,$8) returning id`,
    [
      eventId,
      revisionId,
      round,
      question.kind,
      question.question,
      JSON.stringify(question.options),
      patch.selected ?? null,
      owner,
    ],
  );
  return inserted.rows[0].id as string;
}

/** One sibling's telemetry. Nothing here attributes the run; the RPC takes that from the rows. */
const telemetry = (overrides: Record<string, unknown> = {}) => ({
  provider: "openai",
  model: MODEL,
  latencyMs: 900,
  promptVersion: DESIGN_INTENT_PROMPT_VERSION,
  schemaVersion: DESIGN_INTENT_SCHEMA_VERSION,
  costEstimateUsd: 0.01,
  ...overrides,
});

beforeAll(async () => {
  db = await connect();
  admin = supabaseShim(db);
  await resetDatabase(db);
}, 120_000);

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query(
    "truncate public.events cascade; delete from auth.users; delete from public.rate_limits",
  );
  owner = await createAuthUser(db, "owner@example.com", "Owner");
  eventId = (
    await db.query(`insert into public.events (owner_id, prompt) values ($1,$2) returning id`, [
      owner,
      PROMPT,
    ])
  ).rows[0].id;

  generate.mockReset();
  process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
  process.env.OPENAI_MODEL = MODEL;
  process.env.OPENAI_REASONING_EFFORT = "high";
  process.env.APP_ENCRYPTION_KEY = "a".repeat(48);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  resetEnvCache();
  for (const name of [
    "IDENTITY_CEILING_USD",
    "BATCH_EVENT_DAILY_MAX",
    "BATCH_ACCOUNT_DAILY_MAX",
    "BATCH_ACCOUNT_RATE_MAX",
  ]) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of [
    "IDENTITY_CEILING_USD",
    "BATCH_EVENT_DAILY_MAX",
    "BATCH_ACCOUNT_DAILY_MAX",
    "BATCH_ACCOUNT_RATE_MAX",
  ]) {
    delete process.env[name];
  }
});

/* ================================================================== the schema's own contract */

describe("the batch tables are server-only", () => {
  it("is unreadable by anon and by an authenticated owner", async () => {
    // `spec.md §32 #41`: round ordinals, sibling attempt counters and failure counts are backend
    // generation counters. RLS is enabled with no policies **and** the grants are revoked, because
    // the narrower revoke would have left `anon` a SELECT.
    for (const table of ["generation_batches", "generation_batch_siblings"]) {
      expect(
        await asActor(db, { kind: "anon" }, (q) => errorCode(q(`select * from public.${table}`))),
      ).toBe("42501");
      expect(
        await asActor(db, { kind: "user", id: owner }, (q) =>
          errorCode(q(`select * from public.${table}`)),
        ),
      ).toBe("42501");
    }
  });

  it("exposes none of its functions to an end-user JWT", async () => {
    for (const call of [
      "select public.generation_batch_is_in_flight('planned')",
      "select public.start_generation_batch(gen_random_uuid())",
      "select public.issue_batch_sibling(gen_random_uuid(), 0)",
      "select public.settle_generation_batch(gen_random_uuid())",
      "select public.record_batch_sibling_run(gen_random_uuid(), 0, 0, 'k', true, '{}'::jsonb)",
    ]) {
      expect(await asActor(db, { kind: "user", id: owner }, (q) => errorCode(q(call)))).toBe(
        "42501",
      );
    }
  });
});

describe("the in-flight predicate", () => {
  it("agrees with the uniqueness index for every value of the enum", async () => {
    // The index inlines its predicate rather than calling the function, because replacing an
    // immutable function would leave a stale index behind in silence. So the two are asserted to
    // agree here, for every enum value — the same guard `identity_claim_is_terminal` carries.
    const { rows: values } = await db.query<{ v: string }>(
      `select unnest(enum_range(null::public.generation_batch_status))::text as v`,
    );
    const { rows: predicate } = await db.query<{ def: string }>(
      `select indexdef as def from pg_indexes
        where schemaname='public' and indexname='generation_batches_one_in_flight'`,
    );
    const def = predicate[0].def;
    for (const { v } of values) {
      const { rows } = await db.query<{ in_flight: boolean }>(
        `select public.generation_batch_is_in_flight($1) as in_flight`,
        [v],
      );
      expect(def.includes(`'${v}'`), `${v} disagrees with the index`).toBe(rows[0].in_flight);
    }
    expect(values.map((r) => r.v)).toEqual(["planned", "running", "completed", "failed"]);
  });
});

/* ================================================================== §H.2 control 1 */

describe("one batch in flight per event", () => {
  beforeEach(async () => {
    answers(AUTHORITATIVE);
    await runIdentity();
  });

  it("plans a batch from the authoritative revision, with three persisted assignments", async () => {
    const result = await plan();
    expect(result.outcome).toBe("planned");
    if (result.outcome !== "planned") return;

    const { revisionId } = await authoritativeIdentity();
    expect(result.batch.identity_revision_id).toBe(revisionId);
    expect(result.batch.planner_version).toBe(PLANNER_VERSION);
    expect(result.batch.round).toBe(1);
    expect(result.batch.status).toBe("planned");
    expect(result.batch.settled_at).toBeNull();

    const siblings = await siblingRows(result.batch.id);
    expect(siblings.map((s) => s.concept_index)).toEqual([0, 1, 2]);
    expect(siblings.every((s) => s.status === "pending" && s.attempt === 0)).toBe(true);
    // The assignment reaches the row at plan time, before any call exists — which is what makes
    // "the batch's sibling assignment is unchanged by a late answer" a checkable claim at all.
    expect(
      siblings.map((s) => (s.plan as { assignment: { family: string } }).assignment.family),
    ).toHaveLength(3);
  });

  it("refuses a second in-flight batch at the database, not in the application", async () => {
    const first = await plan();
    expect(first.outcome).toBe("planned");
    if (first.outcome !== "planned") return;

    // Straight at the table, bypassing every application check, as the service role.
    const code = await errorCode(
      db.query(
        `insert into public.generation_batches
           (event_id, identity_revision_id, planner_version, round, idempotency_key)
         values ($1,$2,$3,$4,$5)`,
        [eventId, first.batch.identity_revision_id, PLANNER_VERSION, 2, "a-different-key"],
      ),
    );
    expect(code).toBe("23505");
    expect(await batchRows()).toHaveLength(1);
  });

  it("answers a repeated request from the existing batch rather than a second one", async () => {
    const first = await plan();
    for (let i = 0; i < 4; i++) {
      const repeat = await plan({ newRound: true });
      expect(repeat.outcome).toBe("observed");
      if (repeat.outcome === "observed" && first.outcome === "planned") {
        expect(repeat.batch.id).toBe(first.batch.id);
      }
    }
    expect(await batchRows()).toHaveLength(1);
  });

  it("converges two concurrent requests on one batch, enforced by the index", async () => {
    // The race the index exists for: both requests read no batch, both plan, and Postgres admits
    // exactly one. Nothing here depends on which arrives first.
    const a = await connect();
    const b = await connect();
    try {
      const [ra, rb] = await Promise.all([plan({}, supabaseShim(a)), plan({}, supabaseShim(b))]);
      const outcomes = [ra.outcome, rb.outcome].sort();
      expect(outcomes).toEqual(["observed", "planned"]);
      const rows = await batchRows();
      expect(rows).toHaveLength(1);
      // The loser was handed the winner, not merely told no.
      const ids = [ra, rb]
        .map((r) => (r.outcome === "refused" ? null : r.batch.id))
        .filter((id): id is string => id !== null);
      expect(new Set(ids)).toEqual(new Set([rows[0].id]));
      // And exactly three siblings exist — the loser's plan wrote none.
      expect(await siblingRows(rows[0].id)).toHaveLength(3);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("lets a new round begin only once the current batch no longer blocks it", async () => {
    const first = await plan();
    expect(first.outcome).toBe("planned");
    if (first.outcome !== "planned") return;

    // Blocked while in flight, whatever the caller asks for.
    expect((await plan({ newRound: true })).outcome).toBe("observed");

    // Settle it the way the siblings say (all three succeed).
    for (const index of [0, 1, 2]) {
      await recordSiblingRun(admin, {
        batchId: first.batch.id,
        conceptIndex: index,
        attempt: 0,
        success: true,
        run: telemetry(),
      });
    }
    expect(await settleBatch(admin, first.batch.id)).toBe("completed");

    // A refresh is still a read: it observes the settled batch and buys nothing.
    const refresh = await plan();
    expect(refresh.outcome).toBe("observed");
    if (refresh.outcome === "observed") expect(refresh.batch.id).toBe(first.batch.id);
    expect(await batchRows()).toHaveLength(1);

    // Only the canonical new-round path starts one.
    const second = await plan({ newRound: true });
    expect(second.outcome).toBe("planned");
    if (second.outcome !== "planned") return;
    expect(second.batch.round).toBe(2);
    expect(second.batch.id).not.toBe(first.batch.id);
    expect(second.batch.idempotency_key).not.toBe(first.batch.idempotency_key);
  });
});

/* ================================================================== §H.2 controls 2 and 3 */

describe("batch-level caps and the project ceiling", () => {
  beforeEach(async () => {
    answers(AUTHORITATIVE);
    await runIdentity();
  });

  const limitsWith = (patch: Partial<BatchLimits>): BatchLimits => ({ ...batchLimits(), ...patch });

  it("consumes the batch buckets when a batch is planned, not when an identity call is made", async () => {
    // §H.2 row 2. The identity call that produced the revision already ran in `beforeEach`, and it
    // consumed only `identity:` buckets.
    expect(await buckets()).toEqual([]);
    await plan();
    expect(await buckets()).toEqual([
      { bucket: "batch:account:day", count: 1 },
      { bucket: "batch:account:rate", count: 1 },
      { bucket: "batch:event:day", count: 1 },
    ]);
  });

  it("refuses over the per-event cap, and the refusal consumes nothing", async () => {
    const limits = limitsWith({ eventCap: { ...batchLimits().eventCap, max: 1 } });
    const first = await plan({ limits });
    expect(first.outcome).toBe("planned");
    if (first.outcome !== "planned") return;
    for (const index of [0, 1, 2]) {
      await recordSiblingRun(admin, {
        batchId: first.batch.id,
        conceptIndex: index,
        attempt: 0,
        success: true,
        run: telemetry(),
      });
    }
    await settleBatch(admin, first.batch.id);
    const before = await buckets();

    const refused = await plan({ newRound: true, limits });
    expect(refused).toEqual({ outcome: "refused", reason: "cap_event", existingBatchId: null });
    // Not one unit of any bucket, including the two the refusing one is checked before.
    expect(await buckets()).toEqual(before);
    expect(await batchRows()).toHaveLength(1);
  });

  it("refuses over the per-account cap and over the short-window rate limit", async () => {
    // Both are keyed on the **acting** collaborator rather than the owner (`spec.md §6`), and both
    // are checked after the per-event cap — so a refusal here also proves the event bucket's unit
    // is rolled back with everything else.
    for (const [patch, reason] of [
      [{ accountCap: { ...batchLimits().accountCap, max: 1 } }, "cap_account"],
      [{ accountRate: { ...batchLimits().accountRate, max: 1 } }, "rate_limited"],
    ] as const) {
      const limits = limitsWith(patch as Partial<BatchLimits>);
      const first = await plan({ limits });
      if (first.outcome !== "planned") throw new Error("expected a planned batch");
      for (const index of [0, 1, 2]) {
        await recordSiblingRun(admin, {
          batchId: first.batch.id,
          conceptIndex: index,
          attempt: 0,
          success: true,
          run: telemetry(),
        });
      }
      await settleBatch(admin, first.batch.id);
      const before = await buckets();

      const refused = await plan({ newRound: true, limits });
      expect(refused).toEqual({ outcome: "refused", reason, existingBatchId: null });
      expect(await buckets()).toEqual(before);
      expect(await batchRows()).toHaveLength(1);

      await db.query("delete from public.generation_batches");
      await db.query("delete from public.rate_limits");
    }
  });

  it("refuses a new batch on a ceiling breach, and never truncates a running one", async () => {
    // §H.2 row 3. A batch already in flight keeps running to completion; the breach only ever
    // refuses admission.
    const first = await plan();
    expect(first.outcome).toBe("planned");
    if (first.outcome !== "planned") return;
    await startBatch(admin, first.batch.id);

    const breached = limitsWith({ ceiling: { ...batchLimits().ceiling, usd: 0.000001 } });

    // The running batch still records and still settles with three real concepts.
    for (const index of [0, 1, 2]) {
      const recorded = await recordSiblingRun(admin, {
        batchId: first.batch.id,
        conceptIndex: index,
        attempt: 0,
        success: true,
        run: telemetry(),
      });
      expect(recorded.outcome).toBe("recorded");
    }
    expect(await settleBatch(admin, first.batch.id)).toBe("completed");
    const siblings = await siblingRows(first.batch.id);
    expect(siblings.filter((s) => s.status === "succeeded")).toHaveLength(3);

    // And the next batch is refused rather than half-planned.
    const refused = await plan({ newRound: true, limits: breached });
    expect(refused).toEqual({ outcome: "refused", reason: "ceiling", existingBatchId: null });
    expect(await batchRows()).toHaveLength(1);
    expect(await buckets()).toEqual([
      { bucket: "batch:account:day", count: 1 },
      { bucket: "batch:account:rate", count: 1 },
      { bucket: "batch:event:day", count: 1 },
    ]);
  });

  it("refuses to plan from anything but the event's authoritative revision", async () => {
    // §I: a provisional identity means no batch. The check is against the event's own pointer, so
    // it inherits `validate_authoritative_identity`'s guarantee rather than re-deriving it.
    const { identity } = await authoritativeIdentity();
    const result = await planConceptBatchForEvent(admin, {
      eventId,
      userId: owner,
      identity,
      identityRevisionId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result).toEqual({
      outcome: "refused",
      reason: "not_authoritative",
      existingBatchId: null,
    });
    expect(await batchRows()).toHaveLength(0);
    expect(await buckets()).toEqual([]);
  });

  it("refuses a stale round rather than reusing one that already ran", async () => {
    const first = await plan();
    if (first.outcome !== "planned") throw new Error("expected a planned batch");
    const { rows } = await db.query(
      `select * from public.plan_generation_batch(
         $1,$2,$3,$4,$5,$6,$7,
         'batch:event:day',$8,86400,10,
         'batch:account:day',$9,86400,10,
         'batch:account:rate',$10,60,10,
         86400,1000,30,0)`,
      [
        eventId,
        owner,
        first.batch.identity_revision_id,
        PLANNER_VERSION,
        1,
        "some-other-key",
        JSON.stringify({ siblings: [{ index: 0 }, { index: 1 }, { index: 2 }] }),
        Buffer.from("e".padEnd(32, "x")),
        Buffer.from("a".padEnd(32, "x")),
        Buffer.from("r".padEnd(32, "x")),
      ],
    );
    expect(rows[0].outcome).toBe("stale_round");
    expect(await batchRows()).toHaveLength(1);
  });
});

/* ================================================================== §H.2 controls 4, 5, 6, 7 */

describe("sibling idempotency, retries and resumption", () => {
  let batchId: string;

  beforeEach(async () => {
    answers(AUTHORITATIVE);
    await runIdentity();
    const planned = await plan();
    if (planned.outcome !== "planned") throw new Error("expected a planned batch");
    batchId = planned.batch.id;
  });

  it("stamps the derived key into generation_runs, with attribution taken from the rows", async () => {
    await issueSibling(admin, batchId, 1);
    const result = await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 1,
      attempt: 0,
      success: true,
      run: telemetry(),
    });
    expect(result.outcome).toBe("recorded");
    expect(result.idempotencyKey).toBe(
      siblingIdempotencyKey({ batchId, operation: SIBLING_OPERATION, conceptIndex: 1, attempt: 0 }),
    );

    const { rows } = await db.query(`select * from public.generation_runs where id=$1`, [
      result.runId,
    ]);
    const run = rows[0];
    expect(run.idempotency_key).toBe(result.idempotencyKey);
    // Attribution comes from the batch and the sibling, never from the caller.
    expect(run.event_id).toBe(eventId);
    expect(run.round).toBe(1);
    expect(run.concept_index).toBe(1);
    expect(run.operation).toBe("design_intent");
    expect(run.planner_version).toBe(PLANNER_VERSION);
    const siblings = await siblingRows(batchId);
    expect(run.diversity_assignment).toEqual(
      (siblings[1].plan as { assignment: unknown }).assignment,
    );
    // The batch moved to running on the first issue, and stayed there.
    expect((await batchRows())[0].status).toBe("running");
  });

  it("converges two concurrent recordings of one sibling attempt on one run row", async () => {
    // §H.2 row 6: duplicates are prevented by the key, not by an in-process lock — which would not
    // survive a second serverless instance. Two connections, one sibling, one paid row.
    const a = await connect();
    const b = await connect();
    try {
      const req = { batchId, conceptIndex: 0, attempt: 0, success: true, run: telemetry() };
      const [ra, rb] = await Promise.all([
        recordSiblingRun(supabaseShim(a), req),
        recordSiblingRun(supabaseShim(b), req),
      ]);
      expect([ra.outcome, rb.outcome].sort()).toEqual(["already_succeeded", "recorded"]);
      expect(ra.runId).toBe(rb.runId);
      const { rows } = await db.query(
        `select count(*)::int c from public.generation_runs where operation='design_intent'`,
      );
      expect(rows[0].c).toBe(1);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("converges on the existing run when the key is already spent", async () => {
    // The `duplicate_key` branch, reached by writing the run row out from under the sibling — what
    // a second instance would leave behind if its own sibling update lost the race. The row that
    // exists is the answer; a second one would double-count against the ceiling.
    const key = siblingIdempotencyKey({
      batchId,
      operation: SIBLING_OPERATION,
      conceptIndex: 2,
      attempt: 0,
    });
    const existing = (
      await db.query(
        `insert into public.generation_runs
           (event_id, provider, operation, model, latency_ms, success, prompt_version,
            schema_version, idempotency_key)
         values ($1,'openai','design_intent','m',10,true,'p','s',$2) returning id`,
        [eventId, key],
      )
    ).rows[0].id as string;

    const result = await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 2,
      attempt: 0,
      success: true,
      run: telemetry(),
    });
    expect(result).toEqual({ outcome: "duplicate_key", runId: existing, idempotencyKey: key });
    const { rows } = await db.query(
      `select count(*)::int c from public.generation_runs where idempotency_key=$1`,
      [key],
    );
    expect(rows[0].c).toBe(1);
  });

  it("advances the ordinal only for a recorded failure, so a retry reuses the attempt's key", async () => {
    const before = await resumableSiblings(admin, batchId);
    expect(before).toHaveLength(3);

    // A resumption that finds nothing recorded re-issues under the same key (§H.2 row 7).
    expect((await resumableSiblings(admin, batchId))[0].idempotencyKey).toBe(
      before[0].idempotencyKey,
    );

    const failure = await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 0,
      attempt: 0,
      success: false,
      run: telemetry({ errorCode: "invalid_output" }),
    });
    expect(failure.outcome).toBe("recorded");
    expect(failure.idempotencyKey).toBe(before[0].idempotencyKey);

    const after = await batchSiblings(admin, batchId);
    expect(after[0].status).toBe("failed");
    // Recorded, so the next attempt is honestly a different paid call with a different key.
    expect(after[0].attempt).toBe(1);
    const next = (await resumableSiblings(admin, batchId)).find(
      (s) => s.sibling.concept_index === 0,
    );
    expect(next?.idempotencyKey).not.toBe(before[0].idempotencyKey);
    expect(next?.idempotencyKey).toBe(
      siblingIdempotencyKey({ batchId, operation: SIBLING_OPERATION, conceptIndex: 0, attempt: 1 }),
    );

    // Recording the spent ordinal again is refused rather than overwriting the later attempt.
    const stale = await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 0,
      attempt: 0,
      success: true,
      run: telemetry(),
    });
    expect(stale.outcome).toBe("stale_attempt");
    expect(stale.runId).toBeNull();
  });

  it("re-issues only the siblings with no successful run", async () => {
    await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 0,
      attempt: 0,
      success: true,
      run: telemetry(),
    });
    await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 1,
      attempt: 0,
      success: false,
      run: telemetry({ errorCode: "timeout" }),
    });

    const resumable = await resumableSiblings(admin, batchId);
    expect(resumable.map((r) => r.sibling.concept_index)).toEqual([1, 2]);
    expect(resumable[0].idempotencyKey).toBe(
      siblingIdempotencyKey({ batchId, operation: SIBLING_OPERATION, conceptIndex: 1, attempt: 1 }),
    );

    // Resuming 1 under its new key succeeds; the succeeded sibling is never re-issued and is final.
    const resumed = await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 1,
      attempt: 1,
      success: true,
      run: telemetry(),
    });
    expect(resumed.outcome).toBe("recorded");
    const finished = await recordSiblingRun(admin, {
      batchId,
      conceptIndex: 0,
      attempt: 0,
      success: true,
      run: telemetry(),
    });
    expect(finished.outcome).toBe("already_succeeded");
  });

  it("refuses to rewrite a planned sibling's assignment, for any role", async () => {
    const [sibling] = await siblingRows(batchId);
    expect(
      await errorCode(
        db.query(
          `update public.generation_batch_siblings set plan = '{"index":0}'::jsonb
            where batch_id=$1 and concept_index=0`,
          [batchId],
        ),
      ),
    ).toBe("23001");
    expect((await siblingRows(batchId))[0].plan).toEqual(sibling.plan);
  });
});

/* ================================================================== §I, settlement */

describe("settlement is what the siblings say", () => {
  let batchId: string;

  beforeEach(async () => {
    answers(AUTHORITATIVE);
    await runIdentity();
    const planned = await plan();
    if (planned.outcome !== "planned") throw new Error("expected a planned batch");
    batchId = planned.batch.id;
  });

  const record = (conceptIndex: number, success: boolean, attempt = 0) =>
    recordSiblingRun(admin, {
      batchId,
      conceptIndex,
      attempt,
      success,
      run: telemetry(success ? {} : { errorCode: "invalid_output" }),
    });

  it("changes nothing while a sibling is unfinished", async () => {
    await record(0, true);
    expect(await settleBatch(admin, batchId)).toBe("in_flight");
    expect((await batchRows())[0].settled_at).toBeNull();
    expect(await findInFlightBatch(admin, eventId)).not.toBeNull();
  });

  it("completes with one failed sibling — concept-level readiness is canonical", async () => {
    await record(0, true);
    await record(1, true);
    await record(2, false);
    expect(await settleBatch(admin, batchId)).toBe("completed");
    const [batch] = await batchRows();
    expect(batch.status).toBe("completed");
    expect(batch.settled_at).not.toBeNull();
    // Two real concepts, and no third fabricated one: nothing here invents a run for sibling 2.
    const siblings = await siblingRows(batchId);
    expect(siblings.filter((s) => s.status === "succeeded")).toHaveLength(2);
    expect(siblings[2].generation_run_id).toBeNull();
  });

  it("fails as a batch when several siblings fail", async () => {
    await record(0, true);
    await record(1, false);
    await record(2, false);
    expect(await settleBatch(admin, batchId)).toBe("failed");
    expect((await batchRows())[0].status).toBe("failed");
    // Idempotent, and a settled batch never reopens.
    expect(await settleBatch(admin, batchId)).toBe("failed");
    expect(
      await errorCode(
        db.query(`update public.generation_batches set status='running' where id=$1`, [batchId]),
      ),
    ).toBe("23001");
  });
});

/* ========================================== the persisted half of late Route A, inherited (§C) */

describe("a late Route A answer leaves an in-flight batch alone", () => {
  it("changes nothing about the batch, and cannot start a second one", async () => {
    // Route A never gates: this revision is authoritative *and* asks a creative question.
    answers(creativeResult("Warmer or cooler?"));
    expect((await runIdentity()).state).toBe("ready");
    const [asked] = await revisions();

    const planned = await plan();
    if (planned.outcome !== "planned") throw new Error("expected a planned batch");
    await startBatch(admin, planned.batch.id);
    const [batchBefore] = await batchRows();
    const siblingsBefore = await siblingRows(planned.batch.id);
    expect(batchBefore.status).toBe("running");

    // The host answers, late, and the identity reruns — the canonical Phase 4B path.
    const answerId = await answerQuestion(asked.id, 1, { selected: "Warmer" });
    answers(AUTHORITATIVE);
    expect((await runIdentity()).state).toBe("ready");
    const all = await revisions();
    expect(all).toHaveLength(2);
    expect(all[1].id).not.toBe(asked.id);

    // 1 + 2. The batch row is byte-identical: same revision, same planner version, same round, same
    // key, same status, same timestamps. Not cancelled, not mutated, not rebased.
    const [batchAfter] = await batchRows();
    expect(batchAfter).toEqual(batchBefore);
    expect(batchAfter.identity_revision_id).toBe(asked.id);
    expect(batchAfter.identity_revision_id).not.toBe(all[1].id);
    expect(batchAfter.planner_version).toBe(PLANNER_VERSION);

    // 1. The persisted sibling assignments are untouched too.
    expect(await siblingRows(planned.batch.id)).toEqual(siblingsBefore);

    // 3. The answer stays attached to the revision and round that asked it.
    const bound = (
      await db.query(
        `select identity_revision_id, round from public.clarification_answers where id=$1`,
        [answerId],
      )
    ).rows[0];
    expect(bound.identity_revision_id).toBe(asked.id);
    expect(bound.round).toBe(1);

    // 4. The late answer alone cannot create a second in-flight batch, however it is asked for.
    expect((await plan({ newRound: true })).outcome).toBe("observed");
    expect(await batchRows()).toHaveLength(1);
    // Nor by going straight at the table with the new revision.
    expect(
      await errorCode(
        db.query(
          `insert into public.generation_batches
             (event_id, identity_revision_id, planner_version, round, idempotency_key)
           values ($1,$2,$3,2,'another-key')`,
          [eventId, all[1].id, PLANNER_VERSION],
        ),
      ),
    ).toBe("23505");

    // 7. Repeated requests preserve exactly one in-flight batch.
    for (let i = 0; i < 3; i++) await plan({ newRound: true });
    expect(await batchRows()).toHaveLength(1);

    // 5. A new round begins only through the canonical path, once this batch no longer blocks it,
    // and it is planned from the *new* authoritative revision.
    for (const index of [0, 1, 2]) {
      await recordSiblingRun(admin, {
        batchId: planned.batch.id,
        conceptIndex: index,
        attempt: 0,
        success: true,
        run: telemetry(),
      });
    }
    await settleBatch(admin, planned.batch.id);
    expect((await plan()).outcome).toBe("observed");
    const next = await plan({ newRound: true });
    expect(next.outcome).toBe("planned");
    if (next.outcome !== "planned") return;
    expect(next.batch.round).toBe(2);
    expect(next.batch.identity_revision_id).toBe(all[1].id);
    // And the first batch's inputs are still exactly what they were planned with. Its status and
    // settlement time moved, because it finished — that is the batch running to completion, which
    // is the whole point. Nothing rebased it onto the revision the late answer produced.
    const [firstAfter] = await batchRows();
    expect({
      id: firstAfter.id,
      event_id: firstAfter.event_id,
      identity_revision_id: firstAfter.identity_revision_id,
      planner_version: firstAfter.planner_version,
      round: firstAfter.round,
      idempotency_key: firstAfter.idempotency_key,
      created_at: firstAfter.created_at,
      started_at: firstAfter.started_at,
    }).toEqual({
      id: batchBefore.id,
      event_id: batchBefore.event_id,
      identity_revision_id: batchBefore.identity_revision_id,
      planner_version: batchBefore.planner_version,
      round: batchBefore.round,
      idempotency_key: batchBefore.idempotency_key,
      created_at: batchBefore.created_at,
      started_at: batchBefore.started_at,
    });
    expect(firstAfter.identity_revision_id).toBe(asked.id);
    // The persisted assignments are untouched by everything above, including the new round.
    expect((await siblingRows(planned.batch.id)).map((sibling) => sibling.plan)).toEqual(
      siblingsBefore.map((sibling) => sibling.plan),
    );
  });

  it("plans from the new authoritative revision when the answer arrives first (§C row 3)", async () => {
    answers(creativeResult("Warmer or cooler?"));
    await runIdentity();
    const [asked] = await revisions();
    expect(await batchRows()).toHaveLength(0);

    await answerQuestion(asked.id, 1, { selected: "Cooler" });
    answers(AUTHORITATIVE);
    await runIdentity();
    const all = await revisions();
    expect(all).toHaveLength(2);

    const planned = await plan();
    expect(planned.outcome).toBe("planned");
    if (planned.outcome !== "planned") return;
    // The batch is planned from the new authoritative revision, not the one that asked.
    expect(planned.batch.identity_revision_id).toBe(all[1].id);
    expect(planned.batch.identity_revision_id).not.toBe(asked.id);
    expect(planned.batch.round).toBe(1);
  });

  it("refuses a colliding batch key, and refuses to rebase a batch's inputs", async () => {
    // 8, the batch half. The sibling half is proven above by the derived key.
    answers(AUTHORITATIVE);
    await runIdentity();
    const planned = await plan();
    if (planned.outcome !== "planned") throw new Error("expected a planned batch");
    const { revisionId } = await authoritativeIdentity();

    expect(
      batchIdempotencyKey({
        eventId,
        identityRevisionId: revisionId,
        plannerVersion: PLANNER_VERSION,
        round: 1,
      }),
    ).toBe(planned.batch.idempotency_key);

    // Settle it so the in-flight index is not what refuses the next insert.
    for (const index of [0, 1, 2]) {
      await recordSiblingRun(admin, {
        batchId: planned.batch.id,
        conceptIndex: index,
        attempt: 0,
        success: true,
        run: telemetry(),
      });
    }
    await settleBatch(admin, planned.batch.id);

    expect(
      await errorCode(
        db.query(
          `insert into public.generation_batches
             (event_id, identity_revision_id, planner_version, round, idempotency_key)
           values ($1,$2,$3,2,$4)`,
          [eventId, revisionId, PLANNER_VERSION, planned.batch.idempotency_key],
        ),
      ),
    ).toBe("23505");

    // And no update can point a batch at a different identity revision.
    for (const patch of [
      `identity_revision_id = gen_random_uuid()`,
      `planner_version = 'planner_v99'`,
      `round = 9`,
      `idempotency_key = 'rewritten'`,
    ]) {
      expect(
        await errorCode(
          db.query(`update public.generation_batches set ${patch} where id=$1`, [planned.batch.id]),
        ),
      ).toBe("23001");
    }
  });
});
