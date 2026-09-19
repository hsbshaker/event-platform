import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { readGenerationState } from "@/lib/generation/generation-state";

import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";
import { supabaseShim } from "./supabase-shim";

/**
 * Phase 4F — the durable generation read model, and the recovery that keeps it reachable.
 *
 * Two things are proven here that no unit test can:
 *
 *   * **the projection reads what the pipeline actually writes.** `generation-state.test.ts`
 *     proves the stage rules over constructed rows; this proves the queries behind them — the
 *     right tables, the right keys, the right round — against the schema the migrations apply. A
 *     mis-keyed join is invisible to a fixture and fatal in production;
 *   * **`recover_stale_generation_batches` releases an event a dead process would otherwise brick
 *     for ever.** `generation_batches_one_in_flight` is a partial unique index with no expiry, so
 *     a batch left `running` refuses every future batch for that event. That is a database fact
 *     and so is its release, including the part that matters most: a batch that is *not* stale,
 *     and a sibling that already succeeded, are not touched.
 *
 * **No model call is made here.** No provider module is imported and nothing reaches a network:
 * every row below is written directly, which is exactly what the pipeline would have left behind.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — *"Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)"* and
 * *"The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * fabricated progress or completion percentages (§7.10)"*. Guardrails `spec.md §32 #41`, `#24`,
 * `#26`.
 */

let db: Client;
let ownerId: string;
let eventId: string;
let revisionId: string;

const TONE_KEYWORDS = ["heritage", "heirloom", "polished", "understated"];

const IDENTITY_RESULT = {
  identity: { toneKeywords: TONE_KEYWORDS, creativeDirection: "An orchard supper at dusk." },
  suppliedFacts: {},
  clarification: { needed: false, questions: [] },
};

const DESIGN_INTENT = {
  family: "editorial",
  tonalDirection: "light",
  palette: ["#0A0A0A", "#FFFFFF"],
  typographyPairing: "playfair_source",
  motifs: ["botanical_sprig"],
  composition: { ornament: "restrained" },
};

const TREE = { version: "composition_v1", sections: [{ kind: "hero" }] };
const CONTENT_PROFILE = { titleWords: 3, titleChars: 18, provisionalFields: [] };

const SPEC = {
  version: "resolved_v2",
  state: "verified",
  verified: { clean: true },
  tokens: {
    palette: {
      surfaceBase: "#FAF6EC",
      surfaceAlt: "#EFE8DA",
      surfaceAccent: "#7A5C2E",
      surfaceContrast: "#22301F",
      text: "#1B1B1B",
      textMuted: "#5A5A52",
      textOnContrast: "#F3EDE0",
      textOnAccent: "#FFFFFF",
      button: "#2F4230",
      buttonText: "#FFFFFF",
      accent: "#7A5C2E",
      accentText: "#FFFFFF",
      border: "#D8CEBC",
      focus: "#7A5C2E",
      error: "#8C1F1F",
      errorText: "#FFFFFF",
    },
  },
};

const INTENT = {
  version: "visual_art_v1",
  role: "anchor",
  subject: "A long table under strung lights.",
  paletteHexes: ["#1F2A24"],
};

/** A batch, optionally backdated so the recovery bound can be exercised without waiting. */
async function makeBatch(
  args: { round: number; status?: string; ageSeconds?: number; key?: string } = { round: 1 },
): Promise<string> {
  const age = args.ageSeconds ?? 0;
  const { rows } = await db.query(
    `insert into public.generation_batches
       (event_id, identity_revision_id, planner_version, round, status, idempotency_key,
        created_at, started_at, settled_at)
     values ($1, $2, 'planner_v2', $3, $4::public.generation_batch_status, $5,
             pg_catalog.now() - pg_catalog.make_interval(secs => $6),
             case when $4 = 'planned' then null
                  else pg_catalog.now() - pg_catalog.make_interval(secs => $6) end,
             case when $4 in ('completed', 'failed') then pg_catalog.now() else null end)
     returning id`,
    [
      eventId,
      revisionId,
      args.round,
      args.status ?? "running",
      args.key ?? `key-${args.round}`,
      age,
    ],
  );
  return rows[0].id as string;
}

/**
 * Sibling rows in the states the driver would have left them in.
 *
 * `generation_batch_siblings_success_has_run` requires a `succeeded` sibling to name a real run,
 * so one is written for it. That is the pipeline's own shape, and writing the row here rather than
 * relaxing the expectation is what keeps these fixtures honest.
 */
