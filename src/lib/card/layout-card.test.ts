import { beforeAll, describe, expect, it } from "vitest";

import type { CardRect } from "./ink";
import {
  type CardTextLayout,
  type LayoutCardInput,
  layoutCard,
  layoutCardFits,
  pairingFaces,
} from "./layout-card";
import { CARD_LAYOUT_IDS, CARD_SLOT_SPECS, layoutSupportsShape, zoneFor } from "./layouts";
import { CARD_SHAPES, type CardProportion, proportionOf } from "./shapes";
import { formatCardDate, formatCardRsvpBy, formatCardTime } from "./facts";
import { CARD_SLOT_IDS } from "./slots";
import { LIMITS, TYPICAL, WORST } from "./test-content";
import { type CardContent, FIT_SAFETY } from "./text-box";
import type { FontMetricsResolver } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";
import { TYPOGRAPHY_KEYS } from "./typography";

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

/** The art-top zones of the layout set: rectangle 5:7 and square 1:1. */
const ART_TOP: Record<CardProportion, CardRect> = {
  "5:7": zoneFor("art-top", "rectangle"),
  "1:1": zoneFor("art-top", "square"),
};

const INK = "#3A2A1E";

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** Stored lines back to running text: a line ending after a hyphen between letters joins on. */
const rejoin = (lines: readonly string[]) =>
  lines.reduce(
    (text, line, i) =>
      i === 0
        ? line
        : /[\p{L}\p{M}][-\u2010]$/u.test(text) && /^\p{L}/u.test(line)
          ? text + line
          : `${text} ${line}`,
    "",
  );

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
    // Never truncated: every word of the slot's text is on the box's lines, in order, and a word
    // is only ever split just after a hyphen.
    expect(words(rejoin(box.lines))).toEqual(words(content[slot] ?? ""));
    expect(box.color).toBe(inp.ink);
    expect(box.rotation).toBe(0);
    expect(box.x).toBe(zone.x);
    expect(box.width).toBe(zone.width);
    const face = metrics(box.font);
    const style = { size: box.size, letterSpacingEm: box.letterSpacing, textCase: box.textCase };
    for (const line of box.lines) {
      const w = face.measure(line, style) * (1 + FIT_SAFETY);
      // A line wider than the zone is only ever one over-wide piece of a word, and then it
      // overflows.
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
  it("sets typical content with body text at full size, centred in the zone, for every pairing and proportion", () => {
    for (const proportion of ["5:7", "1:1"] as const) {
      for (const id of TYPOGRAPHY_KEYS) {
        const inp = input({ proportion, pairing: pairingFaces(id) });
        const layout = layoutCard(inp);
        checkInvariants(layout, inp);
        expect(layout.overflow).toBe(false);
        expect(layout.sizes.bodyStep).toBe(0);
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
    expect(layout.boxes.map((b) => b.id)).toEqual([...CARD_SLOT_IDS]);
    expect(layout.boxes.map((b) => b.z)).toEqual(CARD_SLOT_IDS.map((_, i) => i));
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
    expect(date.letterSpacing).toBe(CARD_SLOT_SPECS.date.letterSpacingEm);
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
    const without = layoutCard({ ...inp, slots: CARD_SLOT_IDS.filter((s) => s !== "babyName") });
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

  it("keeps a hyphenated name whole at any size that allows it", () => {
    const content = { ...TYPICAL, title: "Welcome Wilhelmina Montgomery-Whitworth!" };
    for (const id of TYPOGRAPHY_KEYS) {
      const inp = input({ proportion: "5:7", pairing: pairingFaces(id), content });
      const layout = layoutCard(inp);
      checkInvariants(layout, inp);
      const title = layout.boxes.find((b) => b.id === "title")!;
      // A size exists where the name fits on a line, so it is never broken, though a larger
      // title with a hyphen break would also fit.
      expect(title.lines, id).toContain("Montgomery-Whitworth!");
      expect(layout.overflow).toBe(false);
    }
  });

  it("breaks after a hyphen when no size fits the name whole", () => {
    // 260 wide: "MAXIMILIAN-MONTGOMERY" is wider than the zone even at the details' 18.
    const inp = input({
      proportion: "5:7",
      zone: { x: 370, y: 800, width: 260, height: 400 },
      content: { babyName: "Maximilian-Montgomery" },
      slots: ["babyName"],
    });
    const layout = layoutCard(inp);
    checkInvariants(layout, inp);
    expect(layout.overflow).toBe(false);
    expect(layout.boxes[0].lines).toEqual(["Maximilian-", "Montgomery"]);
    // Full size: the hyphen break is taken at the first sizes tried, not after shrinking.
    expect(layout.boxes[0].size).toBe(CARD_SLOT_SPECS.babyName.max["5:7"]);
  });

  it("reports overflow and keeps every word when the zone is too small", () => {
    const inp = input({ proportion: "5:7", zone: { x: 400, y: 800, width: 200, height: 120 } });
    const layout = layoutCard(inp);
    expect(layout.overflow).toBe(true);
    checkInvariants(layout, inp);
    expect(layout.boxes[0].y).toBe(800);
    expect(layout.sizes).toEqual({ title: 48, bodyStep: 10 });
  });

  it("reports characters a box's face lacks, and none for ordinary text", () => {
    const plain = layoutCard(input({ proportion: "5:7" }));
    expect(plain.missingCharacters).toEqual({});
    const layout = layoutCard(
      input({ proportion: "5:7", content: { ...TYPICAL, title: "Oh Baby 🎈", venue: "Café 🌿" } }),
    );
    expect(layout.missingCharacters).toEqual({ title: ["🎈"], venue: ["🌿"] });
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

  describe("worst-case content at the entry limits", () => {
    it("uses strings exactly at the limits", () => {
      for (const [slot, text] of Object.entries(WORST)) {
        expect(text.length, slot).toBe(LIMITS[slot as keyof typeof LIMITS]);
      }
    });

    /**
     * The widest formatted date, time and RSVP-by in a pairing's body face, as the card sets them
     * (uppercase, spaced, at the details' minimum size): every date of a 28-year calendar cycle and
     * every minute of the day. `WORST` uses values that are the widest in most faces; this gives
     * each pairing its own.
     */
    const pad = (n: number) => String(n).padStart(2, "0");
    const DAYS: string[] = [];
    for (let t = Date.UTC(2028, 0, 1); t < Date.UTC(2056, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      DAYS.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    }
    const DATE_VALUES = [...new Set(DAYS.map(formatCardDate))];
    const RSVP_VALUES = [...new Set(DAYS.map((d) => d.slice(5)))].map((monthDay) =>
      formatCardRsvpBy(`2028-${monthDay}T12:00:00Z`, "UTC"),
    );
    const CLOCKS: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 1) CLOCKS.push(`${pad(h)}:${pad(m)}`);
    }
    const CLOCK_VALUES = CLOCKS.map((clock) => formatCardTime(clock));
    const widestByFace = new Map<string, Pick<CardContent, "date" | "time" | "rsvpBy">>();
    function widestFacts(
      id: (typeof TYPOGRAPHY_KEYS)[number],
    ): Pick<CardContent, "date" | "time" | "rsvpBy"> {
      const font = pairingFaces(id).body;
      const known = widestByFace.get(font.family);
      if (known) return known;
      const face = metrics(font);
      const spec = CARD_SLOT_SPECS.date;
      const style = {
        size: spec.min,
        letterSpacingEm: spec.letterSpacingEm,
        textCase: spec.textCase,
      };
      const widest = (values: readonly string[]) =>
        values
          .map((value) => ({ value, width: face.measure(value, style) }))
          .reduce((a, b) => (b.width > a.width ? b : a)).value;
      const clock = CLOCKS[CLOCK_VALUES.indexOf(widest(CLOCK_VALUES))];
      const facts = {
        date: widest(DATE_VALUES),
        time: formatCardTime(clock, clock),
        rsvpBy: widest(RSVP_VALUES),
      };
      widestByFace.set(font.family, facts);
      return facts;
    }

    /**
     * Owner decision (`docs/CHANGELOG-v7.md`, "Phase 4 — fitting every detail on every card"):
     * every card shows every detail. Worst-case content fits every layout × supported shape ×
     * pairing at the minimum sizes or above — as `WORST`, and with each pairing's own widest
     * formatted facts. The layout fixtures prove the same in Chromium (`tests/fixtures/`).
     * `CARD_FIT_REPORT=1` prints the margins.
     */
    it("fits every layout × supported shape × pairing", () => {
      const rows: string[] = [];
      const failures: string[] = [];
      for (const id of TYPOGRAPHY_KEYS) {
        const facts = widestFacts(id);
        for (const name of CARD_LAYOUT_IDS) {
          for (const shape of CARD_SHAPES.filter((sh) => layoutSupportsShape(name, sh))) {
            for (const [kind, content] of [
              ["worst", { ...WORST }],
              ["widest facts", { ...WORST, ...facts }],
            ] as const) {
              const inp = input({
                proportion: proportionOf(shape),
                zone: zoneFor(name, shape),
                pairing: pairingFaces(id),
                content,
              });
              const layout = layoutCard(inp);
              checkInvariants(layout, inp);
              const key = `${name}/${shape}/${id} (${kind})`;
              if (layout.overflow) failures.push(key);
              rows.push(
                `${key.padEnd(70)} ${layout.overflow ? "OVERFLOW" : "fits"} title ${layout.sizes.title} step ${layout.sizes.bodyStep} height ${stackHeight(layout).toFixed(0)}/${inp.zone.height}`,
              );
            }
          }
        }
      }
      if (process.env.CARD_FIT_REPORT) console.log(rows.join("\n"));
      expect(failures).toEqual([]);
    }, 60_000);
  });
});

describe("layoutCardFits", () => {
  /** A seeded generator, so the sample is the same on every run. */
  function seeded(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
  function randomWords(rand: () => number, length: number, alphabet: string): string {
    let text = "";
    while (text.length < length) {
      let word = "";
      for (let i = Math.max(1, Math.floor(rand() * 12)); i > 0; i -= 1) {
        word += alphabet[Math.floor(rand() * alphabet.length)];
      }
      text += (text ? " " : "") + word;
    }
    return text.slice(0, length).trim();
  }

  /**
   * Exactly `!layoutCard(...).overflow`, both ways, over every layout × supported shape × pairing:
   * typical and worst-case content, the entry-limit cases that overflow some designs (an all-caps
   * title, a baby name of wide letters), and random wide and narrow words.
   */
  it("agrees with layoutCard's overflow for every layout × supported shape × pairing", () => {
    const rand = seeded(20261004);
    const samples: CardContent[] = [
      TYPICAL,
      { ...WORST },
      { ...WORST, title: "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!" },
      { ...WORST, babyName: "WMWMW WMWMW WMWMW WMWMW WMWMW WMWMW WMWM" },
      {
        ...TYPICAL,
        title: randomWords(rand, 40, "WMOQDHNUmweaon"),
        hosts: randomWords(rand, 60, "WMHNmwoae"),
      },
      {
        ...TYPICAL,
        title: randomWords(rand, 36, "iljtfrIl.,"),
        venue: randomWords(rand, 60, "Wil"),
      },
    ];
    const outcomes = { fits: 0, overflows: 0 };
    const disagreements: string[] = [];
    samples.forEach((content, i) => {
      for (const name of CARD_LAYOUT_IDS) {
        for (const shape of CARD_SHAPES.filter((sh) => layoutSupportsShape(name, sh))) {
          for (const id of TYPOGRAPHY_KEYS) {
            const inp = input({
              proportion: proportionOf(shape),
              zone: zoneFor(name, shape),
              pairing: pairingFaces(id),
              content,
            });
            const fits = !layoutCard(inp).overflow;
            outcomes[fits ? "fits" : "overflows"] += 1;
            if (layoutCardFits(inp) !== fits) disagreements.push(`#${i} ${name}/${shape}/${id}`);
          }
        }
      }
    });
    expect(disagreements).toEqual([]);
    // Both directions are exercised.
    expect(outcomes.fits).toBeGreaterThan(0);
    expect(outcomes.overflows).toBeGreaterThan(0);
  }, 120_000);

  it("agrees when the zone is too small, and ignores added text stacked below the zone", () => {
    const tiny = input({ proportion: "5:7", zone: { x: 400, y: 800, width: 200, height: 120 } });
    expect(layoutCard(tiny).overflow).toBe(true);
    expect(layoutCardFits(tiny)).toBe(false);
    const added = input({
      proportion: "5:7",
      carried: {
        added: [
          {
            id: "a1",
            text: "Brunch to follow in the garden ".repeat(20).trim(),
            font: pairingFaces("hc_playfair_dmsans").body,
          },
        ],
      },
    });
    const layout = layoutCard(added);
    expect(layout.belowZone).toEqual(["a1"]);
    expect(layout.overflow).toBe(false);
    expect(layoutCardFits(added)).toBe(true);
  });

  it("validates its input as layoutCard does", () => {
    expect(() => layoutCardFits(input({ proportion: "5:7", ink: "brown" }))).toThrow();
  });
});
