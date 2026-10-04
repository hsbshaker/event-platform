/**
 * Server-side loading of the curated card fonts in `public/fonts/card/` (`docs/card-system.md
 * §2.6`), keyed by family and weight, for `layoutCard` and line breaking.
 *
 * Files follow `src/styles/card-fonts.css`: `<Family without spaces>-normal-<weight>.woff2`. Every
 * curated face is upright; an italic or unknown face is an error, never a substitution — a line
 * measured with the wrong font would be stored and shown to guests.
 */

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { curatedFontFileName } from "./font-files";
import {
  type FontMetrics,
  type FontMetricsResolver,
  type FontRef,
  loadFontMetricsFromFile,
} from "./metrics";

const CURATED_DIR = path.join(process.cwd(), "public", "fonts", "card");

export { curatedFontFileName };

const loaded = new Map<string, Promise<FontMetrics>>();

function keyOf(font: FontRef): string {
  return `${font.family}|${font.weight}|${font.italic ? "i" : "n"}`;
}

/** Metrics for one curated face, loaded once per process. Rejects for a face not on disk. */
export function loadCuratedFontMetrics(
  font: FontRef,
  dir: string = CURATED_DIR,
): Promise<FontMetrics> {
  const key = `${dir}|${keyOf(font)}`;
  let pending = loaded.get(key);
  if (!pending) {
    pending = readFile(path.join(dir, curatedFontFileName(font))).then((bytes) =>
      loadFontMetricsFromFile(bytes, font),
    );
    // A failed load is not cached, so a transient read error is not permanent.
    pending.catch(() => loaded.delete(key));
    loaded.set(key, pending);
  }
  return pending;
}

/**
 * Load every face `fonts` names and return a synchronous resolver over them, for the pure
 * `layoutCard`. The resolver throws for a face that was not preloaded.
 */
export async function curatedMetricsResolver(
  fonts: readonly FontRef[],
  dir: string = CURATED_DIR,
): Promise<FontMetricsResolver> {
  const entries = await Promise.all(
    fonts.map(async (font) => [keyOf(font), await loadCuratedFontMetrics(font, dir)] as const),
  );
  const byKey = new Map(entries);
  return (font) => {
    const metrics = byKey.get(keyOf(font));
    if (!metrics) throw new Error(`Font metrics not loaded for ${keyOf(font)}`);
    return metrics;
  };
}
