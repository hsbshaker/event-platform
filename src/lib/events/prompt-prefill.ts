/**
 * What the details form offers from the facts the host's prompt states (`events.prompt_facts`,
 * `spec.md §7.3`; `docs/screen-spec.md` `generation`): a value shown pre-filled and marked
 * "From your description" for the host to confirm, never saved until they confirm or edit it.
 *
 * Only the words the card can show: hosts, the honoree (the baby's name), the venue and the
 * location (the address). The date and time are free text as the host wrote them ("December 19",
 * "2pm") and are never parsed: they are only repeated beside the empty picker as a hint. A field
 * the event already has a value for is never offered a suggestion. Pure.
 */

import type { PromptFacts } from "@/lib/card/facts";

export const PREFILL_FIELDS = ["hosts", "babyName", "venueName", "address"] as const;
export type PrefillField = (typeof PREFILL_FIELDS)[number];

export interface PrefillCurrent {
  hosts: string | null;
  babyName: string | null;
  venueName: string | null;
  address: string | null;
  eventDate: string | null;
  startTime: string | null;
}

export interface PromptPrefill {
  /** The stated value per empty field, as the host wrote it (one line). */
  fields: Partial<Record<PrefillField, string>>;
  /** What the prompt said for the date and time, when their pickers are empty. */
  hints: { date: string | null; time: string | null };
}

const SOURCE: Readonly<Record<PrefillField, keyof PromptFacts>> = {
  hosts: "hosts",
  babyName: "honoree",
  venueName: "venue",
  address: "location",
};

function oneLine(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

export function promptPrefill(
  promptFacts: PromptFacts | null,
  current: PrefillCurrent,
): PromptPrefill {
  const fields: PromptPrefill["fields"] = {};
  if (!promptFacts) return { fields, hints: { date: null, time: null } };
  for (const field of PREFILL_FIELDS) {
    if (oneLine(current[field]) !== null) continue;
    const stated = oneLine(promptFacts[SOURCE[field]]);
    if (stated !== null) fields[field] = stated;
  }
  return {
    fields,
    hints: {
      date: oneLine(current.eventDate) === null ? oneLine(promptFacts.date) : null,
      time: oneLine(current.startTime) === null ? oneLine(promptFacts.time) : null,
    },
  };
}
