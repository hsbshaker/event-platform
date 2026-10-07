/**
 * The slide (`card_compiler_v6`, owner decision 2026-10-07; `docs/card-system.md §4.2`).
 *
 * When a picture sits above or below the words and no ink clears 4.5:1 after the repaints, the
 * layout's legibility panel is drawn: paper behind the words that fades into the picture over the
 * panel's fade length (`card_layouts_v3`). That fade is right over sky, wall or ground, and wrong
 * over the subject: a host saw it wash out and cut off half a boombox. So before the fade is drawn,
 * the whole picture may slide away from the words — up when it is above them, down when it is below
 * — by up to `MAX_SLIDE_SHARE` of the card's height, so that what lies under the fade is the
 * picture's own even background. The picture keeps its full width and size; the strip at its far
 * edge leaves the card instead, whatever is there (it is not measured), and the strip the slide
 * uncovers on the words' side lies under the panel's opaque paper. When no slide clears the
 * subject, the one that leaves the least of it under the fade is kept, and none when no slide
 * helps.
 *
 * "Even" is measured, never asked of a model (`spec.md §32 #20`): the share of the pixels under the
 * fade, inside the card's outline, within `EVEN_DELTA_E` (OKLab) of their median colour. Pure and
 * deterministic over decoded pixels.
 */

import { MAX_ARTWORK_OFFSET_SHARE } from "./card-data";
import { rgbToOklch } from "./color";
import type { CardPanelShape } from "./layouts";
import { CARD_CANVAS, insideOutline, SHAPE_PROPORTION, type CardShape } from "./shapes";

/** The slides tried, as shares of the card's height, smallest first. */
export const SLIDE_STEPS: readonly number[] = [0, 0.05, 0.1, 0.15];

/** The largest slide: 15% of the card's height (owner decision, 2026-10-07), as the card checks it. */
export const MAX_SLIDE_SHARE = MAX_ARTWORK_OFFSET_SHARE;

/**
 * The fade lies over even background when at least this share of its pixels is within
 * `EVEN_DELTA_E` of their median colour (calibrated on paper grain, washes and sky gradients, which
 * pass, and on subjects crossing a band, which do not).
 */
export const EVEN_SHARE = 0.97;
export const EVEN_DELTA_E = 0.05;

/** A slide must beat no slide by at least this much evenness to be worth the strip it costs. */
const MIN_GAIN = 0.02;

/**
 * Where a panel's fade lies on the card, in card units, and on which side of the words the picture
 * is. Null for a panel that does not fade from an edge (a wash around centred words, or a
 * `card_layouts_v2` box): those never slide.
 */
export function fadeBand(
  panel: CardPanelShape,
): { top: number; bottom: number; picture: "above" | "below" } | null {
  if (!panel.fade || panel.fade.kind !== "edge") return null;
  if (panel.fade.from === "bottom") {
    // Words below: the opaque paper starts at the panel's top and fades upward into the picture.
    return { top: panel.y - panel.fade.length, bottom: panel.y, picture: "above" };
  }
  const end = panel.y + panel.height;
  return { top: end, bottom: end + panel.fade.length, picture: "below" };
}

/**
 * The share of the artwork's pixels under the card band [top, bottom) — with the artwork drawn
 * `offset` card units down (negative: up) — that lie within `EVEN_DELTA_E` of their median colour.
 * Only pixels inside the shape's outline count. 1 when the band holds no pixel.
 */
export function bandEvenness(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  shape: CardShape,
  band: { top: number; bottom: number },
  offset: number,
): number {
  const channels = pixels.length === width * height * 4 ? 4 : 3;
  const scale = width / 1000;
  const step = Math.max(1, Math.round(scale * 2));
  const labs: number[] = [];
  for (let py = Math.floor(band.top * scale); py < Math.ceil(band.bottom * scale); py += step) {
    const cardY = (py + 0.5) / scale;
    const artY = Math.floor((cardY - offset) * scale);
    if (artY < 0 || artY >= height) continue;
    for (let px = 0; px < width; px += step) {
      if (!insideOutline(shape, (px + 0.5) / scale, cardY)) continue;
      const i = (artY * width + px) * channels;
      const { l, c, h } = rgbToOklch({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
      const rad = (h * Math.PI) / 180;
      labs.push(l, c * Math.cos(rad), c * Math.sin(rad));
    }
  }
  const count = labs.length / 3;
  if (count === 0) return 1;
  const median = [0, 1, 2].map((k) => {
    const values = Array.from({ length: count }, (_, j) => labs[j * 3 + k]).sort((a, b) => a - b);
    return values[Math.floor(count / 2)];
  });
  let even = 0;
  for (let j = 0; j < count; j += 1) {
    const dl = labs[j * 3] - median[0];
    const da = labs[j * 3 + 1] - median[1];
    const db = labs[j * 3 + 2] - median[2];
    if (Math.sqrt(dl * dl + da * da + db * db) <= EVEN_DELTA_E) even += 1;
  }
  return even / count;
}

/**
 * How far to draw the artwork from its place, in card units (negative: up), so that the panel's
 * fade lies over even background: 0 when it already does or the panel does not fade from an edge;
 * else the smallest of `SLIDE_STEPS` that clears the subject; else the one leaving the least of it
 * under the fade, when that is clearly better than none.
 */
export function chooseSlide(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  shape: CardShape,
  panel: CardPanelShape,
): number {
  const band = fadeBand(panel);
  if (!band) return 0;
  const cardHeight = CARD_CANVAS[SHAPE_PROPORTION[shape]].height;
  const direction = band.picture === "above" ? -1 : 1;
  const unslid = bandEvenness(pixels, width, height, shape, band, 0);
  if (unslid >= EVEN_SHARE) return 0;
  let best = { offset: 0, evenness: unslid };
  for (const share of SLIDE_STEPS) {
    if (share === 0) continue;
    const offset = direction * Math.round(share * cardHeight);
    const evenness = bandEvenness(pixels, width, height, shape, band, offset);
    if (evenness >= EVEN_SHARE) return offset;
    if (evenness > best.evenness) best = { offset, evenness };
  }
  return best.evenness >= unslid + MIN_GAIN ? best.offset : 0;
}

/** The largest slide a shape's artwork may take, in card units. */
export function maxSlide(shape: CardShape): number {
  return Math.round(MAX_SLIDE_SHARE * CARD_CANVAS[SHAPE_PROPORTION[shape]].height);
}
