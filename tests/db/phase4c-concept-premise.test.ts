import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
  CONCEPT_PREMISE_PROMPT_VERSION,
  CONCEPT_PREMISE_SCHEMA_VERSION,
} from "@/lib/ai/versions";

import { connect, createAuthUser, errorCode, resetDatabase } from "./harness";

/**
 * `20260918000000_phase4c_concept_premise_lineage.sql` — the premise a concept came from, and the
 * run row that makes its call visible.
 *
 * `spec.md §7.7a`, `§31 — Event Identity and diversity`, `docs/phase-4b-plan.md §G.2`, `§G.4`,
 * `docs/model-contracts.md §4.8`.
 *
 * Three properties, in the order they would silently corrupt something if they were wrong:
 *
 *   * `model_operation` admits `concept_premise`, so the premise call can be recorded as itself —
 *     the project spend ceiling reads `generation_runs`, and a call recorded as `design_intent`
 *     would corrupt the per-operation record while looking fine;
 *   * an artifact cannot be written without naming the premise that produced it, and cannot be
 *     rewritten afterwards to name a different one (the immutability sweep in
 *     `phase4c-t17.test.ts` covers the second half over every column, new ones included);
 *   * `card_deviations` defaults to the empty array and refuses anything that is not an array, so
 *     "this card needed no repair" and "nobody recorded whether it did" are different values.
 *
 * **No model call is made here.** This is persistence, as T17 was: no provider module is imported,
 * mocked or reached.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` (persistence with
 * prompt and schema versions); `§31 — Event Identity and diversity` (the premise set and its
 * binding). Guardrails `spec.md §32 #18`, `#41`.
 */

let db: Client;
let eventId: string;
let revisionId: string;
let batchId: string;

