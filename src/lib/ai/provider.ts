/**
 * Thin model-provider boundary — docs/technology-decisions.md §8, spec.md §9.1.
 *
 * These four capabilities are the frontier creative operations in MVP — three until the T22
 * diagnostic, which is recorded in `docs/designintent-sibling-convergence.md` — plus the optional
 * artwork capability described below, which is the only one that is not required of a provider.
 * Provider SDK calls, model names, request formatting, usage parsing and
 * request IDs live behind them. The compiler/renderer is NOT part of this
 * layer (spec.md §9.3): validation, repair, palette, layout and geometry
 * verification are deterministic application code.
 *
 * Phase 4 supplies the implementation together with spend controls
 * (docs/development-plan.md, principle 4). Until then `getAiProvider()` throws,
 * so no code path can call a model by accident (spec.md §32 #4).
 *
 * # The fifth entry: artwork
 *
 * `spec.md §7.6a` approves optional AI-generated thematic artwork for Phase 4, so the boundary
 * grows an artwork capability — same thin shape, same rule that SDKs, model names and usage
 * parsing live behind it. It is the fifth creative operation, not a fifth kind of infrastructure,
 * which is the test `docs/technology-decisions.md §8` applied when `generateConceptPremiseSet`
 * was added as the fourth.
 *
 * Three things about it are deliberately unlike the other four, each for a reason canon states:
 *
 * - **`generateVisualArt` is optional on this interface.** `spec.md §7.6a #1` makes imagery
 *   "optional, and chosen by the creative direction", and no image model is selected at all
 *   (`docs/technology-decisions.md`, `docs/product-doctrine.md §10`). A provider that generates no
 *   artwork is a legitimate provider, and today every provider is one.
 * - **It returns an outcome rather than a `ModelResult`.** No asset is an ordinary result, not an
 *   exception: the `ResolvedDesignSpec` is verified and frozen before any image exists, so every
 *   page is assetless for the whole interval between verification and delivery and permanently if
 *   the request failed. `src/lib/ai/visual-art/fallback.ts` is that contract.
 * - **It is not usage-parsed in tokens.** An image request is billed per asset;
 *   `src/lib/ai/visual-art/telemetry.ts` carries reserved and actual USD instead, and
 *   `src/lib/ai/visual-art/spend.ts` is the reservation a request must pass through first.
 *
 * `getArtworkProvider()` lives in `src/lib/ai/visual-art/enablement.ts` and throws
 * unconditionally: there is no configuration, environment state or default under which the
 * artwork path in this repository reaches a network.
 */

import type { CarriedClarification, PriorRevision } from "@/lib/ai/openai/event-identity-input";
import type { ConceptPremise } from "@/lib/ai/concept-premise/contract";
import type { CompositionCallInput } from "@/lib/ai/composition/contract";
import type { VisualArtCallInput, VisualArtOutcome } from "@/lib/ai/visual-art/generate";
import type { SiblingAssignment } from "@/lib/renderer/planner";

/** Wire shapes are the canonical JSON Schemas in docs/model-schemas/. Typed narrowly in Phase 4. */
export type EventIdentity = Record<string, unknown>;
export type ConceptPremiseSetResponse = Record<string, unknown>;
export type DesignIntentResponse = Record<string, unknown>;
export type CompositionTree = Record<string, unknown>;

export type ModelOperation =
  | "event_identity"
  | "concept_premise"
  | "design_intent"
  | "composition"
  /** `spec.md §7.6a`. Optional, per-asset, and against a model that is not yet selected. */
  | "visual_art";

export interface ModelUsage {
  provider: string;
  providerRequestId?: string;
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costEstimateUsd?: number;
  latencyMs: number;
}

export interface ModelResult<T> {
  /** Raw text as returned by the provider, persisted verbatim for telemetry. */
  raw: string;
  /** Parsed JSON; the application still runs the canonical schema validator (docs/model-contracts.md §3). */
  output: T;
  usage: ModelUsage;
}

export interface GenerateEventIdentityInput {
  prompt: string;
  inspiration?: { mimeType: string; bytes: Uint8Array }[];
  /**
   * A rerun after one or more clarification rounds (`spec.md §7.6b`).
   *
   * Absent on a first call, and then the assembled request is `event_identity_input_v1` byte for
   * byte. Present on a rerun, carrying every answer still in scope together with the revisions
   * that asked the questions — the assembly reads each question out of its revision rather than
   * trusting a question string from the caller.
   */
  clarification?: {
    priorRevisions: PriorRevision[];
    answers: CarriedClarification[];
  };
}

