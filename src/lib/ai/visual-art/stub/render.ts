import "server-only";

/**
 * The deterministic PNG encoder that produces this directory's stub assets.
 *
 * **These are not artwork.** They are four flat, machine-drawn test cards — a diagonal band and a
 * corner block in two colours — whose only job is to exercise the boundary: two aspect shapes, two
 * with a real alpha channel and two without, so `./provider.ts` can answer a brief that requires
 * transparency and one that does not. Nothing here has anything to do with what `spec.md §7.6a`
 * approves; a page that rendered one of these would be visibly broken, which is the intended
 * property of a stub.
 *
 * # Determinism
 *
 * The same spec always produces the same bytes, on every machine and every Node version. That is
 * why `deflateSync` is called at **level 0** — stored DEFLATE blocks, no compression: compression
 * output is a property of the zlib build, and a stub asset whose bytes moved with the runtime
 * would make `./asset-drift.test.ts` fail for a reason that has nothing to do with this code. The
 * assets are a few hundred bytes either way.
 *
 * Written out rather than pulled in for the same reason `../raster.ts` is: a PNG writer for four
 * flat test cards is forty lines, and a dependency that could encode anything would be a much
 * larger surface for it.
 */
import { deflateSync } from "node:zlib";

export interface StubImageSpec {
  readonly width: number;
  readonly height: number;
  /**
   * Whether to emit an RGBA image whose corner block is genuinely transparent.
   *
   * `false` emits RGB — not RGBA-with-opaque-alpha. The distinction is the one the whole
   * transparency check exists for: an opaque stub must be *verifiably* opaque, so it must not
   * carry an alpha channel it never uses.
   */
  readonly alpha: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * The test card itself: a flat field, a diagonal band, and a corner block that is the transparent
 * one on an alpha asset. Pure arithmetic on the pixel coordinates, so it is identical everywhere.
 */
function sample(x: number, y: number, width: number, height: number, alpha: boolean): number[] {
  const onBand = Math.abs(((x + y) % 24) - 12) < 4;
  const inCorner = x < Math.floor(width / 3) && y < Math.floor(height / 3);
  const rgb = onBand ? [216, 32, 128] : [232, 230, 226];
  if (!alpha) return rgb;
  // A hole and a half-opaque edge, so `alphaUsed` is measurably true rather than merely declared.
  const a = inCorner ? 0 : onBand ? 128 : 255;
  return [...rgb, a];
}

/** Encode one stub image. Deterministic for a given spec. */
export function stubArtworkPng(spec: StubImageSpec): Uint8Array {
  const { width, height, alpha } = spec;
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0; // filter type 0: none, so the bytes are the samples
    for (let x = 0; x < width; x += 1) {
      const pixel = sample(x, y, width, height, alpha);
      for (let c = 0; c < channels; c += 1) raw[rowStart + 1 + x * channels + c] = pixel[c];
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // colour type: RGBA or RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace: none, so `../raster.ts` can scan it

  const idat = new Uint8Array(deflateSync(Buffer.from(raw), { level: 0 }));

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
