/**
 * `concept_premise_input_v1` — the deterministic user message the ConceptPremise call is sent.
 *
 * `src/lib/ai/concept-premise/input.ts` declares the envelope's *contents*: the authoritative
 * creative brief, and nothing else. This file is the rendering of it.
 *
 * ## Why this file adds no model-visible string of its own
 *
 * The premise call is shown **the same brief** the three DesignIntent calls are shown, and it is
 * shown it the same way: the preamble, the markers and every field label are imported from
 * `./design-intent-input.ts` rather than restated. Two renderings of one object is how two stages
 * come to disagree about what the host was told — and since that file is the declared,
 * leakage-scanned home for those strings, reusing them keeps the scan's coverage exact instead of
 * spreading the same text across two surfaces.
 *
 * This file is registered as a model-visible surface anyway (`MODEL_VISIBLE_SURFACES`). It carries
 * nothing today and that is the point of registering it: the first string added here is scanned
 * from the moment it exists, rather than after someone has read a corpus.
 *
 * ## What the shape has to guarantee
 *
 * - **One channel, and only one.** There is no assignment block here, no facts block and no
 *   capability block, because a premise is authored from the one authoritative understanding and
 *   nothing else. `concept-premise/input.ts` carries the reason for each exclusion.
 * - **Every field of the brief, or none** — inherited from `briefLines`, which renders from an
 *   exhaustive table keyed by `keyof EventIdentity`, so a field added to the identity contract
 *   stops the build rather than vanishing from what this stage is shown.
 * - **Pure.** Same input, same bytes: no clock, no environment, no randomness. That is what lets
 *   the boundary rebuild it identically on the repair pass and hand the caller the exact text that
 *   went out.
 */
import type { EventIdentity } from "@/lib/ai/event-identity/contract";

import { ASSEMBLY_TEXT, briefLines } from "./design-intent-input";

export interface AssembleConceptPremiseInput {
  /** The creative brief, exactly as `event_identity_revisions.result.identity` holds it. */
  readonly identity: EventIdentity;
}

/** The user message, deterministically: one delimited block and its preamble. */
export function assembleConceptPremiseUserMessage(input: AssembleConceptPremiseInput): string {
  return [
    ...ASSEMBLY_TEXT.briefPreamble,
    "",
    ASSEMBLY_TEXT.briefOpen,
    ...briefLines(input.identity),
    ASSEMBLY_TEXT.briefClose,
  ].join("\n");
}
