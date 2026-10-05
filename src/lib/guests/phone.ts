/**
 * Guest phone numbers (`spec.md §12.2`, §13.3 "International SMS remains out of scope"): US and
 * Canadian (NANP) numbers only, stored in E.164 (`+1` and ten digits). The database holds the same
 * rule (`guest_parties.phone`): an area code and an exchange that each start with 2–9.
 *
 * Pure, so the party editor, the CSV import preview and the server agree on what a number is.
 */

const E164_NANP = /^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/;

/**
 * The E.164 form of a typed US or Canadian number, or null when it is not one.
 *
 * Accepts digits with spaces, dashes, dots and parentheses between them, and an optional leading
 * `1` or `+1`. Anything else — letters, an extension, another country code, too few or too many
 * digits — is not a number we can text, so it is null rather than guessed at.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Only the separators people type, and one leading plus.
  if (!/^\+?[0-9\s().-]+$/.test(trimmed)) return null;
  const plus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  else if (plus) return null; // a `+` must be followed by the country code 1
  if (digits.length !== 10) return null;
  const e164 = `+1${digits}`;
  return E164_NANP.test(e164) ? e164 : null;
}

/** Whether `value` is a stored phone: E.164, NANP. */
export function isE164Nanp(value: string): boolean {
  return E164_NANP.test(value);
}

/** A stored phone as people read it: `(512) 555-0123`. Anything else is returned as it is. */
export function formatPhone(e164: string): string {
  if (!E164_NANP.test(e164)) return e164;
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
