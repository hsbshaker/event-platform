"use client";

import { useEffect, useRef, useState } from "react";

import {
  copyPersonalLink,
  deleteParty,
  importGuests,
  rotatePersonalLink,
  saveParty,
  type GuestListActionResult,
  type ImportActionResult,
  type PartyRefInput,
  type PersonalLinkActionResult,
  type SavePartyActionResult,
  type SavePartyInput,
} from "@/app/actions/guests";
import { AppButton } from "@/components/app/AppButton";
import { chipClasses } from "@/components/app/Chip";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import { InlineStatus } from "@/components/app/InlineStatus";
import { Input } from "@/components/app/Input";
import { Sheet } from "@/components/app/Sheet";
import { cx } from "@/components/app/cx";
import type { GuestList, GuestPartyView } from "@/lib/guests/guests.server";
import {
  CONTACT_LABEL,
  INVITATION_LABEL,
  RSVP_LABEL,
  contactState,
  membersSummary,
} from "@/lib/guests/party";

import { ImportPanel } from "./ImportPanel";
import { PartyEditor } from "./PartyEditor";

/**
 * The guest workspace (`docs/screen-spec.md` `guests-workspace`; `docs/design-system.md §4.9`;
 * `spec.md §7.13`, §12, §19.1): the one creation task allowed to leave the invitation, full
 * screen, for the owner and co-hosts. `Close` returns to Creation Mode.
 *
 * A summary (parties · guests · how many need a phone), `Add party` and `Import CSV` (each in the
 * shared `Sheet`), and one row per party: its name on the invitation, who is in it, its contact
 * state (Ready · Needs phone · No phone available), its RSVP (Awaiting · Attending · Declined) and
 * its invitation (Not sent · Sent · Delivery failed · Opted out). Opening a party edits it (fix the
 * phone, mark No phone available, Save, Delete). A `Needs phone` filter appears while any party
 * needs one. Once the invitation is published each row also has `Copy personal link` and `Rotate
 * link` (which asks first: the old link stops working, `spec.md §12.5`); before that a row says
 * nothing about links.
 *
 * On a phone the rows stack as touch-friendly items; from `lg` the width is used as a table-like
 * grid. No sample or fake guests: an empty list says so plainly. App tokens and shared components
 * only.
 */

export interface GuestActions {
  save: (input: SavePartyInput) => Promise<SavePartyActionResult>;
  remove: (input: PartyRefInput) => Promise<GuestListActionResult>;
  importFile: (form: FormData) => Promise<ImportActionResult>;
  copyLink: (input: PartyRefInput) => Promise<PersonalLinkActionResult>;
  rotateLink: (input: PartyRefInput) => Promise<PersonalLinkActionResult>;
}

export const GUEST_ACTIONS: GuestActions = {
  save: saveParty,
  remove: deleteParty,
  importFile: importGuests,
  copyLink: copyPersonalLink,
  rotateLink: rotatePersonalLink,
};

type Panel = { kind: "party"; partyId: string | null } | { kind: "import" } | null;

type LinkState =
  | { kind: "confirm" }
  | { kind: "copied" }
  | { kind: "rotated" }
  | { kind: "manual"; link: string; note: string }
  | { kind: "error"; message: string };

const COUNT = new Intl.NumberFormat("en-US");
/**
 * The desktop grid: every track sized from the list's width alone, so the header and each row
 * (separate grids) line up. The personal-link column exists once published.
 */
const GRID = {
  draft:
    "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-4",
  published:
    "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_18rem] lg:items-center lg:gap-4",
} as const;

function plural(n: number, one: string, many: string): string {
  return `${COUNT.format(n)} ${n === 1 ? one : many}`;
}

/** "12 parties · 31 guests · 3 need a phone" */
export function summaryLine(parties: readonly GuestPartyView[]): string {
  const people = parties.reduce((sum, p) => sum + p.people.length, 0);
  const needPhone = parties.filter((p) => contactState(p) === "needs_phone").length;
  const parts = [plural(parties.length, "party", "parties"), plural(people, "guest", "guests")];
  if (needPhone > 0)
    parts.push(`${COUNT.format(needPhone)} ${needPhone === 1 ? "needs" : "need"} a phone`);
  return parts.join(" · ");
}

function withoutKey<T>(all: Record<string, T>, key: string): Record<string, T> {
  const next = { ...all };
  delete next[key];
  return next;
}

