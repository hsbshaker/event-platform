/**
 * The production concept batch: one understanding in, three meaningfully different choices out.
 *
 * This is the file that decides whether the T22 remediation is a product change or a capability
 * nobody calls. Before the orchestrator existed the premise stage was reachable only through the
 * eval seam, so a host generating concepts would still have received three parameterisations of one
 * idea however good the new stage was. What is checked here is therefore the **wiring**, in the
 * order it has to happen: one premise call for the batch, premise *k* into sibling *k*, the same
 * brief into all three, the set review before persistence, and lineage that names the premise a
 * concept actually came from.
 *
 * The provider is mocked; nothing else is. The database is a recording fake rather than a real
 * PostgreSQL — the transactional half of the batch lifecycle (the in-flight index, cap rollback,
 * resumption) is already proven against a real database in `tests/db/phase4c-t16.test.ts`, and the
 * new columns in `tests/db/phase4c-concept-premise.test.ts`. What a fake can prove is the sequence
 * and the payloads, which is exactly what this module owns.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` ("One premise call per batch
 * authors three concept premises as a set, and premise k binds to planned sibling k"; "All three
 * siblings inherit the same authoritative EventIdentity, byte-identical"), `§31 — DesignIntent,
 * composition and compiler` ("Each DesignIntent call receives the authoritative brief, its own
 * sibling assignment and its own concept premise"; "Duplicate or invalid concept names fall back
 * deterministically and are logged as compiler repairs"). Guardrails `spec.md §32 #12`, `#18`,
 * `#21`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";
import { resetEnvCache } from "@/lib/env";

import { PREMISE_FIXTURE_IDENTITY, validPremiseSet } from "../../../tests/fixtures/concept-premise";

const create = vi.fn();

/**
 * The server environment this path actually reads.
 *
 * `planConceptBatchForEvent` consumes the caps through `hashRateLimitKey`, which HMACs with
 * `APP_ENCRYPTION_KEY` — so the spend controls are genuinely in the path rather than stubbed out,
 * which is the point of driving the orchestrator through them instead of around them.
 */
function setEnv(): void {
  process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
  process.env.OPENAI_MODEL = "gpt-5.6-sol";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  resetEnvCache();
}

function clearEnv(): void {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.APP_ENCRYPTION_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  resetEnvCache();
}

/** The **only** thing mocked. Everything below it is the code that ships. */
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

/**
 * The persisted envelope, not just the brief.
 *
 * `assertAuthoritative` reads the whole `event_identity_revisions.result` — the brief, the supplied
 * facts and the clarification decision — because provisional-ness is a property of the envelope
 * (`spec.md §7.6b`). A fake that handed over only the brief would exercise a shape production never
 * sees, and would skip the one check that stops a provisional identity reaching generation.
 */
const AUTHORITATIVE_RESULT = {
  identity: PREMISE_FIXTURE_IDENTITY,
  suppliedFacts: {
    hostNames: null,
    honoreeName: null,
    honoreeDescriptionText: null,
    eventType: null,
    dateText: null,
    timeText: null,
    venueText: null,
    addressText: null,
    cityRegionText: null,
    guestCountText: null,
    dressCodeText: null,
    notesText: null,
  },
  clarification: { needed: false, questions: [] },
};

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const REVISION_ID = "22222222-2222-2222-2222-222222222222";
const BATCH_ID = "33333333-3333-3333-3333-333333333333";

/* ------------------------------------------------------------------ the recording fake */

type Row = Record<string, unknown>;

interface Recorded {
  /** Every `rpc(name, args)`, in order. */
  readonly rpc: { name: string; args: Record<string, unknown> }[];
  /** Every row handed to `design_intent_artifacts.insert`. */
  readonly artifacts: Row[];
  /** What `latestBatch` should answer with, so an observed batch can be exercised. */
  existingBatch: Row | null;
  authoritativeRevisionId: string | null;
}

function batchRow(overrides: Row = {}): Row {
  return {
    id: BATCH_ID,
    event_id: EVENT_ID,
    identity_revision_id: REVISION_ID,
    planner_version: "planner_v2",
    round: 1,
    status: "planned",
    idempotency_key: "k",
    created_at: "2026-09-18T00:00:00Z",
    started_at: null,
    settled_at: null,
    ...overrides,
  };
}

/**
 * A chainable, awaitable stand-in for the admin client.
 *
 * Deliberately dumb: it answers by table name and records what it was asked to write. A smarter
 * fake would start encoding the database's own rules, and those are the database's to enforce —
 * which is why the constraint behaviour is tested against a real one instead.
 */
