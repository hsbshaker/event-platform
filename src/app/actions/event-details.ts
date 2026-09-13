"use server";

import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess } from "@/lib/auth/event-access";
import { createClient } from "@/lib/supabase/server";
import { contentProfile, type ContentProfile } from "@/lib/events/content-profile";
import { provisionalContent, type ProvisionalContent } from "@/lib/events/provisional";
import { nextRsvpDeadline } from "@/lib/events/rsvp-deadline";
import {
  missingRequiredDetails,
  type RequiredDetailKey,
  type EventDetailFields,
} from "@/lib/events/required-details";
import { resolveEventTimezone, validateTimezone } from "@/lib/events/timezone";

/**
 * The missing-details flow that runs alongside generation (spec.md §7.3).
 *
 * Required details are publish requirements (§23.1), never generation prerequisites: nothing
 * here blocks generation state, and this module adds no requirement beyond §23.1 (§32 #44).
 * The RSVP deadline follows the canonical rule and is never overwritten once the host edits
 * it; the timezone is inferred from venue text with a browser fallback and no geocoder
 * (§7.4, §32 #40).
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const patchSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
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
  /** §23.1 requirements not yet satisfied. Informational: nothing is blocked by them now. */
  missing: RequiredDetailKey[];
  /** What later composition would use today, real values where present (§7.3). */
  provisional: ProvisionalContent;
  contentProfile: ContentProfile;
}

const COLUMNS =
  "id, prompt, title, event_date, start_time, end_time, timezone, venue_name, address, hosts, baby_name, visibility, rsvp_deadline, rsvp_deadline_edited, generation_requested_at";

type EventRow = {
  id: string;
  prompt: string;
  title: string | null;
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
  return { ...fields, venue: fields.venueName ?? fields.address };
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
    missing: missingRequiredDetails(fields),
    provisional: provisionalContent(source, now),
    contentProfile: contentProfile(source, now),
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

  try {
    await requireEventAccess(eventId, "edit_event_content");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, error: "You cannot edit this event." };
    }
    throw error;
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("events")
    .select(COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return { ok: false, error: "That event no longer exists." };
  const row = current as EventRow;

  type EventUpdate = Partial<{
    title: string | null;
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
  }>;
  const update: EventUpdate = {};
  const pick = <K extends keyof typeof input, C extends keyof EventUpdate>(key: K, column: C) => {
    if (input[key] === undefined) return;
    const value = input[key] === "" ? null : input[key];
    (update as Record<string, unknown>)[column] = value;
  };
  pick("title", "title");
  pick("eventDate", "event_date");
  pick("startTime", "start_time");
  pick("endTime", "end_time");
  pick("venueName", "venue_name");
  pick("address", "address");
  pick("hosts", "hosts");
  pick("babyName", "baby_name");
  pick("visibility", "visibility");

  // Timezone: inferred from venue text, browser as fallback, never a geocoder (§7.4).
  const venueText = [update.venue_name ?? row.venue_name, update.address ?? row.address]
    .filter(Boolean)
    .join(", ");
  const venueChanged =
    (update.venue_name !== undefined && update.venue_name !== row.venue_name) ||
    (update.address !== undefined && update.address !== row.address);
  if (!row.timezone || venueChanged) {
    const resolved = resolveEventTimezone({
      venueText,
      browserTimezone: input.browserTimezone ?? null,
    });
    if (resolved && validateTimezone(resolved)) update.timezone = resolved;
  }

  const effectiveDate = update.event_date !== undefined ? update.event_date : row.event_date;
  const effectiveStart = update.start_time !== undefined ? update.start_time : row.start_time;
  const effectiveZone = update.timezone !== undefined ? update.timezone : row.timezone;

  if (input.rsvpDeadline !== undefined) {
    // An explicit choice by the host: store it and stop recomputing for good (§7.3).
    update.rsvp_deadline = input.rsvpDeadline;
    update.rsvp_deadline_edited = input.rsvpDeadline !== null;
  } else {
    const deadline = nextRsvpDeadline({
      current: row.rsvp_deadline ? new Date(row.rsvp_deadline) : null,
      edited: row.rsvp_deadline_edited,
      eventDate: effectiveDate,
      startTime: effectiveStart,
      timezone: effectiveZone,
      now: new Date(),
    });
    const iso = deadline ? deadline.toISOString() : null;
    if (iso !== row.rsvp_deadline) update.rsvp_deadline = iso;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("events").update(update).eq("id", eventId);
    if (error) return { ok: false, error: "Could not save that. Try again." };
  }

  const { data: after, error: afterError } = await supabase
    .from("events")
    .select(COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  if (afterError) throw afterError;
  return { ok: true, event: toView(after as EventRow, new Date()) };
}
