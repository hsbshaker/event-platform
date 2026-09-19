import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
  DESIGN_INTENT_PROMPT_VERSION,
  DESIGN_INTENT_SCHEMA_VERSION,
} from "@/lib/ai/versions";

import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";

/**
 * Phase 4C T17 — `design_intent_artifacts`, `design_concepts.design_intent_artifact_id` and the
 * insert-time equality check.
 *
 * `docs/phase-4b-plan.md §G.2` (the immutable artifact and its column list), `§G.3` (all four
 * points of its relationship to `design_concepts`), `§G.4` (the DesignIntent attribution
 * invariant), `§G.1` (why the nullable-then-fill lifecycle was withdrawn). `spec.md §9.4`,
 * `§31 — DesignIntent, composition and compiler`; `CLAUDE.md §2`.
 *
 * **No model call is made here, or anywhere in T17.** This task is persistence: no provider
 * module is imported, mocked or reached. Every fixture is a real row — a real event, a real
 * identity revision, a real T16 `generation_batches` row — because the properties under test are
 * about how those rows constrain each other, and a hand-faked id would prove nothing about a
 * foreign key.
 *
 * The properties, in the order they would silently corrupt attribution if they were wrong:
 *
 *   * the artifact can never be rewritten, by any role, on any column;
 *   * one artifact per planned sibling — `unique (batch_id, concept_index)`;
 *   * the artifact agrees with its own batch about event, round and identity revision;
 *   * a concept agrees with its artifact on **every** column they both carry (`§G.3` point 3's
 *     exhaustive enumeration), so it cannot claim one lineage while pointing at another;
 *   * the lineage pointer itself cannot be moved after insert (`§G.3` point 2);
 *   * `generation_run_id` carries no referential action, so telemetry stays prunable (`§G.2`);
 *   * the inline `design_intent` snapshot is still `NOT NULL` and still protected (`§G.3` point 3).
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — "Every generated
 * concept persists DesignIntent, the raw and canonical CompositionTree, every ResolvedDesignSpec
 * revision and the prompt, schema, primitive-set and compiler versions"; and `CLAUDE.md §2`,
 * "Generated design data is immutable … nothing persisted is mutated". `spec.md §32` guardrails
 * #18 (generated design data immutable) and #41 (no backend counter exposure).
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventId: string;
let revisionId: string;

const DESIGN_INTENT = { family: "editorial", tone: "quiet" };
const DIRECTIVE = { structure: "Split", opening: "title" };
const ALLOTMENT = { allowed: ["rule"], forbidden: ["monogram"] };
const ASSIGNMENT = { family: "editorial", tonalDirection: "quiet", typographyCategory: "serif" };
const PRESENTATION = { name: "Pressed Garden", description: "A quiet editorial direction." };
/**
 * A premise-shaped payload, and deliberately not a real one.
 *
 * The column is `jsonb` with no key check for the same reason `design_intent` is: the shape belongs
 * to `src/lib/ai/concept-premise/contract.ts`, and asserting it here would be that contract written
 * twice in the one place a correction has to ship as a whole new migration.
 */
const CONCEPT_PREMISE = { title: "Ordered States", organizingIdea: "one idea, stated once" };

/**
 * The versions the artifact records are the production constants, not literals beside them.
 *
 * Phase 4C T18 added `DESIGN_INTENT_INPUT_ASSEMBLY_VERSION` and `docs/phase-4b-plan.md §G.2`
 * is what this column is for, so the column and the constant have to be the same thing. A
 * literal here would let the code bump its version while the persistence test kept asserting
 * the old one — which is precisely the drift `§B.3`'s bump rule exists to prevent.
 */
const PROMPT_VERSION = DESIGN_INTENT_PROMPT_VERSION;
const SCHEMA_VERSION = DESIGN_INTENT_SCHEMA_VERSION;
const ASSEMBLY_VERSION = DESIGN_INTENT_INPUT_ASSEMBLY_VERSION;

/** Every column of `design_intent_artifacts`, so the immutability sweep cannot go stale. */
const ARTIFACT_COLUMNS = [
  "id",
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
  "provider_config",
  "provider_request_id",
  "generation_run_id",
  "design_intent",
  // Added by `20260918000000_phase4c_concept_premise_lineage.sql` (`spec.md §7.7a`). Listed here
  // rather than in a file of their own so the immutability sweep and the grant check below cover
  // them: T17's whole point is that a column added later cannot silently become writable or
  // readable.
  "concept_premise",
  "concept_premise_prompt_version",
  "concept_premise_schema_version",
  "concept_premise_input_assembly_version",
  "presentation",
  "card_deviations",
  "created_at",
] as const;

/**
 * The five columns a member must never read, and the sixteen they may.
 *
 * `20260916210000` (T12) section 2 established the rule on `event_identity_revisions`: everything
 * describing *how the call was made* is server-only, because PostgREST hands a member every
 * granted column straight to the browser. These are the same five column names, so they get the
 * same treatment one table over.
 */
const WITHHELD_COLUMNS = [
  "provider",
  "model",
  "provider_config",
  "provider_request_id",
  "generation_run_id",
] as const;