async function makeSiblings(batchId: string, statuses: readonly string[]): Promise<void> {
  for (const [index, status] of statuses.entries()) {
    let runId: string | null = null;
    if (status === "succeeded") {
      const { rows } = await db.query(
        `insert into public.generation_runs
           (event_id, user_id, provider, operation, model, latency_ms, success, prompt_version,
            schema_version, idempotency_key)
         values ($1, $2, 'openai', 'design_intent', 'gpt-5.6-sol', 1200, true, 'design_intent_v6',
                 'design_intent_schema_v6', $3)
         returning id`,
        [eventId, ownerId, `${batchId}:${index}`],
      );
      runId = rows[0].id as string;
    }
    await db.query(
      `insert into public.generation_batch_siblings
         (batch_id, concept_index, plan, status, generation_run_id, settled_at)
       values ($1, $2, '{}'::jsonb, $3::public.generation_batch_sibling_status, $4,
               case when $3 in ('succeeded', 'failed') then pg_catalog.now() else null end)`,
      [batchId, index, status, runId],
    );
  }
}

async function makeArtifact(batchId: string, round: number, index: number): Promise<string> {
  const { rows } = await db.query(
    `insert into public.design_intent_artifacts
       (event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
        assignment, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, design_intent_input_assembly_version, provider, model,
        design_intent, presentation, concept_premise, concept_premise_prompt_version,
        concept_premise_schema_version, concept_premise_input_assembly_version)
     values ($1, $2, $3, $4, $5, 'planner_v2', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
             'design_intent_v6', 'design_intent_schema_v6', 'design_intent_input_v2',
             'openai', 'gpt-5.6-sol', $6::jsonb, $7::jsonb, '{}'::jsonb,
             'concept_premise_v1', 'concept_premise_schema_v1', 'concept_premise_input_v1')
     returning id`,
    [
      eventId,
      batchId,
      revisionId,
      index,
      round,
      JSON.stringify(DESIGN_INTENT),
      JSON.stringify({ name: `Concept ${index}`, description: `Direction number ${index}.` }),
    ],
  );
  return rows[0].id as string;
}

async function makeConcept(artifactId: string, round: number, index: number): Promise<string> {
  const { rows } = await db.query(
    `insert into public.design_concepts
       (event_id, round, concept_index, name, description, design_intent,
        design_intent_artifact_id, composition_raw, composition, composition_hash, capabilities,
        content_profile, directive, token_allotment, design_intent_prompt_version,
        design_intent_schema_version, composition_prompt_version, composition_schema_version,
        composition_input_assembly_version, primitive_set_version, compiler_version)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $8::jsonb, $9, '{}'::jsonb,
             $10::jsonb, '{}'::jsonb, '{}'::jsonb, 'design_intent_v6', 'design_intent_schema_v6',
             'composition_v1_p4', 'composition_schema_v2', 'composition_input_v2',
             'composition_v2', 'compiler_phase3_1_0')
     returning id`,
    [
      eventId,
      round,
      index,
      `Concept ${index}`,
      `Direction number ${index}.`,
      JSON.stringify(DESIGN_INTENT),
      artifactId,
      JSON.stringify(TREE),
      `hash-${round}-${index}`,
      JSON.stringify(CONTENT_PROFILE),
    ],
  );
  return rows[0].id as string;
}

async function makeSpec(conceptId: string, activate = true): Promise<string> {
  const { rows } = await db.query(
    `insert into public.resolved_design_specs
       (concept_id, revision, spec, content_version, verified_clean, compiler_version,
        primitive_set_version)
     values ($1, 1, $2::jsonb, 1, true, 'compiler_phase3_1_0', 'composition_v2')
     returning id`,
    [conceptId, JSON.stringify(SPEC)],
  );
  const specId = rows[0].id as string;
  if (activate) {
    await db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
      specId,
      conceptId,
    ]);
  }
  return specId;
}

/** One concept, complete: artifact, concept row and an active verified spec. */
async function makeReadyConcept(batchId: string, round: number, index: number): Promise<string> {
  const artifactId = await makeArtifact(batchId, round, index);
  const conceptId = await makeConcept(artifactId, round, index);
  return makeSpec(conceptId);
}

async function reserveSlot(specId: string, slotId: string): Promise<void> {
  await db.query(
    `insert into public.resolved_spec_artwork_slots
       (resolved_spec_id, slot_id, role, extent, mobile_width_px, mobile_height_px,
        desktop_width_px, desktop_height_px, visual_art_intent, visual_art_intent_version)
     values ($1, $2, 'anchor'::public.artwork_role, 'full', 390, 420, 1280, 560, $3::jsonb, $4)`,
    [specId, slotId, JSON.stringify(INTENT), INTENT.version],
  );
}

