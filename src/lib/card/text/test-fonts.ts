/**
 * Test support: the curated faces declared in `src/styles/card-fonts.css`, and their metrics loaded
 * from the real files in `public/fonts/card/`. Imported by tests only.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { curatedMetricsResolver } from "./curated-fonts";
import type { FontMetricsResolver, FontRef } from "./metrics";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
export const CURATED_FONT_DIR = path.join(REPO_ROOT, "public/fonts/card");

/** Every face `card-fonts.css` declares, with its file name. */
export function curatedFaces(): (FontRef & { file: string })[] {
  const css = readFileSync(path.join(REPO_ROOT, "src/styles/card-fonts.css"), "utf8");
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const block = m[1];
    const family = /font-family:\s*"([^"]+)"/.exec(block)![1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)![1]);
    const italic = /font-style:\s*italic/.test(block);
    const file = /url\("\/fonts\/card\/([^"]+)"\)/.exec(block)![1];
    return { family, weight, italic, file };
  });
}

/** A resolver over every curated face. */
export function allCuratedMetrics(): Promise<FontMetricsResolver> {
  return curatedMetricsResolver(
    curatedFaces().map(({ family, weight, italic }) => ({ family, weight, italic })),
    CURATED_FONT_DIR,
  );
}
