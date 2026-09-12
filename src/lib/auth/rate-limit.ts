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
