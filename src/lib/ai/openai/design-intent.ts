import "server-only";

/**
 * The DesignIntent call against OpenAI — `docs/model-contracts.md §5`, `§8`;
 * `docs/phase-4b-plan.md §E`, Part IV T21.
 *
 * One provider, one call, one boundary, and **the** boundary: the eval harness reaches this
 * function through `src/lib/ai/evals/design-intent-seam.ts` rather than assembling a request of its
 * own, because *"a second assembly written for the harness would let the set pass while production
 * sent something else, which is the one outcome that makes the whole exercise worthless"*
 * (`docs/phase-4b-plan.md`, after "The stop point").
 *
 * Retry policy, exactly as `§8` specifies for this call:
 *
 * - **provider failure** (network, 429, 5xx) → ordinary transient retry, bounded, with backoff.
 *   These produced no output we can judge, which is the only sense in which they are free: a
 *   timeout or a reset may well have reached provider execution and been billed, so
 *   `unknownUsageAttempts` counts them and cost accounting charges each the per-attempt maximum.
 * - **invalid structured output** → exactly one repair retry, then fail visibly. Both responses
 *   were billed, so both are carried out of here and both are priced.
 * - **everything else** — a compatibility problem, a convergent batch, a motif overlap — is
 *   deterministic repair or telemetry and **never** a model call (`./policy.ts`'s
 *   `NEVER_REPROMPT_CONDITIONS`, `spec.md §32 #21`). There is in particular no
 *   convergence-triggered re-prompt: the three siblings are blind and parallel, and a fourth call
 *   to make them differ would be a design decision argued from suspicion rather than data
 *   (`docs/phase-4b-plan.md §E`).
 *
 * Re-prompting until something validates would let a creatively weak response be replaced by a
 * luckier one, and Phase 4C exists to measure creative quality honestly. One repair, then the
 * failure is reported as a failure.
 *
 * **Two ceilings are enforced here rather than assumed**, because
 * `src/lib/generation/design-intent-cost.ts` derives this call's spend bound from them and a
 * ceiling nobody checks is an estimate: every attempt's exact request bytes are measured before it
 * is sent, and `max_output_tokens` is sent on the request. Both are part of `modelConfig` and
 * therefore of any attempt key derived from it.
 *
 * No hidden reasoning is requested, returned to callers or persisted. Reasoning token *counts* are
 * recorded as usage; reasoning *content* is never stored (`spec.md §7.10`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

import type { DesignIntentCallInput } from "@/lib/ai/design-intent/input";
import {
  describeIssues,
  parseAndValidateDesignIntentResponse,
  type ValidationIssue,
} from "@/lib/ai/design-intent/validate";
import { narrowedWireSchema } from "@/lib/ai/design-intent/wire-schema";
import {
  DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
  DESIGN_INTENT_PROMPT_VERSION,
  DESIGN_INTENT_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import { openAiEnv } from "@/lib/env";

import { assembleDesignIntentUserMessage } from "./design-intent-input";

const PROMPT_PATH = path.join(process.cwd(), "docs", "model-prompts", "design-intent.system.md");

/**
 * Bounded transient retries. Provider-side failures only; never an output problem.
 *
 * Declared here rather than imported from the EventIdentity boundary, and the duplication is the
 * point: these are a property of *this* call's attempt shape, they are what
 * `design-intent-cost.ts` multiplies by, and sharing a constant with a differently shaped call is
 * how one call's policy change silently re-prices the other.
 */
export const DESIGN_INTENT_MAX_TRANSIENT_RETRIES = 2;
export const DESIGN_INTENT_TRANSIENT_BACKOFF_MS = [500, 1500];

/** A hung request must not eat the caller's budget and abort whatever follows it. */
export const DESIGN_INTENT_REQUEST_TIMEOUT_MS = 120_000;

/** Attempts at the model per logical call: the original, then the single repair (`§8`). */
export const DESIGN_INTENT_PASSES = 2;

