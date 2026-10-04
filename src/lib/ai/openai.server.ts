import "server-only";

import type { z } from "zod";

import { cardDesignSchema } from "@/lib/card/design";
import { generationEnv } from "@/lib/env";

import { artworkInspectionSchema, artworkModerationSchema } from "./artwork-inspection";
import { ModelOutputError, ProviderCallError, ProviderRefusalError } from "./errors";
import { eventIdentitySchema } from "./event-identity";
import { extractedFactsSchema } from "./fact-extraction";
import { metered } from "./meter.server";
import type { MeteredCallResult, RunInfo } from "./meter.server";
import { MODELS } from "./models";
import { RESERVATION_USD } from "./pricing";
import type { TokenUsage } from "./pricing";
import { systemPrompt } from "./prompts.server";
import type { AiProvider, CardArt, MeterContext, ModelOperation, ModelResult } from "./provider";
import {
  artworkInspectionRequest,
  artworkModerationRequest,
  cardArtRequest,
  cardDesignRequest,
  eventIdentityRequest,
  factExtractionRequest,
} from "./requests";
import type { ArtRequest, StructuredRequest } from "./requests";
import {
  CARD_ART_INSPECTION_PROMPT_VERSION,
  CARD_ART_INSPECTION_SCHEMA_VERSION,
  CARD_ART_MODERATION_VERSION,
  CARD_ART_PROMPT_VERSION,
  CARD_DESIGN_PROMPT_VERSION,
  CARD_DESIGN_SCHEMA_VERSION,
  CARD_LAYOUT_SET_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
  FACT_EXTRACTION_PROMPT_VERSION,
  FACT_EXTRACTION_SCHEMA_VERSION,
} from "./versions";

/**
 * The OpenAI implementation of the provider interface (`docs/technology-decisions.md §8.1`),
 * plain `fetch`, no SDK, as Phase 3 validation called it.
 *
 * Every request is made inside `metered(...)`: the HTTP helpers below are module-private and are
 * only ever called from a metered call, so nothing reaches the provider without passing the kill
 * switch, the generation check and the spend ceiling, and nothing reaches it without being
 * recorded (`meter.server.ts`). The API key is read inside the metered call, after those checks.
 *
 * Output is validated in the application against the canonical schemas (`spec.md §32 #19`); an
 * invalid one is a `ModelOutputError` with re-prompt-ready problems. Re-prompts, repairs and
 * regenerations are the pipeline's policy (Phase 5b), not this module's.
 *
 * Transient failures (HTTP 429, 408 and 5xx, timeouts, dropped connections) get one ordinary retry
 * (`docs/model-contracts.md §9`) as a separately metered attempt: each attempt passes the ceiling
 * check on its own and is recorded as its own run, because each may be billed.
 */

const API = "https://api.openai.com/v1";

/** Per-request timeouts, well above the Phase 3 p75 latencies (identity 14 s, design 13 s, art 33 s). */
const TIMEOUT_MS: Readonly<Record<ModelOperation, number>> = {
  event_identity: 60_000,
  structured_extraction: 30_000,
  card_design: 60_000,
  card_art: 120_000,
  card_art_inspection: 30_000,
  card_art_moderation: 30_000,
};

const DEFAULT_RETRY_DELAY_MS = 2_000;

export interface OpenAiProviderOptions {
  /** Delay before the one transient retry. Tests set 0. */
  retryDelayMs?: number;
}

function apiKey(): string {
  const key = generationEnv().openAiApiKey;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  return key;
}

