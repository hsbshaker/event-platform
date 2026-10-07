import { describe, expect, it } from "vitest";

import { contrastRatio, parseHex, relativeLuminance, rgbToOklch } from "./color";
import {
  DARK_TAIL_PERCENTILE,
  LIGHT_TAIL_PERCENTILE,
  MIN_INK_CONTRAST,
  type PaletteColor,
  inkContrast,
  paletteFromPixels,
  percentile,
  resolveInk,
  sampleZoneLuminance,
} from "./ink";

const lum = (hex: string) => relativeLuminance(parseHex(hex));
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An RGB buffer filled by `paint(x, y)`. */
function image(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
  channels: 3 | 4 = 3,
) {
  const data = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * channels;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      if (channels === 4) data[i + 3] = 255;
    }
  }
  return data;
}

const hexRgb = (hex: string): [number, number, number] => {
  const { r, g, b } = parseHex(hex);
  return [r, g, b];
};

/** Luminances: `n` samples, a share of them at each given luminance. */
function zone(parts: [number, number][], n = 1000): number[] {
  const out: number[] = [];
  for (const [l, share] of parts) for (let i = 0; i < Math.round(share * n); i += 1) out.push(l);
  return out;
}

const CREAM = "#F3E9D2";
const BROWN = "#5A3A22";
const NAVY = "#1B2A4A";

describe("sampleZoneLuminance", () => {
  // A 100 × 140 artwork for a 1000 × 1400 card: 10 card units per pixel.
  const w = 100;
  const h = 140;
  const art = image(w, h, (x) => (x < 50 ? [0, 0, 0] : [255, 255, 255]));

  it("samples the pixels whose centres fall in the zone, sorted", () => {
    const l = sampleZoneLuminance(art, w, h, { x: 0, y: 0, width: 1000, height: 100 }, () => true);
    expect(l.length).toBe(100 * 10);
    expect(l[0]).toBe(0);
    expect(l[l.length - 1]).toBeCloseTo(1, 10);
    for (let i = 1; i < l.length; i += 1) expect(l[i]).toBeGreaterThanOrEqual(l[i - 1]);
  });

  it("maps card units onto the buffer and honours the outline", () => {
    const left = sampleZoneLuminance(
      art,
      w,
      h,
      { x: 0, y: 0, width: 400, height: 1400 },
      () => true,
    );
    expect(Math.max(...left)).toBe(0);
    const masked = sampleZoneLuminance(
      art,
      w,
      h,
      { x: 0, y: 0, width: 1000, height: 1400 },
      (x) => x > 600,
    );
    expect(Math.min(...masked)).toBeCloseTo(1, 10);
  });

  it("refuses a buffer that is neither 5:7 nor 1:1", () => {
    const wide = image(140, 100, () => [0, 0, 0]);
    const zone = { x: 0, y: 0, width: 100, height: 100 };
    expect(() => sampleZoneLuminance(wide, 140, 100, zone, () => true)).toThrow(/neither/);
    const square = image(100, 100, () => [0, 0, 0]);
    expect(sampleZoneLuminance(square, 100, 100, zone, () => true).length).toBe(100);
  });

  it("reads RGBA buffers too", () => {
    const rgba = image(w, h, (x) => (x < 50 ? [0, 0, 0] : [255, 255, 255]), 4);
    const a = sampleZoneLuminance(
      rgba,
      w,
      h,
      { x: 0, y: 0, width: 1000, height: 1400 },
      () => true,
    );
    const b = sampleZoneLuminance(art, w, h, { x: 0, y: 0, width: 1000, height: 1400 }, () => true);
    expect(a).toEqual(b);
  });

  it("refuses a buffer of the wrong length and a zone with no pixels", () => {
    expect(() =>
      sampleZoneLuminance(art.subarray(1), w, h, { x: 0, y: 0, width: 10, height: 10 }, () => true),
    ).toThrow();
    expect(() =>
      sampleZoneLuminance(art, w, h, { x: 0, y: 0, width: 1000, height: 1400 }, () => false),
    ).toThrow(/no artwork pixels/);
    expect(() =>
      sampleZoneLuminance(art, w, h, { x: 2000, y: 0, width: 100, height: 100 }, () => true),
    ).toThrow(/no artwork pixels/);
  });
});

