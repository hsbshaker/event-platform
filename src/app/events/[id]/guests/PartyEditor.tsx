"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { AppButton } from "@/components/app/AppButton";
import { Field } from "@/components/app/Field";
import { InlineStatus } from "@/components/app/InlineStatus";
import { Input } from "@/components/app/Input";
import { deriveDisplayName } from "@/lib/guests/display-name";
import type { GuestPartyView } from "@/lib/guests/guests.server";
import {
  EMAIL_HINT,
  NO_PHONE_HINT,
  validatePartyDraft,
  type GuestType,
  type PartyDraft,
  type PartyFieldErrors,
} from "@/lib/guests/party";
import { formatPhone } from "@/lib/guests/phone";

/**
 * The party editor (`docs/screen-spec.md` `guests-workspace`; `spec.md §12.2`, §12.3), drawn in
 * the shared `Sheet`: the party's named guests — the first is the main contact and an adult, each
 * other one an adult or a child — whether they may bring a plus-one, the name on the invitation
 * (blank uses the one their names make), a US or Canadian mobile number or **No phone
 * available**, and an optional email.
 *
 * A save needs a phone or the No phone available box (`spec.md §31` — RSVP: "Manual add requires
 * phone or explicit no-phone acknowledgement"); checking the box clears and disables the phone.
 * The browser checks first for inline errors; the server checks again. `Delete` asks once more,
 * inline.
 */

export type SaveOutcome =
  { ok: true } | { ok: false; error: string; fieldErrors?: PartyFieldErrors };

interface Row {
  key: string;
  id?: string;
  name: string;
  type: GuestType;
}

let nextKey = 0;
function rowKey(): string {
  nextKey += 1;
  return `guest-${nextKey}`;
}

const CHECKBOX_LABEL = "flex min-h-11 items-center gap-2 text-body-md text-app-text";
const CHECKBOX = "h-4 w-4 shrink-0 accent-app-action";

