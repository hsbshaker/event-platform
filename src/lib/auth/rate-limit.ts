import "server-only";

import { createHmac } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { RateLimitedError } from "./errors";

export interface RateLimitRule {
  bucket: string;
  windowSeconds: number;
  max: number;
}

/**
 * Backend abuse limits (spec.md §10, §27). Keys (IP addresses, phone numbers,
 * account ids) are HMAC-hashed before storage so the counters table never holds
 * raw identifiers.
 */
export function hashRateLimitKey(key: string): Buffer {
  return createHmac("sha256", serverEnv().APP_ENCRYPTION_KEY).update(`rate:${key}`).digest();
}

/** Consumes one unit; returns whether the request is within the limit. */
export async function consumeRateLimit(rule: RateLimitRule, key: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_bucket: rule.bucket,
    p_key_hash: `\\x${hashRateLimitKey(key).toString("hex")}`,
    p_window_seconds: rule.windowSeconds,
    p_max: rule.max,
  });
  if (error) throw error;
  return data === true;
}

/** Consumes one unit or throws `RateLimitedError`. */
export async function enforceRateLimit(rule: RateLimitRule, key: string): Promise<void> {
  if (!(await consumeRateLimit(rule, key))) throw new RateLimitedError(rule.bucket);
}

/** Signup throttling (spec.md §10): per requester IP, sliding into fixed windows. */
export const SIGNUP_PER_IP: RateLimitRule = { bucket: "signup:ip", windowSeconds: 3600, max: 10 };
export const SIGNUP_PER_IP_DAILY: RateLimitRule = {
  bucket: "signup:ip:day",
  windowSeconds: 86_400,
  max: 30,
};

export async function enforceSignupThrottle(ip: string): Promise<void> {
  await enforceRateLimit(SIGNUP_PER_IP, ip);
  await enforceRateLimit(SIGNUP_PER_IP_DAILY, ip);
}

/* ------------------------------------------------------- concept-batch caps (§H.2, spec.md §10) */

/**
 * Batch-level safety limits, consumed **when a batch is planned**.
 *
 * `docs/phase-4b-plan.md §H.2` row 2: the same `rate_limits` fixed-window table (`spec.md §10`,
 * `§27`), consumed at plan time rather than when an identity call is made. There is no second
 * limiter — these are declared here so one file names every bucket, and
 * `public.plan_generation_batch` consumes them through `public.consume_rate_limit`, the same
 * function `consumeRateLimit` above calls.
 *
 * They are consumed **inside** that function rather than through `consumeRateLimit` per rule,
 * because that helper spends one bucket per round trip: checking three limits that way would
 * consume the first two before the third refuses, and a refused host would silently lose quota.
 * The RPC consumes all three in one subtransaction, so a refusal rolls back everything it touched.
 *
 * Defaults, not policy. `spec.md §10` requires these to be configurable backend safety limits and
 * is explicit that creative work stays "effectively unlimited from the user's perspective"; the
 * environment overrides live in `src/lib/generation/batch.ts` beside the rest of the batch
 * configuration, and nothing here is ever surfaced, counted down or named in a response
 * (`spec.md §32 #41`).
 */

/** Per-event daily batch cap. Event-level, so it spans the owner and every co-host (`spec.md §6`). */
export const BATCH_PER_EVENT_DAILY: RateLimitRule = {
  bucket: "batch:event:day",
  windowSeconds: 86_400,
  max: 12,
};

/** Per-account daily batch cap, on the **acting** collaborator rather than the owner. */
export const BATCH_PER_ACCOUNT_DAILY: RateLimitRule = {
  bucket: "batch:account:day",
  windowSeconds: 86_400,
  max: 24,
};

/** Short-window anti-abuse limit on the acting collaborator. */
export const BATCH_PER_ACCOUNT_RATE: RateLimitRule = {
  bucket: "batch:account:rate",
  windowSeconds: 60,
  max: 4,
};
