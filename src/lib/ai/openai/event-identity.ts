import "server-only";

/**
 * The Event Identity call against OpenAI — `docs/model-contracts.md §4`, `§8`.
 *
 * One provider, one call, one boundary. This file owns the SDK, the request shape, the
 * retry policy and usage parsing; nothing above it knows which provider is in use, and
 * nothing below the boundary interprets creative meaning. There is deliberately no
 * multi-provider orchestration: the stack is locked to a thin interface
 * (`docs/technology-decisions.md §8`), and a second provider is a decision, not a
 * refactor.
 *
 * Retry policy, exactly as `§8` specifies for this call:
 *
 * - **provider failure** (network, 429, 5xx) → ordinary transient retry, bounded, with
 *   backoff. These produced no output we can judge, so they cost nothing *creatively* — which is
 *   the only sense in which they are free. A timeout or a reset may well have reached provider
 *   execution and been billed; we cannot tell, so `unknownUsageAttempts` counts them and cost
 *   accounting charges each the per-attempt maximum (`docs/phase-4b-plan.md §A.5.1`).
 * - **invalid structured output** → exactly one repair retry, then fail visibly. Both responses
 *   were billed, so both are carried out and both are priced.
 *
 * The distinction matters more than it looks. Re-prompting until something validates
 * would let a creatively weak response be replaced by a luckier one, and Phase 4A exists
 * to measure creative quality honestly (`docs/product-doctrine.md §3`). One repair, then
 * the failure is reported as a failure.
 *
 * No hidden reasoning is requested, returned to callers or persisted. Reasoning token
 * *counts* are recorded as usage; reasoning *content* is never stored
 * (`spec.md §7.10` — nothing user-facing is a model trace).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { openAiEnv } from "@/lib/env";
import {
  EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";

import {
  assembleEventIdentityUserMessage,
  type CarriedClarification,
  type PriorRevision,
} from "./event-identity-input";
import type { EventIdentityResult } from "@/lib/ai/event-identity/contract";
import { strictWireSchema } from "@/lib/ai/event-identity/wire-schema";
import {
  describeIssues,
  parseAndValidateEventIdentityResult,
  type ValidationIssue,
} from "@/lib/ai/event-identity/validate";

const PROMPT_PATH = path.join(process.cwd(), "docs", "model-prompts", "event-identity.system.md");

/**
 * Bounded transient retries. Provider-side failures only; never an output problem.
 *
 * Exported because two things downstream are pinned to them and must fail when they change:
 * the claim lease, which has to outlast the worst legitimate call (`docs/phase-4b-plan.md §A.5`),
 * and the logical-call spend maximum, which reserves against every attempt this policy permits
 * (§A.5.1). Both would be silently wrong if these moved and nothing noticed.
 */
export const MAX_TRANSIENT_RETRIES = 2;
export const TRANSIENT_BACKOFF_MS = [500, 1500];

/** A hung request must not eat the caller's budget and abort whatever follows it. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000;

/** Attempts at the model per logical call: the original, then the single repair. */
export const EVENT_IDENTITY_PASSES = 2;

/**
 * The provider service tier every EventIdentity request is sent on.
 *
 * Pinned, not inherited. Left unset the request takes whatever the provider or the project happens
 * to be configured for, and the verified cost profile was built against standard pricing — Fast
 * Mode is 2× and the Batch/Flex tiers are ½, so an inherited tier would silently price the call
 * against a bound that does not describe it. Sending it explicitly makes the assumption the
 * profile rests on a property of the request rather than of an account setting somebody can
 * change.
 *
 * Not configurable in this phase. Another tier needs its own verified profile, and because the
 * tier is part of `modelConfig` it necessarily produces a different attempt key.
 */
export const EVENT_IDENTITY_SERVICE_TIER = "default" as const;

/**
 * Provider-side response persistence, off.
 *
 * EventIdentity is stateless: the repair pass resends the rejected assistant turn explicitly
 * rather than referring to a stored response, so nothing here needs the provider to keep one. Left
 * at the provider's default, host prompts and model output would accumulate in a third-party store
 * we neither read nor purge — and `spec.md §27`'s retention discipline would end at our own
 * database boundary rather than at the data.
 */
