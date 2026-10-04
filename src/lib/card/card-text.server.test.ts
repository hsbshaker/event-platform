import { describe, expect, it } from "vitest";

import { CardTextLayoutError, generatedTextLayer } from "./card-text.server";
import { pairingFaces } from "./layout-card";
import { zoneFor } from "./layouts";
import { CARD_SLOT_IDS } from "./slots";
import { TYPICAL, WORST } from "./test-content";

const INK = "#3A2A1E";

describe("generatedTextLayer", () => {
  it("lays the event's words out in the layout's zone, in the pairing and the zone's ink", async () => {
    const boxes = await generatedTextLayer({
      layout: "art-top",
      shape: "rectangle",
      pairing: "hc_playfair_dmsans",
      content: TYPICAL,
      ink: INK,
    });
    const zone = zoneFor("art-top", "rectangle");
    const faces = pairingFaces("hc_playfair_dmsans");
    expect(boxes.map((b) => b.id)).toEqual([...CARD_SLOT_IDS]);
    for (const box of boxes) {
      expect(box.color).toBe(INK);
      expect(box.x).toBe(zone.x);
      expect(box.width).toBe(zone.width);
      expect(box.y).toBeGreaterThanOrEqual(zone.y);
      expect(box.y + box.lines.length * box.size * box.lineHeight).toBeLessThanOrEqual(
        zone.y + zone.height + 1e-6,
      );
    }
    expect(boxes[0].font).toEqual(faces.display);
    expect(boxes[1].font).toEqual(faces.body);
    expect(boxes[0].lines.join(" ")).toBe(TYPICAL.title);
  });

  it("refuses an overflowing layout, keeping it for diagnostics only", async () => {
    const attempt = generatedTextLayer({
      layout: "art-top",
      shape: "square",
      pairing: "hc_playfair_dmsans",
      content: { ...WORST },
      ink: INK,
    });
    await expect(attempt).rejects.toBeInstanceOf(CardTextLayoutError);
    const error = (await attempt.catch((e: unknown) => e)) as CardTextLayoutError;
    expect(error.reasons).toEqual(["overflow"]);
    expect(error.layout.overflow).toBe(true);
    expect(error.message).toMatch(/art-top\/square\/hc_playfair_dmsans/);
  });

  it("refuses characters the pairing's fonts lack", async () => {
    const attempt = generatedTextLayer({
      layout: "atmosphere",
      shape: "rectangle",
      pairing: "hc_playfair_dmsans",
      content: { ...TYPICAL, title: "Oh Baby 🎈" },
      ink: INK,
    });
    const error = (await attempt.catch((e: unknown) => e)) as CardTextLayoutError;
    expect(error).toBeInstanceOf(CardTextLayoutError);
    expect(error.reasons).toEqual(["missing-characters"]);
    expect(error.message).toContain("title: 🎈");
  });

  it("refuses a shape the layout does not support and an invalid ink", async () => {
    const base = { pairing: "hc_playfair_dmsans", content: TYPICAL } as const;
    await expect(
      generatedTextLayer({ ...base, layout: "corners", shape: "circle", ink: INK }),
    ).rejects.toThrow(/does not support/);
    await expect(
      generatedTextLayer({ ...base, layout: "framed", shape: "circle", ink: "#3a2a1e" }),
    ).rejects.toThrow(/ink/);
  });
});
