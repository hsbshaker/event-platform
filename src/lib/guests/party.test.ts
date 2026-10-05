import { describe, expect, it } from "vitest";

import {
  PHONE_ERROR,
  contactState,
  customDisplayName,
  membersSummary,
  normalizeEmail,
  validatePartyDraft,
  type PartyDraft,
} from "./party";

/**
 * The party the editor sends (`spec.md §12.2`; `spec.md §31` — RSVP: "Manual add requires phone
 * or explicit no-phone acknowledgement."), checked the same way by the browser and the server.
 */

const draft = (patch: Partial<PartyDraft> = {}): PartyDraft => ({
  displayName: "",
  people: [{ name: "Ana Garcia", type: "adult" }],
  phone: "512-555-0123",
  noPhoneAvailable: false,
  email: "",
  plusOneAllowed: false,
  ...patch,
});

describe("validatePartyDraft", () => {
  it("normalizes a party with a phone", () => {
    expect(
      validatePartyDraft(
        draft({
          people: [
            { name: " Ana  Garcia", type: "adult" },
            { id: "0B0B8F52-56A2-4B0F-8C4E-7D1D9CF6A9E2", name: "Luis Garcia", type: "adult" },
            { id: "not-an-id", name: "Mia Garcia", type: "child" },
          ],
          email: " Ana@Example.COM ",
          plusOneAllowed: true,
        }),
      ),
    ).toEqual({
      ok: true,
      party: {
        displayName: "The Garcia family",
        people: [
          { id: null, name: "Ana Garcia", type: "adult" },
          { id: "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2", name: "Luis Garcia", type: "adult" },
          { id: null, name: "Mia Garcia", type: "child" },
        ],
        phone: "+15125550123",
        noPhoneAvailable: false,
        email: "ana@example.com",
        plusOneAllowed: true,
      },
    });
  });

  it("requires a phone or No phone available, and the override clears the phone", () => {
    expect(validatePartyDraft(draft({ phone: "" }))).toEqual({
      ok: false,
      errors: { phone: PHONE_ERROR },
    });
    expect(validatePartyDraft(draft({ phone: "555-0123" }))).toMatchObject({ ok: false });
    expect(
      validatePartyDraft(draft({ phone: "512 555 0123", noPhoneAvailable: true })),
    ).toMatchObject({ ok: true, party: { phone: null, noPhoneAvailable: true } });
  });

  it("keeps the host's name on the invitation, trimmed", () => {
    expect(validatePartyDraft(draft({ displayName: "  The Garcias " }))).toMatchObject({
      ok: true,
      party: { displayName: "The Garcias" },
    });
  });

  it("names every problem: blank or long names, a child as main contact, an email, no guests", () => {
    expect(
      validatePartyDraft(
        draft({
          people: [
            { name: "Mia", type: "child" },
            { name: "  ", type: "adult" },
            { name: "x".repeat(81), type: "adult" },
          ],
          email: "nope",
          displayName: "y".repeat(121),
        }),
      ),
    ).toEqual({
      ok: false,
      errors: {
        names: {
          0: "The main contact is an adult.",
          1: "Enter a name.",
          2: "Keep names to 80 characters.",
        },
        email: "Enter an email address, or leave it blank.",
        displayName: "Keep the name on the invitation to 120 characters.",
      },
    });
    expect(validatePartyDraft(draft({ people: [] }))).toMatchObject({
      ok: false,
      errors: { people: "Add at least one guest." },
    });
  });
});

describe("contact state, summaries and email", () => {
  it("derives Ready, Needs phone and No phone available", () => {
    expect(contactState({ phone: "+15125550123", noPhoneAvailable: false })).toBe("ready");
    expect(contactState({ phone: null, noPhoneAvailable: false })).toBe("needs_phone");
    expect(contactState({ phone: null, noPhoneAvailable: true })).toBe("no_phone");
  });

  it("summarizes who is in a party", () => {
    const adult = { type: "adult" as const };
    const child = { type: "child" as const };
    expect(membersSummary({ people: [adult], plusOneAllowed: false })).toBe("1 adult");
    expect(membersSummary({ people: [adult, adult, child], plusOneAllowed: true })).toBe(
      "2 adults, 1 child · plus-one",
    );
    expect(membersSummary({ people: [adult, child, child], plusOneAllowed: false })).toBe(
      "1 adult, 2 children",
    );
  });

  it("normalizes an email, or says it is none or not one", () => {
    expect(normalizeEmail("  A@B.co ")).toBe("a@b.co");
    expect(normalizeEmail("  ")).toBeNull();
    expect(normalizeEmail("a@")).toBe(false);
    expect(normalizeEmail(`${"a".repeat(250)}@b.co`)).toBe(false);
  });

  it("leaves the editor's name blank when the stored one follows the guests", () => {
    const people = [
      { name: "Ana Garcia", type: "adult" as const },
      { name: "Luis Garcia", type: "adult" as const },
    ];
    expect(customDisplayName({ displayName: "Ana & Luis Garcia", people })).toBe("");
    expect(customDisplayName({ displayName: "The Garcias", people })).toBe("The Garcias");
  });
});
