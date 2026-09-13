import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The purge job's paging (spec.md §7.2 abandoned pre-auth assets expire; §27 short raw-file
 * retention).
 *
 * The SQL is proven against real Postgres in tests/db/phase2.test.ts. What matters here is
 * the loop: it must keep going past one page, remove a page's objects before deleting that
 * page's rows, never delete rows for a page whose objects it failed to remove, and say so
 * when it stops before the work is done.
 */

const rpc = vi.fn();
const remove = vi.fn();
/** Every Storage/database call the route makes, in order. */
let calls: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => {
      calls.push(`rpc:${name}`);
      return rpc(name, args);
    },
    storage: {
      from: () => ({
        remove: (keys: string[]) => {
          calls.push(`remove:${keys.length}`);
          return remove(keys);
        },
      }),
    },
  }),
}));

const SECRET = "cron-secret-value";

type Page = { draft_id: string; storage_keys: string[] }[];

function draftPage(prefix: string, count: number, keysEach: number): Page {
  return Array.from({ length: count }, (_, i) => ({
    draft_id: `${prefix}-${i}`,
    storage_keys: Array.from({ length: keysEach }, (_, k) => `drafts/${prefix}-${i}/${k}.png`),
  }));
}

/** Serves the given pages in order, then empty pages. */
function servePages(pages: Page[], { purged }: { purged?: (page: Page) => number } = {}) {
  let next = 0;
  rpc.mockImplementation(async (name: string, args: { p_draft_ids?: string[] }) => {
    if (name === "expired_pre_auth_draft_batch") return { data: pages[next] ?? [], error: null };
    if (name === "purge_pre_auth_drafts") {
      const page = pages[next]!;
      next += 1;
      return { data: purged ? purged(page) : (args.p_draft_ids?.length ?? 0), error: null };
    }
    if (name === "purge_stale_rate_limits") return { data: 7, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
}

async function run(authorization: string | null = `Bearer ${SECRET}`) {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  const response = await GET(
    new NextRequest("https://events.test/api/cron/purge-pre-auth", { headers }),
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("CRON_SECRET", SECRET);
  remove.mockResolvedValue({ data: [], error: null });
  servePages([]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("purge-pre-auth", () => {
  it("is not a public endpoint", async () => {
    expect((await run(null)).status).toBe(404);
    expect((await run("Bearer wrong-secret")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps paging until no expired draft is left", async () => {
    // Three pages: the old single unpaged read stopped after the first, and purged the rest
    // anyway, leaving their objects in the bucket with no row naming them.
    servePages([draftPage("a", 2, 2), draftPage("b", 2, 2), draftPage("c", 1, 2)]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      complete: true,
      pages: 3,
      draftsPurged: 5,
      objectsRemoved: 10,
      countersPurged: 7,
    });
    // Every page removes its objects before its rows are deleted, and the run ends only when
    // a page comes back empty.
    expect(calls).toEqual([
      "rpc:expired_pre_auth_draft_batch",
      "remove:4",
      "rpc:purge_pre_auth_drafts",
      "rpc:expired_pre_auth_draft_batch",
      "remove:4",
      "rpc:purge_pre_auth_drafts",
      "rpc:expired_pre_auth_draft_batch",
      "remove:2",
      "rpc:purge_pre_auth_drafts",
      "rpc:expired_pre_auth_draft_batch",
      "rpc:purge_stale_rate_limits",
    ]);
  });

  it("never deletes a page's rows when its objects could not be removed", async () => {
    servePages([draftPage("a", 2, 2)]);
    remove.mockResolvedValue({ data: null, error: { message: "storage unavailable" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ ok: false, stage: "remove_objects" });
    expect(calls).toEqual(["rpc:expired_pre_auth_draft_batch", "remove:4"]);
  });

  it("reports an incomplete sweep instead of spinning on a page that deletes nothing", async () => {
    servePages([draftPage("a", 2, 1), draftPage("b", 2, 1)], { purged: () => 0 });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, complete: false, pages: 1, draftsPurged: 0 });
  });

  it("names the stage when the database refuses the purge", async () => {
    servePages([draftPage("a", 1, 1)]);
    rpc.mockImplementation(async (name: string) => {
      if (name === "expired_pre_auth_draft_batch") {
        return { data: draftPage("a", 1, 1), error: null };
      }
      return { data: null, error: { code: "P0001", message: "cutoff must not be in the future" } };
    });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ ok: false, stage: "purge_rows", code: "P0001" });
  });

  it("sweeps stale counters once, after the drafts", async () => {
    const { body } = await run();
    expect(body).toMatchObject({ ok: true, complete: true, pages: 0, countersPurged: 7 });
    expect(calls).toEqual(["rpc:expired_pre_auth_draft_batch", "rpc:purge_stale_rate_limits"]);
  });
});
