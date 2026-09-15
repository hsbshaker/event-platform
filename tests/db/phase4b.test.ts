import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";

import {
  isProvisional,
  SUPPORTED_IDENTITY_SCHEMA_VERSIONS,
} from "../../src/lib/ai/event-identity/lifecycle";

/**
 * Phase 4B T2/T3 — identity revisions, the authority invariant, and answer provenance.
 *
 * The rule these migrations exist to enforce is that **the caller cannot lie about provisional
 * state**. Everything else here is scaffolding around three claims:
 *
 * 1. an unreadable envelope is refused, never read as authoritative (fail closed);
 * 2. `is_provisional` cannot be supplied, and the authority decision does not depend on it
 *    anyway — the pointer trigger re-derives from the persisted JSON;
 * 3. an answer proves which question it answers, and cannot be filed against another event's
 *    revision, another index, another route, or another person.
 *
 * The TypeScript/SQL parity block at the end is the one that would catch the failure nobody sees
 * coming: two implementations of one rule, drifting. It runs both over every response in the four
 * `v5` evidence journals, read-only.
 *
 * spec.md §7.6b, §7.7, §9.4; docs/phase-4b-plan.md §A, §B.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const V5 = "event_identity_schema_v5";

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventId: string;
let otherEventId: string;

const creativeQuestion = (label = "Warmer") => ({
  kind: "creative",
  question: "Should this lean warmer or cooler?",
  whyItMatters: "the answers lead somewhere materially different",
  options: [
    { label, isDefer: false },
    { label: "Cooler", isDefer: false },
    { label: "You decide", isDefer: true },
  ],
});

const boundaryQuestion = () => ({
  kind: "boundary",
  question: "Has she agreed to be pictured with her sister?",
  whyItMatters: "the brief would otherwise take a position that is not ours to take",
  options: [
    { label: "Yes, feature it", isDefer: false },
    { label: "Leave it out", isDefer: false },
  ],
});

const envelope = (questions: unknown[]) => ({
  identity: { copyTone: "warm" },
  suppliedFacts: {},
  clarification: { needed: questions.length > 0, questions },
});

async function insertRevision(
  event: string,
  revision: number,
  questions: unknown[],
  overrides: { schemaVersion?: string; result?: unknown; answerIds?: string[] } = {},
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.event_identity_revisions
       (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
        provider, model, clarification_answer_ids)
     values ($1, $2, $3, 'event_identity_v5', $4, 'event_identity_input_v1', 'openai',
             'gpt-5.6-sol', $5)
     returning id`,
    [
      event,
      revision,
      JSON.stringify(overrides.result ?? envelope(questions)),
      overrides.schemaVersion ?? V5,
      overrides.answerIds ?? [],
    ],
  );
  return rows[0].id as string;
}

async function answer(
  revisionId: string,
  index: number,
  question: ReturnType<typeof creativeQuestion> | ReturnType<typeof boundaryQuestion>,
  overrides: Partial<{
    eventId: string;
    round: number;
    kind: string;
    questionText: string;
    options: unknown;
    selected: string | null;
    freeText: string | null;
    isDefer: boolean;
    answeredBy: string;
  }> = {},
) {
  return db.query(
    `insert into public.clarification_answers
       (event_id, identity_revision_id, question_index, round, kind, question_text, options,
        selected_option_label, free_text, is_defer, answered_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [
      overrides.eventId ?? eventId,
      revisionId,
      index,
      overrides.round ?? 1,
      overrides.kind ?? question.kind,
      overrides.questionText ?? question.question,
      JSON.stringify(overrides.options ?? question.options),
      overrides.selected === undefined ? question.options[0].label : overrides.selected,
      overrides.freeText ?? null,
      overrides.isDefer ?? false,
      overrides.answeredBy ?? owner,
    ],
  );
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query("truncate public.events cascade; delete from auth.users");
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  cohost = await createAuthUser(db, "cohost@example.com", "Co Host");
  stranger = await createAuthUser(db, "stranger@example.com");
  const { rows } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'A spring garden baby shower')
     returning id`,
    [owner],
  );
  eventId = rows[0].id as string;
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')
     on conflict do nothing`,
    [eventId, cohost],
  );
  const other = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'A different event') returning id`,
    [stranger],
  );
  otherEventId = other.rows[0].id as string;
});

/* ------------------------------------------------------------------ fail closed */