export const EVENT_IDENTITY_STORE_RESPONSES = false as const;

/**
 * The output ceiling every EventIdentity request sends, and therefore the one its cost bound is
 * derived from.
 *
 * Without it the ceiling is the model's own 128,000, and the per-attempt bound in
 * `identity-cost.ts` had to be derived from the model's limits rather than from this request —
 * which put the logical-call reservation at $90, above any ceiling this product can configure, so
 * every call was refused before it reached the provider. This is the half of that fix that lives
 * at the boundary: the bound cannot describe the output half of an attempt until the attempt says
 * what the output half is.
 *
 * `docs/phase-4b-plan.md §A.5.1` refused an *invented* ceiling — "adding a tight output limit for
 * cleaner accounting could change what EventIdentity produces, which is a creative decision and
 * not an accounting one". That reasoning is honoured rather than overridden: 32,000 is two orders
 * of magnitude above anything this call can legitimately produce, so it cannot change the answer.
 * The response is one envelope of bounded fields — the identity brief, ten quoted facts and at
 * most three questions, about 8 KB at the contract's own maxima, a few thousand tokens — and the
 * remaining ~29,500 tokens are reasoning headroom, which at `high` effort is the only part that
 * can legitimately run long. The three sibling calls pin 32,000, 32,000 and 48,000 for
 * comparable-or-smaller interpretive work; Event Identity is the most interpretive of the four, so
 * it gets no less than the 32,000 the two nearest of them pin.
 *
 * A response that somehow reached it would be truncated, arrive as unparseable JSON, and be
 * handled as schema-invalid — the one class that may open the repair pass — rather than being
 * silently accepted in part.
 */
export const EVENT_IDENTITY_MAX_OUTPUT_TOKENS = 32_000;

/**
 * The hard budget on the assembled user message, in UTF-8 bytes, enforced before any attempt.
 *
 * **Why this is a budget and not an observation.** Every other input to this call is bounded by a
 * contract: `events.prompt` by `MAX_PROMPT_LENGTH`, an answer's free text by
 * `MAX_CLARIFICATION_FREE_TEXT`, the questions and option labels by the identity contract's own
 * `max()`s, the questions per round by `CLARIFICATION_CEILING`. The *number of rounds* is not —
 * `spec.md §7.6b` puts no lifetime cap on clarification rounds, and the assembly is cumulative by
 * design (CA-5: "an answer left out of this message is an answer the model does not have"). So the
 * assembled message has no bound of its own, and a spend bound derived from "the contracts'
 * maxima" would be a bound on a request this code can exceed.
 *
 * This is where it stops being exceedable. The allowance is sized in `identity-cost.ts` from those
 * same contract maxima at `CARRIED_CLARIFICATION_ROUNDS` complete rounds — see the derivation
 * there — and this budget is what makes that sizing a fact rather than an expectation.
 *
 * **It refuses; it never truncates.** Dropping or shortening a carried answer would send the model
 * a clarification history the host did not give, which is the one thing CA-5 forbids. Over budget,
 * no attempt is made and nothing is spent: that is strictly better than paying for an attempt
 * larger than the claim reserved for. The condition is unreachable for any plausible host — about
 * 117 KB of answer text, nine answers of 4,000 characters each — and if it is ever reached, the
 * remedy is a product decision about bounding the history (at answer time, or by carrying a
 * summary), not a quietly larger reserve.
 */
export const USER_MESSAGE_MAX_BYTES = 132_000;