const GRANTED_COLUMNS = ARTIFACT_COLUMNS.filter(
  (column) => !(WITHHELD_COLUMNS as readonly string[]).includes(column),
);

async function newEvent(prompt = "A garden baby shower"): Promise<string> {
  const { rows } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, $2) returning id`,
    [owner, prompt],
  );
  return rows[0].id as string;
}

async function newRevision(event: string, revision = 1): Promise<string> {
  const { rows } = await db.query(
    `insert into public.event_identity_revisions
       (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
        provider, model)
     values ($1, $2, '{"clarification":{"questions":[]}}', 'event_identity_v5',
             'event_identity_schema_v5', 'event_identity_input_v2', 'openai', 'gpt-5.6-sol')
     returning id`,
    [event, revision],
  );
  return rows[0].id as string;
}

async function newBatch(event: string, revision: string, round = 1): Promise<string> {
  const { rows } = await db.query(
    `insert into public.generation_batches
       (event_id, identity_revision_id, planner_version, round, idempotency_key)
     values ($1, $2, 'planner_v1', $3, $4) returning id`,
    [event, revision, round, `batch-${event}-${round}`],
  );
  return rows[0].id as string;
}

async function newRun(event: string): Promise<string> {
  const { rows } = await db.query(
    `insert into public.generation_runs
       (event_id, provider, operation, model, latency_ms, success, prompt_version, schema_version)
     values ($1, 'openai', 'design_intent', 'gpt-5.6-sol', 1200, true, $2, $3) returning id`,
    [event, PROMPT_VERSION, SCHEMA_VERSION],
  );
  return rows[0].id as string;
}

type ArtifactOverrides = {
  eventId?: string;
  batchId?: string;
  revisionId?: string;
  conceptIndex?: number;
  round?: number;
  designIntent?: unknown;
  directive?: unknown;
  tokenAllotment?: unknown;
  promptVersion?: string;
  schemaVersion?: string;
  presentation?: unknown;
  generationRunId?: string | null;
  conceptPremise?: unknown;
  cardDeviations?: unknown;
};

async function insertArtifact(batchId: string, o: ArtifactOverrides = {}): Promise<string> {
  const { rows } = await db.query(
    `insert into public.design_intent_artifacts
       (event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
        assignment, directive, token_allotment,
        design_intent_prompt_version, design_intent_schema_version,
        design_intent_input_assembly_version, provider, model, provider_config,
        provider_request_id, generation_run_id, design_intent, presentation,
        concept_premise, concept_premise_prompt_version, concept_premise_schema_version,
        concept_premise_input_assembly_version, card_deviations)
     values ($1, $2, $3, $4, $5, 'planner_v1', $6, $7, $8, $9, $10, $11, 'openai', 'gpt-5.6-sol',
             '{"reasoningEffort":"high"}', 'resp_t17', $12, $13, $14,
             $15, 'concept_premise_v1', 'concept_premise_schema_v1', 'concept_premise_input_v1',
             $16)
     returning id`,
    [
      o.eventId ?? eventId,
      batchId,
      o.revisionId ?? revisionId,
      o.conceptIndex ?? 0,
      o.round ?? 1,
      JSON.stringify(ASSIGNMENT),
      JSON.stringify(o.directive ?? DIRECTIVE),
      JSON.stringify(o.tokenAllotment ?? ALLOTMENT),
      o.promptVersion ?? PROMPT_VERSION,
      o.schemaVersion ?? SCHEMA_VERSION,
      ASSEMBLY_VERSION,
      o.generationRunId ?? null,
      JSON.stringify(o.designIntent ?? DESIGN_INTENT),
      JSON.stringify(o.presentation ?? PRESENTATION),
      JSON.stringify(o.conceptPremise ?? CONCEPT_PREMISE),
      JSON.stringify(o.cardDeviations ?? []),
    ],
  );
  return rows[0].id as string;
}

type ConceptOverrides = ArtifactOverrides & { designIntentIsNull?: boolean };

function insertConcept(artifactId: string, o: ConceptOverrides = {}): Promise<unknown> {
  return db.query(
    `insert into public.design_concepts
       (event_id, round, concept_index, name, description, design_intent, composition_raw,
        composition, composition_hash, capabilities, directive, token_allotment,
        design_intent_artifact_id, design_intent_prompt_version, design_intent_schema_version,
        composition_prompt_version, composition_schema_version,
        composition_input_assembly_version, content_profile, primitive_set_version,
        compiler_version)
     values ($1, $2, $3, 'Pressed Garden', 'A quiet editorial direction.', $4,
             '{"version":"composition_v1","sections":[]}',
             '{"version":"composition_v1","sections":[]}', $5, '{"rsvp":true}', $6, $7, $8, $9,
             $10, 'composition_v1_p2', 'composition_schema_v1', 'composition_input_v1',
             '{"titleWords":3,"titleChars":18,"hostsChars":0,"venueChars":21,"descriptionChars":0,"registryCounts":{"gift":6,"external":4,"cashfund":1},"provisionalFields":[]}'::jsonb, 'composition_v1', 'compiler_v0')
     returning id`,
    [
      o.eventId ?? eventId,
      o.round ?? 1,
      o.conceptIndex ?? 0,
      o.designIntentIsNull ? null : JSON.stringify(o.designIntent ?? DESIGN_INTENT),
      `hash-${o.conceptIndex ?? 0}`,
      JSON.stringify(o.directive ?? DIRECTIVE),
      JSON.stringify(o.tokenAllotment ?? ALLOTMENT),
      artifactId,
      o.promptVersion ?? PROMPT_VERSION,
      o.schemaVersion ?? SCHEMA_VERSION,
    ],
  );
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
}, 120_000);

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("truncate public.events, public.rate_limits cascade; delete from auth.users");
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  cohost = await createAuthUser(db, "cohost@example.com");
  stranger = await createAuthUser(db, "stranger@example.com");
  eventId = await newEvent();
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventId, cohost],
  );
  revisionId = await newRevision(eventId);
});

/* ------------------------------------------------------------------ §G.3 point 2: emptiness */

describe("design_concepts was empty when the lineage column was added", () => {
  it("has no row that predates design_intent_artifact_id", async () => {
    // `§G.3` point 2 asks for this to be verified at implementation time rather than assumed. On a
    // freshly migrated database it is true by construction; the standing guarantee is the column's
    // own shape — `add column … not null` with no default fails outright (23502) against a
    // non-empty table rather than inventing a lineage for a row that never had one.
    const { rows } = await db.query(`select count(*)::int as n from public.design_concepts`);
    expect(rows[0].n).toBe(0);
    const { rows: column } = await db.query(
      `select is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'design_concepts'
         and column_name = 'design_intent_artifact_id'`,
    );
    expect(column).toEqual([{ is_nullable: "NO", column_default: null }]);
  });
});

/* ------------------------------------------------------------------------- §G.2: the artifact */

describe("the artifact is written once and never again", () => {
  it("accepts a sibling whose lineage is real", async () => {
    const batch = await newBatch(eventId, revisionId);
    const id = await insertArtifact(batch);
    const { rows } = await db.query(
      `select event_id, batch_id, identity_revision_id, concept_index, round, planner_version,
              design_intent, presentation, design_intent_input_assembly_version
       from public.design_intent_artifacts where id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      event_id: eventId,
      batch_id: batch,
      identity_revision_id: revisionId,
      concept_index: 0,
      round: 1,
      planner_version: "planner_v1",
      design_intent: DESIGN_INTENT,
      presentation: PRESENTATION,
      design_intent_input_assembly_version: ASSEMBLY_VERSION,
    });
  });

  it("refuses every UPDATE, on every column, for the service role and the table owner", async () => {
    const batch = await newBatch(eventId, revisionId);
    const id = await insertArtifact(batch);
    // A value of the right type for each column, chosen so the statement would succeed if the
    // trigger were absent. The list is every column of the table, so a column added later without
    // a thought for immutability fails here rather than silently becoming writable.
    const assignments: Record<(typeof ARTIFACT_COLUMNS)[number], string> = {
      id: "id = gen_random_uuid()",
      event_id: "event_id = event_id",
      batch_id: "batch_id = batch_id",
      identity_revision_id: "identity_revision_id = identity_revision_id",
      concept_index: "concept_index = 2",
      round: "round = 1",
      planner_version: "planner_version = 'planner_v2'",
      assignment: `assignment = '{"family":"statement"}'`,
      directive: `directive = '{"structure":"Rail"}'`,
      token_allotment: `token_allotment = '{"allowed":[]}'`,
      design_intent_prompt_version: "design_intent_prompt_version = 'design_intent_v5'",
      design_intent_schema_version: "design_intent_schema_version = 'design_intent_schema_v5'",
      design_intent_input_assembly_version:
        "design_intent_input_assembly_version = 'design_intent_input_v2'",
      provider: "provider = 'anthropic'",
      model: "model = 'other'",
      provider_config: `provider_config = '{"reasoningEffort":"low"}'`,
      provider_request_id: "provider_request_id = 'resp_other'",
      generation_run_id: "generation_run_id = gen_random_uuid()",
      design_intent: `design_intent = '{"family":"statement"}'`,
      concept_premise: `concept_premise = '{"title":"Other Premise"}'`,
      concept_premise_prompt_version: "concept_premise_prompt_version = 'concept_premise_v2'",
      concept_premise_schema_version:
        "concept_premise_schema_version = 'concept_premise_schema_v2'",
      concept_premise_input_assembly_version:
        "concept_premise_input_assembly_version = 'concept_premise_input_v2'",
      presentation: `presentation = '{"name":"Other","description":"Other."}'`,
      card_deviations: `card_deviations = '[{"rule":"concept-card.name"}]'`,
      created_at: "created_at = now()",
    };
    // Every column is covered, including the no-op assignments: `reject_update()` raises before it
    // looks at anything, which is the property — there is no column list to fall out of date.
    expect(Object.keys(assignments).sort()).toEqual([...ARTIFACT_COLUMNS].sort());

    for (const column of ARTIFACT_COLUMNS) {
      const set = assignments[column];
      expect(
        await errorCode(
          db.query(`update public.design_intent_artifacts set ${set} where id = $1`, [id]),
        ),
        `${set} (table owner)`,
      ).toBe("42501");
      expect(
        await errorCode(
          asActor(db, { kind: "service" }, (q) =>
            q(`update public.design_intent_artifacts set ${set} where id = $1`, [id]),
          ),
        ),
        `${set} (service_role)`,
      ).toBe("42501");
    }
    // …and a bare touch-nothing update, which is the cheapest way to discover a carve-out.
    expect(
      await errorCode(
        db.query(`update public.design_intent_artifacts set round = round where id = $1`, [id]),
      ),
    ).toBe("42501");
  });

  it("holds one artifact per planned sibling", async () => {
    const batch = await newBatch(eventId, revisionId);
    await insertArtifact(batch, { conceptIndex: 1 });
    expect(await errorCode(insertArtifact(batch, { conceptIndex: 1 }))).toBe("23505");
    // A different index in the same batch, and the same index in another batch, are both fine.
    expect(await errorCode(insertArtifact(batch, { conceptIndex: 2 }))).toBeNull();
    const other = await newEvent("A second event");
    const otherRevision = await newRevision(other);
    const otherBatch = await newBatch(other, otherRevision);
    expect(
      await errorCode(
        insertArtifact(otherBatch, {
          conceptIndex: 1,
          eventId: other,
          revisionId: otherRevision,
        }),
      ),
    ).toBeNull();
  });

  it("keeps the concept index inside the planner's range", async () => {
    const batch = await newBatch(eventId, revisionId);
    expect(await errorCode(insertArtifact(batch, { conceptIndex: 3 }))).toBe("23514");
    expect(await errorCode(insertArtifact(batch, { conceptIndex: -1 }))).toBe("23514");
  });

  it("requires a presentation object carrying both of the keys canon names", async () => {
    const batch = await newBatch(eventId, revisionId);
    for (const presentation of [
      { name: "Only a name" },
      { description: "Only a description." },
      { name: "", description: "A direction." },
      { name: "A name", description: "" },
      { name: 4, description: "A direction." },
      {},
    ]) {
      expect(
        await errorCode(insertArtifact(batch, { presentation })),
        JSON.stringify(presentation),
      ).toBe("23514");
    }
  });

  it("refuses an artifact that disagrees with its own batch", async () => {
    const batch = await newBatch(eventId, revisionId);
    const other = await newEvent("A second event");
    const otherRevision = await newRevision(other);
    // A different event, a different round, and a different identity revision from the batch's.
    expect(await errorCode(insertArtifact(batch, { eventId: other })), "event").toBe("23514");
    expect(await errorCode(insertArtifact(batch, { round: 2 })), "round").toBe("23514");
    expect(
      await errorCode(insertArtifact(batch, { revisionId: await newRevision(eventId, 2) })),
      "identity revision",
    ).toBe("23514");
    // The other event's revision is not this batch's either, whichever event it belongs to.
    expect(await errorCode(insertArtifact(batch, { revisionId: otherRevision })), "foreign").toBe(
      "23514",
    );
  });
});

