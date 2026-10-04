/**
 * The sealed envelope as an SVG, for a private event's link-preview image (`spec.md §11.10`,
 * §14.2; `docs/design-system.md §15.7`; `docs/card-system.md §6.2`).
 *
 * A static drawing of the house envelope (`src/components/app/Envelope.tsx`, `EnvelopeFace`) in
 * app-token colours (`house-style.ts`): the body with its border and soft shadow, the front fold,
 * the flap and its edge, and the event title in the app's font, wrapped and clamped to three lines
 * as the live envelope sets it. It is drawn at the live envelope's own size — the portrait width,
 * `--width-narrow` × 0.64, 10:7 — and scaled into the image, so its proportions and the title's
 * size relative to it are the ones guests see.
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
const BORDER = 1;
/** `bottom: 1.75rem` under the title area. */
const TITLE_BOTTOM = 28;
const MAX_TITLE_LINES = 3;
const ELLIPSIS = "\u2026";

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function n(value: number): string {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

function polygon(points: [number, number][], fill: string): string {
  return `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fill}"/>`;
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

/**
 * The sealed envelope with `title`, as an SVG the size of the preview image (1200 × 630, no
 * background: the image supplies the house background). `font` is Inter at the heading weight
 * (`loadAppFont(HOUSE.headingMd.weight)`).
 */
export function envelopePreviewSvg(title: string, font: AppFont): string {
  if (font.weight !== HOUSE.headingMd.weight) {
    throw new Error(`The envelope title is set at weight ${HOUSE.headingMd.weight}`);
  }
  const scale = ENVELOPE_PREVIEW_WIDTH / W;
  const left = (PREVIEW_SIZE.width - W * scale) / 2;
  const top = (PREVIEW_SIZE.height - H * scale) / 2;

  // The padding box, inside the 1px border: the fold, flap and title are positioned in it.
  const px = BORDER;
  const py = BORDER;
  const pw = W - BORDER * 2;
  const ph = H - BORDER * 2;
  const r = HOUSE.radiusLg;
  const shadow = HOUSE.shadowSoft;
  const sigma = shadow.blur / 2;
  const reach = Math.ceil(sigma * 3) + 1;

  const style = ENVELOPE_TITLE_STYLE;
  const titleLeft = px + HOUSE.space4;
  const titleWidth = pw - HOUSE.space4 * 2;
  const lines = envelopeTitleLines(title, (s) => font.measure(s, style), titleWidth);
  const lineHeight = HOUSE.headingMd.lineHeight;
  const areaTop = py + ph * 0.58;
  const areaBottom = H - BORDER - TITLE_BOTTOM;
  const blockTop = (areaTop + areaBottom) / 2 - (lines.length * lineHeight) / 2;
  const { ascent, descent } = font.verticalMetrics(style.size);
  const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
  const titleSvg = lines
    .map((text, i) => {
      const run = font.line(text, style);
      const dx = titleLeft + Math.max(0, (titleWidth - run.width) / 2);
      const dy = blockTop + i * lineHeight + baseline;
      return `<path data-envelope-title-line="${i}" transform="translate(${n(dx)} ${n(dy)})" d="${run.path}"/>`;
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PREVIEW_SIZE.width} ${PREVIEW_SIZE.height}" ` +
    `width="${PREVIEW_SIZE.width}" height="${PREVIEW_SIZE.height}" data-envelope-preview="">` +
    `<defs>` +
    `<filter id="envelope-shadow" filterUnits="userSpaceOnUse" x="${-reach}" y="${-reach}" ` +
    `width="${n(W + reach * 2)}" height="${n(H + shadow.y + reach * 2)}" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur stdDeviation="${n(sigma)}"/></filter>` +
    `<clipPath id="envelope-inside"><rect x="${px}" y="${py}" width="${n(pw)}" height="${n(ph)}" rx="${r - BORDER}"/></clipPath>` +
    `</defs>` +
    `<g transform="translate(${n(left)} ${n(top)}) scale(${n(scale)})">` +
    `<rect y="${shadow.y}" width="${n(W)}" height="${n(H)}" rx="${r}" fill="${shadow.color}" ` +
    `fill-opacity="${shadow.opacity}" filter="url(#envelope-shadow)"/>` +
    `<rect x="${BORDER / 2}" y="${BORDER / 2}" width="${n(W - BORDER)}" height="${n(H - BORDER)}" ` +
    `rx="${r - BORDER / 2}" fill="${HOUSE.surfaceMuted}" stroke="${HOUSE.borderStrong}" stroke-width="${BORDER}"/>` +
    `<g clip-path="url(#envelope-inside)">` +
    polygon(
      [
        [px, py],
        [px + pw / 2, py + ph * 0.54],
        [px + pw, py],
        [px + pw, py + ph],
        [px, py + ph],
      ],
      HOUSE.surfaceSubtle,
    ) +
    polygon(
      [
        [px, py],
        [px + pw, py],
        [px + pw / 2, py + ph * 0.58],
      ],
      HOUSE.borderStrong,
    ) +
    polygon(
      [
        [px, py],
        [px + pw, py],
        [px + pw / 2, py + ph * 0.56],
      ],
      HOUSE.surfaceMuted,
    ) +
    `</g>` +
    `<g data-envelope-title="" fill="${HOUSE.text}">${titleSvg}</g>` +
    `</g></svg>`
  );
}