interface ApiErrorBody {
  error?: { message?: string; code?: string | null; type?: string };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** One HTTP request to the provider. Only ever called from inside a metered call. */
async function send(
  operation: ModelOperation,
  path: string,
  init: { body: string | FormData; json: boolean },
): Promise<{ body: Record<string, unknown>; requestId?: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey()}` };
  if (init.json) headers["Content-Type"] = "application/json";
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(`${API}/${path}`, {
      method: "POST",
      headers,
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS[operation]),
    });
    body = await res.json().catch(() => undefined);
  } catch (error) {
    const timeout = isTimeout(error);
    throw new ProviderCallError(`${operation}: ${timeout ? "timed out" : "network error"}`, {
      code: timeout ? "timeout" : "network",
      transient: true,
      billing: "unknown",
      cause: error,
    });
  }
  const requestId = res.headers.get("x-request-id") ?? undefined;
  if (!res.ok) {
    const apiError = (body as ApiErrorBody | undefined)?.error;
    const message = apiError?.message ?? res.statusText;
    if (
      res.status === 400 &&
      (apiError?.code === "moderation_blocked" ||
        /safety system|moderation|content policy/i.test(message))
    ) {
      throw new ProviderRefusalError(`${operation}: refused by the provider: ${message}`, {
        code: "provider_refusal",
        billing: "unknown",
        status: res.status,
        providerRequestId: requestId,
      });
    }
    throw new ProviderCallError(`${operation}: HTTP ${res.status} ${message}`, {
      code: `http_${res.status}`,
      transient: res.status === 408 || res.status === 429 || res.status >= 500,
      billing: "none",
      status: res.status,
      providerRequestId: requestId,
    });
  }
  if (!body || typeof body !== "object") {
    throw new ProviderCallError(`${operation}: the response is not JSON`, {
      code: "bad_response",
      billing: "unknown",
      status: res.status,
      providerRequestId: requestId,
    });
  }
  return { body: body as Record<string, unknown>, requestId };
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

/** Responses API usage. Priced by the requested model id (the response may name a dated snapshot). */
function responsesUsage(model: string, raw: unknown): TokenUsage {
  const u = obj(raw);
  return {
    model,
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(obj(u.input_tokens_details).cached_tokens),
    outputTokens: num(u.output_tokens),
    reasoningTokens: num(obj(u.output_tokens_details).reasoning_tokens),
  };
}

function imageUsage(model: string, raw: unknown): TokenUsage {
  const u = obj(raw);
  return {
    model,
    inputTokens: num(u.input_tokens),
    imageInputTokens: num(obj(u.input_tokens_details).image_tokens),
    outputTokens: num(u.output_tokens),
    imageUnits: 1,
  };
}

function problemsOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const at = issue.path.length ? issue.path.map(String).join(".") : "(root)";
    if (issue.code === "unrecognized_keys") {
      return `${at}: unknown field(s) ${issue.keys.map((k) => `"${k}"`).join(", ")} — remove them`;
    }
    return `${at}: ${issue.message}`;
  });
}

async function withTransientRetry<T>(attempt: () => Promise<T>, delayMs: number): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof ProviderCallError) || !error.transient) throw error;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return attempt();
  }
}

/** The structured call: Responses API, strict JSON schema, then the application's own validation. */
async function structuredCall<T>(
  operation: ModelOperation,
  request: StructuredRequest,
  schema: z.ZodType<T>,
): Promise<MeteredCallResult<T>> {
  const { body, requestId } = await send(operation, "responses", {
    body: JSON.stringify(request),
    json: true,
  });
  const usage = responsesUsage(request.model, body.usage);
  const meta = {
    usage,
    providerRequestId: requestId ?? (typeof body.id === "string" ? body.id : undefined),
  };
  const output = Array.isArray(body.output) ? (body.output as Record<string, unknown>[]) : [];
  const message = output.find((o) => o.type === "message");
  const parts = Array.isArray(message?.content)
    ? (message.content as Record<string, unknown>[])
    : [];
  const part = parts.find((c) => c.type === "output_text" || c.type === "refusal");
  const text = typeof part?.text === "string" ? part.text : "";
  if (body.status === "incomplete") {
    const reason = obj(body.incomplete_details).reason ?? "unknown";
    throw new ModelOutputError("incomplete", [`the response was cut off (${reason})`], text, meta);
  }
  if (part?.type === "refusal") {
    const refusal = typeof part.refusal === "string" ? part.refusal : "refused";
    throw new ModelOutputError("refusal", [refusal], refusal, meta);
  }
  if (!part) throw new ModelOutputError("unparseable", ["no output message"], "", meta);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ModelOutputError("unparseable", ["the output is not JSON"], text, meta);
  }
  const valid = schema.safeParse(parsed);
  if (!valid.success) {
    throw new ModelOutputError("schema_invalid", problemsOf(valid.error), text, meta);
  }
  return { value: valid.data, raw: text, ...meta };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

async function imageCall(request: ArtRequest): Promise<MeteredCallResult<CardArt>> {
  const params = {
    model: request.model,
    prompt: request.prompt,
    size: request.size,
    quality: request.quality,
    output_format: request.output_format,
    background: request.background,
  };
  let init: { body: string | FormData; json: boolean };
  if (request.endpoint === "images/edits") {
    if (!request.reference) throw new Error("a shape-switch request needs its reference artwork");
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append(
      "image[]",
      new Blob([Buffer.from(request.reference.bytes)], { type: request.reference.mimeType }),
      "reference.png",
    );
    init = { body: form, json: false };
  } else {
    init = { body: JSON.stringify({ ...params, n: 1 }), json: true };
  }
  const { body, requestId } = await send("card_art", request.endpoint, init);
  const meta = { usage: imageUsage(request.model, body.usage), providerRequestId: requestId };
  const data = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
  // Everything but the image itself, for telemetry.
  const raw = JSON.stringify({
    ...body,
    data: data.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "b64_json"))),
  });
  const b64 = data[0]?.b64_json;
  if (typeof b64 !== "string" || !b64) {
    throw new ModelOutputError("unparseable", ["no image in the response"], raw, meta);
  }
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  if (!isPng(bytes)) {
    throw new ModelOutputError("unparseable", ["the image is not a PNG"], raw, meta);
  }
  return { value: { mimeType: "image/png", bytes }, raw, ...meta };
}

async function moderationCall(
  art: CardArt,
): Promise<MeteredCallResult<{ flagged: boolean; categories: string[] }>> {
  const request = artworkModerationRequest(art);
  const { body, requestId } = await send("card_art_moderation", "moderations", {
    body: JSON.stringify(request),
    json: true,
  });
  const meta = { usage: { model: request.model }, providerRequestId: requestId };
  const first = Array.isArray(body.results) ? body.results[0] : undefined;
  const raw = JSON.stringify(first ?? null);
  const parsed = artworkModerationSchema.safeParse(first);
  if (!parsed.success) {
    throw new ModelOutputError("schema_invalid", problemsOf(parsed.error), raw, meta);
  }
  const categories = Object.entries(parsed.data.categories)
    .filter(([, flagged]) => flagged === true)
    .map(([name]) => name);
  return { value: { flagged: parsed.data.flagged, categories }, raw, ...meta };
}

export function createOpenAiProvider(options: OpenAiProviderOptions = {}): AiProvider {
  const delay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  function run<T>(
    ctx: MeterContext,
    operation: ModelOperation,
    info: RunInfo,
    call: () => Promise<MeteredCallResult<T>>,
  ): Promise<ModelResult<T>> {
    return withTransientRetry(
      () => metered(ctx, operation, RESERVATION_USD[operation], info, call),
      delay,
    );
  }

  // Each method builds its request before the meter, so a local failure (an unreadable prompt
  // file, a shape the layout does not support) reserves and records nothing.
  return {
    async generateEventIdentity(ctx, input) {
      const request = eventIdentityRequest(systemPrompt("event_identity"), input);
      return run(
        ctx,
        "event_identity",
        {
          model: MODELS.text,
          promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
          schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
        },
        () => structuredCall("event_identity", request, eventIdentitySchema),
      );
    },

    async extractEventFacts(ctx, input) {
      const request = factExtractionRequest(systemPrompt("structured_extraction"), input);
      return run(
        ctx,
        "structured_extraction",
        {
          model: MODELS.facts,
          promptVersion: FACT_EXTRACTION_PROMPT_VERSION,
          schemaVersion: FACT_EXTRACTION_SCHEMA_VERSION,
        },
        () => structuredCall("structured_extraction", request, extractedFactsSchema),
      );
    },

    async generateCardDesign(ctx, input) {
      const request = cardDesignRequest(systemPrompt("card_design"), input);
      return run(
        ctx,
        "card_design",
        {
          model: MODELS.text,
          promptVersion: CARD_DESIGN_PROMPT_VERSION,
          schemaVersion: CARD_DESIGN_SCHEMA_VERSION,
          layoutSetVersion: CARD_LAYOUT_SET_VERSION,
        },
        () => structuredCall("card_design", request, cardDesignSchema),
      );
    },

    async generateCardArt(ctx, input) {
      const request = cardArtRequest(input);
      return run(
        ctx,
        "card_art",
        {
          model: request.model,
          promptVersion: CARD_ART_PROMPT_VERSION,
          layoutSetVersion: CARD_LAYOUT_SET_VERSION,
        },
        () => imageCall(request),
      );
    },

    async moderateCardArt(ctx, art) {
      return run(
        ctx,
        "card_art_moderation",
        { model: MODELS.moderation, promptVersion: CARD_ART_MODERATION_VERSION },
        () => moderationCall(art),
      );
    },

    async inspectCardArt(ctx, art) {
      const request = artworkInspectionRequest(art);
      return run(
        ctx,
        "card_art_inspection",
        {
          model: MODELS.text,
          promptVersion: CARD_ART_INSPECTION_PROMPT_VERSION,
          schemaVersion: CARD_ART_INSPECTION_SCHEMA_VERSION,
        },
        () => structuredCall("card_art_inspection", request, artworkInspectionSchema),
      );
    },
  };
}
