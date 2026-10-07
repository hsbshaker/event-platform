/**
 * The sealed envelope as an SVG, for a private event's link-preview image (`spec.md §11.10`,
 * §14.2; `docs/design-system.md §10.20`, §15.7; `docs/card-system.md §6.2`).
 *
 * A static drawing of the house envelope (`src/components/app/Envelope.tsx`, `EnvelopeFace`, the
 * Revision 5 Lantern look) in app-token colours (`house-style.ts`): the dusk field, the light pool
 * under the envelope, the lit inside, the pocket and the flap in lit paper with the flap's shadow
 * line, the brand seal at the flap's point (`BrandSeal`: an amber circle, its soft shadow and an
 * ink "R" in the app font at 700), and the event title in the app font at 500, wrapped and clamped
 * to three lines as the live envelope sets it. It is drawn at the live envelope's own size — the
 * portrait width, `--width-narrow` × 0.64, 10:7 — and scaled into the image, so its proportions
 * and the title's and seal's sizes relative to it are the ones guests see.
 *
 * It takes only the title. Nothing from the card — no artwork, colour, font, shape, text or
 * proportion — is an input, so nothing of the card can reach a private event's preview.
 */

import type { AppFont, AppTextStyle } from "./app-font.server";
import { ENVELOPE_PREVIEW_WIDTH, PREVIEW_SIZE } from "./geometry";
import { HOUSE } from "./house-style";

/** The live sealed envelope (portrait), px. */
const W = HOUSE.widthNarrow * 0.64;
const H = (W * 7) / 10;
/** `EnvelopeFace`: the flap's point (and the seal's centre), its shadow line, the pocket's notch. */
const FLAP = 0.4;
const FLAP_SHADOW = 0.42;
const NOTCH = 0.38;
/** `.envelope-pool`: as wide as the envelope, 4:1, centred on its bottom edge. */
const POOL_HEIGHT = W / 4;
const MAX_TITLE_LINES = 3;
const ELLIPSIS = "…";

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function n(value: number): string {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

const hex = (rgb: readonly number[]) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

function polygon(points: [number, number][], fill: string): string {
  return `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fill}"/>`;
}

/**
 * `--app-surface-lit-gradient` over a box `width` × `height` at `top`: CSS's
 * `radial-gradient(rx% ry% at 50% 0%, …)` is an ellipse of those radii centred at the box's top
 * middle, so the SVG gradient is a circle of radius `rx · width` squeezed vertically.
 */
function litGradient(id: string, top: number, width: number, height: number): string {
  const { rx, ry, stops } = HOUSE.litGradient;
  const r = rx * width;
  const cx = width / 2;
  const sy = (ry * height) / r;
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(top)}" ` +
    `r="${n(r)}" gradientTransform="translate(0 ${n(top)}) scale(1 ${n(sy)}) translate(0 ${n(-top)})">` +
    stops.map((s) => `<stop offset="${s.at}" stop-color="${s.color}"/>`).join("") +
    `</radialGradient>`
  );
}

