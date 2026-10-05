/**
 * What the wait surface shows, and how it behaves while the card is made (`spec.md §7.10`;
 * `docs/screen-spec.md` `generation`; `docs/design-system.md §4.3`, §12.1–§12.3).
 *
 * Pure and isomorphic: the page reads the latest generation on the server and the client polls the
 * same shape from `GET /api/events/[id]/generation`. Both go through `readWaitGeneration`, which
 * keeps only what the surface may show — the identity's creative signals, the design's name,
 * description and art direction in words, a failure's host copy, the copyright note, and the facts
 * the prompt states for the details form to offer — and nothing else (`spec.md §32 #42`). Anything it cannot read as such is treated as not there rather than
 * shown, so the surface never claims a result the pipeline did not record.
 */

import { parsePromptFacts, type PromptFacts } from "@/lib/card/facts";

import {
  generationFailure,
  generationNotice,
  GENERATION_FAILURE_CODES,
  type GenerationFailure,
  type GenerationFailureCode,
} from "./failure-copy";

export type WaitStatus = "running" | "succeeded" | "failed";

/** The identity's creative signals, in its own words (`identityArtifacts`). */
export interface IdentityShown {
  creativeDirection: string;
  toneKeywords: string[];
  /** Colour names. */
  palette: string[];
  visualMotifs: string[];
}

/** The design's name, description and art direction in words (`DesignArtifacts`). */
export interface DesignShown {
  name: string;
  description: string;
  artDirection: {
    subject: string;
    medium: string;
    mood: string;
    palette: string;
    texture: string;
  };
}

