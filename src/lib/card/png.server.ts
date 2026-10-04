import "server-only";

import { crc32, inflateSync } from "node:zlib";

/**
 * PNG reading for generated artwork (`docs/card-system.md §4.1`, §4.2): enough of the format to
 * validate and sample what the image model returns, and to store it as untagged sRGB
 * (`docs/technology-decisions.md §8.2`), with `node:zlib` and nothing else.
 *
 * The image model paints 8-bit RGB or RGBA, non-interlaced PNGs (`docs/technology-decisions.md
 * §8.1`); that is all `decodePng` reads. Anything else — palette or greyscale images, 16-bit
 * channels, Adam7 interlacing, a damaged or truncated file — is refused with a `PngError` naming
 * what was found, never decoded approximately: ink is resolved from these pixels, and a wrong
 * reading must not pass for a measurement.
 *
 * The bytes come from outside (a provider response), so every length is checked against the
 * buffer, every chunk's CRC is verified, and the decoded size is bounded before any inflation.
 */

export class PngError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PngError";
  }
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Does the buffer start with the PNG signature? */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= SIGNATURE.length && SIGNATURE.every((b, i) => bytes[i] === b);
}

interface Chunk {
  type: string;
  /** Offset of the chunk's length field. */
  start: number;
  /** Offset just past the chunk's CRC. */
  end: number;
  data: Buffer;
}

/** Every chunk up to and including IEND, verified. Bytes after IEND are ignored. */
function readChunks(bytes: Uint8Array): Chunk[] {
  if (!isPng(bytes)) throw new PngError("not a PNG (bad signature)");
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let offset: number = SIGNATURE.length;
  for (;;) {
    if (offset + 12 > view.length) throw new PngError("truncated PNG (no IEND chunk)");
    const length = view.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > view.length) {
      throw new PngError(`truncated PNG (a chunk of ${length} bytes runs past the end)`);
    }
    const type = view.toString("latin1", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new PngError("damaged PNG (invalid chunk type)");
    const crc = view.readUInt32BE(offset + 8 + length);
    if (crc32(view.subarray(offset + 4, offset + 8 + length)) !== crc) {
      throw new PngError(`damaged PNG (bad CRC in ${type})`);
    }
    chunks.push({ type, start: offset, end, data: view.subarray(offset + 8, offset + 8 + length) });
    offset = end;
    if (type === "IEND") return chunks;
  }
}

export interface PngHeader {
  width: number;
  height: number;
  /** 3 for RGB (colour type 2), 4 for RGBA (colour type 6). */
  channels: 3 | 4;
}

function headerOf(chunks: readonly Chunk[]): PngHeader {
  const ihdr = chunks[0];
  if (ihdr?.type !== "IHDR" || ihdr.data.length !== 13) {
    throw new PngError("damaged PNG (IHDR is not the first chunk)");
  }
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth: number = ihdr.data[8];
  const color: number = ihdr.data[9];
  const compression: number = ihdr.data[10];
  const filter: number = ihdr.data[11];
  const interlace: number = ihdr.data[12];
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) {
    throw new PngError(`invalid PNG size ${width}×${height}`);
  }
  if (compression !== 0 || filter !== 0) {
    throw new PngError(`invalid PNG (compression ${compression}, filter method ${filter})`);
  }
  if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) {
    throw new PngError(
      `unsupported PNG (bit depth ${depth}, colour type ${color}, interlace ${interlace}): ` +
        "only 8-bit RGB or RGBA, non-interlaced, is read",
    );
  }
  return { width, height, channels: color === 6 ? 4 : 3 };
}

/**
 * The image's size and channels from its header, without decoding the pixels: what a validator
 * checks (proportion, resolution, a size bound) before paying for a full decode. Throws
 * `PngError` for a file `decodePng` would refuse at the header.
 */
export function readPngHeader(bytes: Uint8Array): PngHeader {
  return headerOf(readChunks(bytes));
}

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, row-major, 8 bits per channel; alpha is 255 throughout for an RGB file. */
  rgba: Uint8Array;
  /** True when the file has an alpha channel (colour type 6), whatever its values. */
  hasAlpha: boolean;
}

export interface DecodePngOptions {
  /**
   * Refuse an image with more pixels than this before inflating anything, so a hostile or broken
   * file cannot make the server allocate without bound. Default 40 million (about 6300²).
   */
  maxPixels?: number;
}

const DEFAULT_MAX_PIXELS = 40_000_000;

