import { beforeAll, describe, expect, it } from "vitest";

import { CARD_ENTRY_SLOTS, validateCardText } from "./entry";
import { ENTRY_FIT_ZONES, cardTextFitsEveryDesign } from "./entry-fit.server";
import { layoutCard, pairingFaces } from "./layout-card";
import { CARD_LAYOUT_IDS, CARD_LAYOUTS, zoneFor } from "./layouts";
import { proportionOf } from "./shapes";
import { TYPICAL, WORST } from "./test-content";
import type { FontMetricsResolver } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";
import { TYPOGRAPHY_KEYS } from "./typography";

/** Within every entry limit and accepted by `validateCardText`, yet too wide for some designs. */
const CAPS_TITLE = "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!";
const WIDE_BABY_NAME = "WMWMW WMWMW WMWMW WMWMW WMWMW WMWMW WMWM";
const WIDE_VENUE = "WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWW";

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

/** The designs, layout × supported shape × pairing, where `layoutCard` overflows. */
function overflowingDesigns(slot: (typeof CARD_ENTRY_SLOTS)[number], value: string): string[] {
  const failures: string[] = [];
  for (const layout of CARD_LAYOUT_IDS) {
    for (const shape of CARD_LAYOUTS[layout].shapes) {
      for (const id of TYPOGRAPHY_KEYS) {
        const result = layoutCard({
          zone: zoneFor(layout, shape),
          proportion: proportionOf(shape),
          pairing: pairingFaces(id),
          content: { ...WORST, [slot]: value },
          ink: "#000000",
          metrics,
        });
        if (result.overflow) failures.push(`${layout}/${shape}/${id}`);
      }
    }
  }
  return failures;
}

describe("the entry fit check", () => {
  it("covers every text zone of the layout set once", () => {
    const keyOf = (z: (typeof ENTRY_FIT_ZONES)[number]) =>
      `${z.zone.x},${z.zone.y},${z.zone.width},${z.zone.height},${z.proportion}`;
    const keys = ENTRY_FIT_ZONES.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    for (const layout of CARD_LAYOUT_IDS) {
      for (const shape of CARD_LAYOUTS[layout].shapes) {
        expect(keys).toContain(
          keyOf({ zone: zoneFor(layout, shape), proportion: proportionOf(shape) }),
        );
      }
    }
  });

  it("accepts the worst-case and typical values of every entry slot", async () => {
    for (const slot of CARD_ENTRY_SLOTS) {
      expect(await cardTextFitsEveryDesign(slot, WORST[slot]), `${slot} worst`).toBe(true);
      expect(await cardTextFitsEveryDesign(slot, TYPICAL[slot] ?? ""), `${slot} typical`).toBe(
        true,
      );
    }
  }, 60_000);

  it("accepts empty text, which takes no space", async () => {
    for (const slot of CARD_ENTRY_SLOTS) {
      expect(await cardTextFitsEveryDesign(slot, "")).toBe(true);
      expect(await cardTextFitsEveryDesign(slot, "   ")).toBe(true);
      // And blank really does fit everywhere, so accepting it without measuring is exact.
      expect(overflowingDesigns(slot, ""), slot).toEqual([]);
    }
  }, 60_000);

  it("refuses text within the limits that some design cannot fit", async () => {
    for (const [slot, value] of [
      ["title", CAPS_TITLE],
      ["babyName", WIDE_BABY_NAME],
      ["venue", WIDE_VENUE],
      ["hosts", WIDE_VENUE],
    ] as const) {
      // The isomorphic entry check accepts it: only the whole-stack fit refuses it.
      expect(validateCardText(slot, value), slot).toEqual({ ok: true });
      expect(await cardTextFitsEveryDesign(slot, value), slot).toBe(false);
    }
  }, 60_000);

  it("checks beside the event's own details when given, in place of the worst case", async () => {
    // The worst-case title fits beside the worst case, but not beside a venue wider than the entry
    // check would now accept (stored before it, say).
    expect(await cardTextFitsEveryDesign("title", WORST.title)).toBe(true);
    expect(await cardTextFitsEveryDesign("title", WORST.title, { venue: WIDE_VENUE })).toBe(false);
    // Blank companions keep the worst case, and the slot's own entry is ignored.
    expect(
      await cardTextFitsEveryDesign("title", WORST.title, { venue: " ", title: CAPS_TITLE }),
    ).toBe(true);
  }, 60_000);

  it("refuses exactly when layoutCard overflows some layout × supported shape × pairing", async () => {
    expect(overflowingDesigns("title", CAPS_TITLE).length).toBeGreaterThan(0);
    expect(overflowingDesigns("babyName", WIDE_BABY_NAME)).toEqual([
      "framed/square/heritage_baskerville_inter",
      "framed/circle/heritage_baskerville_inter",
      "corners/square/heritage_baskerville_inter",
    ]);
    // Wide, at the limit, and still fits everywhere: accepted.
    const wideHosts = "Hosted by Wwwwwwwwww Wwwwwwwwww and Wwwwwwwwww Wwwwwwwwwwww";
    expect(overflowingDesigns("hosts", wideHosts)).toEqual([]);
    expect(await cardTextFitsEveryDesign("hosts", wideHosts)).toBe(true);
  }, 120_000);

  it("gives the same answer when asked again", async () => {
    for (let i = 0; i < 2; i += 1) {
      expect(await cardTextFitsEveryDesign("title", CAPS_TITLE)).toBe(false);
      expect(await cardTextFitsEveryDesign("title", WORST.title)).toBe(true);
    }
  }, 60_000);
});
