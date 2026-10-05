import "server-only";

import {
  MeterRecordError,
  ModelCallRefusedError,
  ModelOutputError,
  ProviderCallError,
} from "@/lib/ai/errors";
import type { EventIdentity } from "@/lib/ai/event-identity";
import type { ExtractedFacts } from "@/lib/ai/fact-extraction";
import type { GenerateEventIdentityInput, ModelResult } from "@/lib/ai/provider";

import { GenerationStageError } from "./stage";
import type { StageContext } from "./stage";

/**
 * Stage 1: Event Identity and, beside it, fact extraction (`spec.md §7.3`, §7.5, §7.10;
 * `docs/model-contracts.md §4`, §4.3, §9; `docs/card-system.md §3`).
 *
 * The two calls read the host's raw prompt and run in parallel; nothing after this stage reads the
 * prompt. Retry policy (`docs/model-contracts.md §9`), beyond the provider's own transient retry:
 * - Event Identity: invalid structured output earns one repair retry carrying the validation
 *   problems; a second invalid output, or a provider failure, is a visible failure
 *   (`GenerationStageError`, stage `identity`).
 * - Fact extraction: invalid output earns one retry; if that fails too, or the provider fails,
 *   the stage still succeeds with no prefill (`facts: null`) and the host enters the details.
 *   A meter refusal of either call ends the stage: no further call could be made either.
 *
 * Every extracted value then passes a deterministic verbatim check: the prompt "extracts only what
 * it literally states" (`spec.md §7.5`), so a value is kept only if it appears in the prompt,
 * ignoring case and runs of whitespace. Anything else is dropped and counted, never repaired.
 *
 * Nothing is persisted here.
 */

export interface IdentityStageInput {
  /** The host's raw prompt. */
  prompt: string;
  /** Inspiration images, on the first identity only (`docs/model-contracts.md §4.1`). */
  inspiration?: GenerateEventIdentityInput["inspiration"];
  /** Try another direction with feedback: the feedback and the identity it revises. */
  redesignFeedback?: string;
  previousIdentity?: EventIdentity;
  /** Run fact extraction beside the identity. Default true; a revision of the identity skips it. */
  extractFacts?: boolean;
  /** The theme seed drawn for this identity (`drawThemeSeed`), used only if the host left the look to us. */
  themeSeed?: string;
}

/** The fact fields extraction returns (`fact_extraction_schema_v1`), in schema order. */
export const EXTRACTED_FACT_FIELDS = [
  "eventType",
  "title",
  "hosts",
  "honoree",
  "date",
  "time",
  "venue",
  "location",
] as const satisfies readonly Exclude<keyof ExtractedFacts, "partial">[];

export type ExtractedFactField = (typeof EXTRACTED_FACT_FIELDS)[number];

/** A value the verbatim check dropped: which field, never the value (it is not the host's). */
export interface DroppedFact {
  field: ExtractedFactField | "partial";
  /** For a partial hint, the field it named. */
  hintField?: string;
}

export type ExtractionOutcome =
  /** Extracted on the first call. */
  | "ok"
  /** Extracted on the one retry after invalid output. */
  | "retried"
  /**
   * No prefill: invalid output twice, the provider failed, or the meter refused the extraction (or
   * could not record it) after the identity had already resolved — the identity is kept.
   */
  | "failed"
  /** Not run (`extractFacts: false`). */
  | "skipped";

/**
 * What the wait surface may show once the identity resolves (`spec.md §7.10`): the interpreted
 * creative signals, in the identity's own words. Never reasoning, never the raw prompt.
 */
export interface IdentityArtifacts {
  creativeDirection: string;
  toneKeywords: string[];
  /** The palette territory: the colours the identity requires or prefers, as named. */
  palette: string[];
  visualMotifs: string[];
}

export interface IdentityStageResult {
  identity: EventIdentity;
  /** The identity call's raw output, as returned (persisted beside the identity). */
  identityRaw: string;
  /** True when the first identity output was valid (no repair retry). */
  identityValidFirstCall: boolean;
  /** The kept facts, every value verbatim from the prompt; null when extraction gave no prefill. */
  facts: ExtractedFacts | null;
  extraction: ExtractionOutcome;
  /** Values the verbatim check dropped. */
  droppedFacts: DroppedFact[];
  artifacts: IdentityArtifacts;
}

/**
 * Lower case with every run of whitespace a single space, trimmed: the form both the prompt and an
 * extracted value are compared in.
 */
function normalized(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A letter, a digit or a combining mark: what a value may not be cut out of. */
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;

/**
 * Whether `needle` occurs in `haystack` as a whole span: an edge of the value that is a letter or a
 * digit must not continue a word of the prompt, so "May 2" is not found in "May 20" nor "Ann" in
 * "Joanne". Both are already `normalized`.
 */
function occursWhole(haystack: string, needle: string): boolean {
  const first = String.fromCodePoint(needle.codePointAt(0) ?? 0);
  const last = Array.from(needle).at(-1) ?? "";
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const before = Array.from(haystack.slice(Math.max(0, at - 2), at)).at(-1) ?? "";
    const after = String.fromCodePoint(haystack.codePointAt(at + needle.length) ?? 0);
    const startsClean = !WORD_CHARACTER.test(first) || !WORD_CHARACTER.test(before);
    const endsClean = !WORD_CHARACTER.test(last) || !WORD_CHARACTER.test(after);
    if (startsClean && endsClean) return true;
  }
  return false;
}

