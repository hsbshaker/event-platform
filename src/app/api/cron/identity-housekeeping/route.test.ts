import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The recovery driver's route.
 *
 * The SQL is proven against real Postgres in `tests/db/phase4b-t9a.test.ts`. What matters here is
 * that the job exists, runs behind `CRON_SECRET`, runs all three steps, and — the part that made
 * this a blocker — that shipping the one-in-flight refusal without something to release a dead
 * claim would wedge an event permanently.
 *
 * Acceptance criteria: N/A — recovery and retention for `docs/phase-4b-plan.md §A.5`–`§A.7`.
 */
const rpc = vi.fn();
let calls: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => {
      calls.push(name);
      return rpc(name, args);
    },
  }),
}));

const SECRET = "cron-secret-value-long-enough-to-pass";

/**
 * A genuinely valid envelope, because the point of the completion path is that it re-validates
 * the stored text through the **production** validator. A stub shape would pass the test while
 * proving nothing about recovery.
 */
const validIdentity = {
  creativeDirection: "A restrained, tactile winter identity built on materials rather than motifs.",
  toneKeywords: ["restrained", "tactile", "warm"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ivory"],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like",
  typographyDirection: "quiet oldstyle serif",
  copyTone: "warm and unfussy",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No visual inspiration supplied.",
};

const validBody = {
  identity: validIdentity,
  suppliedFacts: {
    hostNames: null,
    honoreeName: null,
    honoreeDescriptionText: null,
    eventType: null,
    dateText: null,
    timeText: null,
    venueText: null,
    addressText: null,
    localityText: null,
    rsvpDeadlineText: null,
  },
  clarification: { needed: false, questions: [] },
};

const request = (auth?: string) =>
  new NextRequest("https://example.com/api/cron/identity-housekeeping", {
    headers: auth ? { authorization: auth } : {},
  });

async function GET(auth?: string) {
  const { GET: handler } = await import("./route");
  return handler(request(auth));
}

beforeEach(() => {
  vi.resetModules();
  rpc.mockReset();
  calls = [];
  process.env.CRON_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.APP_ENCRYPTION_KEY = "a".repeat(48);
  rpc.mockImplementation(async (name: string) => {
    if (name === "expire_identity_call_claims") {
      return { data: [{ abandoned: 2, expired_unknown: 1 }], error: null };
    }
    if (name === "pending_identity_call_completions") return { data: [], error: null };
    if (name === "purge_identity_response_evidence") return { data: 4, error: null };
    return { data: null, error: null };
  });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("the identity housekeeping job", () => {
  it("is not a public endpoint", async () => {
    expect((await GET()).status).toBe(404);
    expect((await GET("Bearer wrong")).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("releases dead claims, recovers captured responses and ages out evidence", async () => {
    const response = await GET(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      abandoned: 2,
      expiredUnknown: 1,
      completed: 0,
      unrecoverable: 0,
      retryable: 0,
      evidencePurged: 4,
      retentionDays: 30,
    });
    // All three steps, every run. Expiry is the one that keeps the one-in-flight index from
    // wedging an event whose process died; the purge is the retention commitment.
    expect(calls).toEqual([
      "expire_identity_call_claims",
      "pending_identity_call_completions",
      "purge_identity_response_evidence",
    ]);
  });

  it("turns a captured response into a revision without calling a model", async () => {
    const accepted = JSON.stringify(validBody);
    rpc.mockImplementation(async (name: string) => {
      if (name === "expire_identity_call_claims") {
        return { data: [{ abandoned: 0, expired_unknown: 0 }], error: null };
      }
      if (name === "pending_identity_call_completions") {
        return {
          data: [
            {
              claim_id: "c1",
              event_id: "e1",
              generation_run_id: "r1",
              schema_version: "event_identity_schema_v5",
              provider_response_evidence: ['{"rejected":true}', accepted],
              captured_at: "2026-09-16T00:00:00Z",
            },
          ],
          error: null,
        };
      }
      if (name === "complete_identity_call") {
        return {
          data: [{ revision_id: "rev1", revision: 1, is_provisional: false, authoritative: true }],
          error: null,
        };
      }
      return { data: 0, error: null };
    });

    await expect((await GET(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({ completed: 1 });
    // The accepted response is the last one — a repair appends — and it is re-validated locally.
    expect(calls).toContain("complete_identity_call");
  });

  /** One captured claim, with whatever evidence and version the case needs. */
  function servePending(
    evidence: unknown,
    schemaVersion = "event_identity_schema_v5",
    completeResult: { data: unknown; error: unknown } = { data: null, error: null },
  ) {
    rpc.mockImplementation(async (name: string) => {
      if (name === "expire_identity_call_claims") {
        return { data: [{ abandoned: 0, expired_unknown: 0 }], error: null };
      }
      if (name === "pending_identity_call_completions") {
        return {
          data: [
            {
              claim_id: "c1",
              event_id: "e1",
              generation_run_id: "r1",
              schema_version: schemaVersion,
              provider_response_evidence: evidence,
              captured_at: "2026-09-16T00:00:00Z",
            },
          ],
          error: null,
        };
      }
      if (name === "complete_identity_call") return completeResult;
      if (name === "fail_identity_call_recovery") return { data: "terminal", error: null };
      return { data: 0, error: null };
    });
  }

  it("releases the event when a captured response can never be validated", async () => {
    // It validated once, before capture, so this means corruption — and the evidence is still
    // durable. The claim must go terminal even so: `response_captured` has no expiry, so leaving
    // it would hold this event's one in-flight slot for ever.
    servePending(["not json at all"]);
    await expect((await GET(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({
      completed: 0,
      unrecoverable: 1,
      retryable: 0,
    });
    expect(calls).not.toContain("complete_identity_call");
    expect(calls).toContain("fail_identity_call_recovery");
    // Deterministic: the same bytes fail the same way for ever, so it terminates on the first try.
    expect(rpc).toHaveBeenCalledWith(
      "fail_identity_call_recovery",
      expect.objectContaining({ p_deterministic: true }),
    );
  });

  it("reports the failing stage rather than a bare 500", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "expire_identity_call_claims") {
        return { data: null, error: { code: "42501", message: "denied" } };
      }
      if (name === "purge_identity_response_evidence") return { data: 2, error: null };
      return { data: null, error: null };
    });
    const response = await GET(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      stage: "sweep_claims",
      code: "42501",
    });
  });

  it("purges even when the sweep failed", async () => {
    // The two are independent jobs sharing a schedule. Returning early on a sweep failure would
    // have let one claim the sweep cannot settle stop evidence retention deployment-wide.
    rpc.mockImplementation(async (name: string) => {
      if (name === "expire_identity_call_claims") {
        return { data: null, error: { code: "42501", message: "denied" } };
      }
      if (name === "purge_identity_response_evidence") return { data: 3, error: null };
      return { data: null, error: null };
    });
    await expect((await GET(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({
      ok: false,
      evidencePurged: 3,
    });
    expect(calls).toContain("purge_identity_response_evidence");
  });

  it("steps over a completion the database refuses instead of stopping the run", async () => {
    // One poison-pill claim must not disable housekeeping. `complete_identity_call` genuinely
    // raises when an answer id does not belong to the event, and the pending list is oldest-first,
    // so the same claim would be retried first on every run — discarding that run's expiry counts
    // and stopping the purge forever.
    rpc.mockImplementation(async (name: string) => {
      if (name === "expire_identity_call_claims") {
        return { data: [{ abandoned: 1, expired_unknown: 0 }], error: null };
      }
      if (name === "pending_identity_call_completions") {
        return {
          data: [
            {
              claim_id: "poison",
              event_id: "e1",
              generation_run_id: "r1",
              schema_version: "event_identity_schema_v5",
              provider_response_evidence: [JSON.stringify(validBody)],
              captured_at: "2026-09-16T00:00:00Z",
            },
          ],
          error: null,
        };
      }
      if (name === "complete_identity_call") {
        return { data: null, error: { code: "23503", message: "answer does not belong" } };
      }
      if (name === "fail_identity_call_recovery") return { data: "terminal", error: null };
      if (name === "purge_identity_response_evidence") return { data: 1, error: null };
      return { data: null, error: null };
    });

    await expect((await GET(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({
      ok: true,
      abandoned: 1,
      completed: 0,
      unrecoverable: 1,
      evidencePurged: 1,
    });
    // A foreign-key violation fails identically next time, so the event is released now rather
    // than blocked while the same claim is retried for ever.
    expect(rpc).toHaveBeenCalledWith(
      "fail_identity_call_recovery",
      expect.objectContaining({ p_deterministic: true }),
    );
  });

  it("keeps a possibly-transient completion failure recoverable", async () => {
    // A deadlock may well succeed next run. Terminating every error indiscriminately would throw
    // away a paid response that was one retry from becoming a revision.
    rpc.mockImplementation(async (name: string) => {
      if (name === "expire_identity_call_claims") {
        return { data: [{ abandoned: 0, expired_unknown: 0 }], error: null };
      }
      if (name === "pending_identity_call_completions") {
        return {
          data: [
            {
              claim_id: "c1",
              event_id: "e1",
              generation_run_id: "r1",
              schema_version: "event_identity_schema_v5",
              provider_response_evidence: [JSON.stringify(validBody)],
              captured_at: "2026-09-16T00:00:00Z",
            },
          ],
          error: null,
        };
      }
      if (name === "complete_identity_call") {
        return { data: null, error: { code: "40P01", message: "deadlock detected" } };
      }
      if (name === "fail_identity_call_recovery") return { data: "retryable", error: null };
      return { data: 0, error: null };
    });

    await expect((await GET(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({
      completed: 0,
      unrecoverable: 0,
      retryable: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      "fail_identity_call_recovery",
      expect.objectContaining({ p_deterministic: false }),
    );
  });

  it("releases the event when a captured response has a schema version it cannot read", async () => {
    // Fetching the version and not checking it is the fail-open shape §A.3 exists to remove; its
    // SQL twin `identity_questions()` refuses an unrecognised version rather than reading it as
    // empty. A version today's validator happens to accept would otherwise be written into a
    // revision whose generated column then refuses it — after the money was spent.
    servePending([JSON.stringify(validBody)], "event_identity_schema_v99");

    await expect((await GET(`Bearer ${SECRET}`)).json()).resolves.toMatchObject({
      completed: 0,
      unrecoverable: 1,
    });
    expect(calls).not.toContain("complete_identity_call");
    expect(calls).toContain("fail_identity_call_recovery");
  });
});