describe("the authority rule refuses shapes it cannot read", () => {
  it("refuses an unsupported schema version", async () => {
    expect(
      await errorCode(
        db.query(`select public.identity_is_provisional($1::jsonb, 'event_identity_schema_v6')`, [
          JSON.stringify(envelope([])),
        ]),
      ),
    ).toBe("0A000");
  });

  it.each([
    ["a legacy brief with no envelope", { copyTone: "warm" }],
    ["a missing clarification", { identity: {}, suppliedFacts: {} }],
    ["questions as an object", { clarification: { questions: {} } }],
    ["questions as a string", { clarification: { questions: "none" } }],
  ])("refuses %s rather than calling it authoritative", async (_label, value) => {
    expect(
      await errorCode(
        db.query(`select public.identity_is_provisional($1::jsonb, $2)`, [
          JSON.stringify(value),
          V5,
        ]),
      ),
    ).toBe("23514");
  });

  it("refuses to insert a revision whose envelope cannot be read", async () => {
    // The generated column evaluates on insert, so an unreadable envelope cannot be stored at all.
    expect(await errorCode(insertRevision(eventId, 1, [], { result: { copyTone: "warm" } }))).toBe(
      "23514",
    );
  });
});

/* ------------------------------------------------------------------ the generated column */

describe("is_provisional is derived, never supplied", () => {
  it("rejects an INSERT that names the column", async () => {
    expect(
      await errorCode(
        db.query(
          `insert into public.event_identity_revisions
             (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
              provider, model, is_provisional)
           values ($1, 1, $2, 'event_identity_v5', $3, 'event_identity_input_v1', 'openai', 'm',
                   false)`,
          [eventId, JSON.stringify(envelope([boundaryQuestion()])), V5],
        ),
      ),
    ).toBe("428C9");
  });

  it("derives true for a boundary question and false otherwise", async () => {
    await insertRevision(eventId, 1, [creativeQuestion()]);
    await insertRevision(eventId, 2, [boundaryQuestion()]);
    const { rows } = await db.query(
      `select revision, is_provisional from public.event_identity_revisions
       where event_id = $1 order by revision`,
      [eventId],
    );
    expect(rows.map((r) => r.is_provisional)).toEqual([false, true]);
  });
});

/* ------------------------------------------------------------------ the pointer */

