import { describe, expect, it, vi } from "vitest";
import {
  convertHeicToJpeg,
  HEIC_UNSUPPORTED_MESSAGE,
  HeicDecodeError,
  isHeicFile,
  type DecodedImage,
} from "./heic-to-jpeg";

function fakeImage(width: number, height: number, blob: Blob | null = new Blob(["jpg"])) {
  const draw = vi.fn(async () => blob);
  const release = vi.fn();
  const image: DecodedImage = { width, height, draw, release };
  return { image, draw, release };
}
const heic = (name = "IMG_0001.HEIC") => new File(["x"], name, { type: "image/heic" });

describe("isHeicFile", () => {
  it("matches HEIC/HEIF types, and extensions only when the type is empty", () => {
    expect(isHeicFile({ name: "a.heic", type: "image/heic" })).toBe(true);
    expect(isHeicFile({ name: "a.bin", type: "image/heif" })).toBe(true);
    expect(isHeicFile({ name: "A.HEIC", type: "" })).toBe(true);
    expect(isHeicFile({ name: "a.heif", type: "" })).toBe(true);
    expect(isHeicFile({ name: "a.heic", type: "image/jpeg" })).toBe(false);
    expect(isHeicFile({ name: "a.png", type: "" })).toBe(false);
  });
});

describe("convertHeicToJpeg", () => {
  it("scales the long side to 2048, keeping the aspect ratio", async () => {
    const wide = fakeImage(4032, 3024);
    await convertHeicToJpeg(heic(), { decode: async () => wide.image });
    expect(wide.draw).toHaveBeenCalledWith({ width: 2048, height: 1536 });
    const tall = fakeImage(3000, 4000);
    await convertHeicToJpeg(heic(), { decode: async () => tall.image });
    expect(tall.draw).toHaveBeenCalledWith({ width: 1536, height: 2048 });
  });

  it("never upscales", async () => {
    const { image, draw } = fakeImage(800, 600);
    await convertHeicToJpeg(heic(), { decode: async () => image });
    expect(draw).toHaveBeenCalledWith({ width: 800, height: 600 });
  });

  it("names the file <base>.jpg with type image/jpeg and releases the image", async () => {
    const { image, release } = fakeImage(100, 100);
    const out = await convertHeicToJpeg(heic("Birthday.party.HEIC"), {
      decode: async () => image,
    });
    expect(out.name).toBe("Birthday.party.jpg");
    expect(out.type).toBe("image/jpeg");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("turns a decode failure into HeicDecodeError with the user message", async () => {
    const err = await convertHeicToJpeg(heic(), {
      decode: async () => {
        throw new Error("unsupported");
      },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HeicDecodeError);
    expect((err as Error).message).toBe(HEIC_UNSUPPORTED_MESSAGE);
    expect(HEIC_UNSUPPORTED_MESSAGE).toBe(
      "This browser can't open HEIC photos — please add a JPEG or PNG instead.",
    );
  });

  it("treats a failed encode as HeicDecodeError and still releases", async () => {
    const { image, release } = fakeImage(100, 100, null);
    await expect(convertHeicToJpeg(heic(), { decode: async () => image })).rejects.toBeInstanceOf(
      HeicDecodeError,
    );
    expect(release).toHaveBeenCalledTimes(1);
  });
});
