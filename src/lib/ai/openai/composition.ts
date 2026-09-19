import "server-only";

/**
 * The Composition call against OpenAI — `docs/model-contracts.md §6`, `§8`.
 *
 * The third instance of a shape Event Identity and DesignIntent already proved: this file owns the
 * SDK, the request, the retry policy and usage parsing; nothing above it knows which provider is
 * in use. What is different here is the *number of answers a defect can earn*, and that is the
 * whole reason this module is worth reading closely.
 *
 * (Two words are deliberately avoided in this file's prose and the assembly's: it is a registered
 * model-visible surface in `evals/corpus.ts`, so a word a frozen eval corpus carries as a case
 * input cannot appear here. `docs/phase-4b-plan.md §3.5` resolves such a collision at the corpus
 * where it can, and at the surface where the corpus is frozen — which it is.)
 *
 * # Three re-prompts, and everything else repaired without one
 *
 * `docs/model-contracts.md §6.3` closes with the rule this file exists to execute: *"Re-prompts
 * exist only for schema-invalid output, a token-cap violation and a selector collision. Repairs of
 * every other kind never call a model."* `spec.md §32 #22` says the same from the other side. So:
 *
 * | defect | model passes it may open | what happens when it persists |
 * | --- | --- | --- |
 * | schema-invalid | **1** | library fallback for the page, telemetry `fallback: library` |
 * | attractive-token cap | **1** | deterministic neutralization, logged `planner` — **never a second ask** |
 * | selector collision | **1** | library fallback for the page |
 * | structural, coverage, capability, responsive, box, motif-kind, fit | **0** | the compiler repairs them, deterministically and logged |
 *
 * The bottom row is enforced by omission and that is deliberate: this module does not run
 * `validateStructure`, does not know what a coverage defect is, and has no branch that could grow
 * one. A schema-valid tree with a nesting violation leaves here as an ordinary success and meets
 * `repair()` downstream, which is exactly `§6.3`'s order. The alternative — classifying every
 * defect here so that some of them "are not re-prompted" — is how a boundary ends up one edit away
 * from a quality retry, and `docs/renderer-invariant-obligations.md` already records what a
 * re-roll loop costs.
 *
 * The token-cap row is the one that reads strangely and is right: canon gives that defect one ask
 * and then **neutralization**, not a second ask and not a fallback. A tree that still carries a
 * forbidden device after `neutralize()` is a failure of our own deterministic code, so it fails
 * visibly rather than shipping a page that breaks the batch's diversity plan.
 *
 * # Transport retries are not re-prompts
 *
 * A timeout, a 429 or a 5xx never produced an answer, so retrying one asks the model nothing it
 * was not already asked. They are counted separately (`usage.transientRetries` against
 * `usage.reprompts`) because conflating them would let a run report a policy violation it did not
 * commit — or hide one it did.
 *
 * # What is preserved
 *
 * Everything paid for, on every path: the raw text of every response, per-response usage at its
 * own tier, attempt counts including the attempts that threw, and the request id of the accepted
 * response. A library fallback is recorded **as a fallback**, with its reason, its seed and the
 * fixture it used, because `§8` is explicit that a fallback page "is never presented as a model
 * composition in evaluation".
 *
 * No hidden reasoning is requested, returned to callers or persisted. Reasoning token *counts* are
 * recorded as usage; reasoning *content* never is (`spec.md §7.10`).
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, `Renderer proof`.
 * Guardrails: `spec.md §32 #21`, `#22`, `#23`; `CLAUDE.md §5.1`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

import {
  CompositionError,
  type CompositionCallInput,
  type CompositionCallResult,
  type CompositionRepromptKind,
  type CompositionUsage,
} from "@/lib/ai/composition/contract";
import {
  COMPOSITION_PROMPT_VERSION,
  COMPOSITION_SCHEMA_VERSION,
  PRIMITIVE_SET_VERSION,
} from "@/lib/ai/versions";
import type { ProviderResponseUsage } from "@/lib/ai/openai/event-identity";
import { openAiEnv } from "@/lib/env";
import type { CompositionTree, Repair, Violation } from "@/lib/renderer/composition/nodes";
import { validateSchema } from "@/lib/renderer/composition/validate-schema";
import { neutralize, tokenViolations, type AttractiveTokenId } from "@/lib/renderer/planner";
import {
  terminalFallback,
  type CollisionAttempt,
  type FallbackTelemetry,
  type SchemaAttempt,
  type TerminalFallbackReason,
} from "@/lib/renderer/recovery";

import {
  assembleCompositionUserMessage,
  collisionCorrectionTurn,
  schemaCorrectionTurn,
  tokenCapCorrectionTurn,
  COMPOSITION_INPUT_ASSEMBLY_VERSION,
} from "./composition-input";

const PROMPT_PATH = path.join(process.cwd(), "docs", "model-prompts", "composition.system.md");

/**
 * Bounded transient retries. Provider-side failures only; never an output problem.
 *
 * Exported because a cost bound multiplies by the attempt count these produce, and a bound that
 * reserved for fewer attempts than the policy permits would be wrong in the direction of spending
 * money.
 */