describe("paletteFromPixels", () => {
  it("finds the colours by population, largest share first", () => {
    const art = image(100, 100, (x, y) =>
      y < 80 ? hexRgb(CREAM) : x < 60 ? hexRgb(BROWN) : hexRgb(NAVY),
    );
    const palette = paletteFromPixels(art, 100, 100);
    expect(palette.map((p) => p.color)).toEqual([CREAM, BROWN, NAVY]);
    expect(palette.map((p) => p.share)).toEqual([0.8, 0.12, 0.08]);
  });

  it("orders equal shares by colour, so ties are stable", () => {
    const art = image(10, 10, (x) => (x < 5 ? hexRgb(BROWN) : hexRgb(NAVY)));
    expect(paletteFromPixels(art, 10, 10).map((p) => p.color)).toEqual([NAVY, BROWN]);
  });

  it("keeps a small distinct accent and drops single-pixel noise", () => {
    const art = image(100, 100, (x, y) => {
      if (x === 3 && y === 3) return [255, 0, 0];
      return x < 5 ? hexRgb(BROWN) : hexRgb(CREAM);
    });
    const palette = paletteFromPixels(art, 100, 100);
    expect(palette.map((p) => p.color)).toEqual([CREAM, BROWN]);
  });

  it("is deterministic", () => {
    const r = rng(7);
    const art = image(64, 90, () => [
      Math.floor(r() * 256),
      Math.floor(r() * 256),
      Math.floor(r() * 256),
    ]);
    expect(paletteFromPixels(art, 64, 90)).toEqual(paletteFromPixels(art, 64, 90));
  });
});

describe("inkContrast — the nearest-tail rule", () => {
  it("judges an ink darker than the range against the dark tail", () => {
    expect(inkContrast(0.01, 0.3, 0.9)).toBeCloseTo(ratio(0.01, 0.3), 12);
  });
  it("judges an ink lighter than the range against the light tail", () => {
    expect(inkContrast(0.95, 0.01, 0.3)).toBeCloseTo(ratio(0.95, 0.3), 12);
  });
  it("fails an ink inside the range", () => {
    expect(inkContrast(0.5, 0.02, 0.9)).toBe(1);
  });
});

