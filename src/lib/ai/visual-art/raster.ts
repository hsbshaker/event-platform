import "server-only";

/**
 * Deterministic image inspection: is this decodable, how big is it, and does it *actually* carry
 * transparency?
 *
 * `spec.md §7.6a` closes with the sentence this module exists to honour: *"Transparent-background
 * reliability varies by model and is an input to that selection rather than something a prompt
 * adds afterwards."* `docs/product-doctrine.md §10` says the same. An empirical property has to be
 * measured from the bytes, so nothing here trusts a provider's own claim about its output.
 *
 * # Declared alpha and used alpha are different facts
 *
 * The documented failure mode of image models is not "returns a JPEG when asked for a PNG". It is
 * returning a perfectly well-formed RGBA PNG whose alpha channel is 255 everywhere — an opaque
 * white rectangle wearing a transparency channel. A check that stopped at the container header
 * would pass it. So `alphaChannel` says what the encoding declares and `alphaUsed` says what the
 * pixels do, and `./compliance.ts` requires the second for a role that needs transparency.
 *
 * `alphaUsed` is `null` — *unknown*, never `false` — wherever this module cannot establish the
 * answer from the bytes alone. Unknown is not a pass: `./compliance.ts` treats it as
 * `alpha_unverified` and fails the request rather than assuming in the provider's favour.
 *
 * # The supported formats are a closed list, and that is the safe direction
 *
 * PNG, JPEG and WebP. Anything else is `malformed_output`, which reads harshly for, say, a valid
 * AVIF — and is still right: an asset this boundary cannot inspect is an asset whose transparency
 * and geometry are unknown, and accepting one would defeat the paragraph above. Adding a format
 * is a deliberate code change with its own alpha semantics, not a fallthrough.
 *
 * No network, no native dependency, no image library: `node:zlib` for PNG's own DEFLATE and
 * arithmetic for everything else. The same input always produces the same inspection.
 */
import { inflateSync } from "node:zlib";

export const RASTER_FORMATS = ["png", "jpeg", "webp"] as const;
export type RasterFormat = (typeof RASTER_FORMATS)[number];

export interface RasterInspection {
  readonly format: RasterFormat;
  readonly width: number;
  readonly height: number;
  /** The encoding declares an alpha channel (or a transparency key). A claim about the container. */
  readonly alphaChannel: boolean;
  /**
   * Some pixel is actually non-opaque.
   *
   * `null` means this module could not establish it — an interlaced or 16-bit PNG, a palette with
   * `tRNS`, a lossy WebP with an `ALPH` chunk. `null` is never treated as `true`.
   */
  readonly alphaUsed: boolean | null;
  /**
   * Whether lettering was detected in the image.
   *
   * Always `null` today: `STANDING_PROHIBITIONS` forbids text, and this repository has no detector
   * that could see it. The field exists so the fact "not inspected" is representable and is not
   * silently reported as "no text found" — and so a detector, when one is introduced, has a place
   * to put its answer without widening the classification. `./compliance.ts` raises
   * `text_present` only on an explicit `true`.
   */
  readonly textDetected: boolean | null;
  readonly byteLength: number;
}

export type RasterInspectionResult =
  | { readonly ok: true; readonly inspection: RasterInspection }
  | { readonly ok: false; readonly detail: string };

const fail = (detail: string): RasterInspectionResult => ({ ok: false, detail });

/* ------------------------------------------------------------------ PNG */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per pixel for a PNG colour type, before any `tRNS`. */
const PNG_CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function readU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

/**
 * Undo PNG's per-scanline filters, in place, over an 8-bit non-interlaced raster.
 *
 * Straight from the PNG specification's five filter types. Written out rather than pulled in,
 * because the only thing read from the result is the alpha byte of each pixel and a dependency
 * that decodes whole images would be a much larger surface for one boolean.
 */