/**
 * The most provider attempts one logical `generateDesignIntent` call can make.
 *
 * Six today. Exported rather than recomputed downstream: a call that ends up costing six attempts
 * must not exceed a ceiling that reserved for one.
 */
export const DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL =
  DESIGN_INTENT_PASSES * (DESIGN_INTENT_MAX_TRANSIENT_RETRIES + 1);

/**
 * The provider service tier every DesignIntent request is sent on.
 *
 * Pinned, not inherited. Left unset the request takes whatever the provider or the project happens
 * to be configured for, and the cost bound is derived from the standard rate table — Fast Mode is
 * 2× and the Batch/Flex tiers are ½, so an inherited tier would silently price the call against a
 * bound that does not describe it. Another tier needs its own derivation, and because the tier is
 * part of `modelConfig` it necessarily produces a different attempt key.
 */
export const DESIGN_INTENT_SERVICE_TIER = "default" as const;

/**
 * Provider-side response persistence, off.
 *
 * This call is stateless: the repair pass resends the rejected assistant turn explicitly rather
 * than referring to a stored response, so nothing here needs the provider to keep one. Left at the
 * provider's default, briefs and model output would accumulate in a third-party store we neither
 * read nor purge, and `spec.md §27`'s retention discipline would end at our own database boundary
 * rather than at the data.
 */
export const DESIGN_INTENT_STORE_RESPONSES = false as const;

/**
 * `max_output_tokens` for every attempt, and half of what makes this call's cost bound its own.
 *
 * A valid response is a small JSON object — seven design fields and two short strings, a few
 * hundred tokens. This leaves roughly two orders of magnitude of headroom for reasoning at `high`
 * effort while keeping output bounded by a request parameter instead of by the model's own
 * 128,000-token maximum. It is deliberately not tight: a truncation wastes a paid response, and on
 * a one-shot evidence set that is unrecoverable, so the number is chosen to never bind in practice
 * and still bind arithmetically.
 */
export const DESIGN_INTENT_MAX_OUTPUT_TOKENS = 32_000;

/**
 * The ceiling on one attempt's exact request bytes, and the other half of the cost bound.
 *
 * Measured over everything that goes out: the system prompt, every message, and the JSON Schema —
 * `.describe()` strings ship, so the schema is billed input like any other. A BPE token never
 * encodes fewer than one byte, so a byte ceiling is also a token ceiling and does not depend on a
 * tokenizer this repository does not have.
 *
 * The worst legal request today is about 29 KiB: a ~14 KiB system prompt, a ~4.5 KiB schema, a
 * brief at every one of `eventIdentitySchema`'s maximum lengths, and a repair turn carrying the
 * rejected response. 64 KiB is a little over twice that. Exceeding it **refuses before spending**
 * rather than truncating anything, because a silently shortened creative brief is a worse outcome
 * than a loud failure.
 */
export const DESIGN_INTENT_MAX_REQUEST_BYTES = 64 * 1024;

/** Every request-shaping option that is not the system prompt, the schema or the input. */
export type DesignIntentModelConfig = {
  model: string;
  reasoningEffort: string;
  serviceTier: typeof DESIGN_INTENT_SERVICE_TIER;
  store: typeof DESIGN_INTENT_STORE_RESPONSES;
  maxOutputTokens: typeof DESIGN_INTENT_MAX_OUTPUT_TOKENS;
  maxRequestBytes: typeof DESIGN_INTENT_MAX_REQUEST_BYTES;
};

/**
 * The canonical model configuration for a DesignIntent call.
 *
 * One builder, so a caller cannot assemble a basis that omits an option the request actually sends.
 * Everything here would reach a `modelConfigDigest` and therefore an attempt key: two requests that
 * would be billed differently, bounded differently or persisted differently are different calls.
 */
