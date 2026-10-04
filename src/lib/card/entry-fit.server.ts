/**
 * The server's exact fit check for card text the host types (`spec.md §31`, "Card design, artwork
 * and compiler": "slot limits are enforced at entry"; `docs/card-system.md §2.5`, §4.3; owner
 * decision in `docs/CHANGELOG-v7.md`, "Phase 4 — fitting every detail on every card": every card
 * shows every detail, so text the card cannot show in every design is refused at entry).
 *
 * `validateCardText` (`entry.ts`, isomorphic) refuses undrawable characters, over-limit text and
 * single words too wide for the narrowest zone, but cannot see whether whole lines and the stack
 * fit: a 40-character title of wide capitals passes it and still overflows some designs. This
 * check sets the value in its slot, every other slot at the worst-case content (`worst-case.ts`),
 * and asks `layoutCardFits` — `layoutCard`'s own search, with the curated fonts' real shaping —
 * whether it fits every distinct text zone of the layout set (zone rectangle and proportion, over
 * every layout × supported shape) in every curated pairing. Deterministic; no model call
 * (`spec.md §32` #20).
 *
 * Server-only: it shapes text with HarfBuzz. Run it after `validateCardText` accepts the value;
 * it answers only whether the text fits.
 */

import "server-only";

import type { CardEntrySlot } from "./entry";
import type { CardRect } from "./ink";
import { layoutCardFits, pairingFaces } from "./layout-card";
import { CARD_LAYOUT_IDS, CARD_LAYOUTS, zoneFor } from "./layouts";
import { proportionOf, type CardProportion } from "./shapes";
import { curatedMetricsResolver } from "./text/curated-fonts";
import type { FontMetrics, FontMetricsResolver, FontRef } from "./text/metrics";
import { TYPOGRAPHY_KEYS } from "./typography";
import { WORST } from "./worst-case";

/** A text zone of the layout set, once however many layout × shape pairs share it. */
export interface EntryFitZone {
  zone: CardRect;
  proportion: CardProportion;
}

/** Every distinct text zone of the layout set (`layouts.ts`), in layout and shape order. */
export const ENTRY_FIT_ZONES: readonly EntryFitZone[] = (() => {
  const zones = new Map<string, EntryFitZone>();
  for (const layout of CARD_LAYOUT_IDS) {
    for (const shape of CARD_LAYOUTS[layout].shapes) {
      const zone = zoneFor(layout, shape);
      const proportion = proportionOf(shape);
      const key = `${zone.x},${zone.y},${zone.width},${zone.height},${proportion}`;
      if (!zones.has(key)) zones.set(key, { zone, proportion });
    }
  }
  return [...zones.values()];
})();

const PAIRINGS = TYPOGRAPHY_KEYS.map((id) => pairingFaces(id));

/** `layoutCard` validates its ink; the fit does not depend on it. */
const ANY_INK = "#000000";

let metricsLoad: Promise<FontMetricsResolver> | null = null;

/** Every curated pairing's faces, loaded once per process (`curated-fonts.ts` caches the files). */
function pairingMetrics(): Promise<FontMetricsResolver> {
  if (!metricsLoad) {
    const faces = new Map<string, FontRef>();
    for (const { display, body } of PAIRINGS) {
      for (const face of [display, body]) {
        faces.set(`${face.family}|${face.weight}|${face.italic ? "i" : "n"}`, face);
      }
    }
    metricsLoad = curatedMetricsResolver([...faces.values()]);
    // A failed load is not kept, so a transient read error is not permanent.
    metricsLoad.catch(() => {
      metricsLoad = null;
    });
  }
  return metricsLoad;
}

const WORST_TEXTS: readonly string[] = Object.values(WORST);

/**
 * Widths of the worst-case companions' substrings, per face and style, kept for the process.
 * Every check re-breaks the same companions in the same faces at the same sizes; a `measure` that
 * hits its own advance cache still costs microseconds, which over the zones × pairings comes to
 * most of a check. Bounded: only text inside a worst-case value is kept here, and `breakLines`
 * measures only candidate lines of it, at the few sizes the search tries.
 */
const companionWidths = new Map<string, Map<string, number>>();

/**
 * `metrics` with `measure` memoized — a pure function of face, text and style, so the widths are
 * the ones `layoutCard` itself would get. Substrings of the worst-case content go in the process
 * cache; anything else (the host's text) in `local`, which lives for one check only.
 */
function memoized(
  metrics: FontMetricsResolver,
  local: Map<string, Map<string, number>>,
): FontMetricsResolver {
  const faces = new Map<string, FontMetrics>();
  return (font) => {
    const faceKey = `${font.family}|${font.weight}|${font.italic ? "i" : "n"}`;
    let face = faces.get(faceKey);
    if (!face) {
      const base = metrics(font);
      const table = (tables: Map<string, Map<string, number>>) => {
        let widths = tables.get(faceKey);
        if (!widths) {
          widths = new Map();
          tables.set(faceKey, widths);
        }
        return widths;
      };
      const kept = table(companionWidths);
      const mine = table(local);
      face = {
        font: base.font,
        unitsPerEm: base.unitsPerEm,
        missingCharacters: (text) => base.missingCharacters(text),
        measure(text, style) {
          const key = `${style.size}|${style.letterSpacingEm ?? 0}|${style.textCase ?? "none"}|${text}`;
          const known = kept.get(key) ?? mine.get(key);
          if (known !== undefined) return known;
          const width = base.measure(text, style);
          (WORST_TEXTS.some((value) => value.includes(text)) ? kept : mine).set(key, width);
          return width;
        },
      };
      faces.set(faceKey, face);
    }
    return face;
  };
}

/**
 * Whether `value` in `slot`, with every other slot at the worst-case content, fits every design:
 * each distinct zone of the layout set in each curated pairing (see the module comment). Blank
 * text takes no space on the card and is accepted. Rejects only if the fonts cannot be loaded.
 *
 * `companions` replaces the worst case for the slots given (blank ones are ignored): from Phase 5,
 * a design's own invitation line in place of the worst-case sentence (`card-system.md §2.5`).
 */
export async function cardTextFitsEveryDesign(
  slot: CardEntrySlot,
  value: string,
  companions: Partial<Record<CardEntrySlot, string | null>> = {},
): Promise<boolean> {
  const text = value.trim();
  if (text === "") return true;
  const metrics = memoized(await pairingMetrics(), new Map());
  const actual = Object.fromEntries(
    Object.entries(companions)
      .filter(([other, v]) => other !== slot && typeof v === "string" && v.trim() !== "")
      .map(([other, v]) => [other, v!.trim()]),
  );
  const content = { ...WORST, ...actual, [slot]: text };
  for (const { zone, proportion } of ENTRY_FIT_ZONES) {
    for (const pairing of PAIRINGS) {
      if (!layoutCardFits({ zone, proportion, pairing, content, ink: ANY_INK, metrics })) {
        return false;
      }
    }
  }
  return true;
}