/* ------------------------------------------------------- §G.2: generation_run_id takes no FK */

describe("telemetry stays prunable, and the artifact keeps saying where it came from", () => {
  it("lets a generation run be pruned while the artifact lives, without rewriting it", async () => {
    // The 4B lesson, one table over. `on delete set null` here would make the database UPDATE an
    // immutable row, which `reject_update()` refuses — so pruning telemetry would fail with
    // "rows in design_intent_artifacts are immutable". `on delete restrict` is not the
    // alternative: it makes telemetry unprunable instead. The column is a plain uuid, so the run
    // can go and the artifact keeps its provenance, exactly as `provider_request_id` does.
    const batch = await newBatch(eventId, revisionId);
    const run = await newRun(eventId);
    const id = await insertArtifact(batch, { generationRunId: run });

    expect(
      await errorCode(db.query(`delete from public.generation_runs where id = $1`, [run])),
    ).toBeNull();

    const { rows } = await db.query(
      `select generation_run_id, design_intent from public.design_intent_artifacts where id = $1`,
      [id],
    );
    expect(rows[0].generation_run_id).toBe(run);
    expect(rows[0].design_intent).toEqual(DESIGN_INTENT);
  });

  it("carries no foreign key or referential action on generation_run_id", async () => {
    // The structural half of the property above, so a later migration cannot reintroduce the
    // constraint and leave the behavioural test passing only because nothing pruned in that order.
    const { rows } = await db.query(
      `select c.conname
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
       where t.relname = 'design_intent_artifacts' and c.contype = 'f'
         and a.attname = 'generation_run_id'`,
    );
    expect(rows).toEqual([]);
  });
});