/** Split a word that is wider than the line into pieces that fit (`overflow-wrap: break-word`). */
function breakWord(word: string, fits: (s: string) => boolean): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const { segment } of graphemes.segment(word)) {
    if (current && !fits(current + segment)) {
      pieces.push(current);
      current = segment;
    } else {
      current += segment;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * CSS's collapsible white space under `white-space: normal` (spaces, tabs and segment breaks). A
 * no-break space is not among them: it stays, and joins the words either side of it.
 */
const COLLAPSIBLE = /[ \t\n\r]+/g;
const trimCollapsible = (s: string) => s.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");

/**
 * The title's lines as the live envelope sets them: white space collapsed, greedy wrapping at
 * spaces, a word wider than the line broken (`break-words`), and at most three lines, the last one
 * ended with an ellipsis when more text follows (`line-clamp-3`).
 */
export function envelopeTitleLines(
  title: string,
  measure: (text: string) => number,
  width: number,
): string[] {
  const fits = (s: string) => measure(s) <= width;
  const words = trimCollapsible(title.replace(COLLAPSIBLE, " ")).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    const pieces = fits(word) ? [word] : breakWord(word, fits);
    lines.push(...pieces.slice(0, -1));
    current = pieces[pieces.length - 1] ?? "";
  }
  if (current) lines.push(current);
  if (lines.length <= MAX_TITLE_LINES) return lines;
  let last = lines[MAX_TITLE_LINES - 1];
  const chars = [...graphemes.segment(last)].map((s) => s.segment);
  while (chars.length > 0 && !fits(`${trimCollapsible(chars.join(""))}${ELLIPSIS}`)) chars.pop();
  last = `${trimCollapsible(chars.join(""))}${ELLIPSIS}`;
  return [...lines.slice(0, MAX_TITLE_LINES - 1), last];
}

/** The title's type: `--type-heading-md` with `--tracking-heading-md`. */
export const ENVELOPE_TITLE_STYLE: AppTextStyle = {
  size: HOUSE.headingMd.size,
  letterSpacingEm: HOUSE.headingMd.trackingEm,
};

/** The seal's "R": `--type-heading-lg` with `--tracking-heading-lg`, set bold. */
export const SEAL_LETTER_STYLE: AppTextStyle = {
  size: HOUSE.headingLg.size,
  letterSpacingEm: HOUSE.headingLg.trackingEm,
};

/** The app font at the two weights the envelope is drawn with (`loadAppFont`). */
export interface EnvelopeFonts {
  /** `HOUSE.headingMd.weight`: the title. */
  title: AppFont;
  /** `HOUSE.seal.weight`: the seal's "R". */
  seal: AppFont;
}

/** One line of text centred in a box `lineHeight` tall whose top is `top`, as CSS sets it. */
function baselineIn(font: AppFont, style: AppTextStyle, lineHeight: number, top: number): number {
  const { ascent, descent } = font.verticalMetrics(style.size);
  return top + (lineHeight - (ascent + descent)) / 2 + ascent;
}

/**
 * The sealed envelope with `title`, as an SVG the size of the preview image (1200 × 630), on its
 * dusk field.
 */
export function envelopePreviewSvg(title: string, fonts: EnvelopeFonts): string {
  if (fonts.title.weight !== HOUSE.headingMd.weight) {
    throw new Error(`The envelope title is set at weight ${HOUSE.headingMd.weight}`);
  }
  if (fonts.seal.weight !== HOUSE.seal.weight) {
    throw new Error(`The seal's letter is set at weight ${HOUSE.seal.weight}`);
  }
  const scale = ENVELOPE_PREVIEW_WIDTH / W;
  const left = (PREVIEW_SIZE.width - W * scale) / 2;
  const top = (PREVIEW_SIZE.height - H * scale) / 2;

  // The title: `px-4`, from `--space-8` under the flap's point to `--space-4` above the bottom.
  const style = ENVELOPE_TITLE_STYLE;
  const titleLeft = HOUSE.space4;
  const titleWidth = W - HOUSE.space4 * 2;
  const lines = envelopeTitleLines(title, (s) => fonts.title.measure(s, style), titleWidth);
  const lineHeight = HOUSE.headingMd.lineHeight;
  const areaTop = H * FLAP + HOUSE.space8;
  const areaBottom = H - HOUSE.space4;
  const blockTop = (areaTop + areaBottom) / 2 - (lines.length * lineHeight) / 2;
  const titleSvg = lines
    .map((text, i) => {
      const run = fonts.title.line(text, style);
      const dx = titleLeft + Math.max(0, (titleWidth - run.width) / 2);
      const dy = baselineIn(fonts.title, style, lineHeight, blockTop + i * lineHeight);
      return `<path data-envelope-title-line="${i}" transform="translate(${n(dx)} ${n(dy)})" d="${run.path}"/>`;
    })
    .join("");

  // The seal: a circle at the flap's point, its soft shadow, and the "R" centred in it.
  const sealR = HOUSE.seal.diameter / 2;
  const sealY = H * FLAP;
  const shadow = HOUSE.shadowSoft;
  const sigma = shadow.blur / 2;
  const reach = Math.ceil(sigma * 3) + 1;
  const letter = fonts.seal.line("R", SEAL_LETTER_STYLE);
  const letterX = W / 2 - letter.width / 2;
  const letterY = baselineIn(
    fonts.seal,
    SEAL_LETTER_STYLE,
    HOUSE.headingLg.lineHeight,
    sealY - HOUSE.headingLg.lineHeight / 2,
  );

  const pool = HOUSE.duskPool;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PREVIEW_SIZE.width} ${PREVIEW_SIZE.height}" ` +
    `width="${PREVIEW_SIZE.width}" height="${PREVIEW_SIZE.height}" data-envelope-preview="">` +
    `<defs>` +
    `<radialGradient id="envelope-pool"><stop offset="0" stop-color="${hex(pool.rgb)}" ` +
    `stop-opacity="${pool.opacity}"/><stop offset="1" stop-color="${hex(pool.rgb)}" stop-opacity="0"/>` +
    `</radialGradient>` +
    litGradient("envelope-paper", 0, W, H) +
    litGradient("envelope-flap", 0, W, H * FLAP) +
    `<filter id="seal-shadow" filterUnits="userSpaceOnUse" x="${n(W / 2 - sealR - reach)}" ` +
    `y="${n(sealY - sealR - reach)}" width="${n(sealR * 2 + reach * 2)}" ` +
    `height="${n(sealR * 2 + shadow.y + reach * 2)}" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur stdDeviation="${n(sigma)}"/></filter>` +
    `<clipPath id="envelope-paper-clip"><rect width="${n(W)}" height="${n(H)}" rx="${HOUSE.radiusSm}"/></clipPath>` +
    `</defs>` +
    `<rect width="${PREVIEW_SIZE.width}" height="${PREVIEW_SIZE.height}" fill="${HOUSE.dusk}" data-envelope-field=""/>` +
    `<g transform="translate(${n(left)} ${n(top)}) scale(${n(scale)})">` +
    `<ellipse data-envelope-pool="" cx="${n(W / 2)}" cy="${n(H)}" rx="${n(W / 2)}" ` +
    `ry="${n(POOL_HEIGHT / 2)}" fill="url(#envelope-pool)"/>` +
    `<g clip-path="url(#envelope-paper-clip)">` +
    `<rect width="${n(W)}" height="${n(H)}" fill="${HOUSE.lit}"/>` +
    polygon(
      [
        [0, 0],
        [W / 2, H * NOTCH],
        [W, 0],
        [W, H],
        [0, H],
      ],
      "url(#envelope-paper)",
    ) +
    polygon(
      [
        [0, 0],
        [W, 0],
        [W / 2, H * FLAP_SHADOW],
      ],
      HOUSE.lit,
    ) +
    polygon(
      [
        [0, 0],
        [W, 0],
        [W / 2, H * FLAP],
      ],
      "url(#envelope-flap)",
    ) +
    `</g>` +
    `<g data-envelope-seal="">` +
    `<circle cx="${n(W / 2)}" cy="${n(sealY + shadow.y)}" r="${n(sealR)}" fill="${shadow.color}" ` +
    `fill-opacity="${shadow.opacity}" filter="url(#seal-shadow)"/>` +
    `<circle cx="${n(W / 2)}" cy="${n(sealY)}" r="${n(sealR)}" fill="${HOUSE.action}"/>` +
    `<path fill="${HOUSE.actionText}" transform="translate(${n(letterX)} ${n(letterY)})" d="${letter.path}"/>` +
    `</g>` +
    `<g data-envelope-title="" fill="${HOUSE.text}">${titleSvg}</g>` +
    `</g></svg>`
  );
}
