/**
 * Synthetic artwork for the link-preview development fixture and its tests: a plain PNG encoder and
 * a deterministic stand-in for a generated artwork (a soft vertical wash with the text zone a shade
 * lighter). Never shown to a host or guest; real previews use the design's own artwork.
 */

import { deflateSync } from "node:zlib";

import type { CardZone } from "@/lib/card/layouts";
import { CARD_CANVAS, type CardProportion } from "@/lib/card/shapes";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An 8-bit RGB PNG from row-major RGB pixels. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error("pixel buffer size mismatch");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      raw,
      y * (width * 3 + 1) + 1,
    );
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}

type Rgb = readonly [number, number, number];

/** A flat artwork of one colour. */
export function flatArtwork(width: number, height: number, color: Rgb): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) rgb.set(color, i);
  return encodePng(width, height, rgb);
}

/**
 * A stand-in for generated artwork at the proportion's raster (half the card-unit canvas): a
 * vertical wash from `top` to `bottom`, with `zone` (card units) a shade lighter.
 */
export function washArtwork(
  proportion: CardProportion,
  zone: CardZone | null,
  top: Rgb = [196, 214, 200],
  bottom: Rgb = [224, 200, 170],
): Uint8Array {
  const canvas = CARD_CANVAS[proportion];
  const width = canvas.width / 2;
  const height = canvas.height / 2;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const inZone =
        zone !== null &&
        x * 2 >= zone.x &&
        x * 2 < zone.x + zone.width &&
        y * 2 >= zone.y &&
        y * 2 < zone.y + zone.height;
      const i = (y * width + x) * 3;
      for (let k = 0; k < 3; k += 1) {
        const v = top[k] + (bottom[k] - top[k]) * t;
        rgb[i + k] = Math.round(inZone ? v + (255 - v) * 0.5 : v);
      }
    }
  }
  return encodePng(width, height, rgb);
}
