"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shouldApplyServerEvent } from "@/lib/events/apply-patch";
import {
  updateEventDetails,
  type EventDetailsPatch,
  type EventDraftView,
} from "@/app/actions/event-details";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/app/Input";
import { InlineStatus } from "@/components/app/InlineStatus";
import { LOCAL_STORAGE_KEY } from "@/components/app/LandingComposer";

/**
 * The missing-details autosave form (spec.md §7.3, docs/design-system.md §3.7/§11,
 * docs/screen-spec.md `generation-details`, e2e H03).
 *
 * Only fields the host has not yet supplied are shown, plus the always-optional hosts and
 * baby name (§7.3's "Potential missing details" list never includes title or timezone as
 * host-facing fields: title is AI-authored later and timezone is inferred, never asked,
 * per §7.4). Once a field appears it stays visible for the rest of this visit even after it
 * autosaves, so the form never yanks away the field the host is mid-edit on.
 *
 * Nothing here is a publish gate (§32 #44): every field may stay empty indefinitely.
 */

const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

function isoToLocalInputValue(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Converts a `datetime-local` value, read as wall-clock time in `timeZone`, to an ISO instant. */
function localInputValueToIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  const asUtcGuess = new Date(`${value}:00.000Z`);
  if (Number.isNaN(asUtcGuess.getTime())) return null;
  const zoned = new Date(asUtcGuess.toLocaleString("en-US", { timeZone }));
  const utc = new Date(asUtcGuess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = zoned.getTime() - utc.getTime();
  return new Date(asUtcGuess.getTime() - offsetMs).toISOString();
}

export function DetailsForm({ event }: { event: EventDraftView }) {
  // Frozen on first render: fields the host already filled must not disappear mid-session
  // just because they were saved a moment ago.
  const [visibleMissing] = useState(() => new Set(event.missing));

  const [eventDate, setEventDate] = useState(event.eventDate ?? "");
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");
  const [venueName, setVenueName] = useState(event.venueName ?? "");
  const [address, setAddress] = useState(event.address ?? "");
  const [hosts, setHosts] = useState(event.hosts ?? "");
  const [babyName, setBabyName] = useState(event.babyName ?? "");
  const [visibility, setVisibility] = useState<"public" | "private" | null>(event.visibility);
  const [rsvpDeadlineIso, setRsvpDeadlineIso] = useState(event.rsvpDeadline);
  const [rsvpDeadlineEdited, setRsvpDeadlineEdited] = useState(event.rsvpDeadlineEdited);
  const [timezone, setTimezone] = useState(event.timezone ?? "UTC");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldStatus, setFieldStatus] = useState<Record<string, SaveState>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Resolved once and attached to every save (not only the mount commit), so a later venue
  // change that leaves the inference confident about nothing still has a fallback available
  // (spec.md §7.4; src/lib/events/detail-patch.ts falls back to this when venue text alone
  // is not recognizable).
  const browserTimezoneRef = useRef<string | null>(null);
  /** Newest row version already reflected on screen; see applyServerEvent. */
  const appliedVersionRef = useRef<number>(event.rowVersion);

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Reaching this page means the draft was claimed into this event, so the landing composer's
  // localStorage safety-net copy of the prompt is now stale — clear it here so a host who
  // navigates back to `/` doesn't see the old prompt restored as if it were still a live draft.
  useEffect(() => {
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Best-effort only.
    }
  }, []);

  // §7.4: the browser timezone is only ever a fallback for when venue text alone is not
  // enough — it never overrides a confidently inferred timezone — but it must be available on
  // every save, not only this mount commit, since a later venue change re-runs inference.
  useEffect(() => {
    browserTimezoneRef.current = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void commit({ browserTimezone: browserTimezoneRef.current }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saves are independent requests, so their responses can arrive out of order. Applying an
  // overtaken one would roll the displayed timezone back, and the deadline field converts the
  // host's wall-clock choice with exactly that timezone and stores it as host-edited, which
  // nothing ever recomputes (spec.md §7.3). So a response older than one already applied is
  // dropped rather than displayed.
  function applyServerEvent(next: EventDraftView) {
    if (!shouldApplyServerEvent(appliedVersionRef.current, next.rowVersion)) return;
    appliedVersionRef.current = next.rowVersion;
    setRsvpDeadlineIso(next.rsvpDeadline);
    setRsvpDeadlineEdited(next.rsvpDeadlineEdited);
    if (next.timezone) setTimezone(next.timezone);
  }

  async function commit(patch: EventDetailsPatch, keys: string[]) {
    setFieldStatus((prev) => {
      const next = { ...prev };
      keys.forEach((key) => (next[key] = "saving"));
      return next;
    });
    // Every save carries the fallback timezone, not only the mount commit — see the ref above.
    const withTimezone: EventDetailsPatch =
      patch.browserTimezone !== undefined
        ? patch
        : { ...patch, browserTimezone: browserTimezoneRef.current };
    const result = await updateEventDetails(event.id, withTimezone);
    if (result.ok) {
      applyServerEvent(result.event);
      setFieldErrors((prev) => {
        const next = { ...prev };
        keys.forEach((key) => delete next[key]);
        return next;
      });
      setFieldStatus((prev) => {
        const next = { ...prev };
        keys.forEach((key) => (next[key] = "saved"));
        return next;
      });
    } else {
      setFieldErrors((prev) => ({ ...prev, ...(result.fieldErrors ?? {}) }));
      setFieldStatus((prev) => {
        const next = { ...prev };
        keys.forEach((key) => (next[key] = "error"));
        return next;
      });
    }
  }

  function saveImmediate(patch: EventDetailsPatch, keys: string[]) {
    void commit(patch, keys);
  }

  function saveDebounced(debounceKey: string, patch: EventDetailsPatch, keys: string[]) {
    if (debounceTimers.current[debounceKey]) clearTimeout(debounceTimers.current[debounceKey]);
    debounceTimers.current[debounceKey] = setTimeout(() => {
      void commit(patch, keys);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function flush(debounceKey: string, patch: EventDetailsPatch, keys: string[]) {
    if (debounceTimers.current[debounceKey]) {
      clearTimeout(debounceTimers.current[debounceKey]);
      delete debounceTimers.current[debounceKey];
    }
    void commit(patch, keys);
  }

  const rsvpLocalValue = useMemo(
    () => isoToLocalInputValue(rsvpDeadlineIso, timezone),
    [rsvpDeadlineIso, timezone],
  );

  const nothingLeft =
    !visibleMissing.has("eventDate") &&
    !visibleMissing.has("startTime") &&
    !visibleMissing.has("venue") &&
    !visibleMissing.has("rsvpDeadline");

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-md text-app-text">A few details</h2>
        <p className="text-body-sm text-app-text-secondary">
          These help guests find and RSVP to the real event. They&apos;re only needed before you
          publish — leave anything blank for now, and it won&apos;t affect your design directions.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {visibleMissing.has("eventDate") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="eventDate" label="Event date" error={fieldErrors.eventDate} required>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="date"
                  value={eventDate}
                  onChange={(event) => {
                    setEventDate(event.target.value);
                    saveImmediate({ eventDate: event.target.value }, ["eventDate"]);
                  }}
                />
              )}
            </Field>
            {visibleMissing.has("startTime") && (
              <Field id="startTime" label="Start time" error={fieldErrors.startTime} required>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="time"
                    value={startTime}
                    onChange={(event) => {
                      setStartTime(event.target.value);
                      saveImmediate({ startTime: event.target.value }, ["startTime"]);
                    }}
                  />
                )}
              </Field>
            )}
          </div>
        )}

        {visibleMissing.has("startTime") && !visibleMissing.has("eventDate") && (
          <Field id="startTime" label="Start time" error={fieldErrors.startTime} required>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="time"
                value={startTime}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  saveImmediate({ startTime: event.target.value }, ["startTime"]);
                }}
              />
            )}
          </Field>
        )}

        {(visibleMissing.has("eventDate") || visibleMissing.has("startTime")) && (
          <Field id="endTime" label="End time" hint="Optional" error={fieldErrors.endTime}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="time"
                value={endTime}
                onChange={(event) => {
                  setEndTime(event.target.value);
                  saveImmediate({ endTime: event.target.value }, ["endTime"]);
                }}
              />
            )}
          </Field>
        )}

        {visibleMissing.has("venue") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="venueName" label="Venue name" error={fieldErrors.venueName}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="text"
                  value={venueName}
                  onChange={(event) => {
                    setVenueName(event.target.value);
                    saveDebounced("venueName", { venueName: event.target.value }, ["venueName"]);
                  }}
                  onBlur={() => flush("venueName", { venueName }, ["venueName"])}
                />
              )}
            </Field>
            <Field id="address" label="Address" error={fieldErrors.address}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="text"
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    saveDebounced("address", { address: event.target.value }, ["address"]);
                  }}
                  onBlur={() => flush("address", { address }, ["address"])}
                />
              )}
            </Field>
          </div>
        )}

        <Field id="hosts" label="Hosts" hint="Optional" error={fieldErrors.hosts}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="text"
              value={hosts}
              onChange={(event) => {
                setHosts(event.target.value);
                saveDebounced("hosts", { hosts: event.target.value }, ["hosts"]);
              }}
              onBlur={() => flush("hosts", { hosts }, ["hosts"])}
            />
          )}
        </Field>

        <Field
          id="babyName"
          label="Baby's name"
          hint="Optional, if you're sharing it"
          error={fieldErrors.babyName}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              type="text"
              value={babyName}
              onChange={(event) => {
                setBabyName(event.target.value);
                saveDebounced("babyName", { babyName: event.target.value }, ["babyName"]);
              }}
              onBlur={() => flush("babyName", { babyName }, ["babyName"])}
            />
          )}
        </Field>

        {visibleMissing.has("visibility") && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label-md text-app-text">
              Who can see this site?
              <span aria-hidden="true" className="text-app-danger">
                {" "}
                *
              </span>
            </legend>
            <div className="flex flex-wrap gap-4">
              {(["public", "private"] as const).map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 items-center gap-2 text-body-md text-app-text"
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={option}
                    checked={visibility === option}
                    onChange={() => {
                      setVisibility(option);
                      saveImmediate({ visibility: option }, ["visibility"]);
                    }}
                    className="h-4 w-4 accent-app-action"
                  />
                  {option === "public" ? "Public" : "Private"}
                </label>
              ))}
            </div>
            {fieldErrors.visibility && (
              <InlineStatus variant="danger">{fieldErrors.visibility}</InlineStatus>
            )}
          </fieldset>
        )}

        {visibleMissing.has("rsvpDeadline") && (
          <Field
            id="rsvpDeadline"
            label="RSVP deadline"
            hint={
              rsvpLocalValue && !rsvpDeadlineEdited
                ? "We picked this for you — adjust it if you'd like."
                : undefined
            }
            error={fieldErrors.rsvpDeadline}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="datetime-local"
                value={rsvpLocalValue}
                onChange={(event) => {
                  const iso = localInputValueToIso(event.target.value, timezone);
                  setRsvpDeadlineIso(iso);
                  setRsvpDeadlineEdited(true);
                  saveImmediate({ rsvpDeadline: iso }, ["rsvpDeadline"]);
                }}
              />
            )}
          </Field>
        )}

        {nothingLeft && (
          <p className="text-body-sm text-app-text-tertiary">
            That&apos;s everything we need for now — hosts and baby&apos;s name above are optional
            whenever you&apos;re ready.
          </p>
        )}
      </div>

      <SaveSummary status={fieldStatus} />
    </section>
  );
}

function SaveSummary({ status }: { status: Record<string, SaveState> }) {
  const values = Object.values(status);
  if (values.length === 0) return null;
  if (values.some((s) => s === "error")) {
    return (
      <InlineStatus variant="danger">
        Couldn&apos;t save one of your changes — retry by editing the field again.
      </InlineStatus>
    );
  }
  if (values.some((s) => s === "saving")) {
    return (
      <InlineStatus variant="info" live>
        Saving…
      </InlineStatus>
    );
  }
  return <InlineStatus variant="success">Saved</InlineStatus>;
}