function unfilter(raw: Buffer, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const src = rowStart + 1;
    const dst = y * stride;
    const up = dst - stride;
    switch (filter) {
      case 0:
        out.set(raw.subarray(src, src + stride), dst);
        break;
      case 1:
        for (let x = 0; x < stride; x += 1) {
          const a = x >= channels ? out[dst + x - channels] : 0;
          out[dst + x] = (raw[src + x] + a) & 0xff;
        }
        break;
      case 2:
        for (let x = 0; x < stride; x += 1) {
          const b = y > 0 ? out[up + x] : 0;
          out[dst + x] = (raw[src + x] + b) & 0xff;
        }
        break;
      case 3:
        for (let x = 0; x < stride; x += 1) {
          const a = x >= channels ? out[dst + x - channels] : 0;
          const b = y > 0 ? out[up + x] : 0;
          out[dst + x] = (raw[src + x] + ((a + b) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let x = 0; x < stride; x += 1) {
          const a = x >= channels ? out[dst + x - channels] : 0;
          const b = y > 0 ? out[up + x] : 0;
          const c = x >= channels && y > 0 ? out[up + x - channels] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          out[dst + x] = (raw[src + x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
        break;
      default:
        throw new PngError(`damaged PNG (bad filter type ${filter} on row ${y})`);
    }
  }
  return out;
}

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG. Throws `PngError` for anything else. */
export function decodePng(bytes: Uint8Array, options: DecodePngOptions = {}): DecodedPng {
  const chunks = readChunks(bytes);
  const { width, height, channels } = headerOf(chunks);
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS;
  if (width * height > maxPixels) {
    throw new PngError(`PNG of ${width}×${height} exceeds the ${maxPixels}-pixel limit`);
  }
  const idat = chunks.filter((c) => c.type === "IDAT").map((c) => c.data);
  if (idat.length === 0) throw new PngError("damaged PNG (no image data)");
  const expected = height * (width * channels + 1);
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  } catch (error) {
    throw new PngError(
      `damaged PNG (image data does not inflate to ${expected} bytes: ${(error as Error).message})`,
    );
  }
  if (raw.length !== expected) {
    throw new PngError(`damaged PNG (image data is ${raw.length} bytes, expected ${expected})`);
  }
  const pixels = unfilter(raw, width, height, channels);
  if (channels === 4) return { width, height, rgba: pixels, hasAlpha: true };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i];
    rgba[j + 1] = pixels[i + 1];
    rgba[j + 2] = pixels[i + 2];
    rgba[j + 3] = 255;
  }
  return { width, height, rgba, hasAlpha: false };
}

/**
 * The chunks `stripColorAndTextChunks` removes: every colour-space tag (gamma, chromaticities, an
 * ICC profile, the sRGB intent, coding-independent code points and HDR mastering metadata) and
 * every text chunk.
 *
 * Why (`docs/technology-decisions.md §8.2`): Chromium applies colour tags and the link preview's
 * rasterizer does not, so a tagged artwork would differ in tone between the live card and its
 * preview. Untagged, both read the pixels as sRGB. Text chunks carry nothing the card uses.
 */
export const STRIPPED_PNG_CHUNKS: readonly string[] = [
  "gAMA",
  "cHRM",
  "iCCP",
  "sRGB",
  "cICP",
  "mDCV",
  "cLLI",
  "iTXt",
  "tEXt",
  "zTXt",
];

const STRIPPED = new Set(STRIPPED_PNG_CHUNKS);

/**
 * The same PNG without the colour-space and text chunks (`STRIPPED_PNG_CHUNKS`). Every other chunk
 * is copied byte for byte, so the image data — and therefore every pixel — is unchanged; nothing
 * is re-encoded. Anything after IEND is dropped. Throws `PngError` for a damaged file.
 */
export function stripColorAndTextChunks(bytes: Uint8Array): Uint8Array {
  const chunks = readChunks(bytes);
  headerOf(chunks);
  const kept = chunks.filter((c) => !STRIPPED.has(c.type));
  const size = SIGNATURE.length + kept.reduce((n, c) => n + (c.end - c.start), 0);
  const out = new Uint8Array(size);
  out.set(SIGNATURE, 0);
  let offset: number = SIGNATURE.length;
  for (const c of kept) {
    out.set(bytes.subarray(c.start, c.end), offset);
    offset += c.end - c.start;
  }
  return out;
}

/** The chunk types of a PNG, in order (for tests and diagnostics). */
export function pngChunkTypes(bytes: Uint8Array): string[] {
  return readChunks(bytes).map((c) => c.type);
}
