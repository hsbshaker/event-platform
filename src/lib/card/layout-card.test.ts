import { beforeAll, describe, expect, it } from "vitest";

import type { CardRect } from "./ink";
import {
  type CardTextLayout,
  type LayoutCardInput,
  SLOT_SPECS_V1,
  layoutCard,
  pairingFaces,
} from "./layout-card";
import type { CardProportion } from "./shapes";
import { type CardContent, CARD_SLOTS, FIT_SAFETY } from "./text-box";
import type { FontMetricsResolver } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";
import { TYPOGRAPHY_KEYS } from "./typography";

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

/** Phase 3's art-top zones (`scripts/phase-3/catalog.mjs`): rectangle 5:7 and square 1:1. */
const ART_TOP: Record<CardProportion, CardRect> = {
  "5:7": { x: 120, y: 800, width: 760, height: 450 },
  "1:1": { x: 120, y: 540, width: 760, height: 300 },
};

const INK = "#3A2A1E";

const TYPICAL: CardContent = {
  title: "A Little Wild One",
  invitationLine: "Please join us for a baby shower",
  hosts: "Hosted by Maya & Tom",
  date: "Saturday, June 6",
  time: "1:00 pm",
  venue: "The Willow House",
};

/** Every slot at its provisional entry limit, with wide letters (`docs/card-system.md §2.5`). */
const WORST: Required<{ [K in keyof CardContent]: string }> = {
  title: "Welcome Wilhelmina Montgomery-Whitworth!",
  invitationLine: "Please join us as we shower Maximilian with warm wishes and so much love",
  babyName: "Maximilian Augustin Montgomery-Whitworth",
  hosts: "Hosted by Wilhelmina Montgomery and Maximilian Worthingtons!",
  date: "Wednesday, September 30, 2026 (Midweek!)",
  time: "12:30 PM - 4:45 PM (MDT)",
  venue: "The Grand Ballroom at Montgomery-Whitworth Manor, Washington",
  rsvpBy: "Kindly RSVP by Wednesday, September 16th",
};
const LIMITS = {
  title: 40,
  invitationLine: 72,
  babyName: 40,
  hosts: 60,
  date: 40,
  time: 24,
  venue: 60,
  rsvpBy: 40,
};

const words = (text: string) => text.split(/\s+/).filter(Boolean);

function input(over: Partial<LayoutCardInput> & { proportion: CardProportion }): LayoutCardInput {
  return {
    zone: ART_TOP[over.proportion],
    pairing: pairingFaces("hc_playfair_dmsans"),
    content: TYPICAL,
    ink: INK,
    metrics,
    ...over,
  };
}

function stackHeight(layout: CardTextLayout): number {
  const visible = layout.boxes.filter((b) => b.lines.length > 0);
  const last = visible[visible.length - 1];
  return last.y + last.lines.length * last.size * last.lineHeight - visible[0].y;
}

/** The layout's own guarantees, checked from the outside. */
function checkInvariants(layout: CardTextLayout, inp: LayoutCardInput): void {
  const { zone, content } = inp;
  for (const box of layout.boxes) {
    const slot = box.id as keyof CardContent;
    // Never truncated: every word of the slot's text is on the box's lines, in order.
    expect(words(box.lines.join(" "))).toEqual(words(content[slot] ?? ""));
    expect(box.color).toBe(inp.ink);
    expect(box.rotation).toBe(0);
    expect(box.x).toBe(zone.x);
    expect(box.width).toBe(zone.width);
    const face = metrics(box.font);
    const style = { size: box.size, letterSpacingEm: box.letterSpacing, textCase: box.textCase };
    for (const line of box.lines) {
      const w = face.measure(line, style) * (1 + FIT_SAFETY);
      // A line wider than the zone is only ever a single over-wide word, and then it overflows.
      if (w > zone.width + 1e-6) {
        expect(line.includes(" ")).toBe(false);
        expect(layout.overflow).toBe(true);
      }
    }
  }
  if (!layout.overflow) {
    const title = layout.boxes.find((b) => b.id === "title");
    if (title) expect(title.lines.length).toBeLessThanOrEqual(3);
    for (const box of layout.boxes) {
      const height = box.lines.length * box.size * box.lineHeight;
      expect(box.y).toBeGreaterThanOrEqual(zone.y - 1e-3);
      expect(box.y + height).toBeLessThanOrEqual(zone.y + zone.height + 1e-3);
    }
  }
}

