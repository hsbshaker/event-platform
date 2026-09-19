import "server-only";

/**
 * The OpenAI Images adapter for the artwork port.
 *
 * `src/lib/ai/visual-art/` is the port: the intent, the classification, the spend gate, the
 * fallback. This file is the adapter, and it lives here with the other four capability adapters
 * for a reason that is load-bearing rather than tidy. `visual-art/boundary.test.ts` scans every
 * file under that directory and its import closure and fails if any of them can reach a network —
 * that scan is the guarantee that production cannot spend money by accident. An SDK import inside
 * the port would end it. The dependency runs adapter → port and never back.
 *
 * Nothing here selects a provider either. `getArtworkProvider()` in `visual-art/enablement.ts`
 * still throws unconditionally, so no production code path reaches this file; a caller that wants
 * it must construct it explicitly, name a model, and hold a spend reservation. That is what an
 * authorized spike does and what production deliberately cannot do.
 *
 * # Why the intent is rendered here
 *
 * `docs/technology-decisions.md §8` puts "request formatting" behind the capability function, and
 * a `VisualArtIntent` is not a prompt — it is a structured brief whose fields are enums and short
 * prose. Turning it into the one string this API takes is provider-specific work, so it happens
 * here, from the existing contract, and no parallel prompt contract is introduced. Change the
 * wording and you change this adapter; change what the brief *means* and you change the contract.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #13`, `#32`; `CLAUDE.md §3`. Canon: `spec.md §7.6a`, `docs/product-doctrine.md §10`.
 */
import OpenAI from "openai";

import { openAiEnv } from "@/lib/env";
import { ArtworkProviderError } from "@/lib/ai/visual-art/failure";
import type {
  ArtworkProvider,
  ArtworkProviderRequest,
  ArtworkProviderResponse,
} from "@/lib/ai/visual-art/provider";
import type { VisualArtIntent } from "@/lib/ai/visual-art/contract";
import { artworkCostUsd, type ArtworkUsage } from "./artwork-pricing";

/** The provider identifier recorded on every asset and every telemetry line. */
export const OPENAI_ARTWORK_PROVIDER_ID = "openai-images";

/**
 * Exactly one image per request, and not a parameter.
 *
 * `n` is the one knob on this API that multiplies the bill without changing the request, so it is
 * a constant rather than an option. A caller that wants two images makes two requests, each of
 * which must reserve against the budget separately — which is the whole point of the gate.
 */
const IMAGES_PER_REQUEST = 1 as const;

export interface OpenAiArtworkOptions {
  /**
   * An exact, dated model id. Never an undated alias: an alias moves, and an asset whose model
   * cannot be named is not evidence about any model.
   */
  readonly model: string;
  readonly size?: "1024x1024" | "1024x1536" | "1536x1024";
  readonly quality?: "low" | "medium" | "high" | "xhigh";
  /** `transparent` is the point for the `object` and `framed` roles; the API needs it asked for. */
  readonly background?: "transparent" | "opaque" | "auto";
  readonly outputFormat?: "png" | "webp" | "jpeg";
  /** Injectable for tests. Defaults to a real client built from the environment. */
  readonly client?: Pick<OpenAI, "images">;
}

/**
 * The brief, rendered into the single string this API accepts.
 *
 * Ordered so the subject arrives before the constraints that shape it, and the host's own words
 * arrive last and labelled — the same precedence the Composition prompt uses, for the same reason:
 * a constraint buried mid-paragraph reads as advice.
 */
export function artworkPromptFor(intent: VisualArtIntent): string {
  const weight: Record<VisualArtIntent["subjectWeight"], string> = {
    dominant: "The subject should dominate the frame.",
    balanced: "The subject should sit in balance with the space around it.",
    incidental: "The subject should stay incidental — atmosphere, not a focal point.",
  };
  const space: Record<VisualArtIntent["negativeSpace"], string> = {
    top: "Leave the upper part of the frame open and unworked.",
    bottom: "Leave the lower part of the frame open and unworked.",
    left: "Leave the left of the frame open and unworked.",
    right: "Leave the right of the frame open and unworked.",
    center: "Leave the middle of the frame open and unworked.",
    throughout: "Keep the whole frame restrained; nothing may compete with text laid over it.",
    none: "No region needs to be kept clear.",
  };
  const crop: Record<VisualArtIntent["cropSafety"], string> = {
    tight: "The frame may be nearly all subject; little will be trimmed.",
    moderate: "Keep a margin around the subject; the frame will be trimmed somewhat.",
    generous: "Keep a generous margin on every side; the frame will be trimmed substantially.",
  };
  const palette: Record<VisualArtIntent["paletteRelationship"], string> = {
    harmonize: "Draw the colour from this palette",
    contrast: "Set the colour in deliberate counterpoint to this palette, within the same world",
    muted: "Keep the colour largely tonal and restrained, answering to this palette",
  };
  const background: Record<VisualArtIntent["background"], string> = {
    transparent:
      "The background must be fully transparent. Render the subject alone, with no backdrop, " +
      "no canvas, no paper texture behind it and no rectangular field of colour.",
    opaque: "The artwork may fill its frame.",
    either: "A transparent background is welcome but not required.",
  };

  const lines = [
    intent.subject,
    "",
    `Medium and handling: ${intent.medium}`,
    "",
    `Placement on the page: ${intent.composition}`,
    weight[intent.subjectWeight],
    space[intent.negativeSpace],
    crop[intent.cropSafety],
    "",
    background[intent.background],
    `${palette[intent.paletteRelationship]}: ${intent.paletteHexes.join(", ")}.`,
    "",
    "Must not appear, under any reading of the brief:",
    ...intent.prohibited.map((p) => `- ${p}`),
  ];

  if (intent.hostConstraints.length > 0) {
    lines.push(
      "",
      "The host's own requirements. These are authoritative and bind this image:",
      ...intent.hostConstraints.map((c) => `- ${c}`),
    );
  }
  return lines.join("\n");
}