export function designIntentModelConfig(
  model: string,
  reasoningEffort: string,
): DesignIntentModelConfig {
  return {
    model,
    reasoningEffort,
    serviceTier: DESIGN_INTENT_SERVICE_TIER,
    store: DESIGN_INTENT_STORE_RESPONSES,
    maxOutputTokens: DESIGN_INTENT_MAX_OUTPUT_TOKENS,
    maxRequestBytes: DESIGN_INTENT_MAX_REQUEST_BYTES,
  };
}

let cachedSystemPrompt: string | undefined;

/**
 * The production system prompt is the committed file, read at runtime rather than inlined, so the
 * artifact under `docs/model-prompts/` is provably the one that ran and
 * `DESIGN_INTENT_PROMPT_VERSION` describes a real file (`docs/model-contracts.md §2`). It is also
 * what makes the surface the leakage scan reads the same bytes the provider saw.
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
 * long-context tier applies per request, so one attempt can cross a threshold another does not.
 */
export interface DesignIntentResponseUsage {
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
   * The tier the provider says it **served** this response on, which is not the same question as
   * the tier we asked for. A response served on `fast` costs twice standard; priced from the
   * standard table it would be recorded at half its real cost. Undefined when the provider is
   * silent.
   */
  servedServiceTier?: string | null;
}

export interface DesignIntentUsage {
  provider: "openai";
  model: string;
  /** The **accepted or final** response's request id, not an identifier for every attempt. */
  providerRequestId?: string;
  /**
   * Token counts **aggregated over every response this invocation received**, rejected and
   * accepted alike. Reporting only the accepted response would drop the tokens of a rejected first
   * response that was billed just the same, and the repair path is where a call gets expensive. A
   * field is absent when no response reported it, which is not the same as zero.
   */
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  /** Per-response usage, in arrival order. Pricing reads this; the summary above is telemetry. */
  responses: DesignIntentResponseUsage[];
  /** How many provider responses this invocation actually received: 0, 1 or 2. */
  providerResponses: number;
  /**
   * How many HTTP attempts this invocation made, at most
   * `DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL`. The unit cost accounting charges:
   * `providerResponses` and `unknownUsageAttempts` overlap, so adding those two double-charges an
   * attempt. Attempts overlap with nothing.
   */
  providerAttempts: number;
  /**
   * Attempts whose usage we cannot price: every attempt that threw before a response reached us —
   * a timeout or a reset may have reached provider execution and billed — plus any response that
   * arrived without a usage block. Charged the per-attempt maximum rather than zero.
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

export interface DesignIntentCallResult {
  /** Raw provider text of the **accepted** response, kept verbatim for the review artifact. */
  raw: string;
  /**
   * Every provider text this invocation was billed for, oldest first. On a first-call success this
   * is `[raw]`; after a repair it is `[rejected, raw]`, because the rejected response was paid for
   * too.
   */
  rawResponses: string[];
  /**
   * The validated response object: the seven design fields plus `presentation`, exactly as it
   * arrived. Not the validator's split — `presentation` is validated separately and a bad concept
   * name must not condemn the design semantics beside it (`spec.md §7.8`), so what leaves here is
   * the whole object and the caller splits it.
   */
  output: Record<string, unknown>;
  usage: DesignIntentUsage;
  promptVersion: string;
  schemaVersion: string;
  /**
   * The exact user message sent, and only that.
   *
   * Not the system prompt, not the correction turn a repair appends, and not the assistant echo of
   * a rejected response that sits between them — that echo is raw model output, and letting a
   * permanent verdict turn on a stochastic string is the defect that reopened Phase 4B's freeze.
   * Identical on both attempts by construction.
   */
  requestText: string;
  /** Which assembly produced `requestText`. Moves independently of the other two versions. */
  inputAssemblyVersion: string;
}

