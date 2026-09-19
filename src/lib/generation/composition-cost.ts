import "server-only";

/**
 * What one Composition call may cost, and what one may cost at worst.
 *
 * `docs/phase-4b-plan.md`, Part IV, on the obligation that comes with owning a production call:
 * *"The verified rate table in `identity-cost.ts` is a property of the model and applies to any
 * call on it; `perAttemptMaxUsd` is a property of an attempt shape, and Event Identity's was
 * derived from Event Identity's."* DesignIntent and ConceptPremise both derive their own bound
 * from the same verified rates and their own output configuration rather than inheriting or
 * inventing one; this module is the third instance of that discipline, for the composition call.
 *
 * # One thing this module does not have, that the other two do
 *
 * `design-intent-cost.ts` and `concept-premise-cost.ts` both import their request-shaping
 * constants (`*_MAX_OUTPUT_TOKENS`, `REPAIR_FEEDBACK_MAX_BYTES`, `MAX_TRANSIENT_RETRIES`, …) from a
 * committed provider adapter under `src/lib/ai/openai/`, because `generateDesignIntent` and
 * `generateConceptPremiseSet` are already implemented there. `generateComposition` is not — there
 * is no `src/lib/ai/openai/composition.ts` yet, so there is nothing to import a real request shape
 * from. This module therefore *defines* the request-shaping constants a composition call must not
 * exceed, rather than reading them back from a runner that does not exist. When that runner is
 * built, it must be configured to fit inside these bounds — or, if a real requirement will not fit,
 * this module's constants move first, deliberately, with a version bump, exactly as raising
 * `MAX_TRANSIENT_RETRIES` in the two adapters that exist today would move their bounds.
 *
 * Every other discipline is unchanged: reuse `VERIFIED_COST_PROFILES` and the fail-closed lookup
 * over them, which are facts about the *model*; derive everything that is a fact about the
 * *request* from this boundary's own constants; err upward wherever a real measurement is not
 * exact; refuse a model whose verified profile cannot honestly bound the request.
 *
 * # The derivation
 *
 * **Input.** Every block of the composition user message (`docs/model-contracts.md §6.1`) is
 * measured or bounded from the real generators that produce it, not guessed:
 *
 * | block | source | how it is bounded |
 * | --- | --- | --- |
 * | EventIdentity | `@/lib/ai/event-identity/wire-schema` | worst value built from the canonical schema's own `.max()`s, as `design-intent-cost.ts` already does |
 * | ContentProfile + Capabilities | `ContentProfile`/`Capabilities` in `composition/nodes.ts` | fixed shape, all-numbers-and-booleans, measured directly |
 * | DesignIntent | `@/lib/ai/design-intent/wire-schema` | worst value built from its canonical schema, same method as EventIdentity |
 * | primitive spec + rules | `specText()`/`rulesText()` in `composition/prompt-text.ts` | measured at full capabilities (every optional block included — the worst case per §6.1) |
 * | directive sentence | `describe()` over `PHRASE` in `renderer/planner/directives.ts` | the longest phrase in each of the eight dimensions, summed |
 * | forbidden tokens | `ATTRACTIVE_TOKENS` in `composition/attractive-tokens.ts` | every token id, the whole (three-entry) list |
 * | three few-shot examples | `compositionExamples()` in `renderer/few-shot/index.ts` | the three largest of the sixteen `A1_SITES` pages, which is the true worst any seed can draw (`compositionExamples.test.ts`-style measurement, not a sampled guess) |
 * | `avoid` (collision re-prompt only) | selector skeletons (`composition/signature.ts`) | not separately measured; folded into the repair reserve below, which already budgets a correction turn at this cap |
 *
 * `composition-cost.test.ts` rebuilds every one of these from the real source rather than
 * restating a literal, exactly as `design-intent-cost.test.ts` does for its own three channels. A
 * primitive added to the spec, a phrase lengthened in a directive, or a library page that grows
 * all fail there instead of silently invalidating this bound.
 *
 * Bytes are used as the token bound directly, as the other two boundaries do: a byte-level BPE
 * tokenizer's base vocabulary is the 256 single bytes, so a string can never produce more tokens
 * than it has UTF-8 bytes; merges only ever reduce the count. Loose, and true.
 *
 * **Output.** `docs/event-renderer-system.md §2.4`: *"Response body ≤ 12 KB."* That bounds the
 * `CompositionTree` JSON itself, using the same bytes-as-tokens argument. It does not bound
 * reasoning, which is billed as output and is not optional to budget (`design-intent-cost.ts` makes
 * the same point about `DESIGN_INTENT_MAX_OUTPUT_TOKENS`). Composition is a materially larger
 * reasoning task than DesignIntent's seven enum-and-hex fields — it is authoring a full multi-
 * section tree of trusted primitives against twelve-odd pages of nesting, coverage and limit rules
 * — so the reasoning reserve here is set *larger* than DesignIntent's entire 32,000-token ceiling,
 * not scaled down from it. `PER_ATTEMPT_OUTPUT_TOKEN_BOUND` is therefore the response-body bound
 * plus that reserve, and is what a real adapter's `maxOutputTokens` must not exceed.
 *
 * **Rates.** The most expensive class the profile prices, on both axes — the long-context table
 * and `cacheWriteInput` — exactly as the other two boundaries price their worst attempt, whether or
 * not the bound actually reaches that tier. `assertProfileSupportsRequest` still checks that it
 * does not (`PER_ATTEMPT_INPUT_TOKEN_BOUND` must stay under `longContextThresholdTokens`), which
 * for `gpt-5.6-sol` it does, with headroom the test pins.
 *
 * **Repair rounds.** `docs/model-contracts.md §6.3`, `§8`: *"Re-prompts exist only for schema-
 * invalid output, a token-cap violation and a selector collision. Repairs of every other kind
 * never call a model."* Three distinct re-prompt reasons, each documented as happening **once**.
 * Nothing else opens a model turn: structural repair, coverage, capability references, component
 * placement, motif kind, responsive intent, content-fit, canonicalization, layout resolution and
 * geometry verification are all deterministic (`§6.3` steps 2 and 4).
 *
 * The three reasons fire at different, sequential validation stages (schema first; only a
 * schema-valid tree reaches the token-cap check; only a tree that clears that reaches the
 * selector). Nothing in the contract says a later re-prompt starts a fresh conversation rather than
 * continuing the one the earlier re-prompt grew, so the safe assumption — the one that never
 * under-reserves — is the worst case where all three fire in strict sequence on one continuous
 * conversation, and the **last** attempt therefore carries the full history: the original request
 * plus three rounds of (rejected response echoed back, correction turn sent). `REPAIR_ROUNDS = 3`
 * encodes that, and `REPAIR_OVERHEAD_TOKENS` is three times what one round costs rather than one.
 * This may over-reserve against how the eventual runner actually chains these turns; it must never
 * under-reserve against it.
 *
 * Each round's overhead mirrors `design-intent-cost.ts`'s own reasoning: the echoed response is
 * capped by `PER_ATTEMPT_OUTPUT_TOKEN_BOUND` (re-tokenizing an identical string yields an identical
 * count), and the correction turn is capped **at the boundary** by `REPAIR_FEEDBACK_MAX_BYTES` —
 * the same defensive cap DesignIntent's `repairFeedback()` enforces, for the same reason: any of
 * the three correction shapes (a validation issue list, a forbidden-token reminder, a colliding-
 * skeleton list) is an enumerable list a pathological response can make arbitrarily long, and an
 * unbudgeted correction turn can run past the reserve itself.
 *
 * **Attempts.** `MAX_PROVIDER_ATTEMPTS_PER_CALL` is `COMPOSITION_PASSES` (the original call plus
 * the three repair rounds) times the transient-retry width every boundary here uses. Nothing else
 * can open a pass, by the same `§6.3`/`§8` reading above.
 */
