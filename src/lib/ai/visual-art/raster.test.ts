/**
 * Transparency is measured, not assumed — `spec.md §7.6a`, `docs/product-doctrine.md §10`.
 *
 * The case that matters most is the last one: a well-formed RGBA PNG whose alpha is 255
 * everywhere. A check that stopped at the container header would pass it, and a transparent-
 * background role would then be filled with an opaque rectangle.
 */
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { inspectRaster, transparencyOf } from "./raster";
import { stubArtworkPng } from "./stub/render";

function expectOk(bytes: Uint8Array) {
  const result = inspectRaster(bytes);
  if (!result.ok) throw new Error(`expected an inspection, got: ${result.detail}`);
  return result.inspection;
}

describe("PNG", () => {
  it("reads geometry and measures real transparency", () => {
    const inspection = expectOk(stubArtworkPng({ width: 64, height: 24, alpha: true }));
    expect(inspection.format).toBe("png");
    expect(inspection.width).toBe(64);
    expect(inspection.height).toBe(24);
    expect(inspection.alphaChannel).toBe(true);
    expect(inspection.alphaUsed).toBe(true);
    expect(transparencyOf(inspection)).toBe("verified_present");
  });

  it("reports an RGB image as verifiably opaque", () => {
    const inspection = expectOk(stubArtworkPng({ width: 32, height: 32, alpha: false }));
    expect(inspection.alphaChannel).toBe(false);
    expect(inspection.alphaUsed).toBe(false);
    expect(transparencyOf(inspection)).toBe("verified_absent");
  });

  it("calls an all-opaque RGBA image what it is: no transparency", () => {
    // The documented image-model failure mode — an alpha channel that is 255 everywhere — and the
    // reason `alphaUsed` exists beside `alphaChannel`.
    const opaqueRgba = buildRgbaPng(4, 4, () => [10, 20, 30, 255]);
    const inspection = expectOk(opaqueRgba);
    expect(inspection.alphaChannel).toBe(true);
    expect(inspection.alphaUsed).toBe(false);
    expect(transparencyOf(inspection)).toBe("verified_absent");
  });

  it("measures transparency through every scanline filter", () => {
    // Filters are per-scanline and a real encoder picks them adaptively; getting one wrong would
    // read the wrong byte as alpha and answer the whole question incorrectly.
    for (const filter of [0, 1, 2, 3, 4]) {
      const png = buildRgbaPng(
        6,
        6,
        (x, y) => [x * 9, y * 9, 40, x === 1 && y === 1 ? 0 : 255],
        filter,
      );
      const inspection = expectOk(png);
      expect(`${filter}:${String(inspection.alphaUsed)}`).toBe(`${filter}:true`);
    }
  });

  it("refuses bytes it cannot decode", () => {
    expect(inspectRaster(new Uint8Array(0)).ok).toBe(false);
    expect(inspectRaster(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])).ok).toBe(false);
    const truncated = stubArtworkPng({ width: 32, height: 32, alpha: true }).subarray(0, 20);
    expect(inspectRaster(truncated).ok).toBe(false);
  });
});

describe("other containers", () => {
  it("reads a JPEG frame header and knows JPEG cannot be transparent", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00,
      // SOF0, length 17, precision 8, height 0x0040, width 0x0080
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11,
      0x01, 0x03, 0x11, 0x01,
    ]);
    const inspection = expectOk(jpeg);
    expect(inspection.format).toBe("jpeg");
    expect(inspection.width).toBe(128);
    expect(inspection.height).toBe(64);
    expect(transparencyOf(inspection)).toBe("verified_absent");
  });

  it("reads a lossless WebP's own alpha_is_used bit", () => {
    // VP8L states the measured fact directly, so it is the one WebP shape that can be verified.
    const webp = buildVp8l(20, 10, true);
    const inspection = expectOk(webp);
    expect(inspection.format).toBe("webp");
    expect(inspection.width).toBe(20);
    expect(inspection.height).toBe(10);
    expect(transparencyOf(inspection)).toBe("verified_present");
  });

  it("leaves an extended WebP's declared alpha unverified rather than assuming it", () => {
    const webp = buildVp8x(300, 200, true);
    const inspection = expectOk(webp);
    expect(inspection.alphaChannel).toBe(true);
    expect(inspection.alphaUsed).toBeNull();
    // Unknown is not a pass: `./compliance.ts` fails a transparency-required role on this.
    expect(transparencyOf(inspection)).toBe("unverified");
  });

  it("refuses a format it cannot inspect at all", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0]);
    const result = inspectRaster(gif);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.detail).toContain("not PNG, JPEG or WebP");
  });
});

/* ------------------------------------------------------------------ tiny builders */

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An RGBA PNG with every scanline written under one chosen filter type. */
function buildRgbaPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number[],
  filterType = 0,
): Uint8Array {
  const stride = width * 4;
  const plain = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sample = pixel(x, y);
      for (let c = 0; c < 4; c += 1) plain[y * stride + x * 4 + c] = sample[c];
    }
  }
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + stride)] = filterType;
    for (let i = 0; i < stride; i += 1) {
      const value = plain[y * stride + i];
      const left = i >= 4 ? plain[y * stride + i - 4] : 0;
      const up = y > 0 ? plain[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= 4 ? plain[(y - 1) * stride + i - 4] : 0;
      let encoded: number;
      switch (filterType) {
        case 1:
          encoded = value - left;
          break;
        case 2:
          encoded = value - up;
          break;
        case 3:
          encoded = value - ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          encoded = value - (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          encoded = value;
      }
      raw[y * (1 + stride) + 1 + i] = encoded & 0xff;
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(Buffer.from(raw), { level: 0 }))),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function riff(chunkType: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + 8 + body.length);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i += 1) out[i] = "RIFF".charCodeAt(i);
  view.setUint32(4, 4 + 8 + body.length, true);
  for (let i = 0; i < 4; i += 1) out[8 + i] = "WEBP".charCodeAt(i);
  for (let i = 0; i < 4; i += 1) out[12 + i] = chunkType.charCodeAt(i);
  view.setUint32(16, body.length, true);
  out.set(body, 20);
  return out;
}

function buildVp8l(width: number, height: number, alphaUsed: boolean): Uint8Array {
  const body = new Uint8Array(9);
  body[0] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14) | ((alphaUsed ? 1 : 0) << 28);
  new DataView(body.buffer).setUint32(1, bits >>> 0, true);
  return riff("VP8L", body);
}

function buildVp8x(width: number, height: number, alpha: boolean): Uint8Array {
  const body = new Uint8Array(10);
  body[0] = alpha ? 0x10 : 0x00;
  const w = width - 1;
  const h = height - 1;
  body[4] = w & 0xff;
  body[5] = (w >> 8) & 0xff;
  body[6] = (w >> 16) & 0xff;
  body[7] = h & 0xff;
  body[8] = (h >> 8) & 0xff;
  body[9] = (h >> 16) & 0xff;
  return riff("VP8X", body);
}