describe("the areas behind the text's lines (card_compiler_v4)", () => {
  // A 100 × 140 artwork for a 1000 × 1400 card: 10 card units per pixel. Cream paper, with a navy
  // shape 40 units tall across 40% of a 400-unit zone's width at its top: 4% of the zone, inside
  // its dark tail, but most of the area behind a title line set over it.
  const w = 100;
  const h = 140;
  const zoneRect = { x: 0, y: 800, width: 1000, height: 400 };
  const art = image(w, h, (x, y) =>
    y >= 80 && y < 84 && x >= 30 && x < 70 ? hexRgb(NAVY) : hexRgb(CREAM),
  );
  const palette: PaletteColor[] = [
    { color: CREAM, share: 0.97 },
    { color: NAVY, share: 0.03 },
  ];
  const luminances = sampleZoneLuminance(art, w, h, zoneRect, () => true);
  /** A line's area right over the navy, and one in the zone's quiet lower part. */
  const over = { x: 250, y: 800, width: 500, height: 60 };
  const quietArea = { x: 250, y: 1000, width: 500, height: 60 };
  const sample = (rect: typeof over) => sampleZoneLuminance(art, w, h, rect, () => true);

  it("passes the whole-zone measure alone", () => {
    const result = resolveInk({ luminances, palette });
    expect(result.panel).toBeNull();
    expect(result.ink).toBe(NAVY);
  });

  it("fails a line set over the intrusion, so the zone needs the panel", () => {
    const result = resolveInk({ luminances, areas: [sample(quietArea), sample(over)], palette });
    expect(result.background.darkTail).toBeCloseTo(lum(NAVY), 10);
    expect(result.background.lightTail).toBeCloseTo(lum(CREAM), 10);
    expect(result.panel).not.toBeNull();
    expect(contrastRatio(result.ink, result.panel!.color)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
  });

  it("ignores the intrusion where no line sits", () => {
    expect(resolveInk({ luminances, areas: [sample(quietArea)], palette })).toEqual(
      resolveInk({ luminances, palette }),
    );
  });

  it("keeps the whole zone as the floor: a quiet line does not clear a busy zone", () => {
    // Busy art everywhere but behind the one line: the zone alone still decides the panel.
    const busy = image(w, h, (x, y) =>
      y >= 100 && y < 106 ? hexRgb(CREAM) : (x + y) % 2 ? hexRgb(NAVY) : hexRgb(CREAM),
    );
    const l = sampleZoneLuminance(busy, w, h, zoneRect, () => true);
    const quietLine = sampleZoneLuminance(
      busy,
      w,
      h,
      { x: 250, y: 1000, width: 500, height: 60 },
      () => true,
    );
    expect(resolveInk({ luminances: l, areas: [quietLine], palette })).toEqual(
      resolveInk({ luminances: l, palette }),
    );
    expect(resolveInk({ luminances: l, areas: [], palette })).toEqual(
      resolveInk({ luminances: l, palette }),
    );
    expect(resolveInk({ luminances: l, palette }).panel).not.toBeNull();
  });
});

describe("resolveInk", () => {
  it("puts a light ink on dark art", () => {
    const palette: PaletteColor[] = [
      { color: NAVY, share: 0.7 },
      { color: CREAM, share: 0.3 },
    ];
    const result = resolveInk({ luminances: zone([[lum(NAVY), 1]]), palette });
    expect(result.panel).toBeNull();
    expect(result.ink).toBe(CREAM);
    expect(result.source).toBe("art");
    expect(contrastRatio(result.ink, NAVY)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
  });

  it("puts a dark ink on light art", () => {
    const palette: PaletteColor[] = [
      { color: CREAM, share: 0.8 },
      { color: BROWN, share: 0.2 },
    ];
    const result = resolveInk({ luminances: zone([[lum(CREAM), 1]]), palette });
    expect(result.panel).toBeNull();
    expect(result.ink).toBe(BROWN);
    expect(lum(result.ink)).toBeLessThan(lum(CREAM));
  });

  it("falls back to a neutral tuned toward the art's hue when no art colour reaches 4.5:1", () => {
    const sage = "#9DB39A";
    const palette: PaletteColor[] = [{ color: sage, share: 1 }];
    const result = resolveInk({ luminances: zone([[lum(sage), 1]]), palette });
    expect(result.panel).toBeNull();
    expect(result.source).toBe("tuned-dark");
    const ink = rgbToOklch(parseHex(result.ink));
    expect(Math.abs(ink.h - rgbToOklch(parseHex(sage)).h)).toBeLessThan(15);
    expect(result.contrast).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
  });

  it("tunes nothing toward a hue the art does not have", () => {
    const grey = "#9A9A9A";
    const result = resolveInk({
      luminances: zone([[lum(grey), 1]]),
      palette: [{ color: grey, share: 1 }],
    });
    const { r, g, b } = parseHex(result.ink);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("puts a panel behind a zone split between dark and light art", () => {
    const palette: PaletteColor[] = [
      { color: NAVY, share: 0.5 },
      { color: CREAM, share: 0.5 },
    ];
    const result = resolveInk({
      luminances: zone([
        [lum(NAVY), 0.5],
        [lum(CREAM), 0.5],
      ]),
      palette,
    });
    expect(result.panel).not.toBeNull();
    expect(contrastRatio(result.ink, result.panel!.color)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    expect(result.contrast).toBeCloseTo(contrastRatio(result.ink, result.panel!.color), 10);
    // The paper is derived from the art's lightest colour: light, and close to its hue.
    expect(lum(result.panel!.color)).toBeGreaterThan(0.85);
  });

  // The Phase 3 bug (docs/model-evals/phase-3-validation.md, "Ink and legibility"): choosing the
  // tail by comparing the ink with the median let a cream ink pass over a cream background.
  describe("regression: a cream ink is never returned over a cream zone", () => {
    it("when most of the zone is darker, so the median is dark", () => {
      const luminances = zone([
        [lum(BROWN), 0.55],
        [lum(CREAM), 0.45],
      ]);
      // The median is the brown; judged against it the cream would clear 4.5:1 — the old bug.
      const sorted = [...luminances].sort((a, b) => a - b);
      expect(ratio(lum(CREAM), percentile(sorted, 50))).toBeGreaterThan(MIN_INK_CONTRAST);
      const palette: PaletteColor[] = [
        { color: CREAM, share: 0.45 },
        { color: BROWN, share: 0.55 },
      ];
      const result = resolveInk({ luminances, palette });
      expect(result.ink).not.toBe(CREAM);
      expect(result.panel).not.toBeNull();
    });

    it("when the zone is cream throughout", () => {
      const result = resolveInk({
        luminances: zone([[lum(CREAM), 1]]),
        palette: [{ color: CREAM, share: 1 }],
      });
      expect(result.ink).not.toBe(CREAM);
      expect(result.panel).toBeNull();
      expect(contrastRatio(result.ink, CREAM)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    });

    it("when a little cream sits in a light-but-darker zone", () => {
      // Cream ink slightly lighter than most of the zone, but inside its 8–92% range.
      const result = resolveInk({
        luminances: zone([
          [0.6, 0.85],
          [lum(CREAM), 0.15],
        ]),
        palette: [{ color: CREAM, share: 1 }],
      });
      expect(result.ink).not.toBe(CREAM);
    });
  });

  it("every returned ink clears 4.5:1 against both tails it is judged by (property)", () => {
    const r = rng(42);
    const pick = () => {
      const c = () => Math.floor(r() * 256);
      return `#${[c(), c(), c()].map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
    };
    let panels = 0;
    for (let run = 0; run < 400; run += 1) {
      const clusters = 1 + Math.floor(r() * 3);
      const parts: [number, number][] = [];
      for (let k = 0; k < clusters; k += 1) parts.push([r(), 1 / clusters]);
      const luminances = zone(parts, 300).map((l) =>
        Math.min(1, Math.max(0, l + (r() - 0.5) * 0.05)),
      );
      const palette = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({
        color: pick(),
        share: 1 / (i + 2),
      }));
      const result = resolveInk({ luminances, palette });
      const sorted = [...luminances].sort((a, b) => a - b);
      const dark = percentile(sorted, DARK_TAIL_PERCENTILE);
      const light = percentile(sorted, LIGHT_TAIL_PERCENTILE);
      expect(result.background).toEqual({ darkTail: dark, lightTail: light });
      const inkL = lum(result.ink);
      if (result.panel === null) {
        expect(ratio(inkL, dark)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
        expect(ratio(inkL, light)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
        expect(inkL <= dark || inkL >= light).toBe(true);
      } else {
        panels += 1;
        expect(contrastRatio(result.ink, result.panel.color)).toBeGreaterThanOrEqual(
          MIN_INK_CONTRAST,
        );
      }
    }
    expect(panels).toBeGreaterThan(0);
  });

  it("judges an ink against every area's tails, never more leniently than the zone (property)", () => {
    const r = rng(1009);
    const pick = () => {
      const c = () => Math.floor(r() * 256);
      return `#${[c(), c(), c()].map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
    };
    const tailsOf = (sample: number[]) => {
      const sorted = [...sample].sort((a, b) => a - b);
      return {
        dark: percentile(sorted, DARK_TAIL_PERCENTILE),
        light: percentile(sorted, LIGHT_TAIL_PERCENTILE),
      };
    };
    let panels = 0;
    for (let run = 0; run < 300; run += 1) {
      const base = r();
      const noisy = (parts: [number, number][], n: number) =>
        zone(parts, n).map((l) => Math.min(1, Math.max(0, l + (r() - 0.5) * 0.04)));
      // The zone: mostly quiet paper, sometimes with something else in a corner.
      const luminances = noisy(
        [
          [base, 0.9],
          [r() < 0.5 ? r() : base, 0.1],
        ],
        600,
      );
      // The lines' areas: some carry an intrusion of another luminance.
      const areas = Array.from({ length: 1 + Math.floor(r() * 6) }, () =>
        noisy(
          [
            [base, 0.75],
            [r() < 0.4 ? r() : base, 0.25],
          ],
          120,
        ),
      );
      const palette = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({
        color: pick(),
        share: 1 / (i + 2),
      }));
      const alone = resolveInk({ luminances, palette });
      const result = resolveInk({ luminances, areas, palette });
      // Areas never narrow the measured range.
      expect(result.background.darkTail).toBeLessThanOrEqual(alone.background.darkTail);
      expect(result.background.lightTail).toBeGreaterThanOrEqual(alone.background.lightTail);
      if (result.panel === null) {
        const inkL = lum(result.ink);
        for (const sample of [luminances, ...areas]) {
          const { dark, light } = tailsOf(sample);
          expect(inkContrast(inkL, dark, light)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
        }
      } else {
        panels += 1;
        // The zone alone needing a panel means the areas do too: the zone is the floor.
        expect(contrastRatio(result.ink, result.panel.color)).toBeGreaterThanOrEqual(
          MIN_INK_CONTRAST,
        );
      }
      if (alone.panel !== null) expect(result.panel).not.toBeNull();
    }
    expect(panels).toBeGreaterThan(0);
  });

  it("is deterministic and refuses an empty or invalid measurement", () => {
    const input = {
      luminances: zone([
        [0.2, 0.5],
        [0.7, 0.5],
      ]),
      palette: [{ color: CREAM, share: 1 }],
    };
    expect(resolveInk(input)).toEqual(resolveInk(input));
    expect(() => resolveInk({ luminances: [], palette: [] })).toThrow();
    expect(() => resolveInk({ luminances: [1.5], palette: [] })).toThrow();
  });

  it("works from real pixels end to end", () => {
    // Cream paper with a dark subject in the top half; the art-top text zone is the quiet bottom.
    const w = 100;
    const h = 140;
    const art = image(w, h, (x, y) => (y < 60 && x > 30 && x < 70 ? hexRgb(BROWN) : hexRgb(CREAM)));
    const palette = paletteFromPixels(art, w, h);
    const luminances = sampleZoneLuminance(
      art,
      w,
      h,
      { x: 120, y: 800, width: 760, height: 450 },
      () => true,
    );
    const result = resolveInk({ luminances, palette });
    expect(result.panel).toBeNull();
    expect(result.ink).toBe(BROWN);
  });
});