describe("a provisional identity can never become authoritative", () => {
  it("accepts an authoritative revision", async () => {
    const id = await insertRevision(eventId, 1, []);
    await db.query(
      `update public.events set authoritative_identity_revision_id = $1 where id = $2`,
      [id, eventId],
    );
    const { rows } = await db.query(
      `select authoritative_identity_revision_id from public.events where id = $1`,
      [eventId],
    );
    expect(rows[0].authoritative_identity_revision_id).toBe(id);
  });

  it("refuses a revision carrying a boundary question", async () => {
    const id = await insertRevision(eventId, 1, [boundaryQuestion()]);
    expect(
      await errorCode(
        db.query(`update public.events set authoritative_identity_revision_id = $1 where id = $2`, [
          id,
          eventId,
        ]),
      ),
    ).toBe("23514");
  });

  it("still refuses it when the convenience column is tampered with directly", async () => {
    const id = await insertRevision(eventId, 1, [boundaryQuestion()]);
    // Forge the cache as thoroughly as anything could: drop the generation so the column becomes
    // ordinary, disable the immutability trigger that would otherwise refuse the write, and lie
    // in it. This is the stale/corrupted-column scenario the design has to survive, staged by
    // hand because no ordinary path can produce it.
    await db.query(
      `alter table public.event_identity_revisions alter column is_provisional drop expression`,
    );
    await db.query(
      `alter table public.event_identity_revisions disable trigger event_identity_revisions_protect`,
    );
    await db.query(
      `update public.event_identity_revisions set is_provisional = false where id = $1`,
      [id],
    );
    expect(
      (
        await db.query(`select is_provisional from public.event_identity_revisions where id = $1`, [
          id,
        ])
      ).rows[0].is_provisional,
    ).toBe(false);
    try {
      // The decision does not read that column, so the lie buys nothing.
      expect(
        await errorCode(
          db.query(
            `update public.events set authoritative_identity_revision_id = $1 where id = $2`,
            [id, eventId],
          ),
        ),
      ).toBe("23514");
    } finally {
      // `ALTER COLUMN … SET EXPRESSION` would be the direct form but is PostgreSQL 17+; this
      // suite runs against 16 locally while supabase/config.toml pins 17, so the portable
      // drop-and-re-add is used.
      await db.query(`alter table public.event_identity_revisions drop column is_provisional`);
      await db.query(
        `alter table public.event_identity_revisions add column is_provisional boolean
           generated always as (public.identity_is_provisional(result, schema_version)) stored`,
      );
      await db.query(
        `alter table public.event_identity_revisions enable trigger event_identity_revisions_protect`,
      );
    }
    // Restored in the `finally` below, so a failure in the assertion cannot leave every later
    // test in this file running against a non-generated column.
  });

  it("refuses a pointer into another event's revision", async () => {
    const id = await insertRevision(otherEventId, 1, []);
    expect(
      await errorCode(
        db.query(`update public.events set authoritative_identity_revision_id = $1 where id = $2`, [
          id,
          eventId,
        ]),
      ),
    ).toBe("23514");
  });

  it("is a server-managed column a member cannot move", async () => {
    const first = await insertRevision(eventId, 1, []);
    const second = await insertRevision(eventId, 2, []);
    await db.query(
      `update public.events set authoritative_identity_revision_id = $1 where id = $2`,
      [second, eventId],
    );
    for (const actor of [owner, cohost]) {
      const code = await asActor(db, { kind: "user", id: actor }, (q) =>
        errorCode(
          q(`update public.events set authoritative_identity_revision_id = $1 where id = $2`, [
            first,
            eventId,
          ]),
        ),
      );
      expect(code).toBe("42501");
    }
  });
});

/* ------------------------------------------------------------------ append-only revisions */

describe("identity revisions are append-only and ordered", () => {
  it("requires the next revision number", async () => {
    await insertRevision(eventId, 1, []);
    expect(await errorCode(insertRevision(eventId, 3, []))).toBe("23514");
    expect(await errorCode(insertRevision(eventId, 1, []))).toBe("23514");
  });

  it("refuses update and delete", async () => {
    const id = await insertRevision(eventId, 1, []);
    expect(
      await errorCode(
        db.query(`update public.event_identity_revisions set prompt_version = 'x' where id = $1`, [
          id,
        ]),
      ),
    ).toBe("42501");
    expect(
      await errorCode(db.query(`delete from public.event_identity_revisions where id = $1`, [id])),
    ).toBe("42501");
  });

  it("lets a member read but never write", async () => {
    await insertRevision(eventId, 1, []);
    const seen = await asActor(db, { kind: "user", id: cohost }, async (q) =>
      Number((await q(`select count(*) from public.event_identity_revisions`)).rows[0].count),
    );
    expect(seen).toBe(1);
    const hidden = await asActor(db, { kind: "user", id: stranger }, async (q) =>
      Number((await q(`select count(*) from public.event_identity_revisions`)).rows[0].count),
    );
    expect(hidden).toBe(0);
    const code = await asActor(db, { kind: "user", id: owner }, (q) =>
      errorCode(
        q(
          `insert into public.event_identity_revisions
             (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
              provider, model)
           values ($1, 2, $2, 'p', $3, 'a', 'openai', 'm')`,
          [eventId, JSON.stringify(envelope([])), V5],
        ),
      ),
    );
    expect(code).toBe("42501");
  });
});

/* ------------------------------------------------------------------ answer binding */

