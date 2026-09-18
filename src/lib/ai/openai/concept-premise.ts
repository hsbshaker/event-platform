import "server-only";

/**
 * The ConceptPremise call against OpenAI — one call per batch, ahead of the three DesignIntent
 * calls.
 *
 * Same boundary shape as `./design-intent.ts`, and deliberately so: this file owns the SDK, the
 * request, the retry policy and usage parsing, and nothing above it knows which provider is in use.
 * What differs is the unit of work. A DesignIntent call is one sibling; this call is the **batch**,
 * because the output is three premises that only mean something together
 * (`docs/designintent-sibling-convergence.md §7`).
 *
 * # One repair pass, for the whole response, covering every class
 *
 * `./design-intent/policy.ts` splits its classes three ways because canon gives them three
 * different answers. Here all three classes get the same answer — one pass, then fail visibly —
 * and `src/lib/ai/concept-premise/policy.ts` explains why this is the right place in the pipeline
 * for the single repair layer the remediation adds: the response is three short objects, its
 * defects are decidable before any design is paid for, and correcting it costs a fraction of
 * regenerating a sibling.
 *
 * The pass is bounded by construction — `CONCEPT_PREMISE_PASSES` is two, the loop counts passes
 * rather than issues, and the validator returns every issue at once so one correction turn can
 * address all of them. There is no critic, no judge and no second opinion: a second pass is not
 * reachable from any input.
 *
 * # Failure is visible, never degraded
 *
 * When the set cannot be made legal this throws. It does not return an empty set, a partial set or
 * a "premise-free" marker that would let three DesignIntent calls proceed as they did before —
 * `policy.ts` carries that argument in full, and the short form is that three concepts generated
 * from a set we have just proved collapsed is the known-defective output the T22 run measured.
 *
 * Everything paid for is preserved on every path, success and failure alike: the raw text of every
 * response, per-response usage at its own tier, attempt counts including the attempts that threw,
 * and the request-id of the accepted response.
 *
 * No hidden reasoning is requested, returned to callers or persisted. Reasoning token *counts* are
 * recorded as usage; reasoning *content* never is (`spec.md §7.10`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

import type { ConceptPremiseCallInput } from "@/lib/ai/concept-premise/input";
import { MAX_REPAIR_RETRIES, type PremiseIssueClass } from "@/lib/ai/concept-premise/policy";
import {
  describePremiseIssues,
  dominantPremiseIssueClass,
  parseAndValidateConceptPremiseSet,
  type PremiseSetTelemetry,
  type PremiseValidationIssue,
} from "@/lib/ai/concept-premise/validate";
import { strictWireSchema } from "@/lib/ai/concept-premise/wire-schema";
import type { ConceptPremiseSet } from "@/lib/ai/concept-premise/contract";
import {
  CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
  CONCEPT_PREMISE_PROMPT_VERSION,
  CONCEPT_PREMISE_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import type { ProviderResponseUsage } from "@/lib/ai/openai/event-identity";
import { openAiEnv } from "@/lib/env";

import { assembleConceptPremiseUserMessage } from "./concept-premise-input";

const PROMPT_PATH = path.join(process.cwd(), "docs", "model-prompts", "concept-premise.system.md");

/** Bounded transient retries. Provider-side failures only; never an output problem. */
export const MAX_TRANSIENT_RETRIES = 2;
export const TRANSIENT_BACKOFF_MS = [500, 1500];

/** A hung request must not eat the caller's budget and hold three concepts behind it. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000;

/** Passes at the model per logical call: the original, then the single repair. */
export const CONCEPT_PREMISE_PASSES = 1 + MAX_REPAIR_RETRIES;

/** Pinned rather than inherited, for the reason the other two boundaries record: the cost bound
 * in `src/lib/generation/concept-premise-cost.ts` is derived from exactly this request shape. */
export const CONCEPT_PREMISE_SERVICE_TIER = "default" as const;
export const CONCEPT_PREMISE_STORE_RESPONSES = false as const;