import { SIBLING_COUNT } from "@/lib/generation/planner";
import { EVENT_IDENTITY_SERVICE_TIER } from "@/lib/ai/openai/event-identity";

import {
  estimateIdentityCallCostUsd,
  isVerified,
  requireCostProfile,
  type CostEstimate,
  type CostRelevantUsage,
  type ModelCostProfile,
} from "./identity-cost";

/* ------------------------------------------------------------------ request-shaping constants */

/**
 * Bounded transient retries. Provider-side failures only; never an output problem.
 *
 * Mirrors `MAX_TRANSIENT_RETRIES` in `@/lib/ai/openai/event-identity` and
 * `@/lib/ai/openai/design-intent` (both `2`). Defined locally rather than imported because there is
 * no `@/lib/ai/openai/composition` adapter yet (see the module comment above) — when one exists, it
 * should either import this constant or this module should import its, and a test should pin the
 * two together the way `_tiersAgree` below pins the service tier.
 */
const MAX_TRANSIENT_RETRIES = 2;

/**
 * The service tier a composition request must be sent on.
 *
 * Pinned rather than inherited, for the reason Event Identity records: the verified rate profile
 * is built against standard pricing, and a request sent on a different tier would be priced against
 * a bound that does not describe it.
 */
export const COMPOSITION_SERVICE_TIER = "default" as const;

