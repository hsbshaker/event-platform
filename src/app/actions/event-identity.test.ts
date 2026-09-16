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

vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: async () => ({ user: { id: "user-1" }, role: "owner" }),
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
let answeredIndexes: { question_index: number }[] = [];

beforeEach(() => {
  inserted.length = 0;
  answeredIndexes = [];
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
        // The already-answered indices of this round; empty unless a test says otherwise.
        select: () => ({ eq: () => Promise.resolve({ data: answeredIndexes, error: null }) }),
        insert: (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
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
      answers: [{ questionIndex: 0, selectedOptionLabel: "No, it's a surprise" }],
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
      answers: [{ questionIndex: 0, selectedOptionLabel: "Yes, she knows" }],
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
      answers: [{ questionIndex: 0, selectedOptionLabel: "Yes, she knows" }],
    });
    // Route B offers no defer, so the honest path never claims one — the database refuses it too.
    expect(inserted[0].is_defer).toBe(false);
  });

  it("refuses an option the question never offered", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      answers: [{ questionIndex: 0, selectedOptionLabel: "Something the model never said" }],
    });

    expect(inserted).toHaveLength(0);
    // Answered with canonical state rather than an error the host can do nothing with.
    expect(readEventIdentity).toHaveBeenCalled();
  });

  it("answers a stale tab with the current state instead of writing to the wrong round", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 99,
      answers: [{ questionIndex: 0 }],
    });

    expect(inserted).toHaveLength(0);
    expect(readEventIdentity).toHaveBeenCalled();
  });

  it("treats a duplicate submission as a refresh, not a failure", async () => {
    userFrom.mockImplementation((table: string) => {
      if (table === "event_identity_revisions") return reader([REVISION]);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: answeredIndexes, error: null }) }),
        insert: () => Promise.resolve({ error: { code: "23505" } }),
      };
    });

    const view = await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      answers: [{ questionIndex: 0, selectedOptionLabel: "Yes, she knows" }],
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
      answers: [{ questionIndex: 0, selectedOptionLabel: "Yes, she knows" }],
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

describe("Route B takes a supported choice and nothing else", () => {
  it("refuses free text on a boundary question", async () => {
    // The check constraint is satisfied by either field, so the database would take this. The
    // refusal has to be here — which is also where "a tampered payload cannot describe a question
    // the host was never asked" has to be made good. `spec.md §7.6b #1a` asks the host to state a
    // boundary they can affirm, not to write an essay the brief then has to interpret.
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      answers: [{ questionIndex: 0, freeText: "maybe, I'll ask her" }],
    });

    expect(inserted).toHaveLength(0);
    expect(readEventIdentity).toHaveBeenCalled();
  });

  it("refuses a boundary answer that chose nothing", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 1,
      answers: [{ questionIndex: 0 }],
    });
    expect(inserted).toHaveLength(0);
  });
});

describe("free text is bounded", () => {
  const CREATIVE_REVISION = {
    id: "revision-2",
    revision: 2,
    result: {
      clarification: {
        needed: true,
        questions: [
          {
            kind: "creative",
            question: "Warmer or cooler?",
            whyItMatters: "It changes the whole palette.",
            options: [
              { label: "Warmer", isDefer: false },
              { label: "You choose", isDefer: true },
            ],
          },
        ],
      },
    },
  };

  beforeEach(() => {
    userFrom.mockImplementation((table: string) => {
      if (table === "event_identity_revisions") return reader([CREATIVE_REVISION]);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: answeredIndexes, error: null }) }),
        insert: (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    });
  });

  it("refuses text longer than the prompt's own limit", async () => {
    const { MAX_CLARIFICATION_FREE_TEXT } = await import("@/lib/generation/identity-view");
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 2,
      answers: [{ questionIndex: 0, freeText: "x".repeat(MAX_CLARIFICATION_FREE_TEXT + 1) }],
    });

    // Unbounded free text is an unbounded model request, and a request that fails or is truncated
    // is still charged at the per-attempt maximum.
    expect(inserted).toHaveLength(0);
  });

  it("keeps text within the limit exactly as the host wrote it", async () => {
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 2,
      answers: [{ questionIndex: 0, freeText: "  nothing pink, please  " }],
    });

    // Provenance-bearing input: the assembly renders it verbatim, so nothing here trims it.
    expect(inserted[0].free_text).toBe("  nothing pink, please  ");
  });
});

