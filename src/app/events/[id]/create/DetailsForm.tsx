"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shouldApplyServerEvent } from "@/lib/events/apply-patch";
import {
  updateEventDetails,
  type EventDetailsPatch,
  type EventDraftView,
} from "@/app/actions/event-details";
import { AppButton } from "@/components/app/AppButton";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/app/Input";
import { InlineStatus } from "@/components/app/InlineStatus";
import { LOCAL_STORAGE_KEY } from "@/components/app/LandingComposer";
import { cardTextFieldError, type CardTextField } from "@/lib/events/card-text";
import { promptPrefill, type PrefillField } from "@/lib/events/prompt-prefill";

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
 * Nothing here is a publish gate (§32 #45): every field may stay empty indefinitely.
 */

const AUTOSAVE_DEBOUNCE_MS = 800;

/** `refused`: the value was not saved because the card cannot show it; the message is beside the field. */
type SaveState = "idle" | "saving" | "saved" | "error" | "refused";

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

  // What the prompt states for the fields still empty, shown pre-filled for the host to confirm.
  // Not saved until they confirm it or edit it; the date and time are only repeated as a hint.
  const [prefill] = useState(() => {
    const offered = promptPrefill(event.promptFacts, event);
    if (!visibleMissing.has("venue")) {
      delete offered.fields.venueName;
      delete offered.fields.address;
    }
    return offered;
  });
  const [unconfirmed, setUnconfirmed] = useState<ReadonlySet<PrefillField>>(
    () => new Set(Object.keys(prefill.fields) as PrefillField[]),
  );

  const [eventDate, setEventDate] = useState(event.eventDate ?? "");
  const [startTime, setStartTime] = useState(event.startTime ?? "");
  const [endTime, setEndTime] = useState(event.endTime ?? "");
  const [venueName, setVenueName] = useState(event.venueName ?? prefill.fields.venueName ?? "");
  const [address, setAddress] = useState(event.address ?? prefill.fields.address ?? "");
  const [hosts, setHosts] = useState(event.hosts ?? prefill.fields.hosts ?? "");
  const [babyName, setBabyName] = useState(event.babyName ?? prefill.fields.babyName ?? "");
  const [visibility, setVisibility] = useState<"public" | "private" | null>(event.visibility);
  const [rsvpDeadlineIso, setRsvpDeadlineIso] = useState(event.rsvpDeadline);
  const [rsvpDeadlineEdited, setRsvpDeadlineEdited] = useState(event.rsvpDeadlineEdited);
  const [timezone, setTimezone] = useState(event.timezone ?? "UTC");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldStatus, setFieldStatus] = useState<Record<string, SaveState>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Edits waiting on their debounce, so leaving the page (the card is revealed in place of this
  // form) saves them instead of dropping them.
  const pendingSaves = useRef<Record<string, EventDetailsPatch>>({});
  // Resolved once and attached to every save (not only the mount commit), so a later venue
  // change that leaves the inference confident about nothing still has a fallback available
  // (spec.md §7.4; src/lib/events/detail-patch.ts falls back to this when venue text alone
  // is not recognizable).
  const browserTimezoneRef = useRef<string | null>(null);
  /** Newest row version already reflected on screen; see applyServerEvent. */
  const appliedVersionRef = useRef<number>(event.rowVersion);

  useEffect(() => {
    const timers = debounceTimers.current;
    const pending = pendingSaves.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      const patches = Object.values(pending);
      for (const key of Object.keys(pending)) delete pending[key];
      for (const patch of patches) {
        void updateEventDetails(event.id, {
          ...patch,
          browserTimezone: browserTimezoneRef.current,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // An entry refusal has its message beside the field; only a real failure is a save error.
        keys.forEach((key) => (next[key] = result.fieldErrors?.[key] ? "refused" : "error"));
        return next;
      });
    }
  }

  function saveImmediate(patch: EventDetailsPatch, keys: string[]) {
    void commit(patch, keys);
  }

  function saveDebounced(debounceKey: string, patch: EventDetailsPatch, keys: string[]) {
    if (debounceTimers.current[debounceKey]) clearTimeout(debounceTimers.current[debounceKey]);
    pendingSaves.current[debounceKey] = patch;
    debounceTimers.current[debounceKey] = setTimeout(() => {
      delete pendingSaves.current[debounceKey];
      void commit(patch, keys);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function flush(debounceKey: string, patch: EventDetailsPatch, keys: string[]) {
    if (debounceTimers.current[debounceKey]) {
      clearTimeout(debounceTimers.current[debounceKey]);
      delete debounceTimers.current[debounceKey];
    }
    delete pendingSaves.current[debounceKey];
    void commit(patch, keys);
  }

  /**
   * A field the card shows as typed (hosts, baby's name, venue name, the address's first line):
   * checked as the host types,
   * with the same check the server action applies (`cardTextFieldError`). Text the card could not
   * show is not saved; its message sits beside the field until the text changes.
   */
  function editCardText(field: CardTextField, value: string) {
    const error = cardTextFieldError(field, value);
    if (error) {
      if (debounceTimers.current[field]) {
        clearTimeout(debounceTimers.current[field]);
        delete debounceTimers.current[field];
      }
      delete pendingSaves.current[field];
      setFieldErrors((prev) => ({ ...prev, [field]: error }));
      setFieldStatus((prev) => ({ ...prev, [field]: "refused" }));
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    saveDebounced(field, { [field]: value }, [field]);
  }

  function flushCardText(field: CardTextField, value: string) {
    if (cardTextFieldError(field, value)) return;
    flush(field, { [field]: value }, [field]);
  }

  /** The host edited the field, or confirmed it: its value is theirs now, saved the usual way. */
  function stopOffering(field: PrefillField) {
    setUnconfirmed((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  /** `Confirm` on a value from the description: saved now, with the same checks as typing it. */
  function confirmSuggestion(field: PrefillField) {
    stopOffering(field);
    if (field === "hosts" || field === "babyName") {
      const value = field === "hosts" ? hosts : babyName;
      if (cardTextFieldError(field, value)) editCardText(field, value);
      else flushCardText(field, value);
    } else {
      venuePair(field, field === "venueName" ? venueName : address, true);
    }
  }

  /**
   * The venue name and address, which depend on each other: the card shows the address's first
   * line only when there is no venue name (the same rule the server action applies). Editing
   * either re-checks both against the current values. A refused value is not saved; when the
   * edit lifts an earlier refusal on the other field, that field is saved with it, in one
   * request, so the server sees the same effective pair.
   */
  function venuePair(field: "venueName" | "address", value: string, flushNow: boolean) {
    // A value still waiting for the host's confirmation is not saved, so it is not the other
    // field's partner here.
    const venue = field === "venueName" ? value : unconfirmed.has("venueName") ? "" : venueName;
    const addr = field === "address" ? value : unconfirmed.has("address") ? "" : address;
    const venueError = cardTextFieldError("venueName", venue, { address: addr });
    const addressError = cardTextFieldError("address", addr, { venueName: venue });
    const other = field === "venueName" ? "address" : "venueName";
    const own = field === "venueName" ? venueError : addressError;
    const otherError = field === "venueName" ? addressError : venueError;

    if (debounceTimers.current.venue) {
      clearTimeout(debounceTimers.current.venue);
      delete debounceTimers.current.venue;
    }
    delete pendingSaves.current.venue;
    if (own) {
      // When both refuse, the changed field's message is the one to show.
      setFieldErrors((prev) => {
        const next = { ...prev, [field]: own };
        if (otherError) delete next[other];
        return next;
      });
      setFieldStatus((prev) => ({ ...prev, [field]: "refused" }));
      return;
    }
    const patch: EventDetailsPatch = { [field]: value };
    const keys: string[] = [field];
    const otherPending = Boolean(fieldErrors[other]) && !otherError;
    if (otherPending) {
      patch[other] = other === "venueName" ? venue : addr;
      keys.push(other);
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      if (otherPending) delete next[other];
      return next;
    });
    if (flushNow) {
      void commit(patch, keys);
    } else {
      pendingSaves.current.venue = patch;
      debounceTimers.current.venue = setTimeout(() => {
        delete debounceTimers.current.venue;
        delete pendingSaves.current.venue;
        void commit(patch, keys);
      }, AUTOSAVE_DEBOUNCE_MS);
    }
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
          publish — leave anything blank for now, and it won&apos;t hold up your invitation design.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {visibleMissing.has("eventDate") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="eventDate"
              label="Event date"
              hint={eventDate === "" ? statedHint(prefill.hints.date) : undefined}
              error={fieldErrors.eventDate}
              required
            >
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
              <Field
                id="startTime"
                label="Start time"
                hint={startTime === "" ? statedHint(prefill.hints.time) : undefined}
                error={fieldErrors.startTime}
                required
              >
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
          <Field
            id="startTime"
            label="Start time"
            hint={startTime === "" ? statedHint(prefill.hints.time) : undefined}
            error={fieldErrors.startTime}
            required
          >
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
            <div className="flex flex-col gap-2">
              <Field id="venueName" label="Venue name" error={fieldErrors.venueName}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="text"
                    value={venueName}
                    onChange={(event) => {
                      stopOffering("venueName");
                      setVenueName(event.target.value);
                      venuePair("venueName", event.target.value, false);
                    }}
                    onBlur={() => {
                      if (!unconfirmed.has("venueName")) venuePair("venueName", venueName, true);
                    }}
                  />
                )}
              </Field>
              {unconfirmed.has("venueName") && (
                <FromDescription
                  label="Venue name"
                  onConfirm={() => confirmSuggestion("venueName")}
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Field id="address" label="Address" error={fieldErrors.address}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="text"
                    value={address}
                    onChange={(event) => {
                      stopOffering("address");
                      setAddress(event.target.value);
                      venuePair("address", event.target.value, false);
                    }}
                    onBlur={() => {
                      if (!unconfirmed.has("address")) venuePair("address", address, true);
                    }}
                  />
                )}
              </Field>
              {unconfirmed.has("address") && (
                <FromDescription label="Address" onConfirm={() => confirmSuggestion("address")} />
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Field id="hosts" label="Hosts" hint="Optional" error={fieldErrors.hosts}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="text"
                value={hosts}
                onChange={(event) => {
                  stopOffering("hosts");
                  setHosts(event.target.value);
                  editCardText("hosts", event.target.value);
                }}
                onBlur={() => {
                  if (!unconfirmed.has("hosts")) flushCardText("hosts", hosts);
                }}
              />
            )}
          </Field>
          {unconfirmed.has("hosts") && (
            <FromDescription label="Hosts" onConfirm={() => confirmSuggestion("hosts")} />
          )}
        </div>

        <div className="flex flex-col gap-2">
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
                  stopOffering("babyName");
                  setBabyName(event.target.value);
                  editCardText("babyName", event.target.value);
                }}
                onBlur={() => {
                  if (!unconfirmed.has("babyName")) flushCardText("babyName", babyName);
                }}
              />
            )}
          </Field>
          {unconfirmed.has("babyName") && (
            <FromDescription label="Baby's name" onConfirm={() => confirmSuggestion("babyName")} />
          )}
        </div>

        {visibleMissing.has("visibility") && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label-md text-app-text">
              Who can see this invitation?
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

/** What the prompt said for a date or time, as written; the picker stays empty (never parsed). */
function statedHint(stated: string | null): string | undefined {
  return stated ? `You wrote \u201c${stated}\u201d` : undefined;
}

/** A value taken from the prompt, offered for the host to confirm; it is not saved until they do. */
function FromDescription({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-from-description="">
      <span className="text-body-sm text-app-text-secondary">From your description</span>
      <AppButton variant="secondary" size="sm" onClick={onConfirm} aria-label={`Confirm ${label}`}>
        Confirm
      </AppButton>
    </div>
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
  // A refused entry already has its message beside the field; nothing more to say here.
  if (values.some((s) => s === "refused")) return null;
  return <InlineStatus variant="success">Saved</InlineStatus>;
}