const DESIGN_INTENT = { family: "editorial" };
const PRESENTATION = { name: "Ordered States", description: "A considered, unfussy direction." };
const PREMISE = { title: "Ordered States", organizingIdea: "one idea, stated once" };

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await resetDatabase(db);
  const owner = await createAuthUser(db, "owner@example.test");
  const { rows: events } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'An open evening') returning id`,
    [owner],
  );
  eventId = events[0].id as string;

  const { rows: revisions } = await db.query(
    `insert into public.event_identity_revisions
       (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
        provider, model)
     values ($1, 1, '{"identity":{},"suppliedFacts":{},"clarification":{"needed":false,"questions":[]}}',
             'event_identity_v5', 'event_identity_schema_v5', 'event_identity_input_v2',
             'openai', 'gpt-5.6-sol')
     returning id`,
    [eventId],
  );
  revisionId = revisions[0].id as string;

  const { rows: batches } = await db.query(
    `insert into public.generation_batches
       (event_id, identity_revision_id, planner_version, round, status, idempotency_key)
     values ($1, $2, 'planner_v2', 1, 'running', 'k1') returning id`,
    [eventId, revisionId],
  );
  batchId = batches[0].id as string;
});

type Overrides = {
  premise?: unknown | null;
  promptVersion?: string | null;
  cardDeviations?: unknown;
  omitDeviations?: boolean;
};

function insertArtifact(o: Overrides = {}): Promise<unknown> {
  const columns = [
    "event_id",
    "batch_id",
    "identity_revision_id",
    "concept_index",
    "round",
    "planner_version",
    "assignment",
    "directive",
    "token_allotment",
    "design_intent_prompt_version",
    "design_intent_schema_version",
    "design_intent_input_assembly_version",
    "provider",
    "model",
    "design_intent",
    "presentation",
    "concept_premise",
    "concept_premise_prompt_version",
    "concept_premise_schema_version",
    "concept_premise_input_assembly_version",
  ];
  const values: unknown[] = [
    eventId,
    batchId,
    revisionId,
    0,
    1,
    "planner_v2",
    JSON.stringify({ family: "editorial" }),
    JSON.stringify({ structure: "stacked" }),
    JSON.stringify({ allowed: [], forbidden: [] }),
    "design_intent_v6",
    "design_intent_schema_v6",
    "design_intent_input_v2",
    "openai",
    "gpt-5.6-sol",
    JSON.stringify(DESIGN_INTENT),
    JSON.stringify(PRESENTATION),
    o.premise === null ? null : JSON.stringify(o.premise ?? PREMISE),
    o.promptVersion === null ? null : (o.promptVersion ?? CONCEPT_PREMISE_PROMPT_VERSION),
    CONCEPT_PREMISE_SCHEMA_VERSION,
    CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
  ];
  if (!o.omitDeviations) {
    columns.push("card_deviations");
    values.push(JSON.stringify(o.cardDeviations ?? []));
  }
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  return db.query(
    `insert into public.design_intent_artifacts (${columns.join(", ")})
     values (${placeholders}) returning id`,
    values,
  );
}

describe("the premise call can be recorded as itself", () => {
  it("admits `concept_premise` as a model operation", async () => {
    // The ceiling reads `generation_runs` as spend. Without this value the premise call would have
    // to be recorded under another operation, which would misattribute it, or not at all, which
    // would make it a model call nobody can price (`docs/phase-4b-plan.md §A.5`).
    const { rows } = await db.query(
      `insert into public.generation_runs
         (event_id, provider, operation, model, latency_ms, success, prompt_version, schema_version)
       values ($1, 'openai', 'concept_premise', 'gpt-5.6-sol', 4200, true, $2, $3)
       returning operation`,
      [eventId, CONCEPT_PREMISE_PROMPT_VERSION, CONCEPT_PREMISE_SCHEMA_VERSION],
    );
    expect(rows[0].operation).toBe("concept_premise");
  });

  it("keeps every operation the enum already had", async () => {
    const { rows } = await db.query(
      `select unnest(enum_range(null::public.model_operation))::text as value`,
    );
    expect(rows.map((row) => row.value)).toEqual([
      "event_identity",
      "design_intent",
      "composition",
      "structured_extraction",
      "concept_premise",
    ]);
  });
});

describe("an artifact names the premise that produced it", () => {
  it("accepts a complete row", async () => {
    expect(await errorCode(insertArtifact())).toBeNull();
  });

  it("refuses a row with no premise", async () => {
    // `not null`: a concept whose creative direction came from somewhere the row cannot name is
    // exactly the lineage gap `§G.4` exists to prevent.
    expect(await errorCode(insertArtifact({ premise: null }))).toBe("23502");
  });

  it("refuses a row that does not say which premise contract produced it", async () => {
    expect(await errorCode(insertArtifact({ promptVersion: null }))).toBe("23502");
  });

  it("stores the premise payload verbatim, with no shape check of its own", async () => {
    // The shape is the application contract's. A key check here would be that contract written
    // twice, in the one place a correction has to ship as a whole new migration.
    const odd = { anything: [1, 2, 3], nested: { deeply: true } };
    expect(await errorCode(insertArtifact({ premise: odd }))).toBeNull();
    const { rows } = await db.query(
      `select concept_premise from public.design_intent_artifacts where batch_id = $1`,
      [batchId],
    );
    expect(rows[0].concept_premise).toEqual(odd);
  });
});

describe("a batch-level call is recorded without settling a sibling", () => {
  // The whole reason `record_batch_call_run` exists. `record_batch_sibling_run` settles the sibling
  // row it is handed, so recording the premise through it would mark a sibling succeeded before its
  // own DesignIntent call ran — and that sibling's real run would then be refused as
  // `already_succeeded` and never recorded at all. The ceiling reads `generation_runs` as spend.
  const RUN = {
    provider: "openai",
    model: "gpt-5.6-sol",
    latency_ms: 4200,
    prompt_version: CONCEPT_PREMISE_PROMPT_VERSION,
    schema_version: CONCEPT_PREMISE_SCHEMA_VERSION,
    input_assembly_version: CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
  };

  function record(
    key: string,
    success = true,
  ): Promise<{ rows: { outcome: string; run_id: string | null }[] }> {
    return db.query(
      `select * from public.record_batch_call_run($1, 'concept_premise', $2, $3, $4::jsonb)`,
      [batchId, key, success, JSON.stringify(RUN)],
    ) as never;
  }

  beforeEach(async () => {
    await db.query(
      `insert into public.generation_batch_siblings (batch_id, concept_index, plan)
       values ($1, 0, '{}'), ($1, 1, '{}'), ($1, 2, '{}')`,
      [batchId],
    );
  });

  it("writes the run with no concept index, because the call produced all three", async () => {
    const { rows } = await record("premise-key-1");
    expect(rows[0].outcome).toBe("recorded");
    const { rows: runs } = await db.query(
      `select operation::text, concept_index, round, success, prompt_version
         from public.generation_runs where idempotency_key = 'premise-key-1'`,
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].operation).toBe("concept_premise");
    expect(runs[0].concept_index).toBeNull();
    expect(runs[0].round).toBe(1);
    expect(runs[0].prompt_version).toBe(CONCEPT_PREMISE_PROMPT_VERSION);
  });

  it("leaves all three sibling rows exactly as they were", async () => {
    // Snapshotted rather than compared against a literal status, because the property is "this
    // call changed nothing about any sibling" — not "the initial status happens to be this word".
    // The first draft of this test asserted `planned` and the real default is `pending`, which is
    // the kind of detail only a database settles.
    const read = async () =>
      (
        await db.query(
          `select concept_index, status, attempt, generation_run_id, settled_at
             from public.generation_batch_siblings where batch_id = $1 order by concept_index`,
          [batchId],
        )
      ).rows;

    const before = await read();
    expect(before).toHaveLength(3);
    await record("premise-key-2");
    expect(await read()).toEqual(before);

    // And the untouched state is genuinely "not yet called", so all three remain available for
    // their own DesignIntent calls: an unsettled sibling with no run and no settle time.
    for (const row of before) {
      expect(row.attempt).toBe(0);
      expect(row.generation_run_id).toBeNull();
      expect(row.settled_at).toBeNull();
      expect(row.status).not.toBe("succeeded");
      expect(row.status).not.toBe("failed");
    }
  });

  it("converges on the row that exists rather than double-counting a paid call", async () => {
    const first = await record("premise-key-3");
    const second = await record("premise-key-3");
    expect(second.rows[0].outcome).toBe("duplicate_key");
    expect(second.rows[0].run_id).toBe(first.rows[0].run_id);
    const { rows } = await db.query(
      `select count(*)::int as n from public.generation_runs where idempotency_key = 'premise-key-3'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("records a failed call too, so the ceiling sees what it cost", async () => {
    await record("premise-key-4", false);
    const { rows } = await db.query(
      `select success from public.generation_runs where idempotency_key = 'premise-key-4'`,
    );
    expect(rows[0].success).toBe(false);
  });

  it("moves the batch from planned to running, once", async () => {
    await db.query(`update public.generation_batches set status = 'planned' where id = $1`, [
      batchId,
    ]);
    await record("premise-key-5");
    const { rows } = await db.query(
      `select status, started_at from public.generation_batches where id = $1`,
      [batchId],
    );
    expect(rows[0].status).toBe("running");
    expect(rows[0].started_at).not.toBeNull();
  });

  it("refuses a batch id that does not exist", async () => {
    expect(
      await errorCode(
        db.query(
          `select * from public.record_batch_call_run(gen_random_uuid(), 'concept_premise', 'k', true, '{}'::jsonb)`,
        ),
      ),
    ).toBe("23503");
  });
});

