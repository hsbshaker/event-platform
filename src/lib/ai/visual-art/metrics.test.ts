import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { decodePng, EDGE_RISK_FRACTION, measureArtwork } from "./metrics";

/** A real PNG encoder, so the decoder is tested against bytes rather than against itself. */
function encodePng(
  width: number,
  height: number,
  rgba: (x: number, y: number) => [number, number, number, number],
  colorType: 2 | 6 = 6,
): Uint8Array {
  const channels = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * channels + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgba(x, y);
      const at = row + 1 + x * channels;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      if (channels === 4) raw[at + 3] = a;
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    out.writeUInt32BE(
      crc(Buffer.concat([Buffer.from(type, "ascii"), body])) >>> 0,
      body.length + 8,
    );
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CLEAR: [number, number, number, number] = [0, 0, 0, 0];
const OLIVE: [number, number, number, number] = [0x65, 0x70, 0x4a, 255];

describe("the decoder reads real PNG bytes", () => {
  it("round-trips dimensions and pixels", () => {
    const png = encodePng(4, 3, (x, y) => [x * 10, y * 20, 7, 255]);
    const out = decodePng(png);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.image.width).toBe(4);
    expect(out.image.height).toBe(3);
    const at = (x: number, y: number) => [
      ...out.image.pixels.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4),
    ];
    expect(at(2, 1)).toEqual([20, 20, 7, 255]);
  });

  it("gives an RGB PNG full alpha rather than pretending it has none", () => {
    const out = decodePng(encodePng(2, 2, () => [1, 2, 3, 0], 2));
    if (!out.ok) throw new Error("unreachable");
    expect([...out.image.pixels.slice(0, 4)]).toEqual([1, 2, 3, 255]);
  });

  it("refuses what it cannot measure honestly instead of guessing", () => {
    expect(decodePng(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, reason: "not a PNG" });
    const truncated = encodePng(2, 2, () => OLIVE).slice(0, 20);
    expect(decodePng(truncated).ok).toBe(false);
  });
});

describe("alpha is counted, never assumed", () => {
  it("separates fully transparent, partial and fully opaque pixels", () => {
    // 4x1: clear, half-alpha, opaque, opaque.
    const png = encodePng(4, 1, (x) => (x === 0 ? CLEAR : x === 1 ? [10, 20, 30, 128] : OLIVE));
    const m = measureArtwork(png);
    expect(m.alpha.fullyTransparent).toBe(1);
    expect(m.alpha.partiallyTransparent).toBe(1);
    expect(m.alpha.fullyOpaque).toBe(2);
    expect(m.alpha.totalPixels).toBe(4);
    expect(m.alpha.fullyOpaquePct).toBe(50);
  });

  it("names an opaque rectangle for what it is when transparency was requested", () => {
    const m = measureArtwork(encodePng(8, 8, () => OLIVE));
    expect(m.alpha.looksLikeOpaqueCanvas).toBe(true);
    expect(m.alpha.allEdgesClear).toBe(false);
    expect(m.alpha.clearEdges).toEqual({ top: false, right: false, bottom: false, left: false });
  });

  it("reports each outer edge separately, so a one-sided bleed is visible", () => {
    // Content fills the left column only; the other three edges stay clear.
    const m = measureArtwork(encodePng(8, 8, (x) => (x === 0 ? OLIVE : CLEAR)));
    expect(m.alpha.clearEdges).toEqual({ top: false, right: true, bottom: false, left: false });
    expect(m.alpha.allEdgesClear).toBe(false);
  });

  it("finds all four edges clear when the subject is inset", () => {
    const m = measureArtwork(
      encodePng(10, 10, (x, y) => (x >= 2 && x <= 7 && y >= 2 && y <= 7 ? OLIVE : CLEAR)),
    );
    expect(m.alpha.allEdgesClear).toBe(true);
    expect(m.alpha.looksLikeOpaqueCanvas).toBe(false);
  });
});