/* ------------------------------------------------ §G.3 point 3: the equality check at the seam */

describe("a concept cannot claim a lineage it does not have", () => {
  let batch: string;
  let artifact: string;

  beforeEach(async () => {
    batch = await newBatch(eventId, revisionId);
    artifact = await insertArtifact(batch);
  });

  it("accepts a concept that agrees with its artifact on everything they both carry", async () => {
    expect(await errorCode(insertConcept(artifact))).toBeNull();
    const { rows } = await db.query(`select design_intent_artifact_id from public.design_concepts`);
    expect(rows).toEqual([{ design_intent_artifact_id: artifact }]);
  });

  it("refuses a concept pointing at an artifact from a different event", async () => {
    const other = await newEvent("A second event");
    const otherRevision = await newRevision(other);
    const otherBatch = await newBatch(other, otherRevision);
    const otherArtifact = await insertArtifact(otherBatch, {
      eventId: other,
      revisionId: otherRevision,
    });
    // The concept belongs to this event; the artifact does not. Nothing else differs.
    expect(await errorCode(insertConcept(otherArtifact))).toBe("23514");
  });

  it("refuses a wrong round and a wrong concept index", async () => {
    // `(round 2, index 0)` pointing at an artifact from `(round 1, index 2)` is the exact example
    // §G.3 point 3 gives for why payload-only equality is not enough.
    expect(await errorCode(insertConcept(artifact, { round: 2 })), "round").toBe("23514");
    expect(await errorCode(insertConcept(artifact, { conceptIndex: 1 })), "index").toBe("23514");
  });

  it("refuses a mismatched design intent snapshot", async () => {
    expect(
      await errorCode(insertConcept(artifact, { designIntent: { family: "statement" } })),
    ).toBe("23514");
  });

  it("refuses a concept that claims a version its artifact does not record", async () => {
    // "a concept claiming schema `v5` while its artifact records `v4`" — §G.3 point 3.
    expect(
      await errorCode(insertConcept(artifact, { schemaVersion: "design_intent_schema_v5" })),
      "schema version",
    ).toBe("23514");
    expect(
      await errorCode(insertConcept(artifact, { promptVersion: "design_intent_v5" })),
      "prompt version",
    ).toBe("23514");
  });

  it("refuses a mismatched directive and a mismatched token allotment", async () => {
    // The two §G.3 point 3 adds explicitly, because `design_concepts` carries them nullably and an
    // enumeration that let them drift would be the same stale-list defect as an unprotected column.
    expect(
      await errorCode(insertConcept(artifact, { directive: { structure: "Rail" } })),
      "directive",
    ).toBe("23514");
    expect(
      await errorCode(insertConcept(artifact, { tokenAllotment: { allowed: [] } })),
      "token allotment",
    ).toBe("23514");
    // Null on the concept's side is a disagreement too, not an absence the check skips.
    expect(
      await errorCode(
        db.query(
          `insert into public.design_concepts
             (event_id, round, concept_index, name, description, design_intent, composition_raw,
              composition, composition_hash, capabilities, design_intent_artifact_id,
              design_intent_prompt_version, design_intent_schema_version,
              composition_prompt_version, composition_schema_version,
              composition_input_assembly_version, content_profile, primitive_set_version,
              compiler_version)
           values ($1, 1, 0, 'Pressed Garden', 'A quiet editorial direction.', $2, '{}', '{}',
                   'h', '{"rsvp":true}', $3, $4, $5, 'composition_v1_p2', 'composition_schema_v1',
                   'composition_input_v1', '{"titleWords":3,"titleChars":18,"hostsChars":0,"venueChars":21,"descriptionChars":0,"registryCounts":{"gift":6,"external":4,"cashfund":1},"provisionalFields":[]}'::jsonb, 'composition_v1', 'compiler_v0')`,
          [eventId, JSON.stringify(DESIGN_INTENT), artifact, PROMPT_VERSION, SCHEMA_VERSION],
        ),
      ),
      "null directive and allotment",
    ).toBe("23514");
  });

  it("names every mismatched column, so a drifting writer is told all of it at once", async () => {
    // Guards the enumeration itself: a column silently dropped from the check would stop appearing
    // here, which is the failure mode §G.3 point 3 calls a stale list.
    const message = await db
      .query(
        `insert into public.design_concepts
           (event_id, round, concept_index, name, description, design_intent, composition_raw,
            composition, composition_hash, capabilities, directive, token_allotment,
            design_intent_artifact_id, design_intent_prompt_version, design_intent_schema_version,
            composition_prompt_version, composition_schema_version,
            composition_input_assembly_version, content_profile, primitive_set_version,
            compiler_version)
         values ($1, 2, 1, 'X', 'Y', '{"family":"statement"}', '{}', '{}', 'h', '{}',
                 '{"structure":"Rail"}', '{"allowed":[]}', $2, 'design_intent_v9',
                 'design_intent_schema_v9', 'composition_v1_p2', 'composition_schema_v1',
                 'composition_input_v1', '{"titleWords":3,"titleChars":18,"hostsChars":0,"venueChars":21,"descriptionChars":0,"registryCounts":{"gift":6,"external":4,"cashfund":1},"provisionalFields":[]}'::jsonb, 'composition_v1', 'compiler_v0')`,
        [eventId, artifact],
      )
      .then(() => "")
      .catch((error: { message: string }) => error.message);

    for (const column of [
      "design_intent",
      "round",
      "concept_index",
      "design_intent_prompt_version",
      "design_intent_schema_version",
      "directive",
      "token_allotment",
    ]) {
      expect(message, column).toContain(column);
    }
  });

  it("refuses a concept whose artifact does not exist at all", async () => {
    await db.query(`delete from public.design_intent_artifacts where id = $1`, [artifact]);
    expect(await errorCode(insertConcept(artifact))).toBe("23503");
  });
});

