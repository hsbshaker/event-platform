import { crc32, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { encodePng } from "@/lib/link-preview/test-artwork";

import {
  decodePng,
  isPng,
  pngChunkTypes,
  PngError,
  readPngHeader,
  STRIPPED_PNG_CHUNKS,
  stripColorAndTextChunks,
} from "./png.server";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array = new Uint8Array(0)): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function ihdr(width: number, height: number, depth = 8, color = 2, interlace = 0): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = depth;
  data[9] = color;
  data[12] = interlace;
  return chunk("IHDR", data);
}

function png(...chunks: Buffer[]): Uint8Array {
  return new Uint8Array(Buffer.concat([SIGNATURE, ...chunks]));
}

/** Deterministic pixels with variety in every channel. */
function pixels(width: number, height: number, channels: number): Uint8Array {
  const out = new Uint8Array(width * height * channels);
  for (let i = 0; i < out.length; i += 1) out[i] = (i * 37 + (i >> 3) * 11) & 0xff;
  return out;
}

/** Encode with filter type `y % 5` on row y, so every filter is exercised. */
function encodeFiltered(width: number, height: number, channels: 3 | 4, px: Uint8Array) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x += 1) {
      const v = px[y * stride + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      if (filter === 2) predictor = b;
      if (filter === 3) predictor = (a + b) >> 1;
      if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      raw[y * (stride + 1) + 1 + x] = (v - predictor) & 0xff;
    }
  }
  return png(
    ihdr(width, height, 8, channels === 4 ? 6 : 2),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND"),
  );
}

function toRgba(px: Uint8Array, channels: 3 | 4): Uint8Array {
  if (channels === 4) return px;
  const out = new Uint8Array((px.length / 3) * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    out.set(px.subarray(i, i + 3), j);
    out[j + 3] = 255;
  }
  return out;
}

describe("decodePng", () => {
  it("reads an RGB file as RGBA, alpha 255", () => {
    const rgb = pixels(7, 5, 3);
    const decoded = decodePng(encodePng(7, 5, rgb));
    expect(decoded).toMatchObject({ width: 7, height: 5, hasAlpha: false });
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(toRgba(rgb, 3)))).toBe(true);
  });

  it.each([3, 4] as const)("undoes every filter type (%i channels)", (channels) => {
    const px = pixels(9, 11, channels);
    const decoded = decodePng(encodeFiltered(9, 11, channels, px));
    expect(decoded.hasAlpha).toBe(channels === 4);
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(toRgba(px, channels)))).toBe(true);
  });

  it("reads the header without decoding", () => {
    expect(readPngHeader(encodePng(4, 6, pixels(4, 6, 3)))).toEqual({
      width: 4,
      height: 6,
      channels: 3,
    });
  });

  it("refuses formats it does not read, naming what it found", () => {
    const idat = chunk("IDAT", deflateSync(Buffer.alloc(10)));
    const cases: [Uint8Array, RegExp][] = [
      [png(ihdr(2, 2, 16, 2), idat, chunk("IEND")), /bit depth 16/],
      [png(ihdr(2, 2, 8, 3), idat, chunk("IEND")), /colour type 3/],
      [png(ihdr(2, 2, 8, 0), idat, chunk("IEND")), /colour type 0/],
      [png(ihdr(2, 2, 8, 2, 1), idat, chunk("IEND")), /interlace 1/],
    ];
    for (const [file, message] of cases) {
      expect(() => decodePng(file)).toThrow(PngError);
      expect(() => decodePng(file)).toThrow(message);
    }
  });

  it("refuses damaged files", () => {
    const good = encodePng(3, 3, pixels(3, 3, 3));
    expect(() => decodePng(good.subarray(0, good.length - 20))).toThrow(/truncated/);
    const badCrc = Uint8Array.from(good);
    badCrc[20] ^= 0xff; // inside IHDR's data
    expect(() => decodePng(badCrc)).toThrow(/bad CRC in IHDR/);
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/signature/);
    // Image data that inflates to the wrong size.
    const short = png(ihdr(3, 3), chunk("IDAT", deflateSync(Buffer.alloc(5))), chunk("IEND"));
    expect(() => decodePng(short)).toThrow(/expected 30/);
    const long = png(ihdr(3, 3), chunk("IDAT", deflateSync(Buffer.alloc(500))), chunk("IEND"));
    expect(() => decodePng(long)).toThrow(PngError);
    const badFilter = png(
      ihdr(1, 1),
      chunk("IDAT", deflateSync(Buffer.from([9, 0, 0, 0]))),
      chunk("IEND"),
    );
    expect(() => decodePng(badFilter)).toThrow(/bad filter type 9/);
    expect(() => decodePng(png(ihdr(1, 1), chunk("IEND")))).toThrow(/no image data/);
  });

  it("refuses an image over the pixel bound before inflating it", () => {
    const huge = png(
      ihdr(50_000, 50_000),
      chunk("IDAT", deflateSync(Buffer.alloc(1))),
      chunk("IEND"),
    );
    expect(() => decodePng(huge)).toThrow(/exceeds the 40000000-pixel limit/);
    expect(() => decodePng(encodePng(4, 4, pixels(4, 4, 3)), { maxPixels: 15 })).toThrow(/limit/);
  });

  it("recognises the signature", () => {
    expect(isPng(encodePng(1, 1, new Uint8Array(3)))).toBe(true);
    expect(isPng(new Uint8Array([0x89, 0x50]))).toBe(false);
  });
});

