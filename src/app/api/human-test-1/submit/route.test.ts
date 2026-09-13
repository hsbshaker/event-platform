import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { RateLimitedError } from "@/lib/auth/errors";

/**
 * The Human Test #1 submit endpoint (`docs/human-test-1/README.md`).
 *
 * Two things are being protected here, and they are not the same thing.
 *
 * The first is the experiment: a response must be exactly what `review.html` has always
 * produced, a partial or malformed one must never be stored, a retry must never become a sixth
 * reviewer, and a synthetic submission must never land where the scorer will find it.
 *
 * The second is the blinding: no response this route can produce — success, refusal or crash —
 * may hint at which screens are model-authored. That is asserted positively below rather than
 * assumed from the fact that the route does not import the key.
 *
 * The database side (RLS, the unique index that makes the retry idempotent, the separation of
 * the two tables) is proven against real Postgres in `tests/db/human-test-1.test.ts`; the store
 * is mocked here so this file can be about the request.
 */

const recordSubmission = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock("@/lib/human-test/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/human-test/store")>()),
  recordSubmission: (...args: unknown[]) => recordSubmission(...args),
}));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
}));

const { POST } = await import("./route");
const { REAL_TABLE, SYNTHETIC_TABLE } = await import("@/lib/human-test/store");

const HOST = "survey.example.com";
const TEST_SECRET = "human-test-secret-long-enough-to-pass-validation";

/** A complete, well-formed reviewer response: 40 ratings, groups partitioning 1..40. */
function validResponse(overrides: Record<string, unknown> = {}) {
  const ratings: Record<string, number> = {};
  for (let i = 1; i <= 40; i += 1) ratings[String(i)] = ((i % 5) + 1) as number;
  const grouped = [
    [3, 17, 22],
    [8, 31],
  ];
  const claimed = new Set(grouped.flat());
  const groups = [
    ...grouped,
    ...Array.from({ length: 40 }, (_, i) => i + 1)
      .filter((n) => !claimed.has(n))
      .map((n) => [n]),
  ];
  return {
    reviewer: "AB",
    ok: true,
    protocol: "proof-b/human-test-form.md",
    result: { groups, ratings },
    ...overrides,
  };
}

