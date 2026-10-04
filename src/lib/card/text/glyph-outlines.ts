/**
 * Card text as glyph outlines, for the link-preview image (`docs/card-system.md §6.4`;
 * `docs/technology-decisions.md §8.2`).
 *
 * A stored line is shaped by HarfBuzz exactly as `metrics.ts` measures it — the same text case,
 * language, features (optional ligatures off under letter spacing), and variable instance (`wght`
 * = the face's weight, `opsz` = the size in card units) — and each glyph's outline is drawn with
 * `Font.drawGlyph`, so the preview's text geometry is the measured line itself. Every drawn line is
 * checked against `FontMetrics.measure` and refused if the two differ: the preview cannot set a
 * line wider or narrower than the one that was broken and stored.
 *
 * CSS behaviours mirrored here (as in `metrics.ts`): `letter-spacing` is added after every
 * grapheme cluster, the last one included; the baseline sits in the line box as CSS places it,
 * half the leading above the font's ascent (`hExtents`: OS/2 typo metrics when the font asks for
 * them, else `hhea`, at the instance).
 *
 * Only left-to-right text is drawn: a stored line with right-to-left characters would be reordered
 * by the browser's bidi algorithm, which this does not implement, so it is refused rather than
 * drawn in another order. Characters the face lacks are refused too (a browser would substitute a
 * fallback font the preview does not have).
 */

import * as hb from "harfbuzzjs";

import {
  applyTextCase,
  fontFileToSfnt,
  loadFontMetrics,
  SHAPING_LANGUAGE,
  type FontMetrics,
  type FontRef,
  type MeasureStyle,
} from "./metrics";

/** The line cannot be drawn exactly as a browser would set it. */
export class UndrawableTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UndrawableTextError";
  }
}

export interface GlyphLine {
  /**
   * SVG path data in card units for the whole line, origin at the line's start on the baseline,
   * y down. Empty for a line with no ink (spaces only).
   */
  path: string;
  /** Advance width including letter spacing, card units; equal to `FontMetrics.measure`. */
  width: number;
}

export interface GlyphOutlines {
  readonly font: FontRef;
  readonly metrics: FontMetrics;
  /** The face's ascent and descent (both positive) at `size`, card units. */
  verticalMetrics(size: number): { ascent: number; descent: number };
  /**
   * One line, shaped and drawn, its start at `originX` on the baseline. Throws
   * `UndrawableTextError` for text it cannot draw exactly.
   */
  line(text: string, style: MeasureStyle, originX?: number): GlyphLine;
}

export type GlyphOutlinesResolver = (font: FontRef) => GlyphOutlines;

const NO_OPTIONAL_LIGATURES = ["liga", "clig", "dlig"];
/** Hebrew, Arabic and the other right-to-left blocks, and explicit bidi controls. */
const RIGHT_TO_LEFT =
  /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc\u200f\u202b\u202e\u2067\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