/**
 * The tiers have to agree, and this is checked at compile time rather than remembered.
 *
 * `estimateIdentityCallCostUsd` decides whether a response was served on the tier its profile
 * prices by comparing against `EVENT_IDENTITY_SERVICE_TIER`. Reusing that pricing function here is
 * only correct while composition pins the same tier; if one moves, this stops compiling instead of
 * becoming a quietly wrong comparison.
 */
type _TiersAgree = typeof COMPOSITION_SERVICE_TIER extends typeof EVENT_IDENTITY_SERVICE_TIER
  ? true
  : never;
const _tiersAgree: _TiersAgree = true;
void _tiersAgree;

/**
 * Measured from the committed instruction file, and pinned by test against the file itself.
 *
 * `composition.system.md` is about 11,200 bytes. 16,000 is the same allowance
 * `concept-premise-cost.ts` chose for a file of comparable size: headroom for ordinary prompt
 * growth without being so loose the file could double inside it —
 * `composition-cost.test.ts` fails on both sides, because a stale allowance is not a safe one.
 */
export const INSTRUCTION_BYTES = 16_000;

/**
 * The worst assembled user message, in UTF-8 bytes.
 *
 * Summed from the measured worst case of every block `docs/model-contracts.md §6.1` lists (see the
 * module comment's table): the EventIdentity and DesignIntent worst values run about 26,000 and
 * 1,000 bytes; the full-capability primitive spec and rules text about 5,000 and 2,100; the three
 * largest library pages about 5,500; the longest directive sentence and the full forbidden-token
 * list a few hundred more; ContentProfile and Capabilities a few hundred each. That measured sum is
 * about 40,500 bytes. 50,000 is the next round number above it that also leaves room for the JSON
 * field labels and separators the real assembly adds around each block (not modelled here, because
 * there is no real assembler to measure them from yet) and for the `avoid` block a collision
 * re-prompt may add. `composition-cost.test.ts` rebuilds the measured sum from the real generators
 * and fails if it grows past this or shrinks far below it.
 */
export const WORST_USER_MESSAGE_BYTES = 50_000;

/**
 * `docs/event-renderer-system.md §2.4`: "Response body ≤ 12 KB." Bytes, used as the token bound
 * for the same byte-level-BPE reason every other bound here does.
 */
export const RESPONSE_BODY_MAX_BYTES = 12_000;

/**
 * Reasoning headroom added on top of the response-body bound, in tokens.
 *
 * Deliberately larger than `DESIGN_INTENT_MAX_OUTPUT_TOKENS` (32,000) rather than scaled down from
 * it: composition authors a full multi-section tree of trusted primitives against the nesting,
 * coverage, capability, component-placement, limit and motif rules `rulesText()` renders, a
 * materially larger reasoning task than DesignIntent's seven enum-and-hex fields. There is no live
 * request yet to measure a real reasoning distribution against, so this errs high on purpose.
 */
export const COMPOSITION_REASONING_RESERVE_TOKENS = 36_000;

/**
 * The worst output one provider attempt can produce, in tokens. A real adapter's `maxOutputTokens`
 * must not exceed this without this bound moving first, deliberately, with a version bump.
 */
export const PER_ATTEMPT_OUTPUT_TOKEN_BOUND =
  RESPONSE_BODY_MAX_BYTES + COMPOSITION_REASONING_RESERVE_TOKENS;

