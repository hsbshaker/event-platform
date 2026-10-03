import "server-only";

import {
  EVENT_IDENTITY_MAX_OUTPUT_TOKENS,
  EVENT_IDENTITY_SERVICE_TIER,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_TURN_FRAMING_BYTES,
  USER_MESSAGE_MAX_BYTES,
  type EventIdentityUsage,
  type ProviderResponseUsage,
} from "@/lib/ai/openai/event-identity";

/**
 * What one EventIdentity call may have cost, and what one may cost at worst.
 *
 * `docs/phase-4b-plan.md §A.5.1`. Four things about the provider boundary make the naive version
 * of this wrong in the direction of spending money:
 *
 *   1. one logical call may make several provider attempts, because transient failures are
 *      retried inside it;
 *   2. it may produce two billable responses, when the first fails validation and the repair
 *      succeeds;
 *   3. a timeout or connection loss means no response reached us, which is **not** the same as
 *      the provider having done no billable work;
 *   4. pricing is not linear across a call — the long-context tier applies per request, so one
 *      attempt can cross the threshold while another does not.
 *
 * So: price each observed response at its own tier, charge the per-attempt maximum for what we
 * could not observe, and never claim an exact number where only an upper bound is known.
 */

/* ------------------------------------------------------------------ verified cost profiles */

/**
 * Prices are per **1M tokens**, in USD.
 *
 * `cacheWriteInput` is a real third class, not a synonym for either of the others: GPT-5.6 bills
 * cache writes at a premium over uncached input while cache reads are heavily discounted.
 */
export interface TokenPrices {
  input: number;
  cachedInput: number;
  cacheWriteInput: number;
  output: number;
}

/**
 * A verified cost bound for one exact model id.
 *
 * "Verified" is a property of this record, not of a number appearing in an environment variable:
 * it means someone read the provider's published limits and prices for this exact model and
 * recorded where and when. A bare number in the environment cannot establish that, which is why
 * an override alone never satisfies the production contract below.
 */
export interface ModelCostProfile {
  model: string;
  /** Bumped whenever any number here changes, so persisted provenance stays meaningful. */
  profileVersion: string;
  source: string;
  /** `YYYY-MM-DD`, the day the numbers below were read from `source`. */
  retrieved: string;
  /**
   * `YYYY-MM-DD`, the last day this profile may be used for a **new paid attempt**.
   *
   * Usable through this date inclusive, stale from the following UTC day. A profile verified once
   * cannot call itself verified for ever: published prices move, and the current commitment is
   * time-bounded — pricing that changes under a bound nobody re-read is the same failure as never
   * having verified it. Re-verification is a person reading the current documentation, updating
   * the numbers if they moved, updating `retrieved` and this date, and bumping `profileVersion`.
   * Nothing fetches pricing at runtime.
   */
  reverifyAfter: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  /** Above this many input tokens, the whole request is billed at `longContext` rates. */
  longContextThresholdTokens: number;
  standard: TokenPrices;
  longContext: TokenPrices;
  /**
   * The conservative upper bound on what ONE attempt **of any shape** can bill on this model, in
   * USD: a request that fills the context window and the output allowance, at the worst tier.
   *
   * It is a fact about the *model*, which is the only kind of fact this record is allowed to hold,
   * and that is also why nothing verified reserves against it any more. A reservation is a
   * property of an attempt shape, and each of the four calls derives its own — Event Identity's in
   * `eventIdentityAttemptMaxUsd` below, the other three in their own cost modules. Reserving this
   * number instead is what put Event Identity's logical-call reservation at $90 and refused every
   * call before it reached the provider.
   *
   * Two things still read it, which is why it is still carried rather than deleted. The
   * **unverified development fallback** has no rates to derive anything from, so its own
   * deliberately large number is all there is; and every derived bound is checked against this one
   * by test, because a per-request bound above the model's own worst case would mean the
   * derivation had gone wrong. Nothing else may reserve against it.
   */
  perAttemptMaxUsd: number;
}

