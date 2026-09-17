import "server-only";

/**
 * The DesignIntent call against OpenAI — `docs/model-contracts.md §5`, `§8`.
 *
 * One provider, one call, one boundary, and the same shape Event Identity already proved: this
 * file owns the SDK, the request, the retry policy and usage parsing; nothing above it knows which
 * provider is in use. `docs/phase-4b-plan.md` Part IV settles that **T21 owns this**, and why —
 * the 4C eval seam has to go through the production assembly, because "a second assembly written
 * for the harness would let the set pass while production sent something else, which is the one
 * outcome that makes the whole exercise worthless."
 *
 * # Three failure classes, three different answers
 *
 * `validateDesignIntentResponse` returns `{ok: false}` for every defect, so a boundary that read
 * `!ok` as "invalid structured output" would spend the single model repair on classes canon
 * forbids re-asking for. `spec.md §32 #21` permits asking again only for schema-invalid output —
 * its token-cap and selector clauses belong to the composition call — and `spec.md §31` requires
 * incompatible inputs repaired deterministically. `./design-intent/policy.ts` already maps the
 * three classes; this module executes that map, and the precedence between them is fixed:
 *
 * | class | what happens | model passes it may open |
 * | --- | --- | --- |
 * | `assignment` | fail visibly | **0** |
 * | `schema` | one repair pass, then fail visibly | 1 |
 * | `compatibility` | deterministic repair, revalidated | **0** |
 *
 * Assignment outranks schema, and that ordering is the load-bearing part. A response that is both
 * out of assignment and malformed must not be handed a second chance at the model: the assignment
 * is the batch's diversity plan (`spec.md §7.7`), and a retry that happened to return a legal
 * object would report a plan that did not happen. Compatibility ranks last and never opens a pass
 * at all, so an internally inconsistent but well-formed answer costs nothing beyond the response
 * already paid for.
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

import {
  DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
  DESIGN_INTENT_PROMPT_VERSION,
  DESIGN_INTENT_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import { PALETTE_MAX_COLORS } from "@/lib/ai/design-intent/contract";
import type { DesignIntentCallInput } from "@/lib/ai/design-intent/input";
import { MAX_REPAIR_RETRIES, type IssueClass } from "@/lib/ai/design-intent/policy";
import {
  assignmentIssues,
  describeIssues,
  validateDesignIntentResponse,
  type PresentationOutcome,
  type ValidationIssue,
} from "@/lib/ai/design-intent/validate";
import { narrowedWireSchema } from "@/lib/ai/design-intent/wire-schema";
import type { ProviderResponseUsage } from "@/lib/ai/openai/event-identity";
import { openAiEnv } from "@/lib/env";
import type { DesignIntent, Deviation } from "@/lib/renderer/design-intent";
import type { SiblingAssignment } from "@/lib/renderer/planner";

import { assembleDesignIntentUserMessage } from "./design-intent-input";

const PROMPT_PATH = path.join(process.cwd(), "docs", "model-prompts", "design-intent.system.md");

/**
 * Bounded transient retries. Provider-side failures only; never an output problem.
 *
 * Exported because the cost bound in `src/lib/generation/design-intent-cost.ts` multiplies by the
 * attempt count these produce, and a bound that reserved for fewer attempts than the policy
 * permits would be wrong in the direction of spending money.
 */
export const MAX_TRANSIENT_RETRIES = 2;
export const TRANSIENT_BACKOFF_MS = [500, 1500];

/** A hung request must not eat the caller's budget and abort the two concepts beside it. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000;

/** Passes at the model per logical call: the original, then the single schema repair. */
export const DESIGN_INTENT_PASSES = 1 + MAX_REPAIR_RETRIES;

/**
 * The service tier every DesignIntent request is sent on.
 *
 * Pinned, not inherited, for the reason Event Identity records: the verified rate profile is built
 * against standard pricing, Fast Mode is 2× and the Batch/Flex tiers are ½, so an inherited tier
 * would price this call against a bound that does not describe it. Sending it explicitly makes the
 * assumption the bound rests on a property of the request rather than of an account setting.
 */