/**
 * The hard budget on one repair round's correction turn, in UTF-8 bytes.
 *
 * The same defensive cap `design-intent.ts`'s `REPAIR_FEEDBACK_MAX_BYTES` enforces, for the same
 * reason: whichever of the three correction shapes a round sends — a validation issue list (schema
 * re-prompt), a forbidden-token reminder (token-cap re-prompt), or the colliding skeletons
 * (selector re-prompt) — is an enumerable list a pathological response can make arbitrarily long,
 * and an unbudgeted correction turn can run past the whole reserve. When the composition provider
 * adapter is built, its own correction-turn renderer must enforce this same cap at the boundary,
 * exactly as `repairFeedback()` does for DesignIntent.
 */
export const REPAIR_FEEDBACK_MAX_BYTES = 8_000;

/** The fixed sentences a correction turn wraps its feedback in. Same allowance as the other two. */
export const REPAIR_TURN_FRAMING_BYTES = 500;

/**
 * `docs/model-contracts.md §6.3`, `§8`: three distinct re-prompt reasons, each once — schema-invalid
 * output, a token-cap violation, a selector collision. Everything else is deterministic repair and
 * opens no model turn.
 */
export const REPAIR_ROUNDS = 3;

/**
 * The two turns one repair round adds to the conversation, times the number of rounds the worst
 * case chains — see the module comment's "Repair rounds" section for why chaining all three is the
 * assumption that never under-reserves.
 */
export const REPAIR_OVERHEAD_TOKENS =
  REPAIR_ROUNDS *
  (PER_ATTEMPT_OUTPUT_TOKEN_BOUND + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES);

/** Role markers and separators the provider adds around the messages. */
export const FRAMING_TOKENS = 1_000;

/** The worst input one provider attempt can carry, in tokens. */
export const PER_ATTEMPT_INPUT_TOKEN_BOUND =
  INSTRUCTION_BYTES + WORST_USER_MESSAGE_BYTES + REPAIR_OVERHEAD_TOKENS + FRAMING_TOKENS;

/**
 * Passes at the model per logical call: the original call, plus one round for each of the three
 * re-prompt reasons `docs/model-contracts.md §6.3`/`§8` names.
 */
export const COMPOSITION_PASSES = 1 + REPAIR_ROUNDS;

/**
 * The most provider attempts one logical `generateComposition` call can make: four passes, each of
 * which may be retried twice for transport failures. Exported rather than recomputed, so raising
 * `MAX_TRANSIENT_RETRIES` raises the spend reservation instead of quietly raising real worst-case
 * spend past it.
 */
export const MAX_PROVIDER_ATTEMPTS_PER_CALL = COMPOSITION_PASSES * (MAX_TRANSIENT_RETRIES + 1);

/**
 * Bumped whenever any input to the derivation moves: the request shape, the token bounds, the
 * rounding, or the attempt topology.
 */
export const COMPOSITION_ATTEMPT_PROFILE_VERSION = "composition_attempt_v1@2026-09-19";

/**
 * A model whose verified profile cannot honestly bound this request is refused, not approximated.
 *
 * The same three ways this can go wrong that `design-intent-cost.ts` and `concept-premise-cost.ts`
 * check: the request does not fit the context window; the output ceiling exceeds what the model
 * will produce; or the input bound crosses the long-context threshold, at which point pricing the
 * whole request at one table stops being conservative in a way anyone checked.
 */
