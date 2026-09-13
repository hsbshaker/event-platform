import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env";
import { INSPIRATION_BUCKET } from "@/lib/drafts/inspiration";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Expires abandoned pre-auth state (spec.md §7.2 "temporary pre-auth assets remain private,
 * expire automatically if abandoned"; §27 "short raw-file retention"; §31 "abandoned pre-auth
 * draft/assets expire and remain private").
 *
 * One page of expired unclaimed drafts at a time, under a cutoff fixed for the whole run:
 * read the page's drafts *and* their storage keys, delete those objects, then purge exactly
 * those drafts (assets cascade). Only the drafts whose objects this run has already removed
 * are ever deleted, so a run that stops anywhere — a crash, or the time budget below — leaves
 * rows pointing at missing objects, which the next run clears. It never leaves an object that
 * no row names, which nothing could clear.
 *
 * Paging is not an optimization: read through the Data API, an unpaged key list is silently
 * capped by `max_rows` (supabase/config.toml) while an unpaged purge deletes every expired
 * draft, so past that cap private files were orphaned in the bucket by the very job meant to
 * remove them (spec.md §27 short raw-file retention).
 *
 * Scheduling is a deployment concern: `vercel.json` runs it daily. It is also safe to call by
 * hand. Requires CRON_SECRET, so it is not a public endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  let secret: string | undefined;
  try {
    secret = cronSecret();
  } catch (error) {
    // A malformed secret is an operator problem, not something to tell an anonymous prober
    // about. Fail closed exactly as an unset one does — a 404, not a 500 that would confirm
    // this route exists — and make the misconfiguration loud in the logs instead.
    console.error("purge-pre-auth: CRON_SECRET is set but invalid", error);
    return false;
  }
  if (!secret) return false;
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The cutoff is this process's clock, but `purge_pre_auth_drafts` refuses a cutoff in
 * the database's future. A few hundred milliseconds of skew between the two would fail the
 * purge *after* the objects were already deleted, so the cutoff is pulled back by a margin
 * comfortably larger than any skew we would tolerate. Rows a minute younger than the cutoff
 * simply wait for the next run.
 */
const CLOCK_SKEW_MARGIN_MS = 60_000;

/**
 * Reports the failing stage and the database's own error code to the caller, who by
 * definition already holds `CRON_SECRET`. A bare 500 leaves a scheduled job with nothing to
 * act on. The message is logged but never returned, so nothing about the schema leaks.
 */
function failed(stage: string, error: unknown): NextResponse {
  const code = (error as { code?: string } | null)?.code ?? null;
  console.error(`purge-pre-auth failed at ${stage}`, error);
  return NextResponse.json({ ok: false, stage, code }, { status: 500 });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    return await purge();
  } catch (error) {
    // Nothing reaches here but a misconfigured environment or a client that could not be
    // built; either way a scheduled job needs to be told, not handed a bare 500. The env
    // module's message names the offending variables and never their values, and the caller
    // already holds CRON_SECRET, so naming them is what makes this actionable.
    const detail = error instanceof Error ? error.message : null;
    console.error("purge-pre-auth failed at setup", error);
    return NextResponse.json({ ok: false, stage: "setup", detail }, { status: 500 });
  }
}

/**
 * A page is bounded by drafts, not by keys, so it cannot be truncated part-way through a
 * draft. `attach_inspiration_asset` refuses an expired unclaimed draft, so no asset can appear
 * in one of these drafts between the two phases.
 */
const DRAFT_PAGE_SIZE = 200;
/** Storage takes the keys of a whole page in chunks rather than one very long request. */
const STORAGE_REMOVE_CHUNK = 250;
/**
 * Well inside `maxDuration`, and checked between pages so a page is never cut in half. Running
 * out of budget is not a failure: the response says the sweep is incomplete and the next run
 * picks up where this one stopped.
 */
const TIME_BUDGET_MS = 45_000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function purge(): Promise<NextResponse> {
  const cutoff = new Date(Date.now() - CLOCK_SKEW_MARGIN_MS).toISOString();
  const admin = createAdminClient();
  const deadline = Date.now() + TIME_BUDGET_MS;

  let objectsRemoved = 0;
  let draftsPurged = 0;
  let pages = 0;
  let complete = false;

  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc("expired_pre_auth_draft_batch", {
      p_cutoff: cutoff,
      p_limit: DRAFT_PAGE_SIZE,
    });
    if (error) return failed("list_expired_drafts", error);
    const page = data ?? [];
    if (page.length === 0) {
      complete = true;
      break;
    }
    pages += 1;

    const keys = page.flatMap((row) => row.storage_keys ?? []);
    for (const batch of chunk(keys, STORAGE_REMOVE_CHUNK)) {
      const { error: removeError } = await admin.storage.from(INSPIRATION_BUCKET).remove(batch);
      if (removeError) return failed("remove_objects", removeError);
      objectsRemoved += batch.length;
    }

    const { data: purged, error: purgeError } = await admin.rpc("purge_pre_auth_drafts", {
      p_cutoff: cutoff,
      p_draft_ids: page.map((row) => row.draft_id),
    });
    if (purgeError) return failed("purge_rows", purgeError);
    draftsPurged += purged ?? 0;
    // A page that deletes nothing would be read again forever. Another run holding the same
    // cutoff is the benign explanation; either way this run has stopped making progress.
    if ((purged ?? 0) === 0) break;
  }

  const { data: counters, error: countersError } = await admin.rpc("purge_stale_rate_limits");
  if (countersError) return failed("purge_rate_limits", countersError);

  return NextResponse.json({
    ok: true,
    cutoff,
    complete,
    pages,
    objectsRemoved,
    draftsPurged,
    countersPurged: counters ?? 0,
  });
}
