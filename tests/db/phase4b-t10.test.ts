import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

import { connect, createAuthUser, resetDatabase } from "./harness";
import { supabaseShim } from "./supabase-shim";
import { AUTHORITATIVE, boundaryResult, creativeResult } from "./phase4b-t10-fixtures";

/**
 * Phase 4B T10 — the EventIdentity orchestrator, against a real database.
 *
 * `docs/phase-4b-plan.md §A.6` is the order under test and `§A.5` is the safety argument. The
 * provider is mocked; **no model call is made here, or anywhere in this phase.**
 *
 * These run against Postgres rather than a stubbed client because every property that matters is
 * transactional: a conditional state transition, a claim insert inside the cap transaction, two
 * completers racing on one row lock. A fake query builder would agree with whatever the code did.
 *
 * The properties, in the order they cost money when they are wrong:
 *
 *   * one paid call per logical request, however many requests arrive;
 *   * a captured paid response becomes its revision with **no** second model call, on the request
 *     path, without the daily housekeeping job running at all;
 *   * a driver that lost its claim can no longer reach the provider;
 *   * every refusal happens before the provider is reached and consumes nothing;
 *   * nothing internal — no claim id, no attempt key, no counter, no SQLSTATE — reaches a caller.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation`; `§31 — Creation Mode`;
 * `§7.6b`, `§7.7`, `§10`, `§6`; guardrails `§32 #4`, `#41`.
 */
const generate = vi.fn();

vi.mock("@/lib/ai/openai/event-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/openai/event-identity")>();
  return { ...actual, generateEventIdentity: (input: unknown) => generate(input) };
});

/**
 * Item 29, as a guard rather than an assertion: if the orchestrator ever reaches for the daily
 * backstop to make active recovery work, every test in this file fails.
 */
vi.mock("@/lib/generation/identity-claim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation/identity-claim")>();
  return {
    ...actual,
    sweepIdentityCallClaims: () => {
      throw new Error("the once-daily backstop must never be on an active host's path");
    },
  };
});

const {
  EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} = await import("@/lib/ai/versions");
const { EventIdentityError, eventIdentityModelConfig } =
  await import("@/lib/ai/openai/event-identity");
const { resetEnvCache } = await import("@/lib/env");
const { basisDigest } = await import("@/lib/generation/identity-key");
const { expireIdentityCallClaims, markIdentityCallInvoked, reclaimUninvokedIdentityClaims } =
  await import("@/lib/generation/identity-claim");
const { IDENTITY_REFUSAL_PAYLOAD } = await import("@/lib/generation/identity-spend");
const { eventIdentityState, runEventIdentity, IDENTITY_USER_DEADLINE_MS } =
  await import("@/lib/generation/identity-orchestrator");

type Admin = Parameters<typeof runEventIdentity>[0];

const MODEL = "gpt-5.6-sol";
const PROMPT = "a spring garden baby shower for my sister";

let db: Client;
let admin: Admin;
let owner: string;
let eventId: string;

/** The exact digest the orchestrator derives, recomputed rather than read back out of a claim. */
const digestFor = (answerIds: string[] = [], prompt = PROMPT) =>
  basisDigest({
    prompt,
    clarificationAnswerIds: answerIds,
    promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
    schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
    inputAssemblyVersion: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
    modelConfig: eventIdentityModelConfig(MODEL, "high"),
  });

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const run = (options: { explicitRetry?: boolean } = {}, client: Admin = admin) =>
  runEventIdentity(client, { eventId, userId: owner, ...options });

const revisions = async () =>
  (
    await db.query(
      `select id, revision, is_provisional, result, generation_run_id, clarification_answer_ids,
              created_at
         from public.event_identity_revisions where event_id=$1 order by revision`,
      [eventId],
    )
  ).rows;

const pointer = async () =>
  (
    await db.query(`select authoritative_identity_revision_id from public.events where id=$1`, [
      eventId,
    ])
  ).rows[0].authoritative_identity_revision_id as string | null;

const claims = async () =>
  (
    await db.query(
      `select id, state, attempt_ordinal, basis_digest, provider_invoked_at, lease_expires_at
         from public.event_identity_call_claims where event_id=$1
        order by claimed_at, attempt_ordinal`,
      [eventId],
    )
  ).rows;

const runs = async () =>
  (
    await db.query(
      `select success, error_code, cost_estimate_usd, provider_response_evidence, input_tokens,
              reasoning_tokens, schema_valid_first_call, idempotency_key
         from public.generation_runs where event_id=$1 order by created_at`,
      [eventId],
    )
  ).rows;