export const DESIGN_INTENT_SERVICE_TIER = "default" as const;

/**
 * Provider-side response persistence, off.
 *
 * This call is stateless: the repair pass resends the rejected assistant turn explicitly rather
 * than referring to a stored response. Left at the provider's default, briefs and model output
 * would accumulate in a third-party store we neither read nor purge, and `spec.md §27`'s retention
 * discipline would end at our own database boundary rather than at the data.
 */
export const DESIGN_INTENT_STORE_RESPONSES = false as const;

/**
 * Reasoning effort, pinned here rather than read from the shared environment variable.
 *
 * Two reasons, and the second is the one that matters. This is a creative call whose whole value
 * is the quality of the interpretation, so effort is not a dial to trade for latency. And the cost
 * bound below is derived from *this* request shape: effort drives reasoning tokens, reasoning
 * tokens are billed as output, and a bound derived against `high` would not describe a request an
 * environment variable had quietly moved to `low`. It is part of `modelConfig` for the same
 * reason `service_tier` is.
 */
export const DESIGN_INTENT_REASONING_EFFORT = "high" as const;

/**
 * The output ceiling this request sends, and therefore the one the cost bound is derived from.
 *
 * Without it the ceiling is the model's own 128,000, which is two orders of magnitude past
 * anything this call can legitimately produce: the response is one object of seven enum-and-hex
 * fields plus two short strings, a few hundred tokens at most. The remaining headroom is reasoning,
 * which is billed as output and is the only part that can legitimately run long.
 *
 * 32,000 is deliberately far above any plausible answer and still a real bound. A response that
 * hits it is truncated, arrives as unparseable JSON, and is handled as schema-invalid — the one
 * class that may open the repair pass — rather than being silently accepted in part.
 */
export const DESIGN_INTENT_MAX_OUTPUT_TOKENS = 32_000;

/**
 * The hard budget on the correction turn a repair pass appends, in issues and in UTF-8 bytes.
 *
 * **Why a budget exists at all.** The validator's rendering of its issues is a `map`/`join` over
 * however many issues there are, and it *amplifies*: the strict wire projection drops `maxItems` by
 * design (`wire-schema.ts`), so a response that is perfectly conformant to the schema sent may
 * carry an arbitrarily long `palette.colors`, each element costing a few tokens in the response and
 * several times that in a per-element issue line. Left unbudgeted, a response sitting at the output
 * ceiling can produce a correction turn several times larger than the ceiling itself — which would
 * put the repair attempt's input past the reserve `design-intent-cost.ts` holds for it, while
 * staying below the long-context threshold, so nothing downstream would notice except a clamp in
 * the cost estimator logging it as an unbelievable provider report.
 *
 * **Why these numbers.** A correction is only useful if a model can act on it. Forty issue lines is
 * already far more than any real defect produces, and 8,000 bytes is roughly two hundred lines of
 * `- path: message` — generous for the purpose and small enough that the reserve is cheap. Anything
 * beyond is not extra help, it is the amplification above.
 *
 * The reserve in `design-intent-cost.ts` is computed **from** these constants rather than asserted
 * alongside them, so raising one moves the bound instead of silently invalidating it.
 */
export const REPAIR_FEEDBACK_MAX_ISSUES = 40;
export const REPAIR_FEEDBACK_MAX_BYTES = 8_000;

/** The fixed sentences the correction turn wraps the feedback in. Measured, not estimated. */
export const REPAIR_TURN_FRAMING_BYTES = 500;

/** Every request-shaping option that is not the instruction file, the schema or the input. */
export type DesignIntentModelConfig = {
  model: string;
  reasoningEffort: typeof DESIGN_INTENT_REASONING_EFFORT;
  serviceTier: typeof DESIGN_INTENT_SERVICE_TIER;
  store: typeof DESIGN_INTENT_STORE_RESPONSES;
  maxOutputTokens: typeof DESIGN_INTENT_MAX_OUTPUT_TOKENS;
};

/**
 * The canonical model configuration for a DesignIntent call.
 *
 * One builder, so a caller cannot assemble a basis that omits an option the request actually
 * sends: two requests that would be billed or persisted differently are different calls.
 */