/**
 * The hard budget on the correction turn a repair pass appends, in issues and in UTF-8 bytes.
 *
 * **Why a budget exists at all.** `describeIssues` is an unbounded `map`/`join` over however many
 * issues there are, and it *amplifies*: the strict wire projection drops `maxItems` by design
 * (`wire-schema.ts`), so a response that is perfectly conformant to the schema sent may carry an
 * arbitrarily long `toneKeywords` or `questions` array, each element costing a few tokens in the
 * response and several times that in a per-element issue line. Left unbudgeted, a response sitting
 * at `EVENT_IDENTITY_MAX_OUTPUT_TOKENS` can produce a correction turn several times larger than
 * that ceiling — which would put the repair attempt's input past the reserve `identity-cost.ts`
 * holds for it while staying below the long-context threshold, so nothing downstream would notice
 * except a clamp in the cost estimator logging it as an unbelievable provider report. The
 * DesignIntent boundary found and fixed this on its own path; this is the same defect, and the
 * same fix, on the call it was copied from.
 *
 * **Why these numbers.** The same as `design-intent.ts`, deliberately: a correction is only useful
 * if a model can act on it, forty issue lines is far more than any real defect produces, and 8,000
 * bytes is roughly two hundred lines of `- path: message`. Anything beyond is not extra help, it
 * is the amplification above.
 *
 * The reserve in `identity-cost.ts` is computed **from** these constants rather than asserted
 * alongside them, so raising one moves the bound instead of silently invalidating it.
 */
export const REPAIR_FEEDBACK_MAX_ISSUES = 40;
export const REPAIR_FEEDBACK_MAX_BYTES = 8_000;

/** The fixed sentences the correction turn wraps the feedback in. Measured, not estimated. */
export const REPAIR_TURN_FRAMING_BYTES = 500;

/** Every request-shaping option that is not the prompt, the schema or the assembled input. */
export type EventIdentityModelConfig = {
  model: string;
  reasoningEffort: string;
  serviceTier: typeof EVENT_IDENTITY_SERVICE_TIER;
  store: typeof EVENT_IDENTITY_STORE_RESPONSES;
  maxOutputTokens: typeof EVENT_IDENTITY_MAX_OUTPUT_TOKENS;
};

/**
 * The canonical model configuration for an EventIdentity call.
 *
 * One builder, so a caller cannot assemble a basis that omits an option the request actually
 * sends. Everything here reaches `modelConfigDigest` and therefore the attempt key: two requests
 * that would be billed differently or persisted differently are different calls, and a deploy that
 * changes one mid-flight is caught by the one-in-flight guard rather than by paying twice.
 */
export function eventIdentityModelConfig(
  model: string,
  reasoningEffort: string,
): EventIdentityModelConfig {
  return {
    model,
    reasoningEffort,
    serviceTier: EVENT_IDENTITY_SERVICE_TIER,
    store: EVENT_IDENTITY_STORE_RESPONSES,
    // The output ceiling is part of the configuration for the same reason the service tier is: it
    // changes what an attempt can be billed, so two requests that differ in it are different
    // calls and must not share an attempt key.
    maxOutputTokens: EVENT_IDENTITY_MAX_OUTPUT_TOKENS,
  };
}

/**
 * The most provider attempts one logical `generateEventIdentity` call can make.
 *
 * Six today. This is the number the spend reservation multiplies by, so it is exported rather
 * than recomputed: a call that ends up costing six attempts must not exceed a ceiling that
 * reserved for one.
 */
export const MAX_PROVIDER_ATTEMPTS_PER_CALL = EVENT_IDENTITY_PASSES * (MAX_TRANSIENT_RETRIES + 1);

let cachedSystemPrompt: string | undefined;

/**
 * The production system prompt is the committed file, read at runtime rather than
 * inlined, so the artifact under `docs/model-prompts/` is provably the one that ran and
 * `EVENT_IDENTITY_PROMPT_VERSION` describes a real file (`docs/model-contracts.md §2`).
 */
export function systemPrompt(): string {
  if (cachedSystemPrompt === undefined) {
    cachedSystemPrompt = readFileSync(PROMPT_PATH, "utf8");
  }
  return cachedSystemPrompt;
}