describe("a clarification answer proves which question it answers", () => {
  let revisionId: string;
  const question = creativeQuestion();

  beforeEach(async () => {
    revisionId = await insertRevision(eventId, 1, [question]);
  });

  it("accepts a well-formed answer", async () => {
    const { rows } = await answer(revisionId, 0, question);
    expect(rows[0].id).toBeTruthy();
  });

  it("refuses an answer filed against another event", async () => {
    expect(await errorCode(answer(revisionId, 0, question, { eventId: otherEventId }))).toBe(
      "23514",
    );
  });

  it("refuses an index with no question", async () => {
    expect(await errorCode(answer(revisionId, 1, question))).toBe("23514");
  });

  it("refuses a mismatched kind", async () => {
    expect(await errorCode(answer(revisionId, 0, question, { kind: "boundary" }))).toBe("23514");
  });

  it("refuses a drifted question copy", async () => {
    expect(
      await errorCode(
        answer(revisionId, 0, question, { questionText: "Something else entirely?" }),
      ),
    ).toBe("23514");
  });

  it("refuses drifted options", async () => {
    expect(
      await errorCode(
        answer(revisionId, 0, question, { options: [{ label: "Only one", isDefer: false }] }),
      ),
    ).toBe("23514");
  });

  it("refuses a duplicate answer to the same question", async () => {
    await answer(revisionId, 0, question);
    expect(await errorCode(answer(revisionId, 0, question))).toBe("23505");
  });

  it("refuses a round that disagrees with the revision", async () => {
    expect(await errorCode(answer(revisionId, 0, question, { round: 2 }))).toBe("23514");
  });

  it("refuses an answer that says nothing", async () => {
    expect(
      await errorCode(answer(revisionId, 0, question, { selected: null, freeText: "   " })),
    ).toBe("23514");
  });

  it("refuses update and delete", async () => {
    const { rows } = await answer(revisionId, 0, question);
    expect(
      await errorCode(
        db.query(`update public.clarification_answers set free_text = 'x' where id = $1`, [
          rows[0].id,
        ]),
      ),
    ).toBe("42501");
    expect(
      await errorCode(
        db.query(`delete from public.clarification_answers where id = $1`, [rows[0].id]),
      ),
    ).toBe("42501");
  });
});

describe("defer semantics follow the route", () => {
  it("accepts a creative defer that names the question's own defer option", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    const { rows } = await answer(revisionId, 0, question, {
      selected: "You decide",
      isDefer: true,
    });
    expect(rows[0].id).toBeTruthy();
  });

  it("refuses a defer that names a non-defer option", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    expect(
      await errorCode(answer(revisionId, 0, question, { selected: "Cooler", isDefer: true })),
    ).toBe("23514");
  });

  it("refuses selecting the defer option without recording it as one", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    expect(
      await errorCode(answer(revisionId, 0, question, { selected: "You decide", isDefer: false })),
    ).toBe("23514");
  });

  it("refuses a deferred boundary answer, because Route B offers no defer", async () => {
    const question = boundaryQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    expect(
      await errorCode(answer(revisionId, 0, question, { selected: "Leave it out", isDefer: true })),
    ).toBe("23514");
  });
});

describe("an answer is attributable to someone who can speak for the event", () => {
  let revisionId: string;
  const question = creativeQuestion();

  beforeEach(async () => {
    revisionId = await insertRevision(eventId, 1, [question]);
  });

  it("refuses a non-member as answered_by, even for service role", async () => {
    expect(await errorCode(answer(revisionId, 0, question, { answeredBy: stranger }))).toBe(
      "23514",
    );
  });

  it("lets a co-host answer as themselves", async () => {
    const code = await asActor(db, { kind: "user", id: cohost }, (q) =>
      errorCode(
        q(
          `insert into public.clarification_answers
             (event_id, identity_revision_id, question_index, round, kind, question_text, options,
              selected_option_label, is_defer, answered_by)
           values ($1, $2, 0, 1, 'creative', $3, $4, 'Warmer', false, $5)`,
          [eventId, revisionId, question.question, JSON.stringify(question.options), cohost],
        ),
      ),
    );
    expect(code).toBeNull();
  });

  it("refuses a co-host attributing an answer to the owner", async () => {
    const code = await asActor(db, { kind: "user", id: cohost }, (q) =>
      errorCode(
        q(
          `insert into public.clarification_answers
             (event_id, identity_revision_id, question_index, round, kind, question_text, options,
              selected_option_label, is_defer, answered_by)
           values ($1, $2, 0, 1, 'creative', $3, $4, 'Warmer', false, $5)`,
          [eventId, revisionId, question.question, JSON.stringify(question.options), owner],
        ),
      ),
    );
    // RLS refuses first; either way the write never lands.
    expect(["42501", "23514"]).toContain(code);
  });

  it("refuses a stranger entirely", async () => {
    const code = await asActor(db, { kind: "user", id: stranger }, (q) =>
      errorCode(
        q(
          `insert into public.clarification_answers
             (event_id, identity_revision_id, question_index, round, kind, question_text, options,
              selected_option_label, is_defer, answered_by)
           values ($1, $2, 0, 1, 'creative', $3, $4, 'Warmer', false, $5)`,
          [eventId, revisionId, question.question, JSON.stringify(question.options), stranger],
        ),
      ),
    );
    // Either refusal is correct and both are fail-closed. RLS hides the revision from a
    // non-member, so the binding trigger reports it as absent (23503) before the policy on the
    // insert itself is reached (42501). What matters is that no path accepts the write — and
    // note the direction: RLS can only hide rows from these checks, and every check refuses on
    // absence, so a narrowed view can never turn a refusal into an acceptance.
    expect(["42501", "23503"]).toContain(code);
  });
});