export type DesignIntentErrorKind =
  /** Network, 429, 5xx, timeout — no output we can judge. */
  | "provider"
  /** Validation rejected what came back, after the single repair retry (`§8`). */
  | "invalid_output"
  /**
   * The request would exceed `DESIGN_INTENT_MAX_REQUEST_BYTES`. Raised **before** the attempt, so
   * nothing was spent on it.
   */
  | "request_too_large"
  /**
   * The provider stopped at `max_output_tokens`. Not repaired: a repair resends more context under
   * the same cap, so it is likelier to truncate again, and the truncated text is not a response a
   * correction turn can meaningfully quote. It was billed, so it still travels out with the error.
   */
  | "incomplete_output";

export class DesignIntentError extends Error {
  constructor(
    message: string,
    readonly kind: DesignIntentErrorKind,
    readonly issues?: ValidationIssue[],
    readonly usage?: Partial<DesignIntentUsage>,
    /**
     * Provider text already returned and paid for when this failed, oldest first.
     *
     * An `invalid_output` failure is not a call that produced nothing: the provider answered, twice
     * on the repair path, and our own validation rejected what came back. Dropping that text loses
     * a paid response, and on a one-shot corpus it is unrecoverable. Empty only when no response
     * had yet arrived — `kind` does not tell you whether this is empty; its length does.
     */
    readonly rawResponses?: string[],
  ) {
    super(message);
    this.name = "DesignIntentError";
  }
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

const utf8 = (value: string) => Buffer.byteLength(value, "utf8");

/**
 * The exact bytes one attempt will send.
 *
 * Every message plus the schema, because the schema's own description strings are billed input. A
 * non-string message content is serialized the way it will be transmitted rather than skipped.
 */
export function designIntentRequestBytes(messages: readonly unknown[], schema: unknown): number {
  const messageBytes = messages.reduce<number>((total, message) => {
    const content = (message as { content?: unknown } | null | undefined)?.content;
    // A string content is measured as it will be transmitted. Anything else — an item shape this
    // call does not send today — is measured whole rather than skipped, so a future message type
    // cannot slip past the ceiling by not having a `content` string.
    return total + utf8(typeof content === "string" ? content : JSON.stringify(message ?? null));
  }, 0);
  return messageBytes + utf8(JSON.stringify(schema));
}

/**
 * The correction turn, and the one instruction in it that matters.
 *
 * Model-visible text, kept beside the only place it is used. It says *fix what was structurally
 * wrong*, because a repair that invites the model to reconsider its creative interpretation is a
 * second generation wearing a correction's clothes — and a set measuring creative quality would be
 * measuring whichever of two attempts happened to validate.
 */
export const DESIGN_INTENT_REPAIR_INSTRUCTION = [
  "Your previous response did not satisfy the schema:",
  "%ISSUES%",
  "",
  "Return the corrected object. Do not change your creative interpretation to make validation",
  "easier — fix only what was structurally wrong.",
].join("\n");

export async function generateDesignIntent(
  input: DesignIntentCallInput,
): Promise<DesignIntentCallResult> {
  /**
   * Everything deterministic happens before a key is read or a client exists.
   *
   * An unnarrowable assignment and a malformed brief are both defects upstream of this call, and
   * neither should get as far as constructing something that can spend money.
   */
  const schema = narrowedWireSchema(input.assignment);
  /**
   * Built once, before the loop.
   *
   * The repair attempt appends a correction turn rather than replacing the user message, so the
   * same assembled text is sent on both attempts — hoisting it makes that a property of the code
   * rather than of two calls happening to agree, and gives the caller the exact bytes that went
   * out, which is what `requestText` promises.
   */
  const assembledUserMessage = assembleDesignIntentUserMessage({
    identity: input.identity,
    assignment: input.assignment,
  });
  const system = systemPrompt();

  const env = openAiEnv();
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    // Retrying is this file's job, not the SDK's. Left at the default (2) every `create()` would be
    // up to three HTTP attempts, making the worst case eighteen requests against the six this
    // policy documents — and `transientRetries` would undercount real provider load threefold.
    maxRetries: 0,
    timeout: DESIGN_INTENT_REQUEST_TIMEOUT_MS,
  });
  const startedAt = Date.now();

  let transientRetries = 0;
  let repairRetries = 0;
  let repairFeedback: string | undefined;
  let previousRaw: string | undefined;
  let lastIssues: readonly ValidationIssue[] | undefined;
  /**
   * Every provider text this call has been billed for, oldest first.
   *
   * The journal's durability boundary starts when this function returns. Our own deterministic
   * validation runs after the money is spent and before that return, so anything paid for in here
   * has to leave with the error or it is gone.
   */
  const rawResponses: string[] = [];
  const agg: {
    input?: number;
    cached?: number;
    cacheWrite?: number;
    output?: number;
    reasoning?: number;
  } = {};
  const perResponse: DesignIntentResponseUsage[] = [];
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
  const partialUsage = () => ({
    latencyMs: Date.now() - startedAt,
    transientRetries,
    repairRetries,
    ...aggregateUsage(),
  });

  // Two passes at most: the original call, then the single repair retry.
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const messages: OpenAI.Responses.ResponseInput = [
      { role: "system", content: system },
      { role: "user", content: assembledUserMessage },
    ];
    if (repairFeedback && previousRaw !== undefined) {
      // The Responses call is stateless, so without this the model is asked to correct a response
      // it was never shown — making the "repair" a fresh generation with a confusing preamble,
      // which is exactly the re-roll this policy exists to prevent.
      messages.push({ role: "assistant", content: previousRaw });
      messages.push({
        role: "user",
        content: DESIGN_INTENT_REPAIR_INSTRUCTION.replace("%ISSUES%", repairFeedback),
      });
    }

    const bytes = designIntentRequestBytes(messages, schema);
    if (bytes > DESIGN_INTENT_MAX_REQUEST_BYTES) {
      // Before the attempt, so this one costs nothing. On the repair pass `rawResponses` already
      // holds a paid response and still travels out.
      throw new DesignIntentError(
        `the DesignIntent request is ${bytes} bytes, over the ${DESIGN_INTENT_MAX_REQUEST_BYTES}-byte ` +
          "ceiling this call's cost bound is derived from. Nothing was sent. Shorten the brief or " +
          "re-derive the bound; do not truncate the request.",
        "request_too_large",
        undefined,
        partialUsage(),
        [...rawResponses],
      );
    }

    let response: OpenAI.Responses.Response | undefined;
    for (let t = 0; ; t += 1) {
      try {
        providerAttempts += 1;
        response = await client.responses.create({
          model: env.OPENAI_MODEL,
          input: messages,
          reasoning: { effort: env.OPENAI_REASONING_EFFORT },
          // All three pinned rather than inherited, and all three part of `modelConfig`.
          service_tier: DESIGN_INTENT_SERVICE_TIER,
          store: DESIGN_INTENT_STORE_RESPONSES,
          max_output_tokens: DESIGN_INTENT_MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "design_intent",
              strict: true,
              schema,
            },
          },
        });
        break;
      } catch (error) {
        // An attempt that threw never told us what it cost, and it is **not** an attempt that cost
        // nothing: a timeout or a connection reset can reach provider execution and be billed.
        unknownUsageAttempts += 1;
        if (t < DESIGN_INTENT_MAX_TRANSIENT_RETRIES && isTransient(error)) {
          transientRetries += 1;
          await sleep(
            DESIGN_INTENT_TRANSIENT_BACKOFF_MS[
              Math.min(t, DESIGN_INTENT_TRANSIENT_BACKOFF_MS.length - 1)
            ],
          );
          continue;
        }
        // `rawResponses` is usually empty here, but not always: a provider failure on the repair
        // attempt follows a first response that was returned, billed and rejected.
        throw new DesignIntentError(
          `OpenAI request failed: ${(error as Error)?.message ?? String(error)}`,
          "provider",
          undefined,
          partialUsage(),
          [...rawResponses],
        );
      }
    }

    const raw = response.output_text ?? "";
    rawResponses.push(raw);
    // No cast: the SDK declares both fields, so a rename breaks the build rather than silently
    // reclassifying every cache write as ordinary input at a fraction of its price.
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

    if (response.status === "incomplete") {
      throw new DesignIntentError(
        "the DesignIntent response stopped before it was complete" +
          (response.incomplete_details?.reason ? ` (${response.incomplete_details.reason})` : "") +
          `. max_output_tokens is ${DESIGN_INTENT_MAX_OUTPUT_TOKENS}. This is not repaired: a ` +
          "repair resends more context under the same cap, and truncated text is not something a " +
          "correction turn can quote.",
        "incomplete_output",
        undefined,
        partialUsage(),
        [...rawResponses],
      );
    }

    /**
     * Any other status that is not `completed` is a failure of the request, not of the model's
     * design judgement.
     *
     * `failed` is the one that reaches here in practice — a provider-side error or a content
     * filter. Left to fall through, its empty `output_text` would be reported as invalid JSON,
     * spend the single repair retry on a response that does not exist, and land in evidence as
     * "the model returned something unparseable". Saying what actually happened costs one branch.
     * It is not transiently retried: the inner loop retries attempts that *threw*, and a response
     * that arrived with a refusal on it will arrive again.
     */
    if (response.status !== "completed") {
      throw new DesignIntentError(
        `the provider returned status ${JSON.stringify(response.status ?? "unknown")}` +
          (response.error?.message ? `: ${response.error.message}` : "") +
          ". No design output was produced, so there is nothing to validate and nothing to repair.",
        "provider",
        undefined,
        partialUsage(),
        [...rawResponses],
      );
    }

    // Validation is our code, not theirs. A bug in a zod refinement throws out of `safeParse`
    // rather than being reported as an issue, and would otherwise destroy the text just paid for.
    // So it is caught, annotated with the paid responses, and rethrown as itself: the same object,
    // the same type, no `kind` — a checker bug must not read as a model failure.
    //
    // The annotation is guarded because a non-object or frozen throw would make the assignment
    // itself throw, replacing the original exception and losing the responses in the one place
    // whose whole purpose is keeping them.
    let outcome: ReturnType<typeof parseAndValidateDesignIntentResponse>;
    try {
      outcome = parseAndValidateDesignIntentResponse(raw, input.assignment);
    } catch (error) {
      if (error && typeof error === "object" && Object.isExtensible(error)) {
        (error as { rawResponses?: string[] }).rawResponses = [...rawResponses];
        // The attempt counts travel with the responses, for the same reason the responses do: cost
        // accounting charges per *attempt*, and without this a validator bug that followed two
        // transient retries would be billed as one attempt instead of three.
        (error as { usage?: Partial<DesignIntentUsage> }).usage = partialUsage();
      }
      throw error;
    }

    if (outcome.ok) {
      return {
        raw,
        rawResponses: [...rawResponses],
        // Re-parsed rather than rebuilt from the validator's split, so what leaves here is the
        // object that arrived — including a `presentation` the validator rejected, which
        // `spec.md §7.8` owes a deterministic fallback rather than a discard. It parsed moments
        // ago inside the validator, so this cannot throw.
        output: JSON.parse(raw) as Record<string, unknown>,
        promptVersion: DESIGN_INTENT_PROMPT_VERSION,
        schemaVersion: DESIGN_INTENT_SCHEMA_VERSION,
        requestText: assembledUserMessage,
        inputAssemblyVersion: DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
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
      repairFeedback = describeIssues(outcome.issues);
      previousRaw = raw;
    }
  }

  throw new DesignIntentError(
    "DesignIntent output failed validation after the single repair retry.",
    "invalid_output",
    lastIssues === undefined ? undefined : [...lastIssues],
    partialUsage(),
    [...rawResponses],
  );
}
