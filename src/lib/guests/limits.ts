/**
 * The guest list's limits (`spec.md §12`; build decision for Phase 7a). Generous abuse caps, not
 * product rules a host is expected to meet. The per-event caps are enforced by the database
 * functions under the event's lock (20261014000000_guest_parties.sql holds the same numbers); the
 * rest are entry limits checked here and by the table constraints.
 */

/** Parties per event. */
export const MAX_PARTIES_PER_EVENT = 1000;
/** Named guests per event, across all its parties. */
export const MAX_PEOPLE_PER_EVENT = 2000;

/** A guest's name, trimmed. */
export const GUEST_NAME_MAX = 80;
/** The name on the invitation, trimmed. */
export const DISPLAY_NAME_MAX = 120;
/** An email address (RFC 5321's path limit). */
export const EMAIL_MAX = 254;

/**
 * A CSV file the import accepts: at most 1 MB (10^6 bytes) ... The file travels to a Server
 * Action as form data, whose request limit is Next.js's default 1 MiB: this leaves room for the
 * form's own bytes without raising that limit for every action.
 */
export const CSV_MAX_BYTES = 1_000_000;
/** ... and at most this many data rows (the header row aside). */
export const CSV_MAX_ROWS = 2000;
