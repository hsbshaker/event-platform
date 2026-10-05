import type { GuestActions } from "@/app/events/[id]/guests/GuestsWorkspace";
import type { GuestList, GuestPartyView } from "@/lib/guests/guests.server";
import { planImport } from "@/lib/guests/import-plan";
import { personalLinkPath } from "@/lib/guests/link-path";
import { CSV_MAX_BYTES, MAX_PARTIES_PER_EVENT, MAX_PEOPLE_PER_EVENT } from "@/lib/guests/limits";
import { customDisplayName, validatePartyDraft } from "@/lib/guests/party";

/**
 * The development fixture's stand-ins for the guest actions (`src/app/actions/guests.ts`),
 * behaving as the server does, with no database: a save is validated by the same
 * `validatePartyDraft` (a phone or No phone available is required), an import is read by the same
 * `planImport` and stored all or nothing within the same limits, and personal links exist only once
 * published — `Copy` gives the party's current link and `Rotate` replaces it with the next of
 * `FIXTURE_LINK_TOKENS`.
 */

/** The links the stub hands out, in order: 43 base64url characters, as a real token is. */
export const FIXTURE_LINK_TOKENS = Array.from(
  { length: 40 },
  (_, i) => `fixturePartyLink${String(i + 1).padStart(27, "0")}`,
);

const wait = () => new Promise((resolve) => setTimeout(resolve, 60));

let ids = 0;
function newId(): string {
  ids += 1;
  return `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
}

/** The fixture's starting parties: ready, needs a phone, no phone available. */
export function fixtureParties(): GuestPartyView[] {
  const make = (
    displayName: string,
    people: { name: string; type: "adult" | "child" }[],
    phone: string | null,
    noPhoneAvailable = false,
    plusOneAllowed = false,
  ): GuestPartyView => {
    const members = people.map((p) => ({ id: newId(), ...p }));
    return {
      id: newId(),
      displayName,
      customDisplayName: customDisplayName({ displayName, people: members }),
      phone,
      email: null,
      noPhoneAvailable,
      plusOneAllowed,
      people: members,
      invitationStatus: "not_sent",
      rsvpStatus: "awaiting",
    };
  };
  return [
    make(
      "Ana & Luis Garcia",
      [
        { name: "Ana Garcia", type: "adult" },
        { name: "Luis Garcia", type: "adult" },
        { name: "Mia Garcia", type: "child" },
      ],
      "+15125550123",
      false,
      true,
    ),
    make("Bo Chen", [{ name: "Bo Chen", type: "adult" }], null),
    make("Grandma Rose", [{ name: "Rose Park", type: "adult" }], null, true),
  ];
}

export function fixtureGuestActions({
  initial,
  published,
}: {
  initial: GuestPartyView[];
  published: boolean;
}): { actions: GuestActions; list: () => GuestList } {
  let parties = initial;
  const tokens = new Map<string, number>();
  let issued = 0;
  const list = (): GuestList => ({ parties, published });
  const people = () => parties.reduce((sum, p) => sum + p.people.length, 0);
  const issue = (partyId: string) => {
    tokens.set(partyId, issued % FIXTURE_LINK_TOKENS.length);
    issued += 1;
  };
  for (const party of parties) issue(party.id);

  const actions: GuestActions = {
    async save({ partyId, draft }) {
      await wait();
      const checked = validatePartyDraft(draft);
      if (!checked.ok) {
        return {
          ok: false,
          reason: "invalid",
          error: "Check the highlighted fields.",
          fieldErrors: checked.errors,
        };
      }
      const { party } = checked;
      const existing = partyId ? parties.find((p) => p.id === partyId) : null;
      if (partyId && !existing) {
        return { ok: false, reason: "not_found", error: "This event isn't available." };
      }
      const members = party.people.map((p) => ({
        id: p.id ?? newId(),
        name: p.name,
        type: p.type,
      }));
      const view: GuestPartyView = {
        id: existing?.id ?? newId(),
        displayName: party.displayName,
        customDisplayName: customDisplayName({ displayName: party.displayName, people: members }),
        phone: party.phone,
        email: party.email,
        noPhoneAvailable: party.noPhoneAvailable,
        plusOneAllowed: party.plusOneAllowed,
        people: members,
        invitationStatus: existing?.invitationStatus ?? "not_sent",
        rsvpStatus: existing?.rsvpStatus ?? "awaiting",
      };
      if (existing) {
        parties = parties.map((p) => (p.id === existing.id ? view : p));
      } else {
        parties = [...parties, view];
        issue(view.id);
      }
      return { ok: true, partyId: view.id, list: list() };
    },
    async remove({ partyId }) {
      await wait();
      if (!parties.some((p) => p.id === partyId)) {
        return { ok: false, reason: "not_found", error: "This event isn't available." };
      }
      parties = parties.filter((p) => p.id !== partyId);
      return { ok: true, list: list() };
    },
    async importFile(form) {
      await wait();
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        return { ok: false, reason: "invalid_file", error: "Choose a CSV file to import." };
      }
      if (file.size > CSV_MAX_BYTES) {
        return {
          ok: false,
          reason: "invalid_file",
          error: "This file is larger than 1 MB. Split it into smaller files.",
        };
      }
      const plan = planImport(await file.text());
      if (!plan.ok) return { ok: false, reason: "invalid_file", error: plan.error };
      if (
        parties.length + plan.parties.length > MAX_PARTIES_PER_EVENT ||
        people() + plan.people > MAX_PEOPLE_PER_EVENT
      ) {
        return {
          ok: false,
          reason: "over_limit",
          error: "This import would take your guest list past the limit, so nothing was imported.",
        };
      }
      const added = plan.parties.map((p): GuestPartyView => {
        const members = p.people.map((m) => ({ id: newId(), ...m }));
        return {
          id: newId(),
          displayName: p.displayName,
          customDisplayName: customDisplayName({ displayName: p.displayName, people: members }),
          phone: p.phone,
          email: p.email,
          noPhoneAvailable: false,
          plusOneAllowed: p.plusOneAllowed,
          people: members,
          invitationStatus: "not_sent",
          rsvpStatus: "awaiting",
        };
      });
      parties = [...parties, ...added];
      for (const party of added) issue(party.id);
      return { ok: true, imported: added.length, issues: plan.issues, list: list() };
    },
    async copyLink({ partyId }) {
      await wait();
      const index = tokens.get(partyId);
      if (index === undefined) {
        return { ok: false, reason: "not_found", error: "This event isn't available." };
      }
      if (!published) {
        return {
          ok: false,
          reason: "not_published",
          error: "Personal links are available once the invitation is published.",
        };
      }
      return { ok: true, path: personalLinkPath(FIXTURE_LINK_TOKENS[index]) };
    },
    async rotateLink({ partyId }) {
      await wait();
      if (!tokens.has(partyId)) {
        return { ok: false, reason: "not_found", error: "This event isn't available." };
      }
      if (!published) {
        return {
          ok: false,
          reason: "not_published",
          error: "Personal links are available once the invitation is published.",
        };
      }
      issue(partyId);
      return { ok: true, path: personalLinkPath(FIXTURE_LINK_TOKENS[tokens.get(partyId)!]) };
    },
  };
  return { actions, list };
}
