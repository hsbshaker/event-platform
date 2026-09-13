/**
 * The publish requirements this phase can collect (spec.md §23.1).
 *
 * §23.1 is the whole list and this module adds nothing to it (§32 #44). Two of its entries are
 * out of Phase 2's reach and are deliberately absent here: the selected concept with a valid
 * resolved spec (Phases 4-5) and the encrypted access code a private event needs (Phase 6);
 * the owner account exists by construction once the draft is claimed.
 *
 * Nothing here gates generation. Required details are publish requirements, never generation
 * prerequisites (§7.3), so callers use this to decide what to *ask*, never what to block.
 */

export interface EventDetailFields {
  title: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  venueName: string | null;
  address: string | null;
  hosts: string | null;
  babyName: string | null;
  visibility: "public" | "private" | null;
  rsvpDeadline: string | null;
}

/** Keys of §23.1 requirements that the Phase 2 details flow owns. */
export const REQUIRED_DETAIL_KEYS = [
  "title",
  "eventDate",
  "startTime",
  "venue",
  "timezone",
  "rsvpDeadline",
  "visibility",
] as const;

export type RequiredDetailKey = (typeof REQUIRED_DETAIL_KEYS)[number];

/** True when the field carries a real value, not merely an empty string. */
function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Which §23.1 requirements are still unanswered. "Venue" is satisfied by either a venue name
 * or an address, since §23.1 asks for a "venue/location display value".
 */
export function missingRequiredDetails(fields: EventDetailFields): RequiredDetailKey[] {
  const missing: RequiredDetailKey[] = [];
  if (!present(fields.title)) missing.push("title");
  if (!present(fields.eventDate)) missing.push("eventDate");
  if (!present(fields.startTime)) missing.push("startTime");
  if (!present(fields.venueName) && !present(fields.address)) missing.push("venue");
  if (!present(fields.timezone)) missing.push("timezone");
  if (!present(fields.rsvpDeadline)) missing.push("rsvpDeadline");
  if (fields.visibility === null) missing.push("visibility");
  return missing;
}

/**
 * Phase 2 cannot decide publish readiness on its own: §23.1 also requires a selected concept
 * with a valid resolved spec and, for a private event, an encrypted access code. Exposed so
 * callers state the distinction honestly rather than implying an event is ready.
 */
export const REQUIREMENTS_OUTSIDE_PHASE_2 = [
  "selected concept with a valid ResolvedDesignSpec",
  "encrypted access code when the event is private",
] as const;