export interface WaitGeneration {
  id: string;
  status: WaitStatus;
  /** The last stage that resolved, or null before the first. */
  stage: string | null;
  identity: IdentityShown | null;
  design: DesignShown | null;
  failure: GenerationFailure | null;
  notice: string | null;
  /** The facts the prompt states, once extracted: the details form offers them to confirm. */
  facts: PromptFacts | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function words(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter((word): word is string => word !== null)
    : [];
}

function readIdentity(value: unknown): IdentityShown | null {
  if (!isObject(value)) return null;
  const creativeDirection = text(value.creativeDirection);
  if (creativeDirection === null) return null;
  return {
    creativeDirection,
    toneKeywords: words(value.toneKeywords),
    palette: words(value.palette),
    visualMotifs: words(value.visualMotifs),
  };
}

function readDesign(value: unknown): DesignShown | null {
  if (!isObject(value) || !isObject(value.artDirection)) return null;
  const name = text(value.name);
  const description = text(value.description);
  const art = value.artDirection;
  const subject = text(art.subject);
  const medium = text(art.medium);
  const mood = text(art.mood);
  const palette = text(art.palette);
  const texture = text(art.texture);
  if (!name || !description || !subject || !medium || !mood || !palette || !texture) return null;
  return { name, description, artDirection: { subject, medium, mood, palette, texture } };
}

function readFailure(value: unknown): GenerationFailure | null {
  if (!isObject(value)) return null;
  const code = value.code;
  if (!(GENERATION_FAILURE_CODES as readonly unknown[]).includes(code)) return null;
  const title = text(value.title);
  const body = text(value.body);
  if (!title || !body || typeof value.retry !== "boolean") return null;
  return { code: code as GenerationFailureCode, title, body, retry: value.retry };
}

/**
 * A generation as the route (or `withHostCopy`) gives it, or null when it is not one. A failed
 * generation always reads with a failure: a body without usable copy reads as the generic one.
 */
export function readWaitGeneration(raw: unknown): WaitGeneration | null {
  if (!isObject(raw)) return null;
  const status = raw.status;
  if (status !== "running" && status !== "succeeded" && status !== "failed") return null;
  if (typeof raw.id !== "string") return null;
  const artifacts = isObject(raw.artifacts) ? raw.artifacts : {};
  return {
    id: raw.id,
    status,
    stage: typeof raw.stage === "string" ? raw.stage : null,
    identity: readIdentity(artifacts.identity),
    design: readDesign(artifacts.design),
    failure: status === "failed" ? (readFailure(raw.failure) ?? generationFailure(null)) : null,
    notice: status === "running" && typeof raw.notice === "string" ? raw.notice : null,
    facts: parsePromptFacts(artifacts.facts),
  };
}

/** The poll route's body as the client reads it; null when it is not that shape. */
export function readGenerationBody(raw: unknown): { generation: WaitGeneration | null } | null {
  if (!isObject(raw) || !("generation" in raw)) return null;
  if (raw.generation === null) return { generation: null };
  const generation = readWaitGeneration(raw.generation);
  return generation ? { generation } : null;
}

/**
 * The server's `GenerationView` with the host-facing copy the route adds (`failure`, `notice`), so
 * the page and the poll route read one shape.
 */
export function withHostCopy(view: {
  id: string;
  status: string;
  stage: string | null;
  artifacts: { identity?: unknown; design?: unknown; notice?: unknown; facts?: unknown };
  errorCode: string | null;
}): unknown {
  return {
    id: view.id,
    status: view.status,
    stage: view.stage,
    artifacts: {
      identity: view.artifacts.identity,
      design: view.artifacts.design,
      facts: view.artifacts.facts,
    },
    failure: view.status === "failed" ? generationFailure(view.errorCode) : null,
    notice: view.status === "running" ? generationNotice(view.artifacts.notice) : null,
  };
}

/**
 * One truthful line tied to the stage the pipeline has actually resolved: before the identity,
 * after it, after the design is recorded. No percentage, no step count.
 */
export function waitStatusLine(generation: WaitGeneration | null): string {
  if (!generation || generation.stage === null) return "Understanding your event";
  // Painting only once a design is recorded: the copyright step-back clears the refused design
  // while its replacement is drafted.
  if (generation.design === null) return "Designing your card";
  return "Painting the artwork";
}

/** Where the surface starts, from what the server knows when the page loads. */
export type InitialWait =
  | { kind: "reveal" }
  | { kind: "start" }
  | { kind: "poll"; generation: WaitGeneration }
  | { kind: "failed"; failure: GenerationFailure; generation: WaitGeneration };

/**
 * A card that exists goes to the reveal; no generation yet starts one; one running is polled; one
 * that failed is shown, never retried automatically; one that succeeded goes to the reveal.
 */
export function initialWait(hasCard: boolean, generation: WaitGeneration | null): InitialWait {
  if (hasCard) return { kind: "reveal" };
  if (!generation) return { kind: "start" };
  if (generation.status === "running") return { kind: "poll", generation };
  if (generation.status === "failed") {
    return { kind: "failed", failure: generation.failure ?? generationFailure(null), generation };
  }
  return { kind: "reveal" };
}

/** `start_generation`'s outcomes, and `disabled` when generation is switched off. */
export type StartOutcome =
  | "started"
  | "existing"
  | "designed"
  | "in_flight"
  | "published"
  | "event_cap"
  | "host_cap"
  | "disabled";

export type AfterStart =
  { kind: "poll" } | { kind: "reveal" } | { kind: "failed"; failure: GenerationFailure };

/** What `startCardGeneration`'s outcome means for the surface. */
export function afterStart(outcome: StartOutcome | string): AfterStart {
  switch (outcome) {
    case "started":
    case "existing":
    case "in_flight":
      return { kind: "poll" };
    case "designed":
      return { kind: "reveal" };
    case "event_cap":
    case "host_cap":
    case "published":
    case "disabled":
      return { kind: "failed", failure: generationFailure(outcome) };
    default:
      return { kind: "failed", failure: generationFailure(null) };
  }
}

export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_BACKOFF_MS = 15_000;

/** The wait before the next poll: every 2 s, backing off (doubling, to 15 s) after failed reads. */
export function nextPollDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, POLL_MAX_BACKOFF_MS);
}