describe("stripColorAndTextChunks (docs/technology-decisions.md §8.2)", () => {
  const width = 6;
  const height = 4;
  const rgb = pixels(width, height, 3);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    Buffer.from(rgb.subarray(y * width * 3, (y + 1) * width * 3)).copy(
      raw,
      y * (width * 3 + 1) + 1,
    );
  }
  const compressed = deflateSync(raw);
  const tagged = png(
    ihdr(width, height),
    chunk("sRGB", Uint8Array.of(0)),
    chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])),
    chunk("cHRM", Buffer.alloc(32, 1)),
    chunk("iCCP", Buffer.concat([Buffer.from("icc\0\0", "latin1"), deflateSync(Buffer.alloc(64))])),
    chunk("cICP", Buffer.from([1, 13, 0, 1])),
    chunk("tEXt", Buffer.from("Software\0image model", "latin1")),
    chunk("zTXt", Buffer.concat([Buffer.from("Comment\0\0", "latin1"), deflateSync("x")])),
    chunk("iTXt", Buffer.from("Description\0\0\0\0\0painted", "latin1")),
    chunk("pHYs", Buffer.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])),
    // Image data split across two chunks, to show both are kept as they are.
    chunk("IDAT", compressed.subarray(0, 10)),
    chunk("IDAT", compressed.subarray(10)),
    chunk("IEND"),
    Buffer.from("trailing junk"),
  );

  it("removes the colour-space and text chunks and keeps the rest in order", () => {
    const stripped = stripColorAndTextChunks(tagged);
    expect(pngChunkTypes(stripped)).toEqual(["IHDR", "pHYs", "IDAT", "IDAT", "IEND"]);
    for (const type of ["gAMA", "cHRM", "iCCP", "sRGB", "iTXt", "tEXt", "zTXt"]) {
      expect(STRIPPED_PNG_CHUNKS).toContain(type);
    }
  });

  it("leaves the pixels byte-identical, without re-encoding", () => {
    const stripped = stripColorAndTextChunks(tagged);
    const before = decodePng(tagged);
    const after = decodePng(stripped);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(Buffer.from(after.rgba).equals(Buffer.from(before.rgba))).toBe(true);
    expect(Buffer.from(after.rgba).equals(Buffer.from(toRgba(rgb, 3)))).toBe(true);
    // The compressed image data itself is carried over untouched.
    const idat = (bytes: Uint8Array) => {
      const b = Buffer.from(bytes);
      const out: Buffer[] = [];
      for (let o = 8, type = ""; type !== "IEND";) {
        const len = b.readUInt32BE(o);
        type = b.toString("latin1", o + 4, o + 8);
        if (type === "IDAT") out.push(b.subarray(o + 8, o + 8 + len));
        o += 12 + len;
      }
      return Buffer.concat(out);
    };
    expect(idat(stripped).equals(compressed)).toBe(true);
  });

  it("returns an untagged file unchanged", () => {
    const plain = encodePng(width, height, rgb);
    expect(Buffer.from(stripColorAndTextChunks(plain)).equals(Buffer.from(plain))).toBe(true);
  });

  it("refuses a damaged file rather than passing it on", () => {
    expect(() => stripColorAndTextChunks(tagged.subarray(0, 60))).toThrow(PngError);
  });
});
