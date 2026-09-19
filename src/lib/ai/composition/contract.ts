/**
 * The Composition call's boundary types — `docs/model-contracts.md §6.1`, `§6.3`, `§8`.
 *
 * This module declares what one `generateComposition` call is given, what it returns, and how it
 * fails. It renders nothing (that is `../openai/composition-input.ts`) and calls nothing (that is
 * `../openai/composition.ts`); it exists so both of those, and every caller above them, agree on
 * one shape.
 *
 * # Why the input is a closed record rather than the provider's `GenerateCompositionInput`
 *
 * `src/lib/ai/provider.ts` declares the call as
 * `{ designIntent, capabilities, directive, reprompt? }` over `Record<string, unknown>`. That
 * shape predates the contract: it carries no brief, no content profile, no token allotment and no
 * seed, and it types three of its four fields as bags. `docs/model-contracts.md §6.1` names eight
 * inputs and one optional ninth, and the difference between "a bag" and "these fields and no
 * others" is the whole of what keeps prohibited data out of a request.
 *
 * So the fields below are exhaustive and typed, and each one canon prohibits is prohibited by
 * having nowhere to go — the same technique `./brief.ts` uses for `creativeGuidance`. `§6.1`'s
 * closing sentence is the list: *"Do not send guest data, RSVP data, registry contents, private
 * codes, or prior ResolvedDesignSpecs."* None of them has a field here, and
 * `../openai/composition-input.test.ts` proves none of them reaches the wire.
 *
 * # The one thing this module owns outright
 *
 * **The result and error shapes**, mirroring `DesignIntentCallResult` field for field, because the
 * cost accounting and the telemetry writer downstream are shared: per-response usage so each
 * response is priced at the tier it was actually served on, and every paid response preserved on
 * success and failure alike.
 *
 * # What this call does *not* return
 *
 * **No `presentation`.** `docs/model-schemas/composition.schema.json` is closed at the top level to
 * `version` and `sections` — `additionalProperties: false`, both required — and `spec.md §32 #12`
 * puts the card on the other call: *"a six-field DesignIntent … plus non-design presentation
 * metadata, and a `CompositionTree` of trusted primitives"*. `spec.md §7.8`'s presentation
 * paragraph sits in the DesignIntent contract, `src/lib/ai/design-intent/validate.ts` validates it
 * there, and `src/lib/generation/concept-set.ts` reviews and persists the three cards as a set.
 *
 * So a `presentation` key in a composition response is an unknown top-level key and fails strict
 * schema validation like any other — which is the behaviour, not an oversight. Accepting it here
 * would put a second, unreviewed source of concept names beside the set-level review that
 * `§7.8`'s collision and near-duplicate rules depend on.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 * Guardrails: `spec.md §32 #12`, `#16`, `#17`, `#21`, `#22`.
 */
import type { CompositionBrief } from "@/lib/ai/composition/brief";
import type { ProviderResponseUsage } from "@/lib/ai/openai/event-identity";
import type {
  Capabilities,
  CompositionTree,
  ContentProfile,
  Repair,
  Violation,
} from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import type { AttractiveTokenId } from "@/lib/renderer/planner";
import type { Directive } from "@/lib/renderer/planner/directives";
import type { FallbackTelemetry, TerminalFallbackReason } from "@/lib/renderer/recovery";

export type { TerminalFallbackReason, FallbackTelemetry };

/* ------------------------------------------------------------------ the call input */

/**
 * The colliding sibling skeletons, or nothing, for a candidate tree.
 *
 * `docs/model-contracts.md §6.3` step 5 compares a tree's signature "against batch siblings and
 * redesign history" — a comparison only the batch can make, because only the batch holds the other
 * two concepts. The **policy** that follows from a collision is this boundary's, though: one
 * re-prompt, then the library. Splitting them the other way round would put half a state machine
 * in the orchestrator and make "exactly once" a property of two modules agreeing.
 *
 * So the batch injects the comparison and the boundary owns what to do with the answer. Returning
 * an empty array or `null` means the skeleton is clear. A non-empty array is the colliding
 * siblings' hero skeletons, which is exactly what `§6.1`'s `avoid` carries into the re-prompt.
 *
 * Only ever called with a schema-valid tree: `renderer/recovery`'s fallback guard refuses a
 * collision history containing a schema-invalid attempt (`attempt-off-path`), because the two
 * paths are different paths.
 */
/**
 * The selector, injected by the batch (`docs/model-contracts.md §6.3` step 5).
 *
 * Returns the colliding skeletons, or `null`/empty when this tree is clear. **May be async**: the
 * batch's register makes sibling `k` await siblings `0..k-1` before judging, which is what lets
 * the three provider calls stay parallel while the comparison stays deterministic. The provider
 * call is already complete when this runs, so awaiting here delays only the cheap decision.
 */
