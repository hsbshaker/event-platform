import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server boundary T11 speaks through — and specifically, which database identity writes what.
 *
 * `clarification_answers` is host input. `answered_by` has to be a fact the database established
 * under the host's own session, not a value the application asserted about itself: the insert
 * policy requires `answered_by = auth.uid()` and `validate_clarification_answer` re-checks it. All
 * of that is proven against real Postgres in `tests/db/phase4b.test.ts`. What that cannot prove is
 * that *this* module goes through the host's client — a service-role insert would satisfy every
 * trigger by bypassing the policy entirely, and the row would look identical.
 *
 * So this asserts the wiring: the admin client is used for orchestration, which needs it because
 * the claims table is server-only, and never for the answer.
 *
 * Acceptance criteria: `spec.md §31 — Creation Mode`; `§7.6b`; `§25`.
 */
const adminRpc = vi.fn();
const adminFrom = vi.fn();
const userFrom = vi.fn();
const startEventIdentity = vi.fn();
const readEventIdentity = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: adminRpc, from: adminFrom }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: userFrom }),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: "user-1" }),
}));

vi.mock("@/lib/generation/identity-orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation/identity-orchestrator")>();
  return {
    ...actual,
    startEventIdentity: (...args: unknown[]) => startEventIdentity(...args),
    readEventIdentity: (...args: unknown[]) => readEventIdentity(...args),
  };
});

const { startEventIdentityForEvent, submitClarificationAnswer } = await import("./event-identity");

const EVENT = "11111111-1111-1111-1111-111111111111";

const QUESTION = {
  kind: "boundary" as const,
  question: "Has she agreed to a surprise?",
  whyItMatters: "It is not ours to settle on her behalf.",
  options: [
    { label: "Yes, she knows", isDefer: false },
    { label: "No, it's a surprise", isDefer: false },
  ],
};

const REVISION = {
  id: "revision-1",
  revision: 1,
  result: { clarification: { needed: true, questions: [QUESTION] } },
};

/** A minimal thenable query builder, enough for the two shapes this module issues. */
function reader(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return builder;
}

const inserted: Record<string, unknown>[] = [];

beforeEach(() => {
  inserted.length = 0;
  adminRpc.mockReset();
  adminFrom.mockReset();
  userFrom.mockReset();
  startEventIdentity.mockReset();
  readEventIdentity.mockReset();
  startEventIdentity.mockResolvedValue({ state: "running", hasAuthoritativeIdentity: false });
  readEventIdentity.mockResolvedValue({ state: "running", hasAuthoritativeIdentity: false });

  userFrom.mockImplementation((table: string) => {
    if (table === "event_identity_revisions") return reader([REVISION]);
    if (table === "clarification_answers") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  adminFrom.mockImplementation((table: string) => {
    throw new Error(`the admin client must not touch ${table}`);
  });
});

describe("a clarification answer is written as the host", () => {
  it("inserts through the caller's own session, never the service role", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      questionIndex: 0,
      selectedOptionLabel: "No, it's a surprise",
    });

    expect(inserted).toHaveLength(1);
    // The row the RLS policy checks: it is the host's session that must satisfy it.
    expect(inserted[0]).toMatchObject({
      event_id: EVENT,
      identity_revision_id: "revision-1",
      question_index: 0,
      round: 1,
      kind: "boundary",
      answered_by: "user-1",
      selected_option_label: "No, it's a surprise",
    });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("copies the question from the persisted revision, not from the request", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      questionIndex: 0,
      selectedOptionLabel: "Yes, she knows",
    });

    // A tampered payload cannot describe a question the host was never asked: the text and the
    // options come from the revision this server just read.
    expect(inserted[0].question_text).toBe(QUESTION.question);
    expect(inserted[0].options).toEqual(QUESTION.options);
  });

  it("never files a defer against a boundary question", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      questionIndex: 0,
      selectedOptionLabel: "Yes, she knows",
    });
    // Route B offers no defer, so the honest path never claims one — the database refuses it too.
    expect(inserted[0].is_defer).toBe(false);
  });

  it("refuses an option the question never offered", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      questionIndex: 0,
      selectedOptionLabel: "Something the model never said",
    });

    expect(inserted).toHaveLength(0);
    // Answered with canonical state rather than an error the host can do nothing with.
    expect(readEventIdentity).toHaveBeenCalled();
  });

  it("answers a stale tab with the current state instead of writing to the wrong round", async () => {
    await submitClarificationAnswer({ eventId: EVENT, revision: 99, questionIndex: 0 });

    expect(inserted).toHaveLength(0);
    expect(readEventIdentity).toHaveBeenCalled();
  });

  it("treats a duplicate submission as a refresh, not a failure", async () => {
    userFrom.mockImplementation((table: string) => {
      if (table === "event_identity_revisions") return reader([REVISION]);
      return { insert: () => Promise.resolve({ error: { code: "23505" } }) };
    });

    const view = await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      questionIndex: 0,
      selectedOptionLabel: "Yes, she knows",
    });

    // One answer per question is the invariant; a second submission converges on it and the host
    // sees canonical state rather than a destructive error.
    expect(view.state).toBe("running");
    expect(startEventIdentity).toHaveBeenCalled();
  });

  it("runs the canonical orchestration once the answer is durable", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      questionIndex: 0,
      selectedOptionLabel: "Yes, she knows",
    });
    // A new answer is a new basis, so the rerun is a legitimately new round — through T10, not
    // through anything this module decides.
    expect(startEventIdentity).toHaveBeenCalledWith(expect.anything(), EVENT, {
      explicitRetry: undefined,
    });
  });
});

describe("what a host is told when the server itself is misconfigured", () => {
  it("does not answer a configuration refusal with `try again shortly`", async () => {
    const { IdentityConfigurationError } = await import("@/lib/generation/identity-spend");
    startEventIdentity.mockRejectedValue(new IdentityConfigurationError("IDENTITY_CEILING_USD"));

    const view = await startEventIdentityForEvent(EVENT);

    expect(view.state).toBe("service_error");
    expect(view).not.toHaveProperty("message");
  });
});

describe("the model's own rationale never leaves the server", () => {
  it("projects a question down to what the host reads", async () => {
    readEventIdentity.mockResolvedValue({
      state: "clarification_required",
      hasAuthoritativeIdentity: false,
      identityRevisionId: "revision-1",
      revision: 1,
      questions: [{ index: 0, question: QUESTION }],
    });
    const { loadEventIdentityView } = await import("./event-identity");

    const view = await loadEventIdentityView(EVENT);

    expect(view?.questions).toEqual([
      {
        kind: "boundary",
        index: 0,
        question: QUESTION.question,
        options: QUESTION.options,
      },
    ]);
    // `contract.ts` says so in the schema: not shown to the host as written. A field nobody
    // renders still ships in the payload, so it is dropped here rather than in a component.
    expect(JSON.stringify(view)).not.toContain("whyItMatters");
    expect(JSON.stringify(view)).not.toContain(QUESTION.whyItMatters);
    // The revision **id** is a server concern; the round number is what an answer is checked on.
    expect(view).not.toHaveProperty("identityRevisionId");
  });
});
