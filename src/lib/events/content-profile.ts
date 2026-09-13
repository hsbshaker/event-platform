/**
 * spec.md §11.4 layer 2 ("ContentProfile"):
 *
 * > `ContentProfile` — what content currently exists and how large it is (title word
 * > count, presence and length of hosts, description, time, location, deadline,
 * > registry counts), plus which fields are provisional (§7.3). Sent to the
 * > composition call for fit; changes to it trigger deterministic re-fit revisions
 * > (§4.10), never recomposition.
 *
 * Built directly on top of `provisionalContent` so the two never disagree about what
 * counts as real vs. provisional. Never reads `Capabilities` (layer 1) or
 * `FeaturePresentationState` (layer 3) — those are separate layers by design.
 *
 * Registry counts (native gifts, external registries, cash fund) are out of Phase 2
 * scope; they are accepted as optional inputs defaulting to zero and populated by the
 * registry feature in Phase 8.
 *
 * Pure, dependency-free.
 */

import { provisionalContent, type ProvisionalSourceEvent } from "./provisional";

export interface ContentProfileRegistryCounts {
  /** Phase 8: count of native gift entries. */
  nativeGifts?: number;
  /** Phase 8: count of linked external registries. */
  externalRegistries?: number;
  /** Phase 8: whether a cash fund is configured. */
  hasCashFund?: boolean;
}

export interface ContentProfileSourceEvent extends ProvisionalSourceEvent {
  description?: string | null;
}

export interface ContentProfile {
  titleWordCount: number;
  hosts: { present: boolean; length: number };
  description: { present: boolean; length: number };
  time: { present: boolean };
  location: { present: boolean; length: number };
  deadline: { present: boolean };
  registry: {
    nativeGiftCount: number;
    externalRegistryCount: number;
    hasCashFund: boolean;
  };
  provisionalFields: string[];
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * spec.md §11.4 layer 2: derived from real vs. provisional content (never from
 * capabilities), for use as composition-fit input.
 */
export function contentProfile(
  event: ContentProfileSourceEvent,
  now: Date,
  registryCounts: ContentProfileRegistryCounts = {},
): ContentProfile {
  const provisional = provisionalContent(event, now);

  const description = event.description ?? null;
  const hasDescription = typeof description === "string" && description.trim().length > 0;

  const provisionalFields: string[] = [];
  if (provisional.title.provisional) provisionalFields.push("title");
  if (provisional.eventDate.provisional) provisionalFields.push("eventDate");
  if (provisional.startTime.provisional) provisionalFields.push("startTime");
  if (provisional.venue.provisional) provisionalFields.push("venue");
  if (provisional.rsvpDeadline?.provisional) provisionalFields.push("rsvpDeadline");
  // hosts, endTime and description have no provisional value — never appear here.

  return {
    titleWordCount: wordCount(provisional.title.value),
    hosts: {
      present: provisional.hosts !== null,
      length: provisional.hosts?.value.trim().length ?? 0,
    },
    description: {
      present: hasDescription,
      length: hasDescription ? (description as string).trim().length : 0,
    },
    time: {
      present: !provisional.startTime.provisional,
    },
    location: {
      present: !provisional.venue.provisional,
      length: provisional.venue.value.length,
    },
    deadline: {
      present: provisional.rsvpDeadline !== null && !provisional.rsvpDeadline.provisional,
    },
    registry: {
      nativeGiftCount: registryCounts.nativeGifts ?? 0,
      externalRegistryCount: registryCounts.externalRegistries ?? 0,
      hasCashFund: registryCounts.hasCashFund ?? false,
    },
    provisionalFields,
  };
}
