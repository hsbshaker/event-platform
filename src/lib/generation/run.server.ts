import "server-only";

import { randomUUID } from "node:crypto";

import { ModelCallRefusedError } from "@/lib/ai/errors";
import { eventIdentitySchema } from "@/lib/ai/event-identity";
import type { EventIdentity } from "@/lib/ai/event-identity";
import { MODELS } from "@/lib/ai/models";
import { getAiProvider } from "@/lib/ai/provider";
import type {
  AiProvider,
  CardArt,
  ChangingCard,
  GenerateEventIdentityInput,
  PreviousDirection,
} from "@/lib/ai/provider";
import {
  CARD_ART_PROMPT_VERSION,
  CARD_COMPILER_VERSION,
  CARD_DESIGN_PROMPT_VERSION,
  CARD_DESIGN_SCHEMA_VERSION,
  CARD_LAYOUT_SET_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import type { ArtMode } from "@/lib/card/art-modes";
import { ART_MODES } from "@/lib/card/art-modes";
import type { CardDesign, Refinement } from "@/lib/card/design";
import { cardContent, effectiveCardTitle, parsePromptFacts } from "@/lib/card/facts";
import { CARD_LAYOUT_IDS, layoutSupportsShape } from "@/lib/card/layouts";
import type { CardLayoutId } from "@/lib/card/layouts";
import { revealContentFor } from "@/lib/card/reveal-content.server";
import { RENDERINGS, suggestRendering } from "@/lib/card/renderings";
import type { Rendering } from "@/lib/card/renderings";
import { CARD_SHAPES } from "@/lib/card/shapes";
import type { CardShape } from "@/lib/card/shapes";
import { TYPOGRAPHY_KEYS } from "@/lib/card/typography";
import type { TypographyPairingId } from "@/lib/card/typography";
import type { CardContent } from "@/lib/card/text-box";
import { INSPIRATION_BUCKET, sniffImageType } from "@/lib/drafts/inspiration";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationKind, Json } from "@/lib/supabase/database.types";

