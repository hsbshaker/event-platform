import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env";
import {
  IDENTITY_EVIDENCE_RETENTION_DAYS,
  purgeIdentityResponseEvidence,
  sweepIdentityCallClaims,
} from "@/lib/generation/identity-claim";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Releases and recovers EventIdentity call claims, and ages out paid-response evidence.
 *
 * `docs/phase-4b-plan.md §A.5`–`§A.7`. This is the other half of the one-in-flight guard: that
 * index refuses every new identity call for an event while a claim is unsettled, and nothing
 * settles a claim whose process died between reserving it and recording a response. Shipping the
 * refusal without this would wedge such an event permanently.
 *
 * Three jobs, in order:
 *
 *   1. **expire** — a lease that elapsed with `provider_invoked_at` still null becomes
 *      `abandoned` (provably unpaid, so a retry may follow automatically); with it set, it becomes
 *      `expired_unknown` (possibly paid, so only an explicit host retry may follow);
 *   2. **complete** — a claim holding a captured paid response becomes its identity revision, by
 *      re-validating the stored text through the production validator. **No model call.**
 *   3. **purge** — evidence older than the retention window is dropped, keeping the run row, its
 *      metrics, and every run a non-terminal claim still needs.
 *
 * Scheduled every fifteen minutes in `vercel.json`, not daily: the claim lease is minutes, so a
 * daily cadence would leave an event unable to generate for up to a day after one crash. It is
 * also safe to call by hand, and idempotent — every step is a no-op when there is nothing to do.
 * Requires `CRON_SECRET`, so it is not a public endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bounded per run so a backlog is worked through over several runs rather than timing out. */
const EXPIRE_LIMIT = 200;
const COMPLETE_LIMIT = 50;

function authorized(request: NextRequest): boolean {
  let secret: string | undefined;
  try {
    secret = cronSecret();
  } catch (error) {
    // A malformed secret is an operator problem, not something to tell an anonymous prober about.
    // Fail closed exactly as an unset one does — a 404, not a 500 that would confirm the route
    // exists — and make the misconfiguration loud in the logs instead.
    console.error("identity-housekeeping: CRON_SECRET is set but invalid", error);
    return false;
  }
  if (!secret) return false;
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The database's own error code, which is what a scheduled job can act on. Never the message. */
function errorCode(error: unknown): string | null {
  return (error as { code?: string } | null)?.code ?? null;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    const detail = error instanceof Error ? error.message : null;
    console.error("identity-housekeeping failed at setup", error);
    return NextResponse.json({ ok: false, stage: "setup", detail }, { status: 500 });
  }

  // The purge runs whatever the sweep did.
  //
  // They are independent jobs that share a schedule, and the retention commitment must not be
  // hostage to a claim the sweep could not settle. Returning early on a sweep failure would have
  // meant one bad row stopping evidence retention deployment-wide, for as long as it sat there.
  let sweep: Awaited<ReturnType<typeof sweepIdentityCallClaims>> | null = null;
  let sweepError: unknown = null;
  try {
    sweep = await sweepIdentityCallClaims(admin, {
      expireLimit: EXPIRE_LIMIT,
      completeLimit: COMPLETE_LIMIT,
    });
  } catch (error) {
    sweepError = error;
    console.error("identity-housekeeping failed at sweep_claims", error);
  }

  let evidencePurged: number | null = null;
  let purgeError: unknown = null;
  try {
    evidencePurged = await purgeIdentityResponseEvidence(admin);
  } catch (error) {
    purgeError = error;
    console.error("identity-housekeeping failed at purge_evidence", error);
  }

  const body = {
    abandoned: sweep?.abandoned ?? 0,
    expiredUnknown: sweep?.expiredUnknown ?? 0,
    completed: sweep?.completed ?? 0,
    // A captured response that no longer validates, or one written under a schema version this
    // build has no reader for. Not an error to swallow: the text is still durable, and it
    // validated once before it was captured, so this means corruption.
    unrecoverable: sweep?.unrecoverable ?? 0,
    // Completions the database refused. Counted and stepped over, never allowed to stop the run.
    failed: sweep?.failed ?? 0,
    evidencePurged,
    retentionDays: IDENTITY_EVIDENCE_RETENTION_DAYS,
  };

  // A partial run reporting `ok` would be a lie, so the stage is named — but the counts the run
  // did achieve go back with it, because a scheduled job needs both.
  if (sweepError || purgeError) {
    return NextResponse.json(
      {
        ok: false,
        stage: sweepError ? "sweep_claims" : "purge_evidence",
        code: errorCode(sweepError ?? purgeError),
        ...body,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...body });
}
