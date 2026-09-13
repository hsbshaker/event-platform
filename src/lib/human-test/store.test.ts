import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * What `recordSubmission` actually asks PostgREST to do.
 *
 * The database tests prove the SQL behaves; they cannot prove the client emits that SQL, because
 * the harness drives raw Postgres and there is no PostgREST in front of it. That gap matters more
 * than it looks: `.upsert()` resolving to `DO NOTHING` instead of `DO UPDATE` would leave the
 * first submission working and turn every reviewer's correction into a 500 — a failure that only
 * appears when someone reloads and fixes a misrating, which is exactly when nobody is watching.
 *
 * So this drives the real client against a stub transport and pins the request: the conflict
 * target, the merge resolution, and the columns sent. `id` and `created_at` must stay out of the
 * payload, because that absence is what keeps a corrected row's identity and first-seen time.
 */

const captured: { url: string; init: RequestInit }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://stub.supabase.co", "stub-service-role-key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init: RequestInit = {}) => {
          captured.push({ url: String(input), init });
          return Promise.resolve(
            new Response(JSON.stringify({ id: "row-9" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        },
      },
    }),
}));

const { recordSubmission, REAL_TABLE, SYNTHETIC_TABLE } = await import("./store");

function response(reviewer = "AB") {
  const ratings: Record<string, number> = {};
  for (let i = 1; i <= 40; i += 1) ratings[String(i)] = (i % 5) + 1;
  return {
    reviewer,
    ok: true as const,
    protocol: "proof-b/human-test-form.md" as const,
    result: { groups: Array.from({ length: 40 }, (_, i) => [i + 1]), ratings },
  };
}

describe("recordSubmission asks for a merging upsert on the submission key", () => {
  it("targets the unique key and merges rather than ignoring duplicates", async () => {
    captured.length = 0;
    const result = await recordSubmission(REAL_TABLE, "session-key-0000000001", response());

    expect(result).toEqual({ submissionId: "row-9" });
    expect(captured).toHaveLength(1);
    const { url, init } = captured[0]!;

    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe(`/rest/v1/${REAL_TABLE}`);
    expect(new URL(url).searchParams.get("on_conflict")).toBe("submission_key");

    const prefer = new Headers(init.headers).get("prefer") ?? "";
    // `resolution=ignore-duplicates` here would be the silent-correction-loss bug returning as a
    // 500; `return=representation` is what makes `.select("id")` yield the surviving row's id.
    expect(prefer).toContain("resolution=merge-duplicates");
    expect(prefer).not.toContain("resolution=ignore-duplicates");
    expect(prefer).toContain("return=representation");
  });

  it("sends only the three columns, so a correction keeps its id and created_at", async () => {
    captured.length = 0;
    await recordSubmission(REAL_TABLE, "session-key-0000000002", response("CD"));
    const body = JSON.parse(String(captured[0]!.init.body));
    const row = Array.isArray(body) ? body[0] : body;
    expect(Object.keys(row).sort()).toEqual(["response_payload", "reviewer", "submission_key"]);
    expect(row.reviewer).toBe("CD");
    expect(row.submission_key).toBe("session-key-0000000002");
    expect(row.response_payload).toEqual(response("CD"));
  });

  it("writes to whichever table it is given, and nothing chooses for it", async () => {
    captured.length = 0;
    await recordSubmission(SYNTHETIC_TABLE, "session-key-0000000003", response());
    expect(new URL(captured[0]!.url).pathname).toBe(`/rest/v1/${SYNTHETIC_TABLE}`);
    expect(SYNTHETIC_TABLE).not.toBe(REAL_TABLE);
  });
});
