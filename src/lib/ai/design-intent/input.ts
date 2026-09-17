/**
 * What a DesignIntent call receives, and — mostly — what it does not.
 *
 * `docs/phase-4b-plan.md §E`, "Blind and parallel": each call receives **the creative brief** from
 * the same authoritative identity, plus **only its own sibling assignment**, and nothing else.
 * `spec.md §7.7` is the same split: "The assignment is passed to the DesignIntent call; the
 * directive, allotment and DesignIntent are passed to the composition call."
 *
 * # The brief, not the envelope
 *
 * `identity` is `AuthoritativeIdentity`, the branded creative brief that only `assertAuthoritative`
 * can produce (`src/lib/ai/event-identity/lifecycle.ts`). The brand wraps the brief rather than
 * the result envelope, so `suppliedFacts`, `clarification` and the host's raw words are not
 * reachable from a value of this type at all — the exclusion is a property of the type, not a
 * rule someone has to remember. It also means a provisional identity cannot be passed here
 * without a cast (`spec.md §7.6b`).
 *
 * # What is excluded, and why each one
 *
 * | Excluded | Why |
 * | --- | --- |
 * | raw host prompt | `spec.md §7.5`, `§32 #12`; `src/lib/ai/raw-prompt-boundary.test.ts` |
 * | raw inspiration assets | `docs/phase-4b-plan.md §F`: EventIdentity is the only stage that sees them; what travels is `identity.inspirationSummary` |
 * | `suppliedFacts` | `§E`: facts belong to content fit, and would smuggle the host's verbatim names, date, venue and address into a creative call |
 * | `clarification` | `§E`: does not leave the identity layer |
 * | the structural directive | `spec.md §7.7`: composition's, not this call's |
 * | the attractive-token allotment | `spec.md §7.7`: composition's, not this call's |
 * | capabilities | `CLAUDE.md §2`: capabilities are enabled features and none of them recomposes a page |
 * | the content profile | `§E`, same paragraph |
 * | another sibling's output | `§E`: the three calls are blind and parallel |
 * | any library recipe or silhouette id | `CLAUDE.md §5.1`, the Library Boundary Invariant |
 *
 * An earlier draft of the plan sent the directive, the allotment and capabilities here and was
 * explicitly withdrawn. T17 persists the directive and the allotment on the artifact **for
 * lineage** (`§G.2`, `§G.4`), which is not a reason to feed them back in.
 *
 * # This module renders nothing
 *
 * It declares the envelope's *contents*. How those contents are labelled to the model, ordered
 * and delimited is the prompt's, and the prompt is T21 — unwritten, unfrozen and unauthorised.
 * Nothing here produces model-visible text, and `boundary.test.ts` holds it to that.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` ("Event Identity is the only
 * stage that receives the raw host prompt; the planner, DesignIntent and composition calls read
 * the persisted identity"); `§32 #12`. Plan: `docs/phase-4b-plan.md §E`, `§F`, T18.
 */
import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import { DESIGN_INTENT_INPUT_ASSEMBLY_VERSION } from "@/lib/ai/versions";
import type { SiblingAssignment } from "@/lib/renderer/planner";

/**
 * The whole input to one `generateDesignIntent` call.
 *
 * Two fields, and adding a third is the decision this type exists to make visible.
 */
export interface DesignIntentCallInput {
  /** The creative brief from the authoritative identity. Branded, so the envelope cannot travel. */
  readonly identity: AuthoritativeIdentity;
  /** This sibling's assignment, and no other sibling's. */
  readonly assignment: SiblingAssignment;
}

/** The version the artifact's `design_intent_input_assembly_version` column records (T17). */
export const designIntentInputAssemblyVersion = DESIGN_INTENT_INPUT_ASSEMBLY_VERSION;

/**
 * The envelope's declared contents, in the order the assembly version names them.
 *
 * Exported as data so the boundary test can assert the list rather than read prose, and so a
 * future assembly can be checked against the version it claims.
 */
export const DESIGN_INTENT_INPUT_CHANNELS = ["identity", "assignment"] as const;

export type DesignIntentInputChannel = (typeof DESIGN_INTENT_INPUT_CHANNELS)[number];
