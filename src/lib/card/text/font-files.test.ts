import { describe, expect, it } from "vitest";

import { CURATED_WEIGHTS, curatedFontUrl } from "./font-files";
import { curatedFaces } from "./test-fonts";

describe("curated font files", () => {
  it("lists exactly the faces card-fonts.css self-hosts", () => {
    const fromCss: Record<string, number[]> = {};
    for (const f of curatedFaces()) (fromCss[f.family] ??= []).push(f.weight);
    for (const weights of Object.values(fromCss)) weights.sort((a, b) => a - b);
    expect(CURATED_WEIGHTS).toEqual(fromCss);
  });

  it("resolves a curated face to its file and anything else to null", () => {
    for (const f of curatedFaces()) expect(curatedFontUrl(f)).toBe(`/fonts/card/${f.file}`);
    expect(curatedFontUrl({ family: "Inter", weight: 300, italic: false })).toBeNull();
    expect(curatedFontUrl({ family: "Inter", weight: 400, italic: true })).toBeNull();
    expect(curatedFontUrl({ family: "Lobster", weight: 400, italic: false })).toBeNull();
    expect(curatedFontUrl({ family: "constructor", weight: 400, italic: false })).toBeNull();
  });
});
