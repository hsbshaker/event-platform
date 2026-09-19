import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { connect, createAuthUser, errorCode, resetDatabase } from "./harness";

/**
 * `20260919000000_phase4d_composition_lineage.sql` — a sibling that makes two calls, and a concept
 * that cannot exist before its composition does.
 *
 * Through 4C a sibling was one DesignIntent call, so recording its run and settling the sibling
 * were one event. In 4D the sibling is DesignIntent, then Composition, then a deterministic
 * compile and a rendered-geometry verification that can still fail. The properties below are the
 * ones that would silently corrupt something if they were wrong, in that order:
 *
 *   * **recording is not settling.** A paid Composition response must be recorded the moment it
 *     happens — the ceiling reads `generation_runs` as spend — while the sibling stays unsettled
 *     until its concept is verified and persisted. If the first stage settled the sibling, a batch
 *     would report a concept that does not exist;
 *   * **a settled success names the run it succeeded with**, so
 *     `(status = 'succeeded') = (generation_run_id is not null)` keeps holding;
 *   * **a concept carries what it was fitted against.** `content_profile` is `not null` and
 *     immutable, because a re-fit that cannot see the profile cannot say what changed;
 *   * **an unverified spec cannot be persisted at all** — `verified_clean` is `check (true)`,
 *     which is the database refusing rather than the application promising.
 *
 * **No model call is made here.** No provider module is imported, mocked or reached.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — *"Compiler
 * persists immutable, verified ResolvedDesignSpec"*, *"DesignIntent + CompositionTree (raw and
 * canonical) + ResolvedDesignSpec persist per concept with prompt, schema, primitive-set and
 * compiler versions"*, *"Content fit is verified against rendered geometry at 390 and 1280; a spec
 * revision is final only with `verified.clean = true`"*. Guardrails `spec.md §32 #18`, `#20`,
 * `#24`.
 */

let db: Client;
let eventId: string;
let revisionId: string;
let batchId: string;
let artifactId: string;

const DESIGN_INTENT = { family: "editorial", density: "balanced" };
const TREE = { version: "composition_v1", sections: [{ kind: "hero" }] };
const CONTENT_PROFILE = {
  titleWords: 3,
  titleChars: 18,
  hostsChars: 0,
  venueChars: 21,
  descriptionChars: 0,
  registryCounts: { gift: 6, external: 4, cashfund: 1 },
  provisionalFields: ["venue", "registry"],
};
const SPEC = { version: "resolved_v2", state: "verified", verified: { clean: true } };

/** Telemetry for one stage's call. Shape mirrors what `record_sibling_stage_run` reads. */
function run(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    provider: "openai",
    model: "gpt-5.6-sol",
    latency_ms: 1200,
    prompt_version: "composition_v1_p2",
    schema_version: "composition_schema_v1",
    input_assembly_version: "composition_input_v1",
    primitive_set_version: "composition_v1",
    compiler_version: "compiler_phase3_1_0",
    ...overrides,
  });
}

async function stageRun(
  conceptIndex: number,
  operation: string,
  attempt: number,
  key: string,
  success = true,
  payload = run(),
) {
  const { rows } = await db.query(
    `select * from public.record_sibling_stage_run($1, $2, $3::public.model_operation, $4, $5, $6, $7::jsonb)`,
    [batchId, conceptIndex, operation, attempt, key, success, payload],
  );
  return rows[0] as { outcome: string; run_id: string | null };
}

async function sibling(conceptIndex: number) {
  const { rows } = await db.query(
    `select status, attempt, generation_run_id, settled_at
       from public.generation_batch_siblings where batch_id = $1 and concept_index = $2`,
    [batchId, conceptIndex],
  );
  return rows[0] as {
    status: string;
    attempt: number;
    generation_run_id: string | null;
    settled_at: string | null;
  };
}

/**
 * A concept at index `n` needs the artifact for index `n`: `validate_design_concept_artifact()`
 * requires the two to agree on every column they share, which is the cross-sibling mislink guard.
 */
