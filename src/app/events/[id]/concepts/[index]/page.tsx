import { notFound } from "next/navigation";

import { loadLatestConceptRound } from "@/app/actions/generation";
import { requireEventAccess } from "@/lib/auth/event-access";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { EventPage } from "@/components/event-renderer/page";
import { NOTHING_CONFIGURED } from "@/components/event-renderer/feature-presentation";
import type { ArtworkUrlResolver } from "@/lib/generation/artwork-assets";
import { renderableArtworkFor } from "@/lib/generation/artwork-assets";
import { deriveEventContent } from "@/lib/generation/event-content";
import type { EventContentRow } from "@/lib/generation/content-profile";
import type { PreVerificationDesignSpec } from "@/lib/renderer/compile/spec";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify";
import type { Json } from "@/lib/supabase/database.types";

/**
 * T-4F — the real preview of one generated concept.
 *
 * Not a thumbnail, not a screenshot: this route renders the production `EventPage` from the same
 * persisted, geometry-verified `ResolvedDesignSpec` a guest would eventually be served
 * (`spec.md §31 — Concept experience`, `docs/event-renderer-system.md §6`). "A link from a concept
 * card to the preview route is the whole interaction" for this phase — no selection, no reveal, no
 * Creation Mode (`spec.md §32 #7`, `#8`).
 *
 * # Access
 *
 * Authorized through the same `requireEventAccess` path every other event surface uses, with the
 * `preview` capability — the one guests themselves are also allowed (`spec.md §25`), so a co-host,
 * an owner or (once a link exists) a guest all reach the same honest page. A non-member gets the
 * same answer as a request for a concept that does not exist: `notFound()`, never a distinguishing
 * error (`spec.md §27`).
 *
 * # Which concept
 *
 * `[index]` is the sibling's stable planner index (0, 1 or 2) within the event's **latest batch's
 * round** — the same index `GenerationView.concepts` is ordered by. There is exactly one concept
 * per `(event_id, round, concept_index)` (`design_concepts`'s own uniqueness), so that round's row
 * at that index is the concept a host just watched finish.
 *
 * The round is resolved from the batch, explicitly, and not as "the highest round that happens to
 * hold a row at this index". Those two readings agree only while one round exists. Once a second
 * round has run — which a retry after a failed batch now reaches — the second reading would serve
 * round 1's concept at an index round 2 did not fill, so a bookmarked `/concepts/1` would render a
 * superseded concept as the current one. An index the latest round has no concept for is
 * `notFound()`, which is the truthful answer: that direction does not exist in the set the host is
 * being shown.
 *
 * # Content and artwork
 *
 * `deriveEventContent` reads the same columns and produces the same strings `concept-batch.ts`
 * measured the spec against (`src/lib/generation/event-content.ts`) — the preview must not show a
 * page geometry verification never saw. Artwork is read through
 * `renderableArtworkFor`/`ArtworkUrlResolver`, exactly the pair `src/lib/generation/artwork-assets.ts`
 * defines for this purpose; a concept with no delivered artwork renders with its reserved boxes
 * simply empty, which is the ordinary case (`spec.md §7.6a #1`).
 */

interface DesignConceptRow {
  readonly id: string;
  readonly active_resolved_spec_id: string | null;
}

interface ResolvedSpecRow {
  readonly id: string;
  readonly spec: Json;
}

/** Every field a plain concept index must resolve to before there is anything to render. */
async function loadConcept(eventId: string, index: number, round: number) {
  const supabase = await createClient();

  const { data: concepts, error: conceptError } = await supabase
    .from("design_concepts")
    .select("id, active_resolved_spec_id")
    .eq("event_id", eventId)
    .eq("round", round)
    .eq("concept_index", index)
    .limit(1);
  if (conceptError) throw new Error(conceptError.message);
  const concept = ((concepts ?? [])[0] as DesignConceptRow | undefined) ?? null;
  if (!concept || !concept.active_resolved_spec_id) return null;

  const { data: specs, error: specError } = await supabase
    .from("resolved_design_specs")
    .select("id, spec")
    .eq("id", concept.active_resolved_spec_id)
    .limit(1);
  if (specError) throw new Error(specError.message);
  const specRow = ((specs ?? [])[0] as ResolvedSpecRow | undefined) ?? null;
  if (!specRow) return null;

  const { data: events, error: eventError } = await supabase
    .from("events")
    .select(
      "title, description, hosts, baby_name, venue_name, address, event_date, start_time, " +
        "timezone, rsvp_deadline",
    )
    .eq("id", eventId)
    .limit(1);
  if (eventError) throw new Error(eventError.message);
  const eventRow = ((events ?? [])[0] as unknown as EventContentRow | undefined) ?? null;
  if (!eventRow) return null;

  // The renderer never learns which model drew a picture or where the bucket lives — only a
  // fetchable `src` (`@/components/event-renderer/artwork`'s own header).
  const resolveArtworkUrl: ArtworkUrlResolver = (bucket, path) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const artworkAssets = await renderableArtworkFor(
    // `renderableArtworkFor` only ever selects; the RLS-scoped client this route already holds is
    // enough, and using it (rather than an admin client) keeps this read inside the same
    // membership boundary `requireEventAccess` just proved.
    supabase,
    specRow.id,
    resolveArtworkUrl,
  );

  return {
    spec: specRow.spec as unknown as ResolvedDesignSpec,
    content: deriveEventContent(eventRow, new Date()),
    artworkAssets,
  };
}

/**
 * A `ResolvedDesignSpec` is everything `PreVerificationDesignSpec` is, plus the geometry verdict
 * (`src/lib/renderer/verify/result.ts`). `EventPage` never reads `spec.state` or `spec.verified` —
 * it reads `overrides` as its own top-level prop, sourced from the resolved spec's own `overrides`
 * — so this reshapes the type without changing a single value, purely so the renderer's narrower,
 * pre-verification prop type accepts a persisted, already-verified spec.
 */
function asRendererSpec(spec: ResolvedDesignSpec): PreVerificationDesignSpec {
  return {
    ...spec,
    state: "pre-verification",
    verified: null,
  };
}

export default async function ConceptPreviewPage({
  params,
}: {
  params: Promise<{ id: string; index: string }>;
}) {
  const { id, index: rawIndex } = await params;
  const index = Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(index) || index < 0) notFound();

  try {
    // `browse_select_concepts`, not `preview`. Two differences matter and both are canon.
    // `preview` is in `GUEST_ALLOWED`, and an unselected concept is not a guest's to look at;
    // and `browse_select_concepts` is in `PRE_PUBLISH_ONLY`, which is what `spec.md §25` requires
    // — "after publish, AI generation and concept switching are disabled for both" — so this
    // surface closes itself on publish rather than outliving the decision it exists to support.
    await requireEventAccess(id, "browse_select_concepts");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  // Which round `[index]` means. `null` both for an event that has never had a batch and for a
  // caller who may not see it — `notFound()` either way, never a distinguishing error.
  const round = await loadLatestConceptRound(id);
  if (round === null) notFound();

  const loaded = await loadConcept(id, index, round);
  if (!loaded) notFound();

  return (
    <main className="min-h-dvh w-full overflow-x-hidden">
      <EventPage
        spec={asRendererSpec(loaded.spec)}
        content={loaded.content}
        audience="collaborator"
        overrides={loaded.spec.overrides}
        presentation={NOTHING_CONFIGURED}
        artworkAssets={loaded.artworkAssets}
      />
    </main>
  );
}
