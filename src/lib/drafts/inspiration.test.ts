import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  isAllowedMimeType,
  MAX_FILE_BYTES,
  MAX_FILES_PER_DRAFT,
  sniffImageType,
} from "./inspiration";

/**
 * Upload validation for private inspiration (spec.md §7.2, §27: private, strictly limited,
 * short retention). The storage and re-parenting paths are covered in tests/db/phase2.test.ts.
 */

function bytes(...values: number[]): Uint8Array {
  const out = new Uint8Array(32);
  out.set(values);
  return out;
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

function webp(): Uint8Array {
  const out = new Uint8Array(32);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return out;
}

function heif(brand: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  out.set(
    [...brand].map((c) => c.charCodeAt(0)),
    8,
  );
  return out;
}

describe("inspiration limits", () => {
  it("allows only the image types the composer accepts", () => {
    expect([...ALLOWED_MIME_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
      "image/heif",
    ]);
    for (const type of ALLOWED_MIME_TYPES) expect(isAllowedMimeType(type)).toBe(true);
    for (const type of ["image/gif", "image/svg+xml", "application/pdf", "text/html", ""]) {
      expect(isAllowedMimeType(type), type).toBe(false);
    }
  });

  it("keeps the documented size and count bounds", () => {
    // Must stay under the 4.5 MB serverless request-body limit: the route buffers the
    // whole body, so a larger documented ceiling would be rejected before our code runs.
    expect(MAX_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_FILE_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(MAX_FILES_PER_DRAFT).toBe(6);
  });
});

describe("content sniffing", () => {
  it("recognises each accepted container from its signature", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(webp())).toBe("image/webp");
    expect(sniffImageType(heif("heic"))).toBe("image/heic");
    expect(sniffImageType(heif("mif1"))).toBe("image/heif");
  });

  it("rejects bytes that are not one of those containers", () => {
    expect(sniffImageType(GIF)).toBeNull();
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(sniffImageType(bytes(0x3c, 0x73, 0x76, 0x67))).toBeNull(); // <svg
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });

  it("does not trust a declared type: a PDF labelled image/png still fails", () => {
    const pdf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(sniffImageType(pdf)).toBeNull();
  });

  it("does not mistake a RIFF container that is not WebP", () => {
    const wav = new Uint8Array(32);
    wav.set([0x52, 0x49, 0x46, 0x46], 0);
    wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
    expect(sniffImageType(wav)).toBeNull();
  });
});