export type CollisionCheck = (
  tree: CompositionTree,
) => readonly string[] | null | Promise<readonly string[] | null>;

/**
 * `docs/model-contracts.md §6.1`'s `GenerateCompositionInput`, typed.
 *
 * Nine fields. Eight of them are `§6.1`'s, one — `seed` — replaces `§6.1`'s `examples`, and the
 * reason is `CLAUDE.md §5.1`: `examples` is *"three library pages rotated by seed"*, and a caller
 * that handed in pre-built trees could hand in any trees it liked. That is the library reaching a
 * decision, which §7.1 forbids by name. The seed is the planner's own per-sibling seed, the
 * assembly materializes the three examples from it through the one adapter permitted to reach the
 * library, and the same seed is what makes a terminal fallback deterministic for this concept.
 *
 * What is **not** here, each because canon says so: the raw host prompt (`product-doctrine.md §4`
 * — interpretation happens once), `creativeGuidance` (`./brief.ts`), guest data, RSVP data,
 * registry contents, private codes and prior `ResolvedDesignSpec`s (`§6.1`), another sibling's
 * intent, premise or output (`docs/phase-4b-plan.md §E`), and any library recipe or silhouette
 * identifier (`CLAUDE.md §5.1`).
 */
export interface CompositionCallInput {
  /** `§6.1`'s `eventIdentity`, already scoped to the design brief by `./brief.ts`. */
  readonly brief: CompositionBrief;
  /**
   * `§6.1`'s `contentProfile`, the canonical type from `renderer/composition/nodes.ts`.
   *
   * Imported rather than restated. `docs/event-renderer-system.md §2.3` defines the shape once —
   * measurements, not strings, plus `registryCounts` and `provisionalFields` — and a second
   * declaration of it here would be a duplicate source of truth that drifts the first time the
   * profile gains a field. `src/lib/generation/content-profile.ts` derives the value.
   */
  readonly contentProfile: ContentProfile;
  /** Enabled features, never content presence (`docs/event-renderer-system.md §2.3`). */
  readonly capabilities: Capabilities;
  /** This concept's DesignIntent, already validated. */
  readonly designIntent: DesignIntent;
  /** The planner's eight-dimension directive for this sibling (`spec.md §7.7`). */
  readonly directive: Directive;
  /** The attractive tokens a **sibling** was allotted, which this one may not use. */
  readonly forbiddenTokens: readonly AttractiveTokenId[];
  /** The planner's per-sibling seed: rotates the examples, and fixes any terminal fallback. */
  readonly seed: number;
  /** Injected by the batch; see `CollisionCheck`. Absent means no selector runs for this call. */
  readonly collides?: CollisionCheck;
}

/* ------------------------------------------------------------------ usage and results */

/** The three, and only three, reasons `§6.3` permits asking the model again. */
export type CompositionRepromptKind = "schema" | "token_cap" | "collision";

/**
 * Mirrors `DesignIntentUsage` field for field, deliberately.
 *
 * The cost module prices a call from `responses`, one entry per provider response at the tier that
 * response was actually served on; the summary counters above it are telemetry. Diverging here
 * would mean a second pricing path for the third of the three creative calls, which is how one of
 * them ends up costed at zero.
 */
export interface CompositionUsage {
  provider: "openai";
  model: string;
  /** The **accepted or final** response's request id, not an identifier for every attempt. */
  providerRequestId?: string;
  /** Token counts aggregated over every response this invocation received, rejected included. */
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  /** Billable output. `reasoningTokens` is a **breakdown** of this, never an addition to it. */
  outputTokens?: number;
  reasoningTokens?: number;
  /** Per-response usage, in arrival order. Pricing reads this; the summary above is telemetry. */
  responses: ProviderResponseUsage[];
  /** How many provider responses this invocation actually received. */
  providerResponses: number;
  /** HTTP attempts made at the provider, at most `MAX_PROVIDER_ATTEMPTS_PER_CALL`. */
  providerAttempts: number;
  /** Attempts whose usage we do not know and therefore cannot price. Never costed at zero. */
  unknownUsageAttempts: number;
  latencyMs: number;
  /** Transport retries. **Not** re-prompts: the model was never asked anything twice. */
  transientRetries: number;
  /** True when the first response parsed strictly. `docs/model-contracts.md §6.4` CO-01. */
  schemaValidFirstCall: boolean;
  /**
   * The three re-prompts `§6.3` allows, each at most once. Counted separately rather than summed,
   * because "asked again about the schema" and "asked again about a collision" are different facts
   * about a run, and CO-01, CO-06 and CO-07 measure them separately.
   */
  reprompts: Readonly<Record<CompositionRepromptKind, 0 | 1>>;
}

