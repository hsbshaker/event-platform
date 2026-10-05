"use server";

import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess } from "@/lib/auth/event-access";
import { createClient } from "@/lib/supabase/server";
import {
  applyEventPatch,
  type ApplyPatchResult,
  type EventPatchStore,
} from "@/lib/events/apply-patch";
import { cardVenue, parsePromptFacts, type PromptFacts } from "@/lib/card/facts";
import { cardTextFieldErrors, type VenueContext } from "@/lib/events/card-text";
import { cardTextFitErrors } from "@/lib/events/card-text-fit.server";
import { computeEventPatch } from "@/lib/events/detail-patch";
import { DESCRIPTION_MAX_LENGTH } from "@/lib/events/page-content";
import { provisionalContent, type ProvisionalContent } from "@/lib/events/provisional";
import {
  missingRequiredDetails,
  type RequiredDetailKey,
  type EventDetailFields,
} from "@/lib/events/required-details";

/**
 * The missing-details flow that runs alongside generation (spec.md §7.3).
 *
 * Required details are publish requirements (§23.1), never generation prerequisites: nothing
 * here blocks generation state, and this module adds no requirement beyond §23.1 (§32 #45).
 * The RSVP deadline follows the canonical rule and is never overwritten once the host edits
 * it; the timezone is inferred from venue text with a browser fallback and no geocoder
 * (§7.4, §32 #41).
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const patchSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  /** Page content only (the text under the card); never on the card, so no card fit check. */
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).nullable().optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  startTime: z.string().regex(TIME).nullable().optional(),
  endTime: z.string().regex(TIME).nullable().optional(),
  venueName: z.string().trim().max(300).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  hosts: z.string().trim().max(300).nullable().optional(),
  babyName: z.string().trim().max(120).nullable().optional(),
  visibility: z.enum(["public", "private"]).nullable().optional(),
  /** An explicit deadline from the host; sets the edited flag and is never recomputed after. */
  rsvpDeadline: z.string().datetime({ offset: true }).nullable().optional(),
  /** Sent once by the client so §7.4's fallback has something to fall back to. */
  browserTimezone: z.string().max(80).nullable().optional(),
});

export type EventDetailsPatch = z.input<typeof patchSchema>;

export interface EventDraftView extends EventDetailFields {
  id: string;
  prompt: string;
  rsvpDeadlineEdited: boolean;
  generationRequestedAt: string | null;
  /**
   * The row version this view was read at. Monotonic, so the client can ignore a save
   * response overtaken by a newer one rather than rolling its state back (see
   * `shouldApplyServerEvent`).
   */
  rowVersion: number;
  /** The page's description (`events.description`); never on the card. */
  description: string | null;
  /** The facts the prompt states, as written (`events.prompt_facts`); null when none were extracted. */
  promptFacts: PromptFacts | null;
  /**
   * Whether the event has been published (`published_at`, robust to PASSED and ARCHIVED). After
   * publish, privacy is not a routine detail: switching to private needs its event code written in
   * the same transaction (the privacy action), so this form does not offer it.
   */
  published: boolean;
  /** §23.1 requirements not yet satisfied. Informational: nothing is blocked by them now. */
  missing: RequiredDetailKey[];
  /** Real values where present, and the placeholders the card shows in Creation Mode for the rest (§7.3). */
  provisional: ProvisionalContent;
}

/** Privacy is not a routine detail once the invitation is published (see `updateEventDetails`). */
const PUBLISHED_VISIBILITY_MESSAGE =
  "Your invitation is published, so its privacy can't be changed here.";

const COLUMNS =
  "id, prompt, title, description, event_date, start_time, end_time, timezone, venue_name, address, hosts, baby_name, visibility, rsvp_deadline, rsvp_deadline_edited, generation_requested_at, row_version, prompt_facts, published_at";

type EventRow = {
  id: string;
  prompt: string;
  title: string | null;
  description: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  hosts: string | null;
  baby_name: string | null;
  visibility: "public" | "private" | null;
  rsvp_deadline: string | null;
  rsvp_deadline_edited: boolean;
  generation_requested_at: string | null;
  /** Concurrency token, never sent to the client and never written by this module. */
  row_version: number;
  prompt_facts: unknown;
  published_at: string | null;
};

function toFields(row: EventRow): EventDetailFields {
  return {
    title: row.title,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone,
    venueName: row.venue_name,
    address: row.address,
    hosts: row.hosts,
    babyName: row.baby_name,
    visibility: row.visibility,
    rsvpDeadline: row.rsvp_deadline,
  };
}

/** The shape the pure content modules take: one venue display value, not two columns. */
function toContentSource(fields: EventDetailFields) {
  return { ...fields, venue: cardVenue(fields.venueName, fields.address) };
}

function toView(row: EventRow, now: Date): EventDraftView {
  const fields = toFields(row);
  const source = toContentSource(fields);
  return {
    ...fields,
    id: row.id,
    prompt: row.prompt,
    rsvpDeadlineEdited: row.rsvp_deadline_edited,
    generationRequestedAt: row.generation_requested_at,
    rowVersion: row.row_version,
    description: row.description,
    promptFacts: parsePromptFacts(row.prompt_facts),
    published: row.published_at !== null,
    missing: missingRequiredDetails(fields),
    provisional: provisionalContent(source, now),
  };
}

