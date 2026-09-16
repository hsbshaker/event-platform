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

export async function generateEventIdentity(
  input: GenerateEventIdentityInput,
): Promise<EventIdentityCallResult> {
  const env = openAiEnv();
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
  /**
   * Built once, before the loop.
   *
   * The repair attempt appends a correction turn rather than replacing the user message, so the
   * same assembled text is sent on both attempts — hoisting it makes that a property of the code
   * rather than of two calls happening to agree, and gives the caller the exact bytes that went
   * out, which is what `requestText` promises.
   */
  const assembledUserMessage = userMessage(input);
  const startedAt = Date.now();

  let transientRetries = 0;
  let repairRetries = 0;
  let repairFeedback: string | undefined;
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
    if (repairFeedback && previousRaw !== undefined) {
      // The Responses call is stateless, so without this the model is asked to correct a
      // response it was never shown — making the "repair" a fresh generation with a
      // confusing preamble, which is exactly the re-roll this policy exists to prevent.
      messages.push({ role: "assistant", content: previousRaw });
      messages.push({
        role: "user",
        content: [
          "Your previous response did not satisfy the schema:",
          repairFeedback,
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
      repairFeedback = describeIssues(outcome.issues);
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
