import { describe, expect, it } from "vitest";

import { checkWording, standardWording } from "./wording";

const ok = { title: "A Little Bear Is Coming", invitationLine: "Please join us for a baby shower" };
const reasons = (w: { title: string; invitationLine: string }, facts = {}) =>
  checkWording(w, facts).map((f) => f.reason);

describe("checkWording", () => {
  it("passes clean wording", () => {
    expect(checkWording(ok, { eventType: "baby shower", babyName: "Theo" })).toEqual([]);
  });

  it("rejects digits", () => {
    expect(reasons({ ...ok, title: "Turning 30" })).toEqual(["title contains a digit"]);
  });

  it("rejects month names but not the verb 'may'", () => {
    expect(reasons({ ...ok, invitationLine: "Join us in September for cake" })).toEqual([
      "invitationLine names a month (september)",
    ]);
    expect(checkWording({ ...ok, invitationLine: "You may bring a friend along" })).toEqual([]);
  });

  it("rejects weekday names", () => {
    expect(reasons({ ...ok, invitationLine: "Come celebrate this Saturday" })).toEqual([
      "invitationLine names a weekday (saturday)",
    ]);
  });

  it("rejects time expressions", () => {
    for (const line of [
      "Join us at noon for lunch",
      "Doors open at midnight",
      "Come at five o'clock",
    ]) {
      expect(reasons({ ...ok, invitationLine: line }), line).toContain(
        "invitationLine contains a time expression",
      );
    }
    expect(reasons({ ...ok, invitationLine: "Brunch, early a.m. start" })).toContain(
      "invitationLine contains a time expression",
    );
    expect(reasons({ ...ok, invitationLine: "Evening p.m. cocktails" })).toContain(
      "invitationLine contains a time expression",
    );
  });

  it("does not treat the words am and pm as times", () => {
    expect(checkWording({ ...ok, invitationLine: "I am so happy you can join us" })).toEqual([]);
  });

  it("does not flag words that merely contain time letters", () => {
    expect(checkWording({ ...ok, invitationLine: "Join us for a pampering afternoon" })).toEqual(
      [],
    );
  });

  it("rejects non-name host facts case-insensitively; allows names and eventType", () => {
    const facts = { eventType: "Baby Shower", babyName: "Theo", hosts: "Maya", venue: "The Lodge" };
    expect(checkWording({ ...ok, title: "Welcome Theo" }, facts)).toEqual([]);
    expect(
      checkWording({ ...ok, invitationLine: "Maya invites you to a baby shower" }, facts),
    ).toEqual([]);
    expect(reasons({ ...ok, invitationLine: "Join us at the lodge please" }, facts)).toEqual([
      "invitationLine states the fact venue",
    ]);
    expect(checkWording(ok, facts)).toEqual([]);
  });

  it("ignores empty fact values", () => {
    expect(checkWording(ok, { venue: "", hosts: null, date: undefined })).toEqual([]);
  });

  it("checks only the listed fact keys, so the event type and a title never fail", () => {
    const facts = { eventType: "baby shower", title: "Bear Necessities", location: "Austin" };
    expect(checkWording(standardWording("baby shower"), facts)).toEqual([]);
    expect(checkWording({ ...ok, title: "Bear Necessities" }, facts)).toEqual([]);
    expect(reasons({ ...ok, invitationLine: "Come to Austin for brunch" }, facts)).toEqual([
      "invitationLine states the fact location",
    ]);
    expect(
      reasons(
        { ...ok, invitationLine: "Join us at my mum's house" },
        { venueHint: "my mum's house" },
      ),
    ).toEqual(["invitationLine states the fact venueHint"]);
  });

  it("never checks a host-supplied slot", () => {
    const hostTitle = { ...ok, title: "Theo's Saturday at The Lodge" };
    const facts = { venue: "The Lodge" };
    expect(checkWording(hostTitle, facts, { hostSupplied: ["title"] })).toEqual([]);
    expect(reasons(hostTitle, facts)).toContain("title states the fact venue");
  });

  it("names every failing slot", () => {
    const failures = checkWording({ title: "On May 5", invitationLine: "Come on Friday" });
    expect(failures.map((f) => f.slot).sort()).toEqual(["invitationLine", "title"]);
  });
});

describe("standardWording", () => {
  it("is the specified baby shower copy", () => {
    expect(standardWording("baby shower")).toEqual({
      title: "A Baby Shower",
      invitationLine: "Please join us for a baby shower",
    });
    expect(standardWording(" Baby Shower ")).toEqual(standardWording("baby shower"));
  });

  it("falls back to the baby shower copy for a blank event type", () => {
    expect(standardWording("")).toEqual(standardWording("baby shower"));
    expect(standardWording("   ")).toEqual(standardWording("baby shower"));
  });

  it("builds the same pattern from another event type", () => {
    expect(standardWording("retirement party")).toEqual({
      title: "A Retirement Party",
      invitationLine: "Please join us for a retirement party",
    });
    expect(standardWording("Engagement Party").invitationLine).toBe(
      "Please join us for an engagement party",
    );
  });

  it("passes its own fact check", () => {
    expect(checkWording(standardWording("baby shower"), { eventType: "baby shower" })).toEqual([]);
  });
});