describe("a round is answered in one submission", () => {
  const THREE = {
    id: "revision-3",
    revision: 3,
    result: {
      clarification: {
        needed: true,
        questions: [0, 1, 2].map((i) => ({
          kind: "creative",
          question: `Question ${i}?`,
          whyItMatters: "It changes the direction.",
          options: [
            { label: `A${i}`, isDefer: false },
            { label: "You choose", isDefer: true },
          ],
        })),
      },
    },
  };

  it("writes every answer and starts exactly one rerun", async () => {
    userFrom.mockImplementation((table: string) => {
      if (table === "event_identity_revisions") return reader([THREE]);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: answeredIndexes, error: null }) }),
        insert: (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    });

    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 3,
      answers: [0, 1, 2].map((i) => ({ questionIndex: i, selectedOptionLabel: `A${i}` })),
    });

    // `spec.md §7.6b #1b` allows up to three creative questions in one response. A rerun is keyed
    // to the whole answer set, so one call per answer would be three paid calls and would replace
    // the questions the first rerun had not yet been told about.
    expect(inserted.map((row) => row.question_index)).toEqual([0, 1, 2]);
    expect(startEventIdentity).toHaveBeenCalledTimes(1);
  });
});

describe("the free-text bound is the prompt's own", () => {
  it("does not drift from the limit it was derived from", async () => {
    const { MAX_PROMPT_LENGTH } = await import("@/lib/drafts/store");
    const { MAX_CLARIFICATION_FREE_TEXT } = await import("@/lib/generation/identity-view");
    // Same kind of thing — the host's own words, going to the same model — so one number, pinned
    // rather than copied. `identity-view.ts` cannot import the draft store (it is not server-only
    // and the store is), which is why the constant is duplicated and this test exists.
    expect(MAX_CLARIFICATION_FREE_TEXT).toBe(MAX_PROMPT_LENGTH);
  });
});

describe("a round is answered whole, or not at all", () => {
  const THREE_OPEN = {
    id: "revision-4",
    revision: 4,
    result: {
      clarification: {
        needed: true,
        questions: [0, 1, 2].map((i) => ({
          kind: "creative",
          question: `Question ${i}?`,
          whyItMatters: "It changes the direction.",
          options: [
            { label: `A${i}`, isDefer: false },
            { label: "You choose", isDefer: true },
          ],
        })),
      },
    },
  };

  beforeEach(() => {
    userFrom.mockImplementation((table: string) => {
      if (table === "event_identity_revisions") return reader([THREE_OPEN]);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: answeredIndexes, error: null }) }),
        insert: (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    });
  });

  it("refuses a partial round rather than buying a rerun on half an answer", async () => {
    // The expensive mistake: it would insert, start a paid call on one answer, and the new
    // revision would replace the round — so the questions left out are never asked again.
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 4,
      answers: [{ questionIndex: 0, selectedOptionLabel: "A0" }],
    });

    expect(inserted).toHaveLength(0);
    expect(startEventIdentity).not.toHaveBeenCalled();
    expect(readEventIdentity).toHaveBeenCalled();
  });

  it("refuses the same question answered twice in one submission", async () => {
    // One statement, two rows, one unique constraint: the insert would collide with itself and be
    // misread below as an honest double submission.
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 4,
      answers: [
        { questionIndex: 0, selectedOptionLabel: "A0" },
        { questionIndex: 0, selectedOptionLabel: "You choose" },
      ],
    });

    expect(inserted).toHaveLength(0);
    expect(startEventIdentity).not.toHaveBeenCalled();
  });

  it("refuses an index the round does not have open", async () => {
    answeredIndexes = [{ question_index: 1 }];
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 4,
      answers: [0, 1, 2].map((i) => ({ questionIndex: i, selectedOptionLabel: `A${i}` })),
    });

    // Question 1 is already answered, so the open set is {0, 2}; a submission naming all three is
    // a stale tab, and re-reading is the answer.
    expect(inserted).toHaveLength(0);
  });

  it("accepts exactly the open set when part of the round is already answered", async () => {
    answeredIndexes = [{ question_index: 1 }];
    await submitClarificationAnswer({
      eventId: EVENT,
      revision: 4,
      answers: [0, 2].map((i) => ({ questionIndex: i, selectedOptionLabel: `A${i}` })),
    });

    expect(inserted.map((row) => row.question_index)).toEqual([0, 2]);
    expect(startEventIdentity).toHaveBeenCalledTimes(1);
  });
});