/**
 * Verified 2026-09-16 against the provider's own documentation.
 *
 * `perAttemptMaxUsd` is the worst case for an attempt of **any** shape on this model — the whole
 * context window and the whole output allowance, at the long-context tier, with every input token
 * billed as a cache write (the most expensive input class):
 *
 *   input   1,050,000 tokens × $10 / 1M  = $10.50
 *   output    128,000 tokens × $30 / 1M  =  $3.84
 *                                          ------
 *                                          $14.34  → rounded up to $15.00
 *
 * That is a true statement about the model and a useless reservation for Event Identity, whose
 * requests are three orders of magnitude smaller; `eventIdentityAttemptMaxUsd` below derives the
 * bound this call actually reserves against. `profileVersion` deliberately does **not** move for
 * that change: nothing here changed, no price was re-read, and bumping it would claim otherwise.
 * The attempt shape has its own label, `EVENT_IDENTITY_ATTEMPT_PROFILE_VERSION`.
 *
 * Two things this bound deliberately does **not** cover, because the code never selects them: the
 * Fast Mode tier (2× standard) and the Priority/Batch tiers. A `service_tier` is a request-shaping
 * option, so choosing one would change `modelConfig` — and it would need a new profile, because
 * this number would no longer bound an attempt.
 */
export const GPT_5_6_SOL: ModelCostProfile = {
  model: "gpt-5.6-sol",
  profileVersion: "gpt-5.6-sol@2026-09-16",
  source: "https://developers.openai.com/api/docs/pricing and /api/docs/models/gpt-5.6-sol",
  retrieved: "2026-09-16",
  // The published promotional commitment runs at least this far; re-read before it lapses.
  reverifyAfter: "2026-11-21",
  contextWindowTokens: 1_050_000,
  maxOutputTokens: 128_000,
  longContextThresholdTokens: 272_000,
  standard: { input: 4, cachedInput: 0.4, cacheWriteInput: 5, output: 20 },
  longContext: { input: 8, cachedInput: 0.8, cacheWriteInput: 10, output: 30 },
  perAttemptMaxUsd: 15,
};

export const VERIFIED_COST_PROFILES: readonly ModelCostProfile[] = [GPT_5_6_SOL];

/**
 * The fallback for development and tests, and **only** for those.
 *
 * Labelled rather than quiet: it is not a bound anybody checked, and `requireCostProfile()`
 * refuses it in production. $60 is deliberately larger than any verified profile, so a developer
 * running without configuration is never *under*-reserving.
 */
export const UNVERIFIED_DEV_PROFILE: ModelCostProfile = {
  model: "*",
  profileVersion: "unverified-dev-fallback",
  source: "none — nobody has verified this model's published limits or prices",
  retrieved: "never",
  // Never fresh, because it was never verified. Production refuses it on both counts.
  reverifyAfter: "1970-01-01",
  contextWindowTokens: 0,
  maxOutputTokens: 0,
  longContextThresholdTokens: 0,
  standard: { input: 0, cachedInput: 0, cacheWriteInput: 0, output: 0 },
  longContext: { input: 0, cachedInput: 0, cacheWriteInput: 0, output: 0 },
  perAttemptMaxUsd: 60,
};

export function isVerified(profile: ModelCostProfile): boolean {
  return profile.profileVersion !== UNVERIFIED_DEV_PROFILE.profileVersion;
}

/**
 * Whether the profile is still inside its re-verification window.
 *
 * Usable through `reverifyAfter` inclusive; stale from 00:00 UTC the following day. `now` is a
 * parameter so the rule is testable without waiting for a date to pass.
 */
export function isFresh(profile: ModelCostProfile, now: Date = new Date()): boolean {
  const lastUsableDay = Date.parse(`${profile.reverifyAfter}T23:59:59.999Z`);
  if (Number.isNaN(lastUsableDay)) return false;
  return now.getTime() <= lastUsableDay;
}

/** Production is anywhere a real host could reach this code. */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function findCostProfile(model: string): ModelCostProfile | null {
  return VERIFIED_COST_PROFILES.find((p) => p.model === model) ?? null;
}

/**
 * The cost profile for the configured model, or a refusal.
 *
 * This is the fail-closed half of the contract. A verified bound for the **exact** configured
 * model is required before a production call can be reached, so changing `OPENAI_MODEL` to
 * something nobody has priced refuses at configuration time rather than reserving one model's
 * worst case against another model's bill. It is a configuration check, not an arming ritual:
 * nothing is presented to an operator to approve, and no secret unlocks it — either the profile
 * exists for this model or the call does not happen.
 *
 * Outside production the labelled fallback applies, so tests and local work need no setup.
 */
