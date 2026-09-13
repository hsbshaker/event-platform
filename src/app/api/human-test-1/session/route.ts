import { NextResponse, type NextRequest } from "next/server";

import { RateLimitedError } from "@/lib/auth/errors";
import { enforceRateLimit, type RateLimitRule } from "@/lib/auth/rate-limit";
import { serverEnv } from "@/lib/env";
import { issueCapability, renewCapability } from "@/lib/human-test/capability";

/**
 * Issues the anonymous reviewer capability the survey needs before it can submit
 * (`src/lib/human-test/capability.ts`).
 *
 * The survey at `/human-test-1` is a static page, so it asks for one on load. That is the whole
 * ceremony: no account, no sign-in, nothing a reviewer sees or has to understand. What it buys
 * is that `POST /api/human-test-1/submit` never hands the service role a row identifier a caller
 * chose — the row a submission addresses is named by a nonce only this deployment can mint.
 *
 * Same-origin only and rate limited, like the endpoint it feeds. Issuing is cheap and stateless
 * (an HMAC, no row), so the limit is a courtesy ceiling against a script rather than a
 * meaningful defence — the capability's value is that it cannot be forged, not that it is scarce.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUE_PER_IP: RateLimitRule = {
  bucket: "human_test_1:session:ip",
  windowSeconds: 3600,
  max: 60,
};

/** Mirrors the submit route: the page we serve, or nothing. */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requesterIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * POST rather than GET, for one concrete reason: browsers omit `Origin` on a same-origin GET
 * (the Fetch standard sets it only for methods other than GET/HEAD), so the origin check below
 * would refuse the page's own request. It also reads honestly — this mints something.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    console.warn("human-test-1/session refused: cross-origin or origin-less request");
    return NextResponse.json({ ok: false, error: "Not available." }, { status: 403 });
  }

  try {
    await enforceRateLimit(ISSUE_PER_IP, requesterIp(request));
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return NextResponse.json(
        { ok: false, error: "Too many requests from here. Try again in a few minutes." },
        { status: 429 },
      );
    }
    console.error("human-test-1/session failed", error);
    return NextResponse.json({ ok: false, error: "Not available." }, { status: 500 });
  }

  // A capability the caller already holds, offered for renewal. Renewing keeps its nonce, which
  // is what stops a reviewer who comes back after the TTL from being handed a new row identity
  // and writing a second response instead of correcting their own. Optional, bounded, and
  // ignored unless it verifies; the presenter already holds the nonce, so this grants nothing.
  let previous: unknown;
  try {
    const raw = await request.text();
    previous = raw ? (JSON.parse(raw) as { previous?: unknown }).previous : undefined;
  } catch {
    previous = undefined;
  }

  try {
    const key = serverEnv().APP_ENCRYPTION_KEY;
    const { capability, expiresAt } = renewCapability(previous, key) ?? issueCapability(key);
    // Never cached: two reviewers sharing a capability would share a row.
    return NextResponse.json(
      { ok: true, capability, expiresAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("human-test-1/session could not issue a capability", error);
    return NextResponse.json({ ok: false, error: "Not available." }, { status: 500 });
  }
}
