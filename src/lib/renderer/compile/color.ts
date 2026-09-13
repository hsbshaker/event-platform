/**
 * Colour maths for the semantic palette compiler: sRGB <-> linear <-> OKLab <-> OKLCH,
 * sRGB gamut mapping, and WCAG 2.2 relative luminance / contrast ratios.
 *
 * Split out of `palette.ts` so the two concerns stay testable apart: this module owns *what a
 * colour is*, `palette.ts` owns *which colour serves which role*. Everything here is pure and
 * dependency-free — `docs/technology-decisions.md` locks the MVP stack and grants no colour
 * library, so the conversions are implemented rather than imported.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`:
 *   - "Required normal text/button contrast clears 4.5:1."
 *   - "Required non-text/focus contrast clears applicable 3:1 thresholds."
 * Guardrails: `spec.md §32` #25, #26.
 *
 * The OKLab matrices are Björn Ottosson's definition, the same constants CSS Color 4 specifies.
 * Contrast is WCAG 2.x relative luminance (0.2126/0.7152/0.0722 over linearised channels), NOT an
 * OKLCH lightness difference: OKLCH is the space we *move* in, WCAG luminance is the space we are
 * *judged* in, and the two disagree enough that approximating one with the other would let a
 * failing pair through.
 */

/** OKLCH. `l` in 0..1, `c` in 0..~0.4, `h` in degrees 0..360. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** 8-bit sRGB, channels 0..255 (integers once they have come back from `gamutMapOklch`). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** True for a canonical emitted token: `#` + 6 uppercase hex digits. */
export function isCanonicalHex(value: string): boolean {
  return /^#[0-9A-F]{6}$/.test(value);
}

export function parseHex(hex: string): Rgb {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Not a 6-digit hex colour: ${JSON.stringify(hex)}`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function formatHex(rgb: Rgb): string {
  const channel = (v: number): string => {
    const i = Math.max(0, Math.min(255, Math.round(v)));
    return i.toString(16).toUpperCase().padStart(2, "0");
  };
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/** sRGB electro-optical transfer function: 0..1 encoded -> 0..1 linear. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Inverse of `srgbToLinear`. */
export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

function rgbToLinear(rgb: Rgb): LinearRgb {
  return {
    r: srgbToLinear(rgb.r / 255),
    g: srgbToLinear(rgb.g / 255),
    b: srgbToLinear(rgb.b / 255),
  };
}

interface Oklab {
  l: number;
  a: number;
  b: number;
}

function linearRgbToOklab(lin: LinearRgb): Oklab {
  const l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  const m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  const s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

  const lCbrt = Math.cbrt(l);
  const mCbrt = Math.cbrt(m);
  const sCbrt = Math.cbrt(s);

  return {
    l: 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt,
  };
}

function oklabToLinearRgb(lab: Oklab): LinearRgb {
  const lCbrt = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mCbrt = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sCbrt = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const lab = linearRgbToOklab(rgbToLinear(rgb));
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  // atan2 of a numerically-zero chroma is meaningless; pin achromatic hue to 0 so greys are
  // deterministic rather than dependent on float dust in `a`/`b`.
  const h = c < 1e-7 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { l: lab.l, c, h };
}

export function hexToOklch(hex: string): Oklch {
  return rgbToOklch(parseHex(hex));
}

function oklchToLinearRgb(o: Oklch): LinearRgb {
  const rad = (o.h * Math.PI) / 180;
  return oklabToLinearRgb({ l: o.l, a: o.c * Math.cos(rad), b: o.c * Math.sin(rad) });
}

const GAMUT_EPSILON = 1e-4;

function inGamut(lin: LinearRgb): boolean {
  const ok = (v: number): boolean => {
    const s = linearToSrgb(v);
    return s >= -GAMUT_EPSILON && s <= 1 + GAMUT_EPSILON;
  };
  return ok(lin.r) && ok(lin.g) && ok(lin.b);
}

function clip(lin: LinearRgb): Rgb {
  const ch = (v: number): number => Math.round(Math.max(0, Math.min(1, linearToSrgb(v))) * 255);
  return { r: ch(lin.r), g: ch(lin.g), b: ch(lin.b) };
}

/** Result of gamut-mapping an OKLCH request into real sRGB. */
export interface GamutMapped {
  rgb: Rgb;
  /** Chroma actually realised after mapping; always `<=` the requested chroma. */
  chroma: number;
  /** Requested chroma that had to be given up (0 when the request was already in gamut). */
  chromaLoss: number;
}

const GAMUT_SEARCH_ITERATIONS = 16;

/**
 * Map an OKLCH request into sRGB, holding lightness and hue and giving up chroma — the CSS
 * Color 4 gamut-mapping shape. Holding hue is the point: a role may lose saturation in order to
 * become renderable, it may never silently become a different colour.
 */
export function gamutMapOklch(o: Oklch): GamutMapped {
  const l = Math.max(0, Math.min(1, o.l));
  const requested = Math.max(0, o.c);

  const direct = oklchToLinearRgb({ l, c: requested, h: o.h });
  if (inGamut(direct)) {
    return { rgb: clip(direct), chroma: requested, chromaLoss: 0 };
  }

  let lo = 0;
  let hi = requested;
  for (let i = 0; i < GAMUT_SEARCH_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRgb({ l, c: mid, h: o.h }))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return {
    rgb: clip(oklchToLinearRgb({ l, c: lo, h: o.h })),
    chroma: lo,
    chromaLoss: requested - lo,
  };
}

/** Gamut-map an OKLCH request and render it as a canonical `#RRGGBB` token. */
export function oklchToHex(o: Oklch): string {
  return formatHex(gamutMapOklch(o).rgb);
}

/** WCAG 2.x relative luminance of an 8-bit sRGB colour. */
export function relativeLuminance(rgb: Rgb): number {
  const lin = rgbToLinear(rgb);
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

/** WCAG 2.x contrast ratio between two hex colours; symmetric, in 1..21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(parseHex(hexA));
  const b = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