/** Reads the event through RLS: only its owner and co-hosts can see it. */
export async function loadEventDraft(eventId: string): Promise<EventDraftView | null> {
  await requireEventAccess(eventId, "edit_event_content");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data ? toView(data as EventRow, new Date()) : null;
}

export type UpdateResult =
  | { ok: true; event: EventDraftView }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Applies one autosaved change set. Only the fields present in the patch are written, so a
 * half-filled form never clears what the host has already given us.
 */
export async function updateEventDetails(
  eventId: string,
  patch: EventDetailsPatch,
): Promise<UpdateResult> {
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return { ok: false, error: "Check the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  // Words the card shows are refused at entry when the card could not show them (spec.md §31,
  // "slot limits are enforced at entry"; docs/card-system.md §2.5).
  // The venue name and address depend on each other (the card shows the address's first line only
  // without a venue name), so here only the checks that stand alone run: a non-empty venue name.
  // The address, and a cleared venue name, are checked after auth against the stored values.
  const cardErrors = cardTextFieldErrors({
    title: input.title,
    hosts: input.hosts,
    babyName: input.babyName,
    venueName: (input.venueName ?? "") === "" ? undefined : input.venueName,
  });
  if (cardErrors) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: cardErrors };
  }

  let published: boolean;
  try {
    published = (await requireEventAccess(eventId, "edit_event_content")).context.published;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, error: "You cannot edit this event." };
    }
    throw error;
  }
  // After publish, privacy is changed only with its event code, in one transaction (AGENTS.md,
  // "the privacy action"), never as a routine detail.
  if (input.visibility !== undefined && published) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { visibility: PUBLISHED_VISIBILITY_MESSAGE },
    };
  }

  const supabase = await createClient();

  // The stored venue name and address, read when the patch changes either (each is checked in
  // light of the other).
  let storedVenue: VenueContext = {};
  if (input.venueName !== undefined || input.address !== undefined) {
    const { data, error } = await supabase
      .from("events")
      .select("venue_name, address")
      .eq("id", eventId)
      .maybeSingle();
    if (error) {
      console.error("updateEventDetails: could not read the venue", { eventId, error });
      return { ok: false, error: "Could not save that. Try again." };
    }
    if (data) {
      storedVenue = {
        venueName: data.venue_name as string | null,
        address: data.address as string | null,
      };
    }
    // Not atomic with the write below: a concurrent writer changing the other venue field in
    // between can slip past this check. Accepted as a narrow race; the card compiler still
    // refuses to render text it cannot show, so it costs a retry, never a broken card.
    const venueErrors = data
      ? cardTextFieldErrors({ venueName: input.venueName, address: input.address }, storedVenue)
      : null;
    if (venueErrors) {
      return { ok: false, error: "Check the highlighted fields.", fieldErrors: venueErrors };
    }
  }

  // Then whether the card can fit each accepted value in every design, with every other detail
  // at its worst case (docs/card-system.md §2.5, §4.3: every card shows every detail). Measured
  // with the card fonts, so it runs only after authorization; the venue as the card shows it
  // (the venue name, else the address's first line).
  let fitErrors: Record<string, string> | null;
  try {
    fitErrors = await cardTextFitErrors(
      {
        title: input.title,
        hosts: input.hosts,
        babyName: input.babyName,
        venueName: input.venueName,
        address: input.address,
      },
      storedVenue,
    );
  } catch (error) {
    console.error("updateEventDetails: could not check the card text", { eventId, error });
    return { ok: false, error: "Could not save that. Try again." };
  }
  if (fitErrors) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fitErrors };
  }

  // Compare-and-set on `row_version`, so the patch and its derived RSVP deadline can only
  // land on the snapshot they were computed from. A save that loses the race recomputes
  // against the winner's state rather than overwriting it (see applyEventPatch).
  const store: EventPatchStore<EventRow> = {
    async read() {
      const { data, error } = await supabase
        .from("events")
        .select(COLUMNS)
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as EventRow;
      return { row, version: row.row_version };
    },
    async compareAndSet(patch, version) {
      const { data, error } = await supabase
        .from("events")
        .update(patch)
        .eq("id", eventId)
        .eq("row_version", version)
        .select(COLUMNS);
      if (error) throw error;
      // Zero rows means another writer moved the version between the read and here.
      const row = (data ?? [])[0] as EventRow | undefined;
      return row ? { row, version: row.row_version } : null;
    },
  };

  let result: ApplyPatchResult<EventRow>;
  try {
    result = await applyEventPatch(store, (row) => computeEventPatch(row, input, new Date()));
  } catch (error) {
    console.error("updateEventDetails: save failed", { eventId, error });
    return { ok: false, error: "Could not save that. Try again." };
  }

  switch (result.status) {
    case "missing":
      return { ok: false, error: "That event no longer exists." };
    case "contended":
      // Bounded rather than endless. The host sees the same retry affordance as any other
      // failed save; nothing new is surfaced for a conflict we could not settle ourselves.
      // Logged because losing every attempt should be vanishingly rare: if it stops being
      // rare, the bound is wrong and nothing else would say so.
      console.warn("updateEventDetails: gave up after losing every attempt", {
        eventId,
        attempts: result.attempts,
      });
      return { ok: false, error: "Could not save that. Try again." };
    default:
      return { ok: true, event: toView(result.row, new Date()) };
  }
}
