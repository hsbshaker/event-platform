/**
 * Capabilities and ContentProfile for the Composition stage (`docs/event-renderer-system.md §2.3`).
 *
 * These are two deliberately separate layers, never merged:
 *
 * - `Capabilities` — which features are enabled. They derive from enabled features, never from
 *   whether content exists: "for a baby shower at first generation they are the full set, so
 *   every first composition has a designed place for RSVP and registry"
 *   (`docs/event-renderer-system.md §2.3`; `spec.md §32` #16 forbids scoping to content presence).
 * - `ContentProfile` — present content, measured for fit. Real content is measured where present;
 *   where the host has not entered it yet, composition uses a deterministic bounded provisional
 *   stand-in so geometry is realistic, and that field is named in `provisionalFields`
 *   (`spec.md §7.3`).
 *
 * `FeaturePresentationState` (guest visibility/readiness) is a third, separate layer and is never
 * sent to the model — it is out of scope for this file and is not referenced here
 * (`spec.md §7.3` clarification (1); `docs/event-renderer-system.md §2.3`).
 */

import type { Capabilities, ContentProfile, RegistryCounts } from "@/lib/renderer/composition/nodes";
import { provisionalContent } from "@/lib/events/provisional";

/** Bumped whenever this file's derivation logic changes shape (matches `src/lib/ai/versions.ts`'s
 * convention of a version constant per generation-facing derivation). The lead may relocate this
 * into `src/lib/ai/versions.ts` if that becomes the single home for such constants. */
export const CONTENT_PROFILE_VERSION = "content_profile_v1";

/**
 * The narrow slice of the `events` row this module reads. Deliberately not the whole Supabase row
 * type: a caller cannot accidentally widen a query to join guests or registry items and hand them
 * to a function that must only ever see enabled-features and event-content columns.
 *
 * Column names match `src/lib/supabase/database.types.ts`'s `events` table exactly.
 */
export interface EventContentRow {
  title: string | null;
  description: string | null;
  hosts: string | null;
  baby_name: string | null;
  venue_name: string | null;
  event_date: string | null;
  start_time: string | null;
  timezone: string | null;
  rsvp_deadline: string | null;
}

/**
 * `deriveCapabilities` never reads `event`'s content columns — only whether a feature is enabled
 * would change its answer, and today's MVP has no feature-toggle columns on `events` at all (the
 * `type` column only ever holds `'baby_shower'`). So every capability is on for every event: RSVP,
 * registry, gifts, external registry links and a cash fund are all features this product ships for
 * every baby shower, not options a host turns on later. `hosts`/`description`/`time`/`location`/
 * `deadline` are likewise always-available event-detail slots, never gated on whether the host has
 * filled them in yet (`docs/event-renderer-system.md §2.3`).
 *
 * What would change this: a future event type with a narrower feature set, or a host-facing
 * feature toggle (e.g. "no gifts, please") — neither exists yet. Until one does, this function
 * takes `event` only for call-site symmetry with `deriveContentProfile` and to make a future
 * feature-toggle column a one-line change here rather than a signature change at every call site.
 */
export function deriveCapabilities(_event: EventContentRow): Capabilities {
  return {
    rsvp: true,
    registry: true,
    gifts: true,
    externalRegistry: true,
    cashFund: true,
    hosts: true,
    description: true,
    time: true,
    location: true,
    deadline: true,
  };
}

/**
 * Bounded default registry item counts, used only when the caller has no live registry counts to
 * hand in yet (typically: first composition, before the host has set up a registry — Registry is
 * never a publish blocker and never a generation blocker, `spec.md §7.3`, §23.1). These numbers are
 * not themselves spec-mandated the way the title/venue provisional text is; they are chosen, by
 * the same "bounded and realistic" spirit as `spec.md §7.3`'s other stand-ins, to give the
 * Registry section something plausible to fit against rather than an empty or unbounded shape.
 */
export const PROVISIONAL_REGISTRY_COUNTS: RegistryCounts = {
  gift: 6,
  external: 4,
  cashfund: 1,
};

/**
 * Present content, measured for fit (`docs/event-renderer-system.md §2.3`).
 *
 * `now` is explicit (never `Date.now()` internally) to stay pure and match the convention set by
 * `src/lib/events/provisional.ts`, which this function delegates the title/venue/hosts bounded-
 * provisional logic to rather than re-deriving it — that module is the single source of truth for
 * the exact bounded values `spec.md §7.3` specifies, and duplicating them here would let the two
 * drift.
 *
 * `registryCounts` is an optional pre-aggregated count, not raw registry rows — this function's
 * job is event content, and registry items live in a separate table this narrow row type
 * deliberately excludes. When the caller has already aggregated real counts elsewhere, pass them
 * here and they are reported as real, present content. When omitted, `PROVISIONAL_REGISTRY_COUNTS`
 * is used and `"registry"` is recorded in `provisionalFields`.
 */
export function deriveContentProfile(
  event: EventContentRow,
  now: Date,
  registryCounts?: RegistryCounts,
): ContentProfile {
  const content = provisionalContent(
    {
      babyName: event.baby_name,
      title: event.title,
      eventDate: event.event_date,
      startTime: event.start_time,
      endTime: null,
      venue: event.venue_name,
      hosts: event.hosts,
      timezone: event.timezone,
      rsvpDeadline: event.rsvp_deadline,
    },
    now,
  );

  const provisionalFields: string[] = [];
  if (content.title.provisional) provisionalFields.push("title");
  if (content.venue.provisional) provisionalFields.push("venue");

  // Hosts has no bounded provisional stand-in — spec.md §7.3 says "hosts omitted", not a filler
  // string, and `provisionalContent` reflects that with `hosts: null` when absent. An absent host
  // list is real (empty) content, not a fiction standing in for it, so it is never provisional.
  const hostsChars = content.hosts?.value.length ?? 0;

  // Description has no bounded provisional stand-in in spec.md §7.3 either (it is not among the
  // fields §7.3 lists a stand-in for). An absent description is measured as real, empty content,
  // exactly like hosts above — never provisional.
  const descriptionChars = event.description?.length ?? 0;

  const titleWords = content.title.value.trim().length === 0
    ? 0
    : content.title.value.trim().split(/\s+/).length;

  let resolvedRegistryCounts = registryCounts;
  if (!resolvedRegistryCounts) {
    resolvedRegistryCounts = PROVISIONAL_REGISTRY_COUNTS;
    provisionalFields.push("registry");
  }

  return {
    titleWords,
    titleChars: content.title.value.length,
    hostsChars,
    venueChars: content.venue.value.length,
    descriptionChars,
    registryCounts: resolvedRegistryCounts,
    provisionalFields,
  };
}
