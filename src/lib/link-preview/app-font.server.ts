/**
 * The app's own font for link-preview images: Inter, the application chrome family
 * (`docs/design-system.md §6.2`), as the same files the app serves.
 *
 * The app loads Inter through `next/font/google`, which self-hosts Google Fonts' variable Inter
 * (`wght` 100–900) as WOFF2 files split by `unicode-range` subset. `ImageResponse` (satori) cannot
 * use them: it reads TTF, OTF and WOFF only, not WOFF2, and sets a variable font at its default
 * instance, not at the heading weight (650). So, like card text (`card/text/glyph-outlines.ts`),
 * the envelope title is drawn as HarfBuzz glyph outlines at `wght` 650, from copies of those
 * subset files kept in `./fonts` (Inter v20 from Google Fonts, SIL Open Font License 1.1; the
 * files are byte-identical to what `next/font/google` serves — the latin one is also the card's
 * curated Inter, kept separately because card fonts belong to the card renderer only).
 *
 * Each character is set in the first subset, in CSS's order (the last `@font-face` rule defined
 * is tried first), whose `unicode-range` holds it and whose file has its glyph — what a browser
 * does with `next/font`'s rules. A character no subset covers (an emoji, CJK) would be set by a
 * browser in a system font the server does not have; drawing it is refused
 * (`UndrawableTextError`), never substituted.
 */

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadGlyphOutlinesFromFile,
  UndrawableTextError,
  type GlyphOutlines,
} from "@/lib/card/text/glyph-outlines";

const FONT_DIR = path.join(process.cwd(), "src", "lib", "link-preview", "fonts");

/** Google Fonts' Inter subsets, most preferred first (the reverse of their CSS order). */
export const INTER_SUBSETS: readonly { name: string; ranges: readonly [number, number][] }[] = [
  {
    name: "latin",
    ranges: [
      [0x0000, 0x00ff],
      [0x0131, 0x0131],
      [0x0152, 0x0153],
      [0x02bb, 0x02bc],
      [0x02c6, 0x02c6],
      [0x02da, 0x02da],
      [0x02dc, 0x02dc],
      [0x0304, 0x0304],
      [0x0308, 0x0308],
      [0x0329, 0x0329],
      [0x2000, 0x206f],
      [0x20ac, 0x20ac],
      [0x2122, 0x2122],
      [0x2191, 0x2191],
      [0x2193, 0x2193],
      [0x2212, 0x2212],
      [0x2215, 0x2215],
      [0xfeff, 0xfeff],
      [0xfffd, 0xfffd],
    ],
  },
  {
    name: "latin-ext",
    ranges: [
      [0x0100, 0x02ba],
      [0x02bd, 0x02c5],
      [0x02c7, 0x02cc],
      [0x02ce, 0x02d7],
      [0x02dd, 0x02ff],
      [0x0304, 0x0304],
      [0x0308, 0x0308],
      [0x0329, 0x0329],
      [0x1d00, 0x1dbf],
      [0x1e00, 0x1e9f],
      [0x1ef2, 0x1eff],
      [0x2020, 0x2020],
      [0x20a0, 0x20ab],
      [0x20ad, 0x20c0],
      [0x2113, 0x2113],
      [0x2c60, 0x2c7f],
      [0xa720, 0xa7ff],
    ],
  },
  {
    name: "vietnamese",
    ranges: [
      [0x0102, 0x0103],
      [0x0110, 0x0111],
      [0x0128, 0x0129],
      [0x0168, 0x0169],
      [0x01a0, 0x01a1],
      [0x01af, 0x01b0],
      [0x0300, 0x0301],
      [0x0303, 0x0304],
      [0x0308, 0x0309],
      [0x0323, 0x0323],
      [0x0329, 0x0329],
      [0x1ea0, 0x1ef9],
      [0x20ab, 0x20ab],
    ],
  },
  {
    name: "greek",
    ranges: [
      [0x0370, 0x0377],
      [0x037a, 0x037f],
      [0x0384, 0x038a],
      [0x038c, 0x038c],
      [0x038e, 0x03a1],
      [0x03a3, 0x03ff],
    ],
  },
  { name: "greek-ext", ranges: [[0x1f00, 0x1fff]] },
  {
    name: "cyrillic",
    ranges: [
      [0x0301, 0x0301],
      [0x0400, 0x045f],
      [0x0490, 0x0491],
      [0x04b0, 0x04b1],
      [0x2116, 0x2116],
    ],
  },
  {
    name: "cyrillic-ext",
    ranges: [
      [0x0460, 0x052f],
      [0x1c80, 0x1c8a],
      [0x20b4, 0x20b4],
      [0x2de0, 0x2dff],
      [0xa640, 0xa69f],
      [0xfe2e, 0xfe2f],
    ],
  },
];

