import { createHmac, randomBytes } from "node:crypto";

/**
 * Co-host invite link tokens (`spec.md §6.2`, §27 "Co-host access is explicit and
 * invitation-based").
 *
 * The link is `/invite/<token>`: 32 random bytes, base64url. The database stores only the token's
 * keyed hash (`cohost_invitations.token_hash`), HMAC-SHA256 under `APP_ENCRYPTION_KEY` with its own
 * domain prefix, so a hash made for a draft or a rate-limit key can never match one. A presented
 * token is hashed before any query and looked up by its hash: there is no stored value to compare
 * in application code. The key is passed in so this module stays pure and testable.
 *
 * Tokens are never logged: callers log an error's name and code only.
 */
export const INVITE_TOKEN_BYTES = 32;

/** How long a link works (`create_cohost_invitation` sets the same 7 days in the database). */
export const INVITE_TTL_DAYS = 7;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(token: string, key: string): Buffer {
  return createHmac("sha256", key).update(`cohost-invite:${token}`).digest();
}

/** A string that could be a token: 43 base64url characters (32 bytes, unpadded). */
export function isWellFormedInviteToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

/** The invite page's path for a token. */
export function invitePath(token: string): string {
  return `/invite/${token}`;
}

/**
 * Whether `value` is exactly an invite page's path. The only destination the sign-in actions carry
 * through authentication (the auth callback's `next`), so nothing else can ride along.
 */
export function isInvitePath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/invite/")) return false;
  return isWellFormedInviteToken(value.slice("/invite/".length));
}