function unfilter(
  raster: Uint8Array,
  width: number,
  height: number,
  bpp: number,
): Uint8Array | null {
  const stride = width * bpp;
  let at = 0;
  const out = new Uint8Array(height * stride);
  for (let row = 0; row < height; row += 1) {
    if (at >= raster.length) return null;
    const filter = raster[at];
    at += 1;
    const rowStart = row * stride;
    const priorStart = (row - 1) * stride;
    if (at + stride > raster.length) return null;
    for (let index = 0; index < stride; index += 1) {
      const raw = raster[at + index];
      const left = index >= bpp ? out[rowStart + index - bpp] : 0;
      const up = row > 0 ? out[priorStart + index] : 0;
      const upLeft = row > 0 && index >= bpp ? out[priorStart + index - bpp] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          return null;
      }
      out[rowStart + index] = value & 0xff;
    }
    at += stride;
  }
  return out;
}

function inspectPng(bytes: Uint8Array): RasterInspectionResult {
  if (bytes.length < 8 + 25) return fail("PNG is too short to contain an IHDR");

  let at = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let sawTrns = false;
  let sawIhdr = false;
  const idat: Uint8Array[] = [];

  while (at + 8 <= bytes.length) {
    const length = readU32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const dataAt = at + 8;
    if (dataAt + length + 4 > bytes.length) return fail(`PNG chunk ${type} runs past the buffer`);

    if (type === "IHDR") {
      if (length !== 13) return fail("PNG IHDR is not 13 bytes");
      width = readU32(bytes, dataAt);
      height = readU32(bytes, dataAt + 4);
      bitDepth = bytes[dataAt + 8];
      colorType = bytes[dataAt + 9];
      interlace = bytes[dataAt + 12];
      sawIhdr = true;
    } else if (type === "tRNS") {
      sawTrns = true;
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(dataAt, dataAt + length));
    } else if (type === "IEND") {
      break;
    }

    at = dataAt + length + 4;
  }

  if (!sawIhdr) return fail("PNG carries no IHDR");
  if (width <= 0 || height <= 0) return fail("PNG declares a zero dimension");
  if (PNG_CHANNELS[colorType] === undefined) return fail(`PNG colour type ${colorType} is unknown`);

  const alphaChannel = colorType === 4 || colorType === 6 || sawTrns;

  // Scannable exactly where the arithmetic above is valid: 8-bit samples, no interlacing, and an
  // alpha channel that is a real per-pixel sample rather than a palette key.
  const scannable =
    (colorType === 4 || colorType === 6) && bitDepth === 8 && interlace === 0 && idat.length > 0;

  let alphaUsed: boolean | null = alphaChannel ? null : false;
  if (scannable) {
    const bpp = PNG_CHANNELS[colorType];
    try {
      const joined = Buffer.concat(idat.map((chunk) => Buffer.from(chunk)));
      const raster = new Uint8Array(inflateSync(joined));
      if (raster.length < height * (1 + width * bpp)) {
        return fail("PNG raster is shorter than its declared geometry");
      }
      const samples = unfilter(raster, width, height, bpp);
      if (samples) {
        const stride = width * bpp;
        let transparent = false;
        for (let row = 0; row < height && !transparent; row += 1) {
          for (let column = 0; column < width; column += 1) {
            if (samples[row * stride + column * bpp + (bpp - 1)] !== 0xff) {
              transparent = true;
              break;
            }
          }
        }
        alphaUsed = transparent;
      }
    } catch (error) {
      return fail(`PNG raster did not inflate: ${(error as Error)?.message ?? String(error)}`);
    }
  }

  return {
    ok: true,
    inspection: {
      format: "png",
      width,
      height,
      alphaChannel,
      alphaUsed,
      textDetected: null,
      byteLength: bytes.length,
    },
  };
}

/* ------------------------------------------------------------------ JPEG */

