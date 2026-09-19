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
import { novelTree } from "../../../tests/fixtures/novel-composition";
import { A1_SITES, page } from "@/lib/renderer/library";
import type { CompositionTree } from "@/lib/renderer/composition";
import type { Capabilities } from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { decideArtwork } from "@/lib/renderer/compile/artwork-decision";

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

/** The provider. Everything below it is the code that ships, except the two seams noted next. */
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

/**
 * The compile-and-persist seam, stubbed so this file stays about the batch's shape.
 *
 * Not a shortcut: `compileConcept` drives a real headless browser at two widths, and
 * `compile-concept.test.ts` already runs it for real — thirteen cases, Chromium, zero skips —
 * while `composition-stage.test.ts` owns the per-sibling lifecycle. Running either again here
 * would make a fifteen-case orchestration suite take minutes to re-prove someone else's property.
 * What is left unmocked is everything this file is responsible for: the premise call, the binding,
 * the three DesignIntent calls, the set review, artifact lineage and settlement.
 */
const compileConcept = vi.fn();
vi.mock("./compile-concept", async () => {
  const actual = await vi.importActual<typeof import("./compile-concept")>("./compile-concept");
  return { ...actual, compileConcept };
});

const persistConcept = vi.fn();
vi.mock("./persist-concept", () => ({ persistConcept }));