import { runArtworkStage } from "./artwork.server";
import type { ArtworkStageResult, ArtworkValidationFailure } from "./artwork.server";
import { runDesignStage } from "./design.server";
import type { DesignStageResult } from "./design.server";
import { PROVIDER_REFUSAL_NOTICE } from "./failure-copy";
import { identityArtifacts, runIdentityStage } from "./identity.server";
import { drawThemeSeed } from "./theme-seeds";
import { readSwitchingDesign, type SwitchingDesign } from "./switching-design";
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
 * Kinds `initial` (the first card), `another_direction` (`spec.md §7.7`, §7.15: the change the
 * host asks for, or a new idea; see "Another direction" below) and `shape_switch` (`spec.md §7.14`:
 * new artwork for a shape no existing artwork fits; see "Shape switch" below).
 *
 * 1. **Load** the event and, when the event has no identity yet, its inspiration (PNG, JPEG and
 *    WEBP only: the provider takes no HEIC/HEIF, so those are skipped and counted).
 * 2. **Identity** (`runIdentityStage`, with fact extraction), persisted as the next revision
 *    (`record_event_identity`). Interpretation happens once: a retry after a failure reuses the
 *    latest revision and makes neither call. Extracted facts are prefill for the host to confirm:
 *    shown to the wait surface (`generations.artifacts.facts`) and kept on the event, with the
 *    identity, as `events.prompt_facts` — unconfirmed, never an event detail, never given to the
 *    design (`spec.md §7.3`).
 * 3. **Design** (`runDesignStage`) from the identity and the event's own fields — host-entered or
 *    host-confirmed values, never the unconfirmed extraction (`spec.md §32 #15`).
 * 4. **Artwork** (`runArtworkStage`) for the design's shape. A provider refusal of the first image
 *    re-prompts the design (`provider-refusal`) and paints its artwork as that refusal's
 *    regeneration, with a notice for the host (`spec.md §7.6`); any other refusal, or a second
 *    one, is a visible failure. Its ink is judged behind the words the revealed card shows
 *    (`revealContent`), read from the event just before the stage.
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
 * **Another direction** (`spec.md §7.7`, §7.15; `docs/model-contracts.md §5.1`, §7.2): the
 * generation names the design the host was looking at (`from_design_id`) and, when they typed
 * one, their feedback — host content, read here and sent only to the identity revision and the
 * design call as data, never to the image model (`spec.md §32 #17`).
 * - Identity: with feedback, a new revision of the identity the changed card was made from
 *   (`redesignFeedback`, `previousIdentity`; no fact extraction, no inspiration, and no theme seed:
 *   a revision is steered by the host's words, so it never draws one); without, the latest
 *   identity, reused.
 * - Design: with the feedback, every earlier design as `previousDirections`, a rendering drawn from
 *   those the event has not used, and — with feedback — `changing`, the card being changed in the
 *   shape the host saw it (the active design in its active shape, any other in its own). The design
 *   reports `refinement`; distinctness applies to a new idea only.
 * - Artwork: a change to part of the card (`part`) is an edit of the artwork the host saw (the
 *   newest of the changed design's artworks that fits that shape), with `revision`, and its repaints
 *   stay edits — but only when the new design kept that card's shape, layout and art mode, and was
 *   not re-prompted after a provider refusal; otherwise it is painted fresh and the downgrade is
 *   recorded (`refinementDowngraded`). `whole` and `none` are painted fresh.
 * - Persist: with `refinement` and `changed_from`; the new design is not made active (the current
 *   card stays active until the host chooses, `chooseDesign`).
 * Ink, repaints, validation and the provider-refusal step-back are the first card's.
 *
 * **Shape switch** (`spec.md §7.14`, §10; `docs/card-system.md §2.1`, §2.4, §7;
 * `docs/model-contracts.md §7.2`): the generation names the design (`from_design_id`, the event's
 * active design when it started) and the shape asked for (`shape`). No identity and no design call:
 * the design is immutable and keeps its brief. One artwork (`runArtworkStage`) from the same art
 * brief, art mode, layout and pairing, for the new shape, with the design's own artwork as
 * `reference` — the newest of its artworks that fits the shape the host sees it in (the active
 * shape while the design is active, else its own), as `loadRevealedCard` draws it — and no
 * `revision`, so the art prompt is the shape switch's (`assembleShapeSwitchPrompt`). Validation,
 * ink for every shape the new artwork fits, and repaints that keep the reference are the first
 * card's. A provider refusal has no design to step back to: it is a visible failure
 * (`shape_refusal`). `persist_shape_switch_artwork` adds the artwork to the same design (never a
 * new design, never a change to an earlier artwork) and shows the design in the new shape if it is
 * still the active one.
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

/** The generation kinds this orchestration runs. */
export const SUPPORTED_GENERATION_KINDS: readonly GenerationKind[] = [
  "initial",
  "another_direction",
  "shape_switch",
];

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
  /** Fitted shapes whose ink was judged on the whole zone alone (`card_compiler_v4` fallback). */
  lineAreasFallback: string[];
  providerRefusal: boolean;
  /** The rendering drawn for this generation's design (`suggestRendering`). */
  suggestedRendering: string;
  /** The accepted design's rendering is the suggested one. */
  /** Whether a new idea followed the suggested rendering; null for a requested change, which keeps the card's own. */
  followedSuggestion: boolean | null;
  /**
   * The theme seed given to a new identity (`drawThemeSeed`); null when the identity was reused or
   * revised (another direction never draws one).
   */
  themeSeed: string | null;
  /** The generation's kind. */
  kind: GenerationKind;
  /** What the accepted design made (`card_design_schema_v3`); `none` for every first card. */
  refinement: Refinement;
  /**
   * A change to part of a card was painted fresh instead of as an edit: the design changed the
   * card's shape, layout or art mode, or it was re-prompted after a provider refusal.
   */
  refinementDowngraded: boolean;
  /** The kept artwork is an edit of the changed card's artwork (`card_art_v5` revision). */
  artworkEdit: boolean;
}

/**
 * The §9.5 record of a shape switch (`generations.telemetry`) when it succeeds: the artwork's
 * measures only — a shape switch makes no identity or design call. Never shown to the host.
 */
export interface ShapeSwitchTelemetry {
  kind: "shape_switch";
  /** The shape painted for. */
  shape: CardShape;
  /** The shape whose artwork was sent as the reference. */
  referenceShape: CardShape;
  artRegenerated: string | null;
  artRepaints: number;
  inkPanels: { shape: string; zone: string }[];
  imagesRequested: number;
  repaintsStoppedBy: string | null;
  lineAreasFallback: string[];
  /** The shapes the new artwork fits. */
  fitsShapes: CardShape[];
  versions: { layoutSet: string; compiler: string; artPrompt: string; imageModel: string };
  latency: { artMs: number; totalMs: number };
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

/** The event's fields the revealed card's words come from (`revealContent`). */
export interface RevealEventRow {
  title: string | null;
  hosts: string | null;
  baby_name: string | null;
  venue_name: string | null;
  address: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  rsvp_deadline: string | null;
  timezone: string | null;
  /** `events.prompt_facts`: the facts the prompt states, unconfirmed. */
  prompt_facts: Json | null;
}

/** The columns of `RevealEventRow`. */
export const REVEAL_EVENT_COLUMNS =
  "title, hosts, baby_name, venue_name, address, event_date, start_time, end_time, rsvp_deadline, timezone, prompt_facts";

/**
 * The words the generated card shows right after generation (`revealContentFor`, the one producer
 * `cardContentWithPlaceholders` shares): the design's wording with the effective title, the event's
 * stored facts, the facts the prompt states where the host has not entered them (as written, when
 * the card's checks accept them), and the Creation Mode placeholders for the rest. The artwork stage
 * judges the ink behind their lines.
 */
export async function revealContent(
  event: RevealEventRow,
  wording: { title: string; invitationLine: string },
  now: Date,
): Promise<CardContent> {
  const { content } = await revealContentFor({
    wording: {
      title: effectiveCardTitle(event.title, wording.title),
      invitationLine: wording.invitationLine,
    },
    event: {
      babyName: event.baby_name,
      hosts: event.hosts,
      eventDate: event.event_date,
      startTime: event.start_time,
      endTime: event.end_time,
      venueName: event.venue_name,
      address: event.address,
      rsvpDeadline: event.rsvp_deadline,
      timezone: event.timezone,
    },
    promptFacts: parsePromptFacts(event.prompt_facts),
    now,
  });
  return content;
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
        refinement?: unknown;
        refinementDowngraded?: unknown;
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
  // What the design made (another direction), and whether its edit was painted fresh instead.
  if (typeof details?.refinement === "string") failure.refinement = details.refinement;
  if (typeof details?.refinementDowngraded === "boolean") {
    failure.refinementDowngraded = details.refinementDowngraded;
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
    .select("id, kind, status, requested_by, feedback, from_design_id, shape")
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
  if (!SUPPORTED_GENERATION_KINDS.includes(generation.kind)) {
    await fail("unsupported_kind");
    throw new GenerationKindNotSupportedError(generation.kind);
  }

  try {
    if (generation.requested_by !== userId) {
      throw new Error("The generation was started by another member.");
    }
    const common = {
      ...input,
      admin,
      provider: deps.provider ?? getAiProvider(),
      now,
      startedAt: input.startedAt ?? now(),
    };
    if (generation.kind === "shape_switch") {
      // start_generation requires both; a row without them is not a request this can serve.
      if (!generation.from_design_id) throw new Error("The shape switch names no design.");
      if (!generation.shape || !CARD_SHAPES.includes(generation.shape)) {
        throw new Error("The shape switch names no shape.");
      }
      return await shapeSwitchPipeline({
        ...common,
        designId: generation.from_design_id,
        shape: generation.shape,
      });
    }
    let direction: Direction | null = null;
    if (generation.kind === "another_direction") {
      // start_generation requires the design; a row without one is not a request this can serve.
      if (!generation.from_design_id) throw new Error("Another direction names no design.");
      direction = {
        fromDesignId: generation.from_design_id,
        feedback: generation.feedback?.trim() ? generation.feedback.trim() : null,
      };
    }
    return await pipeline({
      ...common,
      kind: generation.kind,
      direction,
      random: deps.random ?? Math.random,
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

/** What an `another_direction` generation was asked (`generations.from_design_id`, `feedback`). */
interface Direction {
  fromDesignId: string;
  /** The host's words, or null for an empty box. Host content: never sent to the image model. */
  feedback: string | null;
}

interface PipelineInput extends RunGenerationInput {
  kind: GenerationKind;
  /** Another direction's request; null for the first card. */
  direction: Direction | null;
  admin: AdminClient;
  provider: AiProvider;
  now: () => number;
  random: () => number;
  startedAt: number;
}

async function pipeline(input: PipelineInput): Promise<RunGenerationOutcome> {
  const { admin, provider, now, random, generationId, eventId, userId, startedAt, direction } =
    input;
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

  const recordStage = (stage: string, artifacts: Record<string, unknown>) =>
    recordGenerationStage(admin, { generationId, eventId }, stage, artifacts);

  // ------------------------------------------------------------------ 1. load
  const { data: event, error: eventError } = await admin
    .from("events")
    .select(
      "id, prompt, type, title, hosts, baby_name, venue_name, address, event_date, start_time, end_time, prompt_facts, active_card_design_id, active_card_shape",
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

  // Another direction: every earlier design, and the one the host was looking at.
  const earlier = direction ? await earlierDesigns(admin, eventId) : [];
  const from = direction ? earlier.find((d) => d.id === direction.fromDesignId) : undefined;
  if (direction && !from) throw new Error("The design to change was not found.");
  // The shape the host saw the card in: the active design in its active shape, any other in its
  // own (the rule `loadRevealedCard` draws by).
  const seenShape: CardShape | null = from
    ? from.id === event.active_card_design_id
      ? ((event.active_card_shape as CardShape | null) ?? from.design.shape)
      : from.design.shape
    : null;

  // ------------------------------------------------------------------ 2. identity
  let identity: EventIdentity;
  let identityRevision: number;
  let identityMs: number | null = null;
  let identityValidFirstCall: boolean | null = null;
  let identityReused = latest !== null;
  // A starting point for the theme if the host left the look to us (owner decision, 2026-10-05):
  // drawn only for a new identity, which ignores it whenever the host gave a creative cue. Never
  // for another direction: its revision is steered by the host's words (Phase 5d decision).
  let themeSeed: string | null = null;
  let extraction: string | null = null;
  let inspirationSkipped = 0;
  let droppedFacts = 0;
  let statedEventType: string | null = null;
  // Try again after the image provider refused the homage takes the same step back (spec.md §7.6).
  let stepBack = false;

  if (direction && from) {
    if (!latest) throw new Error("Another direction needs the event's identity.");
    // The event type in the host's own words, kept on the event with the first identity.
    statedEventType = factString(event.prompt_facts, "eventType");
    // A Try again of the same request (same card, same words) after a failure: it takes the same
    // step back after a provider refusal (spec.md §7.6) and reuses the identity that request
    // already revised, rather than interpreting the words a second time. Any other request is new.
    const retryOf = await sameRequestFailedBefore(admin, eventId, generationId, direction);
    stepBack = retryOf?.error_code === "provider_refusal";
    const facts = event.prompt_facts ?? null;
    if (direction.feedback && retryOf && latest.generation_id === retryOf.id) {
      identity = parseIdentity(latest.identity);
      identityRevision = latest.revision;
      await recordStage("identity", { identity: identityArtifacts(identity), facts });
    } else if (direction.feedback) {
      // The feedback revises the identity the changed card was made from (spec.md §7.15 step 4).
      const previous = await identityAt(admin, eventId, from.identityRevision);
      const begun = now();
      const result = await runIdentityStage(ctx, {
        prompt: event.prompt,
        redesignFeedback: direction.feedback,
        previousIdentity: previous,
        extractFacts: false,
      });
      identityMs = now() - begun;
      identity = result.identity;
      identityValidFirstCall = result.identityValidFirstCall;
      identityReused = false;
      extraction = result.extraction;
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
      await recordStage("identity", { identity: result.artifacts, facts });
    } else {
      identity = parseIdentity(latest.identity);
      identityRevision = latest.revision;
      await recordStage("identity", { identity: identityArtifacts(identity), facts });
    }
  } else if (!latest) {
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
      // The facts the prompt states, kept on the event with the identity that read them
      // (`events.prompt_facts`, written once): unconfirmed, never given to the design.
      p_prompt_facts: result.facts as unknown as Json,
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
    identity = parseIdentity(latest.identity);
    identityRevision = latest.revision;
    const earlierFactsOf = await earlierFacts(admin, eventId, latest.generation_id);
    statedEventType = factString(earlierFactsOf.facts, "eventType");
    stepBack = await refusedBefore(admin, eventId, generationId, "initial");
    await recordStage("identity", {
      identity: identityArtifacts(identity),
      ...earlierFactsOf,
    });
  }

  // ------------------------------------------------------------------ 3. design
  const eventFacts = hostEventFacts(event, statedEventType);
  const designs: DesignStageResult[] = [];
  // Active variation (owner decision): a rendering drawn at random from those this event's earlier
  // directions have not used — none for an initial generation — that the design follows unless
  // the identity strongly points elsewhere. A provider-refusal re-prompt keeps the same suggestion.
  const previousDirections = earlier.flatMap((d) => (d.direction ? [d.direction] : []));
  const suggestedRendering = suggestRendering(
    random,
    previousDirections.map((d) => d.rendering),
  );
  // With feedback, the card the host is changing, as they saw it (model-contracts §5.2).
  const changing: ChangingCard | undefined =
    from && seenShape && direction?.feedback
      ? {
          name: from.name,
          shape: seenShape,
          layout: from.design.layout,
          artMode: from.design.artMode,
          primary: from.design.primary,
          wording: from.design.wording,
          artBrief: from.design.artBrief,
        }
      : undefined;
  let designMs = 0;
  let artMs = 0;
  const design = async (providerRefusal?: { feedback: string }) => {
    const begun = now();
    const result = await runDesignStage(ctx, {
      identity,
      eventFacts,
      suggestedRendering,
      ...(previousDirections.length ? { previousDirections } : {}),
      ...(direction?.feedback ? { feedback: direction.feedback } : {}),
      ...(changing ? { changing } : {}),
      ...(providerRefusal ? { providerRefusal } : {}),
    });
    designMs += now() - begun;
    designs.push(result);
    await recordStage("design", { design: result.artifacts });
    return result;
  };

  // A change to part of the card edits the artwork the host saw, if the design kept that card's
  // shape, layout and art mode (the edit is of that picture) and was not re-prompted after a
  // provider refusal (the edit would keep what the provider refused). Otherwise it is painted fresh.
  let refinementDowngraded = false;
  let artworkEdit = false;
  let seenArtwork: CardArt | null = null;
  const editReference = async (
    chosen: DesignStageResult,
    afterProviderRefusal: boolean,
  ): Promise<CardArt | null> => {
    artworkEdit = false;
    refinementDowngraded = false;
    if (chosen.design.refinement !== "part" || !changing || !from) return null;
    const d = chosen.design;
    if (
      afterProviderRefusal ||
      d.shape !== changing.shape ||
      d.layout !== changing.layout ||
      d.artMode !== changing.artMode
    ) {
      refinementDowngraded = true;
      return null;
    }
    seenArtwork ??= await loadArtwork(admin, eventId, from.id, changing.shape);
    artworkEdit = true;
    return seenArtwork;
  };

  const artwork = async (
    chosen: DesignStageResult,
    afterProviderRefusal: boolean,
    afterRefusal?: { imagesRequested: number },
  ): Promise<ArtworkStageResult> => {
    const reference = await editReference(chosen, afterProviderRefusal);
    // The ink is judged behind the words the card shows once it is revealed, from the event as it
    // is now: the host may have confirmed details during the wait.
    const content = await revealContent(
      await revealEvent(admin, eventId),
      chosen.design.wording,
      new Date(now()),
    );
    const begun = now();
    try {
      return await runArtworkStage(ctx, {
        design: chosen.design,
        shape: chosen.design.shape,
        content,
        ...(reference ? { reference, revision: true } : {}),
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
          followedSuggestion:
            current.design.refinement === "none"
              ? current.design.artBrief.rendering === suggestedRendering
              : null,
          ...(direction ? { refinement: current.design.refinement, refinementDowngraded } : {}),
        }
      : {}),
  });

  let chosen: DesignStageResult;
  let art: ArtworkStageResult;
  let providerRefusal = false;
  try {
    if (stepBack) {
      // The last try ended on the image provider's refusal: this one starts from the step-back,
      // with the copyright note, and a refusal of it is again a visible failure. (Recording the
      // note clears any design shown, so the wait never shows a design that is not being painted.)
      providerRefusal = true;
      await recordStage("design", { notice: PROVIDER_REFUSAL_NOTICE, design: null });
      chosen = current = await design({ feedback: PROVIDER_REFUSAL_FEEDBACK });
      art = await artwork(chosen, true);
    } else {
      chosen = current = await design();

      // -------------------------------------------------------------- 4. artwork
      try {
        art = await artwork(chosen, false);
      } catch (error) {
        // Only a refusal of the artwork's first image earns the re-prompted design (model-contracts
        // §9); a refusal after a failed first image is the second failure, and visible.
        if (!(error instanceof ArtworkProviderRefusalError) || error.imagesRequested !== 1) {
          throw error;
        }
        providerRefusal = true;
        await recordStage("design", { notice: PROVIDER_REFUSAL_NOTICE, design: null });
        chosen = current = await design({ feedback: PROVIDER_REFUSAL_FEEDBACK });
        art = await artwork(chosen, true, { imagesRequested: error.imagesRequested });
      }
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
    identityReused,
    extraction,
    inspirationSkipped,
    droppedFacts,
    imagesRequested: art.telemetry.imagesRequested,
    repaintsStoppedBy: art.telemetry.repaintsStoppedBy,
    lineAreasFallback: art.telemetry.lineAreasFallback,
    providerRefusal,
    suggestedRendering,
    followedSuggestion:
      chosen.design.refinement === "none"
        ? chosen.design.artBrief.rendering === suggestedRendering
        : null,
    themeSeed,
    kind: input.kind,
    refinement: chosen.design.refinement,
    refinementDowngraded,
    artworkEdit,
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
    p_refinement: d.refinement,
    ...(direction ? { p_changed_from: direction.fromDesignId } : {}),
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
 * Records a stage result the wait surface may show (`record_generation_stage`), which also bumps
 * the heartbeat. Throws `GenerationStoppedError` when the generation is no longer running.
 */
async function recordGenerationStage(
  admin: AdminClient,
  ids: { generationId: string; eventId: string },
  stage: string,
  artifacts: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await admin.rpc("record_generation_stage", {
    p_generation_id: ids.generationId,
    p_event_id: ids.eventId,
    p_stage: stage,
    p_artifacts: artifacts as Json,
  });
  if (error) throw error;
  if (data !== true) throw new GenerationStoppedError(`recording the ${stage} stage`);
}

interface ShapeSwitchInput extends RunGenerationInput {
  admin: AdminClient;
  provider: AiProvider;
  now: () => number;
  startedAt: number;
  /** The design the artwork is for (`generations.from_design_id`). */
  designId: string;
  /** The shape asked for (`generations.shape`). */
  shape: CardShape;
}

/**
 * A shape switch's one artwork (see "Shape switch" in the header): the design read back, the
 * reference loaded, the artwork painted for the new shape with its ink for every shape it fits,
 * uploaded, and `persist_shape_switch_artwork` adding it to the same design.
 */
async function shapeSwitchPipeline(input: ShapeSwitchInput): Promise<RunGenerationOutcome> {
  const { admin, provider, now, generationId, eventId, userId, startedAt, designId, shape } = input;
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

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, active_card_design_id, active_card_shape")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error("The generation's event was not found.");
  const design = await switchingDesign(admin, eventId, designId);
  // The server action refuses a shape the layout does not support; this refuses it again before
  // any image is requested (the art prompt's assembly would too).
  if (!layoutSupportsShape(design.layout, shape)) {
    throw new Error(`The design's layout does not support the ${shape} card.`);
  }
  // The shape the host sees the design in: its active shape while it is the active design (the
  // rule `loadRevealedCard` draws by), else its own.
  const referenceShape: CardShape =
    event.active_card_design_id === design.id
      ? ((event.active_card_shape as CardShape | null) ?? design.shape)
      : design.shape;
  const reference = await loadArtwork(admin, eventId, design.id, referenceShape);
  await recordGenerationStage(admin, { generationId, eventId }, "artwork", {});

  // The ink is judged behind the words the card shows, from the event as it is now.
  const content = await revealContent(
    await revealEvent(admin, eventId),
    design.wording,
    new Date(now()),
  );
  const begun = now();
  let art: ArtworkStageResult;
  try {
    art = await runArtworkStage(ctx, {
      design: {
        artBrief: design.artBrief,
        artMode: design.artMode,
        layout: design.layout,
        typography: design.typography,
      },
      shape,
      content,
      reference,
    });
  } catch (error) {
    // The design is immutable: there is no re-prompted design to step back to.
    if (error instanceof ArtworkProviderRefusalError) {
      throw new GenerationStageError(
        "artwork",
        "shape_refusal",
        "The image provider refused the shape switch's artwork.",
        { cause: error, details: failureDetailsOf(error) },
      );
    }
    throw error;
  }
  const artMs = now() - begun;

  const telemetry: ShapeSwitchTelemetry = {
    kind: "shape_switch",
    shape,
    referenceShape,
    artRegenerated: art.telemetry.artRegenerated,
    artRepaints: art.telemetry.artRepaints,
    inkPanels: art.telemetry.inkPanels.map((p) => ({ shape: p.shape, zone: p.zone })),
    imagesRequested: art.telemetry.imagesRequested,
    repaintsStoppedBy: art.telemetry.repaintsStoppedBy,
    lineAreasFallback: art.telemetry.lineAreasFallback,
    fitsShapes: [...art.fitsShapes],
    versions: {
      layoutSet: CARD_LAYOUT_SET_VERSION,
      compiler: CARD_COMPILER_VERSION,
      artPrompt: CARD_ART_PROMPT_VERSION,
      imageModel: MODELS.image,
    },
    latency: { artMs, totalMs: now() - startedAt },
  };

  const storageKey = `${eventId}/${generationId}/${randomUUID()}.png`;
  const { error: uploadError } = await admin.storage
    .from(CARD_ART_BUCKET)
    .upload(storageKey, art.bytes, { contentType: art.mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const persisted = await admin.rpc("persist_shape_switch_artwork", {
    p_generation_id: generationId,
    p_event_id: eventId,
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
    throw new GenerationStoppedError("persisting the artwork");
  }
  return { status: "succeeded", cardDesignId: row.card_design_id, round: row.round };
}

/**
 * The design of a shape switch, from the event's own rows (`readSwitchingDesign`); one that lacks
 * what the art prompt needs is not painted from: the generation fails rather than painting a
 * different card. The shape control never offers such a switch (`shape.server.ts`).
 */
async function switchingDesign(
  admin: AdminClient,
  eventId: string,
  designId: string,
): Promise<SwitchingDesign> {
  const { data: row, error } = await admin
    .from("card_designs")
    .select("id, shape, layout, art_mode, typography, wording, art_brief")
    .eq("id", designId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("The shape switch's design was not found.");
  const design = readSwitchingDesign(row);
  if (!design) throw new Error("The shape switch's design cannot be read for its artwork.");
  return design;
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

/** The event's card fields as they are now (`revealContent`). */
async function revealEvent(admin: AdminClient, eventId: string): Promise<RevealEventRow> {
  const { data, error } = await admin
    .from("events")
    .select(REVEAL_EVENT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The generation's event was not found.");
  return data as RevealEventRow;
}

/** A string field of stored extracted facts (`artifacts.facts`), else null. */
function factString(facts: Json, field: string): string | null {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const value = facts[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * The event's previous generation of the same kind failed because the image provider refused its
 * artwork (`provider_refusal`): the host's Try again then takes the same step back (`spec.md
 * §7.6`, §31). For a first card only a retry reaches this — the refused generation had already
 * recorded the identity. Only one generation runs at a time, so the previous one of the kind is
 * the newest other.
 */
/**
 * The event's previous another-direction generation when it failed and asked the same thing as
 * this one — the same card to change and the same words — else null: this one is the host's Try
 * again of it (§31: "a second refusal is a visible failure whose Try again takes the same step
 * back"). A different card or different words is a new request, never treated as a retry.
 */
async function sameRequestFailedBefore(
  admin: AdminClient,
  eventId: string,
  generationId: string,
  direction: { fromDesignId: string; feedback: string | null | undefined },
): Promise<{ id: string; error_code: string | null } | null> {
  const { data, error } = await admin
    .from("generations")
    .select("id, status, error_code, from_design_id, feedback")
    .eq("event_id", eventId)
    .eq("kind", "another_direction")
    .order("started_at", { ascending: false })
    .limit(2);
  if (error) throw error;
  const previous = (data ?? []).find((row) => row.id !== generationId);
  if (!previous || previous.status !== "failed") return null;
  const sameCard = previous.from_design_id === direction.fromDesignId;
  const sameWords = (previous.feedback?.trim() || null) === (direction.feedback?.trim() || null);
  return sameCard && sameWords ? { id: previous.id, error_code: previous.error_code } : null;
}

async function refusedBefore(
  admin: AdminClient,
  eventId: string,
  generationId: string,
  kind: GenerationKind,
): Promise<boolean> {
  const { data, error } = await admin
    .from("generations")
    .select("id, status, error_code")
    .eq("event_id", eventId)
    .eq("kind", kind)
    .order("started_at", { ascending: false })
    .limit(2);
  if (error) throw error;
  const previous = (data ?? []).find((row) => row.id !== generationId);
  return previous?.status === "failed" && previous.error_code === "provider_refusal";
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

/** The persisted identity, validated; a stored identity that does not validate is a bug. */
function parseIdentity(stored: Json): EventIdentity {
  const parsed = eventIdentitySchema.safeParse(stored);
  if (!parsed.success) throw new Error("The persisted Event Identity does not validate.");
  return parsed.data;
}

/** The identity revision a design was made from (`card_designs.identity_revision`). */
async function identityAt(
  admin: AdminClient,
  eventId: string,
  revision: number,
): Promise<EventIdentity> {
  const { data, error } = await admin
    .from("event_identities")
    .select("revision, identity")
    .eq("event_id", eventId)
    .eq("revision", revision)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The changed design's identity revision was not found.");
  return parseIdentity(data.identity);
}

/** An earlier design of the event, as another direction reads it. */
interface EarlierDesign {
  id: string;
  name: string;
  identityRevision: number;
  /** What `changing` carries (`ChangingCard`), less the shape the host saw it in. */
  design: {
    shape: CardShape;
    layout: CardLayoutId;
    artMode: ArtMode;
    primary: TypographyPairingId;
    wording: { title: string; invitationLine: string };
    artBrief: CardDesign["artBrief"];
  };
  /**
   * The design as `previousDirections` names it (model-contracts §5.2); null for a design from
   * before rendering families (`card_design_schema_v2`), whose brief has no rendering to summarise.
   */
  direction: PreviousDirection | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Every design of the event, oldest round first, read back as the design call needs it. The rows
 * are the server's own validated output. A design from before rendering families stays readable —
 * it can still be the card the host changes — but is left out of the earlier directions, having
 * no rendering to summarise. One this cannot read at all (a catalog id since retired) is left out
 * entirely: the generation then fails if it was the card to change, rather than describing it
 * wrongly.
 */
async function earlierDesigns(admin: AdminClient, eventId: string): Promise<EarlierDesign[]> {
  const { data, error } = await admin
    .from("card_designs")
    .select(
      "id, round, name, shape, layout, art_mode, typography, wording, art_brief, identity_revision",
    )
    .eq("event_id", eventId)
    .order("round", { ascending: true });
  if (error) throw error;
  const readable = (data ?? []).flatMap((row): EarlierDesign[] => {
    const typography = isRecord(row.typography) ? row.typography : {};
    const wording = isRecord(row.wording) ? row.wording : {};
    const brief = isRecord(row.art_brief) ? row.art_brief : {};
    const primary = typography.primary;
    if (
      !CARD_SHAPES.includes(row.shape) ||
      !CARD_LAYOUT_IDS.includes(row.layout) ||
      !ART_MODES.includes(row.art_mode) ||
      typeof primary !== "string" ||
      !(TYPOGRAPHY_KEYS as readonly string[]).includes(primary) ||
      typeof wording.title !== "string" ||
      typeof wording.invitationLine !== "string" ||
      typeof brief.subject !== "string"
    ) {
      return [];
    }
    const artBrief = brief as unknown as CardDesign["artBrief"];
    const summarisable =
      typeof brief.aesthetic === "string" &&
      (RENDERINGS as readonly unknown[]).includes(brief.rendering);
    const design: EarlierDesign = {
      id: row.id,
      name: row.name,
      identityRevision: row.identity_revision,
      design: {
        shape: row.shape,
        layout: row.layout,
        artMode: row.art_mode,
        primary: primary as TypographyPairingId,
        wording: { title: wording.title, invitationLine: wording.invitationLine },
        artBrief,
      },
      direction: summarisable
        ? {
            name: row.name,
            layout: row.layout,
            artMode: row.art_mode,
            primary: primary as TypographyPairingId,
            subject: artBrief.subject,
            rendering: artBrief.rendering as Rendering,
            aesthetic: artBrief.aesthetic,
          }
        : null,
    };
    return [design];
  });
  return readable;
}

/**
 * The artwork the host saw for a design in a shape: the newest of the design's artworks that fits
 * it (the rule beside `card_art_assets`, as `loadRevealedCard` draws it), read from the private
 * bucket. It is the event's own generated artwork — the only image the image model may receive
 * (`spec.md §7.6a` rule 3).
 */
async function loadArtwork(
  admin: AdminClient,
  eventId: string,
  designId: string,
  shape: CardShape,
): Promise<CardArt> {
  const { data, error } = await admin
    .from("card_art_assets")
    .select("storage_key, mime_type, fits_shapes, created_at")
    .eq("card_design_id", designId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const asset = (data ?? []).find((a) => a.fits_shapes.includes(shape));
  if (!asset) throw new Error(`The changed design has no artwork for the ${shape} card.`);
  const { data: blob, error: downloadError } = await admin.storage
    .from(CARD_ART_BUCKET)
    .download(asset.storage_key);
  if (downloadError) throw downloadError;
  if (!blob) throw new Error("The changed card's artwork could not be read.");
  return { mimeType: asset.mime_type, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