export function assertProfileSupportsRequest(profile: ModelCostProfile): void {
  if (!isVerified(profile)) return;
  const problems: string[] = [];
  if (
    PER_ATTEMPT_INPUT_TOKEN_BOUND + PER_ATTEMPT_OUTPUT_TOKEN_BOUND >
    profile.contextWindowTokens
  ) {
    problems.push(
      `the worst request (${PER_ATTEMPT_INPUT_TOKEN_BOUND} in + ${PER_ATTEMPT_OUTPUT_TOKEN_BOUND} ` +
        `out) does not fit the ${profile.contextWindowTokens}-token context window`,
    );
  }
  if (PER_ATTEMPT_OUTPUT_TOKEN_BOUND > profile.maxOutputTokens) {
    problems.push(
      `the request asks for up to ${PER_ATTEMPT_OUTPUT_TOKEN_BOUND} output tokens, past this ` +
        `model's ${profile.maxOutputTokens}`,
    );
  }
  if (PER_ATTEMPT_INPUT_TOKEN_BOUND > profile.longContextThresholdTokens) {
    problems.push(
      `the worst input (${PER_ATTEMPT_INPUT_TOKEN_BOUND}) reaches the long-context threshold ` +
        `(${profile.longContextThresholdTokens}); re-derive the bound before using this model`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Cost profile ${profile.profileVersion} cannot bound a Composition attempt: ` +
        `${problems.join("; ")}.`,
    );
  }
}

/** Up to the next half-dollar. A bound with more precision than its inputs is false precision. */
function roundUp(usd: number): number {
  return Math.ceil(usd * 2) / 2;
}

/**
 * The conservative upper bound on what ONE Composition provider attempt can bill, in USD.
 *
 * For `gpt-5.6-sol`:
 *
 *   input   236,500 tokens × $10 / 1M (long-context cache write) = $2.365
 *   output   48,000 tokens × $30 / 1M (long-context output)      = $1.44
 *                                                                 ------
 *                                                                 $3.805 → $4.00
 */
export function compositionAttemptMaxUsd(model: string, now: Date = new Date()): number {
  const profile = requireCostProfile(model, now);
  assertProfileSupportsRequest(profile);
  // The labelled development fallback prices nothing, so its own deliberately large per-attempt
  // number stands. Production never reaches this branch: `requireCostProfile` throws there.
  if (!isVerified(profile)) return profile.perAttemptMaxUsd;
  const prices = profile.longContext;
  return roundUp(
    (PER_ATTEMPT_INPUT_TOKEN_BOUND * prices.cacheWriteInput +
      PER_ATTEMPT_OUTPUT_TOKEN_BOUND * prices.output) /
      1_000_000,
  );
}

/**
 * The worst one logical `generateComposition` call can cost.
 *
 * Pinned to `MAX_PROVIDER_ATTEMPTS_PER_CALL` rather than to a literal, so raising the transient
 * retry bound raises the reservation instead of quietly raising real worst-case spend past it.
 */
export function compositionLogicalCallMaxUsd(model: string, now: Date = new Date()): number {
  return compositionAttemptMaxUsd(model, now) * MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/**
 * The worst one batch of three concepts can cost, for the composition stage alone.
 *
 * `spec.md §7.7`: a batch is three concepts, and all three are composed. A ceiling that reserved
 * for one call would be wrong by a factor of three at the moment it mattered most. This is the
 * composition stage's own contribution to the batch ceiling; the honest end-to-end batch number
 * also includes the premise and DesignIntent stages, exactly as `concept-premise-cost.ts`'s
 * `conceptBatchMaxUsd` states for those two.
 */
export function compositionBatchMaxUsd(model: string, now: Date = new Date()): number {
  return compositionLogicalCallMaxUsd(model, now) * SIBLING_COUNT;
}

/**
 * What one invocation may have cost, priced from the same rules Event Identity uses.
 *
 * Deliberately not a third implementation. The pricing rules — price each observed response at its
 * own tier, charge the per-attempt maximum for every attempt that cannot be priced, never claim
 * `exact` where only a bound is known — are properties of the provider's billing, not of this call,
 * and a copy of them would be a copy that drifts. What differs is the attempt bound, and that is
 * the argument this function forwards.
 */
export function estimateCompositionCallCostUsd(
  profile: ModelCostProfile,
  usage: CostRelevantUsage,
  attemptMaxUsd: number,
): CostEstimate {
  return estimateIdentityCallCostUsd(profile, usage, attemptMaxUsd);
}

/**
 * The usage shape this estimator needs, in exactly the fields `CostRelevantUsage` reads.
 *
 * A plain alias rather than a `Pick` over a provider-adapter usage type, because there is no
 * `CompositionUsage` type yet (see the module comment above). When `@/lib/ai/openai/composition`
 * exists and defines one, this should become `Pick<CompositionUsage, "responses" |
 * "providerResponses" | "providerAttempts" | "unknownUsageAttempts">`, mirroring
 * `DesignIntentCostRelevantUsage` and `ConceptPremiseCostRelevantUsage`, so a field the real usage
 * type drops or renames fails here instead of this type silently describing a shape nothing
 * produces.
 */
export type CompositionCostRelevantUsage = CostRelevantUsage;
