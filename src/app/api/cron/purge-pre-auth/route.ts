import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { INSPIRATION_BUCKET } from "@/lib/drafts/inspiration";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Expires abandoned pre-auth state (spec.md §7.2 "temporary pre-auth assets remain private,
 * expire automatically if abandoned"; §27 "short raw-file retention"; §31 "abandoned pre-auth
 * draft/assets expire and remain private").
 *
 * Two phases with one shared cutoff, as the Phase 1 functions require: list the storage keys
 * of assets on expired unclaimed drafts and delete those objects first, then purge the rows
 * (assets cascade with their draft) and stale rate-limit counters. Crashing between the two
 * leaves rows pointing at missing objects, which the next run clears; it never leaves objects
 * without rows.
 *
 * Scheduling is a deployment concern: `vercel.json` runs it daily. It is also safe to call by
 * hand. Requires CRON_SECRET, so it is not a public endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The cutoff is this process's clock, but `purge_expired_pre_auth_state` refuses a cutoff in
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

async function purge(): Promise<NextResponse> {
  const cutoff = new Date(Date.now() - CLOCK_SKEW_MARGIN_MS).toISOString();
  const admin = createAdminClient();

  const { data: keys, error: keysError } = await admin.rpc("expired_pre_auth_storage_keys", {
    p_cutoff: cutoff,
  });
  if (keysError) return failed("list_storage_keys", keysError);

  const storageKeys = (keys ?? []) as unknown as string[];
  let objectsRemoved = 0;
  if (storageKeys.length > 0) {
    const { error } = await admin.storage.from(INSPIRATION_BUCKET).remove(storageKeys);
    if (error) return failed("remove_objects", error);
    objectsRemoved = storageKeys.length;
  }

  const { data: purged, error: purgeError } = await admin.rpc("purge_expired_pre_auth_state", {
    p_cutoff: cutoff,
  });
  if (purgeError) return failed("purge_rows", purgeError);

  return NextResponse.json({ ok: true, cutoff, objectsRemoved, draftsPurged: purged ?? 0 });
}
