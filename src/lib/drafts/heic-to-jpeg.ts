/**
 * Browser-side HEIC/HEIF to JPEG conversion for inspiration photos (docs/CHANGELOG-v7.md,
 * "HEIC inspiration photos are converted in the browser").
 *
 * The image model takes only PNG, JPEG and WebP, and the server has no HEIC decoder by design.
 * Browsers that decode HEIC natively (Safari 17+, iOS 17+) turn the photo into a JPEG here,
 * before upload. A browser that cannot read it raises `HeicDecodeError`. Client-only: no
 * server imports, no network.
 */

export const HEIC_MAX_LONG_SIDE = 2048;
export const HEIC_JPEG_QUALITY = 0.9;
export const HEIC_UNSUPPORTED_MESSAGE =
  "This browser can't open HEIC photos — please add a JPEG or PNG instead.";

export class HeicDecodeError extends Error {
  constructor(message: string = HEIC_UNSUPPORTED_MESSAGE) {
    super(message);
    this.name = "HeicDecodeError";
  }
}

/** True for HEIC/HEIF by MIME type, or by extension when the browser reports no type. */
export function isHeicFile(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return type === "" && /\.(heic|heif)$/i.test(file.name);
}

/** A decoded image the caller must release once it has been drawn. */
export interface DecodedImage {
  width: number;
  height: number;
  draw: (target: { width: number; height: number }) => Promise<Blob | null>;
  release: () => void;
}

export interface HeicDeps {
  decode: (file: File) => Promise<DecodedImage>;
}

/** Longer side at most `HEIC_MAX_LONG_SIDE`; never scaled up. */
export function scaledSize(width: number, height: number): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= HEIC_MAX_LONG_SIDE) return { width, height };
  const scale = HEIC_MAX_LONG_SIDE / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function exportJpeg(
  source: CanvasImageSource,
  size: { width: number; height: number },
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, size.width, size.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", HEIC_JPEG_QUALITY));
}

async function decodeWithBitmap(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw: (size) => exportJpeg(bitmap, size),
    release: () => bitmap.close(),
  };
}

async function decodeWithImageElement(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (size) => exportJpeg(img, size),
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

const browserDeps: HeicDeps = {
  async decode(file) {
    try {
      return await decodeWithBitmap(file);
    } catch {
      return decodeWithImageElement(file);
    }
  },
};

/**
 * Decodes the file with the browser and re-encodes it as `<base name>.jpg` (image/jpeg).
 * Any failure to decode or encode is a `HeicDecodeError`.
 */
export async function convertHeicToJpeg(file: File, deps: HeicDeps = browserDeps): Promise<File> {
  let image: DecodedImage;
  try {
    image = await deps.decode(file);
  } catch {
    throw new HeicDecodeError();
  }
  try {
    if (!(image.width > 0) || !(image.height > 0)) throw new HeicDecodeError();
    const blob = await image.draw(scaledSize(image.width, image.height));
    if (!blob || blob.size === 0) throw new HeicDecodeError();
    const base = file.name.replace(/\.[^./\\]*$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch (error) {
    throw error instanceof HeicDecodeError ? error : new HeicDecodeError();
  } finally {
    image.release();
  }
}
