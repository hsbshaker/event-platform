import { describe, expect, it, vi } from "vitest";

import { InvalidCardDataError } from "@/lib/card/card-data";
import type { CardPreviewData } from "@/lib/card/preview-svg.server";
import type { TextBox } from "@/lib/card/text-box";
import { UndrawableTextError } from "@/lib/card/text/glyph-outlines";

import { previewImage } from "./preview-image.server";
import { flatArtwork } from "./test-artwork";

const BOX: TextBox = {
  id: "title",
  source: { kind: "wording", slot: "title" },
  x: 120,
  y: 800,
  width: 760,
  rotation: 0,
  font: { family: "Playfair Display", weight: 400, italic: false },
  size: 104,
  color: "#3A2A1E",
  align: "center",
  letterSpacing: 0,
  lineHeight: 1.05,
  textCase: "none",
  z: 0,
  lines: ["A Little Wild One"],
};

const card = (over: Partial<CardPreviewData> = {}): CardPreviewData => ({
  shape: "rectangle",
  artwork: { bytes: flatArtwork(10, 14, [232, 220, 200]), proportion: "5:7" },
  boxes: [BOX],
  ...over,
});

describe("previewImage", () => {
  it("refuses malformed card data before loading any font", async () => {
    const malformed: CardPreviewData[] = [
      card({ boxes: [{ ...BOX, font: { family: "", weight: 400, italic: false } }] }),
      card({ boxes: [BOX, BOX] }),
      card({ boxes: [{ ...BOX, color: "red" }] }),
      card({ shape: "hexagon" as CardPreviewData["shape"] }),
      card({ artwork: { bytes: new Uint8Array([1, 2, 3]), proportion: "5:7" } }),
    ];
    for (const data of malformed) {
      const loadCardFont = vi.fn();
      await expect(previewImage({ kind: "card", card: data }, { loadCardFont })).rejects.toThrow(
        InvalidCardDataError,
      );
      expect(loadCardFont).not.toHaveBeenCalled();
    }
  });

  it("refuses a face that is not curated, which a browser would set in a fallback face", async () => {
    for (const font of [
      { family: "Playfair Display", weight: 500, italic: false },
      { family: "Playfair Display", weight: 400, italic: true },
      { family: "Comic Neue", weight: 400, italic: false },
      // Well-formed card data, but never a curated face (and never a path).
      { family: "../x", weight: 400, italic: false },
    ]) {
      await expect(
        previewImage({ kind: "card", card: card({ boxes: [{ ...BOX, font }] }) }),
      ).rejects.toThrow(UndrawableTextError);
    }
  });
});