export function requireCostProfile(model: string, now: Date = new Date()): ModelCostProfile {
  const profile = findCostProfile(model);
  if (profile) {
    if (isProductionRuntime() && !isFresh(profile, now)) {
      throw new Error(
        `Cost profile ${profile.profileVersion} for ${JSON.stringify(model)} needed ` +
          `re-verification after ${profile.reverifyAfter}. Production refuses a new paid attempt ` +
          "against prices nobody has re-read: check the provider's current documentation, update " +
          "the numbers and dates if they moved, and bump the profile version.",
      );
    }
    return profile;
  }
  if (!isProductionRuntime()) return UNVERIFIED_DEV_PROFILE;
  throw new Error(
    `No verified cost profile for model ${JSON.stringify(model)}. Production refuses to reserve ` +
      "spend against an unverified bound: add a ModelCostProfile for this exact model, with the " +
      "provider documentation it came from and the date it was read.",
  );
}

/* ------------------------------------------------- what one EventIdentity attempt may cost */

/**
 * # The derivation
 *
 * `docs/phase-4b-plan.md` Part IV states the rule the three later calls follow and this one did
 * not: *"The verified rate table in `identity-cost.ts` is a property of the model and applies to
 * any call on it; `perAttemptMaxUsd` is a property of an attempt shape, and Event Identity's was
 * derived from Event Identity's."* The second clause was false. Event Identity's bound came from
 * the **model's** ceilings — the full 1,050,000-token context window billed as cache writes plus
 * the full 128,000-token output allowance, $14.34 → $15 — which multiplied out to a $90
 * logical-call reservation and refused every call against any ceiling this product configures. The
 * rates below stay a fact about the model; everything that is a fact about the *request* is
 * derived here from this boundary's own constants, exactly as `design-intent-cost.ts`,
 * `concept-premise-cost.ts` and `composition-cost.ts` do.
 *
 * **Input.** Every token is bounded before the request exists:
 *
 * | part | bound | why it is a bound |
 * | --- | --- | --- |
 * | the instruction file | `INSTRUCTION_BYTES` | a committed file, measured |
 * | the structured-output schema | `WIRE_SCHEMA_BYTES` | `strictWireSchema()` is sent as `text.format.schema` on **every** attempt and the provider bills it as input; serialized and measured, pinned by test |
 * | the assembled user message | `WORST_USER_MESSAGE_BYTES` | the budget the boundary enforces, sized from the prompt, clarification and identity contracts' own maxima at `CARRIED_CLARIFICATION_ROUNDS` rounds |
 * | the repair pass's extra turns | `REPAIR_OVERHEAD_TOKENS` | the assistant echo is the previous response verbatim, and re-tokenizing an identical string yields an identical count, so `EVENT_IDENTITY_MAX_OUTPUT_TOKENS` caps it; the correction turn is capped **at the boundary** by `REPAIR_FEEDBACK_MAX_BYTES` plus its fixed framing |
 * | message framing | `FRAMING_TOKENS` | role markers and separators the provider adds |
 *
 * Bytes are used as the token bound directly. A byte-level BPE tokenizer's base vocabulary is the
 * 256 single bytes, so a string can never produce more tokens than it has UTF-8 bytes; merges only
 * ever reduce the count. It is a loose bound and a true one, which is the right direction here.
 *
 * **Output.** `EVENT_IDENTITY_MAX_OUTPUT_TOKENS`, because the request now sends it. Reasoning
 * tokens are part of billable output and are inside that cap, so they are priced and not
 * forgotten. Until the request pinned one, this half of the bound could only be the model's own
 * 128,000, and no amount of care about the input half would have made the total honest.
 *
 * **Rates.** The most expensive class the profile prices, on both axes: the long-context table
 * rather than the standard one, and `cacheWriteInput` rather than uncached or cached input. The
 * long-context tier is in fact unreachable for this request — `PER_ATTEMPT_INPUT_TOKEN_BOUND` is
 * well below `longContextThresholdTokens` — and `assertProfileSupportsIdentityRequest` refuses a
 * profile where that stops being true rather than letting a silent tier change land inside a bound
 * that assumed it. Cache **reads** are billed at a tenth of a cache write, so caching can only
 * move real cost further below this bound, never above it.
 *
 * **Attempts.** `MAX_PROVIDER_ATTEMPTS_PER_CALL`, the two passes times the three attempts each
 * pass may make. Nothing else can open a pass: the policy is one repair retry, then visible
 * failure.
 */

