import { createHash, createHmac, hkdfSync } from "node:crypto";

/**
 * Personal invitation links (`spec.md §12.5`; §32 #37: "signed, scoped to event + party,
 * rotatable, and never reveal another party").
 *
 * Every party has one active link row (`party_invite_links`), made with the party. The link's
 * token is never stored: it is derived from the row's id, `base64url(HMAC-SHA256(K_link,
 * "party-link:v1:" + linkId))` — 43 characters, 256 bits — so the server can show the host the
 * same link whenever they copy it, and nobody holding the database (or a backup) can make one.
 * `K_link` is an HKDF-SHA256 subkey of `APP_ENCRYPTION_KEY` under a label of its own, so the
 * secret that keys other HMACs and the event-code cipher is never this key.
 *
 * The row stores `token_hash`, the hex SHA-256 of the token: the token already carries 256 bits
 * of entropy, so an unkeyed hash is enough for the guest route to look a presented token up. The
 * row ties the token to its event and party; rotating revokes the row and makes another, so the
 * old token stops resolving.
 *
 * The key is passed in, so this module stays pure and testable; `guests.server.ts` reads it
 * from the environment. Tokens are never logged.
 */

const HKDF_SALT = "event-platform";
const HKDF_INFO = "party-invite-link:hmac-sha256:v1";
const TOKEN_PREFIX = "party-link:v1:";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The link key, derived from `APP_ENCRYPTION_KEY` (base64). */
export function partyLinkKey(appEncryptionKey: string): Buffer {
  const master = Buffer.from(appEncryptionKey, "base64");
  return Buffer.from(hkdfSync("sha256", master, HKDF_SALT, HKDF_INFO, 32));
}

/** The token of the link row `linkId` (its id in canonical lowercase form). */
export function partyLinkToken(linkId: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update(`${TOKEN_PREFIX}${linkId.toLowerCase()}`)
    .digest("base64url");
}

/** What `party_invite_links.token_hash` holds for a token: hex SHA-256. */
export function hashPartyLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A string that could be a token: 43 base64url characters. */
export function isWellFormedPartyLinkToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

export { personalLinkPath } from "./link-path";
