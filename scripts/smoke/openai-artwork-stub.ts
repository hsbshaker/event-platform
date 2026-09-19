/**
 * An offline stand-in for the `openai` package, for rehearsing the artwork spike at zero cost.
 *
 * Aliased over the real package by `vitest.artwork-spike.config.mts` when
 * `VITEST_SMOKE_OPENAI_STUB` is set. Everything below the provider — the boundary, the spend gate,
 * the raster inspection, the metrics, the compiler, geometry verification, the screenshots and the
 * evidence writer — then runs exactly as it will on the paid call, against bytes that are a real
 * PNG rather than a fixture nobody decoded.
 *
 * The image it returns is deliberately *shaped* like the brief and deliberately not artwork: a
 * soft blob weighted to the upper left, inset from every edge, with the lower right left clear. It
 * exists so the measurements have something with known answers to report, and so a rehearsal
 * catches a metric wired to the wrong axis. **No screenshot of it is evidence about anything.**
 */
import { deflateSync } from "node:zlib";

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), body])), body.length + 8);
  return out;
}

/** A 1024×1024 RGBA PNG: olive/terracotta mass upper-left, clear lower-right, inset all round. */
function stubPng(size = 1024): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size * 0.34;
  const cy = size * 0.36;
  const radius = size * 0.3;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      const alpha = d >= 1 ? 0 : Math.round(255 * Math.min(1, (1 - d) * 3));
      const warm = (x + y) % 97 < 24;
      const at = row + 1 + x * 4;
      raw[at] = warm ? 0xc7 : 0x65;
      raw[at + 1] = warm ? 0x5b : 0x70;
      raw[at + 2] = warm ? 0x3f : 0x4a;
      raw[at + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export default class OpenAI {
  constructor(_options?: unknown) {}

  readonly images = {
    generate: async (
      body: { size?: string },
      _options?: unknown,
    ): Promise<Record<string, unknown>> => {
      const size = Number((body.size ?? "1024x1024").split("x")[0]);
      const png = stubPng(size);
      // Token counts in the range OpenAI's own rate card makes plausible, so the rehearsal's cost
      // arithmetic exercises real numbers rather than zeros.
      return {
        data: [{ b64_json: png.toString("base64") }],
        usage: {
          input_tokens: 420,
          output_tokens: 6_240,
          input_tokens_details: { text_tokens: 420, image_tokens: 0, cached_tokens: 0 },
        },
        _request_id: "req_rehearsal_offline",
      };
    },
  };
}