/**
 * Measured from the committed instruction file, and pinned by test against the file itself.
 *
 * `event-identity.system.md` is about 26,100 bytes — the largest of the four, because it is the
 * creative interpreter's brief. 30,000 leaves headroom for the ordinary growth a prompt gets
 * without being so loose that the file could double inside it; `identity-cost.test.ts` fails both
 * when the file outgrows the allowance and when it shrinks far below, because a stale allowance is
 * not a safe one.
 */
export const INSTRUCTION_BYTES = 30_000;

/**
 * The strict structured-output schema, serialized, and pinned by test against the real thing.
 *
 * It is an input the request carries on **every** attempt — `text.format.schema` in the same
 * `responses.create` call as the messages — and the provider bills it as input like any other
 * context. An earlier draft of this derivation omitted it, which is the same class of mistake as
 * deriving the bound from the model's context window: a term that is really sent, left out of the
 * arithmetic that claims to bound what is sent. Rule 4 of `docs/phase-4b-plan.md §A.5.1` is what
 * this module exists to satisfy, and unquantified slack elsewhere in the bound does not satisfy it.
 *
 * `strictWireSchema()` serializes to about 9,550 bytes. 12,000 leaves room for the fields a
 * contract change adds; `identity-cost.test.ts` serializes the real schema and fails both when it
 * outgrows this and when it shrinks far below.
 */
export const WIRE_SCHEMA_BYTES = 12_000;

/**
 * How many complete clarification rounds, at every contract's absolute maximum, the enforced user
 * message budget was sized to admit.
 *
 * This is the one number here that is an allowance rather than a contract reading, and it exists
 * because the request has one input nothing bounds: `spec.md §7.6b` puts no lifetime cap on
 * clarification rounds and the assembly is cumulative (CA-5), so the carried history grows with
 * every answered round. Three rounds is nine answers of 4,000 characters each — 36,000 characters
 * of typed answers on top of a 4,000-character prompt — which is far past anything a host does;
 * at realistic answer lengths the same budget admits dozens of rounds. `USER_MESSAGE_MAX_BYTES`
 * makes it a fact instead of an expectation by refusing a request that exceeds it, before any
 * attempt and without spending anything.
 *
 * `identity-cost.test.ts` rebuilds exactly this message from the contracts' own maxima and fails
 * if it grows past the budget, so a field added to the identity contract, a longer free-text
 * limit or a higher clarification ceiling moves this allowance deliberately rather than
 * invalidating the bound quietly.
 */
export const CARRIED_CLARIFICATION_ROUNDS = 3;

/**
 * The worst assembled user message, in UTF-8 bytes.
 *
 * The boundary's enforced budget rather than a second number beside it: a bound the code does not
 * enforce is a bound that can be exceeded, and this is the one input whose contracts do not close
 * on their own. See `USER_MESSAGE_MAX_BYTES` for why it refuses rather than truncating.
 */
export const WORST_USER_MESSAGE_BYTES = USER_MESSAGE_MAX_BYTES;

/**
 * The two turns a repair pass adds, each bounded by something the boundary actually enforces.
 *
 * **The assistant echo** is the previous response resent verbatim. Tokenization is a deterministic
 * function of the string, so re-tokenizing it yields exactly the count the provider produced,
 * which `EVENT_IDENTITY_MAX_OUTPUT_TOKENS` capped.
 *
 * **The correction turn** is *not* bounded by that. `describeIssues` was an unbounded join when
 * this bound was written, and the issue rendering amplifies: the strict wire projection drops
 * `maxItems`, so a schema-conformant response may carry a very long array and a per-element issue
 * line costs several times what the element cost in the response. A response at the output ceiling
 * could therefore produce a correction turn larger than the ceiling itself. So the boundary caps
 * it — `REPAIR_FEEDBACK_MAX_BYTES` and `REPAIR_FEEDBACK_MAX_ISSUES`, applied in `repairFeedback()`,
 * which is the single call site — and this reserve is computed **from** that cap rather than
 * asserted beside it. Raise the cap and the bound moves with it.
 */
