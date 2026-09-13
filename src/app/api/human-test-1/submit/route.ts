import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { RateLimitedError } from "@/lib/auth/errors";
import { enforceRateLimit, type RateLimitRule } from "@/lib/auth/rate-limit";
import { humanTest1TestSecret, serverEnv } from "@/lib/env";
import { resolveCapability } from "@/lib/human-test/capability";
import { MAX_SUBMISSION_BYTES, parseSubmission } from "@/lib/human-test/submission";
import { recordSubmission, REAL_TABLE, SYNTHETIC_TABLE } from "@/lib/human-test/store";

/**
 * Online submission for the Human Test #1 reviewer survey (`docs/human-test-1/README.md`).
 *
 * The survey at `/human-test-1` is a static page: reviewers open one link, work through the two
 * frozen sheets, and tap **Submit feedback**. This is the only thing that page talks to, and it
 * exists so nobody has to download a JSON file and send it back. It replaces the handoff and
 * nothing else — the stored payload is byte-for-byte the object `review.html` has always
 * produced, so the frozen scorer and the frozen key are untouched.
 *
 * # What it does not do
 *
 * It does not score. It never loads `proof-b/human-test-key.txt`, `proof-b/human-test-items.json`
 * or anything else that says which screens are model-authored, so no response it can return —
 * success, validation failure, or a 500 — can reveal the classification the test is measuring.
 * Scoring happens offline, later, with the service role, once five reviewers have answered.
 *
 * # Why the browser does not write to Supabase
 *
 * `human_test_1_responses` has RLS on and no policies, and every privilege is revoked from
 * `anon` and `authenticated`. There is no credential a reviewer's browser could hold that
 * reaches it. Writes happen here, with the service role, after the payload has been validated.
 *
 * # Protection, proportional to a five-person survey
 *
 * Same-origin only, no CORS headers at any point, a JSON content type, a 16 KB cap enforced on
 * the raw bytes, a strict schema that rejects unknown fields, per-IP rate limits, and a unique
 * submission key. No CAPTCHA: nothing here is worth defeating one for, and it would land on
 * five people who were asked a favour.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per requester IP. Five reviewers submit once each; the hourly ceiling is generous enough to
 * absorb a shared office address and several troubleshooting retries, and low enough that
 * nobody fills the table from a laptop.
 */
const SUBMIT_PER_IP: RateLimitRule = { bucket: "human_test_1:ip", windowSeconds: 3600, max: 20 };
const SUBMIT_PER_IP_DAILY: RateLimitRule = {
  bucket: "human_test_1:ip:day",
  windowSeconds: 86_400,
  max: 60,
};

/** Mirrors `src/app/api/inspiration/route.ts`. Used for throttling only; never stored. */
function requesterIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * The request must come from the page we serve.
 *
 * Browsers send `Origin` on every POST, so a missing one means something that is not a browser
 * form submission — refused rather than trusted. The comparison is against the host the request
 * was actually addressed to, which is what makes this work unchanged on localhost, on every
 * Vercel preview URL and on the production domain without a list to maintain. No CORS headers
 * are emitted anywhere in this file, so a cross-origin caller could not read a response even if
 * one were produced; this stops the write as well as the read.
 */
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

/**
 * Whether this submission is a synthetic verification request — and if it claims to be, whether
 * that claim is authorized.
 *
 * Three states rather than a boolean, because "not synthetic" and "claimed synthetic but could
 * not be authorized" are opposite situations that a boolean collapses into the same answer. That
 * collapse was a real defect: an earlier version caught a configuration error and returned
 * `false`, so an operator running the documented verification against a malformed
 * `HUMAN_TEST_1_TEST_SECRET` would have had their synthetic answers written into the
 * five-reviewer table — the one contamination the two-table design exists to prevent.
 *
 * So the invariant is: **a request that presents the header is never written as a real review.**
 * It is authorized and written to the synthetic table, or it is refused and written nowhere.
 *
 * The secret is consulted only when the header is present. A reviewer's submission carries no
 * header and does not depend on the secret at all, so a misconfigured operator secret cannot
 * take the survey down for the five people it exists for — and there is no code path in which a
 * parsing failure becomes "this is a real review".
 */