export function designIntentModelConfig(model: string): DesignIntentModelConfig {
  return {
    model,
    reasoningEffort: DESIGN_INTENT_REASONING_EFFORT,
    serviceTier: DESIGN_INTENT_SERVICE_TIER,
    store: DESIGN_INTENT_STORE_RESPONSES,
    maxOutputTokens: DESIGN_INTENT_MAX_OUTPUT_TOKENS,
  };
}

/**
 * The most provider attempts one logical `generateDesignIntent` call can make.
 *
 * Six: two passes, each of which may be retried twice for transport failures. Exported rather than
 * recomputed, so raising `MAX_TRANSIENT_RETRIES` raises the spend reservation instead of quietly
 * raising real worst-case spend past it.
 */
export const MAX_PROVIDER_ATTEMPTS_PER_CALL = DESIGN_INTENT_PASSES * (MAX_TRANSIENT_RETRIES + 1);

let cachedSystemPrompt: string | undefined;

/**
 * The committed instruction file, read at runtime rather than inlined, so the artifact under
 * `docs/model-prompts/` is provably the one that ran and `DESIGN_INTENT_PROMPT_VERSION` names a
 * real file (`docs/model-contracts.md §2`).
 */
export function systemPrompt(): string {
  if (cachedSystemPrompt === undefined) cachedSystemPrompt = readFileSync(PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

/* ------------------------------------------------------------------ usage and results */

export interface DesignIntentUsage {
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
  /** How many provider responses this invocation actually received: 0, 1 or 2. */
  providerResponses: number;
  /** HTTP attempts made at the provider, at most `MAX_PROVIDER_ATTEMPTS_PER_CALL`. */
  providerAttempts: number;
  /** Attempts whose usage we do not know and therefore cannot price. Never costed at zero. */
  unknownUsageAttempts: number;
  latencyMs: number;
  transientRetries: number;
  /** True when the first response validated with no repair pass and no deterministic repair. */
  schemaValidFirstCall: boolean;
  /** Repair passes at the model consumed: 0 or 1 (`docs/model-contracts.md §8`). */
  repairRetries: number;
}

export interface DesignIntentCallResult {
  /** Raw provider text of the **accepted** response, verbatim. Never the repaired object. */
  raw: string;
  /**
   * Every provider text this invocation was billed for, oldest first.
   *
   * On a first-call success this is `[raw]`. After a schema repair it is `[rejected, raw]` — the
   * rejected response was paid for too.
   */
  rawResponses: string[];
  /** The seven design fields, post-repair and revalidated. What the compiler consumes. */
  output: DesignIntent;
  /** Host-facing metadata, or the reasons `spec.md §7.8` owes a deterministic fallback. */
  presentation: PresentationOutcome;
  /**
   * The parsed response as later stages receive it: the seven design fields plus `presentation`,
   * after any deterministic repair. Equal to `JSON.parse(raw)` when `deviations` is empty.
   */
  response: unknown;
  /**
   * Deterministic repairs applied to an internally inconsistent response, logged as deviations.
   *
   * Empty on every path but the compatibility one. Never a model pass, and never silent: canon
   * gives compatibility problems "deterministic repair, logged" (`§8`), and a repair nobody can
   * see afterwards is the half of that sentence people drop.
   */
  deviations: Deviation[];
  usage: DesignIntentUsage;
  promptVersion: string;
  schemaVersion: string;
  /**
   * The exact user message sent, and only that.
   *
   * Not the instruction file, not the correction turn a repair appends, and not the assistant echo
   * of a rejected response that sits between them — that echo is raw model output, and letting it
   * reach a caller that scans this text would put a stochastic string inside a deterministic
   * check. Identical on both passes by construction.
   */
  requestText: string;
  /** Which assembly produced `requestText`. Moves independently of the other two versions. */
  inputAssemblyVersion: string;
}

export type DesignIntentFailureKind =
  /** Transport: network, 429, 5xx, timeout. No output to judge. */
  | "provider"
  /** Schema-invalid after the one repair pass. */
  | "invalid_output"
  /** A value outside this concept's assignment. Zero model repairs, by policy. */
  | "assignment_mismatch"
  /** Compatibility-only, and deterministic repair could not produce a legal object. */
  | "unrepairable_output";

export class DesignIntentError extends Error {
  constructor(
    message: string,
    readonly kind: DesignIntentFailureKind,
    readonly issues?: ValidationIssue[],
    readonly usage?: Partial<DesignIntentUsage>,
    /**
     * Provider text already returned and paid for when this failed, oldest first.
     *
     * An output failure is not a call that produced nothing: the provider answered, and our own
     * validation rejected what came back. Empty only when no response had yet arrived.
     */
    readonly rawResponses?: string[],
    /** Deterministic repairs attempted before the failure, where any were. */
    readonly deviations?: Deviation[],
  ) {
    super(message);
    this.name = "DesignIntentError";
  }
}

/* ------------------------------------------------------------------ classification and repair */

/**
 * Which class decides what happens, when a response carries more than one.
 *
 * Deterministic and ordered, not "the first issue wins": the order the validator happens to push
 * its issues in is an implementation detail, and letting it choose the disposition would make a
 * mixed assignment-and-schema response repairable on some inputs and not others.
 */
export const CLASS_PRECEDENCE: readonly IssueClass[] = ["assignment", "schema", "compatibility"];

export function dominantIssueClass(issues: readonly ValidationIssue[]): IssueClass {
  for (const candidate of CLASS_PRECEDENCE) {
    if (issues.some((entry) => entry.class === candidate)) return candidate;
  }
  // Unreachable: a failed outcome has at least one issue and every issue carries a class. Treated
  // as schema-invalid rather than silently succeeding, because the alternative to a known class is
  // never "assume it is fine".
  return "schema";
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

interface RepairResult {
  readonly value: unknown;
  readonly deviations: Deviation[];
}

/**
 * Deterministic repair of the compatibility defects this response shape can carry.
 *
 * Exactly one is reachable in production. Runtime narrowing already makes every enum and every
 * assignment field impossible to get wrong, and the strict wire schema fixes the shape; what it
 * cannot express is a cross-field rule, so `palette.dominant ∈ palette.colors` is the one
 * invariant a well-formed response can still break.
 *
 * The model's dominant colour is preserved wherever the 3–5 bound leaves room for it, because it
 * is a creative statement about which colour carries the page and the compiler reads it as one
 * (`compile/palette.ts` honours the dominant hue even when it is not a member). Only when the
 * palette is already at its ceiling is the dominant re-pointed instead, at the first authored
 * colour — which keeps every colour the model chose rather than evicting one.
 *
 * A compatibility issue with no entry here is **not** repaired and **not** re-asked: the call
 * fails visibly. A repair table that quietly did nothing for a defect it did not recognise would
 * be the silent fallback this boundary exists not to have.
 */
export function repairCompatibility(
  value: unknown,
  issues: readonly ValidationIssue[],
): RepairResult | null {
  const paths = new Set(issues.map((entry) => entry.path));
  if (paths.size !== 1 || !paths.has("palette.dominant")) return null;

  const body = value as { palette?: { colors?: unknown; dominant?: unknown } };
  const colors = body?.palette?.colors;
  const dominant = body?.palette?.dominant;
  if (!Array.isArray(colors) || typeof dominant !== "string") return null;

  const repaired =
    colors.length < PALETTE_MAX_COLORS
      ? { colors: [...colors, dominant], dominant }
      : { colors: [...colors], dominant: colors[0] as string };

  const before = `colors ${colors.join(", ")}; dominant ${dominant}`;
  const after = `colors ${repaired.colors.join(", ")}; dominant ${repaired.dominant}`;
  return {
    value: { ...(value as Record<string, unknown>), palette: repaired },
    deviations: [
      {
        rule: "dominant-in-colors",
        path: "designIntent.palette.dominant",
        kind: "intent",
        before,
        after,
        detail:
          colors.length < PALETTE_MAX_COLORS
            ? "dominant was not a member of palette.colors; admitted into colors so the stated " +
              "dominant is kept"
            : "dominant was not a member of palette.colors and the palette was already at its " +
              "ceiling; re-pointed at the first authored colour",
      },
    ],
  };
}

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

/** JSON that does not parse is a schema failure like any other, reported at the root. */
function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; issue: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (error) {
    return { ok: false, issue: `response was not valid JSON: ${String(error)}` };
  }
}

function rootIssue(message: string): ValidationIssue {
  return {
    path: "(root)",
    message,
    class: "schema",
    disposition: "repair_retry_once",
  };
}

export async function generateDesignIntent(
  input: DesignIntentCallInput,
): Promise<DesignIntentCallResult> {
  const env = openAiEnv();
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    // Retrying is this file's job, not the SDK's. Left at the default (2) every `create()` would
    // be up to three HTTP attempts, making the worst case eighteen requests against the six this
    // policy documents — and `transientRetries` would undercount real provider load threefold.
    maxRetries: 0,
    timeout: PROVIDER_REQUEST_TIMEOUT_MS,
  });

  const assignment: SiblingAssignment = input.assignment;
  // Narrowing happens here, before the request exists: an out-of-assignment family, tone,
  // hierarchy or pairing is not offered, so it cannot come back and be argued about.
  const schema = narrowedWireSchema(assignment);
  /**
   * Built once, before the loop. The repair pass appends a correction turn rather than replacing
   * the user message, so the same assembled text is sent on both passes — a property of the code
   * rather than of two calls happening to agree, and the exact bytes `requestText` promises.
   */
  const assembledUserMessage = assembleDesignIntentUserMessage({
    identity: input.identity,
    assignment,
  });
  const startedAt = Date.now();

  let transientRetries = 0;
  let repairRetries = 0;
  let correctionFeedback: string | undefined;
  let previousRaw: string | undefined;
  let lastIssues: ValidationIssue[] | undefined;
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

  for (let pass = 0; pass < DESIGN_INTENT_PASSES; pass += 1) {
    const messages: OpenAI.Responses.ResponseInput = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: assembledUserMessage },
    ];
    if (correctionFeedback && previousRaw !== undefined) {
      // The Responses call is stateless, so without this the model is asked to correct an answer
      // it was never shown — making the "repair" a fresh generation with a confusing preamble,
      // which is exactly the re-roll this policy exists to prevent.
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
    for (let attempt = 0; ; attempt += 1) {
      try {
        providerAttempts += 1;
        response = await client.responses.create({
          model: env.OPENAI_MODEL,
          input: messages,
          reasoning: { effort: DESIGN_INTENT_REASONING_EFFORT },
          // All four pinned rather than inherited, and all four part of `modelConfig`.
          service_tier: DESIGN_INTENT_SERVICE_TIER,
          store: DESIGN_INTENT_STORE_RESPONSES,
          max_output_tokens: DESIGN_INTENT_MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "design_intent_response",
              strict: true,
              schema,
            },
          },
        });
        break;
      } catch (error) {
        // An attempt that threw never told us what it cost, and it is **not** an attempt that cost
        // nothing: a timeout or a reset can reach provider execution and be billed. Counted here,
        // charged at the per-attempt maximum later.
        unknownUsageAttempts += 1;
        if (attempt < MAX_TRANSIENT_RETRIES && isTransient(error)) {
          transientRetries += 1;
          await sleep(TRANSIENT_BACKOFF_MS[Math.min(attempt, TRANSIENT_BACKOFF_MS.length - 1)]);
          continue;
        }
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

    const succeed = (
      value: unknown,
      designIntent: DesignIntent,
      presentation: PresentationOutcome,
      deviations: Deviation[],
    ): DesignIntentCallResult => ({
      raw,
      rawResponses: [...rawResponses],
      output: designIntent,
      presentation,
      response: value,
      deviations,
      promptVersion: DESIGN_INTENT_PROMPT_VERSION,
      schemaVersion: DESIGN_INTENT_SCHEMA_VERSION,
      requestText: assembledUserMessage,
      inputAssemblyVersion: DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
      usage: {
        provider: "openai",
        model: response?.model ?? env.OPENAI_MODEL,
        providerRequestId: response?.id,
        ...aggregateUsage(),
        latencyMs: Date.now() - startedAt,
        transientRetries,
        schemaValidFirstCall: pass === 0 && deviations.length === 0,
        repairRetries,
      },
    });

    // Validation is our code, not theirs. A bug in a refinement throws out of `safeParse` rather
    // than being reported as an issue, and would otherwise destroy the text just paid for. So it
    // is caught, annotated with the paid responses and the attempt counts, and rethrown as itself
    // — a checker bug must not read as a model failure.
    let value: unknown;
    let outcome: ReturnType<typeof validateDesignIntentResponse>;
    try {
      const parsed = parseJson(raw);
      if (!parsed.ok) {
        outcome = { ok: false, issues: [rootIssue(parsed.issue)] };
        value = undefined;
      } else {
        value = parsed.value;
        outcome = validateDesignIntentResponse(parsed.value, assignment);
      }
    } catch (error) {
      if (error && typeof error === "object" && Object.isExtensible(error)) {
        (error as { rawResponses?: string[] }).rawResponses = [...rawResponses];
        (error as { usage?: Partial<DesignIntentUsage> }).usage = partialUsage();
      }
      throw error;
    }

    if (outcome.ok) return succeed(value, outcome.designIntent, outcome.presentation, []);

    /**
     * A schema failure must not hide an assignment failure underneath it.
     *
     * The strict envelope parse runs first, so a response that is malformed **and** out of
     * assignment reports only the malformation — and a boundary reading that would spend its one
     * model repair on a response it already knew it must refuse. `assignmentIssues` reads the hard
     * fields defensively off whatever parsed, so the class that outranks everything is visible
     * whether or not the shape was legal. De-duplicated by path and message, because on the
     * ordinary path `semanticIssues` has already reported the same thing.
     *
     * The composite key joins on `\x00`, written as an escape rather than as a literal byte. A NUL
     * cannot occur in a path or a validator message, so it is a delimiter no value can forge —
     * `"a\0b"` and `"a"`/`"b"` stay distinct keys where a printable separator would collide. As a
     * raw byte it also made this file report as `data` to `file(1)` and as binary to `grep`, which
     * is not a property the one module a freeze review has to read at a glance should have.
     */
    const seen = new Set(outcome.issues.map((entry) => `${entry.path}\x00${entry.message}`));
    const hardAssignment = assignmentIssues(value, assignment).filter(
      (entry) => !seen.has(`${entry.path}\x00${entry.message}`),
    );
    const issues = [...outcome.issues, ...hardAssignment];
    lastIssues = issues;
    const worst = dominantIssueClass(issues);

    if (worst === "assignment") {
      // Zero model repairs, by policy and on purpose. Rewriting a family, tone or hierarchy to
      // match would report a diversity plan that did not happen, and asking again would let a
      // luckier draw stand in for one.
      throw new DesignIntentError(
        "DesignIntent response is outside this concept's assignment.",
        "assignment_mismatch",
        lastIssues,
        partialUsage(),
        [...rawResponses],
      );
    }

    if (worst === "compatibility") {
      const repair = repairCompatibility(value, issues);
      if (repair !== null) {
        const revalidated = validateDesignIntentResponse(repair.value, assignment);
        if (revalidated.ok) {
          return succeed(
            repair.value,
            revalidated.designIntent,
            revalidated.presentation,
            repair.deviations,
          );
        }
        lastIssues = [...revalidated.issues];
      }
      throw new DesignIntentError(
        "DesignIntent response was internally inconsistent and could not be repaired " +
          "deterministically. No further model call is permitted for this class.",
        "unrepairable_output",
        lastIssues,
        partialUsage(),
        [...rawResponses],
        repair?.deviations ?? [],
      );
    }

    // Schema-invalid: the one class canon lets us ask again about, once.
    if (pass + 1 < DESIGN_INTENT_PASSES) {
      repairRetries = 1;
      correctionFeedback = repairFeedback(issues);
      previousRaw = raw;
    }
  }

  throw new DesignIntentError(
    "DesignIntent output failed validation after the single repair retry.",
    "invalid_output",
    lastIssues,
    partialUsage(),
    [...rawResponses],
  );
}