describe("a failed premise call corrupts no sibling's lifecycle", () => {
  /**
   * The failure half of the bug this RPC exists for.
   *
   * On success, borrowing a sibling's slot would have marked that sibling `succeeded` before its
   * own call ran. On **failure** it would have marked it `failed` and bumped its attempt ordinal —
   * so the batch would settle from a lifecycle describing a call that never happened, and the
   * sibling's real DesignIntent call would be recorded against an ordinal that had already moved.
   * Both halves are checked, because only one of them was in the original diagnosis.
   */
  beforeEach(async () => {
    await db.query(
      `insert into public.generation_batch_siblings (batch_id, concept_index, plan)
       values ($1, 0, '{}'), ($1, 1, '{}'), ($1, 2, '{}')`,
      [batchId],
    );
  });

  const failedPremise = (key: string) =>
    db.query(
      `select * from public.record_batch_call_run($1, 'concept_premise', $2, false, $3::jsonb)`,
      [
        batchId,
        key,
        JSON.stringify({
          provider: "openai",
          model: "gpt-5.6-sol",
          latency_ms: 900,
          prompt_version: CONCEPT_PREMISE_PROMPT_VERSION,
          schema_version: CONCEPT_PREMISE_SCHEMA_VERSION,
          error_code: "unusable_premise_set",
        }),
      ],
    );

  it("marks no sibling failed, and bumps no attempt ordinal", async () => {
    await failedPremise("failed-premise-1");
    const { rows } = await db.query(
      `select concept_index, status, attempt, settled_at
         from public.generation_batch_siblings where batch_id = $1 order by concept_index`,
      [batchId],
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe("pending");
      expect(row.attempt).toBe(0);
      expect(row.settled_at).toBeNull();
    }
  });

  it("leaves the batch unsettleable, because no sibling has finished", async () => {
    // A premise run must not make a batch look complete. `settle_generation_batch` answers from the
    // siblings, and all three are still unfinished — so `in_flight`, and nothing changed.
    await failedPremise("failed-premise-2");
    const { rows } = await db.query(`select public.settle_generation_batch($1) as status`, [
      batchId,
    ]);
    expect(rows[0].status).toBe("in_flight");
  });

  it("keeps a batch-level run and a sibling run from colliding in the run ledger", async () => {
    // `generation_runs.idempotency_key` is unique, and the two keys are built from different bases
    // — `(batch, operation, attempt)` against `(batch, operation, concept_index, attempt)`. If they
    // could collide, one paid call would answer for the other and one would never be recorded.
    await failedPremise("shared-shape-key-A");
    const { rowCount } = await db.query(
      `select * from public.record_batch_sibling_run($1, 0, 0, 'shared-shape-key-B', true, $2::jsonb)`,
      [
        batchId,
        JSON.stringify({
          provider: "openai",
          model: "gpt-5.6-sol",
          operation: "design_intent",
          latency_ms: 800,
          prompt_version: "design_intent_v6",
          schema_version: "design_intent_schema_v6",
        }),
      ],
    );
    expect(rowCount).toBe(1);

    const { rows } = await db.query(
      `select operation::text, concept_index, success
         from public.generation_runs where event_id = $1 order by operation`,
      [eventId],
    );
    // Both calls are in the ledger, distinguishable, and the sibling one settled its own row only.
    expect(rows).toEqual([
      { operation: "concept_premise", concept_index: null, success: false },
      { operation: "design_intent", concept_index: 0, success: true },
    ]);
    const { rows: siblings } = await db.query(
      `select concept_index, status from public.generation_batch_siblings
        where batch_id = $1 order by concept_index`,
      [batchId],
    );
    expect(siblings).toEqual([
      { concept_index: 0, status: "succeeded" },
      { concept_index: 1, status: "pending" },
      { concept_index: 2, status: "pending" },
    ]);
  });
});