/** Frame markers that carry a size. `SOF4`/`SOF8`/`SOF12` are not frame markers. */
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function inspectJpeg(bytes: Uint8Array): RasterInspectionResult {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return fail("JPEG marker segment is not aligned");
    const marker = bytes[at + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2) return fail("JPEG segment declares an impossible length");
    if (JPEG_SOF.has(marker)) {
      if (at + 9 > bytes.length) return fail("JPEG frame header runs past the buffer");
      const height = (bytes[at + 5] << 8) | bytes[at + 6];
      const width = (bytes[at + 7] << 8) | bytes[at + 8];
      if (width <= 0 || height <= 0) return fail("JPEG declares a zero dimension");
      return {
        ok: true,
        inspection: {
          format: "jpeg",
          width,
          height,
          // JPEG has no alpha channel. This is one of the few `false`s here that is a fact rather
          // than a measurement, and it is why a transparency-required role can never be served by
          // one.
          alphaChannel: false,
          alphaUsed: false,
          textDetected: null,
          byteLength: bytes.length,
        },
      };
    }
    at += 2 + length;
  }
  return fail("JPEG carries no frame header");
}

/* ------------------------------------------------------------------ WebP */

function inspectWebp(bytes: Uint8Array): RasterInspectionResult {
  if (bytes.length < 16) return fail("WebP is too short to carry a chunk");
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunk === "VP8X") {
    if (bytes.length < 30) return fail("WebP VP8X header is truncated");
    const flags = bytes[20];
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    const alphaChannel = (flags & 0x10) !== 0;
    return {
      ok: true,
      inspection: {
        format: "webp",
        width,
        height,
        alphaChannel,
        // The extended header's ALPHA flag says a channel exists, never that a pixel uses it, and
        // reading the `ALPH` chunk would mean implementing WebP's lossless transforms.
        alphaUsed: alphaChannel ? null : false,
        textDetected: null,
        byteLength: bytes.length,
      },
    };
  }

  if (chunk === "VP8L") {
    if (bytes.length < 25) return fail("WebP VP8L header is truncated");
    if (bytes[20] !== 0x2f) return fail("WebP VP8L signature byte is wrong");
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    // Bit 28 is `alpha_is_used`, which is the lossless format stating the measured fact directly.
    const alphaUsed = ((bits >>> 28) & 1) === 1;
    return {
      ok: true,
      inspection: {
        format: "webp",
        width,
        height,
        alphaChannel: alphaUsed,
        alphaUsed,
        textDetected: null,
        byteLength: bytes.length,
      },
    };
  }

  if (chunk === "VP8 ") {
    if (bytes.length < 30) return fail("WebP VP8 header is truncated");
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return fail("WebP VP8 keyframe start code is wrong");
    }
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    if (width <= 0 || height <= 0) return fail("WebP declares a zero dimension");
    return {
      ok: true,
      inspection: {
        format: "webp",
        width,
        height,
        // Simple lossy WebP carries no alpha; only the VP8X container can add an `ALPH` chunk.
        alphaChannel: false,
        alphaUsed: false,
        textDetected: null,
        byteLength: bytes.length,
      },
    };
  }

  return fail(`WebP chunk ${chunk} is not one this boundary reads`);
}

/* ------------------------------------------------------------------ entry point */

/**
 * Inspect raster bytes. Never throws, never fetches, never trusts a declared media type.
 *
 * The media type a provider sends is not consulted at all: the magic bytes decide. A provider that
 * labels a JPEG `image/png` is exactly the case where the label must not win.
 */
export function inspectRaster(bytes: Uint8Array): RasterInspectionResult {
  if (bytes.length === 0) return fail("the provider returned an empty body");

  if (startsWith(bytes, PNG_SIGNATURE)) return inspectPng(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return inspectJpeg(bytes);
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return inspectWebp(bytes);
  }

  return fail(
    "the returned bytes are not PNG, JPEG or WebP; this boundary can verify no other format",
  );
}

/**
 * What this boundary established about an asset's transparency.
 *
 * Three values rather than a boolean, because "we checked and there is none" and "we could not
 * check" must not be the same answer. `docs/product-doctrine.md §10` makes transparency a
 * measured property of a candidate model; an unverified asset measures nothing.
 */
export type ArtworkTransparency = "verified_present" | "verified_absent" | "unverified";

export function transparencyOf(inspection: RasterInspection): ArtworkTransparency {
  if (!inspection.alphaChannel) return "verified_absent";
  if (inspection.alphaUsed === true) return "verified_present";
  if (inspection.alphaUsed === false) return "verified_absent";
  return "unverified";
}