describe("a revision records the answers it was actually built from", () => {
  it("accepts ids that exist and belong to the event", async () => {
    const question = creativeQuestion();
    const first = await insertRevision(eventId, 1, [question]);
    const { rows } = await answer(first, 0, question);
    const second = await insertRevision(eventId, 2, [], { answerIds: [rows[0].id] });
    const { rows: stored } = await db.query(
      `select clarification_answer_ids from public.event_identity_revisions where id = $1`,
      [second],
    );
    expect(stored[0].clarification_answer_ids).toEqual([rows[0].id]);
  });

  it("refuses an id that does not exist", async () => {
    expect(
      await errorCode(
        insertRevision(eventId, 1, [], {
          answerIds: ["00000000-0000-0000-0000-000000000000"],
        }),
      ),
    ).toBe("23503");
  });

  it("refuses a duplicate id", async () => {
    const question = creativeQuestion();
    const first = await insertRevision(eventId, 1, [question]);
    const { rows } = await answer(first, 0, question);
    expect(
      await errorCode(insertRevision(eventId, 2, [], { answerIds: [rows[0].id, rows[0].id] })),
    ).toBe("23514");
  });
});

describe("append-only does not mean the event can never be deleted", () => {
  // An unconditional DELETE refusal fires inside the `on delete cascade` from `events` and aborts
  // it, so an event with one revision could never be deleted — by its owner, whom spec.md grants
  // exactly that capability, or by any account-erasure path. The refusal is carved out for the
  // cascade only, in the shape `protect_owner_membership` already uses.
  it("lets the owner delete an event that has revisions and answers", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    await answer(revisionId, 0, question);
    await db.query(
      `update public.events set authoritative_identity_revision_id = null where id = $1`,
      [eventId],
    );

    const code = await asActor(
      db,
      { kind: "user", id: owner },
      (q) => errorCode(q(`delete from public.events where id = $1`, [eventId])),
      { commit: true },
    );
    expect(code).toBeNull();

    const { rows } = await db.query(
      `select
         (select count(*) from public.events where id = $1) as events,
         (select count(*) from public.event_identity_revisions where event_id = $1) as revisions,
         (select count(*) from public.clarification_answers where event_id = $1) as answers`,
      [eventId],
    );
    expect(rows[0]).toEqual({ events: "0", revisions: "0", answers: "0" });
  });

  it("lets a generation run be pruned while the event lives, without rewriting the revision", async () => {
    // `on delete set null` here would make the database UPDATE an immutable row, which the protect
    // trigger refuses — so pruning telemetry used to fail with "identity revisions are immutable".
    // The column is now a plain uuid: the run can go, and the revision keeps saying which run
    // produced it, which is what an evidence row should do.
    const { rows: run } = await db.query(
      `insert into public.generation_runs
         (event_id, provider, operation, model, latency_ms, success, prompt_version, schema_version)
       values ($1, 'openai', 'event_identity', 'gpt-5.6-sol', 1, true, 'p', $2) returning id`,
      [eventId, V5],
    );
    // Linked at insert: the revision is immutable, so there is no later moment to attach it.
    const { rows: linked } = await db.query(
      `insert into public.event_identity_revisions
         (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
          provider, model, generation_run_id)
       values ($1, 1, $2, 'event_identity_v5', $3, 'event_identity_input_v1', 'openai',
               'gpt-5.6-sol', $4)
       returning id, generation_run_id`,
      [eventId, JSON.stringify(envelope([])), V5, run[0].id],
    );
    expect(linked[0].generation_run_id).toBe(run[0].id);

    expect(
      await errorCode(db.query(`delete from public.generation_runs where id = $1`, [run[0].id])),
    ).toBeNull();
    const { rows: after } = await db.query(
      `select generation_run_id from public.event_identity_revisions where id = $1`,
      [linked[0].id],
    );
    expect(after[0].generation_run_id).toBe(run[0].id);
  });

  it("lets the owner delete an event whose revision names a generation run", async () => {
    const { rows: run } = await db.query(
      `insert into public.generation_runs
         (event_id, provider, operation, model, latency_ms, success, prompt_version, schema_version)
       values ($1, 'openai', 'event_identity', 'gpt-5.6-sol', 1, true, 'p', $2) returning id`,
      [eventId, V5],
    );
    await db.query(
      `insert into public.event_identity_revisions
         (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
          provider, model, generation_run_id)
       values ($1, 1, $2, 'p', $3, 'a', 'openai', 'm', $4)`,
      [eventId, JSON.stringify(envelope([])), V5, run[0].id],
    );
    const code = await asActor(
      db,
      { kind: "user", id: owner },
      (q) => errorCode(q(`delete from public.events where id = $1`, [eventId])),
      { commit: true },
    );
    expect(code).toBeNull();
    const { rows } = await db.query(`select count(*) as n from public.events where id = $1`, [
      eventId,
    ]);
    expect(rows[0].n).toBe("0");
  });

  it("still refuses a direct delete while the event exists", async () => {
    const id = await insertRevision(eventId, 1, []);
    expect(
      await errorCode(db.query(`delete from public.event_identity_revisions where id = $1`, [id])),
    ).toBe("42501");
  });
});

