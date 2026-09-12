import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pre-auth draft tokens (spec.md §7.2, design-system.md §4.2).
 *
 * The client keeps the opaque token (cookie or storage) across the auth redirect;
 * the database stores only its keyed hash (`pre_auth_event_drafts.draft_token_hash`).
 * The key is `APP_ENCRYPTION_KEY`, passed in so this module stays pure and testable.
 */
export const DRAFT_TOKEN_BYTES = 32;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function generateDraftToken(): string {
  return randomBytes(DRAFT_TOKEN_BYTES).toString("base64url");
}

export function hashDraftToken(token: string, key: string): Buffer {
  return createHmac("sha256", key).update(`draft:${token}`).digest();
}

/** Constant-time comparison of a presented token against a stored hash. */
export function draftTokenMatches(token: string, storedHash: Uint8Array, key: string): boolean {
  const presented = hashDraftToken(token, key);
  if (presented.length !== storedHash.length) return false;
  return timingSafeEqual(presented, storedHash);
}

export function isWellFormedDraftToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