const VERIFIED_COMPOSITION = {
  state: "verified",
  // A verified spec always carries these. A fixture that omitted them would let the artwork
  // reservation path pass on a shape production never produces.
  spec: {
    verified: {
      clean: true,
      mobile: { artworkBoxes: {} },
      desktop: { artworkBoxes: {} },
    },
    artwork: {},
    tokens: { palette: {} },
  },
  raw: { version: "composition_v1", sections: [] },
  canonical: { version: "composition_v1", sections: [] },
  compositionHash: "hash-stub",
  repairs: [],
  deviations: [],
  nearestSibling: 0.1,
};

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
  /** Every row handed to `design_concepts.insert` — a concept is only written once composed. */
  readonly concepts: Row[];
  readonly specs: Row[];
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
        // Two different reads hit this table: the authoritative-identity pointer, and the narrow
        // content row the composition stage measures. One row answering both is enough for a fake.
        return {
          data: [
            {
              authoritative_identity_revision_id: recorded.authoritativeRevisionId,
              title: "Baby Shaker is on the way",
              description: null,
              hosts: "Haseeb & Shezia",
              baby_name: "Shaker",
              venue_name: "The Lodge",
              address: "Aldie, Virginia",
              event_date: "2026-12-19",
              start_time: "13:00",
              timezone: "America/New_York",
              rsvp_deadline: null,
            },
          ],
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
        if (table === "design_concepts") recorded.concepts.push(...rows);
        if (table === "resolved_design_specs") recorded.specs.push(...rows);
        // Chainable, because production selects the inserted ids back: the composition stage links
        // `design_concepts.design_intent_artifact_id`, and a positional guess would be refused by
        // `validate_design_concept_artifact()`.
        const inserted =
          table === "design_intent_artifacts"
            ? rows.map((row) => ({
                id: `artifact-${row.concept_index}`,
                concept_index: row.concept_index,
              }))
            : rows.map((_, i) => ({ id: `${table}-${i}` }));
        const done = { data: inserted, error: null };
        const insertChain: Record<string, unknown> = {
          select: () => insertChain,
          maybeSingle: () => Promise.resolve({ data: inserted[0] ?? null, error: null }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(done).then(resolve),
        };
        return insertChain;
      },
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
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
      if (
        name === "record_sibling_stage_run" ||
        name === "record_batch_call_run" ||
        name === "record_sibling_stage_run"
      ) {
        return Promise.resolve({
          data: [{ outcome: "recorded", run_id: `run-${String(args.p_operation ?? "x")}` }],
          error: null,
        });
      }
      if (name === "settle_batch_sibling") {
        return Promise.resolve({ data: args.p_success ? "succeeded" : "failed", error: null });
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
    concepts: [],
    specs: [],
    existingBatch: null,
    authoritativeRevisionId: REVISION_ID,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ provider responses */

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

/**
 * Which premise this request carries, read off the request itself.
 *
 * The mock has to answer as a competent model would — naming the concept its own premise names and
 * serving its register — because a mock that returns one design for all three siblings is a
 * converged batch, and the set review says so on every run. That is right of the review and wrong
 * of a fixture: it would hide the difference between a batch that converged and one that did not.
 */
function premiseInRequest(request: ProviderRequest) {
  const message = request.input[1].content;
  const premises = validPremiseSet().premises;
  const at = premises.findIndex((premise) => message.includes(premise.organizingIdea));
  if (at < 0) throw new Error("no premise found in the DesignIntent request");
  return { title: premises[at].title, index: at, register: premises[at].register };
}

/** What `design_intent_v6` asks of the model: these six fields answer to the premise's register. */
const BY_PACE: Record<string, string> = {
  lingering: "spacious",
  measured: "balanced",
  propulsive: "compact",
};
const BY_PRESENCE: Record<string, string> = {
  understated: "symmetric",
  poised: "gentle",
  commanding: "strong",
};
const BY_RICHNESS: Record<string, { ornament: string; motifs: string[] }> = {
  bare: { ornament: "none", motifs: [] },
  considered: { ornament: "restrained", motifs: ["linen"] },
  layered: { ornament: "decorative", motifs: ["botanical", "stripe"] },
};
const PALETTES = [
  { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
  { colors: ["#2E2E2E", "#8A8A8A", "#EFEFEF"], dominant: "#8A8A8A" },
  { colors: ["#4A2C2A", "#B07D62", "#E8D9C5"], dominant: "#4A2C2A" },
];

function designIntentBody(request: ProviderRequest, overrides: Record<string, unknown> = {}) {
  const premise = premiseInRequest(request);
  return {
    palette: PALETTES[premise.index],
    density: BY_PACE[premise.register.pace],
    motifs: BY_RICHNESS[premise.register.surfaceRichness].motifs,
    presentation: { name: premise.title, description: CARD_DESCRIPTIONS[premise.index] },
    ...overrides,
  };
}

/**
 * A DesignIntent response that satisfies whatever assignment the request narrowed to.
 *
 * The three assignment fields are read off the request rather than hard-coded, because the three
 * siblings are assigned three different families, tones and hierarchies — a fixed body would fail
 * assignment conformance for two of the three and this file would be testing the fixture.
 */
function designIntentFor(request: ProviderRequest, overrides: Record<string, unknown> = {}) {
  const properties = (request.text.format.schema.properties ?? {}) as Record<
    string,
    { enum?: string[]; properties?: Record<string, { enum?: string[] }> }
  >;
  const only = (name: string) => properties[name]?.enum?.[0] as string;
  const premise = premiseInRequest(request);
  return {
    family: only("family"),
    tonalDirection: only("tonalDirection"),
    typographyPairing: only("typographyPairing"),
    composition: {
      asymmetry: BY_PRESENCE[premise.register.presence],
      hierarchy: properties.composition?.properties?.hierarchy?.enum?.[0] as string,
      rhythm: premise.register.pace === "lingering" ? "continuous" : "punctuated",
      sectionContrast: premise.register.presence === "commanding" ? "high" : "moderate",
      ornament: BY_RICHNESS[premise.register.surfaceRichness].ornament,
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

/** Stage runs for one operation. A sibling now records two, so a bare count says little. */
const stageRuns = (recorded: Recorded, operation: string) =>
  recorded.rpc.filter(
    (entry) => entry.name === "record_sibling_stage_run" && entry.args.p_operation === operation,
  );

const premiseCalls = () =>
  create.mock.calls.filter(([r]) => r.text?.format?.name === "concept_premise_set");

/**
 * A stub Composition runner, injected so this file never reaches a provider for step 8.
 *
 * The composition half has its own coverage — `composition-stage.test.ts` for the lifecycle and
 * `compile-concept.test.ts` for the real compiler and the real browser pass. What this file owns
 * is the batch's shape, so composition is stubbed at its narrowest seam: the runner returns a
 * minimal legal tree and the rest of the pipeline runs for real.
 */
function stubRunner(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    tree: { version: "composition_v1", sections: [] },
    promptVersion: "composition_v1_p3",
    schemaVersion: "composition_schema_v1",
    inputAssemblyVersion: "composition_input_v1",
    fallback: null,
    telemetry: {
      operation: "composition",
      provider: "openai",
      model: "gpt-5.6-sol",
      latencyMs: 800,
      promptVersion: "composition_v1_p3",
      schemaVersion: "composition_schema_v1",
    },
    ...overrides,
  });
}

async function run(
  recorded: Recorded,
  request: { newRound?: boolean } = {},
  runner = stubRunner(),
) {
  const { runConceptBatch } = await import("./concept-batch");
  return runConceptBatch(
    fakeAdmin(recorded),
    {
      eventId: EVENT_ID,
      userId: USER_ID,
      ...request,
    },
    runner as never,
  );
}

/* --------------------------------------------------- the selector, end to end */

/**
 * The defect the Phase 4D live smoke exposed, and its fix.
 *
 * That run recorded `nearest_sibling` as null on all three composition rows: `runConceptBatch`
 * fanned the siblings out with `Promise.all` and supplied neither `against` nor `collides`, so
 * canon's step 5 never executed. The machinery on both sides was complete and unit-tested — it was
 * simply never fed, and an unfed guard reports "no collision" forever.
 *
 * These cases drive the **real** `runConceptBatch`. The runner is stubbed at the provider boundary
 * and honours `collides` the way `generateComposition` does, because what is under test here is
 * whether the orchestrator feeds the selector and whether the register judges the right rivals —
 * the adapter's own re-prompt-then-fallback loop is proven in `composition.test.ts`.
 */
describe("sibling collision is detected on the production path", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    // The compiler is mocked, as it is for the rest of this file: what is under test is whether
    // the orchestrator feeds the selector, not whether the compiler compiles.
    compileConcept.mockReset();
    compileConcept.mockResolvedValue(VERIFIED_COMPOSITION);
    persistConcept.mockReset();
    persistConcept.mockImplementation((_admin: unknown, req: { conceptIndex: number }) =>
      Promise.resolve({
        conceptId: `concept-${req.conceptIndex}`,
        resolvedSpecId: `spec-${req.conceptIndex}`,
        replayed: false,
      }),
    );
    create.mockImplementation((request: ProviderRequest) => Promise.resolve(route(request)));
    setEnv();
  });

  afterEach(clearEnv);

  /** Two structurally identical trees collide; a library page differs from both. */
  const identical = () => novelTree();
  const distinct = (i: number) => {
    const site = A1_SITES[i % A1_SITES.length];
    return page(site.hero, site.details, site.rsvp, site.registry, site.plan, site.align);
  };

  /**
   * A provider stub that behaves like the adapter: it calls the selector, spends one collision
   * correction, and only then gives up. Anything else would prove the orchestrator talks to a
   * mock rather than to the contract.
   */
  function collisionAwareRunner(trees: (attempt: number, index: number) => CompositionTree) {
    const calls: { index: number; reprompted: boolean; fellBack: boolean }[] = [];
    let seq = 0;
    const runner = vi.fn(async (req: Record<string, unknown>) => {
      const index = seq++;
      let served = trees(0, index);
      let reprompted = false;
      const collides = req.collides as
        ((t: CompositionTree) => Promise<readonly string[] | null>) | undefined;
      let colliding = collides ? await collides(served) : null;
      if (colliding && colliding.length > 0) {
        // The one permitted correction (`docs/model-contracts.md §6.3` step 5).
        reprompted = true;
        served = trees(1, index);
        colliding = collides ? await collides(served) : null;
      }
      calls.push({ index, reprompted, fellBack: Boolean(colliding && colliding.length > 0) });
      return {
        tree: served,
        promptVersion: "composition_v1_p3",
        schemaVersion: "composition_schema_v1",
        inputAssemblyVersion: "composition_input_v1",
        fallback: colliding && colliding.length > 0 ? ("library" as const) : null,
        telemetry: {
          operation: "composition",
          provider: "openai",
          model: "gpt-5.6-sol",
          latencyMs: 800,
          promptVersion: "composition_v1_p3",
          schemaVersion: "composition_schema_v1",
        },
      };
    });
    return { runner, calls };
  }

  it("detects a collision the old code could not see, and re-prompts once", async () => {
    const recorded = recorder();
    // Every sibling would serve the same tree on its first attempt; a corrected attempt differs.
    const { runner, calls } = collisionAwareRunner((attempt, index) =>
      attempt === 0 ? identical() : distinct(index),
    );

    const outcome = await run(recorded, {}, runner);

    expect(outcome.state).toBe("generated");
    // Sibling 0 has no rival and is admitted unchanged. The two after it collide with what was
    // admitted before them and each spends its one correction. Before the fix this was 0.
    expect(calls.filter((c) => c.reprompted)).toHaveLength(2);
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("compares against the sibling that was actually admitted, naming its skeleton", async () => {
    const recorded = recorder();
    const seen: string[][] = [];
    const runner = vi.fn(async (req: Record<string, unknown>) => {
      const collides = req.collides as
        ((t: CompositionTree) => Promise<readonly string[] | null>) | undefined;
      const served = novelTree();
      const colliding = collides ? await collides(served) : null;
      if (colliding) seen.push([...colliding]);
      return {
        tree: served,
        promptVersion: "composition_v1_p3",
        schemaVersion: "composition_schema_v1",
        inputAssemblyVersion: "composition_input_v1",
        fallback: null,
        telemetry: {
          operation: "composition",
          provider: "openai",
          model: "gpt-5.6-sol",
          latencyMs: 1,
          promptVersion: "composition_v1_p3",
          schemaVersion: "composition_schema_v1",
        },
      };
    });

    await run(recorded, {}, runner);

    // The feedback names a real skeleton and a real score, which is what the `avoid` block needs.
    expect(seen.length).toBeGreaterThan(0);
    for (const entry of seen) {
      expect(entry.join(" ")).toMatch(/(desktop|mobile) hero skeleton at \d\.\d\d: /);
    }
  });

  it("records nearest_sibling, so a null no longer means nobody looked", async () => {
    const recorded = recorder();
    const { runner } = collisionAwareRunner((attempt, index) =>
      attempt === 0 ? identical() : distinct(index),
    );

    await run(recorded, {}, runner);

    const compositionRuns = stageRuns(recorded, "composition");
    expect(compositionRuns).toHaveLength(3);
    const nearest = compositionRuns.map(
      (entry) => (entry.args.p_run as { nearest_sibling: number | null }).nearest_sibling,
    );
    // Sibling 0 judged against no rival, which is a real 0 rather than an absence. The others
    // compared against something and recorded what they saw.
    expect(nearest.filter((v) => v !== null)).toHaveLength(3);
    expect(Math.max(...(nearest as number[]))).toBeGreaterThan(0);
  });

  it("costs a non-colliding batch nothing extra", async () => {
    const recorded = recorder();
    const { runner, calls } = collisionAwareRunner((_attempt, index) => distinct(index));

    const outcome = await run(recorded, {}, runner);

    expect(outcome.state).toBe("generated");
    expect(runner).toHaveBeenCalledTimes(3);
    expect(calls.some((c) => c.reprompted)).toBe(false);
    // The normal shape is unchanged: one premise, three DesignIntent, three Composition.
    expect(stageRuns(recorded, "composition")).toHaveLength(3);
    expect(stageRuns(recorded, "design_intent")).toHaveLength(3);
    expect(recorded.rpc.filter((entry) => entry.name === "record_batch_call_run")).toHaveLength(1);
  });

  it("keeps the three provider calls parallel", async () => {
    const recorded = recorder();
    let entered = 0;
    let allEntered: () => void;
    const gate = new Promise<void>((resolve) => {
      allEntered = resolve;
    });
    const runner = vi.fn(async (req: Record<string, unknown>) => {
      entered += 1;
      if (entered === 3) allEntered();
      // Every call must be inside the runner before any of them may finish. If the orchestrator
      // had serialized the model calls to make the selector work, this would deadlock.
      await gate;
      const collides = req.collides as
        ((t: CompositionTree) => Promise<readonly string[] | null>) | undefined;
      const served = distinct(entered);
      await collides?.(served);
      return {
        tree: served,
        promptVersion: "composition_v1_p3",
        schemaVersion: "composition_schema_v1",
        inputAssemblyVersion: "composition_input_v1",
        fallback: null,
        telemetry: {
          operation: "composition",
          provider: "openai",
          model: "gpt-5.6-sol",
          latencyMs: 1,
          promptVersion: "composition_v1_p3",
          schemaVersion: "composition_schema_v1",
        },
      };
    });

    const outcome = await run(recorded, {}, runner);
    expect(entered).toBe(3);
    expect(outcome.state).toBe("generated");
  });

  it("cannot admit three identical trees, however the batch resolves", async () => {
    const recorded = recorder();
    // The failure mode this whole register exists to prevent: every sibling serves the same page
    // and the batch reports three choices anyway.
    const { runner, calls } = collisionAwareRunner(() => identical());

    await run(recorded, {}, runner);

    // Sibling 0 is admitted; the two after it collide with it, spend their one correction, serve
    // the same page again and are still colliding — which is the terminal library fallback. The
    // register admits exactly one of the three, so the batch cannot quietly present the same page
    // three times, which is the failure this whole mechanism exists to prevent.
    expect(calls.filter((c) => c.reprompted)).toHaveLength(2);
    expect(calls.filter((c) => c.fellBack)).toHaveLength(2);
    expect(calls.filter((c) => !c.fellBack)).toHaveLength(1);
  });

  it("releases a sibling's slot when it fails, so the next one is not left waiting", async () => {
    const recorded = recorder();
    let call = 0;
    const runner = vi.fn(async (req: Record<string, unknown>) => {
      const mine = call++;
      if (mine === 0) throw new Error("provider 500");
      const collides = req.collides as
        ((t: CompositionTree) => Promise<readonly string[] | null>) | undefined;
      const served = distinct(mine);
      await collides?.(served);
      return {
        tree: served,
        promptVersion: "composition_v1_p3",
        schemaVersion: "composition_schema_v1",
        inputAssemblyVersion: "composition_input_v1",
        fallback: null,
        telemetry: {
          operation: "composition",
          provider: "openai",
          model: "gpt-5.6-sol",
          latencyMs: 1,
          promptVersion: "composition_v1_p3",
          schemaVersion: "composition_schema_v1",
        },
      };
    });

    // A slot that never resolves would hang the whole batch here rather than fail a test.
    const outcome = await run(recorded, {}, runner);
    expect(outcome.state).toBe("generated");
    expect(runner).toHaveBeenCalledTimes(3);
  });
});

describe("one concept batch, end to end", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    compileConcept.mockReset();
    compileConcept.mockResolvedValue(VERIFIED_COMPOSITION);
    persistConcept.mockReset();
    persistConcept.mockImplementation((_admin: unknown, req: { conceptIndex: number }) =>
      Promise.resolve({
        conceptId: `concept-${req.conceptIndex}`,
        resolvedSpecId: `spec-${req.conceptIndex}`,
        replayed: false,
      }),
    );
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

  it("offers artwork per concept, from each sibling's own direction (spec.md §7.6a #1)", async () => {
    // Artwork is the one capability that is not a property of the event. §7.6a #1 gives the choice
    // to the creative direction, so it is derived per sibling from that sibling's own DesignIntent
    // — and the flag the model is told must be the same one the compiler will enforce, or a
    // concept is invited to compose artwork the compiler then suppresses.
    await run(recorder());
    const calls = compileConcept.mock.calls as [
      { designIntent: DesignIntent; capabilities: Capabilities },
    ][];
    expect(calls).toHaveLength(3);
    for (const [request] of calls) {
      expect(request.capabilities.artwork).toBe(decideArtwork(request.designIntent).allowed);
    }
    // And it is genuinely read from the direction rather than pinned on: flipping the direction's
    // ornament to "none" flips the answer for the same sibling.
    for (const [request] of calls) {
      const declined = {
        ...request.designIntent,
        composition: { ...request.designIntent.composition, ornament: "none" as const },
      };
      expect(decideArtwork(declined).allowed).toBe(false);
    }
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
    expect(batchCalls).toHaveLength(1);
    // Three of each, and counted per operation: a sibling records its DesignIntent run and its
    // Composition run, so a bare total of six would not say the premise stayed batch-level.
    expect(stageRuns(recorded, "design_intent")).toHaveLength(3);
    expect(stageRuns(recorded, "composition")).toHaveLength(3);

    expect(batchCalls[0].args.p_operation).toBe("concept_premise");
    expect(batchCalls[0].args.p_success).toBe(true);
    expect((batchCalls[0].args.p_run as { prompt_version: string }).prompt_version).toBe(
      "concept_premise_v1",
    );
    // No `p_concept_index` anywhere in the batch-level call: the premise belongs to all three.
    expect(batchCalls[0].args).not.toHaveProperty("p_concept_index");

    // And each sibling records its own DesignIntent call against its own index, one each.
    const designIntentRuns = stageRuns(recorded, "design_intent");
    expect(designIntentRuns.map((entry) => entry.args.p_concept_index).sort()).toEqual([0, 1, 2]);

    // The sibling rows settle separately, once their concepts exist — not on the call that
    // produced a DesignIntent. Settling there would claim a concept that had not been composed.
    const settles = recorded.rpc.filter((entry) => entry.name === "settle_batch_sibling");
    expect(settles.map((entry) => entry.args.p_concept_index).sort()).toEqual([0, 1, 2]);
    for (const entry of settles) expect(entry.args.p_success).toBe(true);
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

  it("does not let a repaired card hide that the designs converged", async () => {
    // The hazard worth a test of its own. The card fallback derives a repaired card from that
    // concept's **premise**, so three concepts that converged completely still present three
    // distinct cards — the cards say what the premises were, not what the designs became. So the
    // convergence has to survive somewhere, and it is returned rather than discarded.
    create.mockImplementation((request: ProviderRequest) =>
      Promise.resolve(
        route(request, {
          designIntent: (r) =>
            designIntentFor(r, {
              // One card for all three, so every card is repaired — and one **design** for all
              // three, so the batch really has converged. `hierarchy` still comes from the
              // request, because it is planner-assigned and a mismatch would fail conformance
              // rather than converge.
              presentation: { name: "Common Name", description: "One description for all three." },
              palette: { colors: ["#101010", "#202020", "#303030"], dominant: "#101010" },
              motifs: ["linen", "stripe"],
              density: "balanced",
              composition: {
                asymmetry: "gentle",
                hierarchy: ((
                  r.text.format.schema.properties as Record<
                    string,
                    { properties?: Record<string, { enum?: string[] }> }
                  >
                ).composition?.properties?.hierarchy?.enum ?? [])[0],
                rhythm: "alternating",
                sectionContrast: "moderate",
                ornament: "restrained",
              },
            }),
        }),
      ),
    );
    const outcome = await run(recorder());
    expect(outcome.state).toBe("generated");
    if (outcome.state !== "generated") return;

    // Three distinct cards reach the host — and the convergence is reported all the same.
    expect(new Set(outcome.cards.map((card) => card.name)).size).toBe(3);
    const kinds = new Set(outcome.signals.map((signal) => signal.signal));
    expect(kinds).toContain("identical-design-vector");
    expect(kinds).toContain("motif-overlap");
    expect(kinds).toContain("palette-proximity");
    // Reported, never repaired: nothing rewrote a palette or a motif set to widen a distance.
    for (const signal of outcome.signals) {
      expect(["reported", "advisory"]).toContain(signal.severity);
    }
  });

  it("returns no signal when the three designs really do differ", async () => {
    const outcome = await run(recorder());
    expect(outcome.state).toBe("generated");
    if (outcome.state !== "generated") return;
    expect(outcome.signals.filter((signal) => signal.severity === "reported")).toEqual([]);
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
    expect(recorded.rpc.filter((entry) => entry.name === "record_sibling_stage_run")).toEqual([]);
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

    const designIntentRuns = stageRuns(recorded, "design_intent");
    expect(designIntentRuns.filter((entry) => entry.args.p_success === false)).toHaveLength(1);
    expect(designIntentRuns.filter((entry) => entry.args.p_success === true)).toHaveLength(2);
    // The failed sibling never reaches composition: with no DesignIntent there is nothing to
    // compose, so only the two survivors are composed and only they become concepts.
    expect(stageRuns(recorded, "composition")).toHaveLength(2);
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
    expect(
      stageRuns(recorded, "design_intent").filter((e) => e.args.p_success === false),
    ).toHaveLength(3);
    // And none reached composition, so no unpaid-for run row exists either.
    expect(stageRuns(recorded, "composition")).toHaveLength(0);
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