export const REPAIR_OVERHEAD_TOKENS =
  EVENT_IDENTITY_MAX_OUTPUT_TOKENS + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES;

/** Role markers and separators the provider adds around four messages. */
export const FRAMING_TOKENS = 1_000;

/** The worst input one provider attempt can carry, in tokens. */
export const PER_ATTEMPT_INPUT_TOKEN_BOUND =
  INSTRUCTION_BYTES +
  WIRE_SCHEMA_BYTES +
  WORST_USER_MESSAGE_BYTES +
  REPAIR_OVERHEAD_TOKENS +
  FRAMING_TOKENS;

/** The worst output one provider attempt can produce, in tokens. It is what the request sends. */
export const PER_ATTEMPT_OUTPUT_TOKEN_BOUND = EVENT_IDENTITY_MAX_OUTPUT_TOKENS;

/**
 * Bumped whenever any input to the derivation moves: the request shape, the token bounds, the
 * rounding, or the attempt topology. Persisted provenance is meaningless if the label can stay
 * still while the arithmetic underneath it changes.
 *
 * `v1` was the first bound derived from Event Identity's own attempt shape. What came before it was
 * not an earlier version of this derivation — it was the model's ceilings, recorded under the model
 * profile's version, which is why that version does not move for this change. `v2` adds the
 * structured-output schema, a term `v1` sent on every attempt and did not count.
 */
export const EVENT_IDENTITY_ATTEMPT_PROFILE_VERSION = "event_identity_attempt_v2@2026-10-03";

/**
 * A model whose verified profile cannot honestly bound this request is refused, not approximated.
 *
 * Three ways that can happen, and each of them would silently break the arithmetic above: the
 * request does not fit the context window; the output ceiling exceeds what the model will produce,
 * so the ceiling is not the ceiling; or the input bound crosses the long-context threshold, at
 * which point pricing the whole request at one table stops being conservative in a way anyone
 * checked.
 */
export function assertProfileSupportsIdentityRequest(profile: ModelCostProfile): void {
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
      `Cost profile ${profile.profileVersion} cannot bound an Event Identity attempt: ` +
        `${problems.join("; ")}.`,
    );
  }
}

/** Up to the next half-dollar. A bound with more precision than its inputs is false precision. */
function roundUp(usd: number): number {
  return Math.ceil(usd * 2) / 2;
}

/**
 * The conservative upper bound on what ONE EventIdentity provider attempt can bill, in USD.
 *
 * For `gpt-5.6-sol` this is $3.50:
 *
 *   input   215,500 tokens × $10 / 1M (long-context cache write) = $2.155
 *   output   32,000 tokens × $30 / 1M (long-context output)      = $0.96
 *                                                                  ------
 *                                                                  $3.115 → $3.50
 *
 * Six attempts per logical call puts the logical-call reservation at $21.00, down from the $90
 * that no configurable ceiling could admit. It was $3.00/$18.00 in the first version of this
 * derivation, which omitted `WIRE_SCHEMA_BYTES`; $2.995 sat so close under the rounding that the
 * missing term moved the result, which is a fair illustration of why an unmeasured input is not
 * covered by looking roughly right.
 *
 * The largest real call measured in the 4G smoke was 7,724 input and 2,270 output tokens — about
 * $0.08 — so this is still a bound with a great deal of room in it, which is what a bound is for.
 */
export function eventIdentityAttemptMaxUsd(model: string, now: Date = new Date()): number {
  const profile = requireCostProfile(model, now);
  assertProfileSupportsIdentityRequest(profile);
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
 * Optional per-environment override of the per-attempt maximum.
 *
 * It can only make the bound **more** conservative. A number in an environment variable is not
 * evidence that anyone checked the provider's limits, so it cannot be used to lower the derived
 * bound — that would be exactly the "a number appeared, therefore it is verified" shortcut the
 * contract exists to refuse.
 */
export function providerAttemptMaxUsd(model: string, now: Date = new Date()): number {
  // The derived bound for a verified profile, and the dev fallback's own number otherwise — which
  // `eventIdentityAttemptMaxUsd` returns unchanged, because a profile with no rates can derive
  // nothing and its deliberately large figure has to stand.
  const base = eventIdentityAttemptMaxUsd(model, now);
  const raw = process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD;
  if (raw === undefined || raw.trim() === "") return base;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("IDENTITY_PROVIDER_ATTEMPT_MAX_USD must be a positive number");
  }
  return Math.max(parsed, base);
}