describe("an answer can only select an option the question offered", () => {
  it("refuses a label that was never on the question", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    // Bound to a real question, with a byte-exact copy of it — and still refused, because T9's
    // assembly would otherwise send this to the model as host input with stated precedence.
    expect(
      await errorCode(answer(revisionId, 0, question, { selected: "Something nobody offered" })),
    ).toBe("23514");
  });

  it("still accepts free text with no option selected", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    const { rows } = await answer(revisionId, 0, question, {
      selected: null,
      freeText: "Somewhere between the two, closer to the first",
    });
    expect(rows[0].id).toBeTruthy();
  });
});

describe("anon reaches neither table", () => {
  it.each([
    ["event_identity_revisions", "select * from public.event_identity_revisions"],
    ["clarification_answers", "select * from public.clarification_answers"],
  ])("cannot read %s", async (_label, sql) => {
    // A hard permission denial, not an empty result. `revoke all` leaves anon without the table
    // privilege at all, so the refusal does not depend on RLS having a policy that excludes it —
    // which is the whole point of following the phase-1 grant pattern rather than the narrower
    // `revoke insert, update, delete`.
    const code = await asActor(db, { kind: "anon" }, (q) => errorCode(q(sql)));
    expect(code).toBe("42501");
  });

  it("cannot insert an answer", async () => {
    const question = creativeQuestion();
    const revisionId = await insertRevision(eventId, 1, [question]);
    const code = await asActor(db, { kind: "anon" }, (q) =>
      errorCode(
        q(
          `insert into public.clarification_answers
             (event_id, identity_revision_id, question_index, round, kind, question_text, options,
              selected_option_label, is_defer, answered_by)
           values ($1, $2, 0, 1, 'creative', $3, $4, 'Warmer', false, $5)`,
          [eventId, revisionId, question.question, JSON.stringify(question.options), owner],
        ),
      ),
    );
    expect(code).toBe("42501");
  });
});

