import { describe, expect, it } from "vitest";

import { CARD_LAYOUT_IDS, CARD_LAYOUTS, panelFor } from "./layouts";
import { canvasOf } from "./shapes";
import { bandEvenness, chooseSlide, EVEN_SHARE, fadeBand, maxSlide, SLIDE_STEPS } from "./slide";

/** A 5:7 artwork, 500 × 700 pixels (half a pixel per card unit), painted per card unit. */
const W = 500;
const H = 700;
function image(at: (x: number, y: number) => [number, number, number]): Uint8Array {
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const [r, g, b] = at(x * 2 + 1, y * 2 + 1);
      const i = (y * W + x) * 3;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
  return px;
}
const SKY: [number, number, number] = [150, 200, 240];
const RED: [number, number, number] = [200, 40, 40];

describe("the slide (card_compiler_v6)", () => {
  it("tries no slide, then 5%, 10% and 15% of the card's height", () => {
    expect(SLIDE_STEPS).toEqual([0, 0.05, 0.1, 0.15]);
    expect(maxSlide("rectangle")).toBe(210);
    expect(maxSlide("square")).toBe(150);
  });

  it("finds the fade on the picture's side of the panel, and none for a wash", () => {
    // art-top: words below, the paper fades upward from the panel's top.
    const top = panelFor("art-top", "rectangle");
    expect(fadeBand(top)).toEqual({ top: top.y - 180, bottom: top.y, picture: "above" });
    // art-bottom: words above, the paper fades downward from the panel's end.
    const bottom = panelFor("art-bottom", "rectangle");
    expect(fadeBand(bottom)).toEqual({
      top: bottom.y + bottom.height,
      bottom: bottom.y + bottom.height + 180,
      picture: "below",
    });
    expect(fadeBand(panelFor("framed", "rectangle"))).toBeNull();
  });

  it("does not slide when the fade already lies over even background", () => {
    const art = image(() => SKY);
    expect(chooseSlide(art, W, H, "rectangle", panelFor("art-top", "rectangle"))).toBe(0);
    expect(chooseSlide(art, W, H, "rectangle", panelFor("art-bottom", "rectangle"))).toBe(0);
  });

  it("slides a picture above the words up, just far enough to clear its subject", () => {
    const panel = panelFor("art-top", "rectangle");
    const band = fadeBand(panel)!;
    // A subject reaching 100 units into the fade, over sky.
    const reach = band.top + 100;
    const art = image((x, y) => (y < reach && x > 300 && x < 700 ? RED : SKY));
    expect(bandEvenness(art, W, H, "rectangle", band, 0)).toBeLessThan(EVEN_SHARE);
    // 70 units (5%) is not enough; 140 (10%) clears it.
    expect(chooseSlide(art, W, H, "rectangle", panel)).toBe(-140);
  });

  it("slides a picture below the words down", () => {
    const panel = panelFor("art-bottom", "rectangle");
    const band = fadeBand(panel)!;
    // A subject rising 50 units into the fade from below.
    const top = band.bottom - 50;
    const art = image((x, y) => (y > top && x > 300 && x < 700 ? RED : SKY));
    expect(chooseSlide(art, W, H, "rectangle", panel)).toBe(70);
  });

  it("keeps the slide that leaves the least subject under the fade when none clears it", () => {
    const panel = panelFor("art-top", "rectangle");
    const band = fadeBand(panel)!;
    // A tall subject crossing the whole fade even after the largest slide.
    const art = image((x, y) => (y < band.bottom + 300 && x > 450 && x < 550 ? RED : SKY));
    const offset = chooseSlide(art, W, H, "rectangle", panel);
    expect(offset).toBeLessThanOrEqual(0);
    expect(Math.abs(offset)).toBeLessThanOrEqual(maxSlide("rectangle"));
  });

  it("does not slide busy art where no slide helps", () => {
    const panel = panelFor("art-top", "rectangle");
    const checker = image((x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? RED : SKY));
    expect(chooseSlide(checker, W, H, "rectangle", panel)).toBe(0);
  });

  it("uncovers only what the panel's opaque paper hides, at the largest slide, on every layout", () => {
    for (const layout of CARD_LAYOUT_IDS) {
      for (const shape of CARD_LAYOUTS[layout].shapes) {
        const panel = panelFor(layout, shape);
        const band = fadeBand(panel);
        if (!band) continue;
        const { height } = canvasOf(shape);
        const label = `${layout}/${shape}`;
        if (band.picture === "above") {
          // Slid up: the strip [height - max, height] must lie under the paper.
          expect(panel.y, label).toBeLessThanOrEqual(height - maxSlide(shape));
          expect(panel.y + panel.height, label).toBe(height);
        } else {
          // Slid down: the strip [0, max] must lie under the paper.
          expect(panel.y, label).toBe(0);
          expect(panel.height, label).toBeGreaterThanOrEqual(maxSlide(shape));
        }
      }
    }
  });
});