/**
 * The worst a single logical call can cost, which is what a claim reserves against the ceiling.
 *
 * Pinned to `MAX_PROVIDER_ATTEMPTS_PER_CALL` rather than to a literal, so raising
 * `MAX_TRANSIENT_RETRIES` raises the reservation instead of quietly raising real worst-case spend
 * past it. One successful response would be the wrong unit: a claim may cost every attempt the
 * retry policy permits.
 */
export function logicalCallMaxUsd(model: string, now: Date = new Date()): number {
  return providerAttemptMaxUsd(model, now) * MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/* ------------------------------------------------------------------ estimating one call */

export type CostRelevantUsage = Pick<
  EventIdentityUsage,
  "responses" | "providerResponses" | "providerAttempts" | "unknownUsageAttempts"
>;

export interface CostEstimate {
  /** USD. An upper bound whenever `exact` is false. */
  usd: number;
  /**
   * True only when every observed response was priced from a verified profile at its own tier,
   * with every billable token class present, and no attempt's usage was unknown.
   */
  exact: boolean;
  /** Attempts charged at the per-attempt maximum because they could not be priced. */
  unpricedAttempts: number;
  /**
   * The provider served a response on a tier this profile does not price.
   *
   * Surfaced rather than swallowed: the estimate stays safe by charging the maximum, but somebody
   * needs to know the account is serving a tier the bound was not built for.
   */
  servedUnpricedTier: boolean;
}

/**
 * Whether **every** billable token class needed to price this response is present.
 *
 * All four, not just input and output. If `input_tokens_details` is missing — a gateway, a proxy,
 * an older API version — the cache classes read as zero, every input token is billed as uncached,
 * and a response that was in fact 900k cache-write tokens at the long-context tier is recorded 20%
 * cheap *and labelled exact*. That is the optimistic fallback §A.5.1 says does not exist.
 */
function priceable(usage: ProviderResponseUsage): boolean {
  return (
    typeof usage.inputTokens === "number" &&
    typeof usage.outputTokens === "number" &&
    typeof usage.cachedInputTokens === "number" &&
    typeof usage.cacheWriteInputTokens === "number"
  );
}

/**
 * Whether the provider served this response on the tier the profile prices.
 *
 * The request pins `service_tier`, but the SDK documents the served value as possibly different —
 * so pinning alone is half an assumption. A response served on `fast` is billed at twice standard;
 * priced from the standard table it is recorded at half its cost with `exact: true`, and the
 * per-attempt clamp is an order of magnitude too loose to notice. When the provider does not say,
 * the request's pin is the best evidence there is and the response is priced normally.
 */
function servedOnPricedTier(usage: ProviderResponseUsage): boolean {
  const served = usage.servedServiceTier;
  if (served === undefined || served === null) return true;
  return served === EVENT_IDENTITY_SERVICE_TIER;
}

/**
 * One response, at its own tier.
 *
 * The threshold is on input tokens and applies to the **whole request**, which is why this cannot
 * be done on an aggregate: a repair attempt may cross it while the first attempt did not.
 */
function priceResponse(profile: ModelCostProfile, usage: ProviderResponseUsage): number {
  const input = usage.inputTokens ?? 0;
  const prices =
    input > profile.longContextThresholdTokens ? profile.longContext : profile.standard;
  const cached = usage.cachedInputTokens ?? 0;
  const cacheWrite = usage.cacheWriteInputTokens ?? 0;
  // Cache reads and cache writes are both subsets of the reported input; what is left is ordinary
  // uncached input. Clamped, because a provider that reports overlapping subsets must not produce
  // a negative charge.
  const uncached = Math.max(input - cached - cacheWrite, 0);
  // `outputTokens` already includes reasoning. Adding `reasoningTokens` would bill it twice.
  const output = usage.outputTokens ?? 0;
  return (
    (uncached * prices.input +
      cached * prices.cachedInput +
      cacheWrite * prices.cacheWriteInput +
      output * prices.output) /
    1_000_000
  );
}

/**
 * What this invocation may have cost.
 *
 * Each observed response is priced at its own tier from the verified profile. Everything else —
 * attempts that threw, responses missing a token class, and every attempt when the profile is the
 * unverified fallback — is charged the per-attempt maximum, **once per attempt**.
 *
 * **Total by construction.** It takes an already-resolved profile rather than a model id, because
 * it runs *after* the provider has been paid: resolving there could throw between the response and
 * the capture, losing a paid response to a configuration mismatch. The mismatch is not
 * hypothetical — the provider answers with a dated snapshot id (`…-2026-08-01`) that no profile
 * matches by exact string. The profile the claim already reserved against is the right one to
 * price with anyway: it is the bound the money was held against.
 */
export function estimateIdentityCallCostUsd(
  profile: ModelCostProfile,
  usage: CostRelevantUsage,
  // Required, not defaulted to `profile.perAttemptMaxUsd`: an environment override can raise the
  // bound, and a caller that forgot the argument would record unpriced attempts *below* what the
  // claim reserved. `IdentityLimits.perAttemptMaxUsd` exists to be passed here.
  attemptMaxUsd: number,
): CostEstimate {
  const attemptMax = attemptMaxUsd;
  const observed = Math.max(usage.providerResponses, 0);
  const unknown = Math.max(usage.unknownUsageAttempts, 0);
  // Attempts are the unit: `providerResponses` and `unknownUsageAttempts` overlap, because a
  // response that arrived without a usage block is in both. Summing those two charges such an
  // attempt twice, and when nothing can be priced that is the entire bill.
  const attempts = Math.max(usage.providerAttempts, observed, unknown, 0);

  // An unverified fallback prices nothing: there are no rates to price with, and pretending
  // otherwise is the optimistic fallback this whole section exists to refuse.
  if (!isVerified(profile)) {
    return {
      usd: attempts * attemptMax,
      exact: false,
      unpricedAttempts: attempts,
      servedUnpricedTier: false,
    };
  }

  let usd = 0;
  let pricedResponses = 0;
  let unpriceableResponses = 0;
  let clamped = false;
  let servedUnpricedTier = false;
  for (const response of usage.responses) {
    if (!servedOnPricedTier(response)) {
      // Charged the maximum, not guessed at another tier's rates: we price what we verified.
      servedUnpricedTier = true;
      unpriceableResponses += 1;
    } else if (priceable(response)) {
      const raw = priceResponse(profile, response);
      // Clamped to what one attempt can legally cost. Not hiding anything — a single attempt
      // cannot exceed this, so a larger number means the provider reported impossible usage. Left
      // unclamped, one bogus report (`input_tokens: 1e12` → ~$8M) lands in `cost_estimate_usd`,
      // is summed into the ceiling's recorded spend, and refuses every host's generation for the
      // rest of the window behind an indistinguishable payload, with no operator lever but
      // editing the row.
      if (raw > attemptMax) {
        clamped = true;
        console.error(
          `identity cost: a response priced at ${raw} exceeds the per-attempt maximum ` +
            `${attemptMax} for ${profile.model}; clamping. That usage is not believable.`,
        );
      }
      usd += Math.min(raw, attemptMax);
      pricedResponses += 1;
    } else {
      // We know a response arrived; we just cannot say what it cost.
      unpriceableResponses += 1;
    }
  }

  // A response the summary claimed but the detail never described. Silence is not evidence of zero.
  unpriceableResponses += Math.max(observed - usage.responses.length, 0);

  // Attempts that threw: every attempt that produced no response at all. Derived by subtraction
  // rather than read from `unknownUsageAttempts`, because that counter *also* includes responses
  // that arrived without usage — which `unpriceableResponses` has already charged. Adding the two
  // would bill such an attempt twice, which is the same overlap that made the unpriced branch
  // exceed the reservation.
  const threwAttempts = Math.max(attempts - observed, 0);
  const unpriced = unpriceableResponses + threwAttempts;

  usd += unpriced * attemptMax;
  return {
    usd,
    // A clamped response was not priced from what the provider said, so the total is a bound.
    exact: unpriced === 0 && pricedResponses === observed && observed > 0 && !clamped,
    unpricedAttempts: unpriced,
    servedUnpricedTier,
  };
}
