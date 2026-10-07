import { describe, expect, it } from "vitest";

import { parseHex, relativeLuminance, rgbToOklch } from "./color";
import {
  inkCandidates,
  type PaletteColor,
  paletteFromPixels,
  pixelChannels,
  pixelLuminance,
} from "./ink";

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

const CREAM = "#F3E9D2";
const BROWN = "#5A3A22";
const NAVY = "#1B2A4A";

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

describe("pixelLuminance and pixelChannels", () => {
  it("is WCAG relative luminance, tabulated", () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [255, 255, 255],
      [27, 42, 74],
      [243, 233, 210],
      [128, 64, 200],
    ]) {
      expect(pixelLuminance(r, g, b)).toBeCloseTo(relativeLuminance({ r, g, b }), 12);
    }
  });

  it("tells RGB from RGBA and refuses any other buffer", () => {
    expect(pixelChannels(new Uint8Array(12), 2, 2)).toBe(3);
    expect(pixelChannels(new Uint8Array(16), 2, 2)).toBe(4);
    expect(() => pixelChannels(new Uint8Array(15), 2, 2)).toThrow(/neither RGB nor RGBA/);
    expect(() => pixelChannels(new Uint8Array(0), 0, 2)).toThrow(/Invalid pixel buffer size/);
  });
});

describe("inkCandidates", () => {
  it("lists the art palette by share, then a tuned near-black and near-white", () => {
    const palette: PaletteColor[] = [
      { color: "#f3e9d2", share: 0.7 },
      { color: BROWN, share: 0.2 },
      { color: NAVY, share: 0.1 },
    ];
    const candidates = inkCandidates(palette);
    expect(candidates.map((c) => c.source)).toEqual([
      "art",
      "art",
      "art",
      "tuned-dark",
      "tuned-light",
    ]);
    expect(candidates.slice(0, 3).map((c) => c.ink)).toEqual([CREAM, BROWN, NAVY]);
    const dark = relativeLuminance(parseHex(candidates[3].ink));
    const light = relativeLuminance(parseHex(candidates[4].ink));
    expect(dark).toBeLessThan(0.05);
    expect(light).toBeGreaterThan(0.9);
  });

  it("tunes the neutrals toward the art's hue", () => {
    const sage = "#9DB39A";
    const [, dark] = inkCandidates([{ color: sage, share: 1 }]);
    expect(Math.abs(rgbToOklch(parseHex(dark.ink)).h - rgbToOklch(parseHex(sage)).h)).toBeLessThan(
      15,
    );
  });

  it("tunes nothing toward a hue the art does not have", () => {
    for (const c of inkCandidates([{ color: "#9A9A9A", share: 1 }]).slice(1)) {
      const { r, g, b } = parseHex(c.ink);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it("still has the neutrals for an empty palette", () => {
    expect(inkCandidates([]).map((c) => c.source)).toEqual(["tuned-dark", "tuned-light"]);
  });
});