function rowId(partyId: string): string {
  return `party-${partyId}`;
}

function byName(a: GuestPartyView, b: GuestPartyView): number {
  return a.displayName.localeCompare(b.displayName, "en-US", { sensitivity: "base" });
}

export function GuestsWorkspace({
  eventId,
  initial,
  closeHref,
  actions = GUEST_ACTIONS,
}: {
  eventId: string;
  initial: GuestList;
  /** Creation Mode, where `Close` goes. */
  closeHref: string;
  /** The workspace's actions; the development fixture injects stubs. */
  actions?: GuestActions;
}) {
  const [list, setList] = useState(initial);
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState<"all" | "needs_phone">("all");
  const [announcement, setAnnouncement] = useState("");
  const [links, setLinks] = useState<Record<string, LinkState>>({});
  const [linkPending, setLinkPending] = useState<string | null>(null);
  const focusNext = useRef<string | null>(null);
  const opener = useRef<string | null>(null);

  // Moves focus once the render that drew the element (and closed any sheet) has committed.
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

  const parties = [...list.parties].sort(byName);
  const needPhone = parties.filter((p) => contactState(p) === "needs_phone");
  const showing = filter === "needs_phone" && needPhone.length > 0 ? needPhone : parties;
  const editing =
    panel?.kind === "party" && panel.partyId
      ? (list.parties.find((p) => p.id === panel.partyId) ?? null)
      : null;

  function open(next: Panel, from: string) {
    opener.current = from;
    setPanel(next);
  }

  function close() {
    setPanel(null);
    if (opener.current) focusSoon(opener.current);
  }

  function announce(line: string) {
    // A repeated line is still said.
    setAnnouncement("");
    setTimeout(() => setAnnouncement(line), 50);
  }

  async function save(draft: SavePartyInput["draft"]) {
    const partyId = panel?.kind === "party" ? panel.partyId : null;
    const result = await actions.save({ eventId, partyId, draft });
    if (!result.ok)
      return { ok: false as const, error: result.error, fieldErrors: result.fieldErrors };
    setList(result.list);
    const saved = result.list.parties.find((p) => p.id === result.partyId);
    // A party that no longer needs a phone leaves the filter: show everyone.
    if (saved && contactState(saved) !== "needs_phone") setFilter("all");
    setPanel(null);
    focusSoon(rowId(result.partyId));
    announce(`${partyId ? "Saved" : "Added"} ${saved?.displayName ?? "the party"}.`);
    return { ok: true as const };
  }

  async function remove() {
    if (panel?.kind !== "party" || !panel.partyId) return { ok: false as const, error: "" };
    const party = list.parties.find((p) => p.id === panel.partyId);
    const result = await actions.remove({ eventId, partyId: panel.partyId });
    if (!result.ok) return { ok: false as const, error: result.error };
    setList(result.list);
    setPanel(null);
    focusSoon("guests-heading");
    announce(`Deleted ${party?.displayName ?? "the party"}.`);
    return { ok: true as const };
  }

  async function copy(party: GuestPartyView, rotated = false) {
    setLinkPending(`copy:${party.id}`);
    try {
      const result = await actions.copyLink({ eventId, partyId: party.id });
      if (!result.ok) {
        setLinks((all) => ({ ...all, [party.id]: { kind: "error", message: result.error } }));
        return;
      }
      await write(party, `${window.location.origin}${result.path}`, rotated);
    } catch {
      setLinks((all) => ({
        ...all,
        [party.id]: { kind: "error", message: "Couldn't get the link. Try again." },
      }));
    } finally {
      setLinkPending(null);
    }
  }

  async function write(party: GuestPartyView, link: string, rotated: boolean) {
    try {
      await navigator.clipboard.writeText(link);
      setLinks((all) => ({ ...all, [party.id]: { kind: rotated ? "rotated" : "copied" } }));
      announce(
        rotated
          ? `New personal link for ${party.displayName} copied. The old link no longer works.`
          : `Personal link for ${party.displayName} copied.`,
      );
    } catch {
      setLinks((all) => ({
        ...all,
        [party.id]: {
          kind: "manual",
          link,
          note: rotated
            ? "New link made; the old one no longer works. Couldn't copy it: select it to copy it yourself."
            : "Couldn't copy. Select the link to copy it yourself.",
        },
      }));
      focusSoon(`link-${party.id}`);
    }
  }

  async function rotate(party: GuestPartyView) {
    setLinkPending(`rotate:${party.id}`);
    try {
      const result = await actions.rotateLink({ eventId, partyId: party.id });
      if (!result.ok) {
        setLinks((all) => ({ ...all, [party.id]: { kind: "error", message: result.error } }));
        focusSoon(`rotate-${party.id}`);
        return;
      }
      focusSoon(`copy-${party.id}`);
      await write(party, `${window.location.origin}${result.path}`, true);
    } catch {
      setLinks((all) => ({
        ...all,
        [party.id]: { kind: "error", message: "Couldn't make a new link. Try again." },
      }));
      focusSoon(`rotate-${party.id}`);
    } finally {
      setLinkPending(null);
    }
  }

  const people = list.parties.reduce((sum, p) => sum + p.people.length, 0);
  const grid = list.published ? GRID.published : GRID.draft;

  return (
    <div className="flex flex-1 flex-col" data-guests-workspace="">
      <header className="border-b border-app-border bg-app-surface">
        <div className="mx-auto flex w-full max-w-(--width-wide) items-center gap-3 px-4 py-3">
          <AppButtonLink href={closeHref} variant="secondary" size="sm" data-guests-close="">
            Close
          </AppButtonLink>
          <h1
            id="guests-heading"
            tabIndex={-1}
            className="text-heading-lg text-app-text outline-none"
          >
            Guests
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col gap-6 px-4 py-6 lg:py-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-body-md text-app-text" data-guests-summary="">
            {summaryLine(list.parties)}
          </p>
          <div className="flex flex-wrap gap-2">
            <AppButton
              id="guests-add"
              variant="primary"
              size="md"
              aria-haspopup="dialog"
              onClick={() => open({ kind: "party", partyId: null }, "guests-add")}
            >
              Add party
            </AppButton>
            <AppButton
              id="guests-import"
              variant="secondary"
              size="md"
              aria-haspopup="dialog"
              onClick={() => open({ kind: "import" }, "guests-import")}
            >
              Import CSV
            </AppButton>
          </div>
        </div>

        {needPhone.length > 0 && (
          <div
            role="group"
            aria-label="Show"
            className="flex flex-wrap gap-2"
            data-guests-filter=""
          >
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={chipClasses(filter === "all")}
            >
              All parties
            </button>
            <button
              type="button"
              aria-pressed={filter === "needs_phone"}
              data-filter="needs-phone"
              onClick={() => setFilter("needs_phone")}
              className={chipClasses(filter === "needs_phone")}
            >
              Needs phone ({COUNT.format(needPhone.length)})
            </button>
          </div>
        )}

        <p aria-live="polite" className="sr-only" data-guests-announcement="">
          {announcement}
        </p>

        {parties.length === 0 ? (
          <p className="max-w-prose text-body-md text-app-text-secondary" data-guests-empty="">
            No guests yet. Add the people you&apos;re inviting one party at a time, or import a CSV
            of your guest list.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div
              aria-hidden="true"
              className={cx(
                // The rows' border, transparent, so the columns line up to the pixel.
                "hidden border border-transparent px-4 text-label-sm text-app-text-secondary",
                grid,
              )}
            >
              <span>Party</span>
              <span>Contact</span>
              <span>RSVP</span>
              <span>Invitation</span>
              {list.published && <span className="text-right">Personal link</span>}
            </div>
            <ul className="flex flex-col gap-2" data-guests-list="">
              {showing.map((party) => {
                const contact = contactState(party);
                const link = links[party.id];
                return (
                  <li
                    key={party.id}
                    data-party={party.id}
                    data-contact={contact}
                    className={cx(
                      "flex flex-col gap-3 rounded-lg border border-app-border bg-app-surface px-4 py-3",
                      grid,
                    )}
                  >
                    <button
                      id={rowId(party.id)}
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => open({ kind: "party", partyId: party.id }, rowId(party.id))}
                      className="flex min-h-11 min-w-0 flex-col items-start gap-0.5 rounded-md text-left hover:underline"
                    >
                      <span className="text-label-md break-words text-app-text" data-party-name="">
                        {party.displayName}
                      </span>
                      <span className="text-body-sm text-app-text-secondary">
                        {membersSummary(party)}
                      </span>
                    </button>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm lg:contents">
                      <div className="flex gap-1.5">
                        <dt className="text-app-text-secondary lg:sr-only">Contact</dt>
                        <dd
                          data-contact-state=""
                          className={
                            contact === "needs_phone" ? "text-app-warning" : "text-app-text"
                          }
                        >
                          {CONTACT_LABEL[contact]}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-app-text-secondary lg:sr-only">RSVP</dt>
                        <dd className="text-app-text" data-rsvp-state="">
                          {RSVP_LABEL[party.rsvpStatus]}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-app-text-secondary lg:sr-only">Invitation</dt>
                        <dd className="text-app-text" data-invitation-state="">
                          {INVITATION_LABEL[party.invitationStatus]}
                        </dd>
                      </div>
                    </dl>
                    {list.published && (
                      <div className="flex flex-col gap-2 lg:items-end" data-party-link="">
                        {link?.kind === "confirm" ? (
                          <div className="flex flex-col gap-2 lg:items-end" data-confirm-rotate="">
                            <p className="text-body-sm text-app-text">
                              The old link will stop working.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <AppButton
                                id={`confirm-rotate-${party.id}`}
                                variant="destructive"
                                size="sm"
                                pending={linkPending === `rotate:${party.id}`}
                                disabled={linkPending !== null}
                                onClick={() => void rotate(party)}
                              >
                                Make a new link
                              </AppButton>
                              <AppButton
                                variant="ghost"
                                size="sm"
                                disabled={linkPending !== null}
                                onClick={() => {
                                  setLinks((all) => withoutKey(all, party.id));
                                  focusSoon(`rotate-${party.id}`);
                                }}
                              >
                                Cancel
                              </AppButton>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <AppButton
                              id={`copy-${party.id}`}
                              variant="secondary"
                              size="sm"
                              pending={linkPending === `copy:${party.id}`}
                              disabled={linkPending !== null}
                              aria-label={`Copy personal link for ${party.displayName}`}
                              onClick={() => void copy(party)}
                            >
                              Copy personal link
                            </AppButton>
                            <AppButton
                              id={`rotate-${party.id}`}
                              variant="ghost"
                              size="sm"
                              disabled={linkPending !== null}
                              aria-label={`Rotate personal link for ${party.displayName}`}
                              onClick={() => {
                                setLinks((all) => ({ ...all, [party.id]: { kind: "confirm" } }));
                                focusSoon(`confirm-rotate-${party.id}`);
                              }}
                            >
                              Rotate link
                            </AppButton>
                          </div>
                        )}
                        {link?.kind === "copied" && (
                          <InlineStatus variant="success">Link copied</InlineStatus>
                        )}
                        {link?.kind === "rotated" && (
                          <InlineStatus variant="success">
                            New link copied. The old one no longer works.
                          </InlineStatus>
                        )}
                        {link?.kind === "error" && (
                          <InlineStatus variant="danger">{link.message}</InlineStatus>
                        )}
                        {link?.kind === "manual" && (
                          <div className="flex w-full flex-col gap-1">
                            <Input
                              id={`link-${party.id}`}
                              readOnly
                              value={link.link}
                              aria-label={`Personal link for ${party.displayName}`}
                              onFocus={(e) => e.currentTarget.select()}
                              className="text-body-sm"
                            />
                            <p className="text-body-sm text-app-text-secondary">{link.note}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>

      <Sheet
        open={panel?.kind === "party"}
        onClose={close}
        title={panel?.kind === "party" && panel.partyId ? "Edit party" : "Add party"}
        description="A party is everyone one invitation is for: a guest, a couple or a family."
      >
        {panel?.kind === "party" && (
          <PartyEditor
            key={panel.partyId ?? "new"}
            party={editing}
            onSave={save}
            onDelete={remove}
          />
        )}
      </Sheet>
      <Sheet
        open={panel?.kind === "import"}
        onClose={close}
        title="Import CSV"
        description="Add many parties at once from a spreadsheet."
      >
        <ImportPanel
          eventId={eventId}
          current={{ parties: list.parties.length, people }}
          importFile={actions.importFile}
          onImported={(next, imported) => {
            setList(next);
            announce(`Added ${plural(imported, "party", "parties")}.`);
          }}
        />
      </Sheet>
    </div>
  );
}