/* ---------------------------------------------- §G.3 point 2: the lineage pointer cannot move */

describe("the lineage pointer is immutable once the concept exists", () => {
  it("refuses to re-point a concept at another sibling's artifact", async () => {
    const batch = await newBatch(eventId, revisionId);
    const first = await insertArtifact(batch, { conceptIndex: 0 });
    const second = await insertArtifact(batch, { conceptIndex: 1 });
    const { rows } = (await insertConcept(first)) as { rows: { id: string }[] };
    const conceptId = rows[0].id;

    for (const actor of ["owner", "service"] as const) {
      const run =
        actor === "owner"
          ? db.query(
              `update public.design_concepts set design_intent_artifact_id = $1 where id = $2`,
              [second, conceptId],
            )
          : asActor(db, { kind: "service" }, (q) =>
              q(`update public.design_concepts set design_intent_artifact_id = $1 where id = $2`, [
                second,
                conceptId,
              ]),
            );
      expect(await errorCode(run), actor).toBe("42501");
    }

    // Nulling it is refused twice over: by the protect trigger and by NOT NULL.
    expect(
      await errorCode(
        db.query(
          `update public.design_concepts set design_intent_artifact_id = null where id = $1`,
          [conceptId],
        ),
      ),
    ).toBe("42501");

    const { rows: after } = await db.query(
      `select design_intent_artifact_id from public.design_concepts where id = $1`,
      [conceptId],
    );
    expect(after[0].design_intent_artifact_id).toBe(first);
  });

  it("still lets the two mutable columns move", async () => {
    // §G.1: only `active_resolved_spec_id` and `selected_at` may change, and adding the lineage
    // column must not have narrowed that.
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);
    const { rows } = (await insertConcept(artifact)) as { rows: { id: string }[] };
    const conceptId = rows[0].id;
    const { rows: spec } = await db.query(
      `insert into public.resolved_design_specs
         (concept_id, revision, spec, content_version, verified_clean, compiler_version,
          primitive_set_version)
       values ($1, 1, '{"version":"resolved_v2"}', 1, true, 'compiler_v0', 'composition_v1')
       returning id`,
      [conceptId],
    );
    expect(
      await errorCode(
        db.query(
          `update public.design_concepts set active_resolved_spec_id = $1, selected_at = now()
           where id = $2`,
          [spec[0].id, conceptId],
        ),
      ),
    ).toBeNull();
  });
});

