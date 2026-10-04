/**
 * The fixtures read Chromium's screenshots (8-bit, non-interlaced RGB/RGBA PNGs) with the same
 * decoder production uses for generated artwork, so there is one PNG reader in the repository.
 */
import type { DecodedPng as DecodedArtwork } from "@/lib/card/png.server";

export { decodePng } from "@/lib/card/png.server";

/** A decoded image as the fixtures use it: size and RGBA pixels. */
export type DecodedPng = Pick<DecodedArtwork, "width" | "height" | "rgba">;
