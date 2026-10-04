/**
 * Font metrics for card line breaking, measured from the font files themselves
 * (`docs/card-system.md §4.3`, §7; `docs/technology-decisions.md §8.2`).
 *
 * Line breaks are computed once and stored; the browser never re-wraps card text. So widths come
 * from the font's own tables, shaped by HarfBuzz — the shaper Chromium and Firefox use — with the
 * browsers' default features (kerning, standard ligatures, contextual alternates), never from a
 * browser.
 *
 * CSS behaviours mirrored here:
 * - `text-transform` is applied before shaping (`applyTextCase`).
 * - `letter-spacing` adds its amount after every typographic character unit (grapheme cluster),
 *   including the last one, as Chromium and Firefox lay it out.
 * - With non-zero letter spacing, browsers stop applying optional ligatures (CSS Text 3 §8.2), so
 *   measurement turns `liga`/`clig`/`dlig` off too.
 * - Variable fonts (each curated file is one variable font per family, whatever weight the file
 *   name says) are measured at the instance a browser uses: `wght` = the face's weight and, for a
 *   face with an optical-size axis, `opsz` = the font size in card units — what
 *   `font-optical-sizing: auto` picks when the card is laid out at one CSS pixel per card unit, as
 *   Phase 3 rendered it. Other axes stay at their defaults, as in a browser. The renderer must
 *   keep `opsz` at the card-unit size whatever the card's on-screen scale (a uniform transform, or
 *   an explicit `font-variation-settings`), or glyph widths change with screen size.
 *
 * Checked against Chromium for every curated face at sizes 18–104, with and without letter spacing
 * and uppercase: widths agree within 0.03%.
 */

import * as hb from "harfbuzzjs";
import { decompress as woff2ToSfnt } from "wawoff2";

/** A font face: family, weight and style, as a `TextBox` names it (`spec.md §20.5`). */
export interface FontRef {
  family: string;
  weight: number;
  italic: boolean;
}

/** How card text is cased. Applied before shaping, and by the renderer as `text-transform`. */
export type TextCase = "none" | "uppercase" | "lowercase";

export interface MeasureStyle {
  /** Font size in card units. */
  size: number;
  /** CSS `letter-spacing`, in em of `size`. */
  letterSpacingEm?: number;
  textCase?: TextCase;
}

export interface FontMetrics {
  readonly font: FontRef;
  readonly unitsPerEm: number;
  /** Width of one line of `text` in card units. `text` must not contain a line break. */
  measure(text: string, style: MeasureStyle): number;
  /** Characters of `text` the face has no glyph for (a browser would substitute a fallback font). */
  missingCharacters(text: string): string[];
}

export type FontMetricsResolver = (font: FontRef) => FontMetrics;

/** Locale-independent case mapping, the same for server and every browser. */
export function applyTextCase(text: string, textCase: TextCase = "none"): string {
  switch (textCase) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "none":
      return text;
  }
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function graphemeCount(text: string): number {
  let n = 0;
  for (const segment of graphemes.segment(text)) {
    void segment;
    n += 1;
  }
  return n;
}

/** Line terminators: LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR. */
const LINE_BREAK = new RegExp("[\\n\\r\\u2028\\u2029]");

const NO_OPTIONAL_LIGATURES = ["liga", "clig", "dlig"];

/**
 * The language text is shaped in, set explicitly so `locl` substitutions cannot follow the runtime's
 * locale: the server and every browser shape alike. The card component sets the same `lang`.
 */
export const SHAPING_LANGUAGE = "en";

/** Bounds on per-font caches (a `FontMetrics` lives for the process). */
const MAX_INSTANCES = 32;
const MAX_CACHED_ADVANCES = 20_000;

function startsWith(bytes: Uint8Array, tag: string): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === tag.charCodeAt(0) &&
    bytes[1] === tag.charCodeAt(1) &&
    bytes[2] === tag.charCodeAt(2) &&
    bytes[3] === tag.charCodeAt(3)
  );
}

/**
 * The SFNT (TrueType/OpenType) bytes of a font file: WOFF2 is decoded, SFNT passes through. WOFF 1
 * and collections are refused — no card font is either.
 */
export async function fontFileToSfnt(bytes: Uint8Array): Promise<Uint8Array> {
  if (startsWith(bytes, "wOF2")) return woff2ToSfnt(bytes);
  if (startsWith(bytes, "wOFF")) throw new Error("WOFF 1 font files are not supported");
  if (startsWith(bytes, "ttcf")) throw new Error("Font collections are not supported");
  const version =
    bytes.length >= 4 ? (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3] : 0;
  if (version === 0x00010000 || startsWith(bytes, "OTTO") || startsWith(bytes, "true")) {
    return bytes;
  }
  throw new Error("Not a font file");
}

/** A face's metrics, from any supported font file (`fontFileToSfnt`). */
export async function loadFontMetricsFromFile(
  bytes: Uint8Array,
  font: FontRef,
): Promise<FontMetrics> {
  return loadFontMetrics(await fontFileToSfnt(bytes), font);
}