/* ----------------------------------------- §G.3 point 3: the inline snapshot is kept, not relaxed */

describe("the inline design_intent snapshot is retained and still protected", () => {
  it("is still NOT NULL", async () => {
    // §G.3 point 3 keeps the inline snapshot deliberately: "relaxing a NOT NULL to avoid
    // duplication would weaken the very invariant this decision exists to preserve". The column
    // constraint is the claim, so it is read straight from the catalogue.
    const { rows } = await db.query(
      `select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'design_concepts'
         and column_name = 'design_intent'`,
    );
    expect(rows).toEqual([{ is_nullable: "NO" }]);

    // And a null snapshot is refused at runtime. The code is the equality check's, not NOT NULL's,
    // because a BEFORE INSERT trigger runs before column constraints are evaluated — and a null
    // snapshot can never equal an artifact's, which is itself NOT NULL. Both refusals are real;
    // this one simply gets there first.
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);
    expect(await errorCode(insertConcept(artifact, { designIntentIsNull: true }))).toBe("23514");
  });

  it("is still refused by protect_design_concept(), alongside the rest of the design data", async () => {
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);
    const { rows } = (await insertConcept(artifact)) as { rows: { id: string }[] };
    for (const set of [
      `design_intent = '{"family":"statement"}'`,
      `directive = '{"structure":"Rail"}'`,
      `token_allotment = '{"allowed":[]}'`,
      `design_intent_schema_version = 'design_intent_schema_v5'`,
      `name = 'Renamed'`,
    ]) {
      expect(
        await errorCode(
          db.query(`update public.design_concepts set ${set} where id = $1`, [rows[0].id]),
        ),
        set,
      ).toBe("42501");
    }
  });
});

/* ------------------------------------------------------------ deletion and cascade semantics */