export const MAX_TRANSIENT_RETRIES = 2;
export const TRANSIENT_BACKOFF_MS = [500, 1500];

/**
 * A hung request must not eat the caller's budget and abort the two concepts beside it.
 *
 * Longer than DesignIntent's because the answer is larger by an order of magnitude — up to six
 * sections of up to forty nodes, authored under `high` reasoning — not because failure is more
 * tolerable here.
 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 180_000;

/**
 * Passes at the model per logical call: the original, plus the three re-prompts `§6.3` allows.
 *
 * Four, not two. The three re-prompts are for different defects and are spent independently — a
 * response can be schema-invalid, then legal but over its token allotment, then legal and within
 * allotment but colliding — so the worst legitimate case is one original and three corrections.
 * None of them may be spent twice, which `repromptsSpent` enforces per kind rather than as a
 * total.
 */
export const COMPOSITION_PASSES = 4;

/**
 * The service tier every Composition request is sent on.
 *
 * Pinned, not inherited, for the reason Event Identity records: the verified rate profile is built
 * against standard pricing, Fast Mode is 2× and the Batch/Flex tiers are ½, so an inherited tier
 * would price this call against a bound that does not describe it.
 */
export const COMPOSITION_SERVICE_TIER = "default" as const;

/**
 * Provider-side response persistence, off.
 *
 * This call is stateless: a correction pass resends the rejected assistant turn explicitly rather
 * referring to a stored response. Left at the provider's default, briefs and model output would
 * accumulate in a third-party store we neither read nor purge.
 */
export const COMPOSITION_STORE_RESPONSES = false as const;

/**
 * Reasoning effort, pinned here rather than read from the shared environment variable.
 *
 * This is the call that authors the page's structure, and `CLAUDE.md §2` puts design quality in
 * the "core functionality, not polish" column. Effort is also what the cost bound is derived
 * against: it drives reasoning tokens, reasoning tokens are billed as output, and a bound derived
 * against `high` would not describe a request an environment variable had quietly moved to `low`.
 */
export const COMPOSITION_REASONING_EFFORT = "high" as const;

/**
 * The output ceiling this request sends, and therefore the one a cost bound is derived from.
 *
 * The largest legal tree is six sections of forty nodes; each node is a small object of a type tag
 * and a few enum tokens, so a maximal tree serializes to a few thousand tokens and a typical one
 * to far less. The remaining headroom is reasoning, which is billed as output and is the only part
 * that can legitimately run long.
 *
 * A response that hits the ceiling is truncated, arrives as unparseable JSON, and is handled as
 * schema-invalid — one of the three classes that may open a pass — rather than being silently
 * accepted in part.
 */
export const COMPOSITION_MAX_OUTPUT_TOKENS = 48_000;

/** Every request-shaping option that is not the instruction file or the assembled input. */
export type CompositionModelConfig = {
  model: string;
  reasoningEffort: typeof COMPOSITION_REASONING_EFFORT;
  serviceTier: typeof COMPOSITION_SERVICE_TIER;
  store: typeof COMPOSITION_STORE_RESPONSES;
  maxOutputTokens: typeof COMPOSITION_MAX_OUTPUT_TOKENS;
};

/**
 * The canonical model configuration for a Composition call.
 *
 * One builder, so a caller cannot assemble a basis that omits an option the request actually
 * sends: two requests that would be billed or persisted differently are different calls.
 */
export function compositionModelConfig(model: string): CompositionModelConfig {
  return {
    model,
    reasoningEffort: COMPOSITION_REASONING_EFFORT,
    serviceTier: COMPOSITION_SERVICE_TIER,
    store: COMPOSITION_STORE_RESPONSES,
    maxOutputTokens: COMPOSITION_MAX_OUTPUT_TOKENS,
  };
}

/**
 * The most provider attempts one logical `generateComposition` call can make.
 *
 * Twelve: four passes, each of which may be retried twice for transport failures. Exported rather
 * than recomputed, so raising `MAX_TRANSIENT_RETRIES` raises the spend reservation instead of
 * quietly raising real worst-case spend past it.
 */
