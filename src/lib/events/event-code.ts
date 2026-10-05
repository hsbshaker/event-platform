/**
 * The private event code's form (`spec.md §14.2`: "a reasonably strong random human-shareable
 * code, not a trivial 4-digit PIN"): eight characters from an alphabet with nothing a guest could
 * misread or mistype — no 0/O, 1/I/L — shown as `XXXX-XXXX`. 31 characters over 8 places is about
 * 8.5 × 10¹¹ codes (≈ 40 bits); with guest attempts rate-limited (§14.2) that is far out of reach
 * of guessing, and still easy to read aloud or type from a text.
 *
 * Pure and isomorphic: generation (`crypto.randomInt`) and encryption live in
 * `access-code-crypto.server.ts`.
 */

/**
 * The id of the details editor's `Make a code` control, which the setup checklist's "Private event
 * code" row focuses (`publishReadiness`, `PrivacyControl`).
 */
export const MAKE_EVENT_CODE_ID = "event-code-make";

export const EVENT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const EVENT_CODE_LENGTH = 8;

const VALID = new RegExp(`^[${EVENT_CODE_ALPHABET}]{${EVENT_CODE_LENGTH}}$`);

/**
 * A code as a guest might type it, in its canonical form (eight characters of the alphabet,
 * uppercase, no separators), or null when it cannot be a code. Case, spaces and dashes (any
 * dash a phone keyboard may substitute) are ignored, so `abcd efgh`, `ABCD–EFGH` and `abcdefgh`
 * are the same code.
 */
export function normaliseEventCode(input: string): string | null {
  const canonical = input.toUpperCase().replace(/[\s\-‐‑‒–—―]/g, "");
  return VALID.test(canonical) ? canonical : null;
}

/** The canonical code as hosts share it: `XXXX-XXXX`. */
export function formatEventCode(canonical: string): string {
  if (!VALID.test(canonical)) throw new Error("Not a canonical event code.");
  return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}
