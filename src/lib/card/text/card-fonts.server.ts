/**
 * Metrics for the faces a card's text boxes are set in, on the server (`docs/card-system.md §4.3`,
 * §7 "Line breaking for edited boxes"). The same files and the same shaping as `layoutCard`'s
 * curated metrics (`curated-fonts.ts`), so an edited box breaks exactly as the generated card does
 * and every browser draws what was measured.
 *
 * The seam the font store plugs into (`card-fonts.ts`): each face is resolved by its source, and a
 * face with none is refused with `UnknownCardFontError`, never substituted.
 */

import "server-only";

import { cardFontSource, UnknownCardFontError } from "./card-fonts";
import { loadCuratedFontMetrics } from "./curated-fonts";
import type { FontMetrics, FontMetricsResolver, FontRef } from "./metrics";

function keyOf(font: FontRef): string {
  return `${font.family}|${font.weight}|${font.italic ? "i" : "n"}`;
}

function loadFace(font: FontRef): Promise<FontMetrics> {
  switch (cardFontSource(font)) {
    case "curated":
      return loadCuratedFontMetrics(font);
    case null:
      return Promise.reject(new UnknownCardFontError(font));
  }
}

/**
 * Load every face `fonts` names and return a synchronous resolver over them. Rejects with
 * `UnknownCardFontError` for a face the platform does not have, before loading anything. The
 * resolver throws for a face that was not asked for here: `UnknownCardFontError` when the platform
 * has no such face, a plain error when it simply was not loaded.
 */
export async function cardFontMetrics(fonts: readonly FontRef[]): Promise<FontMetricsResolver> {
  const wanted = new Map<string, FontRef>();
  for (const font of fonts) {
    if (cardFontSource(font) === null) throw new UnknownCardFontError(font);
    wanted.set(keyOf(font), font);
  }
  const entries = await Promise.all(
    [...wanted].map(async ([key, font]) => [key, await loadFace(font)] as const),
  );
  const byKey = new Map(entries);
  return (font) => {
    const metrics = byKey.get(keyOf(font));
    if (metrics) return metrics;
    if (cardFontSource(font) === null) throw new UnknownCardFontError(font);
    throw new Error(`Card font metrics not loaded for ${keyOf(font)}`);
  };
}
