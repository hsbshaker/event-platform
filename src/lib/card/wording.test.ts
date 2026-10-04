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
    expect(reasons({ ...ok, invitationLine: "Evening pm cocktails" })).toContain(
      "invitationLine contains a time expression",
    );
  });

  it("does not flag words that merely contain time letters", () => {
    expect(checkWording({ ...ok, invitationLine: "Join us for a pampering afternoon" })).toEqual(
      [],
    );
  });

  it("rejects host fact strings case-insensitively, except eventType", () => {
    const facts = { eventType: "Baby Shower", babyName: "Theo", venue: "The Lodge" };
    expect(reasons({ ...ok, title: "Welcome THEO" }, facts)).toEqual([
      "title states the fact babyName",
    ]);
    expect(reasons({ ...ok, invitationLine: "Join us at the lodge please" }, facts)).toEqual([
      "invitationLine states the fact venue",
    ]);
    expect(checkWording(ok, facts)).toEqual([]);
  });

  it("ignores empty fact values", () => {
    expect(checkWording(ok, { venue: "", hosts: null, date: undefined })).toEqual([]);
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
