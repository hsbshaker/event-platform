/**
 * spec.md §7.3 "RSVP deadline default" (quoted verbatim):
 *
 * > If the host does not set one: the deadline is the event date minus 14 days, at
 * > 11:59 PM in the event timezone. If that instant is already past when the default
 * > is computed, use the day before the event at 11:59 PM; if the event is today or
 * > tomorrow, use the event start time. The default is recomputed only while the host
 * > has not edited the deadline; an edited deadline is never overwritten.
 *
 * Pure, dependency-free: every input (including the reference instant) is an explicit
 * argument, nothing reads `Date.now()` internally.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Provisional start time used when the host has not set one (spec.md §7.3). */
export const PROVISIONAL_START_TIME = "13:00";

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseDateStr(dateStr: string): DateParts {
  const [year, month, day] = dateStr.split("-").map((n) => parseInt(n, 10));
  return { year, month, day };
}

function formatDateStr({ year, month, day }: DateParts): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Adds (or subtracts, for negative `days`) whole calendar days to a YYYY-MM-DD date. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const { year, month, day } = parseDateStr(dateStr);
  const utcMs = Date.UTC(year, month - 1, day) + days * MS_PER_DAY;
  const d = new Date(utcMs);
  return formatDateStr({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

function parseTimeStr(timeStr: string): { hour: number; minute: number; second: number } {
  const parts = timeStr.split(":").map((n) => parseInt(n, 10));
  return { hour: parts[0] ?? 0, minute: parts[1] ?? 0, second: parts[2] ?? 0 };
}

/**
 * Offset (ms) of `timeZone` from UTC at instant `ms`: the difference between the wall
 * clock `timeZone` shows at that instant (reinterpreted as UTC) and `ms` itself.
 */
function getOffsetMs(timeZone: string, ms: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // some locales render midnight as "24"
  const asUtc = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    hour,
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  );
  return asUtc - ms;
}

/**
 * Converts a wall-clock local date/time in an IANA zone to the correct UTC instant,
 * correct across DST transitions. Probes the zone's offset via `Intl.DateTimeFormat`
 * and corrects once (the offset can change between the first guess and the
 * corrected instant near a DST boundary). When `timeZone` is null, the wall clock is
 * treated as UTC.
 */
function zonedTimeToUtc(
  date: DateParts,
  time: { hour: number; minute: number; second: number },
  timeZone: string | null,
): Date {
  const wallAsUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    time.second,
  );
  if (!timeZone) {
    return new Date(wallAsUtc);
  }
  const offset = getOffsetMs(timeZone, wallAsUtc);
  let instant = wallAsUtc - offset;
  const correctedOffset = getOffsetMs(timeZone, instant);
  if (correctedOffset !== offset) {
    instant = wallAsUtc - correctedOffset;
  }
  return new Date(instant);
}

/** The YYYY-MM-DD calendar date that `now` falls on, as seen in `timeZone` (UTC if null). */
function localDateStr(now: Date, timeZone: string | null): string {
  if (!timeZone) {
    return now.toISOString().slice(0, 10);
  }
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface ComputeRsvpDeadlineInput {
  /** YYYY-MM-DD, or null when the event date is not yet known. */
  eventDate: string | null;
  /** HH:MM or HH:MM:SS, or null when not yet known (provisional start applies). */
  startTime: string | null;
  /** IANA zone; null is treated as UTC. */
  timezone: string | null;
  /** Reference instant the default is computed against. */
  now: Date;
}

/**
 * spec.md §7.3 RSVP deadline default. Returns `null` only when the event date is
 * unknown — every other case has a defined default per the quoted rule.
 */
export function computeRsvpDeadline(input: ComputeRsvpDeadlineInput): Date | null {
  const { eventDate, startTime, timezone, now } = input;
  if (!eventDate) return null;

  const fourteenDaysBefore = addDaysToDateStr(eventDate, -14);
  const candidate = zonedTimeToUtc(
    parseDateStr(fourteenDaysBefore),
    { hour: 23, minute: 59, second: 0 },
    timezone,
  );

  if (candidate.getTime() > now.getTime()) {
    return candidate;
  }

  // The 14-days-before candidate is already past: check today/tomorrow first (per
  // the quoted rule's ordering), otherwise fall back to the day before the event.
  const today = localDateStr(now, timezone);
  const tomorrow = addDaysToDateStr(today, 1);
  if (eventDate === today || eventDate === tomorrow) {
    const effectiveStart = startTime ?? PROVISIONAL_START_TIME;
    return zonedTimeToUtc(parseDateStr(eventDate), parseTimeStr(effectiveStart), timezone);
  }

  const dayBefore = addDaysToDateStr(eventDate, -1);
  return zonedTimeToUtc(parseDateStr(dayBefore), { hour: 23, minute: 59, second: 0 }, timezone);
}

export interface NextRsvpDeadlineInput extends ComputeRsvpDeadlineInput {
  /** The currently persisted deadline (or null if none has been computed yet). */
  current: Date | null;
  /** Whether the host has edited the deadline. When true, `current` is never overwritten. */
  edited: boolean;
}

/**
 * spec.md §7.3: "The default is recomputed only while the host has not edited the
 * deadline; an edited deadline is never overwritten." Returns the value that should
 * be persisted.
 */
export function nextRsvpDeadline(input: NextRsvpDeadlineInput): Date | null {
  if (input.edited) {
    return input.current;
  }
  return computeRsvpDeadline(input);
}