async function insertArtifactAt(conceptIndex: number): Promise<string> {
  const { rows } = await db.query(
    `insert into public.design_intent_artifacts
       (event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
        assignment, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, design_intent_input_assembly_version, provider, model,
        design_intent, presentation, concept_premise, concept_premise_prompt_version,
        concept_premise_schema_version, concept_premise_input_assembly_version)
     values ($1, $2, $3, $4, 1, 'planner_v2', '{}'::jsonb, $5::jsonb, $6::jsonb,
             'design_intent_v6', 'design_intent_schema_v6', 'design_intent_input_v2',
             'openai', 'gpt-5.6-sol', $7::jsonb, $8::jsonb, '{}'::jsonb,
             'concept_premise_v1', 'concept_premise_schema_v1', 'concept_premise_input_v1')
     returning id`,
    [
      eventId,
      batchId,
      revisionId,
      conceptIndex,
      JSON.stringify({ structure: "stacked" }),
      JSON.stringify({ allowed: [], forbidden: [] }),
      JSON.stringify(DESIGN_INTENT),
      JSON.stringify({ name: "Ordered States", description: "A considered, unfussy direction." }),
    ],
  );
  return rows[0].id as string;
}

async function insertConcept(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    event_id: eventId,
    round: 1,
    concept_index: 0,
    name: "Ordered States",
    description: "A considered, unfussy direction.",
    design_intent: JSON.stringify(DESIGN_INTENT),
    design_intent_artifact_id: artifactId,
    composition_raw: JSON.stringify(TREE),
    composition: JSON.stringify(TREE),
    composition_hash: "hash-a",
    capabilities: JSON.stringify({ rsvp: true, registry: true }),
    content_profile: JSON.stringify(CONTENT_PROFILE),
    directive: JSON.stringify({ structure: "stacked" }),
    token_allotment: JSON.stringify({ allowed: [], forbidden: [] }),
    design_intent_prompt_version: "design_intent_v6",
    design_intent_schema_version: "design_intent_schema_v6",
    composition_prompt_version: "composition_v1_p2",
    composition_schema_version: "composition_schema_v1",
    composition_input_assembly_version: "composition_input_v1",
    primitive_set_version: "composition_v1",
    compiler_version: "compiler_phase3_1_0",
    ...overrides,
  };
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query(
    `insert into public.design_concepts (${columns.join(", ")})
     values (${placeholders}) returning id`,
    Object.values(row),
  );
  return rows[0].id as string;
}

