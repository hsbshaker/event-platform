import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  CARD_ENTRY_LIMITS,
  CARD_ENTRY_SLOTS,
  NARROWEST_ZONE_WIDTH,
  validateCardText,
  type CardEntrySlot,
} from "./entry";
import { breakWidth } from "./fit";
import { pairingFaces } from "./layout-card";
import { CARD_LAYOUT_IDS, CARD_LAYOUTS, CARD_SLOT_SPECS, zoneFor } from "./layouts";
import { TYPICAL, WORST } from "./test-content";
import { breakLines } from "./text/line-break";
import type { FontMetricsResolver } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";
import { TYPOGRAPHY_KEYS } from "./typography";

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

const refusal = (slot: CardEntrySlot, value: string) => {
  const check = validateCardText(slot, value);
  return check.ok ? null : check;
};

describe("validateCardText", () => {
  it("covers the host-typed card slots with the layout set's limits", () => {
    expect(CARD_ENTRY_SLOTS).toEqual(["title", "babyName", "hosts", "venue"]);
    expect(CARD_ENTRY_LIMITS).toEqual({ title: 40, babyName: 40, hosts: 60, venue: 60 });
  });

  it("accepts empty text, typical words and the worst case at the limits", () => {
    for (const slot of CARD_ENTRY_SLOTS) {
      expect(validateCardText(slot, "")).toEqual({ ok: true });
      expect(validateCardText(slot, "   ")).toEqual({ ok: true });
      expect(validateCardText(slot, WORST[slot])).toEqual({ ok: true });
      if (TYPICAL[slot]) expect(validateCardText(slot, TYPICAL[slot]!)).toEqual({ ok: true });
    }
    expect(validateCardText("hosts", "Hosted by Zoë & Renée Ångström")).toEqual({ ok: true });
  });

  it("refuses characters the card's fonts cannot draw, naming them plainly", () => {
    expect(refusal("title", "Oh Baby 🎈")).toEqual({
      ok: false,
      reason: "unsupported-characters",
      characters: ["🎈"],
      message: "The card can't show 🎈 — please remove it.",
    });
    expect(refusal("hosts", "Maya ✨ & Tom 🎈🎈")?.message).toBe(
      "The card can't show ✨ or 🎈 — please remove them.",
    );
    // A whole alphabet the curated faces lack: the first three, then the rest summarised.
    expect(refusal("babyName", "さくらちゃん")?.message).toBe(
      "The card can't show さ, く or ら and some other characters — please remove them.",
    );
    // An emoji with a skin-tone modifier is one character to the host.
    expect(refusal("venue", "Café 👍🏽")?.characters).toEqual(["👍🏽"]);
    // The curated faces cover Latin-1, not Latin Extended-A.
    expect(refusal("babyName", "Łucja")?.characters).toEqual(["Ł"]);
  });

  it("checks the details as the card sets them, in capitals", () => {
    // ÿ is in every display face; its capital Ÿ is in no body face.
    expect(validateCardText("title", "Ÿvette").ok).toBe(false);
    expect(validateCardText("title", "ÿ")).toEqual({ ok: true });
    expect(refusal("hosts", "ÿ")?.characters).toEqual(["ÿ"]);
    // ß is set as SS.
    expect(validateCardText("venue", "Straße")).toEqual({ ok: true });
  });

  it("refuses text over the slot's limit", () => {
    for (const slot of CARD_ENTRY_SLOTS) {
      const limit = CARD_ENTRY_LIMITS[slot];
      const words = "Ab ".repeat(limit).slice(0, limit + 1);
      expect(refusal(slot, words)).toEqual({
        ok: false,
        reason: "too-long",
        message: `The card has room for ${limit} characters here — please shorten this to fit.`,
      });
      expect(validateCardText(slot, words.slice(0, limit))).toEqual({ ok: true });
      // Surrounding spaces do not count.
      expect(validateCardText(slot, `  ${words.slice(0, limit)}  `)).toEqual({ ok: true });
    }
  });

  it("refuses a word too wide for one line of the narrowest zone", () => {
    expect(NARROWEST_ZONE_WIDTH).toBe(
      Math.min(
        ...CARD_LAYOUT_IDS.flatMap((l) => CARD_LAYOUTS[l].shapes.map((s) => zoneFor(l, s).width)),
      ),
    );
    expect(refusal("title", "Wolfeschlegelsteinhausenberger")).toMatchObject({
      reason: "word-too-wide",
      word: "Wolfeschlegelsteinhausenberger",
      message:
        "“Wolfeschlegelsteinhausenberger” is too long for one line of the card — please shorten it, or add a space or a hyphen.",
    });
    // Each piece between hyphens is what must fit.
    expect(validateCardText("title", "Wolfeschlegel-Steinhausenberger")).toEqual({ ok: true });
    expect(refusal("venue", "Wolfeschlegelsteinhausenbergerdorffvoralternwaren")?.reason).toBe(
      "word-too-wide",
    );
  });

  /**
   * The word check against the card itself: a piece the check accepts never overflows the
   * narrowest zone at the slot's minimum size in any pairing, as `layoutCard` measures it; and a
   * piece it refuses is refused because some face's bound exceeds the line.
   */
  it("never accepts a word the card cannot set on one line (property)", () => {
    let seed = 5;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const alphabet = "abcdefghijklmnopqrstuvwxyzWMQOéæœ";
    const room = breakWidth(NARROWEST_ZONE_WIDTH);
    let accepted = 0;
    let refused = 0;
    for (let run = 0; run < 120; run += 1) {
      const word =
        "W" +
        Array.from({ length: 10 + Math.floor(random() * 26) }, () =>
          alphabet.charAt(Math.floor(random() * alphabet.length)),
        ).join("");
      for (const slot of ["title", "hosts"] as const) {
        const ok = validateCardText(slot, word).ok;
        if (ok) accepted += 1;
        else refused += 1;
        if (!ok) continue;
        const spec = CARD_SLOT_SPECS[slot];
        const style = {
          size: spec.min,
          letterSpacingEm: spec.letterSpacingEm,
          textCase: spec.textCase,
        };
        for (const id of TYPOGRAPHY_KEYS) {
          const faces = pairingFaces(id);
          const face = metrics(slot === "title" ? faces.display : faces.body);
          const broken = breakLines(word, room, (line) => face.measure(line, style));
          expect(broken.overflow, `${slot} ${id} ${word}`).toBe(false);
        }
      }
    }
    // The run exercises both sides of the line.
    expect(accepted).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(20);
  });

  it("is isomorphic: it loads no font shaper", () => {
    const source = readFileSync(path.join(import.meta.dirname, "entry.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(
      ["./entry-glyphs.json", "./fit", "./layouts", "./slots", "./text/line-break"].sort(),
    );
  });
});