export const MAX_PROVIDER_ATTEMPTS_PER_CALL = COMPOSITION_PASSES * (MAX_TRANSIENT_RETRIES + 1);

let cachedSystemPrompt: string | undefined;

/**
 * The committed instruction file, read at runtime rather than inlined, so the artifact under
 * `docs/model-prompts/` is provably the one that ran and `COMPOSITION_PROMPT_VERSION` names a real
 * file (`docs/model-contracts.md §2`).
 */
export function systemPrompt(): string {
  if (cachedSystemPrompt === undefined) cachedSystemPrompt = readFileSync(PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

/* ------------------------------------------------------------------ small helpers */

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
function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: Violation } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (error) {
    return {
      ok: false,
      error: {
        rule: "schema.json",
        path: "",
        detail: `response was not valid JSON: ${String(error)}`,
      },
    };
  }
}

/**
 * A structured clone of the parsed tree, taken before anything mutates it.
 *
 * `neutralize()` mutates in place and documents that the caller owns cloning. Cloning here rather
 * than there means `result.response` — the envelope as it arrived — still shows what the model
 * actually returned after a neutralization has changed `result.output`. A repair nobody can see
 * the "before" of is the silent fallback this boundary exists not to have.
 */
function cloneTree(tree: CompositionTree): CompositionTree {
  return JSON.parse(JSON.stringify(tree)) as CompositionTree;
}

/* ------------------------------------------------------------------ the call */

