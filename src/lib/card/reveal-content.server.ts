/**
 * The reveal's words on the server (`spec.md §7.3`; `docs/card-system.md §2.5`, §4.2): runs the
 * fit check on the prompt-stated facts the card could show, then gives `revealCardContent`
 * (`facts.ts`, pure) the answers. Every server caller — the artwork stage's ink (`run.server.ts`),
 * the reveal (`loadRevealedCard`) and the live corpus — takes the card's words from here, so a
 * prompt-stated value is shown only when the entry check and the fit check both accept it, exactly
 * as if the host had typed it into the details form.
 *
 * The fit check measures the value in its slot beside the worst case for every other slot
 * (`cardTextFitsEveryDesign`), in every distinct zone of the layout set and every curated pairing —
 * exactly what the details form's server check measures (`src/lib/events/card-text-fit.server.ts`),
 * so a value the card shows is one the host can confirm unchanged, and it fits any design or shape
 * the event moves to later. When the form measures beside the active design's own invitation line
 * (`docs/card-system.md §2.5`, from Phase 5), this check follows it. Deterministic, no model call
 * (`spec.md §32 #20`).
 */

import "server-only";

import { cardTextFitsEveryDesign } from "./entry-fit.server";
import {
  promptFactCandidates,
  revealCardContent,
  type PromptFactSlot,
  type RevealCardContent,
  type RevealCardContentInput,
} from "./facts";

export type RevealContentInput = Omit<RevealCardContentInput, "fits">;

/**
 * The fit check's answers for the prompt-stated candidates of `input`, as the predicate
 * `revealCardContent` takes. Rejects only if the fonts cannot be loaded.
 */
export async function promptFactFit(
  input: RevealContentInput,
): Promise<(slot: PromptFactSlot, value: string) => boolean> {
  const candidates = promptFactCandidates(input);
  const accepted = new Map<PromptFactSlot, string>();
  for (const [slot, value] of Object.entries(candidates) as [PromptFactSlot, string][]) {
    if (await cardTextFitsEveryDesign(slot, value)) accepted.set(slot, value);
  }
  return (slot, value) => accepted.get(slot) === value;
}

/** The words the card shows right after generation, and the slots that need confirmation. */
export async function revealContentFor(input: RevealContentInput): Promise<RevealCardContent> {
  return revealCardContent({ ...input, fits: await promptFactFit(input) });
}