function fakeAdmin(recorded: Recorded) {
  const builder = (table: string) => {
    const state: { rows: Row[] } = { rows: [] };
    const result = () => {
      if (table === "events") {
        return {
          data: [{ authoritative_identity_revision_id: recorded.authoritativeRevisionId }],
          error: null,
        };
      }
      if (table === "event_identity_revisions") {
        return {
          data: [
            {
              id: REVISION_ID,
              result: AUTHORITATIVE_RESULT,
              schema_version: EVENT_IDENTITY_SCHEMA_VERSION,
            },
          ],
          error: null,
        };
      }
      if (table === "generation_batches") {
        return { data: recorded.existingBatch ? [recorded.existingBatch] : [], error: null };
      }
      return { data: state.rows, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: (rows: Row[]) => {
        if (table === "design_intent_artifacts") recorded.artifacts.push(...rows);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };

  return {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      recorded.rpc.push({ name, args });
      if (name === "plan_generation_batch") {
        // The winner of the uniqueness race. `readBatch` then reads the row back, which the
        // `generation_batches` branch above answers.
        recorded.existingBatch = batchRow({ status: "running" });
        return Promise.resolve({ data: [{ outcome: "planned", batch_id: BATCH_ID }], error: null });
      }
      if (name === "record_batch_sibling_run" || name === "record_batch_call_run") {
        return Promise.resolve({
          data: [{ outcome: "recorded", run_id: "run-1" }],
          error: null,
        });
      }
      if (name === "settle_generation_batch")
        return Promise.resolve({ data: "completed", error: null });
      return Promise.resolve({ data: true, error: null });
    },
  } as never;
}

function recorder(overrides: Partial<Recorded> = {}): Recorded {
  return {
    rpc: [],
    artifacts: [],
    existingBatch: null,
    authoritativeRevisionId: REVISION_ID,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ provider responses */

/**
 * Which premise this request carries, read off the request itself.
 *
 * The mock has to answer as a competent model would — naming the concept its own premise names —
 * because otherwise every sibling returns one card and the set review repairs two of them on every
 * test. That happened on the first run of this file, which is a small piece of evidence that the
 * review works, and a bad default for the tests that are about something else.
 */
/**
 * Three genuinely different host-facing sentences, one per premise.
 *
 * The first draft of this table said "Concept 0/1/2 as its own premise asks for" and the set review
 * replaced two of the three — correctly, because `contentTokens` drops a bare digit, so the three
 * differed by nothing that carries meaning. That is the near-duplicate description case
 * `spec.md §7.8` asks to be caught, and a mock that trips it on every test would hide it.
 */
const CARD_DESCRIPTIONS = [
  "Read along a row of pulled states and notice what changed between one and the next.",
  "Turn up while a heavy machine is running, and get waved over rather than shown around.",
  "Hold one sheet close under a lamp and let the grain do most of the talking.",
] as const;

function premiseInRequest(request: ProviderRequest): { title: string; index: number } {
  const message = request.input[1].content;
  const at = validPremiseSet().premises.findIndex((premise) =>
    message.includes(premise.organizingIdea),
  );
  if (at < 0) throw new Error("no premise found in the DesignIntent request");
  return { title: validPremiseSet().premises[at].title, index: at };
}

function designIntentBody(request: ProviderRequest, overrides: Record<string, unknown> = {}) {
  const premise = premiseInRequest(request);
  return {
    palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
    density: "balanced",
    motifs: ["linen"],
    presentation: { name: premise.title, description: CARD_DESCRIPTIONS[premise.index] },
    ...overrides,
  };
}

/**
 * A DesignIntent response that satisfies whatever assignment the request narrowed to.
 *
 * Read off the request rather than hard-coded, because the three siblings are assigned three
 * different families, tones and hierarchies — a fixed body would fail assignment conformance for
 * two of the three and this file would be testing the fixture.
 */
function designIntentFor(request: ProviderRequest, overrides: Record<string, unknown> = {}) {
  const properties = (request.text.format.schema.properties ?? {}) as Record<
    string,
    { enum?: string[]; properties?: Record<string, { enum?: string[] }> }
  >;
  const only = (name: string) => properties[name]?.enum?.[0] as string;
  return {
    family: only("family"),
    tonalDirection: only("tonalDirection"),
    typographyPairing: only("typographyPairing"),
    composition: {
      asymmetry: "gentle",
      hierarchy: properties.composition?.properties?.hierarchy?.enum?.[0] as string,
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "restrained",
    },
    ...designIntentBody(request, overrides),
  };
}

function reply(body: unknown, id: string) {
  return {
    id,
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: JSON.stringify(body),
    usage: {
      input_tokens: 2_000,
      output_tokens: 600,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 400 },
    },
  };
}

type ProviderRequest = {
  text: { format: { name: string; schema: Record<string, unknown> } };
  input: { role: string; content: string }[];
};

/** Route by the structured-output schema name the two boundaries send. */
function route(
  request: ProviderRequest,
  options: {
    premise?: unknown;
    designIntent?: (request: ProviderRequest) => unknown;
  } = {},
) {
  if (request.text.format.name === "concept_premise_set") {
    return reply(options.premise ?? validPremiseSet(), "resp_premise");
  }
  const body = options.designIntent ? options.designIntent(request) : designIntentFor(request);
  return reply(body, "resp_intent");
}

/** The user message each DesignIntent call actually sent, in call order. */
function designIntentMessages(): string[] {
  return create.mock.calls
    .filter(([request]) => request.text?.format?.name === "design_intent_response")
    .map(([request]) => request.input[1].content as string);
}

const premiseCalls = () =>
  create.mock.calls.filter(([r]) => r.text?.format?.name === "concept_premise_set");

async function run(recorded: Recorded, request: { newRound?: boolean } = {}) {
  const { runConceptBatch } = await import("./concept-batch");
  return runConceptBatch(fakeAdmin(recorded), {
    eventId: EVENT_ID,
    userId: USER_ID,
    ...request,
  });
}

describe("one concept batch, end to end", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    create.mockImplementation((request: ProviderRequest) => Promise.resolve(route(request)));
    setEnv();
  });

  afterEach(clearEnv);

  it("makes one premise call and three DesignIntent calls", async () => {
    const recorded = recorder();
    const outcome = await run(recorded);
    expect(outcome.state).toBe("generated");
    expect(premiseCalls()).toHaveLength(1);
    expect(designIntentMessages()).toHaveLength(3);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("gives all three siblings the same brief and each its own premise", async () => {
    // The product requirement, as a wiring property. One understanding: the brief block is
    // byte-identical across the three. Three choices: each call carries its own premise and neither
    // of the other two.
    await run(recorder());
    const premises = validPremiseSet().premises;
    const messages = designIntentMessages();
    const brief = (text: string) =>
      text.slice(text.indexOf("<<<CREATIVE_BRIEF"), text.indexOf("CREATIVE_BRIEF\n\n"));
    expect(new Set(messages.map(brief)).size).toBe(1);

    messages.forEach((message, at) => {
      expect(message).toContain(premises[at].title);
      expect(message).toContain(premises[at].organizingIdea);
      for (const other of premises.filter((_, i) => i !== at)) {
        expect(message).not.toContain(other.organizingIdea);
      }
    });
  });

  it("runs the premise call before any DesignIntent call", async () => {
    await run(recorder());
    const names = create.mock.calls.map(([r]) => r.text.format.name);
    expect(names[0]).toBe("concept_premise_set");
    expect(names.slice(1)).toEqual([
      "design_intent_response",
      "design_intent_response",
      "design_intent_response",
    ]);
  });

  it("records the premise call at the batch level, never against a sibling", async () => {
    // The bug this test exists for: `record_batch_sibling_run` also **settles** the sibling row it
    // is given, so recording a batch-level call through it would mark a sibling succeeded before
    // its own DesignIntent call ran — and that sibling's real run would then be refused as
    // `already_succeeded` and never recorded. The ceiling reads `generation_runs` as spend, so the
    // cost of getting this wrong is unpriced money, not a reporting nit.
    const recorded = recorder();
    await run(recorded);

    const batchCalls = recorded.rpc.filter((entry) => entry.name === "record_batch_call_run");
    const siblingCalls = recorded.rpc.filter((entry) => entry.name === "record_batch_sibling_run");
    expect(batchCalls).toHaveLength(1);
    expect(siblingCalls).toHaveLength(3);

    expect(batchCalls[0].args.p_operation).toBe("concept_premise");
    expect(batchCalls[0].args.p_success).toBe(true);
    expect((batchCalls[0].args.p_run as { prompt_version: string }).prompt_version).toBe(
      "concept_premise_v1",
    );
    // No `p_concept_index` anywhere in the batch-level call: the premise belongs to all three.
    expect(batchCalls[0].args).not.toHaveProperty("p_concept_index");

    // And the three sibling rows settle from their own DesignIntent calls, one each.
    expect(siblingCalls.map((entry) => entry.args.p_concept_index).sort()).toEqual([0, 1, 2]);
    for (const entry of siblingCalls) {
      expect((entry.args.p_run as { operation: string }).operation).toBe("design_intent");
    }
  });

  it("keys the premise run so a replay collides and a retry does not", async () => {
    const { batchCallIdempotencyKey, siblingIdempotencyKey } = await import("./batch");
    const basis = { batchId: BATCH_ID, operation: "concept_premise" as const, attempt: 0 };
    expect(batchCallIdempotencyKey(basis)).toBe(batchCallIdempotencyKey({ ...basis }));
    expect(batchCallIdempotencyKey({ ...basis, attempt: 1 })).not.toBe(
      batchCallIdempotencyKey(basis),
    );
    // And it cannot be confused with a sibling's key at the same attempt.
    expect(batchCallIdempotencyKey(basis)).not.toBe(
      siblingIdempotencyKey({
        batchId: BATCH_ID,
        operation: "concept_premise",
        conceptIndex: 0,
        attempt: 0,
      }),
    );
  });

  it("persists one artifact per concept, naming the premise that produced it", async () => {
    const recorded = recorder();
    await run(recorded);
    expect(recorded.artifacts).toHaveLength(3);
    const premises = validPremiseSet().premises;
    recorded.artifacts
      .slice()
      .sort((a, b) => (a.concept_index as number) - (b.concept_index as number))
      .forEach((row, at) => {
        expect(row.concept_premise).toEqual(premises[at]);
        expect(row.concept_premise_prompt_version).toBe("concept_premise_v1");
        expect(row.concept_premise_schema_version).toBe("concept_premise_schema_v1");
        expect(row.concept_premise_input_assembly_version).toBe("concept_premise_input_v1");
        expect(row.design_intent_input_assembly_version).toBe("design_intent_input_v2");
        expect(row.design_intent_prompt_version).toBe("design_intent_v6");
        expect(row.event_id).toBe(EVENT_ID);
        expect(row.batch_id).toBe(BATCH_ID);
        expect(row.identity_revision_id).toBe(REVISION_ID);
        expect(row.round).toBe(1);
      });
  });

  it("persists the resolved card, and what the review changed to get it", async () => {
    // Three siblings returning one concept name — the defect that reached a blind reviewer. The
    // artifact's `presentation` is `not null` with a non-empty name, so it can only ever hold a
    // resolved card; `card_deviations` is what keeps the substitution recoverable.
    create.mockImplementation((request: ProviderRequest) =>
      Promise.resolve(
        route(request, {
          designIntent: (r) =>
            designIntentFor(r, {
              presentation: { name: "Common Name", description: "One description for all three." },
            }),
        }),
      ),
    );
    const recorded = recorder();
    const outcome = await run(recorded);
    expect(outcome.state).toBe("generated");
    if (outcome.state !== "generated") return;

    // Three different names reach the host, which is the whole point.
    expect(new Set(outcome.cards.map((card) => card.name)).size).toBe(3);
    const names = recorded.artifacts.map((row) => (row.presentation as { name: string }).name);
    expect(new Set(names).size).toBe(3);

    const repaired = recorded.artifacts.filter(
      (row) => (row.card_deviations as unknown[]).length > 0,
    );
    expect(repaired).toHaveLength(2);
    const deviation = (repaired[0].card_deviations as { rule: string; before: string }[])[0];
    expect(deviation.rule).toMatch(/^concept-card\./);
    expect(deviation.before).toBe("Common Name");
  });

  it("leaves an unrepaired card's deviations empty, which is the true value", async () => {
    const recorded = recorder();
    await run(recorded);
    expect(recorded.artifacts.every((row) => (row.card_deviations as unknown[]).length === 0)).toBe(
      true,
    );
  });
});

describe("when something goes wrong", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    setEnv();
  });

  afterEach(clearEnv);

  it("generates no concept at all when the premise set cannot be made usable", async () => {
    // The refusal that matters: three concepts from a set just proved collapsed is the
    // known-defective output, so the batch produces nothing rather than reverting to premise-free
    // calls. A silent reversion would be invisible in exactly the place it cost most.
    const collapsed = validPremiseSet();
    create.mockImplementation((request: ProviderRequest) =>
      Promise.resolve(
        route(request, {
          premise: {
            ...collapsed,
            premises: collapsed.premises.map((premise) => ({
              ...premise,
              register: { pace: "measured", presence: "poised", surfaceRichness: "considered" },
            })),
          },
        }),
      ),
    );
    const recorded = recorder();
    const outcome = await run(recorded);

    expect(outcome.state).toBe("premise_unusable");
    expect(designIntentMessages()).toEqual([]);
    // One premise call plus its single repair pass, and nothing else was bought.
    expect(create).toHaveBeenCalledTimes(2);
    // The failed attempt is still recorded, so the ceiling sees what it cost — and it is recorded
    // at the batch level, so no sibling is marked failed for a call it never made.
    const batchCalls = recorded.rpc.filter((entry) => entry.name === "record_batch_call_run");
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0].args.p_success).toBe(false);
    expect(batchCalls[0].args.p_operation).toBe("concept_premise");
    expect((batchCalls[0].args.p_run as { prompt_version: string }).prompt_version).toBe(
      "concept_premise_v1",
    );
    expect(recorded.rpc.filter((entry) => entry.name === "record_batch_sibling_run")).toEqual([]);
    // And the batch is settled rather than left in flight blocking the event.
    expect(recorded.rpc.some((entry) => entry.name === "settle_generation_batch")).toBe(true);
    expect(recorded.artifacts).toEqual([]);
  });

  it("keeps the other two concepts when one sibling fails", async () => {
    // `spec.md §7.10 #5`: concept-level readiness is canonical, and a failed sibling is never
    // replaced by a fabricated one. Fewer than three is a visible state.
    let designIntentCalls = 0;
    create.mockImplementation((request: ProviderRequest) => {
      if (request.text.format.name === "concept_premise_set")
        return Promise.resolve(route(request));
      designIntentCalls += 1;
      if (designIntentCalls === 2) {
        return Promise.reject(Object.assign(new Error("nope"), { status: 400 }));
      }
      return Promise.resolve(route(request));
    });
    const recorded = recorder();
    const outcome = await run(recorded);

    expect(outcome.state).toBe("generated");
    if (outcome.state !== "generated") return;
    expect(outcome.conceptCount).toBe(2);
    expect(outcome.cards).toHaveLength(2);
    expect(recorded.artifacts).toHaveLength(2);

    const siblingCalls = recorded.rpc.filter((entry) => entry.name === "record_batch_sibling_run");
    expect(siblingCalls.filter((entry) => entry.args.p_success === false)).toHaveLength(1);
    expect(siblingCalls.filter((entry) => entry.args.p_success === true)).toHaveLength(2);
  });

  it("says the batch failed when every sibling did, rather than reporting zero concepts", async () => {
    create.mockImplementation((request: ProviderRequest) => {
      if (request.text.format.name === "concept_premise_set")
        return Promise.resolve(route(request));
      return Promise.reject(Object.assign(new Error("nope"), { status: 400 }));
    });
    const recorded = recorder();
    const outcome = await run(recorded);
    expect(outcome.state).toBe("failed");
    expect(recorded.artifacts).toEqual([]);
    // All three attempts are still recorded, because all three were still paid for.
    const siblingCalls = recorded.rpc.filter((entry) => entry.name === "record_batch_sibling_run");
    expect(siblingCalls.filter((entry) => entry.args.p_success === false)).toHaveLength(3);
  });

  it("spends nothing when a batch already answers the request", async () => {
    create.mockImplementation((request: ProviderRequest) => Promise.resolve(route(request)));
    const recorded = recorder({ existingBatch: batchRow({ status: "running" }) });
    const outcome = await run(recorded);
    expect(outcome.state).toBe("observed");
    expect(create).not.toHaveBeenCalled();
    expect(recorded.rpc.some((entry) => entry.name === "plan_generation_batch")).toBe(false);
  });

  it("refuses an event with no authoritative identity, before any call", async () => {
    // `spec.md §7.6b`: a provisional identity must not flow downstream, and an event with none at
    // all has nothing for three siblings to inherit.
    create.mockImplementation((request: ProviderRequest) => Promise.resolve(route(request)));
    const recorded = recorder({ authoritativeRevisionId: null });
    const outcome = await run(recorded);
    expect(outcome).toEqual({ state: "refused", reason: "not_authoritative" });
    expect(create).not.toHaveBeenCalled();
  });
});