/**
 * One provider response's billable usage, as the provider reported it.
 *
 * Kept per response, not only aggregated, because pricing is not linear across a call: the
 * long-context tier applies per request, so one attempt can cross the threshold while another does
 * not. Summing first and pricing afterwards would silently charge both at whichever rate the
 * aggregate happened to land in.
 */
export interface ProviderResponseUsage {
  inputTokens?: number;
  /** Cache **reads**, billed at a discount. A subset of `inputTokens`. */
  cachedInputTokens?: number;
  /** Cache **writes**, billed at a premium over uncached input. A subset of `inputTokens`. */
  cacheWriteInputTokens?: number;
  /** Billable output. **Already includes** `reasoningTokens`; never add the two together. */
  outputTokens?: number;
  /** A breakdown of `outputTokens`, kept as telemetry. Counts only — never content. */
  reasoningTokens?: number;
  /**
   * The tier the provider says it **served** this response on.
   *
   * Not the same question as the tier we asked for: the SDK documents this as "may be different
   * from the value set in the parameter". Pinning the request is only half the assumption the cost
   * profile rests on — a response served on `fast` costs twice standard, and priced from the
   * standard table it would be recorded at half its real cost and labelled exact. Undefined when
   * the provider does not say.
   */
  servedServiceTier?: string | null;
}

export interface EventIdentityUsage {
  provider: "openai";
  model: string;
  /**
   * The **accepted or final** response's request id, not an identifier for every attempt.
   *
   * One logical call can make up to `MAX_PROVIDER_ATTEMPTS_PER_CALL` provider attempts and
   * receive two billable responses. This field keeps its singular shape because that is what
   * `spec.md §9.6` asks for; it does not pretend to name them all.
   */
  providerRequestId?: string;
  /**
   * Token counts **aggregated over every response this invocation received**, rejected and
   * accepted alike (`docs/phase-4b-plan.md §A.5.1`).
   *
   * Reporting only the accepted response would drop the tokens of a rejected first response that
   * was billed just the same, and the repair path is exactly where a call gets expensive. A field
   * is absent when no response reported it, which is not the same as zero.
   */
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  /**
   * Billable output summed over every response. `reasoningTokens` is a **breakdown** of this, not
   * an addition to it: the provider reports `output_tokens_details.reasoning_tokens` as part of
   * `output_tokens`, so adding them would bill reasoning twice.
   */
  outputTokens?: number;
  reasoningTokens?: number;
  /** Per-response usage, in arrival order. Pricing reads this; the summary above is telemetry. */
  responses: ProviderResponseUsage[];
  /** How many provider responses this invocation actually received: 0, 1 or 2. */
  providerResponses: number;
  /**
   * How many HTTP attempts this invocation made at the provider, at most
   * `MAX_PROVIDER_ATTEMPTS_PER_CALL`.
   *
   * The unit cost accounting charges. `providerResponses` and `unknownUsageAttempts` overlap —
   * a response that arrives without a usage block is both — so adding those two together
   * double-charges that attempt, and for a call where nothing can be priced that is the whole
   * bill. Attempts do not overlap with anything.
   */
  providerAttempts: number;
  /**
   * Attempts whose usage we do not know, and therefore cannot price.
   *
   * Counts every attempt that threw before a response reached us — a timeout or a reset may have
   * reached provider execution and billed — plus any response that arrived without a usage block.
   * Cost accounting charges each of these the per-attempt maximum rather than zero, which is the
   * only honest direction when the provider's billing is unobservable to us.
   */
  unknownUsageAttempts: number;
  latencyMs: number;
  /** Transient provider retries consumed. */
  transientRetries: number;
  /** True when the first response validated with no repair retry. */
  schemaValidFirstCall: boolean;
  /** Repair retries consumed: 0 or 1 (`docs/model-contracts.md §8`). */
  repairRetries: number;
}