export function PartyEditor({
  party,
  onSave,
  onDelete,
}: {
  /** The party to edit, or null to add one. */
  party: GuestPartyView | null;
  onSave: (draft: PartyDraft) => Promise<SaveOutcome>;
  /** Deletes the party being edited; the sheet closes on success. */
  onDelete: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    party
      ? party.people.map((p) => ({ key: rowKey(), id: p.id, name: p.name, type: p.type }))
      : [{ key: rowKey(), name: "", type: "adult" }],
  );
  const [plusOne, setPlusOne] = useState(party?.plusOneAllowed ?? false);
  const [displayName, setDisplayName] = useState(party?.customDisplayName ?? "");
  const [phone, setPhone] = useState(party?.phone ? formatPhone(party.phone) : "");
  const [noPhone, setNoPhone] = useState(party?.noPhoneAvailable ?? false);
  const [email, setEmail] = useState(party?.email ?? "");
  const [errors, setErrors] = useState<PartyFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const focusNext = useRef<string | null>(null);

  // Moves focus once the render that drew the element has committed.
  useEffect(() => {
    if (!focusNext.current) return;
    const el = document.getElementById(focusNext.current);
    if (el) {
      el.focus();
      focusNext.current = null;
    }
  });

  function focusSoon(id: string) {
    focusNext.current = id;
  }

  // The sheet opens on the main contact's name: after the sheet has shown itself, which moves
  // focus into it.
  const firstNameId = `${rows[0].key}-name`;
  useEffect(() => {
    const timer = setTimeout(() => document.getElementById(firstNameId)?.focus(), 0);
    return () => clearTimeout(timer);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const derived = deriveDisplayName(
    rows.map((r, i) => ({ name: r.name, type: i === 0 ? "adult" : r.type })),
  );

  function draft(): PartyDraft {
    return {
      displayName,
      people: rows.map((r, i) => ({
        ...(r.id ? { id: r.id } : {}),
        name: r.name,
        type: i === 0 ? "adult" : r.type,
      })),
      phone: noPhone ? "" : phone,
      noPhoneAvailable: noPhone,
      email,
      plusOneAllowed: plusOne,
    };
  }

  /** Focuses the first field with an error, in the order they are drawn. */
  function focusFirstError(next: PartyFieldErrors) {
    const nameIndex = next.names
      ? Math.min(...Object.keys(next.names).map(Number))
      : Number.POSITIVE_INFINITY;
    if (Number.isFinite(nameIndex) && rows[nameIndex]) focusSoon(`${rows[nameIndex].key}-name`);
    else if (next.displayName) focusSoon("party-display-name");
    else if (next.phone) focusSoon("party-phone");
    else if (next.email) focusSoon("party-email");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const value = draft();
    const checked = validatePartyDraft(value);
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError("Check the highlighted fields.");
      focusFirstError(checked.errors);
      return;
    }
    setErrors({});
    setPending("save");
    try {
      const result = await onSave(value);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        if (result.fieldErrors) focusFirstError(result.fieldErrors);
      }
    } catch {
      setFormError("Couldn't save. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (pending) return;
    setFormError(null);
    setPending("delete");
    try {
      const result = await onDelete();
      if (!result.ok) setFormError(result.error);
    } catch {
      setFormError("Couldn't delete. Try again.");
    } finally {
      setPending(null);
    }
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addGuest() {
    const key = rowKey();
    setRows((all) => [...all, { key, name: "", type: "adult" }]);
    focusSoon(`${key}-name`);
  }

  function removeGuest(index: number) {
    setRows((all) => all.filter((_, i) => i !== index));
    setErrors((e) => ({ ...e, names: undefined }));
    // To the guest above (the main contact is never removed).
    focusSoon(`${rows[index - 1].key}-name`);
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => void submit(e)}
      noValidate
      data-party-editor=""
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-heading-md text-app-text">Who&apos;s in this party</legend>
        {rows.map((row, index) => {
          const label = index === 0 ? "Main contact" : `Guest ${index + 1}`;
          return (
            <div key={row.key} className="flex flex-col gap-2" data-guest-row={index}>
              <Field
                id={`${row.key}-name`}
                label={label}
                required
                hint={index === 0 ? "The main contact is an adult." : undefined}
                error={errors.names?.[index]}
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={row.name}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                    autoComplete="off"
                    maxLength={200}
                  />
                )}
              </Field>
              {index > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className={CHECKBOX_LABEL}>
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      checked={row.type === "child"}
                      onChange={(e) =>
                        update(row.key, { type: e.target.checked ? "child" : "adult" })
                      }
                    />
                    Child
                  </label>
                  <AppButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGuest(index)}
                    aria-label={`Remove ${row.name.trim() || label}`}
                  >
                    Remove
                  </AppButton>
                </div>
              )}
            </div>
          );
        })}
        {errors.people && <InlineStatus variant="danger">{errors.people}</InlineStatus>}
        <div>
          <AppButton type="button" variant="secondary" size="sm" onClick={addGuest}>
            Add a guest
          </AppButton>
        </div>
        <label className={CHECKBOX_LABEL}>
          <input
            id="party-plus-one"
            type="checkbox"
            className={CHECKBOX}
            checked={plusOne}
            onChange={(e) => setPlusOne(e.target.checked)}
          />
          Allow a plus-one
        </label>
      </fieldset>

      <Field
        id="party-display-name"
        label="Name on the invitation"
        hint={
          derived
            ? `Optional. Leave blank to use “${derived}”.`
            : "Optional. Leave blank to use the guests' names."
        }
        error={errors.displayName}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            maxLength={300}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-heading-md text-app-text">Contact</legend>
        <Field
          id="party-phone"
          label="Mobile phone"
          hint={noPhone ? undefined : "A US or Canadian mobile number."}
          error={errors.phone}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              disabled={noPhone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <label className={CHECKBOX_LABEL}>
            <input
              id="party-no-phone"
              type="checkbox"
              className={CHECKBOX}
              checked={noPhone}
              aria-describedby={noPhone ? "party-no-phone-hint" : undefined}
              onChange={(e) => {
                setNoPhone(e.target.checked);
                if (e.target.checked) {
                  setPhone("");
                  setErrors((all) => ({ ...all, phone: undefined }));
                }
              }}
            />
            No phone available
          </label>
          {noPhone && (
            <p id="party-no-phone-hint" className="text-body-sm text-app-text-secondary">
              {NO_PHONE_HINT}
            </p>
          )}
        </div>
        <Field id="party-email" label="Email (optional)" hint={EMAIL_HINT} error={errors.email}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
      </fieldset>

      {formError && <InlineStatus variant="danger">{formError}</InlineStatus>}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <AppButton
            type="submit"
            variant="primary"
            size="md"
            pending={pending === "save"}
            disabled={pending !== null}
          >
            {party ? "Save" : "Add party"}
          </AppButton>
          {party && !confirmingDelete && (
            <AppButton
              id="party-delete"
              type="button"
              variant="secondary"
              size="md"
              disabled={pending !== null}
              onClick={() => {
                setConfirmingDelete(true);
                focusSoon("party-confirm-delete");
              }}
            >
              Delete
            </AppButton>
          )}
        </div>
        {party && confirmingDelete && (
          <div className="flex flex-col gap-2" data-confirm-delete="">
            <p className="text-body-sm text-app-text">
              Delete {party.displayName}? They&apos;ll be removed from your guest list.
            </p>
            <div className="flex flex-wrap gap-2">
              <AppButton
                id="party-confirm-delete"
                type="button"
                variant="destructive"
                size="sm"
                pending={pending === "delete"}
                disabled={pending !== null}
                onClick={() => void remove()}
              >
                Delete party
              </AppButton>
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending !== null}
                onClick={() => {
                  setConfirmingDelete(false);
                  focusSoon("party-delete");
                }}
              >
                Cancel
              </AppButton>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