export interface AppTextStyle {
  /** Px. */
  size: number;
  /** CSS `letter-spacing`, em. */
  letterSpacingEm: number;
}

/** App text in one weight of Inter, across its subsets. */
export interface AppFont {
  readonly weight: number;
  /** Ascent and descent of the first available face (latin), px. */
  verticalMetrics(size: number): { ascent: number; descent: number };
  /** Width of one line, px, letter spacing after every character included. */
  measure(text: string, style: AppTextStyle): number;
  /** One line as an SVG path, origin at its start on the baseline, y down. */
  line(text: string, style: AppTextStyle): { path: string; width: number };
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function inRanges(cp: number, ranges: readonly [number, number][]): boolean {
  return ranges.some(([a, b]) => cp >= a && cp <= b);
}

/** Build an `AppFont` over loaded subset faces (in preference order). Pure. */
export function appFontFrom(
  weight: number,
  faces: readonly { name: string; ranges: readonly [number, number][]; outlines: GlyphOutlines }[],
): AppFont {
  if (faces.length === 0) throw new Error("No app font faces");
  /** Consecutive graphemes set in the same face. */
  const runs = (text: string): { face: GlyphOutlines; text: string }[] => {
    const out: { face: GlyphOutlines; text: string }[] = [];
    for (const { segment } of graphemes.segment(text)) {
      const points = [...segment].map((ch) => ch.codePointAt(0)!);
      const face = faces.find(
        (f) =>
          points.every((cp) => inRanges(cp, f.ranges)) &&
          f.outlines.metrics.missingCharacters(segment).length === 0,
      );
      if (!face) {
        throw new UndrawableTextError(`The app font has no glyph for ${JSON.stringify(segment)}`);
      }
      const last = out[out.length - 1];
      if (last && last.face === face.outlines) last.text += segment;
      else out.push({ face: face.outlines, text: segment });
    }
    return out;
  };
  const toMeasure = (style: AppTextStyle) => ({
    size: style.size,
    letterSpacingEm: style.letterSpacingEm,
  });
  return {
    weight,
    verticalMetrics: (size) => faces[0].outlines.verticalMetrics(size),
    measure(text, style) {
      return runs(text).reduce((w, r) => w + r.face.metrics.measure(r.text, toMeasure(style)), 0);
    },
    line(text, style) {
      let x = 0;
      let path = "";
      for (const run of runs(text)) {
        const drawn = run.face.line(run.text, toMeasure(style), x);
        path += drawn.path;
        x += drawn.width;
      }
      return { path, width: x };
    },
  };
}

const loaded = new Map<number, Promise<AppFont>>();

/** Inter at `weight`, every subset, loaded once per process. */
export function loadAppFont(weight: number, dir: string = FONT_DIR): Promise<AppFont> {
  let pending = loaded.get(weight);
  if (!pending) {
    pending = Promise.all(
      INTER_SUBSETS.map(async (subset) => ({
        ...subset,
        outlines: await loadGlyphOutlinesFromFile(
          await readFile(path.join(dir, `Inter-${subset.name}.woff2`)),
          { family: "Inter", weight, italic: false },
        ),
      })),
    ).then((faces) => appFontFrom(weight, faces));
    pending.catch(() => loaded.delete(weight));
    loaded.set(weight, pending);
  }
  return pending;
}