export interface EventIdentityCallResult {
  /** Raw provider text of the **accepted** response, kept verbatim for the review artifact. */
  raw: string;
  /**
   * Every provider text this invocation was billed for, oldest first.
   *
   * On a first-call success this is `[raw]`. After a repair it is `[rejected, raw]` — the
   * rejected response was paid for too, and until T9A the success path dropped it, so a
   * successful repair preserved less evidence than a failed one.
   */
  rawResponses: string[];
  output: EventIdentityResult;
  usage: EventIdentityUsage;
  promptVersion: string;
  schemaVersion: string;
  /**
   * The exact user message sent, and only that.
   *
   * Not the system prompt, not the correction turn a repair appends, and not the assistant echo of
   * a rejected response that sits between them — that echo is raw model output, and letting it
   * reach a caller that scans this text would put a stochastic string inside a deterministic
   * check. Identical on both attempts by construction.
   */
  requestText: string;
  /** Which assembly produced `requestText`. Moves independently of prompt and schema. */
  inputAssemblyVersion: string;
}

export class EventIdentityError extends Error {
  constructor(
    message: string,
    readonly kind: "provider" | "invalid_output",
    readonly issues?: ValidationIssue[],
    readonly usage?: Partial<EventIdentityUsage>,
    /**
     * Provider text already returned and paid for when this failed, oldest first.
     *
     * An `invalid_output` failure is not a call that produced nothing: the provider answered,
     * twice on the repair path, and our own validation rejected what came back. Dropping that
     * text on the floor loses a paid response the caller may need to keep — and on a one-shot
     * corpus it is unrecoverable.
     *
     * Empty only when no response had yet arrived. A `provider` failure on the repair attempt
     * carries the first one, so `kind` does not tell you whether this is empty; its length does.
     */
    readonly rawResponses?: string[],
  ) {
    super(message);
    this.name = "EventIdentityError";
  }
}

/**
 * The assembled request is larger than `USER_MESSAGE_MAX_BYTES`, so no attempt was made.
 *
 * Its own type, not an `EventIdentityError`: neither of that type's kinds is true here. The
 * provider did not fail and the model did not answer badly — this call was refused before a client
 * existed, because sending it would have cost more than the claim reserved for. It carries a
 * zero-attempt `usage` annotation for the same reason the validator-bug path carries one: the
 * orchestrator's failure row charges `providerAttempts`, and without it a call that spent nothing
 * would be recorded as having spent one attempt's maximum.
 *
 * Upstream it travels the orchestrator's "our own code threw" path: the claim settles, a run row
 * is written with zero cost and `error_code = 'internal_error'`, and the error is rethrown rather
 * than answered with `retry_available` — because retrying the same request would be refused the
 * same way, and telling the host to try again shortly would be false. Reaching this is a signal
 * that the history budget needs a product decision, not a larger reserve.
 */
export class EventIdentityRequestTooLargeError extends Error {
  readonly usage: Partial<EventIdentityUsage>;

  constructor(
    readonly bytes: number,
    readonly maxBytes: number,
  ) {
    super(
      `The assembled Event Identity request is ${bytes} bytes, past the ${maxBytes}-byte budget ` +
        "the per-attempt spend bound is derived from. No provider attempt was made and nothing " +
        "was spent. The carried clarification history is the only input that can grow without a " +
        "contract bound; raising the budget means re-deriving the bound in identity-cost.ts.",
    );
    this.name = "EventIdentityRequestTooLargeError";
    this.usage = {
      responses: [],
      providerResponses: 0,
      providerAttempts: 0,
      unknownUsageAttempts: 0,
      transientRetries: 0,
      repairRetries: 0,
      latencyMs: 0,
    };
  }
}

export interface GenerateEventIdentityInput {
  /** The host's own words. This is the only place in the product they are read. */
  prompt: string;
  /**
   * A rerun's clarification history (`spec.md §7.6b`), absent on a first call.
   *
   * The revisions travel with the answers because the assembly resolves each answer's question out
   * of the revision that asked it — the same `(revision, question_index)` locator
   * `clarification_answers` stores — rather than trusting a question string handed in beside it.
   */
  clarification?: {
    priorRevisions: PriorRevision[];
    answers: CarriedClarification[];
  };
}