describe("crop safety is measured from the bounding box", () => {
  it("bounds the present content and reports margins both ways", () => {
    const m = measureArtwork(
      encodePng(100, 100, (x, y) => (x >= 20 && x <= 79 && y >= 10 && y <= 89 ? OLIVE : CLEAR)),
    );
    expect(m.crop.box).toEqual({ top: 10, left: 20, right: 79, bottom: 89, width: 60, height: 80 });
    expect(m.crop.marginsPx).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(m.crop.marginsPct).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(m.crop.edgeRisk).toBe(false);
  });

  it("raises edge risk only for the edges content actually reaches", () => {
    // Content touches the left edge exactly; 2% of 100px is 2px, so left is at risk and no other.
    const m = measureArtwork(encodePng(100, 100, (x, y) => (x <= 50 && y >= 50 ? OLIVE : CLEAR)));
    expect(m.crop.edgeRisk).toBe(true);
    expect(m.crop.edgesAtRisk).toEqual(["bottom", "left"]);
    expect(EDGE_RISK_FRACTION).toBe(0.02);
  });

  it("says nothing is present rather than inventing a box for an empty image", () => {
    const m = measureArtwork(encodePng(6, 6, () => CLEAR));
    expect(m.crop.box).toBeNull();
    expect(m.crop.edgeRisk).toBe(false);
    expect(m.placement.centroid).toBeNull();
  });
});

describe("placement is an objective proxy for the brief", () => {
  it("puts the centroid where the mass is", () => {
    // Everything in the top-left quadrant.
    const m = measureArtwork(encodePng(100, 100, (x, y) => (x < 50 && y < 50 ? OLIVE : CLEAR)));
    expect(m.placement.centroid!.x).toBeLessThan(0.3);
    expect(m.placement.centroid!.y).toBeLessThan(0.3);
    expect(m.placement.quadrantShare.topLeft).toBe(1);
    expect(m.placement.quadrantShare.bottomRight).toBe(0);
  });

  it("measures how open a named quadrant is, which is what a negative-space brief asks for", () => {
    const m = measureArtwork(encodePng(100, 100, (x, y) => (x < 50 && y < 50 ? OLIVE : CLEAR)));
    expect(m.placement.quadrantTransparentRatio.bottomRight).toBe(1);
    expect(m.placement.quadrantTransparentRatio.topLeft).toBe(0);
  });

  it("weights by alpha, so a faint wash does not count like a solid subject", () => {
    const faintLeft = measureArtwork(
      encodePng(100, 100, (x) => (x < 50 ? [1, 2, 3, 32] : [1, 2, 3, 255])),
    );
    expect(faintLeft.placement.centroid!.x).toBeGreaterThan(0.5);
  });
});

describe("palette is sampled from near-opaque pigment only", () => {
  it("reports the dominant colours and their share", () => {
    const m = measureArtwork(
      encodePng(100, 100, (x) => (x < 75 ? OLIVE : [0xc7, 0x5b, 0x3f, 255])),
      [],
    );
    expect(m.palette.dominant[0].share).toBeCloseTo(0.75, 2);
    expect(m.palette.dominant[0].hex).toBe("#65704A");
  });

  it("reports how close the artwork came to each intended colour", () => {
    const m = measureArtwork(
      encodePng(20, 20, () => OLIVE),
      ["#65704A", "#FFFFFF"],
    );
    const olive = m.palette.nearestToIntended.find((p) => p.intended === "#65704A")!;
    expect(olive.distance).toBe(0);
    expect(olive.share).toBe(1);
    const white = m.palette.nearestToIntended.find((p) => p.intended === "#FFFFFF")!;
    expect(white.distance).toBeGreaterThan(100);
    expect(white.share).toBe(0);
  });

  it("ignores translucent edge pixels, which are blends rather than chosen colour", () => {
    const m = measureArtwork(
      encodePng(10, 10, (x) => (x < 5 ? [255, 0, 0, 100] : OLIVE)),
      [],
    );
    expect(m.palette.dominant).toHaveLength(1);
    expect(m.palette.dominant[0].hex).toBe("#65704A");
  });
});