type SyntheticClaim = "absent" | "authorized" | "refused";

function syntheticClaim(request: NextRequest): SyntheticClaim {
  const presented = request.headers.get("x-human-test-mode");
  if (presented === null) return "absent";

  let secret: string | undefined;
  try {
    secret = humanTest1TestSecret();
  } catch (error) {
    // The schema in `src/lib/env.ts` is what rejects a malformed or trivially weak value
    // (AGENTS.md, "Secrets"). Refuse rather than reinterpret: the header says this was meant to
    // be synthetic, and we cannot establish that it is.
    console.error("human-test-1/submit: HUMAN_TEST_1_TEST_SECRET is set but invalid", error);
    return "refused";
  }
  if (!secret) return "refused";

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "refused";
  return "authorized";
}

/**
 * One generic shape for every refusal.
 *
 * The reviewer's browser validates the whole questionnaire before it submits, so a reviewer
 * never sees these; a caller who does is not one, and telling them which of several checks
 * failed helps only them. The detail is logged instead.
 */
function rejected(status: number, detail: string): NextResponse {
  console.warn(`human-test-1/submit rejected (${status}): ${detail}`);
  return NextResponse.json({ ok: false, error: "This submission could not be saved." }, { status });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return rejected(403, "cross-origin or origin-less request");

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.split(";")[0]!.trim().toLowerCase().startsWith("application/json")) {
    return rejected(415, `content type ${contentType || "(none)"}`);
  }

  // Cheap refusal first, then the authoritative one on the bytes actually read: a
  // `content-length` can be absent or wrong, so it is a shortcut and never the check.
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > MAX_SUBMISSION_BYTES) {
    return rejected(413, `declared ${declared} bytes`);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return rejected(400, "body could not be read");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_SUBMISSION_BYTES) {
    return rejected(413, `body of ${Buffer.byteLength(raw, "utf8")} bytes`);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rejected(400, "body is not JSON");
  }

  const parsed = parseSubmission(body);
  if (!parsed.ok) return rejected(400, parsed.detail);

  try {
    // Throttled after validation so a malformed flood is refused without burning a reviewer's
    // budget, and before *every* remaining decision — including the synthetic-secret check
    // below. Checking that first would have made this endpoint an unbounded, uncounted oracle
    // for guessing `HUMAN_TEST_1_TEST_SECRET`: a wrong value is a 403 and a right one a 200, and
    // neither would have touched the limiter. The secret is far too long to guess, but "too long
    // to guess" is not a reason to leave the attempt rate unbounded, and each try also writes a
    // log line.
    await enforceRateLimit(SUBMIT_PER_IP, requesterIp(request));
    await enforceRateLimit(SUBMIT_PER_IP_DAILY, requesterIp(request));

    // A claimed-but-unauthorized synthetic request stops here, before anything is written. It is
    // never downgraded to a real review: see `syntheticClaim`.
    const claim = syntheticClaim(request);
    if (claim === "refused") {
      return rejected(403, "synthetic-test authorization could not be established");
    }

    // The authorization boundary in front of the service role (AGENTS.md, "Supabase clients").
    // Resolved here, after the rate limit and before `recordSubmission`, so an unforgeable
    // server-issued capability — not a caller-chosen string — names the row that gets written.
    const capability = resolveCapability(parsed.value.capability, serverEnv().APP_ENCRYPTION_KEY);
    if (!capability.ok) return rejected(403, `capability ${capability.reason}`);

    const { submissionId } = await recordSubmission(
      claim === "authorized" ? SYNTHETIC_TABLE : REAL_TABLE,
      capability.submissionKey,
      parsed.value.response,
    );
    // Deliberately identical for a first submission and for a retry under the same capability:
    // the page shows one success state either way, and nothing here counts as a second reviewer.
    return NextResponse.json({ ok: true, submissionId });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions from here. Try again in a few minutes." },
        { status: 429 },
      );
    }
    console.error("human-test-1/submit failed", error);
    return NextResponse.json(
      { ok: false, error: "This submission could not be saved." },
      { status: 500 },
    );
  }
}