describe("layoutCard", () => {
  it("sets typical content at full size, centred in the zone, for every pairing and proportion", () => {
    for (const proportion of ["5:7", "1:1"] as const) {
      for (const id of TYPOGRAPHY_KEYS) {
        const inp = input({ proportion, pairing: pairingFaces(id) });
        const layout = layoutCard(inp);
        checkInvariants(layout, inp);
        expect(layout.overflow).toBe(false);
        const visible = layout.boxes.filter((b) => b.lines.length > 0);
        const top = visible[0].y - inp.zone.y;
        const last = visible[visible.length - 1];
        const bottom =
          inp.zone.y + inp.zone.height - (last.y + last.lines.length * last.size * last.lineHeight);
        expect(top).toBeCloseTo(bottom, 2);
      }
    }
  });

  it("stacks every slot in order, one box each, styled by its spec", () => {
    const inp = input({ proportion: "5:7" });
    const layout = layoutCard(inp);
    expect(layout.boxes.map((b) => b.id)).toEqual([...CARD_SLOTS]);
    expect(layout.boxes.map((b) => b.z)).toEqual(CARD_SLOTS.map((_, i) => i));
    const [title, line, , , date] = layout.boxes;
    expect(title.source).toEqual({ kind: "wording", slot: "title" });
    expect(title.text).toBeUndefined();
    expect(title.font).toEqual(pairingFaces("hc_playfair_dmsans").display);
    expect(title.size).toBeLessThanOrEqual(104);
    expect(title.size).toBeGreaterThan(48);
    expect(line.text).toBe(TYPICAL.invitationLine);
    expect(line.font).toEqual(pairingFaces("hc_playfair_dmsans").body);
    expect(date.source).toEqual({ kind: "fact", slot: "date" });
    expect(date.text).toBeUndefined();
    expect(date.textCase).toBe("uppercase");
    expect(date.letterSpacing).toBe(SLOT_SPECS_V1.date.letterSpacingEm);
    for (let i = 1; i < layout.boxes.length; i += 1) {
      expect(layout.boxes[i].y).toBeGreaterThanOrEqual(layout.boxes[i - 1].y);
    }
  });

  it("gives an empty slot no space but still emits its box", () => {
    const inp = input({ proportion: "5:7" });
    const layout = layoutCard(inp);
    const baby = layout.boxes.find((b) => b.id === "babyName")!;
    const hosts = layout.boxes.find((b) => b.id === "hosts")!;
    expect(baby.lines).toEqual([]);
    // The baby name sits where the hosts begin, after the gap the details group takes.
    expect(baby.y).toBeLessThanOrEqual(hosts.y);
    const without = layoutCard({ ...inp, slots: CARD_SLOTS.filter((s) => s !== "babyName") });
    expect(without.boxes.find((b) => b.id === "hosts")!.y).toBeCloseTo(hosts.y, 6);
  });

  it("steps the title down first, then the body slots together", () => {
    const longTitle = { ...TYPICAL, title: "Welcome Wilhelmina Montgomery-Whitworth!" };
    const a = layoutCard(input({ proportion: "1:1", content: longTitle }));
    expect(a.sizes.title).toBeLessThan(92);
    const b = layoutCard(input({ proportion: "1:1", content: { ...WORST } }));
    if (b.sizes.bodyStep > 0) expect(b.sizes.title).toBe(48);
    const line = b.boxes.find((x) => x.id === "invitationLine")!;
    const date = b.boxes.find((x) => x.id === "date")!;
    expect(line.size).toBe(Math.max(22, 32 - b.sizes.bodyStep));
    expect(date.size).toBe(Math.max(18, 24 - b.sizes.bodyStep));
  });

  it("reports overflow and keeps every word when the zone is too small", () => {
    const inp = input({ proportion: "5:7", zone: { x: 400, y: 800, width: 200, height: 120 } });
    const layout = layoutCard(inp);
    expect(layout.overflow).toBe(true);
    checkInvariants(layout, inp);
    expect(layout.boxes[0].y).toBe(800);
    expect(layout.sizes).toEqual({ title: 48, bodyStep: 10 });
  });

  it("is deterministic", () => {
    for (const proportion of ["5:7", "1:1"] as const) {
      const inp = input({ proportion, content: { ...WORST } });
      expect(layoutCard(inp)).toEqual(layoutCard(inp));
    }
  });

  it("refuses an invalid ink, an empty zone and duplicate slots", () => {
    expect(() => layoutCard(input({ proportion: "5:7", ink: "brown" }))).toThrow();
    expect(() =>
      layoutCard(input({ proportion: "5:7", zone: { x: 0, y: 0, width: 0, height: 10 } })),
    ).toThrow();
    expect(() => layoutCard(input({ proportion: "5:7", slots: ["title", "title"] }))).toThrow();
  });

  describe("worst-case content at the provisional entry limits", () => {
    it("uses strings exactly at the limits", () => {
      for (const [slot, text] of Object.entries(WORST)) {
        expect(text.length, slot).toBe(LIMITS[slot as keyof typeof LIMITS]);
      }
    });

    it.each(["5:7", "1:1"] as const)(
      "%s art-top: never truncates, for every pairing",
      (proportion) => {
        const rows: string[] = [];
        for (const id of TYPOGRAPHY_KEYS) {
          const inp = input({ proportion, pairing: pairingFaces(id), content: { ...WORST } });
          const layout = layoutCard(inp);
          checkInvariants(layout, inp);
          rows.push(
            `${proportion} ${id.padEnd(32)} ${layout.overflow ? "OVERFLOW" : "fits    "} title ${layout.sizes.title} body step ${layout.sizes.bodyStep} height ${stackHeight(layout).toFixed(0)}/${inp.zone.height}`,
          );
        }
        if (process.env.CARD_FIT_REPORT) console.log(rows.join("\n"));
      },
    );

    /**
     * Opt-in report (`CARD_FIT_REPORT=1`): worst-case content in every Phase 3 layout × shape zone
     * (`scripts/phase-3/catalog.mjs`, its `zoneFor` reproduced here), the widest-measuring pairing.
     * Informational: the versioned layout set and its slot limits are fixed with the catalog.
     */
    it.runIf(process.env.CARD_FIT_REPORT)(
      "report: Phase 3 layout × shape zones",
      () => {
        const margin = {
          rectangle: 80,
          "rounded-rectangle": 90,
          arch: 80,
          oval: 70,
          square: 70,
          circle: 70,
        };
        const prop = {
          rectangle: "5:7",
          "rounded-rectangle": "5:7",
          arch: "5:7",
          oval: "5:7",
          square: "1:1",
          circle: "1:1",
        } as const;
        type Shape = keyof typeof margin;
        const inside = (shape: Shape, x: number, y: number) => {
          const w = 1000;
          const h = prop[shape] === "5:7" ? 1400 : 1000;
          const m = margin[shape];
          switch (shape) {
            case "arch":
              if (x < m || x > w - m || y > h - m) return false;
              return y >= w / 2 || Math.hypot(x - w / 2, y - w / 2) <= w / 2 - m;
            case "oval":
              return ((x - w / 2) / (w / 2 - m)) ** 2 + ((y - h / 2) / (h / 2 - m)) ** 2 <= 1;
            case "circle":
              return Math.hypot(x - w / 2, y - h / 2) <= w / 2 - m;
            default:
              return x >= m && x <= w - m && y >= m && y <= h - m;
          }
        };
        const zoneFor = (shape: Shape, band: { top: number; bottom: number }, maxWidth: number) => {
          let half = maxWidth / 2;
          for (let y = band.top; y <= band.bottom; y += 4) {
            while (half > 40 && !(inside(shape, 500 - half, y) && inside(shape, 500 + half, y)))
              half -= 2;
          }
          return { x: 500 - half, y: band.top, width: half * 2, height: band.bottom - band.top };
        };
        const all: Shape[] = ["rectangle", "rounded-rectangle", "arch", "oval", "square", "circle"];
        const layouts = {
          "art-top": {
            shapes: all,
            band: { "5:7": [800, 1250], "1:1": [540, 840] },
            maxWidth: 760,
          },
          "art-bottom": {
            shapes: all,
            band: { "5:7": [150, 600], "1:1": [120, 440] },
            maxWidth: 760,
          },
          framed: { shapes: all, band: { "5:7": [400, 1000], "1:1": [280, 720] }, maxWidth: 620 },
          corners: {
            shapes: ["rectangle", "rounded-rectangle", "square"] as Shape[],
            band: { "5:7": [420, 980], "1:1": [300, 700] },
            maxWidth: 640,
          },
          atmosphere: {
            shapes: all,
            band: { "5:7": [400, 1000], "1:1": [260, 740] },
            maxWidth: 680,
          },
        };
        const rows: string[] = [];
        for (const [name, l] of Object.entries(layouts)) {
          for (const shape of l.shapes) {
            const proportion = prop[shape];
            const [top, bottom] = l.band[proportion];
            const zone = zoneFor(shape, { top, bottom }, l.maxWidth);
            let worst: { id: string; layout: CardTextLayout } | null = null;
            let fitting = 0;
            const failing: string[] = [];
            for (const id of TYPOGRAPHY_KEYS) {
              const inp = input({
                proportion,
                zone,
                pairing: pairingFaces(id),
                content: { ...WORST },
              });
              const layout = layoutCard(inp);
              checkInvariants(layout, inp);
              if (!layout.overflow) fitting += 1;
              else {
                const titleLines = layout.boxes.find((b) => b.id === "title")!.lines.length;
                const tall = stackHeight(layout) > zone.height;
                const reasons = [
                  tall ? "height" : "",
                  titleLines > 3 ? `title ${titleLines} lines` : "",
                ];
                const why = reasons.filter(Boolean).join(", ") || "a word wider than the zone";
                failing.push(`${id} (${why})`);
              }
              if (!worst || stackHeight(layout) > stackHeight(worst.layout)) worst = { id, layout };
            }
            rows.push(
              `${name.padEnd(10)} ${shape.padEnd(17)} zone ${zone.width}×${zone.height}  fits ${fitting}/12  tallest ${stackHeight(worst!.layout).toFixed(0)}  ${fitting > 6 ? failing.join(" ") : ""}`,
            );
          }
        }
        console.log(rows.join("\n"));
      },
      120_000,
    );
  });
});