async function insertSpec(conceptId: string, overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    concept_id: conceptId,
    revision: 1,
    spec: JSON.stringify(SPEC),
    content_version: 1,
    verified_clean: true,
    compiler_version: "compiler_phase3_1_0",
    primitive_set_version: "composition_v1",
    ...overrides,
  };
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query(
    `insert into public.resolved_design_specs (${columns.join(", ")})
     values (${placeholders}) returning id`,
    Object.values(row),
  );
  return rows[0].id as string;
}

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
     values ($1, $2, 'planner_v2', 1, 'planned', 'k1') returning id`,
    [eventId, revisionId],
  );
  batchId = batches[0].id as string;

  for (const index of [0, 1, 2]) {
    await db.query(
      `insert into public.generation_batch_siblings (batch_id, concept_index, plan)
       values ($1, $2, '{}'::jsonb)`,
      [batchId, index],
    );
  }

  const { rows: artifacts } = await db.query(
    `insert into public.design_intent_artifacts
       (event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
        assignment, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, design_intent_input_assembly_version, provider, model,
        design_intent, presentation, concept_premise, concept_premise_prompt_version,
        concept_premise_schema_version, concept_premise_input_assembly_version)
     values ($1, $2, $3, 0, 1, 'planner_v2', '{}'::jsonb, $4::jsonb, $5::jsonb,
             'design_intent_v6', 'design_intent_schema_v6', 'design_intent_input_v2',
             'openai', 'gpt-5.6-sol', $6::jsonb, $7::jsonb, '{}'::jsonb,
             'concept_premise_v1', 'concept_premise_schema_v1', 'concept_premise_input_v1')
     returning id`,
    [
      eventId,
      batchId,
      revisionId,
      JSON.stringify({ structure: "stacked" }),
      JSON.stringify({ allowed: [], forbidden: [] }),
      JSON.stringify(DESIGN_INTENT),
      JSON.stringify({ name: "Ordered States", description: "A considered, unfussy direction." }),
    ],
  );
  artifactId = artifacts[0].id as string;
});

describe("model_operation admits composition", () => {
  it("records a composition run as itself, not as design_intent", async () => {
    const result = await stageRun(0, "composition", 0, "c0");
    expect(result.outcome).toBe("recorded");
    const { rows } = await db.query(
      `select operation, concept_index, round, planner_version, primitive_set_version,
              compiler_version
         from public.generation_runs where id = $1`,
      [result.run_id],
    );
    // A composition call recorded under another operation would corrupt the per-operation spend
    // record while looking entirely fine in aggregate.
    expect(rows[0].operation).toBe("composition");
    expect(rows[0].concept_index).toBe(0);
    expect(rows[0].round).toBe(1);
    // Taken from the batch, never from the caller's jsonb: a driver cannot claim another planner.
    expect(rows[0].planner_version).toBe("planner_v2");
    expect(rows[0].primitive_set_version).toBe("composition_v1");
    expect(rows[0].compiler_version).toBe("compiler_phase3_1_0");
  });
});

describe("recording a stage is not settling the sibling", () => {
  it("leaves the sibling unsettled after its DesignIntent run", async () => {
    await stageRun(0, "design_intent", 0, "d0");
    const s = await sibling(0);
    expect(s.status).not.toBe("succeeded");
    expect(s.settled_at).toBeNull();
    expect(s.generation_run_id).toBeNull();
  });

  it("records both stages of one sibling and still leaves it unsettled", async () => {
    const first = await stageRun(0, "design_intent", 0, "d0");
    const second = await stageRun(0, "composition", 0, "c0");
    expect(first.outcome).toBe("recorded");
    expect(second.outcome).toBe("recorded");
    expect(first.run_id).not.toBe(second.run_id);

    const s = await sibling(0);
    // The whole point: a concept is not ready because a model answered. It is ready when its spec
    // verifies clean, which has not happened yet.
    expect(s.status).not.toBe("succeeded");
    expect(s.settled_at).toBeNull();

    const { rows } = await db.query(
      `select operation from public.generation_runs
        where concept_index = 0 and event_id = $1 order by operation`,
      [eventId],
    );
    // `order by operation` is enum order, and `model_operation` declares design_intent before
    // composition — which is also the order the two calls happen in.
    expect(rows.map((r) => r.operation)).toEqual(["design_intent", "composition"]);
  });

  it("moves the batch from planned to running on the first stage run", async () => {
    const before = await db.query(`select status from public.generation_batches where id = $1`, [
      batchId,
    ]);
    expect(before.rows[0].status).toBe("planned");
    await stageRun(0, "design_intent", 0, "d0");
    const after = await db.query(
      `select status, started_at from public.generation_batches where id = $1`,
      [batchId],
    );
    expect(after.rows[0].status).toBe("running");
    expect(after.rows[0].started_at).not.toBeNull();
  });

  it("does not touch the other two siblings", async () => {
    const before = await Promise.all([sibling(1), sibling(2)]);
    await stageRun(0, "design_intent", 0, "d0");
    await stageRun(0, "composition", 0, "c0");
    const after = await Promise.all([sibling(1), sibling(2)]);
    expect(after).toEqual(before);
  });
});

describe("spend cannot be double counted", () => {
  it("converges on the existing row for a replayed idempotency key", async () => {
    const first = await stageRun(0, "composition", 0, "c0");
    const replay = await stageRun(0, "composition", 0, "c0");
    expect(replay.outcome).toBe("duplicate_key");
    expect(replay.run_id).toBe(first.run_id);

    const { rows } = await db.query(
      `select count(*)::int as n from public.generation_runs where idempotency_key = 'c0'`,
    );
    // The ceiling reads this table back as spend, so a second row would charge the account twice
    // for one paid response.
    expect(rows[0].n).toBe(1);
  });

  it("refuses a run recorded against an ordinal the sibling has moved past", async () => {
    const stale = await stageRun(0, "composition", 3, "c-stale");
    expect(stale.outcome).toBe("stale_attempt");
    expect(stale.run_id).toBeNull();
    const { rows } = await db.query(
      `select count(*)::int as n from public.generation_runs where idempotency_key = 'c-stale'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("records a failed call, so a paid failure is still visible as spend", async () => {
    const failed = await stageRun(0, "composition", 0, "c-fail", false, run({ error_code: "500" }));
    expect(failed.outcome).toBe("recorded");
    const { rows } = await db.query(
      `select success, error_code from public.generation_runs where id = $1`,
      [failed.run_id],
    );
    expect(rows[0].success).toBe(false);
    expect(rows[0].error_code).toBe("500");
  });

  it("raises on an unknown batch rather than writing an orphan run", async () => {
    const code = await errorCode(
      db.query(
        `select * from public.record_sibling_stage_run(
           '00000000-0000-0000-0000-000000000000'::uuid, 0, 'composition'::public.model_operation,
           0, 'nope', true, $1::jsonb)`,
        [run()],
      ),
    );
    expect(code).toBe("23503");
  });
});