/**
 * Reasoning effort, pinned high.
 *
 * This is the stage that decides what three worthwhile choices are, which is the most consequential
 * creative judgement in the pipeline and the one the T22 evidence showed was never being made. It
 * is not a dial to trade for latency — and the cost bound below is derived against `high`, so an
 * environment variable quietly moving it would leave the bound describing a different request.
 */
export const CONCEPT_PREMISE_REASONING_EFFORT = "high" as const;

/**
 * The output ceiling this request sends, and therefore the one the cost bound is derived from.
 *
 * The content is three premises of bounded prose — roughly 2,500 tokens at the contract's own
 * maxima — so the remaining headroom is reasoning, which is billed as output and is the only part
 * that can legitimately run long. A response that hits the ceiling is truncated, arrives as
 * unparseable JSON, and is handled as schema-invalid rather than accepted in part.
 */
export const CONCEPT_PREMISE_MAX_OUTPUT_TOKENS = 32_000;

/**
 * The budget on the correction turn, in issues and in UTF-8 bytes.
 *
 * Smaller than the DesignIntent boundary's, because the amplification that motivates that one does
 * not exist here: this validator reports at most a bounded number of issues per premise over a
 * fixed field set, rather than one line per element of an array the strict wire projection left
 * unbounded. Twenty lines is more than any real defect produces, and 4,000 bytes is generous for
 * them. The reserve in `concept-premise-cost.ts` is computed **from** these constants, so raising
 * one moves the bound instead of silently invalidating it.
 */
export const REPAIR_FEEDBACK_MAX_ISSUES = 20;
export const REPAIR_FEEDBACK_MAX_BYTES = 4_000;

/** The fixed sentences the correction turn wraps the feedback in. Measured, not estimated. */
export const REPAIR_TURN_FRAMING_BYTES = 600;

/** The most provider attempts one logical call can make: two passes, each retried twice. */
export const MAX_PROVIDER_ATTEMPTS_PER_CALL = CONCEPT_PREMISE_PASSES * (MAX_TRANSIENT_RETRIES + 1);

export type ConceptPremiseModelConfig = {
  model: string;
  reasoningEffort: typeof CONCEPT_PREMISE_REASONING_EFFORT;
  serviceTier: typeof CONCEPT_PREMISE_SERVICE_TIER;
  store: typeof CONCEPT_PREMISE_STORE_RESPONSES;
  maxOutputTokens: typeof CONCEPT_PREMISE_MAX_OUTPUT_TOKENS;
};

/** One builder, so a caller cannot assemble a basis that omits an option the request sends. */
export function conceptPremiseModelConfig(model: string): ConceptPremiseModelConfig {
  return {
    model,
    reasoningEffort: CONCEPT_PREMISE_REASONING_EFFORT,
    serviceTier: CONCEPT_PREMISE_SERVICE_TIER,
    store: CONCEPT_PREMISE_STORE_RESPONSES,
    maxOutputTokens: CONCEPT_PREMISE_MAX_OUTPUT_TOKENS,
  };
}

let cachedSystemPrompt: string | undefined;

/**
 * The committed instruction file, read at runtime rather than inlined, so the artifact under
 * `docs/model-prompts/` is provably the one that ran and `CONCEPT_PREMISE_PROMPT_VERSION` names a
 * real file (`docs/model-contracts.md §2`).
 */
