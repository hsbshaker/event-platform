import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CURATED_WEIGHTS, curatedFontUrl } from "./font-files";
import { CURATED_FONT_DIR, curatedFaces } from "./test-fonts";

/** A complete SIL Open Font License 1.1 text with its copyright notice. */
function expectOfl(file: string) {
  expect(existsSync(file), file).toBe(true);
  const text = readFileSync(file, "utf8");
  expect(text, file).toMatch(/^Copyright /);
  expect(text, file).toContain("SIL OPEN FONT LICENSE Version 1.1");
  expect(text, file).toContain('THE FONT SOFTWARE IS PROVIDED "AS IS"');
}

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

  it("ships each family's licence beside its files (SIL OFL 1.1 requires it travel with them)", () => {
    for (const family of Object.keys(CURATED_WEIGHTS)) {
      expectOfl(path.join(CURATED_FONT_DIR, `${family.replaceAll(" ", "")}-OFL.txt`));
    }
    // The link preview's copies of the app's Alegreya Sans, too.
    const previewFonts = path.join(CURATED_FONT_DIR, "../../../src/lib/link-preview/fonts");
    const families = new Set(
      readdirSync(previewFonts)
        .filter((f) => f.endsWith(".woff2"))
        .map((f) => f.split("-")[0]),
    );
    expect([...families]).toEqual(["AlegreyaSans"]);
    for (const family of families) expectOfl(path.join(previewFonts, `${family}-OFL.txt`));
  });
});
