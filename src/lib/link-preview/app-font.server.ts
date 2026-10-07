/**
 * The app's own font for link-preview images: Alegreya Sans, the application chrome family
 * (`docs/design-system.md §6.2`, Revision 5), from the same files the app serves for the subset
 * it loads.
 *
 * The app loads Alegreya Sans through `next/font/google`, which self-hosts Google Fonts' static
 * Alegreya Sans faces as WOFF2 files, one per weight, split by `unicode-range` subset.
 * `ImageResponse` (satori) cannot use them: it reads TTF, OTF and WOFF only, not WOFF2. So, like
 * card text (`card/text/glyph-outlines.ts`), preview text is drawn as HarfBuzz glyph outlines from
 * copies of those subset files kept in `./fonts`, one per weight the preview draws
 * (`APP_FONT_WEIGHTS`: 500 for the envelope title, 700 for the seal's "R"). They are Alegreya Sans
 * v28 from Google Fonts (SIL Open Font License 1.1, `AlegreyaSans-OFL.txt` beside them), each
 * byte-identical to the latin file `next/font/google` serves the app for that weight
 * (`docs/technology-decisions.md §8.2`).
 *
 * Each character is set in the first subset, in CSS's order (the last `@font-face` rule defined
 * is tried first), whose `unicode-range` holds it and whose file has its glyph — what a browser
 * does with `next/font`'s rules. A character no loaded subset covers (Greek, Cyrillic, an emoji)
 * would be set by a browser in a system font the server does not have; drawing it is refused
 * (`UndrawableTextError`), never substituted. No stored title reaches that: the title's entry
 * check refuses everything the latin subset lacks (`envelope-svg.test.ts`).
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

/** The application family, as `next/font/google` and its files' name tables name it. */
export const APP_FONT_FAMILY = "Alegreya Sans";

/**
 * The weights the preview draws, each a static face with its own file per subset
 * (`AlegreyaSans-<subset>-<weight>.woff2`). Alegreya Sans is static: a weight without a file is
 * refused, never synthesized.
 */
export const APP_FONT_WEIGHTS: readonly number[] = [500, 700];

/**
 * The Google Fonts Alegreya Sans subsets the app loads (`src/app/layout.tsx`:
 * `subsets: ["latin"]`), most preferred first (the reverse of their CSS order). Only these are
 * drawn: a character outside them the live envelope sets in a system fallback face, so the preview
 * refuses it. Add a subset here in step with the app (`app-font.server.test.ts` holds the two
 * lists equal).
 */
export const APP_FONT_SUBSETS: readonly { name: string; ranges: readonly [number, number][] }[] = [
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
];

export interface AppTextStyle {
  /** Px. */
  size: number;
  /** CSS `letter-spacing`, em. */
  letterSpacingEm: number;
}

/** App text in one weight of the app font, across its subsets. */
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

/** The app font at `weight` (one of `APP_FONT_WEIGHTS`), every subset, loaded once per process. */
export function loadAppFont(weight: number, dir: string = FONT_DIR): Promise<AppFont> {
  if (!APP_FONT_WEIGHTS.includes(weight)) {
    return Promise.reject(
      new Error(
        `The preview draws ${APP_FONT_FAMILY} at weights ${APP_FONT_WEIGHTS.join(", ")} only`,
      ),
    );
  }
  let pending = loaded.get(weight);
  if (!pending) {
    const prefix = APP_FONT_FAMILY.replaceAll(" ", "");
    pending = Promise.all(
      APP_FONT_SUBSETS.map(async (subset) => ({
        ...subset,
        outlines: await loadGlyphOutlinesFromFile(
          await readFile(path.join(dir, `${prefix}-${subset.name}-${weight}.woff2`)),
          { family: APP_FONT_FAMILY, weight, italic: false },
        ),
      })),
    ).then((faces) => appFontFrom(weight, faces));
    pending.catch(() => loaded.delete(weight));
    loaded.set(weight, pending);
  }
  return pending;
}