describe("deletion semantics are what they were, plus one more thing that cannot be orphaned", () => {
  it("still cascades an event deletion through every generated row", async () => {
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);
    const { rows } = (await insertConcept(artifact)) as { rows: { id: string }[] };
    const { rows: spec } = await db.query(
      `insert into public.resolved_design_specs
         (concept_id, revision, spec, content_version, verified_clean, compiler_version,
          primitive_set_version)
       values ($1, 1, '{}', 1, true, 'compiler_v0', 'composition_v1') returning id`,
      [rows[0].id],
    );
    await db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
      spec[0].id,
      rows[0].id,
    ]);
    await db.query(`update public.events set active_concept_id = $1 where id = $2`, [
      rows[0].id,
      eventId,
    ]);

    // Through the owner's own DELETE, the way `spec.md §11` grants it — not as the table owner.
    const code = await asActor(
      db,
      { kind: "user", id: owner },
      (q) => errorCode(q(`delete from public.events where id = $1`, [eventId])),
      { commit: true },
    );
    expect(code).toBeNull();

    const { rows: counts } = await db.query(
      `select (select count(*)::int from public.design_intent_artifacts) as artifacts,
              (select count(*)::int from public.design_concepts) as concepts,
              (select count(*)::int from public.resolved_design_specs) as specs,
              (select count(*)::int from public.generation_batches) as batches,
              (select count(*)::int from public.event_identity_revisions) as revisions`,
    );
    expect(counts[0]).toEqual({
      artifacts: 0,
      concepts: 0,
      specs: 0,
      batches: 0,
      revisions: 0,
    });
  });

  it("refuses to delete an artifact out from under a concept, or a batch out from under an artifact", async () => {
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);
    await insertConcept(artifact);
    expect(
      await errorCode(
        db.query(`delete from public.design_intent_artifacts where id = $1`, [artifact]),
      ),
      "artifact under a concept",
    ).toBe("23503");
    expect(
      await errorCode(db.query(`delete from public.generation_batches where id = $1`, [batch])),
      "batch under an artifact",
    ).toBe("23503");
  });
});

/* ------------------------------------------------------------------------------------- RLS */