describe("the SQL and TypeScript supported-version lists are the same list", () => {
  it("pairs the migration's literal with the module's constant", async () => {
    // Reads the migration, rather than comparing the module's constant to this file's own copy of
    // the same string — which would have passed while SQL accepted some third version.
    const migration = readFileSync(
      path.join(ROOT, "supabase/migrations/20260915000000_phase4b_identity_revisions.sql"),
      "utf8",
    );
    const literals = [...migration.matchAll(/'(event_identity_schema_v\d+)'/g)].map((m) => m[1]);
    expect([...new Set(literals)]).toEqual([...SUPPORTED_IDENTITY_SCHEMA_VERSIONS]);
    const { rows } = await db.query(`select public.identity_is_provisional($1::jsonb, $2) as v`, [
      JSON.stringify(envelope([])),
      V5,
    ]);
    expect(rows[0].v).toBe(false);
  });
});

describe("telemetry carries the same attribution as the artifact", () => {
  it("records the input assembly version on a generation run", async () => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'generation_runs'
         and column_name = 'input_assembly_version'`,
    );
    expect(rows).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ the prompt */

describe("events.prompt is immutable after insert", () => {
  it("refuses a service-role update", async () => {
    expect(
      await errorCode(
        db.query(`update public.events set prompt = 'rewritten' where id = $1`, [eventId]),
      ),
    ).toBe("42501");
  });

  it("refuses an end-user update", async () => {
    const code = await asActor(db, { kind: "user", id: owner }, (q) =>
      errorCode(q(`update public.events set prompt = 'rewritten' where id = $1`, [eventId])),
    );
    expect(code).toBe("42501");
  });

  it("still allows unrelated columns to change", async () => {
    await db.query(`update public.events set timezone = 'America/New_York' where id = $1`, [
      eventId,
    ]);
    const { rows } = await db.query(`select prompt, timezone from public.events where id = $1`, [
      eventId,
    ]);
    expect(rows[0].prompt).toBe("A spring garden baby shower");
    expect(rows[0].timezone).toBe("America/New_York");
  });
});

/* ------------------------------------------------------------------ TS/SQL parity */

describe("the TypeScript and SQL implementations of the rule agree", () => {
  const journals = [
    "creative-understanding-v1-regression",
    "creative-understanding-sealed-challenge-v1-v5-regression",
    "creative-understanding-holdout-v1",
    "creative-understanding-sealed-challenge-v2",
  ];

  const entries = journals.flatMap((dir) =>
    readFileSync(path.join(ROOT, "docs/model-evals/results", dir, "raw-responses.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map(
        (line) =>
          JSON.parse(line) as {
            caseId: string;
            payload: { output: unknown; telemetry: { schemaVersion: string } };
          },
      ),
  );

  it("agrees on all 50 real v5 responses", async () => {
    expect(entries).toHaveLength(50);
    const disagreements: string[] = [];
    for (const entry of entries) {
      const version = entry.payload.telemetry.schemaVersion;
      const ts = isProvisional(entry.payload.output, version);
      const { rows } = await db.query(
        `select public.identity_is_provisional($1::jsonb, $2) as sql`,
        [JSON.stringify(entry.payload.output), version],
      );
      if (ts !== rows[0].sql) {
        disagreements.push(`${entry.caseId}: ts=${ts} sql=${rows[0].sql}`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("agrees on the constructed shapes too, refusals included", async () => {
    const cases: { label: string; result: unknown; version: string }[] = [
      { label: "zero questions", result: envelope([]), version: V5 },
      { label: "one creative", result: envelope([creativeQuestion()]), version: V5 },
      { label: "one boundary", result: envelope([boundaryQuestion()]), version: V5 },
      { label: "bad version", result: envelope([]), version: "event_identity_schema_v6" },
      { label: "malformed", result: { clarification: {} }, version: V5 },
      { label: "legacy brief", result: { copyTone: "warm" }, version: V5 },
    ];
    for (const { label, result, version } of cases) {
      let ts: boolean | "refused";
      try {
        ts = isProvisional(result, version);
      } catch {
        ts = "refused";
      }
      let sql: boolean | "refused";
      try {
        const { rows } = await db.query(
          `select public.identity_is_provisional($1::jsonb, $2) as v`,
          [JSON.stringify(result), version],
        );
        sql = rows[0].v as boolean;
      } catch {
        sql = "refused";
      }
      expect({ label, ts }).toEqual({ label, ts: sql });
    }
  });
});
