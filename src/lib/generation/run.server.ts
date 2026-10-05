import "server-only";

import { randomUUID } from "node:crypto";

import { ModelCallRefusedError } from "@/lib/ai/errors";
import { eventIdentitySchema } from "@/lib/ai/event-identity";
import type { EventIdentity } from "@/lib/ai/event-identity";
import { MODELS } from "@/lib/ai/models";
import { getAiProvider } from "@/lib/ai/provider";
import type { AiProvider, GenerateEventIdentityInput } from "@/lib/ai/provider";
import {
  CARD_ART_PROMPT_VERSION,
  CARD_COMPILER_VERSION,
  CARD_DESIGN_PROMPT_VERSION,
  CARD_DESIGN_SCHEMA_VERSION,
  CARD_LAYOUT_SET_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import { cardContent, cardContentWithPlaceholders } from "@/lib/card/facts";
import { suggestRendering } from "@/lib/card/renderings";
import type { CardContent } from "@/lib/card/text-box";
import { INSPIRATION_BUCKET, sniffImageType } from "@/lib/drafts/inspiration";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { runArtworkStage } from "./artwork.server";
import type { ArtworkStageResult, ArtworkValidationFailure } from "./artwork.server";
import { runDesignStage } from "./design.server";
import type { DesignStageResult } from "./design.server";
import { identityArtifacts, runIdentityStage } from "./identity.server";
import { drawThemeSeed } from "./theme-seeds";
import {
  ArtworkProviderRefusalError,
  attachFailureDetails,
  failureDetailsOf,
  GenerationStageError,
} from "./stage";
import type { StageContext } from "./stage";

/**
 * One card generation, run on the server after the request that started it (`after()`,
 * `src/app/actions/generation.ts`; `docs/technology-decisions.md §8.1`, "Generation execution";
 * `spec.md §7.3`–§7.11, §9.4, §9.5; `docs/card-system.md §3`).
 *
 * Kind `initial` only; another direction and shape switches are Phase 5d.
 *
 * 1. **Load** the event and, when the event has no identity yet, its inspiration (PNG, JPEG and
 *    WEBP only: the provider takes no HEIC/HEIF, so those are skipped and counted).
 * 2. **Identity** (`runIdentityStage`, with fact extraction), persisted as the next revision
 *    (`record_event_identity`). Interpretation happens once: a retry after a failure reuses the
 *    latest revision and makes neither call. Extracted facts are prefill for the host to confirm
 *    and are kept only in `generations.artifacts.facts`, never written to the event.
 * 3. **Design** (`runDesignStage`) from the identity and the event's own fields — host-entered or
 *    host-confirmed values, never the unconfirmed extraction (`spec.md §32 #15`).
 * 4. **Artwork** (`runArtworkStage`) for the design's shape. A provider refusal of the first image
 *    re-prompts the design (`provider-refusal`) and paints its artwork as that refusal's
 *    regeneration, with a notice for the host (`spec.md §7.6`); any other refusal, or a second
 *    one, is a visible failure.
 * 5. **Persist**: the artwork is uploaded to the private `card-art` bucket under a key unique to
 *    this generation, then `persist_generated_card` writes the design, its artwork, the first
 *    active design and the generation's success in one transaction. When it writes nothing (the
 *    generation stopped running, or the event was published) the upload is removed.
 *
 * Every model call is metered against the running generation with a deadline
 * (`GENERATION_DEADLINE_MS` after the request began) below the function's `maxDuration`, so no
 * call outlives the function. Every write goes through a function that writes only while the
 * generation is running: a worker taken over as stale, failed, or overtaken by a publish writes
 * nothing more.
 *
 * Failures end the generation with `fail_generation`, which touches only a running generation: a
 * stage's code (`GenerationStageError`), a meter refusal's reason (`ModelCallRefusedError`), or
 * `internal`. Logs carry the error's name, code and message only — never prompt text, model
 * output, names or places.
 */

/**
 * The function's `maxDuration` is 300 s (`GENERATION_MAX_DURATION_SECONDS`); no model call may be
 * running 285 s after the request began, which leaves the upload and the persist their time.
 */
export const GENERATION_DEADLINE_MS = 285_000;

/** The private artwork bucket (`supabase/migrations/20261004000000_phase4_card_data.sql`). */
export const CARD_ART_BUCKET = "card-art";

/** Inspiration image types the provider accepts; HEIC and HEIF are not among them. */
export const MODEL_INSPIRATION_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

/**
 * The `provider-refusal` re-prompt (`spec.md §7.6`, owner decision): keep the homage's world,
 * drop the character's signature look. The orchestration's words, never the host's.
 */
export const PROVIDER_REFUSAL_FEEDBACK =
  "The image provider refused this design's artwork: it came out too close to a well-known " +
  "protected character. Keep the event's creative direction, but write a new art brief that " +
  "evokes the character's world — its setting, props, palette and visual style — rather " +
  "than the character's signature look. Do not depict that character or a close likeness of it, " +
  "and never name a brand or a character.";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RunGenerationInput {
  generationId: string;
  eventId: string;
  /** The owner or co-host who started it (`startGeneration`); every model call is theirs. */
  userId: string;
  /** Epoch ms when the request that started it began; the deadline counts from here. */
  startedAt?: number;
}

export interface RunGenerationDeps {
  provider?: AiProvider;
  admin?: AdminClient;
  now?: () => number;
  /** The source of the suggested rendering's draw (`suggestRendering`), in [0, 1). */
  random?: () => number;
}

export type RunGenerationOutcome =
  | { status: "succeeded"; cardDesignId: string; round: number }
  /** The generation was failed with this code. */
  | { status: "failed"; code: string }
  /** It was no longer running (or its event was published): nothing more was written. */
  | { status: "stopped" };

export class GenerationKindNotSupportedError extends Error {
  constructor(readonly kind: string) {
    super(`Generation kind ${kind} is not yet supported.`);
    this.name = "GenerationKindNotSupportedError";
  }
}

/** The generation left `running` (or its event was published) while this worker held it. */
class GenerationStoppedError extends Error {
  constructor(step: string) {
    super(`The generation stopped running before ${step}.`);
    this.name = "GenerationStoppedError";
  }
}

/**
 * The §9.5 record of one generation (`generations.telemetry`) when it succeeds. A failed
 * generation's telemetry is `{ failure }` instead (`failureTelemetry`). Never shown to the host.
 */
export interface GenerationTelemetry {
  schemaValidFirstCall: boolean;
  /** Every design re-prompt, in order, by kind (a provider refusal adds a second design's). */
  reprompts: string[];
  artRegenerated: string | null;
  artRepaints: number;
  standardWording: string[];
  inkPanels: { shape: string; zone: string }[];
  versions: {
    identityPrompt: string;
    identitySchema: string;
    designPrompt: string;
    designSchema: string;
    layoutSet: string;
    compiler: string;
    artPrompt: string;
    imageModel: string;
  };
  latency: { identityMs: number | null; designMs: number; artMs: number; totalMs: number };
  /** Null when the identity was reused from an earlier generation. */
  identityValidFirstCall: boolean | null;
  identityReused: boolean;
  extraction: string | null;
  inspirationSkipped: number;
  droppedFacts: number;
  imagesRequested: number;
  repaintsStoppedBy: string | null;
  providerRefusal: boolean;
  /** The rendering drawn for this generation's design (`suggestRendering`). */
  suggestedRendering: string;
  /** The accepted design's rendering is the suggested one. */
  followedSuggestion: boolean;
  /** The theme seed given to a new identity (`drawThemeSeed`); null when the identity was reused. */
  themeSeed: string | null;
}

interface EventRow {
  id: string;
  prompt: string;
  type: string;
  title: string | null;
  hosts: string | null;
  baby_name: string | null;
  venue_name: string | null;
  address: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  /** Read for the card's RSVP-by only (`revealContent`). */
  rsvp_deadline?: string | null;
  timezone?: string | null;
}

/**
 * The facts present so far (`docs/model-contracts.md §5.2`): the event's own fields, which only
 * the host enters or confirms. Formatted as the card shows them (`cardContent`), plus the full
 * address and the event type in words. Values are trimmed and otherwise kept as the host wrote
 * them (a host title is used verbatim, `docs/model-contracts.md §5.4`); blank fields are absent.
 *
 * The event type is the host's own words when the prompt states one (`statedEventType`: the
 * extraction's value, which survived the verbatim check), else the event's type column. The
 * column is the launch default (`baby_shower`), not something the host said, so a host who wrote
 * "60th birthday" is never designed for as a baby shower. It never appears on the card.
 */
export function hostEventFacts(
  event: EventRow,
  statedEventType?: string | null,
): Record<string, string> {
  const content = cardContent({
    title: event.title,
    invitationLine: null,
    babyName: event.baby_name,
    hosts: event.hosts,
    eventDate: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    venueName: event.venue_name,
    address: event.address,
    rsvpDeadline: null,
    timezone: null,
  });
  const facts: Record<string, string> = {};
  const put = (key: string, value: string | null | undefined) => {
    const text = value?.trim() ?? "";
    if (text !== "") facts[key] = text;
  };
  put("eventType", statedEventType?.trim() || event.type.replace(/_/g, " "));
  put("title", content.title);
  put("hosts", content.hosts);
  put("babyName", content.babyName);
  put("date", content.date);
  put("time", content.time);
  put("venue", content.venue);
  put("address", event.address);
  return facts;
}

/**
 * The words the generated card shows right after generation: the design's wording (the host's
 * title already applied), the event's stored facts, and the Creation Mode placeholders for missing
 * ones (`cardContentWithPlaceholders`). The artwork stage judges the ink behind their lines.
 */
export function revealContent(
  event: EventRow,
  wording: { title: string; invitationLine: string },
  now: Date,
): CardContent {
  return cardContentWithPlaceholders({
    wording,
    event: {
      babyName: event.baby_name,
      hosts: event.hosts,
      eventDate: event.event_date,
      startTime: event.start_time,
      endTime: event.end_time,
      venueName: event.venue_name,
      address: event.address,
      rsvpDeadline: event.rsvp_deadline ?? null,
      timezone: event.timezone ?? null,
    },
    now,
  });
}

/** The longest check output a failure record keeps per image. */
const FAILURE_DETAIL_MAX = 200;

/**
 * Inspection reasons: their detail is the inspector's description of text it saw in the image,
 * which can echo the art brief (model free text from the identity) — so only the reason is kept.
 */
const INSPECTION_REASONS: ReadonlySet<string> = new Set(["text", "logo", "mockup", "person"]);

/**
 * What a failed generation records beside its code (`generations.telemetry.failure`, spec.md
 * §9.5): the stage, and for the artwork each image's validation reasons, with the checks' own
 * code-made output where it is not the inspector's description (moderation categories, sizes),
 * bounded. Never prompt text, model wording, names or places. Server-only (`spec.md §32 #42`).
 */
export function failureTelemetry(error: unknown, code: string): Json {
  const failure: Record<string, Json> = { code };
  if (error instanceof GenerationStageError) {
    failure.stage = error.stage;
    if (error instanceof ArtworkProviderRefusalError) {
      failure.imagesRequested = error.imagesRequested;
    }
  } else if (error instanceof ModelCallRefusedError) {
    failure.refusal = error.reason;
  } else if (error instanceof Error) {
    failure.error = error.name;
  }
  // Details a stage recorded: its own, or attached to a refusal it passed through.
  const details = failureDetailsOf(error) as
    | {
        imagesRequested?: number;
        validationFailures?: ArtworkValidationFailure[];
        suggestedRendering?: unknown;
        rendering?: unknown;
        followedSuggestion?: unknown;
        themeSeed?: unknown;
      }
    | undefined;
  if (typeof details?.imagesRequested === "number") {
    failure.imagesRequested = details.imagesRequested;
  }
  if (typeof details?.suggestedRendering === "string") {
    failure.suggestedRendering = details.suggestedRendering;
  }
  if (typeof details?.rendering === "string") failure.rendering = details.rendering;
  if (typeof details?.themeSeed === "string") failure.themeSeed = details.themeSeed;
  if (typeof details?.followedSuggestion === "boolean") {
    failure.followedSuggestion = details.followedSuggestion;
  }
  if (Array.isArray(details?.validationFailures) && details.validationFailures.length > 0) {
    failure.validationFailures = details.validationFailures.map((f) => ({
      image: f.image,
      reasons: [...f.reasons],
      ...(f.detail && !f.reasons.some((r) => INSPECTION_REASONS.has(r))
        ? { detail: boundedText(f.detail, FAILURE_DETAIL_MAX) }
        : {}),
    }));
  }
  return { failure };
}

/** At most `max` characters, cut between code points so no surrogate pair is split. */
function boundedText(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join("");
}

function failureCode(error: unknown): string {
  if (error instanceof GenerationStageError) return error.code;
  if (error instanceof ModelCallRefusedError) return error.reason;
  return "internal";
}

/**
 * Name, code and message only — never the cause chain, a database error's details, model output
 * or host content. Supabase's errors may arrive as plain objects with the same fields.
 */
function errorSummary(error: unknown): { name: string; code?: string; message?: string } {
  if (error && typeof error === "object") {
    const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
    return {
      name: typeof name === "string" ? name : error instanceof Error ? "Error" : "object",
      ...(typeof code === "string" ? { code } : {}),
      ...(typeof message === "string" ? { message } : {}),
    };
  }
  return { name: typeof error };
}

export async function runGeneration(
  input: RunGenerationInput,
  deps: RunGenerationDeps = {},
): Promise<RunGenerationOutcome> {
  const admin = deps.admin ?? createAdminClient();
  const now = deps.now ?? Date.now;
  const { generationId, eventId, userId } = input;
  const ids = { generationId, eventId };

  async function fail(code: string, telemetry?: Json): Promise<void> {
    const { error } = await admin.rpc("fail_generation", {
      p_generation_id: generationId,
      p_event_id: eventId,
      p_error_code: code,
      ...(telemetry ? { p_telemetry: telemetry } : {}),
    });
    if (error) {
      // The generation then reads as failed once it is stale (`getGenerationView`).
      console.error("[generation] could not mark the generation failed", {
        ...ids,
        code,
        error: errorSummary(error),
      });
    }
  }

  const { data: generation, error: readError } = await admin
    .from("generations")
    .select("id, kind, status, requested_by")
    .eq("id", generationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (readError) {
    console.error("[generation] could not read the generation", {
      ...ids,
      error: errorSummary(readError),
    });
    await fail("internal");
    return { status: "failed", code: "internal" };
  }
  if (!generation || generation.status !== "running") return { status: "stopped" };
  if (generation.kind !== "initial") {
    await fail("unsupported_kind");
    throw new GenerationKindNotSupportedError(generation.kind);
  }

  try {
    if (generation.requested_by !== userId) {
      throw new Error("The generation was started by another member.");
    }
    return await pipeline({
      ...input,
      admin,
      provider: deps.provider ?? getAiProvider(),
      now,
      random: deps.random ?? Math.random,
      startedAt: input.startedAt ?? now(),
    });
  } catch (error) {
    if (error instanceof GenerationStoppedError) {
      // Not running any more, or its event was published under it. fail_generation touches only
      // a running generation: here, one whose event was published.
      await fail("published");
      return { status: "stopped" };
    }
    const code = failureCode(error);
    console.error("[generation] failed", { ...ids, code, error: errorSummary(error) });
    await fail(code, failureTelemetry(error, code));
    return { status: "failed", code };
  }
}

interface PipelineInput extends RunGenerationInput {
  admin: AdminClient;
  provider: AiProvider;
  now: () => number;
  random: () => number;
  startedAt: number;
}

async function pipeline(input: PipelineInput): Promise<RunGenerationOutcome> {
  const { admin, provider, now, random, generationId, eventId, userId, startedAt } = input;
  const ctx: StageContext = {
    provider,
    meter: {
      eventId,
      userId,
      generationId,
      round: null,
      deadline: startedAt + GENERATION_DEADLINE_MS,
    },
  };

  async function recordStage(stage: string, artifacts: Record<string, unknown>): Promise<void> {
    const { data, error } = await admin.rpc("record_generation_stage", {
      p_generation_id: generationId,
      p_event_id: eventId,
      p_stage: stage,
      p_artifacts: artifacts as Json,
    });
    if (error) throw error;
    if (data !== true) throw new GenerationStoppedError(`recording the ${stage} stage`);
  }

  // ------------------------------------------------------------------ 1. load
  const { data: event, error: eventError } = await admin
    .from("events")
    .select(
      "id, prompt, type, title, hosts, baby_name, venue_name, address, event_date, start_time, end_time, rsvp_deadline, timezone",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error("The generation's event was not found.");

  const { data: latest, error: identityError } = await admin
    .from("event_identities")
    .select("revision, identity, generation_id")
    .eq("event_id", eventId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (identityError) throw identityError;

  // ------------------------------------------------------------------ 2. identity
  let identity: EventIdentity;
  let identityRevision: number;
  let identityMs: number | null = null;
  let identityValidFirstCall: boolean | null = null;
  // A starting point for the theme if the host left the look to us (owner decision, 2026-10-05):
  // drawn only for a new identity, which ignores it whenever the host gave a creative cue.
  let themeSeed: string | null = null;
  let extraction: string | null = null;
  let inspirationSkipped = 0;
  let droppedFacts = 0;
  let statedEventType: string | null = null;

  if (!latest) {
    const loaded = await loadInspiration(admin, eventId);
    inspirationSkipped = loaded.skipped;
    themeSeed = drawThemeSeed(random);
    const begun = now();
    const result = await runIdentityStage(ctx, {
      prompt: event.prompt,
      ...(loaded.images.length ? { inspiration: loaded.images } : {}),
      extractFacts: true,
      themeSeed,
    });
    identityMs = now() - begun;
    identity = result.identity;
    identityValidFirstCall = result.identityValidFirstCall;
    extraction = result.extraction;
    droppedFacts = result.droppedFacts.length;

    const { data: revision, error } = await admin.rpc("record_event_identity", {
      p_generation_id: generationId,
      p_event_id: eventId,
      p_identity: result.identity as unknown as Json,
      p_raw: result.identityRaw,
      p_prompt_version: EVENT_IDENTITY_PROMPT_VERSION,
      p_schema_version: EVENT_IDENTITY_SCHEMA_VERSION,
    });
    if (error) throw error;
    if (typeof revision !== "number") throw new GenerationStoppedError("persisting the identity");
    identityRevision = revision;
    statedEventType = result.facts?.eventType ?? null;
    await recordStage("identity", {
      identity: result.artifacts,
      facts: result.facts,
      droppedFacts: result.droppedFacts.map((d) => d.field),
    });
  } else {
    // A retry after a failure: the identity is never interpreted twice (spec.md §7.5).
    const parsed = eventIdentitySchema.safeParse(latest.identity);
    if (!parsed.success) throw new Error("The persisted Event Identity does not validate.");
    identity = parsed.data;
    identityRevision = latest.revision;
    const earlier = await earlierFacts(admin, eventId, latest.generation_id);
    statedEventType = factString(earlier.facts, "eventType");
    await recordStage("identity", {
      identity: identityArtifacts(identity),
      ...earlier,
    });
  }

  // ------------------------------------------------------------------ 3. design
  const eventFacts = hostEventFacts(event, statedEventType);
  const designs: DesignStageResult[] = [];
  // Active variation (owner decision): a rendering drawn at random from those this event's earlier
  // directions have not used — none for an initial generation — that the design follows unless
  // the identity strongly points elsewhere. A provider-refusal re-prompt keeps the same suggestion.
  const suggestedRendering = suggestRendering(random, []);
  let designMs = 0;
  let artMs = 0;
  const design = async (providerRefusal?: { feedback: string }) => {
    const begun = now();
    const result = await runDesignStage(ctx, {
      identity,
      eventFacts,
      suggestedRendering,
      ...(providerRefusal ? { providerRefusal } : {}),
    });
    designMs += now() - begun;
    designs.push(result);
    await recordStage("design", { design: result.artifacts });
    return result;
  };
  const artwork = async (
    chosen: DesignStageResult,
    afterRefusal?: { imagesRequested: number },
  ): Promise<ArtworkStageResult> => {
    const begun = now();
    try {
      return await runArtworkStage(ctx, {
        design: chosen.design,
        shape: chosen.design.shape,
        // The ink is judged behind the words the card shows once it is revealed.
        content: revealContent(event, chosen.design.wording, new Date(now())),
        ...(afterRefusal ? { afterRefusal } : {}),
      });
    } finally {
      artMs += now() - begun;
    }
  };

  // A failure from here on still records the rendering drawn and, once a design exists, the one it
  // chose — so renderings that fail more often never drop out of the measured mix.
  let current: DesignStageResult | null = null;
  const renderingDetails = () => ({
    suggestedRendering,
    ...(themeSeed ? { themeSeed } : {}),
    ...(current
      ? {
          rendering: current.design.artBrief.rendering,
          followedSuggestion: current.design.artBrief.rendering === suggestedRendering,
        }
      : {}),
  });

  let chosen: DesignStageResult;
  let art: ArtworkStageResult;
  let providerRefusal = false;
  try {
    chosen = current = await design();

    // ---------------------------------------------------------------- 4. artwork
    try {
      art = await artwork(chosen);
    } catch (error) {
      // Only a refusal of the artwork's first image earns the re-prompted design (model-contracts
      // §9); a refusal after a failed first image is the second failure, and visible.
      if (!(error instanceof ArtworkProviderRefusalError) || error.imagesRequested !== 1) {
        throw error;
      }
      providerRefusal = true;
      await recordStage("design", { notice: "provider_refusal" });
      chosen = current = await design({ feedback: PROVIDER_REFUSAL_FEEDBACK });
      art = await artwork(chosen, { imagesRequested: error.imagesRequested });
    }
  } catch (error) {
    attachFailureDetails(error, renderingDetails());
    throw error;
  }

  // ------------------------------------------------------------------ 5. persist
  const telemetry: GenerationTelemetry = {
    schemaValidFirstCall: designs[0].telemetry.schemaValidFirstCall,
    reprompts: designs.flatMap((d) => d.telemetry.reprompts.map((r) => r.kind)),
    artRegenerated: art.telemetry.artRegenerated,
    artRepaints: art.telemetry.artRepaints,
    standardWording: [...chosen.telemetry.standardWordingSlots],
    inkPanels: art.telemetry.inkPanels.map((p) => ({ shape: p.shape, zone: p.zone })),
    versions: {
      identityPrompt: EVENT_IDENTITY_PROMPT_VERSION,
      identitySchema: EVENT_IDENTITY_SCHEMA_VERSION,
      designPrompt: CARD_DESIGN_PROMPT_VERSION,
      designSchema: CARD_DESIGN_SCHEMA_VERSION,
      layoutSet: CARD_LAYOUT_SET_VERSION,
      compiler: CARD_COMPILER_VERSION,
      artPrompt: CARD_ART_PROMPT_VERSION,
      imageModel: MODELS.image,
    },
    latency: { identityMs, designMs, artMs, totalMs: now() - startedAt },
    identityValidFirstCall,
    identityReused: latest !== null,
    extraction,
    inspirationSkipped,
    droppedFacts,
    imagesRequested: art.telemetry.imagesRequested,
    repaintsStoppedBy: art.telemetry.repaintsStoppedBy,
    providerRefusal,
    suggestedRendering,
    followedSuggestion: chosen.design.artBrief.rendering === suggestedRendering,
    themeSeed,
  };

  const storageKey = `${eventId}/${generationId}/${randomUUID()}.png`;
  const bucket = admin.storage.from(CARD_ART_BUCKET);
  const { error: uploadError } = await bucket.upload(storageKey, art.bytes, {
    contentType: art.mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const d = chosen.design;
  const persisted = await admin.rpc("persist_generated_card", {
    p_generation_id: generationId,
    p_event_id: eventId,
    p_identity_revision: identityRevision,
    p_name: d.presentation.name,
    p_description: d.presentation.description,
    p_shape: d.shape,
    p_layout: d.layout,
    p_art_mode: d.artMode,
    p_typography: d.typography as unknown as Json,
    p_wording: d.wording as unknown as Json,
    p_art_brief: d.artBrief as unknown as Json,
    p_raw: JSON.parse(chosen.raw) as Json,
    p_versions: {
      designPrompt: CARD_DESIGN_PROMPT_VERSION,
      designSchema: CARD_DESIGN_SCHEMA_VERSION,
      layoutSet: CARD_LAYOUT_SET_VERSION,
      compiler: CARD_COMPILER_VERSION,
      artPrompt: CARD_ART_PROMPT_VERSION,
      imageModel: MODELS.image,
    },
    p_standard_wording_slots: [...chosen.telemetry.standardWordingSlots],
    p_storage_key: storageKey,
    p_mime_type: art.mimeType,
    p_size_bytes: art.bytes.byteLength,
    p_width: art.width,
    p_height: art.height,
    p_proportion: art.proportion === "5:7" ? "portrait_5_7" : "square_1_1",
    p_fits_shapes: [...art.fitsShapes],
    p_ink: art.ink as unknown as Json,
    p_image_model: MODELS.image,
    p_art_prompt_version: CARD_ART_PROMPT_VERSION,
    p_telemetry: telemetry as unknown as Json,
  });
  const row = persisted.error ? undefined : persisted.data?.[0];
  if (!row) {
    await removeUpload(admin, storageKey, databaseAnswered(persisted.error), {
      generationId,
      eventId,
    });
    if (persisted.error) throw persisted.error;
    throw new GenerationStoppedError("persisting the card");
  }
  return { status: "succeeded", cardDesignId: row.card_design_id, round: row.round };
}

/**
 * Whether the database itself answered the persist, so its transaction is known to have ended
 * without committing: no error (it wrote nothing because the generation stopped running), or an
 * error carrying a Postgres SQLSTATE or a PostgREST code (the statement failed and rolled back).
 * A transport error — a reset socket, an aborted fetch — carries neither: the transaction may still
 * be running, waiting on a lock, and commit after this worker has given up on it.
 */
function databaseAnswered(error: { code?: unknown } | null): boolean {
  if (!error) return true;
  const code = typeof error.code === "string" ? error.code : "";
  return /^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST");
}

/**
 * Takes the uploaded artwork back out when no card can name it. Only when the database answered
 * (`databaseAnswered`): otherwise the persist may still commit, and a missing object under an
 * immutable, persisted card would break it for good, while a leftover object harms nothing. The
 * kept key is logged. Best effort: a failed removal is logged with the key too.
 */
async function removeUpload(
  admin: AdminClient,
  storageKey: string,
  answered: boolean,
  ids: { generationId: string; eventId: string },
): Promise<void> {
  if (!answered) {
    console.error("[generation] kept the uploaded artwork: the persist may still commit", {
      ...ids,
      storageKey,
    });
    return;
  }
  const { error } = await admin.storage.from(CARD_ART_BUCKET).remove([storageKey]);
  if (error) {
    console.error("[generation] left an orphaned artwork object", {
      ...ids,
      storageKey,
      error: errorSummary(error),
    });
  }
}

/**
 * The event's inspiration images for the identity call, oldest first. Only the types the provider
 * accepts are sent; the rest (HEIC, HEIF, or bytes that are not what the row says) are skipped and
 * counted. A download failure fails the generation rather than designing without what the host
 * gave.
 */
async function loadInspiration(
  admin: AdminClient,
  eventId: string,
): Promise<{ images: NonNullable<GenerateEventIdentityInput["inspiration"]>; skipped: number }> {
  const { data, error } = await admin
    .from("inspiration_assets")
    .select("id, storage_key, mime_type, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const images: NonNullable<GenerateEventIdentityInput["inspiration"]> = [];
  let skipped = 0;
  for (const asset of data ?? []) {
    if (!MODEL_INSPIRATION_TYPES.includes(asset.mime_type)) {
      skipped += 1;
      continue;
    }
    const { data: blob, error: downloadError } = await admin.storage
      .from(INSPIRATION_BUCKET)
      .download(asset.storage_key);
    if (downloadError) throw downloadError;
    if (!blob) throw new Error("An inspiration image could not be read.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sniffImageType(bytes) !== asset.mime_type) {
      skipped += 1;
      continue;
    }
    images.push({ mimeType: asset.mime_type, bytes });
  }
  return { images, skipped };
}

/** A string field of stored extracted facts (`artifacts.facts`), else null. */
function factString(facts: Json, field: string): string | null {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const value = facts[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * On a retry that reuses the identity, the facts extracted by the generation that interpreted it
 * are carried to this one, so the host's prefill (`artifacts.facts`) survives the retry.
 */
async function earlierFacts(
  admin: AdminClient,
  eventId: string,
  generationId: string | null,
): Promise<{ facts: Json; droppedFacts: Json }> {
  const none = { facts: null, droppedFacts: [] };
  if (!generationId) return none;
  const { data, error } = await admin
    .from("generations")
    .select("artifacts")
    .eq("id", generationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  const artifacts = data?.artifacts;
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) return none;
  return {
    facts: artifacts.facts ?? null,
    droppedFacts: artifacts.droppedFacts ?? [],
  };
}
