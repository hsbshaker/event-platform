import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The anonymous reviewer capability for the Human Test #1 survey.
 *
 * `AGENTS.md`: "`admin.ts` (service role, bypasses RLS) only after the caller has been
 * authorized with `src/lib/auth` and only for server-managed tables." Five reviewers must be
 * able to answer from one link with no account and no sign-in, so there is no user to
 * authorize — but "no account" is not the same as "no authorization", and the repository
 * already has the pattern for exactly this case.
 *
 * `src/lib/drafts/store.ts` writes an anonymous visitor's pre-auth draft with the service role,
 * and it is allowed to because every one of those writes happens *after the module has resolved
 * the caller's opaque server-issued token to its stored hash*: the table is server-only, and the
 * service role's authority is narrowed to the single row that token names. The capability is the
 * authorization; the absence of an account is incidental.
 *
 * This is the same shape, one size smaller. The server issues an opaque capability; the page
 * presents it; this module resolves it before anything reaches `createAdminClient`. It is keyed
 * with `APP_ENCRYPTION_KEY` and domain-separated from draft tokens, so a token minted for one
 * purpose cannot be spent on the other.
 *
 * # Why the nonce is also the submission key
 *
 * The row a submission writes is addressed by `submission_key`, and the store upserts on it. If
 * the client chose that key, then anyone could name any row — including another reviewer's — and
 * overwrite their answers, because an upsert replaces rather than refuses. So the key is not the
 * client's to choose: it is the nonce inside a capability only this server can mint. Idempotency
 * is unchanged, because one survey session holds one capability and therefore one key.
 *
 * # What it does and does not claim
 *
 * It proves a submission came from a capability this deployment issued, within its validity
 * window, naming a row the holder alone can address. It is not a proof of humanity and does not
 * pretend to be: nothing short of an account is, and the brief rules accounts out. It is the
 * boundary that keeps a public path from handing the service role an unbounded, caller-named
 * write — which is the thing `AGENTS.md` is protecting.
 *
 * Stateless on purpose: the alternative is a table of issued capabilities, which would be a
 * second place for a five-row experiment to go wrong, and would need its own cleanup job.
 */

/** Capability format version, so a future change is a rejection rather than a misreading. */
const VERSION = "v1";
/** 32 bytes: the same strength as a draft token, and the same base64url spelling. */
const NONCE_BYTES = 32;
/**
 * How long a capability stays spendable.
 *
 * Long enough that a reviewer can open the link, study two sheets carefully, be interrupted, and
 * still submit — the task genuinely takes a while, and an expiry that beat a coffee break would
 * be a broken survey rather than a secure one. Short enough that a capability scraped from a
 * page is not a permanent write ticket.
 */
export const CAPABILITY_TTL_MS = 12 * 60 * 60 * 1000;

export interface IssuedCapability {
  /** The opaque string the page holds and presents. */
  readonly capability: string;
  /** When it stops being spendable, for the client to reason about. */
  readonly expiresAt: number;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`human-test-1-capability:${payload}`).digest("base64url");
}

/** Mints a capability. `now` is injectable so tests can pin expiry without touching the clock. */
export function issueCapability(key: string, now: number = Date.now()): IssuedCapability {
  const nonce = randomBytes(NONCE_BYTES).toString("base64url");
  const expiresAt = now + CAPABILITY_TTL_MS;
  const payload = `${VERSION}.${nonce}.${expiresAt}`;
  return { capability: `${payload}.${sign(payload, key)}`, expiresAt };
}

export type CapabilityRefusal = "malformed" | "unknown-version" | "bad-signature" | "expired";

export interface ResolvedCapability {
  readonly ok: true;
  /** The submission key. Server-issued: no caller ever chooses which row they write. */
  readonly submissionKey: string;
  readonly expiresAt: number;
}
export interface RefusedCapability {
  readonly ok: false;
  readonly reason: CapabilityRefusal;
}

/**
 * Resolves a presented capability, or refuses it.
 *
 * Fail-closed in every direction: anything that is not a well-formed, correctly signed,
 * unexpired capability minted by this deployment is refused, and the caller writes nothing. The
 * signature is compared in constant time, and the comparison happens before the expiry check so
 * a forged capability cannot be distinguished from a stale one by timing.
 */
export function resolveCapability(
  presented: unknown,
  key: string,
  now: number = Date.now(),
): ResolvedCapability | RefusedCapability {
  if (typeof presented !== "string" || presented.length > 400) {
    return { ok: false, reason: "malformed" };
  }
  const parts = presented.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [version, nonce, expiry, signature] = parts as [string, string, string, string];
  if (version !== VERSION) return { ok: false, reason: "unknown-version" };
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) return { ok: false, reason: "malformed" };
  if (!/^[0-9]{1,15}$/.test(expiry)) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(sign(`${version}.${nonce}.${expiry}`, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "bad-signature" };
  }

  const expiresAt = Number(expiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, submissionKey: nonce, expiresAt };
}