function isTransient(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  // No status means the request did not complete: connection reset, DNS, timeout.
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The user message is assembled in `event-identity-input.ts`, not here.
 *
 * It used to be a local function, and moving it is the point rather than tidying: every
 * model-visible string this call sends now lives in the one file
 * `MODEL_VISIBLE_SURFACES["input assembly"]` names, so the leakage scan observes all of it. A
 * label or a precedence sentence left in this module would be model-visible text outside the
 * surface declared for it before the validation corpus was written.
 */
function userMessage(input: GenerateEventIdentityInput): string {
  return assembleEventIdentityUserMessage({
    prompt: input.prompt,
    priorRevisions: input.clarification?.priorRevisions,
    answers: input.clarification?.answers,
  });
}

/**
 * The single enforcement point for `USER_MESSAGE_MAX_BYTES`.
 *
 * Called on the hoisted message, so it covers both attempts of a repair pass — the same bytes go
 * out on each — and it runs before the OpenAI client is constructed, so a refusal provably costs
 * nothing.
 */
function assertUserMessageWithinBudget(message: string): void {
  const bytes = Buffer.byteLength(message, "utf8");
  if (bytes > USER_MESSAGE_MAX_BYTES) {
    throw new EventIdentityRequestTooLargeError(bytes, USER_MESSAGE_MAX_BYTES);
  }
}

/**
 * Cut a string to a UTF-8 byte budget without splitting a code point.
 *
 * Binary search over code points rather than a byte slice: `Buffer.slice().toString()` would
 * replace a severed multi-byte sequence with U+FFFD, which can be *longer* than what it replaced
 * and so can push the result back past the budget it was called to enforce.
 */
function clampToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const points = Array.from(text);
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(points.slice(0, mid).join(""), "utf8") <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return points.slice(0, low).join("");
}

/**
 * The validator's issues, rendered for the correction turn and **bounded**.
 *
 * `describeIssues` is an unbounded join, and the issue list is derived from a response whose size
 * the output ceiling bounds only in tokens — see `REPAIR_FEEDBACK_MAX_BYTES` for why that is not
 * the same thing. This is the single call site, and it is the one place the budget is applied, so
 * the reserve the cost module holds for this turn is a property of the code rather than a claim
 * about it.
 *
 * Both limits announce themselves in the text. A model asked to correct an answer must not be told
 * a truncated list is the whole list, and a reader of a failed run must be able to tell "nothing
 * else was wrong" from "we stopped listing".
 */
export function repairFeedback(issues: readonly ValidationIssue[]): string {
  const kept = issues.slice(0, REPAIR_FEEDBACK_MAX_ISSUES);
  const omitted = issues.length - kept.length;
  let text = describeIssues(kept);
  if (omitted > 0) text += `\n- … and ${omitted} further issue(s), not listed`;

  const marker = "\n- … list truncated";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (Buffer.byteLength(text, "utf8") > REPAIR_FEEDBACK_MAX_BYTES) {
    text = clampToBytes(text, REPAIR_FEEDBACK_MAX_BYTES - markerBytes) + marker;
  }
  return text;
}