export async function generateComposition(
  input: CompositionCallInput,
): Promise<CompositionCallResult> {
  const env = openAiEnv();
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    // Retrying is this file's job, not the SDK's. Left at the default (2) every `create()` would
    // be up to three HTTP attempts, making the worst case thirty-six requests against the twelve
    // this policy documents — and `transientRetries` would undercount real provider load.
    maxRetries: 0,
    timeout: PROVIDER_REQUEST_TIMEOUT_MS,
  });

  const startedAt = Date.now();

  /** Spent at most once each, per `§6.3`. Never a total: the three are independent budgets. */
  const repromptsSpent: Record<CompositionRepromptKind, 0 | 1> = {
    schema: 0,
    token_cap: 0,
    collision: 0,
  };

  /**
   * `§6.1`'s `avoid`, once a collision has produced one. Sticky: a later schema correction must not
   * silently drop the skeletons the selector already told this candidate to stay away from.
   */
  let avoid: readonly string[] = [];

  /**
   * The evidence `renderer/recovery` demands before it will serve a library page: the failure that
   * authorized the one retry, and the retry that also failed.
   *
   * Two separate histories, and each holds only the attempts on **its own** path. A single list of
   * every response would overflow the fallback's two-attempt budget the moment a run spent more
   * than one kind of correction, and would also mix a schema-invalid attempt into a collision
   * history — which that module refuses outright, correctly, as `attempt-off-path`.
   */
  const schemaAttempts: SchemaAttempt[] = [];
  const collisionAttempts: CollisionAttempt[] = [];

  let correctionTurn: string | undefined;
  let previousRaw: string | undefined;
  let lastErrors: Violation[] = [];
  let lastColliding: readonly string[] = [];

  /**
   * Did the **first** response parse strictly? `docs/model-contracts.md §6.4` CO-01 measures
   * exactly that — "≥ 90% of responses parse strictly" — and nothing else.
   *
   * Recorded when the first response is judged, rather than derived from the pass index at the
   * end. A first response that was schema-valid but broke its token allotment returns on a later
   * pass, so `pass === 0` would call it schema-invalid and understate CO-01 by every token-cap and
   * collision case in a run.
   */
  let firstResponseSchemaValid: boolean | undefined;

  let transientRetries = 0;
  const rawResponses: string[] = [];
  const requestTexts: string[] = [];
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
  const partialUsage = (): Partial<CompositionUsage> => ({
    latencyMs: Date.now() - startedAt,
    transientRetries,
    reprompts: { ...repromptsSpent },
    ...aggregateUsage(),
  });

  /**
   * A library page, with the attribution `§8` requires.
   *
   * Never reached on a first failure: `terminalFallback` re-checks the attempt history itself and
   * refuses anything that is not the exhausted-retry transition `§3` and `§5` describe. A refusal
   * is a bug in the bookkeeping above, so it surfaces as a visible error rather than as a page —
   * the alternative is reaching the library on a path canon does not have (`CLAUDE.md §5.1`).
   */
  const fallbackOrThrow = (
    reason: TerminalFallbackReason,
    kind: "invalid_output" | "collision",
    message: string,
  ): { tree: CompositionTree; telemetry: FallbackTelemetry } => {
    const outcome =
      reason === "schema-invalid-after-retry"
        ? terminalFallback({ reason, seed: input.seed, attempts: schemaAttempts })
        : terminalFallback({ reason, seed: input.seed, attempts: collisionAttempts });
    if (!outcome.ok) {
      throw new CompositionError(
        `${message} The library fallback was refused (${outcome.refusal}).`,
        kind,
        {
          errors: kind === "invalid_output" ? lastErrors : undefined,
          colliding: kind === "collision" ? lastColliding : undefined,
          fallbackRefusal: outcome.refusal,
        },
        partialUsage(),
        [...rawResponses],
      );
    }
    return { tree: outcome.tree, telemetry: outcome.telemetry };
  };

  for (let pass = 0; pass < COMPOSITION_PASSES; pass += 1) {
    // Rebuilt every pass, because a collision correction adds `§6.1`'s `avoid` block. A schema or
    // token-cap correction produces identical bytes, so `requestTexts` records the message only
    // when it actually changed — one entry on the ordinary path.
    const userMessage = assembleCompositionUserMessage(input, { avoid });
    if (requestTexts[requestTexts.length - 1] !== userMessage) requestTexts.push(userMessage);

    const messages: OpenAI.Responses.ResponseInput = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userMessage },
    ];
    if (correctionTurn && previousRaw !== undefined) {
      // The Responses call is stateless, so without this the model is asked to correct an answer
      // it was never shown — making the "correction" a fresh generation with a confusing preamble,
      // which is exactly the re-roll this policy exists to prevent.
      messages.push({ role: "assistant", content: previousRaw });
      messages.push({ role: "user", content: correctionTurn });
    }

    let response: OpenAI.Responses.Response | undefined;
    for (let attempt = 0; ; attempt += 1) {
      try {
        providerAttempts += 1;
        response = await client.responses.create({
          model: env.OPENAI_MODEL,
          input: messages,
          reasoning: { effort: COMPOSITION_REASONING_EFFORT },
          // All four pinned rather than inherited, and all four part of `modelConfig`.
          service_tier: COMPOSITION_SERVICE_TIER,
          store: COMPOSITION_STORE_RESPONSES,
          max_output_tokens: COMPOSITION_MAX_OUTPUT_TOKENS,
          // JSON mode, not provider-side schema enforcement. `docs/model-contracts.md §3`: the
          // Phase B confirmation run "used raw JSON output without provider-side schema
          // enforcement, so schema validity is a measured property of the instruction file, not of the
          // provider", and `validateSchema` "is the one that decides" — it is stricter than JSON
          // Schema on unknown keys, node counts, nesting and capabilities. The generated
          // `compositionJsonSchema()` is also a recursive superset gate with optional props, which
          // is not expressible under the provider's strict mode; adopting it would be a change to
          // what CO-01 measures and needs a fresh confirmation run, not a quiet upgrade here.
          text: { format: { type: "json_object" } },
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
        throw new CompositionError(
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

    const settled = response;
    const finish = (
      tree: CompositionTree,
      parsedResponse: unknown,
      repairs: Repair[],
      fallback: FallbackTelemetry | null,
    ): CompositionCallResult => ({
      raw,
      rawResponses: [...rawResponses],
      output: tree,
      // `undefined` on a fallback: `§8` forbids presenting a library page as a model composition,
      // and reporting the discarded response beside it as "the response" would do exactly that.
      response: fallback ? undefined : parsedResponse,
      repairs,
      fallback,
      promptVersion: COMPOSITION_PROMPT_VERSION,
      schemaVersion: COMPOSITION_SCHEMA_VERSION,
      primitiveSetVersion: PRIMITIVE_SET_VERSION,
      requestTexts: [...requestTexts],
      requestText: requestTexts[requestTexts.length - 1],
      inputAssemblyVersion: COMPOSITION_INPUT_ASSEMBLY_VERSION,
      usage: {
        provider: "openai",
        model: settled.model ?? env.OPENAI_MODEL,
        providerRequestId: settled.id,
        ...aggregateUsage(),
        latencyMs: Date.now() - startedAt,
        transientRetries,
        schemaValidFirstCall: firstResponseSchemaValid === true,
        reprompts: { ...repromptsSpent },
      },
    });

    /* ---- 1. strict schema (`§6.3` step 1) --------------------------------------------- */

    // The response is handed to `validateSchema` exactly as it parsed — nothing is stripped first.
    // The canonical schema closes the top level to `version` and `sections`
    // (`COMPOSITION_RESPONSE_KEYS`), so any extra key is an unknown key and earns the one
    // correction pass like any other schema defect. Pre-stripping a key we recognise would
    // be this boundary quietly widening the contract on the model's behalf.
    const parsed = parseJson(raw);
    const parsedResponse = parsed.ok ? parsed.value : undefined;
    const schema = parsed.ok
      ? validateSchema(parsedResponse)
      : { ok: false, errors: [parsed.error] as Violation[] };

    if (pass === 0) firstResponseSchemaValid = schema.ok;

    if (!schema.ok) {
      lastErrors = schema.errors;
      schemaAttempts.push({ schemaValid: false });
      if (repromptsSpent.schema === 0) {
        repromptsSpent.schema = 1;
        correctionTurn = schemaCorrectionTurn(schema.errors);
        previousRaw = raw;
        continue;
      }
      // Second failure: the whole page falls back to the library, recorded as such.
      const { tree, telemetry } = fallbackOrThrow(
        "schema-invalid-after-retry",
        "invalid_output",
        "Composition output was schema-invalid after the single permitted correction.",
      );
      return finish(tree, undefined, [], telemetry);
    }

    const tree = parsedResponse as CompositionTree;

    /* ---- 3. attractive-token caps (`§6.3` step 3) ------------------------------------- */

    /**
     * A tree with no sections is schema-valid and cannot be inspected for tokens.
     *
     * `validateSchema` bounds the *shape* of a section but not the *number* of them — the 3-to-6
     * rule is a structural limit, repaired at `§6.3` step 2, which is the compiler's and not this
     * boundary's. Meanwhile the `heroNumeral` detector reads `sections[0]` directly, so an empty
     * array would throw out of `tokenViolations` and surface a schema-valid response as a crash.
     *
     * Skipping the check is the correct answer rather than a convenient one. A sectionless tree
     * has no hero to put a numeral in, so there is nothing to cap; what it has is a structural
     * defect, and `spec.md §32 #22` forbids re-prompting for one. It goes to the compiler, whose
     * repair supplies the missing sections and whose own planner-cap step
     * (`docs/event-renderer-system.md §5`) runs on the repaired tree.
     */
    const inspectable = tree.sections.length > 0;
    const violations: AttractiveTokenId[] = inspectable
      ? tokenViolations(tree, input.forbiddenTokens)
      : [];
    let repairs: Repair[] = [];
    let served: CompositionTree = tree;

    if (violations.length > 0) {
      if (repromptsSpent.token_cap === 0) {
        repromptsSpent.token_cap = 1;
        correctionTurn = tokenCapCorrectionTurn(violations);
        previousRaw = raw;
        continue;
      }
      // It persisted. Canon gives this defect deterministic neutralization here, **not** a second
      // ask and **not** the library: `§6.3` step 3, and `docs/event-renderer-system.md §5`.
      served = cloneTree(tree);
      repairs = neutralize(served, input.forbiddenTokens);
      const remaining = tokenViolations(served, input.forbiddenTokens);
      if (remaining.length > 0) {
        // Our own repair did not do what it claims to do. Shipping the page anyway would report a
        // diversity plan that did not happen, so this fails visibly instead.
        throw new CompositionError(
          "Deterministic neutralization did not clear this candidate's forbidden attractive " +
            `token(s): ${remaining.join(", ")}.`,
          "token_cap",
          { tokens: remaining },
          partialUsage(),
          [...rawResponses],
          repairs,
        );
      }
    }

    /* ---- 5. selector (`§6.3` step 5) --------------------------------------------------- */

    const colliding = input.collides?.(served) ?? null;
    if (colliding && colliding.length > 0) {
      lastColliding = colliding;
      collisionAttempts.push({ schemaValid: true, resolved: false });
      if (repromptsSpent.collision === 0) {
        repromptsSpent.collision = 1;
        avoid = colliding;
        correctionTurn = collisionCorrectionTurn();
        previousRaw = raw;
        continue;
      }
      const { tree: page, telemetry } = fallbackOrThrow(
        "selector-collision-after-retry",
        "collision",
        "Composition output collided with a sibling after the single permitted correction.",
      );
      return finish(page, undefined, [], telemetry);
    }

    return finish(served, parsedResponse, repairs, null);
  }

  // Unreachable: every pass either returns or spends one of the three correction budgets, and
  // there are exactly as many passes as budgets plus one. Kept so that a future edit which adds a `continue` without a
  // budget cannot fall off the end of the loop and return `undefined`.
  throw new CompositionError(
    "Composition exhausted every permitted pass without producing a result.",
    "invalid_output",
    { errors: lastErrors, colliding: lastColliding },
    partialUsage(),
    [...rawResponses],
  );
}