/** Answers the question the given revision asked, exactly as the binding trigger requires. */
async function answerQuestion(
  revisionId: string,
  round: number,
  patch: { selected?: string | null; freeText?: string | null; defer?: boolean } = {},
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
     values ($1,$2,0,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) returning id`,
    [
      eventId,
      revisionId,
      round,
      question.kind,
      question.question,
      JSON.stringify(question.options),
      patch.selected ?? null,
      patch.freeText ?? null,
      patch.defer ?? false,
      owner,
    ],
  );
  return inserted.rows[0].id as string;
}

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
  // `hashRateLimitKey` HMACs over the server environment, so the whole server schema has to parse.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  resetEnvCache();
  delete process.env.IDENTITY_CEILING_USD;
  delete process.env.IDENTITY_EVENT_DAILY_MAX;
  delete process.env.IDENTITY_ACCOUNT_DAILY_MAX;
  delete process.env.IDENTITY_ACCOUNT_RATE_MAX;
});

afterEach(() => {
  delete process.env.IDENTITY_CEILING_USD;
  delete process.env.IDENTITY_EVENT_DAILY_MAX;
  delete process.env.IDENTITY_ACCOUNT_DAILY_MAX;
  delete process.env.IDENTITY_ACCOUNT_RATE_MAX;
});

/* ------------------------------------------------------------------ 1, 2, 22, 24, 25 */

describe("one call, persisted", () => {
  it("produces an authoritative revision and moves the pointer in the same transaction", async () => {
    answers(AUTHORITATIVE);
    const result = await run();

    expect(result.state).toBe("ready");
    expect(result.hasAuthoritativeIdentity).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);

    const [revision] = await revisions();
    expect(revision.revision).toBe(1);
    expect(revision.is_provisional).toBe(false);
    // The pointer is not a later write that could be lost: `complete_identity_call` does both in
    // one transaction, so a revision with no pointer behind it is not a reachable state.
    expect(await pointer()).toBe(revision.id);
    expect(result.identityRevisionId).toBe(revision.id);

    const [claim] = await claims();
    expect(claim.state).toBe("succeeded");
    expect(claim.provider_invoked_at).not.toBeNull();

    const [row] = await runs();
    expect(row.success).toBe(true);
    // The attempt key is stamped into the already-unique idempotency column, so a retried capture
    // cannot write a second run row and double-count the spend the ceiling reads back.
    expect(row.idempotency_key).toHaveLength(64);
    expect(row.provider_response_evidence).toEqual([JSON.stringify(AUTHORITATIVE)]);
    expect(revision.generation_run_id).not.toBeNull();
  });

  it("keeps a boundary-bearing revision out of the authoritative pointer", async () => {
    answers(boundaryResult("Has she agreed to a surprise?"));
    const result = await run();

    expect(result.state).toBe("clarification_required");
    expect(result.hasAuthoritativeIdentity).toBe(false);
    expect(result.questions).toHaveLength(1);
    expect(result.questions?.[0].question).toBe("Has she agreed to a surprise?");

    const [revision] = await revisions();
    expect(revision.is_provisional).toBe(true);
    expect(await pointer()).toBeNull();
  });
});

/* ------------------------------------------------------------------ 3, 4, 5, 26 */

describe("clarification rounds", () => {
  it("reruns with a selected answer, and the answer is part of the call's identity", async () => {
    answers(boundaryResult("Has she agreed?"));
    await run();
    const [first] = await revisions();
    const answerId = await answerQuestion(first.id, 1, { selected: "Yes" });

    answers(AUTHORITATIVE);
    const result = await run();

    expect(result.state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(2);
    const input = generate.mock.calls[1][0] as {
      clarification?: { answers: { selectedOptionLabel: string | null }[] };
    };
    expect(input.clarification?.answers).toEqual([
      { revision: 1, questionIndex: 0, selectedOptionLabel: "Yes", freeText: null, isDefer: false },
    ]);

    const all = await revisions();
    expect(all).toHaveLength(2);
    expect(all[1].clarification_answer_ids).toEqual([answerId]);
    // A different answer set is a different basis, which is what makes the second call legitimate
    // rather than a double payment.
    const rows = await claims();
    expect(rows.map((r) => r.basis_digest)).toEqual([digestFor(), digestFor([answerId])]);
  });

  it("reruns with free text, unaltered", async () => {
    answers(boundaryResult("What should we avoid?"));
    await run();
    const [first] = await revisions();
    await answerQuestion(first.id, 1, { freeText: "  no pink, please  " });

    answers(AUTHORITATIVE);
    await run();

    const input = generate.mock.calls[1][0] as {
      clarification?: { answers: { freeText: string | null }[] };
    };
    expect(input.clarification?.answers[0].freeText).toBe("  no pink, please  ");
  });

  it("carries every round, oldest first, with no lifetime cap", async () => {
    answers(boundaryResult("Round one?"));
    await run();
    const round1 = (await revisions())[0];
    await answerQuestion(round1.id, 1, { selected: "Yes" });

    answers(boundaryResult("Round two?"));
    await run();
    const round2 = (await revisions())[1];
    await answerQuestion(round2.id, 2, { selected: "No" });

    answers(boundaryResult("Round three?"));
    await run();
    const round3 = (await revisions())[2];
    await answerQuestion(round3.id, 3, { freeText: "the third" });

    answers(AUTHORITATIVE);
    const result = await run();

    expect(result.state).toBe("ready");
    expect(await revisions()).toHaveLength(4);
    const input = generate.mock.calls[3][0] as {
      clarification?: { answers: { revision: number }[]; priorRevisions: { revision: number }[] };
    };
    expect(input.clarification?.answers.map((a) => a.revision)).toEqual([1, 2, 3]);
    expect(input.clarification?.priorRevisions.map((r) => r.revision)).toEqual([1, 2, 3]);
  });

  it("leaves the earlier authoritative revision untouched when a late Route A answer arrives", async () => {
    // Route A never gates: this revision is authoritative *and* asks a creative question.
    answers(creativeResult("Warmer or cooler?"));
    const first = await run();
    expect(first.state).toBe("ready");
    const before = (await revisions())[0];
    const promptBefore = (await db.query(`select prompt from public.events where id=$1`, [eventId]))
      .rows[0].prompt;

    const answerId = await answerQuestion(before.id, 1, { selected: "Warmer" });
    answers(AUTHORITATIVE);
    await run();

    const after = await revisions();
    expect(after).toHaveLength(2);
    // Appended, never applied in place: the revision that asked is byte-identical afterwards.
    expect(after[0]).toEqual(before);
    expect(
      (await db.query(`select prompt from public.events where id=$1`, [eventId])).rows[0].prompt,
    ).toBe(promptBefore);
    // Still bound to the revision that asked it, not rebased onto the newly produced one.
    const bound = await db.query(
      `select identity_revision_id, round from public.clarification_answers where id=$1`,
      [answerId],
    );
    expect(bound.rows[0].identity_revision_id).toBe(before.id);
    expect(bound.rows[0].round).toBe(1);
    // "No second downstream generation is started" is `n/a` at T10 and owned by T16: the planner
    // and the batches table do not exist yet, so there is nothing to observe. Recorded, not passed.
  });
});

/* ------------------------------------------------------------------ 6, 7, 8, 27 */

describe("concurrent and repeated requests", () => {
  it("answers a duplicate POST from the claim rather than a second call", async () => {
    const gate = deferred<ReturnType<typeof callResult>>();
    generate.mockReturnValue(gate.promise);
    const first = run();
    // Let the first request reach the provider before the duplicate arrives.
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    const duplicate = await run();
    expect(duplicate.state).toBe("running");
    expect(duplicate.hasAuthoritativeIdentity).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);

    gate.resolve(callResult(AUTHORITATIVE));
    expect((await first).state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await revisions()).toHaveLength(1);
  });

  it("answers a refresh during provider work without spending", async () => {
    const gate = deferred<ReturnType<typeof callResult>>();
    generate.mockReturnValue(gate.promise);
    const first = run();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 5; i += 1) {
      expect((await eventIdentityState(admin, eventId)).state).toBe("running");
    }
    expect(generate).toHaveBeenCalledTimes(1);

    gate.resolve(callResult(AUTHORITATIVE));
    await first;
    // Polling after the fact is equally free, and idempotent.
    expect((await eventIdentityState(admin, eventId)).state).toBe("ready");
    expect((await eventIdentityState(admin, eventId)).state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("replays a completed request from what it produced", async () => {
    answers(AUTHORITATIVE);
    const first = await run();
    const replay = await run();

    expect(replay).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await revisions()).toHaveLength(1);
    expect(await claims()).toHaveLength(1);
  });

  it("gives two simultaneous first requests one paid call", async () => {
    const other = await connect();
    try {
      const gate = deferred<ReturnType<typeof callResult>>();
      generate.mockReturnValue(gate.promise);
      // A second connection, so the two admissions are genuinely concurrent rather than queued
      // behind one another on a single socket.
      const settling = Promise.allSettled([
        run(),
        runEventIdentity(supabaseShim(other), { eventId, userId: owner }),
      ]);
      await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      gate.resolve(callResult(AUTHORITATIVE));
      const [a, b] = await settling;
      expect(a.status).toBe("fulfilled");
      expect(b.status).toBe("fulfilled");
      // One of them made the call; the other observed it. Never two.
      expect(generate).toHaveBeenCalledTimes(1);
      const states = [a, b].map(
        (s) => (s as PromiseFulfilledResult<{ state: string }>).value.state,
      );
      expect(states.filter((s) => s === "running" || s === "ready")).toHaveLength(2);
      expect(await claims()).toHaveLength(1);
    } finally {
      await other.end();
    }
  });
});

/* ------------------------------------------------------------------ claim fixtures */

const CAP_KEYS = () => {
  const pad = (s: string) => Buffer.from(s.padEnd(32, "x").slice(0, 32));
  return { event: pad(`e:${eventId}`), account: pad(`a:${owner}`), rate: pad(`r:${owner}`) };
};

/**
 * A claim built through the real RPC, so the row under test is the row production writes.
 *
 * `expired` winds `lease_expires_at` back afterwards, which is how a lease that has run out is
 * arranged without waiting fifteen minutes. The RPC refuses a non-positive lease outright, and
 * rightly: a zero lease would be a live call declared lost the instant it started.
 */
async function sqlClaim(options: { digest: string; ordinal?: number; expired?: boolean }) {
  const keys = CAP_KEYS();
  const { rows } = await db.query(
    `select * from public.claim_identity_call(
       $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,86400,20,$10,86400,40,$11,60,10,86400,3000,90)`,
    [
      eventId,
      owner,
      `key-${options.digest}-${options.ordinal ?? 0}`,
      options.digest,
      options.ordinal ?? 0,
      [],
      JSON.stringify({ model: MODEL }),
      900,
      keys.event,
      keys.account,
      keys.rate,
    ],
  );
  expect(rows[0].outcome).toBe("claimed");
  const id = rows[0].claim_id as string;
  if (options.expired) {
    await db.query(
      `update public.event_identity_call_claims
          set lease_expires_at = pg_catalog.now() - interval '1 second' where id=$1`,
      [id],
    );
  }
  return id;
}

const capturedRun = (result: unknown, patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    provider: "openai",
    provider_request_id: "resp_accepted",
    model: MODEL,
    input_tokens: 4000,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 900,
    reasoning_tokens: 400,
    cost_estimate_usd: 0.5,
    latency_ms: 1234,
    prompt_version: EVENT_IDENTITY_PROMPT_VERSION,
    schema_version: EVENT_IDENTITY_SCHEMA_VERSION,
    input_assembly_version: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
    schema_valid_first_call: true,
    reprompts: { transient: 0, repair: 0 },
    provider_response_evidence: [JSON.stringify(result)],
    ...patch,
  });

/** A paid response, committed, with no revision behind it: the crash between steps 6 and 7. */
async function capturedClaim(digest: string, result: unknown = AUTHORITATIVE, ordinal = 0) {
  const id = await sqlClaim({ digest, ordinal });
  await db.query(`select public.mark_identity_call_invoked($1)`, [id]);
  await db.query(`select public.capture_identity_call_response($1,true,$2::jsonb)`, [
    id,
    capturedRun(result),
  ]);
  const state = await db.query(`select state from public.event_identity_call_claims where id=$1`, [
    id,
  ]);
  expect(state.rows[0].state).toBe("response_captured");
  return id;
}

/* ------------------------------------------------------------------ 9, 10, 11, 23, 5(B5) */

describe("request-driven recovery of a captured response", () => {
  it("completes it on the next request, with no provider call and no cron", async () => {
    const claimId = await capturedClaim(digestFor());

    const result = await run();

    expect(result.state).toBe("ready");
    expect(generate).not.toHaveBeenCalled();
    const all = await revisions();
    expect(all).toHaveLength(1);
    expect(await pointer()).toBe(all[0].id);
    expect((await claims()).find((c) => c.id === claimId)?.state).toBe("succeeded");
  });

  it("completes it on a bare status poll too", async () => {
    await capturedClaim(digestFor());

    const result = await eventIdentityState(admin, eventId);

    expect(result.state).toBe("ready");
    expect(generate).not.toHaveBeenCalled();
    expect(await revisions()).toHaveLength(1);
  });

  it("hands the recovered round back as `recovering` when it answers a different basis", async () => {
    // A deploy or a newly submitted answer changes the key. The captured response is still
    // completed — leaving it is what wedges the event — but it is not this request's answer and
    // must never be returned as one.
    await capturedClaim("a-different-basis-entirely");

    const first = await run();
    expect(first.state).toBe("recovering");
    expect(generate).not.toHaveBeenCalled();
    expect(await revisions()).toHaveLength(1);

    // The resubmit resolves it: the recovered claim is terminal and non-matching now, so control
    // falls through and the host's own round begins.
    answers(AUTHORITATIVE);
    const second = await run();
    expect(second.state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await revisions()).toHaveLength(2);
  });

  it("gives two simultaneous completers one revision", async () => {
    await capturedClaim(digestFor());
    const other = await connect();
    try {
      const [a, b] = await Promise.all([
        eventIdentityState(admin, eventId),
        eventIdentityState(supabaseShim(other), eventId),
      ]);
      // The conditional transition is the gate, and it is in the same transaction as the insert.
      expect(await revisions()).toHaveLength(1);
      expect([a.state, b.state]).toEqual(["ready", "ready"]);
      expect(generate).not.toHaveBeenCalled();
    } finally {
      await other.end();
    }
  });

  it("does not purge the evidence a non-terminal claim still needs", async () => {
    await capturedClaim(digestFor());
    const purged = await db.query(
      `select public.purge_identity_response_evidence(pg_catalog.now()) as n`,
    );
    expect(purged.rows[0].n).toBe(0);
    expect((await run()).state).toBe("ready");
    expect(generate).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ 12, 13, 14 */

describe("recovering a claim whose driver disappeared", () => {
  it("reclaims a pre-invocation claim and starts one new call", async () => {
    const stale = await sqlClaim({ digest: digestFor(), expired: true });

    answers(AUTHORITATIVE);
    const result = await run();

    expect(result.state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    const rows = await claims();
    expect(rows.find((c) => c.id === stale)?.state).toBe("abandoned");
    // A new attempt, not a resurrection of the old one.
    expect(rows).toHaveLength(2);
    expect(rows.filter((c) => c.state === "succeeded")).toHaveLength(1);
  });

  it("stops the original driver reaching the provider after the reclaim", async () => {
    const stale = await sqlClaim({ digest: digestFor(), expired: true });
    answers(AUTHORITATIVE);
    await run();

    // The atomic conditional transition, not a timing assumption: the old driver's step 5 now
    // matches no row, and `false` means "do not call the provider".
    expect(await markIdentityCallInvoked(admin, stale)).toBe(false);
  });

  it("refuses step 5 the moment the lease is gone, before anything has expired it", async () => {
    // The reservation window stops counting an expired pre-invocation claim, so "reserves nothing"
    // and "cannot spend" have to be the same condition — evaluated by the database, not by two
    // numbers happening to agree.
    const stale = await sqlClaim({ digest: "some-other-basis", expired: true });
    expect((await claims()).find((c) => c.id === stale)?.state).toBe("claimed");
    expect(await markIdentityCallInvoked(admin, stale)).toBe(false);
  });

  it("never automatically re-spends a claim that may already have been paid for", async () => {
    const ambiguous = await sqlClaim({ digest: digestFor(), expired: true });
    await db.query(
      `update public.event_identity_call_claims set provider_invoked_at = pg_catalog.now()
        where id=$1`,
      [ambiguous],
    );

    const result = await run();

    // `expired_unknown`: the response is genuinely lost and the host decides whether to buy
    // another. Nothing here decides it for them.
    expect((await claims()).find((c) => c.id === ambiguous)?.state).toBe("expired_unknown");
    expect(result.state).toBe("retry_available");
    expect(generate).not.toHaveBeenCalled();

    answers(AUTHORITATIVE);
    expect((await run({ explicitRetry: true })).state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await claims()).map((c) => c.attempt_ordinal)).toEqual([0, 1]);
  });

  it("observes a live invoked claim rather than competing with it", async () => {
    const live = await sqlClaim({ digest: digestFor() });
    await db.query(
      `update public.event_identity_call_claims set provider_invoked_at = pg_catalog.now()
        where id=$1`,
      [live],
    );

    expect((await run()).state).toBe("running");
    expect((await eventIdentityState(admin, eventId)).state).toBe("running");
    expect(generate).not.toHaveBeenCalled();
    expect(await claims()).toHaveLength(1);
  });

  it("stops promising a spinner once the product deadline has passed", async () => {
    const live = await sqlClaim({ digest: digestFor() });
    await db.query(
      `update public.event_identity_call_claims
          set provider_invoked_at = pg_catalog.now(),
              claimed_at = pg_catalog.now() - ($2 || ' milliseconds')::interval
        where id=$1`,
      [live, String(IDENTITY_USER_DEADLINE_MS + 1_000)],
    );

    // The financial lease is untouched and still has minutes to run; what changes is the sentence
    // the host is given. No call is abandoned and no second call is bought.
    expect((await eventIdentityState(admin, eventId)).state).toBe("recovering");
    expect(generate).not.toHaveBeenCalled();
    expect((await claims())[0].state).toBe("claimed");
  });
});

/* ------------------------------------------------------------------ 15, 16, B8 */

describe("failures preserve what was paid for", () => {
  it("records a provider failure, its conservative cost, and waits for the host", async () => {
    generate.mockRejectedValue(
      new EventIdentityError("OpenAI request failed: socket hang up", "provider", undefined, {
        latencyMs: 5_000,
        transientRetries: 2,
        responses: [],
        providerResponses: 0,
        providerAttempts: 3,
        unknownUsageAttempts: 3,
      }),
    );

    const result = await run();

    expect(result.state).toBe("retry_available");
    const [row] = await runs();
    expect(row.success).toBe(false);
    expect(row.error_code).toBe("provider");
    // Three attempts we cannot price, charged the per-attempt maximum each. Not zero: a timeout
    // can reach provider execution and be billed, and the ceiling has to see that.
    expect(Number(row.cost_estimate_usd)).toBe(45);
    expect((await claims())[0].state).toBe("failed_terminal");

    // Not automatic. The next paid call is a decision somebody makes.
    const again = await run();
    expect(again.state).toBe("retry_available");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps both paid responses when the repair also fails validation", async () => {
    const first = JSON.stringify({ identity: "not an envelope" });
    const second = JSON.stringify({ identity: "still not an envelope" });
    generate.mockRejectedValue(
      new EventIdentityError(
        "Event Identity output failed validation after the single repair retry.",
        "invalid_output",
        [],
        {
          latencyMs: 9_000,
          transientRetries: 0,
          repairRetries: 1,
          responses: [
            {
              inputTokens: 4_000,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 800,
              servedServiceTier: "default",
            },
            {
              inputTokens: 5_000,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 900,
              servedServiceTier: "default",
            },
          ],
          providerResponses: 2,
          providerAttempts: 2,
          unknownUsageAttempts: 0,
        },
        [first, second],
      ),
    );

    expect((await run()).state).toBe("retry_available");
    const [row] = await runs();
    expect(row.error_code).toBe("invalid_output");
    expect(row.provider_response_evidence).toEqual([first, second]);
    // Both responses priced from the verified profile, so this is an exact figure rather than the
    // per-attempt bound.
    expect(Number(row.cost_estimate_usd)).toBeGreaterThan(0);
    expect(Number(row.cost_estimate_usd)).toBeLessThan(30);
  });

  it("does not file our own bug as a weak model response, and keeps the evidence", async () => {
    const paid = JSON.stringify({ identity: "paid for, then our validator threw" });
    const bug = Object.assign(new TypeError("cannot read properties of undefined"), {
      rawResponses: [paid],
    });
    generate.mockRejectedValue(bug);

    // Raised, not folded into a retry state: a bug that reads as an ordinary failure is a bug
    // nobody fixes.
    await expect(run()).rejects.toThrow(TypeError);

    const [row] = await runs();
    expect(row.success).toBe(false);
    expect(row.error_code).toBe("internal_error");
    expect(row.provider_response_evidence).toEqual([paid]);
    // The claim is terminal, so the event is released and nothing silently buys a replacement.
    expect((await claims())[0].state).toBe("failed_terminal");
  });

  it("gives two simultaneous retry clicks one new ordinal and one call", async () => {
    generate.mockRejectedValue(new EventIdentityError("nope", "provider", undefined, {}));
    await run();
    expect(generate).toHaveBeenCalledTimes(1);

    const other = await connect();
    try {
      const gate = deferred<ReturnType<typeof callResult>>();
      generate.mockReset();
      generate.mockReturnValue(gate.promise);
      const settling = Promise.allSettled([
        run({ explicitRetry: true }),
        runEventIdentity(supabaseShim(other), {
          eventId,
          userId: owner,
          explicitRetry: true,
        }),
      ]);
      await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      gate.resolve(callResult(AUTHORITATIVE));
      const settled = await settling;
      expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
      expect(generate).toHaveBeenCalledTimes(1);
      expect((await claims()).map((c) => c.attempt_ordinal)).toEqual([0, 1]);
      expect(await revisions()).toHaveLength(1);
    } finally {
      await other.end();
    }
  });
});

/* ------------------------------------------------------------------ 17, 18, 19, 20, 21, 28 */

describe("safety limits refuse before the provider is reached", () => {
  const refusal = async () => {
    const result = await run();
    expect(result.state).toBe("temporarily_unavailable");
    // One payload for every reason. A distinguishable refusal is a counter with extra steps.
    expect(result.message).toBe(IDENTITY_REFUSAL_PAYLOAD.message);
    expect(generate).not.toHaveBeenCalled();
    return result;
  };

  it("refuses at the global ceiling, and consumes nothing doing it", async () => {
    process.env.IDENTITY_CEILING_USD = "1";
    await refusal();
    expect(await claims()).toHaveLength(0);
    // The rollback is the point: a refusal must not spend a unit of a bucket checked before it.
    const buckets = await db.query(`select count(*)::int as n from public.rate_limits`);
    expect(buckets.rows[0].n).toBe(0);
  });

  /** Reaches a second, differently-based request without paying for the first twice. */
  async function secondRound() {
    answers(boundaryResult("Is the date fixed?"));
    await run();
    const [first] = await revisions();
    await answerQuestion(first.id, 1, { selected: "Yes" });
    generate.mockReset();
  }

  it("refuses at the per-event daily cap", async () => {
    process.env.IDENTITY_EVENT_DAILY_MAX = "1";
    await secondRound();
    await refusal();
  });

  it("refuses at the per-account daily cap", async () => {
    process.env.IDENTITY_ACCOUNT_DAILY_MAX = "1";
    await secondRound();
    await refusal();
  });

  it("refuses at the short-window rate limit", async () => {
    process.env.IDENTITY_ACCOUNT_RATE_MAX = "1";
    await secondRound();
    await refusal();
  });

  it("raises a configuration refusal rather than telling the host to try again shortly", async () => {
    // A ceiling that was never set, or a model with no verified profile, refuses identically for
    // ever. "Try again shortly" would be false for ever and would page nobody.
    process.env.IDENTITY_CEILING_USD = "not a number";
    await expect(run()).rejects.toThrow(/IDENTITY_CEILING_USD/);
    expect(generate).not.toHaveBeenCalled();
    expect(await claims()).toHaveLength(0);
  });
});

describe("the public contract leaks nothing internal", () => {
  const PUBLIC_KEYS = [
    "state",
    "hasAuthoritativeIdentity",
    "identityRevisionId",
    "revision",
    "questions",
    "message",
  ];

  it("carries no claim, spend, cap, ordinal, provider or SQLSTATE detail in any state", async () => {
    const seen: unknown[] = [];

    answers(boundaryResult("Is the date fixed?"));
    seen.push(await run());
    const [first] = await revisions();
    await answerQuestion(first.id, 1, { selected: "Yes" });
    answers(AUTHORITATIVE);
    seen.push(await run());
    seen.push(await eventIdentityState(admin, eventId));

    // A refusal, and a terminal failure: the two states most likely to carry a reason with them.
    // A different reasoning effort is a different model configuration and therefore a different
    // basis, which is how this reaches the ceiling instead of replaying the completed round.
    process.env.OPENAI_REASONING_EFFORT = "medium";
    resetEnvCache();
    process.env.IDENTITY_CEILING_USD = "1";
    seen.push(await run());
    delete process.env.IDENTITY_CEILING_USD;

    generate.mockReset();
    generate.mockRejectedValue(new EventIdentityError("nope", "provider", undefined, {}));
    seen.push(await run());

    expect(seen.map((r) => (r as { state: string }).state)).toEqual([
      "clarification_required",
      "ready",
      "ready",
      "temporarily_unavailable",
      "retry_available",
    ]);

    const rows = await claims();
    const forbidden = [
      ...rows.map((r) => r.id as string),
      ...rows.map((r) => r.basis_digest as string),
      "attempt_key",
      "cost",
      "usd",
      "ceiling",
      "cap_event",
      "cap_account",
      "rate_limited",
      "in_flight",
      "duplicate_key",
      "sqlstate",
      "provider_response_evidence",
      "attempt_ordinal",
    ];
    for (const result of seen) {
      expect(Object.keys(result as object).every((k) => PUBLIC_KEYS.includes(k))).toBe(true);
      const serialised = JSON.stringify(result);
      for (const needle of forbidden) {
        expect(serialised.toLowerCase()).not.toContain(needle.toLowerCase());
      }
    }
    expect(seen).toHaveLength(5);
  });
});

/* ------------------------------------------------------------------ open questions vs answered */

describe("what the host is actually waiting on", () => {
  it("stops asking once the boundary question has been answered", async () => {
    answers(boundaryResult("Has she agreed?"));
    expect((await run()).state).toBe("clarification_required");
    const [first] = await revisions();

    await answerQuestion(first.id, 1, { selected: "Yes" });

    // The envelope is still provisional — that never changes — but the event is no longer waiting
    // on the host. Re-rendering an answered question is what reading the column alone would do.
    const polled = await eventIdentityState(admin, eventId);
    expect(polled.state).toBe("retry_available");
    expect(polled.questions).toBeUndefined();
    expect(polled.hasAuthoritativeIdentity).toBe(false);
    // The poll spends nothing; the one call is the first round's.
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("carries an open Route A question without letting it gate anything", async () => {
    answers(creativeResult("Warmer or cooler?"));
    const result = await run();

    // `spec.md §7.6b #4`: Route A never gates, and the question "stays open and answerable" — so
    // it has to be visible in a state that is not `clarification_required`.
    expect(result.state).toBe("ready");
    expect(result.hasAuthoritativeIdentity).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.questions?.[0].kind).toBe("creative");
  });

  it("reports an event that has never generated as a host action, not a failure", async () => {
    const result = await eventIdentityState(admin, eventId);
    expect(result).toEqual({ state: "retry_available", hasAuthoritativeIdentity: false });
    expect(generate).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ branches the review named */

describe("the paths that only exist for things going wrong", () => {
  it("does not call the provider when the claim was reclaimed between steps 4 and 5", async () => {
    // Driven through the orchestrator rather than by calling the RPC wrapper: step 5 returning
    // `false` must stop this request, not merely report something.
    answers(AUTHORITATIVE);
    const reclaim = async () => {
      await db.query(
        `update public.event_identity_call_claims
            set state='abandoned', settled_at=pg_catalog.now()
          where event_id=$1 and state='claimed'`,
        [eventId],
      );
      return true;
    };
    // The claim exists by the time `mark_identity_call_invoked` runs, so reclaiming it inside that
    // window is what the orchestrator has to survive. The shim lets us wedge the reclaim in by
    // hooking the RPC the orchestrator is about to call.
    const hooked = {
      from: admin.from.bind(admin),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "mark_identity_call_invoked") await reclaim();
        return (admin as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc(
          name,
          args,
        );
      },
    } as unknown as Admin;

    const result = await runEventIdentity(hooked, { eventId, userId: owner });

    expect(result.state).toBe("recovering");
    expect(generate).not.toHaveBeenCalled();
    expect(await revisions()).toHaveLength(0);
  });

  it("releases an event whose captured response can never become a revision", async () => {
    // A foreign answer id: `validate_identity_revision_answers` refuses it, deterministically and
    // for ever. Without a terminal state the paid response would hold this event's only in-flight
    // slot permanently — the wedge, arriving by the recovery path instead of the crash path.
    const otherEvent = (
      await db.query(
        `insert into public.events (owner_id, prompt) values ($1,'elsewhere')
                      returning id`,
        [owner],
      )
    ).rows[0].id;
    const claimId = await capturedClaim(digestFor());
    const foreign = (
      await db.query(
        `insert into public.event_identity_revisions
           (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
            provider, model)
         values ($1,1,$2::jsonb,$3,$4,$5,'openai',$6) returning id`,
        [
          otherEvent,
          JSON.stringify(boundaryResult("elsewhere?")),
          EVENT_IDENTITY_PROMPT_VERSION,
          EVENT_IDENTITY_SCHEMA_VERSION,
          EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
          MODEL,
        ],
      )
    ).rows[0].id;
    const foreignAnswer = (
      await db.query(
        `insert into public.clarification_answers
           (event_id, identity_revision_id, question_index, round, kind, question_text, options,
            selected_option_label, answered_by)
         values ($1,$2,0,1,'boundary','elsewhere?',
                 '[{"label":"Yes","isDefer":false},{"label":"No","isDefer":false}]'::jsonb,
                 'Yes',$3)
         returning id`,
        [otherEvent, foreign, owner],
      )
    ).rows[0].id;
    await db.query(
      `update public.event_identity_call_claims set clarification_answer_ids = array[$2::uuid]
        where id=$1`,
      [claimId, foreignAnswer],
    );

    const result = await eventIdentityState(admin, eventId);

    expect((await claims()).find((c) => c.id === claimId)?.state).toBe("recovery_failed");
    expect(result.state).toBe("retry_available");
    expect(await revisions()).toHaveLength(0);
    // The evidence survives the give-up: the host paid for it.
    const [row] = await runs();
    expect(row.provider_response_evidence).not.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("agrees with itself: a failed rerun reads the same on the next poll as in its own response", async () => {
    answers(AUTHORITATIVE);
    expect((await run()).state).toBe("ready");

    // A second round on a different basis, which fails terminally. Without the resting state being
    // derived from the record, the poll a second later would answer `ready` from round one and the
    // failure would vanish from the surface within one tick.
    process.env.OPENAI_REASONING_EFFORT = "medium";
    resetEnvCache();
    generate.mockReset();
    generate.mockRejectedValue(new EventIdentityError("nope", "provider", undefined, {}));

    const posted = await run();
    const polled = await eventIdentityState(admin, eventId);

    expect(posted.state).toBe("retry_available");
    expect(polled.state).toBe("retry_available");
    expect(posted.hasAuthoritativeIdentity).toBe(true);
    expect(polled.hasAuthoritativeIdentity).toBe(true);
  });

  it("retries a capture whose first attempt was lost, and writes one run row", async () => {
    answers(AUTHORITATIVE);
    let failures = 0;
    const flaky = {
      from: admin.from.bind(admin),
      rpc: async (name: string, args: Record<string, unknown>) => {
        const result = await (
          admin as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }
        ).rpc(name, args);
        // The hard case, not the easy one: the capture **committed** and its answer was lost on
        // the way back. A retry that was not idempotent would write a second run row here and
        // double-count the spend the ceiling reads back.
        if (name === "capture_identity_call_response" && failures < 1) {
          failures += 1;
          throw new Error("connection reset after the commit");
        }
        return result;
      },
    } as unknown as Admin;

    const result = await runEventIdentity(flaky, { eventId, userId: owner });

    expect(failures).toBe(1);
    expect(result.state).toBe("ready");
    // The attempt key is unique on `generation_runs`, so the retry found its own row rather than
    // writing a second and double-counting the spend the ceiling reads back.
    expect(await runs()).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ the re-review's findings */

describe("an outstanding host decision survives what happens after it", () => {
  it("is not masked by a later retry that died before reaching the provider", async () => {
    answers(AUTHORITATIVE);
    expect((await run()).state).toBe("ready");
    const [round1] = await revisions();

    // A second round on a different basis, which fails terminally.
    process.env.OPENAI_REASONING_EFFORT = "medium";
    resetEnvCache();
    generate.mockReset();
    generate.mockRejectedValue(new EventIdentityError("nope", "provider", undefined, {}));
    expect((await run()).state).toBe("retry_available");

    // The host clicks Retry; that process dies before step 5 and its claim later expires as
    // `abandoned` — provably unpaid, and *newer* than the failure it was retrying. A rule that
    // simply took the newest settled claim would read that as "nothing outstanding" and regress
    // the surface to `ready`, leaving the host no affordance to try again.
    const retry = await sqlClaim({ digest: "the-retry-that-died", ordinal: 7, expired: true });
    await expireIdentityCallClaims(admin, { eventId });
    expect((await claims()).find((c) => c.id === retry)?.state).toBe("abandoned");

    const polled = await eventIdentityState(admin, eventId);
    expect(polled.state).toBe("retry_available");
    expect(polled.hasAuthoritativeIdentity).toBe(true);
    expect(polled.identityRevisionId).toBe(round1.id);
  });

  it("answers `recovering` when the failure itself could not be recorded", async () => {
    generate.mockRejectedValue(new EventIdentityError("nope", "provider", undefined, {}));
    const blocked = {
      from: admin.from.bind(admin),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "capture_identity_call_response") throw new Error("connection reset");
        return (admin as unknown as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc(
          name,
          args,
        );
      },
    } as unknown as Admin;

    const result = await runEventIdentity(blocked, { eventId, userId: owner });

    // The claim is still in flight as far as the database is concerned, so `retry_available` would
    // be contradicted by the very next poll.
    expect(result.state).toBe("recovering");
    expect((await claims())[0].state).toBe("claimed");
    expect((await eventIdentityState(admin, eventId)).state).toBe("running");
    expect(await runs()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ the pre-invocation reclaim */

describe("work that provably never reached the provider is not on the financial lease's clock", () => {
  /** Winds `claimed_at` back, which is what makes a claim eligible without waiting. */
  const age = (claimId: string, seconds: number) =>
    db.query(
      `update public.event_identity_call_claims
          set claimed_at = pg_catalog.now() - ($2 || ' seconds')::interval where id=$1`,
      [claimId, String(seconds)],
    );

  const stateOf = async (claimId: string) =>
    (await db.query(`select state from public.event_identity_call_claims where id=$1`, [claimId]))
      .rows[0].state as string;

  it("reclaims a pre-invocation claim after thirty seconds, not after the lease", async () => {
    const stale = await sqlClaim({ digest: digestFor() });
    await age(stale, 31);
    // The lease is untouched and still has minutes to run; that is the point.
    const lease = (await claims()).find((c) => c.id === stale)!.lease_expires_at as string;
    expect(Date.parse(lease)).toBeGreaterThan(Date.now());

    expect(await reclaimUninvokedIdentityClaims(admin, { eventId })).toBe(1);

    expect(await stateOf(stale)).toBe("abandoned");
    expect(generate).not.toHaveBeenCalled();
  });

  it("leaves a pre-invocation claim younger than the threshold alone", async () => {
    const fresh = await sqlClaim({ digest: digestFor() });
    await age(fresh, 5);

    expect(await reclaimUninvokedIdentityClaims(admin, { eventId })).toBe(0);
    expect(await stateOf(fresh)).toBe("claimed");
  });

  it("never reclaims a claim that reached the provider, however old", async () => {
    const invoked = await sqlClaim({ digest: digestFor() });
    await db.query(
      `update public.event_identity_call_claims set provider_invoked_at = pg_catalog.now()
        where id=$1`,
      [invoked],
    );
    await age(invoked, 60 * 60 * 24);

    expect(await reclaimUninvokedIdentityClaims(admin, { eventId })).toBe(0);
    expect(await stateOf(invoked)).toBe("claimed");
    // The long lease remains the right instrument for work that may have been paid for.
    expect(await expireIdentityCallClaims(admin, { eventId })).toEqual({
      abandoned: 0,
      expiredUnknown: 0,
    });
  });

  it("never treats a claim with a generation run as provably uninvoked", async () => {
    // Belt and braces beside `provider_invoked_at`: a run row for this attempt key means the
    // provider was reached whatever the claim column says, and this is the one transition that
    // re-spends without a host deciding to.
    const captured = await capturedClaim(digestFor());
    await db.query(
      `update public.event_identity_call_claims
          set state='claimed', provider_invoked_at=null, settled_at=null where id=$1`,
      [captured],
    );
    await age(captured, 60 * 60);

    expect(await reclaimUninvokedIdentityClaims(admin, { eventId })).toBe(0);
    expect(await stateOf(captured)).toBe("claimed");
  });

  it("lets the database decide the reclaim/invoke race: reclaim first", async () => {
    const claimId = await sqlClaim({ digest: digestFor() });
    await age(claimId, 31);

    expect(await reclaimUninvokedIdentityClaims(admin, { eventId })).toBe(1);
    // The original driver has permanently lost the right to call the provider.
    expect(await markIdentityCallInvoked(admin, claimId)).toBe(false);
    expect(await stateOf(claimId)).toBe("abandoned");
  });

  it("lets the database decide the reclaim/invoke race: mark-invoked first", async () => {
    const claimId = await sqlClaim({ digest: digestFor() });
    await age(claimId, 31);

    expect(await markIdentityCallInvoked(admin, claimId)).toBe(true);
    // The live call continues; the reclaim matches nothing.
    expect(await reclaimUninvokedIdentityClaims(admin, { eventId })).toBe(0);
    expect(await stateOf(claimId)).toBe("claimed");
  });

  it("settles a contested row once when two reclaimers run at the same moment", async () => {
    const other = await connect();
    try {
      const claimId = await sqlClaim({ digest: digestFor() });
      await age(claimId, 31);

      const [a, b] = await Promise.all([
        reclaimUninvokedIdentityClaims(admin, { eventId }),
        reclaimUninvokedIdentityClaims(supabaseShim(other), { eventId }),
      ]);

      expect([a, b].sort()).toEqual([0, 1]);
      expect(await stateOf(claimId)).toBe("abandoned");
    } finally {
      await other.end();
    }
  });

  it("resumes automatically, with no explicit retry and no housekeeping call", async () => {
    const stale = await sqlClaim({ digest: digestFor() });
    await age(stale, 31);
    answers(AUTHORITATIVE);

    // Ordinary resume — `explicitRetry` is not passed, because the abandoned attempt is provably
    // unpaid and re-spending after it costs the host nothing they did not already ask for.
    const result = await run();

    expect(result.state).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await stateOf(stale)).toBe("abandoned");
    const rows = await claims();
    expect(rows).toHaveLength(2);
    expect(rows.filter((c) => c.state === "succeeded")).toHaveLength(1);
  });

  it("gives two concurrent resumes after the threshold one replacement call", async () => {
    const other = await connect();
    try {
      const stale = await sqlClaim({ digest: digestFor() });
      await age(stale, 31);
      const gate = deferred<ReturnType<typeof callResult>>();
      generate.mockReturnValue(gate.promise);

      const settling = Promise.allSettled([
        run(),
        runEventIdentity(supabaseShim(other), { eventId, userId: owner }),
      ]);
      await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      gate.resolve(callResult(AUTHORITATIVE));
      const settled = await settling;

      expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(await stateOf(stale)).toBe("abandoned");
      // One replacement claim, not two.
      expect((await claims()).filter((c) => c.id !== stale)).toHaveLength(1);
      expect(await revisions()).toHaveLength(1);
    } finally {
      await other.end();
    }
  });

  it("reclaims from a bare status poll, which still never spends", async () => {
    const stale = await sqlClaim({ digest: digestFor() });
    await age(stale, 31);

    const polled = await eventIdentityState(admin, eventId);

    expect(await stateOf(stale)).toBe("abandoned");
    // Truthful persisted state afterwards: nothing in flight, nothing produced.
    expect(polled).toEqual({ state: "retry_available", hasAuthoritativeIdentity: false });
    expect(generate).not.toHaveBeenCalled();
  });
});
