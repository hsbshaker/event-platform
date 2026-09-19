/**
 * What a returned image *is*, measured from its decoded pixels.
 *
 * `./raster.ts` answers the two questions the request path needs — is this a supported format, and
 * does it really carry alpha — and stops there, because that is all a spend decision requires.
 * This module answers the questions an *evaluation* asks: where the subject sits, how much of the
 * frame it leaves open, whether it reaches the edges, and what colours it actually used.
 *
 * Every number here comes from the decoded raster. `docs/product-doctrine.md §10` makes
 * transparency "an input to model *selection*, not something a prompt adds afterwards", and the
 * same holds for the rest: a provider that reports a transparent background and returns an opaque
 * rectangle has failed, and only counting pixels finds that out. Nothing in this file trusts a
 * header field, a provider claim or a prompt.
 *
 * # What these numbers are not
 *
 * They are objective proxies for a creative brief, not a verdict on one. "Sixty per cent of the
 * lower-right quadrant is transparent" is a fact; "the composition works" is not something a
 * pixel count can say. Every consumer of this module should present the numbers and let a person
 * look at the image.
 *
 * Deliberately no network, no SDK and no `process.env`, so this file sits inside
 * `./boundary.test.ts`'s scans like everything else here.
 */
import { inflateSync } from "node:zlib";

/** A pixel counts as present when its alpha is at least this. Below it, nothing is visible. */
export const PRESENCE_ALPHA = 16;

/** Content reaching within this fraction of a canvas edge raises the edge-risk flag. */
export const EDGE_RISK_FRACTION = 0.02;

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bits per channel, row-major. Length is `width * height * 4`. */
  readonly pixels: Uint8Array;
}

export type DecodeResult =
  | { readonly ok: true; readonly image: DecodedImage }
  | { readonly ok: false; readonly reason: string };

function readU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Decode a non-interlaced 8-bit RGB or RGBA PNG to straight RGBA.
 *
 * Narrow on purpose. This exists to measure what an image provider returned, and the formats it
 * refuses are formats that would need a decision — a palette needs its PLTE and tRNS applied, 16-bit
 * needs a downsample that loses the thing being measured, Adam7 needs seven passes reassembled. A
 * clear refusal is better than a measurement of something subtly wrong.
 */
export function decodePng(bytes: Uint8Array): DecodeResult {
  if (bytes.length < 8 || PNG_MAGIC.some((b, i) => bytes[i] !== b)) {
    return { ok: false, reason: "not a PNG" };
  }

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Uint8Array[] = [];

  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = readU32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = at + 8;
    if (body + length > bytes.length) return { ok: false, reason: "truncated PNG chunk" };

    if (type === "IHDR") {
      width = readU32(bytes, body);
      height = readU32(bytes, body + 4);
      depth = bytes[body + 8];
      colorType = bytes[body + 9];
      interlace = bytes[body + 12];
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(body, body + length));
    } else if (type === "IEND") {
      break;
    }
    at = body + length + 4;
  }

  if (width <= 0 || height <= 0) return { ok: false, reason: "PNG has no dimensions" };
  if (depth !== 8) return { ok: false, reason: `unsupported PNG bit depth ${depth}` };
  if (colorType !== 2 && colorType !== 6) {
    return { ok: false, reason: `unsupported PNG colour type ${colorType}` };
  }
  if (interlace !== 0) return { ok: false, reason: "interlaced PNG is not supported" };
  if (idat.length === 0) return { ok: false, reason: "PNG has no image data" };

  const channels = colorType === 6 ? 4 : 3;
  let raw: Uint8Array;
  try {
    const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of idat) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    raw = new Uint8Array(inflateSync(joined));
  } catch (error) {
    return { ok: false, reason: `PNG raster did not inflate: ${(error as Error)?.message}` };
  }

  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return { ok: false, reason: "PNG raster is short" };

  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prior = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? line[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          return { ok: false, reason: `unknown PNG filter ${filter} on row ${y}` };
      }
      line[i] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prior.set(line);
  }

  return { ok: true, image: { width, height, pixels: out } };
}

export interface AlphaMetrics {
  readonly hasAlphaChannel: boolean;
  readonly fullyTransparent: number;
  readonly partiallyTransparent: number;
  readonly fullyOpaque: number;
  readonly totalPixels: number;
  readonly fullyTransparentPct: number;
  readonly partiallyTransparentPct: number;
  readonly fullyOpaquePct: number;
  /** True when every pixel is fully opaque — a rectangle where transparency was requested. */
  readonly looksLikeOpaqueCanvas: boolean;
  /** Per edge, whether that entire outermost row or column is below `PRESENCE_ALPHA`. */
  readonly clearEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  readonly allEdgesClear: boolean;
}