/**
 * `docs/phase-4b-plan.md §E`: the creative brief, **only this sibling's assignment**, and — under
 * the evidence §E required before a third channel could be added — **only this concept's premise**.
 *
 * Three fields, and adding a fourth is a decision this type exists to make visible. Not here: the
 * raw host prompt, raw inspiration assets, `suppliedFacts`, `clarification`, the structural
 * directive, the token allotment, capabilities, the content profile, another sibling's output,
 * another concept's premise, or any library recipe or silhouette identifier.
 * `src/lib/ai/design-intent/input.ts` carries the reason for each exclusion and
 * `design-intent/boundary.test.ts` proves them.
 */
export interface GenerateDesignIntentInput {
  eventIdentity: EventIdentity;
  /**
   * Sibling-planner assignment; see spec.md §7.7. The planner's own type rather than a bag, so
   * the directive and the allotment beside it in `PlannedConcept` cannot arrive by accident.
   */
  diversityAssignment: SiblingAssignment;
  /**
   * This concept's premise, from the batch's set of three
   * (`docs/designintent-sibling-convergence.md`). The premise type rather than a bag, so the two
   * siblings' premises beside it in a `ConceptPremiseSet` cannot arrive by accident.
   */
  conceptPremise: ConceptPremise;
}

/** One model call per batch: three premises, authored as a set from one authoritative identity. */
export interface GenerateConceptPremiseSetInput {
  eventIdentity: EventIdentity;
}

/**
 * The Composition call's input is `CompositionCallInput` in
 * `src/lib/ai/composition/contract.ts`, and this interface is deliberately an alias of it.
 *
 * It used to be a four-field bag — `{designIntent, capabilities, directive, reprompt?}` over
 * `Record<string, unknown>` — and that shape is the Phase 4D defect: it carried no host
 * constraints, so a constraint whose subject is *structure* could survive Event Identity and never
 * reach the stage that authors structure. It also declared a `reprompt` the caller was to supply,
 * which put the "once each" bound in the caller's hands rather than the adapter's.
 *
 * Re-pointed rather than deleted, so this interface keeps naming the call it describes and a reader
 * arriving here is not told something false about it.
 */
export type GenerateCompositionInput = CompositionCallInput;

/**
 * The artwork call's input is `VisualArtCallInput` in `@/lib/ai/visual-art/generate`, and this
 * interface is deliberately an alias of it — the same technique `GenerateCompositionInput` uses
 * above, for the same reason: one shape, named where the call lives, so this file cannot drift
 * into describing a call that does not exist.
 *
 * Its brief is `VisualArtIntent` exactly as `@/lib/ai/visual-art/contract` defines it — not
 * redefined, not widened, and carrying no coordinate, pixel, aspect ratio or free-text placement
 * field, because placement is the compiler's (`spec.md §7.6a #3`, `§32 #13`). Its reservation is
 * part of the input rather than an internal detail because a caller must pass the spend gate to
 * reach the call at all: artwork is the first thing in this pipeline that spends per *asset*, so
 * "did anyone check the ceiling" is answered by the type rather than by a convention.
 */
export type GenerateVisualArtInput = VisualArtCallInput;

export interface AiProvider {
  generateEventIdentity(input: GenerateEventIdentityInput): Promise<ModelResult<EventIdentity>>;
  /**
   * The premise stage, added after the T22 diagnostic showed three blind DesignIntent calls given
   * a byte-identical brief converge on one creative answer
   * (`docs/designintent-sibling-convergence.md`). It runs once per batch, ahead of the three.
   */
  generateConceptPremiseSet(
    input: GenerateConceptPremiseSetInput,
  ): Promise<ModelResult<ConceptPremiseSetResponse>>;
  generateDesignIntent(
    input: GenerateDesignIntentInput,
  ): Promise<ModelResult<DesignIntentResponse>>;
  generateComposition(input: GenerateCompositionInput): Promise<ModelResult<CompositionTree>>;
  /**
   * The artwork capability (`spec.md §7.6a`), optional on this interface — see the module header.
   *
   * The implementation is `generateVisualArt` in `@/lib/ai/visual-art/generate`, which owns the
   * spend gate, the retry bound, the failure classification and the telemetry. A provider is
   * injected into it; nothing resolves one here, because none exists.
   */
  generateVisualArt?(input: GenerateVisualArtInput): Promise<VisualArtOutcome>;
}

export function getAiProvider(): AiProvider {
  throw new Error("AI provider is not configured before Phase 4 (docs/development-plan.md).");
}