function submission(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://${HOST}/api/human-test-1/submit`, {
    method: "POST",
    headers: {
      host: HOST,
      origin: `https://${HOST}`,
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const wellFormed = (response: unknown = validResponse()) => ({ submissionKey: KEY, response });

beforeEach(() => {
  recordSubmission.mockReset().mockResolvedValue({ submissionId: "row-1" });
  enforceRateLimit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.HUMAN_TEST_1_TEST_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("accepts a complete review", () => {
  it("stores it in the real table and answers with the submission id and nothing else", async () => {
    const res = await POST(submission(wellFormed()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, submissionId: "row-1" });
    expect(recordSubmission).toHaveBeenCalledWith(REAL_TABLE, KEY, validResponse());
  });

  it("stores the response verbatim, so the frozen scorer reads what review.html produced", async () => {
    await POST(submission(wellFormed()));
    const [, , stored] = recordSubmission.mock.calls[0]!;
    expect(stored).toEqual(validResponse());
    expect(Object.keys(stored as object).sort()).toEqual(["ok", "protocol", "result", "reviewer"]);
  });

  it("answers a retry of the same key identically, so one session is one reviewer", async () => {
    const first = await POST(submission(wellFormed()));
    const retry = await POST(submission(wellFormed()));
    expect(await retry.json()).toEqual(await first.json());
    expect(retry.status).toBe(first.status);
  });

  it("passes a correction under the same key straight through to the store", async () => {
    // The page keeps its session key across a reload, so a reviewer who fixes a misrating
    // resubmits with the same key. The route must not deduplicate that away; the store upserts,
    // so the corrected answers replace the first ones on the one row that session owns.
    await POST(submission(wellFormed()));
    const corrected = validResponse({
      result: {
        ...validResponse().result,
        ratings: { ...validResponse().result.ratings, "7": 1 },
      },
    });
    await POST(submission({ submissionKey: KEY, response: corrected }));
    expect(recordSubmission).toHaveBeenCalledTimes(2);
    expect(recordSubmission).toHaveBeenLastCalledWith(REAL_TABLE, KEY, corrected);
  });
});

describe("refuses anything that is not a complete review", () => {
  const cases: [string, unknown][] = [
    ["a missing reviewer name", wellFormed(validResponse({ reviewer: "" }))],
    ["a whitespace-only reviewer name", wellFormed(validResponse({ reviewer: "   " }))],
    [
      "an unrated screen",
      wellFormed(
        validResponse({
          result: {
            ...validResponse().result,
            ratings: dropKey(validResponse().result.ratings, "7"),
          },
        }),
      ),
    ],
    [
      "a rating outside 1-5",
      wellFormed(
        validResponse({
          result: {
            ...validResponse().result,
            ratings: { ...validResponse().result.ratings, "7": 6 },
          },
        }),
      ),
    ],
    [
      "a non-integer rating",
      wellFormed(
        validResponse({
          result: {
            ...validResponse().result,
            ratings: { ...validResponse().result.ratings, "7": 4.5 },
          },
        }),
      ),
    ],
    [
      "a rating for a screen that does not exist",
      wellFormed(
        validResponse({
          result: {
            ...validResponse().result,
            ratings: { ...validResponse().result.ratings, "41": 3 },
          },
        }),
      ),
    ],
    [
      "a screen in two groups",
      wellFormed(
        validResponse({ result: { ...validResponse().result, groups: [[3, 17], [17, 22], [8]] } }),
      ),
    ],
    [
      "a screen number outside 1-40",
      wellFormed(validResponse({ result: { ...validResponse().result, groups: [[41]] } })),
    ],
    [
      "groups that do not cover every screen",
      wellFormed(validResponse({ result: { ...validResponse().result, groups: [[1, 2], [3]] } })),
    ],
    ["a missing result", wellFormed(validResponse({ result: undefined }))],
    ["an unknown field on the response", wellFormed(validResponse({ note: "hello" }))],
    ["a forged protocol", wellFormed(validResponse({ protocol: "something-else" }))],
    ["ok: false", wellFormed(validResponse({ ok: false }))],
    ["a missing submission key", { response: validResponse() }],
    ["a too-short submission key", { submissionKey: "short", response: validResponse() }],
    ["an unknown top-level field", { ...wellFormed(), testMode: true }],
    ["a snake-cased test flag", { ...wellFormed(), test_mode: true }],
    ["a table selector", { ...wellFormed(), table: "human_test_1_test_responses" }],
    ["nothing at all", {}],
  ];

  it.each(cases)("rejects %s without storing it", async (_label, body) => {
    const res = await POST(submission(body));
    expect(res.status).toBe(400);
    expect(recordSubmission).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await POST(submission("not json at all"));
    expect(res.status).toBe(400);
    expect(recordSubmission).not.toHaveBeenCalled();
  });
});

describe("transport", () => {
  it("refuses a cross-origin submission", async () => {
    const res = await POST(submission(wellFormed(), { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(recordSubmission).not.toHaveBeenCalled();
  });

  it("refuses a submission with no Origin at all", async () => {
    const request = new NextRequest(`https://${HOST}/api/human-test-1/submit`, {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json" },
      body: JSON.stringify(wellFormed()),
    });
    expect((await POST(request)).status).toBe(403);
    expect(recordSubmission).not.toHaveBeenCalled();
  });

  it("accepts the forwarded host a Vercel deployment presents", async () => {
    const request = new NextRequest("https://internal/api/human-test-1/submit", {
      method: "POST",
      headers: {
        host: "internal",
        "x-forwarded-host": HOST,
        origin: `https://${HOST}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(wellFormed()),
    });
    expect((await POST(request)).status).toBe(200);
  });

  it("never emits CORS headers, so no other site can read a response", async () => {
    const res = await POST(submission(wellFormed()));
    for (const header of [
      "access-control-allow-origin",
      "access-control-allow-credentials",
      "access-control-allow-headers",
    ]) {
      expect(res.headers.get(header)).toBeNull();
    }
  });

  it("requires a JSON content type", async () => {
    const res = await POST(submission(wellFormed(), { "content-type": "text/plain" }));
    expect(res.status).toBe(415);
    expect(recordSubmission).not.toHaveBeenCalled();
  });

  it("accepts a charset-qualified JSON content type", async () => {
    const res = await POST(
      submission(wellFormed(), { "content-type": "application/json; charset=utf-8" }),
    );
    expect(res.status).toBe(200);
  });

  it("refuses an oversized body on the bytes, not only on the declared length", async () => {
    const padded = JSON.stringify({ ...wellFormed(), reviewer: "x".repeat(40_000) });
    const request = new NextRequest(`https://${HOST}/api/human-test-1/submit`, {
      method: "POST",
      headers: { host: HOST, origin: `https://${HOST}`, "content-type": "application/json" },
      body: padded,
    });
    expect((await POST(request)).status).toBe(413);
    expect(recordSubmission).not.toHaveBeenCalled();
  });

  it("rate limits per requester, and says so without storing", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitedError("human_test_1:ip"));
    const res = await POST(submission(wellFormed(), { "x-forwarded-for": "203.0.113.9" }));
    expect(res.status).toBe(429);
    expect(recordSubmission).not.toHaveBeenCalled();
  });
});

describe("synthetic submissions are isolated from the five real reviewers", () => {
  it("goes to the real table when no secret is configured, even if the header is sent", async () => {
    await POST(submission(wellFormed(), { "x-human-test-mode": "anything" }));
    expect(recordSubmission).toHaveBeenCalledWith(REAL_TABLE, KEY, expect.anything());
  });

  it("goes to the real table when the header is absent", async () => {
    process.env.HUMAN_TEST_1_TEST_SECRET = TEST_SECRET;
    await POST(submission(wellFormed()));
    expect(recordSubmission).toHaveBeenCalledWith(REAL_TABLE, KEY, expect.anything());
  });

  it("goes to the real table when the presented secret is wrong", async () => {
    process.env.HUMAN_TEST_1_TEST_SECRET = TEST_SECRET;
    await POST(submission(wellFormed(), { "x-human-test-mode": `${TEST_SECRET}x` }));
    expect(recordSubmission).toHaveBeenCalledWith(REAL_TABLE, KEY, expect.anything());
  });

  it("goes to the synthetic table only when the exact secret is presented", async () => {
    process.env.HUMAN_TEST_1_TEST_SECRET = TEST_SECRET;
    await POST(submission(wellFormed(), { "x-human-test-mode": TEST_SECRET }));
    expect(recordSubmission).toHaveBeenCalledWith(SYNTHETIC_TABLE, KEY, expect.anything());
  });

  it("cannot be selected from the request body, whatever it says", async () => {
    process.env.HUMAN_TEST_1_TEST_SECRET = TEST_SECRET;
    for (const body of [
      { ...wellFormed(), testMode: true },
      { ...wellFormed(), test_mode: true },
      { ...wellFormed(), synthetic: true },
      { ...wellFormed(), table: "human_test_1_test_responses" },
    ]) {
      const res = await POST(submission(body));
      expect(res.status).toBe(400);
    }
    expect(recordSubmission).not.toHaveBeenCalled();
  });
});

describe("no response reveals the hidden classification", () => {
  /** Words that would only appear if the classification, the bar or a score were leaking. */
  const FORBIDDEN =
    /model-authored|hand-authored|human-test-key|human-test-items|library|silhouette|threshold|score|\b70\s*%/i;

  it.each([
    ["a success", () => submission(wellFormed())],
    ["a validation failure", () => submission({ ...wellFormed(), nope: 1 })],
    ["a cross-origin refusal", () => submission(wellFormed(), { origin: "https://evil.example" })],
    ["a wrong content type", () => submission(wellFormed(), { "content-type": "text/plain" })],
    ["a malformed body", () => submission("{{{")],
  ])("says nothing about the answer on %s", async (_label, build) => {
    const res = await POST(build());
    expect(await res.text()).not.toMatch(FORBIDDEN);
  });

  /**
   * The word list above is not enough on its own.
   *
   * `parseSubmission` produces detail strings built from the request — "screen 17 appears in
   * more than one group", "missing 3, 4, 7" — and a thrown database error carries a message. None
   * of those trips `FORBIDDEN`, so if someone returned `detail` or `error.message` to the caller
   * instead of logging it, every other test here would still pass while the endpoint started
   * narrating its internals to anyone who probes it. The refusal body is therefore pinned
   * exactly, which is the assertion that actually holds `rejected()`'s promise of one generic
   * shape for every refusal.
   */
  const GENERIC = { ok: false, error: "This submission could not be saved." };

  it.each([
    ["a schema failure", 400, () => submission({ ...wellFormed(), nope: 1 })],
    [
      "a grouping failure",
      400,
      () =>
        submission(
          wellFormed(
            validResponse({ result: { ...validResponse().result, groups: [[3, 17], [17]] } }),
          ),
        ),
    ],
    [
      "a cross-origin refusal",
      403,
      () => submission(wellFormed(), { origin: "https://evil.example" }),
    ],
    ["a wrong content type", 415, () => submission(wellFormed(), { "content-type": "text/plain" })],
    ["a malformed body", 400, () => submission("{{{")],
  ])("returns exactly the generic refusal on %s", async (_label, status, build) => {
    const res = await POST(build());
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(GENERIC);
  });

  it("returns exactly the generic refusal when the store fails, echoing nothing", async () => {
    recordSubmission.mockRejectedValueOnce(
      new Error("relation human_test_1_responses violated at screen 12"),
    );
    const res = await POST(submission(wellFormed()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(GENERIC);
  });

  it("returns a rate-limit refusal that names no internals either", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitedError("human_test_1:ip"));
    const res = await POST(submission(wellFormed()));
    expect(await res.json()).toEqual({
      ok: false,
      error: "Too many submissions from here. Try again in a few minutes.",
    });
  });

  it("answers a success with the submission id and nothing more", async () => {
    const res = await POST(submission(wellFormed()));
    expect(Object.keys(await res.json()).sort()).toEqual(["ok", "submissionId"]);
  });
});

function dropKey(source: Record<string, number>, key: string) {
  const copy = { ...source };
  delete copy[key];
  return copy;
}