describe("the batch ceiling sees every call a batch makes", () => {
  /**
   * The accounting question, asked of the thing that actually decides.
   *
   * `plan_generation_batch` sums `generation_runs` over the ceiling window with **no filter** on
   * operation, event or concept index — so a premise run with a null concept index is counted like
   * any other. That is a property worth proving rather than reading, because the whole reason the
   * premise call is recorded at the batch level is that the ceiling has to see it: a model call the
   * ceiling cannot price is what `docs/phase-4b-plan.md §A.5` refuses.
   *
   * The numbers below are chosen to **discriminate**. Four calls at 1.00 + 3 × 2.00 = 7.00, against
   * a ceiling of 6.00. If the premise row were invisible the three DesignIntent runs would total
   * exactly 6.00, which does not exceed the ceiling, and the batch would be admitted. So the
   * refusal can only happen if the premise call was counted.
   */
  const PREMISE_COST = 1;
  const DESIGN_INTENT_COST = 2;
  const TOTAL = PREMISE_COST + 3 * DESIGN_INTENT_COST;

  async function recordRun(
    operation: string,
    conceptIndex: number | null,
    cost: number,
    key: string,
  ): Promise<void> {
    await db.query(
      `insert into public.generation_runs
         (event_id, provider, operation, model, concept_index, cost_estimate_usd, latency_ms,
          success, prompt_version, schema_version, idempotency_key)
       values ($1, 'openai', $2::public.model_operation, 'gpt-5.6-sol', $3, $4, 1000, true,
               'v', 'v', $5)`,
      [eventId, operation, conceptIndex, cost, key],
    );
  }

  /** One batch's worth of spend: the premise call, then one DesignIntent call per sibling. */
  async function recordOneBatchOfSpend(): Promise<void> {
    await recordRun("concept_premise", null, PREMISE_COST, "spend-premise");
    for (const index of [0, 1, 2]) {
      await recordRun("design_intent", index, DESIGN_INTENT_COST, `spend-di-${index}`);
    }
  }

  function planWithCeiling(
    ceiling: number,
  ): Promise<{ rows: { outcome: string; recorded_spend_usd: string | null }[] }> {
    return db.query(
      `select * from public.plan_generation_batch(
         $1, null, $2, 'planner_v2', 2, 'ceiling-probe', $3::jsonb,
         'batch:event', '\x01'::bytea, 60, 100,
         'batch:account', '\x02'::bytea, 60, 100,
         'batch:rate', '\x03'::bytea, 60, 100,
         3600, $4, 99, 0)`,
      [
        eventId,
        revisionId,
        JSON.stringify({
          siblings: [0, 1, 2].map((index) => ({ index, assignment: { family: "editorial" } })),
        }),
        ceiling,
      ],
    ) as never;
  }

  beforeEach(async () => {
    // Two preconditions that sit in front of the ceiling check, so neither of them is what this
    // block ends up measuring: `plan_generation_batch` refuses `not_authoritative` unless the event
    // names this revision, and refuses on the in-flight rule while the outer fixture's batch is
    // still `running`.
    await db.query(
      `update public.events set authoritative_identity_revision_id = $2 where id = $1`,
      [eventId, revisionId],
    );
    await db.query(
      `update public.generation_batches set status = 'completed', settled_at = now() where id = $1`,
      [batchId],
    );
    await recordOneBatchOfSpend();
  });

  it("counts the premise call, and every DesignIntent call, exactly once", async () => {
    const { rows } = await planWithCeiling(TOTAL - 1);
    expect(rows[0].outcome).toBe("ceiling");
    // The exact total is the whole assertion: one short would mean a call was omitted, one long
    // would mean one was double-counted.
    expect(Number(rows[0].recorded_spend_usd)).toBe(TOTAL);
  });

  it("would admit the batch if the premise call were invisible, and does not", async () => {
    // The discriminating case. Three DesignIntent runs alone total exactly this ceiling, which
    // does not exceed it — so an admitted batch here would prove the premise spend was unseen.
    const { rows } = await planWithCeiling(3 * DESIGN_INTENT_COST);
    expect(rows[0].outcome).toBe("ceiling");
  });

  it("admits the batch once the ceiling covers all four calls", async () => {
    const { rows } = await planWithCeiling(TOTAL + 1);
    expect(rows[0].outcome).toBe("planned");
  });

  it("does not double-count a premise run that was recorded idempotently twice", async () => {
    // `record_batch_call_run` converges on the existing row, so a replay adds no spend. Driven
    // through the RPC rather than asserted, because convergence is what protects the money.
    await db.query(
      `insert into public.generation_batch_siblings (batch_id, concept_index, plan)
       values ($1, 0, '{}'), ($1, 1, '{}'), ($1, 2, '{}')`,
      [batchId],
    );
    const run = JSON.stringify({
      provider: "openai",
      model: "gpt-5.6-sol",
      latency_ms: 10,
      prompt_version: CONCEPT_PREMISE_PROMPT_VERSION,
      schema_version: CONCEPT_PREMISE_SCHEMA_VERSION,
      cost_estimate_usd: 5,
    });
    for (const attempt of [1, 2]) {
      void attempt;
      await db.query(
        `select * from public.record_batch_call_run($1, 'concept_premise', 'replayed-key', true, $2::jsonb)`,
        [batchId, run],
      );
    }
    const { rows } = await planWithCeiling(TOTAL - 1);
    // One extra call at 5.00, counted once: 7 + 5 = 12, not 17.
    expect(Number(rows[0].recorded_spend_usd)).toBe(TOTAL + 5);
  });
});