const read = () => readGenerationState(supabaseShim(db), eventId);

const siblingStatuses = async (batchId: string) =>
  (
    await db.query(
      `select concept_index, status, attempt from public.generation_batch_siblings
        where batch_id = $1 order by concept_index`,
      [batchId],
    )
  ).rows;

const batchStatus = async (batchId: string) =>
  (await db.query(`select status from public.generation_batches where id = $1`, [batchId]))
    .rows[0].status as string;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await resetDatabase(db);
  ownerId = await createAuthUser(db, "owner@example.test");

  const { rows: events } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'An orchard supper') returning id`,
    [ownerId],
  );
  eventId = events[0].id as string;

  const { rows: revisions } = await db.query(
    `insert into public.event_identity_revisions
       (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
        provider, model)
     values ($1, 1, $2::jsonb, 'event_identity_v5', 'event_identity_schema_v5',
             'event_identity_input_v2', 'openai', 'gpt-5.6-sol')
     returning id`,
    [eventId, JSON.stringify(IDENTITY_RESULT)],
  );
  revisionId = revisions[0].id as string;

  await db.query(
    `update public.events set authoritative_identity_revision_id = $1 where id = $2`,
    [revisionId, eventId],
  );
});

describe("the generation read model, over real rows", () => {
  it("offers the action and the vibe before any batch exists", async () => {
    const view = await read();

    expect(view).toEqual({
      stage: "not_started",
      vibe: TONE_KEYWORDS,
      concepts: [],
      canStart: true,
    });
  });

  it("withholds the action while no identity is authoritative", async () => {
    await db.query(
      `update public.events set authoritative_identity_revision_id = null where id = $1`,
      [eventId],
    );

    const view = await read();
    expect(view).toEqual({ stage: "not_started", concepts: [], canStart: false });
  });

  it("reports exploring while the premise call runs, with nothing per-concept", async () => {
    const batchId = await makeBatch({ round: 1, status: "running" });
    await makeSiblings(batchId, ["pending", "pending", "pending"]);

    const view = await read();
    expect(view.stage).toBe("exploring");
    expect(view.canStart).toBe(false);
    expect(view.concepts).toHaveLength(3);
    expect(view.concepts.every((c) => c.stage === "planned" && !c.previewable)).toBe(true);
  });

  it("makes a concept previewable the moment its verified spec lands, siblings still running", async () => {
    const batchId = await makeBatch({ round: 1, status: "running" });
    await makeSiblings(batchId, ["succeeded", "pending", "pending"]);
    await makeReadyConcept(batchId, 1, 0);
    await makeArtifact(batchId, 1, 1);

    const view = await read();
    expect(view.stage).toBe("designing");
    expect(view.concepts.map((c) => c.stage)).toEqual(["ready", "designing", "planned"]);
    expect(view.concepts[0]).toMatchObject({
      previewable: true,
      settled: true,
      name: "Concept 0",
      description: "Direction number 0.",
      typography: "playfair_source",
      vocabulary: ["botanical_sprig"],
    });
    // The compiled semantic palette, in the compiler's role order and deduped — never the raw
    // creative colours (`spec.md §32 #26`).
    expect(view.concepts[0].palette?.[0]).toBe("#FAF6EC");
    expect(view.concepts[0].palette).not.toContain("#0A0A0A");
    expect(view.concepts[0].palette).toEqual([...new Set(view.concepts[0].palette)]);
  });

  it("exposes no counter, id, version, provider or prompt anywhere in the payload", async () => {
    const batchId = await makeBatch({ round: 1, status: "running" });
    await makeSiblings(batchId, ["succeeded", "failed", "pending"]);
    const specId = await makeReadyConcept(batchId, 1, 0);
    await reserveSlot(specId, "hero-anchor");

    const payload = JSON.stringify(await read());
    for (const forbidden of [
      batchId,
      revisionId,
      specId,
      eventId,
      ownerId,
      "planner_v2",
      "gpt-5.6-sol",
      "openai",
      "attempt",
      "round",
      "idempotency",
      "An orchard supper",
      "compiler_phase3_1_0",
    ]) {
      expect(payload, `the view leaked ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("reports partial when one sibling failed and two are ready", async () => {
    const batchId = await makeBatch({ round: 1, status: "completed" });
    await makeSiblings(batchId, ["succeeded", "failed", "succeeded"]);
    await makeReadyConcept(batchId, 1, 0);
    await makeReadyConcept(batchId, 1, 2);

    const view = await read();
    expect(view.stage).toBe("partial");
    expect(view.concepts.map((c) => c.previewable)).toEqual([true, false, true]);
    expect(view.canStart).toBe(true);
  });

  it("reads only the latest round", async () => {
    const first = await makeBatch({ round: 1, status: "completed", key: "k1" });
    await makeSiblings(first, ["succeeded", "succeeded", "succeeded"]);
    await makeReadyConcept(first, 1, 0);

    const second = await makeBatch({ round: 2, status: "running", key: "k2" });
    await makeSiblings(second, ["pending", "pending", "pending"]);

    const view = await read();
    expect(view.stage).toBe("exploring");
    expect(view.concepts.every((c) => !c.previewable)).toBe(true);
  });

  it("counts artwork slots, and holds a concept unsettled while one is outstanding", async () => {
    const batchId = await makeBatch({ round: 1, status: "completed" });
    await makeSiblings(batchId, ["succeeded"]);
    const specId = await makeReadyConcept(batchId, 1, 0);
    await reserveSlot(specId, "hero-anchor");
    await reserveSlot(specId, "footer-mark");

    const reserved = await read();
    expect(reserved.concepts[0].artwork).toEqual({ pending: 2, delivered: 0, failed: 0 });
    expect(reserved.concepts[0]).toMatchObject({ previewable: true, settled: false });

    await db.query(`select public.request_artwork_slot($1, 'hero-anchor')`, [specId]);
    const requested = await read();
    expect(requested.concepts[0].artwork).toEqual({ pending: 2, delivered: 0, failed: 0 });

    await db.query(
      `select public.attach_artwork_asset($1, 'hero-anchor', 'event-artwork', 'a/b.png',
         1600, 900, 482311, 'image/png', false, null, null, null, null, null, null)`,
      [specId],
    );
    await db.query(
      `select public.fail_artwork_slot($1, 'footer-mark', 'provider_unavailable', null)`,
      [specId],
    );

    const settled = await read();
    expect(settled.concepts[0].artwork).toEqual({ pending: 0, delivered: 1, failed: 1 });
    expect(settled.concepts[0].settled).toBe(true);
    // A failed slot never withdraws a page that was verified before any image existed.
    expect(settled.concepts[0].previewable).toBe(true);
  });

  it("omits the artwork field entirely for a spec that reserved no slot", async () => {
    const batchId = await makeBatch({ round: 1, status: "completed" });
    await makeSiblings(batchId, ["succeeded"]);
    await makeReadyConcept(batchId, 1, 0);

    expect((await read()).concepts[0].artwork).toBeUndefined();
  });
});

describe("recovering a batch whose process died", () => {
  const recover = (seconds = 900) =>
    db.query(`select * from public.recover_stale_generation_batches($1, $2)`, [eventId, seconds]);

  it("leaves a batch that is still within the bound completely alone", async () => {
    const batchId = await makeBatch({ round: 1, status: "running", ageSeconds: 120 });
    await makeSiblings(batchId, ["pending", "running", "pending"]);

    const { rows } = await recover();
    expect(rows).toEqual([]);
    expect(await batchStatus(batchId)).toBe("running");
    expect((await siblingStatuses(batchId)).map((r) => r.status)).toEqual([
      "pending",
      "running",
      "pending",
    ]);
  });

  it("fails the non-terminal siblings of a stale batch and settles it", async () => {
    const batchId = await makeBatch({ round: 1, status: "running", ageSeconds: 3_600 });
    await makeSiblings(batchId, ["pending", "running", "pending"]);

    const { rows } = await recover();
    expect(rows).toEqual([{ batch_id: batchId, failed_siblings: 3, status: "failed" }]);
    expect(await batchStatus(batchId)).toBe("failed");
    // The ordinal advances exactly as `settle_batch_sibling`'s failure path advances it, so a
    // resumption cannot re-issue under a key the dead attempt may already have spent against.
    for (const row of await siblingStatuses(batchId)) {
      expect(row.status).toBe("failed");
      expect(row.attempt).toBe(1);
    }
  });

  it("keeps the concepts a stale batch had already finished, and completes rather than fails", async () => {
    // §I: one failed sibling still completes the batch, because concept-level readiness is
    // canonical. Recovery must not turn two real concepts into a failed batch.
    const batchId = await makeBatch({ round: 1, status: "running", ageSeconds: 3_600 });
    await makeSiblings(batchId, ["succeeded", "succeeded", "running"]);
    await makeReadyConcept(batchId, 1, 0);
    await makeReadyConcept(batchId, 1, 1);

    const { rows } = await recover();
    expect(rows[0]).toMatchObject({ failed_siblings: 1, status: "completed" });
    expect((await siblingStatuses(batchId)).map((r) => r.status)).toEqual([
      "succeeded",
      "succeeded",
      "failed",
    ]);
    // A succeeded sibling is final and its ordinal is untouched.
    expect((await siblingStatuses(batchId)).map((r) => r.attempt)).toEqual([0, 0, 1]);
  });

  it("is idempotent: a second call finds nothing to do", async () => {
    const batchId = await makeBatch({ round: 1, status: "running", ageSeconds: 3_600 });
    await makeSiblings(batchId, ["pending", "pending", "pending"]);

    await recover();
    const { rows } = await recover();
    expect(rows).toEqual([]);
    expect(await batchStatus(batchId)).toBe("failed");
  });

  it("releases the one-in-flight index, so the event can be generated again", async () => {
    const batchId = await makeBatch({ round: 1, status: "running", ageSeconds: 3_600 });
    await makeSiblings(batchId, ["pending", "pending", "pending"]);

    // Before recovery the index refuses a second in-flight batch for this event.
    expect(await errorCode(makeBatch({ round: 2, status: "running", key: "k2" }))).toBe("23505");

    await recover();
    await expect(makeBatch({ round: 2, status: "running", key: "k2b" })).resolves.toBeTruthy();
    expect(await batchStatus(batchId)).toBe("failed");
  });

  it("refuses a bound short enough to reach into a live batch", async () => {
    expect(await errorCode(recover(30))).toBe("23514");
    expect(await errorCode(recover(0))).toBe("23514");
  });

  it("is scoped to one event", async () => {
    const otherEvent = (
      await db.query(
        `insert into public.events (owner_id, prompt) values ($1, 'Another party') returning id`,
        [ownerId],
      )
    ).rows[0].id as string;
    const otherRevision = (
      await db.query(
        `insert into public.event_identity_revisions
           (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
            provider, model)
         values ($1, 1, $2::jsonb, 'event_identity_v5', 'event_identity_schema_v5',
                 'event_identity_input_v2', 'openai', 'gpt-5.6-sol')
         returning id`,
        [otherEvent, JSON.stringify(IDENTITY_RESULT)],
      )
    ).rows[0].id as string;
    const otherBatch = (
      await db.query(
        `insert into public.generation_batches
           (event_id, identity_revision_id, planner_version, round, status, idempotency_key,
            created_at, started_at)
         values ($1, $2, 'planner_v2', 1, 'running', 'other',
                 pg_catalog.now() - interval '2 hours', pg_catalog.now() - interval '2 hours')
         returning id`,
        [otherEvent, otherRevision],
      )
    ).rows[0].id as string;
    await makeSiblings(otherBatch, ["pending", "pending", "pending"]);

    const ourBatch = await makeBatch({ round: 1, status: "running", ageSeconds: 3_600 });
    await makeSiblings(ourBatch, ["pending", "pending", "pending"]);

    await recover();
    expect(await batchStatus(ourBatch)).toBe("failed");
    // The other event's batch is just as dead, and just as untouched: a waiting host clears their
    // own event, never somebody else's.
    expect(await batchStatus(otherBatch)).toBe("running");
  });

  it("is unreachable from anon and from an end-user JWT", async () => {
    // The tables it reads are revoked from both roles precisely because round ordinals, attempt
    // counters and failure counts are the backend counters `spec.md §32 #41` withholds. A
    // `security definer` function over them that `authenticated` could call would hand them back.
    for (const actor of [{ kind: "anon" } as const, { kind: "user" as const, id: ownerId }]) {
      const code = await asActor(db, actor, (q) =>
        errorCode(q(`select * from public.recover_stale_generation_batches($1, 900)`, [eventId])),
      );
      expect(code).toBe("42501");
    }
  });

  it("runs on the read path, so a poll is enough to unblock the event", async () => {
    const batchId = await makeBatch({ round: 1, status: "running", ageSeconds: 3_600 });
    await makeSiblings(batchId, ["succeeded", "pending", "pending"]);
    await makeReadyConcept(batchId, 1, 0);

    // The host does nothing but reload. Before this existed the answer was `designing` with
    // `canStart: false`, for ever.
    const view = await read();
    expect(view.stage).toBe("partial");
    expect(view.canStart).toBe(true);
    expect(view.concepts.map((c) => c.stage)).toEqual(["ready", "failed", "failed"]);
    // Two siblings never finished, so §I settles the batch `failed` — and the one concept that
    // did finish is still previewable, because readiness is per concept (`spec.md §7.10 #5`).
    expect(await batchStatus(batchId)).toBe("failed");
    expect(view.concepts[0].previewable).toBe(true);
  });
});