const STYLE_WORDS = new Set([
  "Thin",
  "Hairline",
  "ExtraLight",
  "UltraLight",
  "Light",
  "Regular",
  "Book",
  "Normal",
  "Medium",
  "SemiBold",
  "DemiBold",
  "Bold",
  "ExtraBold",
  "UltraBold",
  "Black",
  "Heavy",
  "Italic",
]);

const NAME_FAMILY = 1;
const NAME_TYPOGRAPHIC_FAMILY = 16;

function nameOf(face: hb.Face, nameId: number): string | undefined {
  const entry = face.listNames().find((n) => n.nameId === nameId && n.language.startsWith("en"));
  const value = entry ? face.getName(nameId, entry.language) : "";
  return value || undefined;
}

/**
 * Does the face belong to `family`? Its typographic family (name ID 16) when present, else its
 * family (name ID 1), which a variable font often names after its default instance ("Archivo
 * SemiBold", "Newsreader 16pt"): the family followed only by style or optical-size words, so
 * "Inter Tight" is never accepted as "Inter".
 */
function familyMatches(face: hb.Face, family: string): { ok: boolean; found: string } {
  const typographic = nameOf(face, NAME_TYPOGRAPHIC_FAMILY);
  if (typographic) return { ok: typographic === family, found: typographic };
  const name = nameOf(face, NAME_FAMILY) ?? "";
  if (name === family) return { ok: true, found: name };
  const ok =
    name.startsWith(`${family} `) &&
    name
      .slice(family.length + 1)
      .split(" ")
      .every((word) => STYLE_WORDS.has(word) || /^\d+pt$/.test(word));
  return { ok, found: name };
}

/**
 * A face's metrics, from its SFNT bytes.
 *
 * The face must belong to `font.family` and, if variable, cover `font.weight`; otherwise this
 * throws, because a mis-keyed file would silently measure every line with the wrong font.
 */
export function loadFontMetrics(sfnt: Uint8Array, font: FontRef): FontMetrics {
  const face = new hb.Face(new hb.Blob(sfnt));
  if (face.upem <= 0 || face.collectUnicodes().length === 0) {
    throw new Error(`${font.family}: not a usable font face`);
  }
  const match = familyMatches(face, font.family);
  if (!match.ok) {
    throw new Error(
      `Font file is ${JSON.stringify(match.found)}, not ${JSON.stringify(font.family)}`,
    );
  }
  const axes = face.getAxisInfos();
  const wght = axes.wght;
  const opsz = axes.opsz;
  if (wght && (font.weight < wght.min || font.weight > wght.max)) {
    throw new Error(`${font.family} has no weight ${font.weight} (${wght.min}–${wght.max})`);
  }
  const unitsPerEm = face.upem;
  const opticalSize = (size: number): number =>
    opsz ? Math.min(opsz.max, Math.max(opsz.min, size)) : 0;

  // One instance per optical size in use; a static face has one instance. Bounded, because a
  // FontMetrics lives as long as the process; harfbuzzjs frees a dropped instance itself.
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

  const ligaturesOff = NO_OPTIONAL_LIGATURES.map((tag) => new hb.Feature(tag, 0));
  // Advance in font units of a cased string, per optical size and ligature mode. Bounded like the
  // instances: line breaking measures many substrings, and editing re-breaks on every change.
  const cache = new Map<string, number>();
  const advance = (text: string, size: number, spaced: boolean): number => {
    const key = `${opticalSize(size)}|${spaced ? 1 : 0}|${text}`;
    let units = cache.get(key);
    if (units === undefined) {
      units = 0;
      if (text.length > 0) {
        const buffer = new hb.Buffer();
        buffer.addText(text);
        buffer.setLanguage(SHAPING_LANGUAGE);
        buffer.guessSegmentProperties();
        hb.shape(instanceFor(size), buffer, spaced ? ligaturesOff : undefined);
        for (const position of buffer.getGlyphPositions()) units += position.xAdvance;
      }
      if (cache.size >= MAX_CACHED_ADVANCES) cache.clear();
      cache.set(key, units);
    }
    return units;
  };

  const base = instanceFor(0);
  return {
    font: { ...font },
    unitsPerEm,
    measure(text, { size, letterSpacingEm = 0, textCase = "none" }) {
      if (LINE_BREAK.test(text)) {
        throw new Error("measure() takes one line; break lines first");
      }
      if (!(size > 0)) throw new Error(`Invalid font size ${size}`);
      const cased = applyTextCase(text, textCase);
      const spaced = letterSpacingEm !== 0;
      const glyphs = (advance(cased, size, spaced) / unitsPerEm) * size;
      const spacing = spaced ? graphemeCount(cased) * letterSpacingEm * size : 0;
      return glyphs + spacing;
    },
    missingCharacters(text) {
      const missing = new Set<string>();
      for (const ch of text) {
        if (/\s/.test(ch)) continue;
        if (base.nominalGlyph(ch.codePointAt(0)!) === undefined) missing.add(ch);
      }
      return [...missing];
    },
  };
}
