import { describe, expect, it } from "vitest";

import { CardTextLayoutError, generatedTextLayer } from "./card-text.server";
import { pairingFaces } from "./layout-card";
import { guestCardContent } from "./facts";
import { CARD_LAYOUT_IDS, layoutSupportsShape, zoneFor } from "./layouts";
import { CARD_SHAPES } from "./shapes";
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
    // Worst-case content fits every zone (the layout fixtures); text past the entry limits need not.
    const attempt = generatedTextLayer({
      layout: "art-top",
      shape: "square",
      pairing: "hc_playfair_dmsans",
      content: { ...WORST, invitationLine: Array(8).fill(WORST.invitationLine).join(" ") },
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

  it("lays out a guest's card with no facts saved in every layout and shape: only the wording shows", async () => {
    const content = guestCardContent({
      wording: { title: "Oh Baby", invitationLine: "Please join us for a baby shower" },
      event: {
        babyName: null,
        hosts: null,
        eventDate: null,
        startTime: null,
        endTime: null,
        venueName: null,
        address: null,
        rsvpDeadline: null,
        timezone: null,
      },
    });
    for (const layout of CARD_LAYOUT_IDS) {
      for (const shape of CARD_SHAPES.filter((s) => layoutSupportsShape(layout, s))) {
        const boxes = await generatedTextLayer({
          layout,
          shape,
          pairing: "hc_playfair_dmsans",
          content,
          ink: INK,
        });
        const shown = boxes.filter((b) => b.lines.length > 0).map((b) => b.lines.join(" "));
        expect(shown, `${layout}/${shape}`).toEqual([
          "Oh Baby",
          "Please join us for a baby shower",
        ]);
      }
    }
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

  it("starts the words where the artwork's stored shift puts them (card_compiler_v7)", async () => {
    const base = {
      layout: "cover-top",
      shape: "rectangle",
      pairing: "hc_playfair_dmsans",
      content: TYPICAL,
      ink: INK,
    } as const;
    const plain = await generatedTextLayer(base);
    const shifted = await generatedTextLayer({ ...base, shift: { heading: 20, details: 60 } });
    for (const [i, box] of plain.entries()) {
      const dy = box.id === "title" || box.id === "invitationLine" ? 20 : 60;
      expect(shifted[i], box.id).toEqual({ ...box, y: Math.round((box.y + dy) * 1000) / 1000 });
    }
    // No shift, or a zero one, is the layout's own position.
    expect(await generatedTextLayer({ ...base, shift: { heading: 0, details: 0 } })).toEqual(plain);
  });

  it("keeps words at the layout's position when they have outgrown the stored shift", async () => {
    // The rectangle's text-safe top is 80 and the cover-top zone starts at 150: a shift of -100
    // fits a short heading alone, centred well below the zone's top, but not words that fill the
    // zone — the facts the host entered after generation.
    const SHORT = { title: "Oh Baby", invitationLine: "Please join us for a baby shower" };
    const base = {
      layout: "cover-top",
      shape: "rectangle",
      pairing: "hc_playfair_dmsans",
      ink: INK,
      shift: { heading: -100, details: -100 },
    } as const;
    const short = await generatedTextLayer({ ...base, content: SHORT });
    const shortPlain = await generatedTextLayer({ ...base, content: SHORT, shift: undefined });
    expect(short[0].y).toBeCloseTo(shortPlain[0].y - 100, 3);
    const worst = await generatedTextLayer({ ...base, content: WORST });
    const worstPlain = await generatedTextLayer({ ...base, content: WORST, shift: undefined });
    expect(worst).toEqual(worstPlain);
  });
});