interface ImagesUsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number; cached_tokens?: number };
}

function readUsage(usage: ImagesUsagePayload | undefined): ArtworkUsage {
  const details = usage?.input_tokens_details ?? {};
  const inputTokens = usage?.input_tokens ?? 0;
  return {
    inputTokens,
    outputTokens: usage?.output_tokens ?? 0,
    cachedInputTokens: details.cached_tokens ?? 0,
    // Where the breakdown is absent, everything billed as input is treated as text — the more
    // expensive assumption would be image tokens, but a generation request sends no image, and
    // pretending otherwise would overstate the cost rather than merely estimate it.
    inputTextTokens: details.text_tokens ?? inputTokens,
    inputImageTokens: details.image_tokens ?? 0,
  };
}

/** What this adapter reports about a call, beyond the asset. Never the image itself. */
export interface OpenAiArtworkTelemetry {
  readonly model: string;
  readonly size: string;
  readonly quality: string;
  readonly background: string;
  readonly outputFormat: string;
  readonly n: number;
  readonly usage: ArtworkUsage;
  readonly costUsd: number | null;
  readonly latencyMs: number;
  readonly providerRequestId: string | null;
  readonly promptChars: number;
  readonly decodedBytes: number;
}

export interface OpenAiArtworkProvider extends ArtworkProvider {
  /** The last call's telemetry, for an evidence record. Base64 never appears in it. */
  readonly lastCall: OpenAiArtworkTelemetry | null;
}

/**
 * Build an OpenAI Images provider for one pinned model.
 *
 * Constructing this does not authorize a call: `generateVisualArt` still requires a live
 * reservation from an `ArtworkBatchBudget`, and that is what bounds the spend.
 */
export function createOpenAiArtworkProvider(options: OpenAiArtworkOptions): OpenAiArtworkProvider {
  const {
    model,
    size = "1024x1024",
    quality = "high",
    background = "transparent",
    outputFormat = "png",
  } = options;

  if (!model || /^[a-z0-9.-]*$/.test(model) === false) {
    throw new TypeError(`an artwork model id is required and must be literal, got ${model}`);
  }

  let lastCall: OpenAiArtworkTelemetry | null = null;

  const client =
    options.client ??
    new OpenAI({
      apiKey: openAiEnv().OPENAI_API_KEY,
      // Retrying is the port's decision, bounded and counted there. Left at the SDK default, one
      // authorized request could become three billed ones without anything saying so.
      maxRetries: 0,
    });

  return {
    id: OPENAI_ARTWORK_PROVIDER_ID,
    model,
    get lastCall() {
      return lastCall;
    },

    async generateArtwork(request: ArtworkProviderRequest): Promise<ArtworkProviderResponse> {
      const prompt = artworkPromptFor(request.intent);
      const startedAt = Date.now();

      const response = await client.images.generate(
        {
          model,
          prompt,
          n: IMAGES_PER_REQUEST,
          size,
          quality,
          background,
          output_format: outputFormat,
          // No streamed preview frames. Each partial is billed, and nothing here consumes them.
          partial_images: 0,
        } as Parameters<OpenAI["images"]["generate"]>[0],
        { signal: request.signal },
      );

      const latencyMs = Date.now() - startedAt;
      const payload = response as unknown as {
        data?: { b64_json?: string; url?: string }[];
        usage?: ImagesUsagePayload;
        _request_id?: string;
      };

      const first = payload.data?.[0];
      const b64 = first?.b64_json;
      if (typeof b64 !== "string" || b64.length === 0) {
        // A URL payload would be inspectable only by fetching it, which this boundary does not do,
        // and an un-inspected asset cannot satisfy a transparency-required role. Better a named
        // failure than an asset nobody measured.
        throw new ArtworkProviderError(
          "malformed_output",
          first?.url
            ? "the Images API returned a URL; this adapter requires inline image bytes so the " +
                "asset can be inspected rather than trusted"
            : "the Images API returned no image data",
        );
      }

      const bytes = new Uint8Array(Buffer.from(b64, "base64"));
      const usage = readUsage(payload.usage);

      lastCall = {
        model,
        size,
        quality,
        background,
        outputFormat,
        n: IMAGES_PER_REQUEST,
        usage,
        costUsd: artworkCostUsd(model, usage),
        latencyMs,
        providerRequestId: payload._request_id ?? null,
        // The prompt's length, never the prompt's bytes of output. Nothing here can carry base64:
        // this object is what telemetry and evidence read, and it holds no image data at all.
        promptChars: prompt.length,
        decodedBytes: bytes.byteLength,
      };

      return {
        payload: { kind: "bytes", mediaType: `image/${outputFormat}`, bytes },
        providerId: OPENAI_ARTWORK_PROVIDER_ID,
        model,
        ...(payload._request_id ? { providerRequestId: payload._request_id } : {}),
        ...(lastCall.costUsd !== null ? { costUsd: lastCall.costUsd } : {}),
      };
    },
  };
}