/** Drawn width may differ from the measured width by float noise only. */
const WIDTH_EPSILON = 1e-6;
const MAX_INSTANCES = 32;
const MAX_CACHED_GLYPHS = 20_000;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Two decimals of a card unit (a thousandth of a pixel at preview scale). */
function n(value: number): string {
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

/**
 * A face's outlines from its SFNT bytes. The face must belong to `font.family` and cover its
 * weight (`loadFontMetrics` checks both and throws otherwise).
 */
export function loadGlyphOutlines(sfnt: Uint8Array, font: FontRef): GlyphOutlines {
  const metrics = loadFontMetrics(sfnt, font);
  const face = new hb.Face(new hb.Blob(sfnt));
  const axes = face.getAxisInfos();
  const wght = axes.wght;
  const opsz = axes.opsz;
  const upem = face.upem;
  const opticalSize = (size: number): number =>
    opsz ? Math.min(opsz.max, Math.max(opsz.min, size)) : 0;

  const instances = new Map<number, hb.Font>();
  const instanceFor = (size: number): hb.Font => {
    const optical = opticalSize(size);
    let instance = instances.get(optical);
    if (!instance) {
      if (instances.size >= MAX_INSTANCES) instances.clear();
      instance = new hb.Font(face);
      const variations: hb.Variation[] = [];
      if (wght) variations.push(new hb.Variation("wght", font.weight));
      if (opsz) variations.push(new hb.Variation("opsz", optical));
      if (variations.length > 0) instance.setVariations(variations);
      instances.set(optical, instance);
    }
    return instance;
  };

  // Glyph outlines in font units (y up), per optical size: flat [command, ...numbers] lists.
  type Segment = [string, ...number[]];
  const glyphCache = new Map<string, Segment[]>();
  let drawing: Segment[] = [];
  const draw = new hb.DrawFuncs();
  draw.setMoveToFunc((x, y) => drawing.push(["M", x, y]));
  draw.setLineToFunc((x, y) => drawing.push(["L", x, y]));
  draw.setQuadraticToFunc((cx, cy, x, y) => drawing.push(["Q", cx, cy, x, y]));
  draw.setCubicToFunc((c1x, c1y, c2x, c2y, x, y) => drawing.push(["C", c1x, c1y, c2x, c2y, x, y]));
  draw.setClosePathFunc(() => drawing.push(["Z"]));
  const outline = (size: number, glyph: number): Segment[] => {
    const key = `${opticalSize(size)}|${glyph}`;
    let segments = glyphCache.get(key);
    if (!segments) {
      drawing = [];
      instanceFor(size).drawGlyph(glyph, draw);
      segments = drawing;
      if (glyphCache.size >= MAX_CACHED_GLYPHS) glyphCache.clear();
      glyphCache.set(key, segments);
    }
    return segments;
  };

  const ligaturesOff = NO_OPTIONAL_LIGATURES.map((tag) => new hb.Feature(tag, 0));

  return {
    font: { ...font },
    metrics,
    verticalMetrics(size) {
      const { ascender, descender } = instanceFor(size).hExtents();
      return { ascent: (ascender / upem) * size, descent: (-descender / upem) * size };
    },
    line(text, style, originX = 0) {
      const { size, letterSpacingEm = 0, textCase = "none" } = style;
      if (LINE_BREAK.test(text)) throw new UndrawableTextError("line() takes one line");
      if (RIGHT_TO_LEFT.test(text)) {
        throw new UndrawableTextError(`right-to-left text is not drawn: ${JSON.stringify(text)}`);
      }
      const missing = metrics.missingCharacters(text);
      if (missing.length > 0) {
        throw new UndrawableTextError(
          `${font.family} ${font.weight} has no glyph for ${missing.join(" ")}`,
        );
      }
      const cased = applyTextCase(text, textCase);
      const spaced = letterSpacingEm !== 0;
      const spacing = letterSpacingEm * size;
      const scale = size / upem;

      // Grapheme index of every UTF-16 offset: spacing goes after each grapheme's last glyph.
      const graphemeAt = new Int32Array(cased.length + 1);
      let count = 0;
      for (const { index, segment } of graphemes.segment(cased)) {
        graphemeAt.fill(count, index, index + segment.length);
        count += 1;
      }

      let pen = 0;
      const parts: string[] = [];
      if (cased.length > 0) {
        const buffer = new hb.Buffer();
        buffer.addText(cased);
        buffer.setLanguage(SHAPING_LANGUAGE);
        buffer.guessSegmentProperties();
        hb.shape(instanceFor(size), buffer, spaced ? ligaturesOff : undefined);
        const glyphs = buffer.getGlyphInfosAndPositions();
        let spaces = 0;
        glyphs.forEach((glyph, i) => {
          const ox = originX + pen + ((glyph.xOffset ?? 0) / upem) * size;
          const oy = -((glyph.yOffset ?? 0) / upem) * size;
          for (const [command, ...values] of outline(size, glyph.codepoint)) {
            const coords: string[] = [];
            for (let k = 0; k < values.length; k += 2) {
              coords.push(n(ox + values[k] * scale), n(oy - values[k + 1] * scale));
            }
            parts.push(command + coords.join(" "));
          }
          pen += ((glyph.xAdvance ?? 0) / upem) * size;
          const next = glyphs[i + 1];
          if (
            spaced &&
            (!next ||
              graphemeAt[next.cluster] !== graphemeAt[Math.min(glyph.cluster, cased.length)])
          ) {
            pen += spacing;
            spaces += 1;
          }
        });
        if (spaced && spaces !== count) {
          throw new UndrawableTextError(
            `letter spacing applies to ${count} graphemes but ${spaces} glyph clusters`,
          );
        }
      }

      const measured = metrics.measure(text, style);
      if (Math.abs(pen - measured) > WIDTH_EPSILON * Math.max(1, measured)) {
        throw new UndrawableTextError(
          `drawn width ${pen} differs from measured width ${measured} for ${JSON.stringify(text)}`,
        );
      }
      return { path: parts.join(""), width: measured };
    },
  };
}

/** A face's outlines from any supported font file (`fontFileToSfnt`). */
export async function loadGlyphOutlinesFromFile(
  bytes: Uint8Array,
  font: FontRef,
): Promise<GlyphOutlines> {
  return loadGlyphOutlines(await fontFileToSfnt(bytes), font);
}