describe("settling a sibling", () => {
  it("requires a succeeded sibling to name the run it succeeded with", async () => {
    const code = await errorCode(
      db.query(`select public.settle_batch_sibling($1, 0, true, null)`, [batchId]),
    );
    // Otherwise `(status = 'succeeded') = (generation_run_id is not null)` would be violated, and
    // the row would claim a success with nothing behind it.
    expect(code).toBe("23514");
  });

  it("settles succeeded and names the composition run", async () => {
    const composition = await stageRun(0, "composition", 0, "c0");
    const { rows } = await db.query(
      `select public.settle_batch_sibling($1, 0, true, $2) as outcome`,
      [batchId, composition.run_id],
    );
    expect(rows[0].outcome).toBe("succeeded");
    const s = await sibling(0);
    expect(s.status).toBe("succeeded");
    expect(s.generation_run_id).toBe(composition.run_id);
    expect(s.settled_at).not.toBeNull();
  });

  it("is idempotent on a settled success", async () => {
    const composition = await stageRun(0, "composition", 0, "c0");
    await db.query(`select public.settle_batch_sibling($1, 0, true, $2)`, [
      batchId,
      composition.run_id,
    ]);
    const again = await db.query(
      `select public.settle_batch_sibling($1, 0, true, $2) as outcome`,
      [batchId, composition.run_id],
    );
    expect(again.rows[0].outcome).toBe("already_succeeded");
  });

  it("refuses a further stage run once the sibling has succeeded", async () => {
    const composition = await stageRun(0, "composition", 0, "c0");
    await db.query(`select public.settle_batch_sibling($1, 0, true, $2)`, [
      batchId,
      composition.run_id,
    ]);
    const after = await stageRun(0, "composition", 0, "c1");
    expect(after.outcome).toBe("already_succeeded");
  });

  it("settles failed and advances the attempt ordinal", async () => {
    const before = await sibling(0);
    const { rows } = await db.query(
      `select public.settle_batch_sibling($1, 0, false, null) as outcome`,
      [batchId],
    );
    expect(rows[0].outcome).toBe("failed");
    const after = await sibling(0);
    expect(after.status).toBe("failed");
    // A resumed driver derives its next ordinal from the row, not from its own memory.
    expect(after.attempt).toBe(before.attempt + 1);
  });

  it("settles one sibling without touching another", async () => {
    const composition = await stageRun(1, "composition", 0, "c1");
    const before = await Promise.all([sibling(0), sibling(2)]);
    await db.query(`select public.settle_batch_sibling($1, 1, true, $2)`, [
      batchId,
      composition.run_id,
    ]);
    expect(await Promise.all([sibling(0), sibling(2)])).toEqual(before);
  });

  it("raises on a sibling that does not belong to this batch", async () => {
    const code = await errorCode(
      db.query(`select public.settle_batch_sibling($1, 7, false, null)`, [batchId]),
    );
    expect(code).toBe("23503");
  });
});

describe("batch settlement still reads from the siblings", () => {
  it("stays in flight until every sibling is settled", async () => {
    const c0 = await stageRun(0, "composition", 0, "c0");
    await db.query(`select public.settle_batch_sibling($1, 0, true, $2)`, [batchId, c0.run_id]);
    const mid = await db.query(`select public.settle_generation_batch($1) as s`, [batchId]);
    expect(mid.rows[0].s).toBe("in_flight");

    await db.query(`select public.settle_batch_sibling($1, 1, false, null)`, [batchId]);
    await db.query(`select public.settle_batch_sibling($1, 2, false, null)`, [batchId]);
    const end = await db.query(`select public.settle_generation_batch($1) as s`, [batchId]);
    // Two failed siblings is a failed batch: fewer than three concepts is a visible state, and a
    // failed sibling is never replaced by a library recipe.
    expect(end.rows[0].s).toBe("failed");
  });

  it("completes with one failed sibling and two concepts", async () => {
    for (const index of [0, 1]) {
      const c = await stageRun(index, "composition", 0, `c${index}`);
      await db.query(`select public.settle_batch_sibling($1, $2, true, $3)`, [
        batchId,
        index,
        c.run_id,
      ]);
    }
    await db.query(`select public.settle_batch_sibling($1, 2, false, null)`, [batchId]);
    const end = await db.query(`select public.settle_generation_batch($1) as s`, [batchId]);
    expect(end.rows[0].s).toBe("completed");
  });
});

