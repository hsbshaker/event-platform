import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { serverEnv } from "@/lib/env";
import { EVENT_CODE_ALPHABET, EVENT_CODE_LENGTH, normaliseEventCode } from "./event-code";

/**
 * The private event code at rest (`spec.md §14.2`, §27: "one encrypted-at-rest representation
 * only; server-side reveal and validation; constant-time comparison; never logged").
 *
 * - **Key**: a 256-bit subkey derived from `APP_ENCRYPTION_KEY` with HKDF-SHA256 under a label of
 *   its own, so the secret that keys the draft-token and rate-limit HMACs is never itself a cipher
 *   key (`src/lib/env.ts`).
 * - **Cipher**: AES-256-GCM with a fresh random 96-bit IV per encryption.
 * - **Layout** (`events.access_code_encrypted`, bytea): `0x01 | iv (12) | tag (16) | ciphertext`.
 *   The leading byte is the format version, so a later key or cipher can be introduced beside this
 *   one and old values still read.
 * - **Binding**: the version byte and the event's id are authenticated as additional data, so a
 *   value copied from another event's row (or with its version byte changed) fails to decrypt
 *   instead of opening the wrong invitation.
 *
 * Nothing here logs, and no error message carries a code or key material.
 */

export const ACCESS_CODE_FORMAT_V1 = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;
const HKDF_SALT = "event-platform";
const HKDF_INFO = "event-access-code:aes-256-gcm:v1";

/** Encryption or decryption failed. The message never contains the code. */
export class AccessCodeCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessCodeCryptoError";
  }
}

function accessCodeKey(): Buffer {
  const master = Buffer.from(serverEnv().APP_ENCRYPTION_KEY, "base64");
  return Buffer.from(hkdfSync("sha256", master, HKDF_SALT, HKDF_INFO, 32));
}

function additionalData(version: number, eventId: string): Buffer {
  return Buffer.concat([Buffer.from([version]), Buffer.from(`event:${eventId}`, "utf8")]);
}

/** A new code in canonical form (eight characters of the unambiguous alphabet). */
export function generateEventCode(): string {
  let code = "";
  for (let i = 0; i < EVENT_CODE_LENGTH; i += 1) {
    code += EVENT_CODE_ALPHABET[randomInt(EVENT_CODE_ALPHABET.length)];
  }
  return code;
}

/** Encrypts a canonical code for `eventId`'s row. */
export function encryptEventCode(canonical: string, eventId: string): Buffer {
  if (normaliseEventCode(canonical) !== canonical) {
    throw new AccessCodeCryptoError("Only a canonical event code is stored.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", accessCodeKey(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(ACCESS_CODE_FORMAT_V1, eventId));
  const ciphertext = Buffer.concat([cipher.update(canonical, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([ACCESS_CODE_FORMAT_V1]), iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Decrypts `eventId`'s stored value to its canonical code. Throws `AccessCodeCryptoError` for an
 * unknown version, a truncated value, a value made for another event, or any tampering (the GCM
 * tag is verified before anything is returned).
 */
export function decryptEventCode(stored: Uint8Array, eventId: string): string {
  const blob = Buffer.from(stored);
  if (blob.length <= HEADER_BYTES)
    throw new AccessCodeCryptoError("Stored event code is too short.");
  const version = blob[0];
  if (version !== ACCESS_CODE_FORMAT_V1) {
    throw new AccessCodeCryptoError("Stored event code has an unknown format version.");
  }
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, HEADER_BYTES);
  const ciphertext = blob.subarray(HEADER_BYTES);
  let plaintext: string;
  try {
    const decipher = createDecipheriv("aes-256-gcm", accessCodeKey(), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(additionalData(version, eventId));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Deliberately not chained: the cause can carry buffers.
    throw new AccessCodeCryptoError("Stored event code failed authentication.");
  }
  if (normaliseEventCode(plaintext) !== plaintext) {
    throw new AccessCodeCryptoError("Stored event code is not a canonical code.");
  }
  return plaintext;
}

/**
 * Whether what a guest typed is the event's code (`spec.md §14.2`: "compares in constant time").
 * The typed value is normalised first (case, spaces, dashes). Both sides are hashed to equal-length
 * digests and compared with `timingSafeEqual`, so neither the comparison nor an early length check
 * says how much of a guess was right. Attempt limits are the caller's (§14.2).
 */
export function eventCodesMatch(typed: string, canonical: string): boolean {
  const candidate = normaliseEventCode(typed);
  const a = createHash("sha256")
    .update(candidate ?? "\u0000")
    .digest();
  const b = createHash("sha256").update(canonical).digest();
  return timingSafeEqual(a, b) && candidate !== null;
}
