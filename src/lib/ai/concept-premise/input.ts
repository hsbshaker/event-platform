/**
 * What a ConceptPremise call receives, and what it does not.
 *
 * **One channel: the authoritative creative brief.** That is the whole envelope, and the shortness
 * of this list is the guarantee. A stage whose only input is the one authoritative understanding
 * cannot produce three premises grounded in anything else — there is no second interpretation
 * available to it, because there is no second input.
 *
 * # What is excluded, and why each one
 *
 * | Excluded | Why |
 * | --- | --- |
 * | raw host prompt | `spec.md §7.5`, `§32 #12`: EventIdentity is the only stage that sees it |
 * | raw inspiration assets | `docs/phase-4b-plan.md §F`: what travels is `identity.inspirationSummary` |
 * | `suppliedFacts` | facts belong to content fit; they are the host's verbatim names, date, venue and address, and a premise that could see them could assert one |
 * | `clarification` | `§E`: does not leave the identity layer |
 * | the sibling assignments | semantic distinction is primary and visual distinction follows from it. A premise tailored to a drawn `family` would invert that, and `family` stays planner-owned either way |
 * | the structural directive and token allotment | `spec.md §7.7`: the composition call's |
 * | capabilities and the content profile | `CLAUDE.md §2`: capabilities are enabled features and none of them recomposes a page |
 * | any library recipe or silhouette id | `CLAUDE.md §5.1`, the Library Boundary Invariant |
 *
 * The exclusion of `suppliedFacts` is the load-bearing one here. `./validate.ts` refuses a premise
 * that asserts a specific the brief does not carry; if the host's literal names and dates arrived
 * on this call, that check would be measuring whether the model copied a field rather than whether
 * it invented a fact.
 *
 * # This module renders nothing
 *
 * It declares the envelope's *contents*. How they are labelled, ordered and delimited is
 * `src/lib/ai/openai/concept-premise-input.ts`'s, which is the leakage-scanned surface. The same
 * split `src/lib/ai/design-intent/input.ts` makes, for the same reason.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` ("Event Identity is the only
 * stage that receives the raw host prompt"); `§32 #12`.
 */
import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import { CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION } from "@/lib/ai/versions";

/**
 * The whole input to one `generateConceptPremiseSet` call.
 *
 * One field, and adding a second is the decision this type exists to make visible. `identity` is
 * the branded `AuthoritativeIdentity` that only `assertAuthoritative` can produce, so the result
 * envelope cannot travel and a provisional identity cannot be premised from without a cast
 * (`spec.md §7.6b`).
 */
export interface ConceptPremiseCallInput {
  readonly identity: AuthoritativeIdentity;
}

/** The version an artifact records for this envelope. */
export const conceptPremiseInputAssemblyVersion = CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION;

/** The envelope's declared contents. Exported as data so the boundary test asserts a list. */
export const CONCEPT_PREMISE_INPUT_CHANNELS = ["identity"] as const;

export type ConceptPremiseInputChannel = (typeof CONCEPT_PREMISE_INPUT_CHANNELS)[number];