describe("a concept is a composed thing", () => {
  it("cannot be written without its composition", async () => {
    const code = await errorCode(insertConcept({ composition_raw: null }));
    expect(code).toBe("23502");
  });

  it("cannot be written without the content profile it was fitted against", async () => {
    const code = await errorCode(insertConcept({ content_profile: null }));
    expect(code).toBe("23502");
  });

  it("cannot be written without naming the assembly that built its request", async () => {
    const code = await errorCode(insertConcept({ composition_input_assembly_version: null }));
    expect(code).toBe("23502");
  });

  it("stores the content profile verbatim, provisional fields included", async () => {
    const id = await insertConcept();
    const { rows } = await db.query(
      `select content_profile, composition_input_assembly_version
         from public.design_concepts where id = $1`,
      [id],
    );
    expect(rows[0].content_profile).toEqual(CONTENT_PROFILE);
    // Which fields were stand-ins is what a later re-fit needs to know.
    expect(rows[0].content_profile.provisionalFields).toEqual(["venue", "registry"]);
    expect(rows[0].composition_input_assembly_version).toBe("composition_input_v1");
  });

  it("refuses to rewrite the content profile after insert", async () => {
    const id = await insertConcept();
    const code = await errorCode(
      db.query(`update public.design_concepts set content_profile = '{}'::jsonb where id = $1`, [
        id,
      ]),
    );
    expect(code).toBe("42501");
  });

  it("refuses to rewrite the composition input assembly version after insert", async () => {
    const id = await insertConcept();
    const code = await errorCode(
      db.query(
        `update public.design_concepts set composition_input_assembly_version = 'x' where id = $1`,
        [id],
      ),
    );
    expect(code).toBe("42501");
  });
});

describe("only a verified spec is persisted, and only for its own concept", () => {
  it("refuses a spec that did not verify clean", async () => {
    const id = await insertConcept();
    const code = await errorCode(insertSpec(id, { verified_clean: false }));
    // The database refuses, rather than the application promising it checked.
    expect(code).toBe("23514");
  });

  it("makes a verified spec active through the one permitted update", async () => {
    const conceptId = await insertConcept();
    const specId = await insertSpec(conceptId);
    await db.query(
      `update public.design_concepts set active_resolved_spec_id = $1 where id = $2`,
      [specId, conceptId],
    );
    const { rows } = await db.query(
      `select active_resolved_spec_id from public.design_concepts where id = $1`,
      [conceptId],
    );
    expect(rows[0].active_resolved_spec_id).toBe(specId);
  });

  it("refuses to point a concept at another concept's spec", async () => {
    const first = await insertConcept();
    const second = await insertConcept({
      concept_index: 1,
      composition_hash: "hash-b",
      design_intent_artifact_id: await insertArtifactAt(1),
    });
    const otherSpec = await insertSpec(second);
    const code = await errorCode(
      db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
        otherSpec,
        first,
      ]),
    );
    // A cross-sibling mislink is caught by the database, not trusted from the writer.
    expect(code).toBe("23514");
  });

  it("refuses to mutate a persisted spec revision", async () => {
    const conceptId = await insertConcept();
    const specId = await insertSpec(conceptId);
    const code = await errorCode(
      db.query(`update public.resolved_design_specs set spec = '{}'::jsonb where id = $1`, [
        specId,
      ]),
    );
    expect(code).toBe("42501");
  });

  it("appends a re-fit as a new revision rather than replacing one", async () => {
    const conceptId = await insertConcept();
    const first = await insertSpec(conceptId);
    const second = await insertSpec(conceptId, {
      revision: 2,
      content_version: 2,
      supersedes_spec_id: first,
    });
    const { rows } = await db.query(
      `select revision, content_version, supersedes_spec_id
         from public.resolved_design_specs where concept_id = $1 order by revision`,
      [conceptId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].supersedes_spec_id).toBe(first);
    expect(rows[1].content_version).toBe(2);
    expect(second).not.toBe(first);
  });

  it("refuses a second spec at the same revision", async () => {
    const conceptId = await insertConcept();
    await insertSpec(conceptId);
    const code = await errorCode(insertSpec(conceptId));
    expect(code).toBe("23505");
  });
});