/**
 * Keep only values that appear in the prompt as a whole span (`spec.md §7.5`,
 * `docs/model-contracts.md §4.3`): never a fragment of a longer word or number. An empty or
 * whitespace-only value is no value: it becomes null without counting as a drop.
 */
export function keepVerbatimFacts(
  prompt: string,
  facts: ExtractedFacts,
): { facts: ExtractedFacts; dropped: DroppedFact[] } {
  const haystack = normalized(prompt);
  const dropped: DroppedFact[] = [];
  const appears = (value: string) => occursWhole(haystack, normalized(value));
  const kept = { ...facts, partial: [] as ExtractedFacts["partial"] };
  for (const field of EXTRACTED_FACT_FIELDS) {
    const value = facts[field];
    if (value === null) continue;
    if (normalized(value) === "") {
      kept[field] = null;
    } else if (!appears(value)) {
      kept[field] = null;
      dropped.push({ field });
    }
  }
  for (const hint of facts.partial) {
    if (normalized(hint.text) === "") continue;
    if (appears(hint.text)) kept.partial.push(hint);
    else dropped.push({ field: "partial", hintField: hint.field });
  }
  return { facts: kept, dropped };
}

/** The identity's wait-surface artifacts, also for an identity reused from an earlier generation. */
export function identityArtifacts(identity: EventIdentity): IdentityArtifacts {
  const palette = [
    ...new Set([
      ...identity.paletteIntent.requiredColors,
      ...identity.paletteIntent.preferredColors,
    ]),
  ];
  return {
    creativeDirection: identity.creativeDirection,
    toneKeywords: [...identity.toneKeywords],
    palette,
    visualMotifs: [...identity.visualMotifs],
  };
}

async function runIdentity(
  ctx: StageContext,
  input: IdentityStageInput,
): Promise<{ result: ModelResult<EventIdentity>; validFirstCall: boolean }> {
  const request: GenerateEventIdentityInput = {
    prompt: input.prompt,
    ...(input.inspiration?.length ? { inspiration: input.inspiration } : {}),
    ...(input.redesignFeedback ? { redesignFeedback: input.redesignFeedback } : {}),
    ...(input.previousIdentity ? { previousIdentity: input.previousIdentity } : {}),
    ...(input.themeSeed ? { themeSeed: input.themeSeed } : {}),
  };
  let repairFeedback: string;
  try {
    return {
      result: await ctx.provider.generateEventIdentity(ctx.meter, request),
      validFirstCall: true,
    };
  } catch (error) {
    if (!(error instanceof ModelOutputError)) throw identityFailure(error);
    repairFeedback = error.problems.join("; ");
  }
  try {
    return {
      result: await ctx.provider.generateEventIdentity(ctx.meter, { ...request, repairFeedback }),
      validFirstCall: false,
    };
  } catch (error) {
    throw identityFailure(error);
  }
}

function identityFailure(error: unknown): unknown {
  if (error instanceof ModelOutputError) {
    return new GenerationStageError(
      "identity",
      "invalid_output",
      "Event Identity output was invalid twice.",
      { cause: error },
    );
  }
  if (error instanceof ProviderCallError) {
    return new GenerationStageError("identity", "provider_error", "Event Identity call failed.", {
      cause: error,
    });
  }
  // Meter refusals, telemetry failures and bugs pass through unchanged.
  return error;
}

async function runExtraction(
  ctx: StageContext,
  prompt: string,
): Promise<{ facts: ExtractedFacts | null; outcome: ExtractionOutcome }> {
  for (const outcome of ["ok", "retried"] as const) {
    try {
      const result = await ctx.provider.extractEventFacts(ctx.meter, { prompt });
      return { facts: result.output, outcome };
    } catch (error) {
      if (error instanceof ModelOutputError) continue;
      if (error instanceof ProviderCallError) break;
      throw error;
    }
  }
  return { facts: null, outcome: "failed" };
}

export async function runIdentityStage(
  ctx: StageContext,
  input: IdentityStageInput,
): Promise<IdentityStageResult> {
  const extract = input.extractFacts ?? true;
  // Both calls are awaited to the end before either error is thrown, so no metered call is left
  // running behind a failed stage.
  const [identitySettled, extractionSettled] = await Promise.allSettled([
    runIdentity(ctx, input),
    extract
      ? runExtraction(ctx, input.prompt)
      : Promise.resolve({ facts: null, outcome: "skipped" as const }),
  ]);
  if (identitySettled.status === "rejected") throw identitySettled.reason;
  let extraction: { facts: ExtractedFacts | null; outcome: ExtractionOutcome };
  if (extractionSettled.status === "fulfilled") {
    extraction = extractionSettled.value;
  } else if (
    extractionSettled.reason instanceof ModelCallRefusedError ||
    extractionSettled.reason instanceof MeterRecordError
  ) {
    // The meter refused the extraction (or could not record it) while the identity resolved: the
    // identity is kept, so the orchestration persists it and a retry never interprets the prompt
    // twice; the extraction degrades to no prefill. A refusal stops the next stage anyway.
    extraction = { facts: null, outcome: "failed" };
  } else {
    throw extractionSettled.reason;
  }
  const { result, validFirstCall } = identitySettled.value;
  let facts: ExtractedFacts | null = null;
  let droppedFacts: DroppedFact[] = [];
  if (extraction.facts) {
    ({ facts, dropped: droppedFacts } = keepVerbatimFacts(input.prompt, extraction.facts));
  }
  return {
    identity: result.output,
    identityRaw: result.raw,
    identityValidFirstCall: validFirstCall,
    facts,
    extraction: extraction.outcome,
    droppedFacts,
    artifacts: identityArtifacts(result.output),
  };
}
