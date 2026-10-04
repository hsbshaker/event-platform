/**
 * Wording fact check and standard wording (`docs/card-system.md §4.1`,
 * `docs/model-contracts.md §5.4`).
 *
 * Model-drafted wording (`title`, `invitationLine`) must not state a fact: facts come only from
 * the host (`spec.md §32 #15`). This check is deterministic; a host-supplied title is never
 * checked or replaced. A failing slot earns one re-prompt, then `standardWording`.
 */

import type { WordingSlotId } from "./slots";
import { WORDING_SLOT_IDS } from "./slots";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  // "may" is left out: as a word it is far more often a verb, and a May date needs a digit anyway.
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/**
 * Name facts may appear in model-drafted wording, exactly as the host supplied them
 * (`docs/model-contracts.md §5.4`); whether a name is spelled exactly is caught by the evaluation
 * corpus, not here. `eventType` is expected in the wording ("a baby shower").
 */
const ALLOWED_FACT_KEYS = new Set(["eventType", "hosts", "babyName", "honoree"]);

export interface WordingFailure {
  slot: WordingSlotId;
  reason: string;
}

/**
 * @param wording the model-drafted wording slots
 * @param eventFacts host-supplied fact strings by key (name, venue, date, ...). `eventType` and
 *   name facts are exempt (`ALLOWED_FACT_KEYS`); every other supplied fact is rejected.
 */
export function checkWording(
  wording: Readonly<Record<WordingSlotId, string>>,
  eventFacts: Readonly<Record<string, string | null | undefined>> = {},
): WordingFailure[] {
  const failures: WordingFailure[] = [];
  for (const slot of WORDING_SLOT_IDS) {
    const value = wording[slot];
    const lower = value.toLowerCase();
    if (/\d/.test(value)) failures.push({ slot, reason: `${slot} contains a digit` });
    for (const m of MONTHS) {
      if (new RegExp(`\\b${m}\\b`).test(lower)) {
        failures.push({ slot, reason: `${slot} names a month (${m})` });
      }
    }
    for (const d of WEEKDAYS) {
      if (lower.includes(d)) failures.push({ slot, reason: `${slot} names a weekday (${d})` });
    }
    // Bare "am"/"pm" are left out ("I am so happy"); a written time like "7pm" has a digit anyway.
    if (/\b(a\.m\.?|p\.m\.?|noon|o'clock|midnight)(?![a-z])/.test(lower)) {
      failures.push({ slot, reason: `${slot} contains a time expression` });
    }
    for (const [key, fact] of Object.entries(eventFacts)) {
      const f = fact?.trim().toLowerCase();
      if (!ALLOWED_FACT_KEYS.has(key) && f && lower.includes(f)) {
        failures.push({ slot, reason: `${slot} states the fact ${key}` });
      }
    }
  }
  return failures;
}

const BABY_SHOWER = /^\s*baby shower\s*$/i;

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/gi, (c) => c.toUpperCase());
}

function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/**
 * Standard wording used when model-drafted wording fails the fact check twice
 * (`docs/card-system.md §4.1`): baby shower -> "A Baby Shower" / "Please join us for a baby shower".
 *
 * Only the baby shower copy is specified. For any other event type this builds the same pattern
 * from the host's event type string ("A Retirement Party" / "Please join us for a retirement
 * party") and invents no other copy. The result is not truncated; the event type is bounded
 * upstream and the text is editable by the host.
 */
export function standardWording(eventType: string): Record<WordingSlotId, string> {
  const noun = BABY_SHOWER.test(eventType)
    ? "baby shower"
    : eventType.trim().replace(/\s+/g, " ").toLowerCase();
  return {
    title: titleCase(withArticle(noun)),
    invitationLine: `Please join us for ${withArticle(noun)}`,
  };
}