export interface BoundingBox {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface CropMetrics {
  /** `null` when nothing in the image is present at all. */
  readonly box: BoundingBox | null;
  readonly marginsPx: { top: number; right: number; bottom: number; left: number };
  readonly marginsPct: { top: number; right: number; bottom: number; left: number };
  /** Content reaches within `EDGE_RISK_FRACTION` of at least one edge. Diagnostic, not a verdict. */
  readonly edgeRisk: boolean;
  readonly edgesAtRisk: readonly ("top" | "right" | "bottom" | "left")[];
}

export interface PlacementMetrics {
  /** Alpha-weighted centre of mass, normalised to 0..1 of width and height. `null` if empty. */
  readonly centroid: { x: number; y: number } | null;
  /** Share of total present-weight in each quadrant. Sums to 1 when anything is present. */
  readonly quadrantShare: {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
  };
  /** For each quadrant, the fraction of its pixels that are below `PRESENCE_ALPHA`. */
  readonly quadrantTransparentRatio: {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
  };
}

export interface PaletteSample {
  readonly hex: string;
  readonly share: number;
}

export interface PaletteMetrics {
  /** The most common opaque colours, quantised so near-identical pigment groups together. */
  readonly dominant: readonly PaletteSample[];
  /** For each intended colour, the closest distance any opaque pixel came to it (0..441). */
  readonly nearestToIntended: readonly { intended: string; distance: number; share: number }[];
}

export interface ArtworkMetrics {
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly alpha: AlphaMetrics;
  readonly crop: CropMetrics;
  readonly placement: PlacementMetrics;
  readonly palette: PaletteMetrics;
}

const pct = (n: number, of: number) => (of === 0 ? 0 : Number(((n / of) * 100).toFixed(4)));
const round = (n: number) => Number(n.toFixed(4));
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;

function alphaMetrics(image: DecodedImage, hasAlphaChannel: boolean): AlphaMetrics {
  const { width, height, pixels } = image;
  let clear = 0;
  let partial = 0;
  let opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    const a = pixels[i];
    if (a === 0) clear++;
    else if (a === 255) opaque++;
    else partial++;
  }
  const total = width * height;

  const rowClear = (y: number) => {
    for (let x = 0; x < width; x++)
      if (pixels[(y * width + x) * 4 + 3] >= PRESENCE_ALPHA) return false;
    return true;
  };
  const colClear = (x: number) => {
    for (let y = 0; y < height; y++)
      if (pixels[(y * width + x) * 4 + 3] >= PRESENCE_ALPHA) return false;
    return true;
  };
  const clearEdges = {
    top: rowClear(0),
    bottom: rowClear(height - 1),
    left: colClear(0),
    right: colClear(width - 1),
  };

  return {
    hasAlphaChannel,
    fullyTransparent: clear,
    partiallyTransparent: partial,
    fullyOpaque: opaque,
    totalPixels: total,
    fullyTransparentPct: pct(clear, total),
    partiallyTransparentPct: pct(partial, total),
    fullyOpaquePct: pct(opaque, total),
    looksLikeOpaqueCanvas: opaque === total,
    clearEdges,
    allEdgesClear: clearEdges.top && clearEdges.right && clearEdges.bottom && clearEdges.left,
  };
}

function cropMetrics(image: DecodedImage): CropMetrics {
  const { width, height, pixels } = image;
  let top = height;
  let left = width;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < PRESENCE_ALPHA) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) {
    return {
      box: null,
      marginsPx: { top: 0, right: 0, bottom: 0, left: 0 },
      marginsPct: { top: 0, right: 0, bottom: 0, left: 0 },
      edgeRisk: false,
      edgesAtRisk: [],
    };
  }
  const marginsPx = {
    top,
    left,
    right: width - 1 - right,
    bottom: height - 1 - bottom,
  };
  const marginsPct = {
    top: pct(marginsPx.top, height),
    bottom: pct(marginsPx.bottom, height),
    left: pct(marginsPx.left, width),
    right: pct(marginsPx.right, width),
  };
  const riskPx = { vertical: height * EDGE_RISK_FRACTION, horizontal: width * EDGE_RISK_FRACTION };
  const edgesAtRisk: ("top" | "right" | "bottom" | "left")[] = [];
  if (marginsPx.top < riskPx.vertical) edgesAtRisk.push("top");
  if (marginsPx.right < riskPx.horizontal) edgesAtRisk.push("right");
  if (marginsPx.bottom < riskPx.vertical) edgesAtRisk.push("bottom");
  if (marginsPx.left < riskPx.horizontal) edgesAtRisk.push("left");

  return {
    box: {
      top,
      left,
      right,
      bottom,
      width: right - left + 1,
      height: bottom - top + 1,
    },
    marginsPx,
    marginsPct,
    edgeRisk: edgesAtRisk.length > 0,
    edgesAtRisk,
  };
}