/**
 * What one `generateComposition` call produced.
 *
 * `output` is the tree the compiler will receive: the model's, after any deterministic
 * neutralization, or the library page a documented fallback produced. `fallback` says which of
 * those it is, and is the `fallback: library` telemetry `§6.3` requires — never inferred from the
 * tree, because `§8` is explicit that a fallback page "is never presented as a model composition".
 */
export interface CompositionCallResult {
  /** Raw provider text of the **accepted or final** response, verbatim. */
  raw: string;
  /**
   * Every provider text this invocation was billed for, oldest first. A re-prompted response was
   * paid for too, and a rejected one is evidence.
   */
  rawResponses: string[];
  /** The tree the compiler receives. Post-neutralization, or the library fallback page. */
  output: CompositionTree;
  /**
   * The parsed response as it arrived, before neutralization. `undefined` when the page came from
   * the library and there is no accepted model response to report.
   *
   * A bare `CompositionTree` — this call returns no other object. See the module header on why
   * `presentation` is not part of this response.
   */
  response: unknown;
  /**
   * Deterministic attractive-token neutralization, logged as `planner`
   * (`docs/event-renderer-system.md §5`). Empty unless the one token-cap re-prompt was spent and
   * the violation persisted. Structural, coverage, capability, responsive, box, motif-kind and fit
   * repairs are the compiler's and never appear here.
   */
  repairs: Repair[];
  /** `null` on the ordinary path. Set, and attributed, whenever the library produced the page. */
  fallback: FallbackTelemetry | null;
  usage: CompositionUsage;
  promptVersion: string;
  schemaVersion: string;
  /** The primitive set the spec and rules blocks were generated from. */
  primitiveSetVersion: string;
  /**
   * The base user messages sent, oldest first — each one exactly as it went out, and nothing else.
   *
   * Not the instruction file, not a correction turn, and not the assistant echo of a rejected
   * response that sits between them: that echo is raw model output, and letting it reach a caller
   * that scans this text would put a stochastic string inside a deterministic check.
   *
   * Usually one entry. A collision re-prompt rebuilds the message to carry `§6.1`'s `avoid` block,
   * so that pass has its own entry; the schema and token-cap re-prompts resend the same bytes and
   * add none.
   */
  requestTexts: string[];
  /** The last entry of `requestTexts`, for callers that persist one request. */
  requestText: string;
  /** Which assembly produced them. Moves independently of the prompt and schema versions. */
  inputAssemblyVersion: string;
}

export type CompositionFailureKind =
  /** Transport: network, 429, 5xx, timeout. No output to judge. */
  | "provider"
  /** Schema-invalid after the one re-prompt, and the library fallback was refused. */
  | "invalid_output"
  /** Deterministic neutralization did not clear a forbidden attractive token. */
  | "token_cap"
  /** Colliding after the one re-prompt, and the library fallback was refused. */
  | "collision";

export class CompositionError extends Error {
  constructor(
    message: string,
    readonly kind: CompositionFailureKind,
    /** Schema errors, token ids or colliding skeletons, depending on `kind`. */
    readonly detail?: {
      readonly errors?: readonly Violation[];
      readonly tokens?: readonly AttractiveTokenId[];
      readonly colliding?: readonly string[];
      /**
       * Why `renderer/recovery` refused to serve a fallback, where one was sought.
       *
       * A refusal means the attempt history did not show the state transition `§3` and `§5`
       * describe. It is a bug in this boundary's own bookkeeping, and it surfaces as a visible
       * failure rather than as a page, because the alternative is reaching the library on a path
       * canon does not have (`CLAUDE.md §5.1`).
       */
      readonly fallbackRefusal?: string;
    },
    readonly usage?: Partial<CompositionUsage>,
    /**
     * Provider text already returned and paid for when this failed, oldest first. An output
     * failure is not a call that produced nothing.
     */
    readonly rawResponses?: string[],
    readonly repairs?: Repair[],
  ) {
    super(message);
    this.name = "CompositionError";
  }
}

/**
 * The response is a bare `CompositionTree`, and this constant is the whole of that statement.
 *
 * `docs/model-schemas/composition.schema.json` closes the top level to these two keys with
 * `additionalProperties: false`, and `validateSchema` enforces the same thing independently. Kept
 * here as data so a change that wanted to admit a third key — a `presentation`, a rationale, a
 * confidence score — would have to edit this line and the canonical schema, rather than quietly
 * stripping the key before validation and calling the response legal.
 */
export const COMPOSITION_RESPONSE_KEYS = ["version", "sections"] as const;