describe("what the set review changed about the card", () => {
  it("defaults to the empty array, which is the true value for an unrepaired card", async () => {
    expect(await errorCode(insertArtifact({ omitDeviations: true }))).toBeNull();
    const { rows } = await db.query(
      `select card_deviations from public.design_intent_artifacts where batch_id = $1`,
      [batchId],
    );
    expect(rows[0].card_deviations).toEqual([]);
  });

  it("keeps a logged substitution, so the model's own card stays recoverable", async () => {
    const deviations = [
      {
        rule: "concept-card.name",
        path: "concepts.0.presentation.name",
        before: "Common Name",
        after: "Ordered States",
      },
    ];
    expect(await errorCode(insertArtifact({ cardDeviations: deviations }))).toBeNull();
    const { rows } = await db.query(
      `select card_deviations from public.design_intent_artifacts where batch_id = $1`,
      [batchId],
    );
    expect(rows[0].card_deviations).toEqual(deviations);
  });

  it("refuses anything that is not an array", async () => {
    // "This card needed no repair" is `[]`. An object or a scalar here would be a record nothing
    // could read as a list of repairs, which is what `spec.md §31` asks the log to be.
    expect(await errorCode(insertArtifact({ cardDeviations: { rule: "x" } }))).toBe("23514");
  });
});