export function systemPrompt(): string {
  if (cachedSystemPrompt === undefined) cachedSystemPrompt = readFileSync(PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

/* ------------------------------------------------------------------ usage and results */

export interface ConceptPremiseUsage {
  provider: "openai";
  model: string;
  /** The **accepted or final** response's request id, not an identifier for every attempt. */
  providerRequestId?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  /** Billable output. `reasoningTokens` is a **breakdown** of this, never an addition to it. */
  outputTokens?: number;
  reasoningTokens?: number;
  /** Per-response usage, in arrival order. Pricing reads this; the summary above is telemetry. */
  responses: ProviderResponseUsage[];
  providerResponses: number;
  providerAttempts: number;
  /** Attempts whose usage we do not know and therefore cannot price. Never costed at zero. */
  unknownUsageAttempts: number;
  latencyMs: number;
  transientRetries: number;
  /** True when the first response validated with no repair pass. */
  validFirstCall: boolean;
  /** Repair passes at the model consumed: 0 or 1. */
  repairRetries: number;
  /** The class the repair pass was opened for, when one was. */
  repairedClass?: PremiseIssueClass;
}

export interface ConceptPremiseCallResult {
  /** Raw provider text of the **accepted** response, verbatim. */
  raw: string;
  /** Every provider text this invocation was billed for, oldest first. */
  rawResponses: string[];
  /** The validated set. Premise `k` binds to planned sibling `k`. */
  premiseSet: ConceptPremiseSet;
  /** What actually separated this set. Deterministic facts, no scores. */
  telemetry: PremiseSetTelemetry;
  usage: ConceptPremiseUsage;
  promptVersion: string;
  schemaVersion: string;
  /** The exact user message sent, and only that. Identical on both passes by construction. */
  requestText: string;
  inputAssemblyVersion: string;
}

export type ConceptPremiseFailureKind =
  /** Transport: network, 429, 5xx, timeout. No output to judge. */
  | "provider"
  /** Still invalid after the one repair pass. Carries the class that dominated. */
  | "unusable_premise_set";

export class ConceptPremiseError extends Error {
  constructor(
    message: string,
    readonly kind: ConceptPremiseFailureKind,
    readonly issues?: PremiseValidationIssue[],
    readonly usage?: Partial<ConceptPremiseUsage>,
    /** Provider text already returned and paid for when this failed, oldest first. */
    readonly rawResponses?: string[],
    readonly dominantClass?: PremiseIssueClass,
  ) {
    super(message);
    this.name = "ConceptPremiseError";
  }
}

/* ------------------------------------------------------------------ the correction turn */

/** Cut a string to a UTF-8 byte budget without splitting a code point. */
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
 * The validator's issues, rendered for the single repair turn and bounded.
 *
 * Both limits announce themselves in the text: a model asked to correct an answer must not be told
 * a truncated list is the whole list, and a reader of a failed run must be able to tell "nothing
 * else was wrong" from "we stopped listing".
 */
export function repairFeedback(issues: readonly PremiseValidationIssue[]): string {
  const kept = issues.slice(0, REPAIR_FEEDBACK_MAX_ISSUES);
  const omitted = issues.length - kept.length;
  let text = describePremiseIssues(kept);
  if (omitted > 0) text += `\n- … and ${omitted} further issue(s), not listed`;

  const marker = "\n- … list truncated";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (Buffer.byteLength(text, "utf8") > REPAIR_FEEDBACK_MAX_BYTES) {
    text = clampToBytes(text, REPAIR_FEEDBACK_MAX_BYTES - markerBytes) + marker;
  }
  return text;
}

/**
 * The correction turn's fixed sentences.
 *
 * Model-visible text, so it is declared as data here in the boundary — which is itself a scanned
 * surface — rather than built inline at the call site where a reader would miss it. It says what
 * to fix and, just as importantly, what **not** to do about it: a set repaired by inventing a
 * distinguishing fact is worse than the set that was rejected.
 */
export const REPAIR_TURN_TEXT = {
  opening: "Your previous response did not satisfy the contract:",
  closing: [
    "Return the corrected set.",
    "Fix what was listed and change nothing else. Do not make the premises more different by",
    "adding anything the brief does not carry: an emphasis you cannot ground is worse than two",
    "premises that are too close, and a set repaired that way will be refused again.",
  ],
} as const;

/* ------------------------------------------------------------------ the call */

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
 * Author the three premises for one batch.
 *
 * Deterministic in everything but the model: the same brief produces the same request bytes, and
 * `requestText` is the text that actually went out rather than a reconstruction of it.
 */
export async function generateConceptPremiseSet(
  input: ConceptPremiseCallInput,
): Promise<ConceptPremiseCallResult> {
  const env = openAiEnv();
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    // Retrying is this file's job, not the SDK's; see the DesignIntent boundary's note.
    maxRetries: 0,
    timeout: PROVIDER_REQUEST_TIMEOUT_MS,
  });

  const schema = strictWireSchema();
  const assembledUserMessage = assembleConceptPremiseUserMessage({ identity: input.identity });
  const startedAt = Date.now();

  let transientRetries = 0;
  let repairRetries = 0;
  let repairedClass: PremiseIssueClass | undefined;
  let correctionFeedback: string | undefined;
  let previousRaw: string | undefined;
  let lastIssues: PremiseValidationIssue[] | undefined;
  const rawResponses: string[] = [];
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
  const partialUsage = () => ({
    latencyMs: Date.now() - startedAt,
    transientRetries,
    repairRetries,
    repairedClass,
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

  for (let pass = 0; pass < CONCEPT_PREMISE_PASSES; pass += 1) {
    const messages: OpenAI.Responses.ResponseInput = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: assembledUserMessage },
    ];
    if (correctionFeedback && previousRaw !== undefined) {
      // The Responses call is stateless, so without this the model would be asked to correct an
      // answer it was never shown — making the repair a fresh generation with a confusing
      // preamble, which is exactly the re-roll this policy exists to prevent.
      messages.push({ role: "assistant", content: previousRaw });
      messages.push({
        role: "user",
        content: [
          REPAIR_TURN_TEXT.opening,
          correctionFeedback,
          "",
          ...REPAIR_TURN_TEXT.closing,
        ].join("\n"),
      });
    }

    let response: OpenAI.Responses.Response | undefined;
    for (let attempt = 0; ; attempt += 1) {
      try {
        providerAttempts += 1;
        response = await client.responses.create({
          model: env.OPENAI_MODEL,
          input: messages,
          reasoning: { effort: CONCEPT_PREMISE_REASONING_EFFORT },
          service_tier: CONCEPT_PREMISE_SERVICE_TIER,
          store: CONCEPT_PREMISE_STORE_RESPONSES,
          max_output_tokens: CONCEPT_PREMISE_MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "concept_premise_set",
              strict: true,
              schema,
            },
          },
        });
        break;
      } catch (error) {
        // An attempt that threw never told us what it cost, and it is not an attempt that cost
        // nothing: a timeout or a reset can reach provider execution and be billed.
        unknownUsageAttempts += 1;
        if (attempt < MAX_TRANSIENT_RETRIES && isTransient(error)) {
          transientRetries += 1;
          await sleep(TRANSIENT_BACKOFF_MS[Math.min(attempt, TRANSIENT_BACKOFF_MS.length - 1)]);
          continue;
        }
        throw new ConceptPremiseError(
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

    const outcome = parseAndValidateConceptPremiseSet(raw, input.identity);
    if (outcome.ok) {
      return {
        raw,
        rawResponses: [...rawResponses],
        premiseSet: outcome.value,
        telemetry: outcome.telemetry,
        usage: {
          provider: "openai",
          model: env.OPENAI_MODEL,
          providerRequestId: response.id,
          validFirstCall: repairRetries === 0,
          ...partialUsage(),
        },
        promptVersion: CONCEPT_PREMISE_PROMPT_VERSION,
        schemaVersion: CONCEPT_PREMISE_SCHEMA_VERSION,
        requestText: assembledUserMessage,
        inputAssemblyVersion: CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
      };
    }

    lastIssues = [...outcome.issues];
    // The loop bound is what stops a second pass, and it is the only thing that has to: every
    // class gets the same one pass, so there is no branch here that could open another.
    if (pass + 1 < CONCEPT_PREMISE_PASSES) {
      repairRetries += 1;
      repairedClass = dominantPremiseIssueClass(lastIssues);
      correctionFeedback = repairFeedback(lastIssues);
      previousRaw = raw;
    }
  }

  const issues = lastIssues ?? [];
  const dominant = dominantPremiseIssueClass(issues);
  throw new ConceptPremiseError(
    `concept premise set was not usable after ${repairRetries} repair pass(es) ` +
      `(${dominant}): the batch produces no concepts rather than three from a set it has just ` +
      "proved unusable",
    "unusable_premise_set",
    issues,
    partialUsage(),
    [...rawResponses],
    dominant,
  );
}