describe("artifacts are member-readable and server-written", () => {
  it("lets members read their event's artifacts and shows strangers nothing", async () => {
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);

    for (const member of [owner, cohost]) {
      const seen = await asActor(db, { kind: "user", id: member }, (q) =>
        q(`select id from public.design_intent_artifacts`),
      );
      expect(seen.rows).toEqual([{ id: artifact }]);
    }
    const asStranger = await asActor(db, { kind: "user", id: stranger }, (q) =>
      q(`select id from public.design_intent_artifacts`),
    );
    expect(asStranger.rowCount).toBe(0);
  });

  it("withholds the provider internals from members, as T12 does on the revisions table", async () => {
    // `20260916210000` (T12) section 2 revoked the table-wide member SELECT on
    // `event_identity_revisions` precisely because PostgREST hands a member every granted column
    // from their own browser session. This table carries the same five columns, so it gets the same
    // treatment — and the first draft of this migration did not, which is what this test pins.
    const batch = await newBatch(eventId, revisionId);
    await insertArtifact(batch);

    for (const member of [owner, cohost]) {
      for (const column of WITHHELD_COLUMNS) {
        expect(
          await errorCode(
            asActor(db, { kind: "user", id: member }, (q) =>
              q(`select ${column} from public.design_intent_artifacts`),
            ),
          ),
          `${column} as ${member === owner ? "owner" : "co-host"}`,
        ).toBe("42501");
      }
      // `select *` is the same leak spelled the lazy way, and PostgREST's default projection.
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: member }, (q) =>
            q(`select * from public.design_intent_artifacts`),
          ),
        ),
        "select *",
      ).toBe("42501");
    }
  });

  it("still gives members every column a member-facing read legitimately wants", async () => {
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);

    for (const member of [owner, cohost]) {
      const seen = await asActor(db, { kind: "user", id: member }, (q) =>
        q(`select ${GRANTED_COLUMNS.join(", ")} from public.design_intent_artifacts`),
      );
      expect(seen.rows.length).toBe(1);
      expect(seen.rows[0]).toMatchObject({
        id: artifact,
        event_id: eventId,
        batch_id: batch,
        identity_revision_id: revisionId,
        design_intent: DESIGN_INTENT,
        presentation: PRESENTATION,
        assignment: ASSIGNMENT,
        directive: DIRECTIVE,
        token_allotment: ALLOTMENT,
      });
    }
  });

  it("grants exactly that column list, and no more, in the catalogue", async () => {
    // The structural half. Without it a later migration could widen the grant back to table-wide
    // and every behavioural assertion above would still pass for the columns it happens to name.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'design_intent_artifacts'
         and grantee = 'authenticated' and privilege_type = 'SELECT'
       order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([...GRANTED_COLUMNS].sort());

    // And `authenticated` holds no other privilege on the table at all.
    const { rows: other } = await db.query<{ privilege_type: string }>(
      `select distinct privilege_type from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'design_intent_artifacts'
         and grantee = 'authenticated' and privilege_type <> 'SELECT'`,
    );
    expect(other).toEqual([]);

    // `anon` holds nothing, on any column.
    const { rows: anon } = await db.query(
      `select column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'design_intent_artifacts'
         and grantee = 'anon'`,
    );
    expect(anon).toEqual([]);
  });

  it("keeps the insert-time triggers off the columns a member may not read", async () => {
    // T12 section 3's trap, closed before it can be sprung. `validate_clarification_answer` ran
    // `select * into rev` against a `%rowtype`, which demands SELECT on every column; it is not
    // `security definer`, so narrowing the grant in section 2 would have refused every honest
    // co-host answer with 42501. Both T17 triggers load rows the same way, so both read only the
    // columns they compare.
    //
    // No end-user role can reach `validate_design_concept_artifact()` today — `20260912000000`
    // revokes INSERT on `design_concepts` from `anon` and `authenticated`, so the trap is latent
    // rather than live — which is exactly why it is asserted structurally rather than by trying to
    // insert a concept as a co-host, a statement the grant would refuse for an unrelated reason.
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: cohost }, (q) =>
          q(
            `insert into public.design_concepts (event_id, round, concept_index) values ($1, 1, 0)`,
            [eventId],
          ),
        ),
      ),
      "a co-host cannot insert a concept at all, so the trigger never runs under their grant",
    ).toBe("42501");

    for (const fn of ["validate_design_concept_artifact", "validate_design_intent_artifact"]) {
      const { rows } = await db.query<{ def: string }>(
        `select pg_get_functiondef(p.oid) as def from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = $1`,
        [fn],
      );
      expect(rows.length, fn).toBe(1);
      // Comments stripped first: both functions *describe* the trap they avoid, and a naive match
      // would read the description as the defect.
      const code = rows[0].def.replace(/--[^\n]*/g, "");
      expect(code, `${fn} must not select * into a %rowtype`).not.toMatch(/select\s+\*\s+into/i);
      expect(code, `${fn} must not declare a %rowtype`).not.toMatch(/%rowtype/i);
      // Not `security definer` either — like T12's, these run as the caller and read only what
      // they check, rather than escalating to read what they should not need.
      expect(code, `${fn} must not be security definer`).not.toMatch(/security\s+definer/i);
    }

    // …and the check still works: a valid concept inserts, through the server-side role that
    // actually writes concepts.
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);
    expect(
      await errorCode(
        asActor(db, { kind: "service" }, (q) =>
          q(
            `insert into public.design_concepts
               (event_id, round, concept_index, name, description, design_intent, composition_raw,
                composition, composition_hash, capabilities, directive, token_allotment,
                design_intent_artifact_id, design_intent_prompt_version,
                design_intent_schema_version, composition_prompt_version,
                composition_schema_version, composition_input_assembly_version, content_profile,
                primitive_set_version, compiler_version)
             values ($1, 1, 0, 'Pressed Garden', 'A quiet editorial direction.', $2, '{}', '{}',
                     'h', '{"rsvp":true}', $3, $4, $5, $6, $7, 'composition_v1_p2',
                     'composition_schema_v1', 'composition_input_v1', '{"titleWords":3,"titleChars":18,"hostsChars":0,"venueChars":21,"descriptionChars":0,"registryCounts":{"gift":6,"external":4,"cashfund":1},"provisionalFields":[]}'::jsonb,
                     'composition_v1', 'compiler_v0')`,
            [
              eventId,
              JSON.stringify(DESIGN_INTENT),
              JSON.stringify(DIRECTIVE),
              JSON.stringify(ALLOTMENT),
              artifact,
              PROMPT_VERSION,
              SCHEMA_VERSION,
            ],
          ),
        ),
      ),
    ).toBeNull();
  });

  it("gives anon nothing at all, and end users no write of any kind", async () => {
    const batch = await newBatch(eventId, revisionId);
    const artifact = await insertArtifact(batch);

    expect(
      await errorCode(
        asActor(db, { kind: "anon" }, (q) => q(`select id from public.design_intent_artifacts`)),
      ),
    ).toBe("42501");

    for (const statement of [
      `insert into public.design_intent_artifacts (event_id, batch_id, identity_revision_id,
         concept_index, round, planner_version, assignment, directive, token_allotment,
         design_intent_prompt_version, design_intent_schema_version,
         design_intent_input_assembly_version, provider, model, design_intent, presentation)
       values ('${eventId}', '${batch}', '${revisionId}', 1, 1, 'p', '{}', '{}', '{}', 'p', 's',
               'a', 'openai', 'm', '{}', '{"name":"N","description":"D"}')`,
      `update public.design_intent_artifacts set model = 'other' where id = '${artifact}'`,
      `delete from public.design_intent_artifacts where id = '${artifact}'`,
    ]) {
      expect(
        await errorCode(asActor(db, { kind: "user", id: owner }, (q) => q(statement))),
        statement.slice(0, 40),
      ).toBe("42501");
    }
  });

  it("exposes no backend generation or spend counter (spec.md §32 #41)", async () => {
    // The reason this table takes the member-readable pattern rather than the server-only one:
    // it carries no counter to expose. A column added later that does would make the posture
    // wrong, so the absence is asserted rather than assumed.
    const { rows } = await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'design_intent_artifacts'
         and (column_name like '%token%' and column_name <> 'token_allotment'
              or column_name like '%cost%' or column_name like '%attempt%'
              or column_name like '%latency%' or column_name like '%reprompt%'
              or column_name like '%usage%')`,
    );
    expect(rows).toEqual([]);
  });
});