function placementMetrics(image: DecodedImage): PlacementMetrics {
  const { width, height, pixels } = image;
  const midX = width / 2;
  const midY = height / 2;
  let weight = 0;
  let sumX = 0;
  let sumY = 0;
  const share = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  const clearCount = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  const quadPixels = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = pixels[(y * width + x) * 4 + 3];
      const key = (y < midY ? "top" : "bottom") + (x < midX ? "Left" : "Right");
      const quadrant = key as keyof typeof share;
      quadPixels[quadrant]++;
      if (a < PRESENCE_ALPHA) {
        clearCount[quadrant]++;
        continue;
      }
      weight += a;
      sumX += x * a;
      sumY += y * a;
      share[quadrant] += a;
    }
  }

  const normalise = (v: number) => (weight === 0 ? 0 : round(v / weight));
  return {
    centroid:
      weight === 0 ? null : { x: round(sumX / weight / width), y: round(sumY / weight / height) },
    quadrantShare: {
      topLeft: normalise(share.topLeft),
      topRight: normalise(share.topRight),
      bottomLeft: normalise(share.bottomLeft),
      bottomRight: normalise(share.bottomRight),
    },
    quadrantTransparentRatio: {
      topLeft: round(clearCount.topLeft / Math.max(1, quadPixels.topLeft)),
      topRight: round(clearCount.topRight / Math.max(1, quadPixels.topRight)),
      bottomLeft: round(clearCount.bottomLeft / Math.max(1, quadPixels.bottomLeft)),
      bottomRight: round(clearCount.bottomRight / Math.max(1, quadPixels.bottomRight)),
    },
  };
}

function paletteMetrics(image: DecodedImage, intended: readonly string[]): PaletteMetrics {
  const { pixels } = image;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let present = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue; // Near-opaque only: edge pixels are blends, not pigment.
    present++;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count++;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    buckets.set(key, entry);
  }

  const dominant = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((e) => ({
      hex: hex(Math.round(e.r / e.count), Math.round(e.g / e.count), Math.round(e.b / e.count)),
      share: present === 0 ? 0 : round(e.count / present),
    }));

  const nearestToIntended = intended.map((target) => {
    const tr = parseInt(target.slice(1, 3), 16);
    const tg = parseInt(target.slice(3, 5), 16);
    const tb = parseInt(target.slice(5, 7), 16);
    let best = Infinity;
    let within = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 200) continue;
      const d = Math.hypot(pixels[i] - tr, pixels[i + 1] - tg, pixels[i + 2] - tb);
      if (d < best) best = d;
      if (d <= 48) within++;
    }
    return {
      intended: target,
      distance: best === Infinity ? -1 : round(best),
      share: present === 0 ? 0 : round(within / present),
    };
  });

  return { dominant, nearestToIntended };
}

/**
 * Measure a PNG. Throws only if it cannot be decoded, because a metric of an undecoded image would
 * be a number with nothing behind it.
 */
export function measureArtwork(
  bytes: Uint8Array,
  intendedPalette: readonly string[] = [],
): ArtworkMetrics {
  const decoded = decodePng(bytes);
  if (!decoded.ok) throw new Error(`cannot measure this asset: ${decoded.reason}`);
  const { image } = decoded;
  // Colour type 6 is the only RGBA form this decoder accepts, and `decodePng` fills alpha with 255
  // for colour type 2 — so "has an alpha channel" is exactly "some pixel is not fully opaque, or
  // the file declared one". The conservative reading is what the file declared.
  const hasAlphaChannel = bytes.length > 25 && bytes[25] === 6;
  return {
    width: image.width,
    height: image.height,
    byteLength: bytes.byteLength,
    alpha: alphaMetrics(image, hasAlphaChannel),
    crop: cropMetrics(image),
    placement: placementMetrics(image),
    palette: paletteMetrics(image, intendedPalette),
  };
}