export async function generateEventIdentity(
  input: GenerateEventIdentityInput,
): Promise<EventIdentityCallResult> {
  const env = openAiEnv();
  /**
   * Built once, before the loop — and before the client.
   *
   * The repair attempt appends a correction turn rather than replacing the user message, so the
   * same assembled text is sent on both attempts — hoisting it makes that a property of the code
   * rather than of two calls happening to agree, and gives the caller the exact bytes that went
   * out, which is what `requestText` promises.
   *
   * Assembled ahead of the client so the budget check below provably precedes every path that
   * could spend: over budget, no client is ever constructed.
   */
  const assembledUserMessage = userMessage(input);
  assertUserMessageWithinBudget(assembledUserMessage);

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    // Retrying is this file's job, not the SDK's. Left at the default (2) every
    // `create()` would be up to three HTTP attempts, making the worst case eighteen
    // requests against the six this policy documents — and `transientRetries` would
    // undercount real provider load threefold in the run report.
    maxRetries: 0,
    timeout: PROVIDER_REQUEST_TIMEOUT_MS,
  });
  const schema = strictWireSchema();
  const startedAt = Date.now();

  let transientRetries = 0;
  let repairRetries = 0;
  let correctionFeedback: string | undefined;
  let previousRaw: string | undefined;
  let lastIssues: ValidationIssue[] | undefined;
  /**
   * Every provider text this call has been billed for, oldest first.
   *
   * The durability boundary the eval journal provides starts when this function returns. Our own
   * deterministic validation runs after the money is spent and before that return, so anything
   * paid for in here has to leave with the error or it is gone.
   */
  const rawResponses: string[] = [];
  /**
   * Usage aggregated across every response, and a count of the attempts we cannot price.
   *
   * `add` keeps a field `undefined` until some response reports it, so "no response told us" and
   * "the total is zero" stay distinguishable. `unknownUsageAttempts` is what stops an ambiguous
   * failure being costed at zero.
   */
  const agg: {
    input?: number;
    cached?: number;
    cacheWrite?: number;
    output?: number;
    reasoning?: number;
  } = {};
  const perResponse: ProviderResponseUsage[] = [];
  let unknownUsageAttempts = 0;
  let providerAttempts = 0;
  const add = (key: keyof typeof agg, value: number | undefined) => {
    if (typeof value === "number") agg[key] = (agg[key] ?? 0) + value;
  };
  const aggregateUsage = () => ({
    inputTokens: agg.input,
    cachedInputTokens: agg.cached,
    cacheWriteInputTokens: agg.cacheWrite,
    outputTokens: agg.output,
    reasoningTokens: agg.reasoning,
    responses: [...perResponse],
    providerResponses: rawResponses.length,
    providerAttempts,
    unknownUsageAttempts,
  });

  // Two passes at most: the original call, then the single repair retry.
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const messages: OpenAI.Responses.ResponseInput = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: assembledUserMessage },
    ];
    if (correctionFeedback && previousRaw !== undefined) {
      // The Responses call is stateless, so without this the model is asked to correct a
      // response it was never shown — making the "repair" a fresh generation with a
      // confusing preamble, which is exactly the re-roll this policy exists to prevent.
      messages.push({ role: "assistant", content: previousRaw });
      messages.push({
        role: "user",
        content: [
          "Your previous response did not satisfy the schema:",
          correctionFeedback,
          "",
          "Return the corrected object. Do not change your creative interpretation to make",
          "validation easier — fix only what was structurally wrong.",
        ].join("\n"),
      });
    }

    let response: OpenAI.Responses.Response | undefined;
    for (let t = 0; ; t += 1) {
      try {
        providerAttempts += 1;
        response = await client.responses.create({
          model: env.OPENAI_MODEL,
          input: messages,
          reasoning: { effort: env.OPENAI_REASONING_EFFORT },
          // All three pinned rather than inherited, and all three part of `modelConfig` — see the
          // constants. The output ceiling is what makes the output half of the per-attempt spend
          // bound a property of this request rather than of the model's own 128,000.
          service_tier: EVENT_IDENTITY_SERVICE_TIER,
          store: EVENT_IDENTITY_STORE_RESPONSES,
          max_output_tokens: EVENT_IDENTITY_MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "event_identity_result",
              strict: true,
              schema,
            },
          },
        });
        break;
      } catch (error) {
        // An attempt that threw never told us what it cost, and it is **not** an attempt that
        // cost nothing: a timeout or a connection reset can reach provider execution and be
        // billed. Counted here, charged at the per-attempt maximum later.
        unknownUsageAttempts += 1;
        if (t < MAX_TRANSIENT_RETRIES && isTransient(error)) {
          transientRetries += 1;
          await sleep(TRANSIENT_BACKOFF_MS[Math.min(t, TRANSIENT_BACKOFF_MS.length - 1)]);
          continue;
        }
        // `rawResponses` is usually empty here, but not always: a provider failure on the
        // repair attempt follows a first response that was returned, billed and rejected.
        // Leaving it off would drop that text and let the caller record the case as one the
        // provider never answered. An empty list still means only that no text was captured,
        // never that nothing was billed.
        throw new EventIdentityError(
          `OpenAI request failed: ${(error as Error)?.message ?? String(error)}`,
          "provider",
          undefined,
          { latencyMs: Date.now() - startedAt, transientRetries, ...aggregateUsage() },
          [...rawResponses],
        );
      }
    }

    const raw = response.output_text ?? "";
    rawResponses.push(raw);
    // No cast: the SDK declares both fields, so a rename breaks the build rather than silently
    // reclassifying every cache write as ordinary input at a quarter of its price.
    const details = response.usage?.input_tokens_details;
    perResponse.push({
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens: details?.cached_tokens,
      cacheWriteInputTokens: details?.cache_write_tokens,
      outputTokens: response.usage?.output_tokens,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens,
      servedServiceTier: response.service_tier,
    });
    add("input", response.usage?.input_tokens);
    add("cached", details?.cached_tokens);
    add("cacheWrite", details?.cache_write_tokens);
    add("output", response.usage?.output_tokens);
    add("reasoning", response.usage?.output_tokens_details?.reasoning_tokens);
    // A response we received but cannot price is as unpriceable as one that never arrived.
    if (!response.usage) unknownUsageAttempts += 1;
    // Validation is our code, not theirs. A bug in a zod refinement throws out of `safeParse`
    // rather than being reported as an issue, and would otherwise destroy the text just paid
    // for. So it is caught, annotated with the paid responses, and rethrown as itself: the same
    // object, the same type, no `kind` — a checker bug must not read as a model failure.
    //
    // The annotation is guarded because a non-object or frozen throw would make the assignment
    // itself throw, replacing the original exception and losing the responses in the one place
    // whose whole purpose is keeping them.
    let outcome: ReturnType<typeof parseAndValidateEventIdentityResult>;
    try {
      outcome = parseAndValidateEventIdentityResult(raw);
    } catch (error) {
      if (error && typeof error === "object" && Object.isExtensible(error)) {
        (error as { rawResponses?: string[] }).rawResponses = [...rawResponses];
        // The attempt counts travel with the responses, for the same reason the responses do.
        // Cost accounting charges per *attempt* (`docs/phase-4b-plan.md §A.5.1`), and without this
        // a caller can only infer attempts from the texts in hand — so a validator bug that
        // followed two transient retries would be billed as one attempt instead of three, and the
        // undercount would land in the figure the ceiling reads back.
        (error as { usage?: Partial<EventIdentityUsage> }).usage = {
          latencyMs: Date.now() - startedAt,
          transientRetries,
          repairRetries,
          ...aggregateUsage(),
        };
      }
      throw error;
    }

    if (outcome.ok) {
      return {
        raw,
        rawResponses: [...rawResponses],
        output: outcome.value,
        promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
        schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
        requestText: assembledUserMessage,
        inputAssemblyVersion: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
        usage: {
          provider: "openai",
          model: response.model ?? env.OPENAI_MODEL,
          providerRequestId: response.id,
          ...aggregateUsage(),
          latencyMs: Date.now() - startedAt,
          transientRetries,
          schemaValidFirstCall: attempt === 0,
          repairRetries,
        },
      };
    }

    lastIssues = outcome.issues;
    if (attempt === 0) {
      repairRetries = 1;
      // Bounded, not `describeIssues` directly: the correction turn is input on the repair attempt
      // and the reserve held for it is computed from that cap (`identity-cost.ts`).
      correctionFeedback = repairFeedback(outcome.issues);
      previousRaw = raw;
    }
  }

  throw new EventIdentityError(
    "Event Identity output failed validation after the single repair retry.",
    "invalid_output",
    lastIssues,
    { latencyMs: Date.now() - startedAt, transientRetries, repairRetries, ...aggregateUsage() },
    [...rawResponses],
  );
}
