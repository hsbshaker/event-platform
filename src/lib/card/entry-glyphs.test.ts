import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import * as hb from "harfbuzzjs";
import { format, resolveConfig } from "prettier";
import { beforeAll, describe, expect, it } from "vitest";

import { entryWordWidths } from "./entry";
import ENTRY_GLYPHS from "./entry-glyphs.json";
import { CARD_SLOT_SPECS } from "./layouts";
import { TYPICAL, WORST } from "./test-content";
import { curatedFontFileName } from "./text/curated-fonts";
import { applyTextCase, fontFileToSfnt, type FontMetricsResolver } from "./text/metrics";
import { CURATED_FONT_DIR, allCuratedMetrics } from "./text/test-fonts";
import { TYPOGRAPHY } from "./typography";

/**
 * `entry-glyphs.json`: what the entry check (`entry.ts`) knows of the curated faces, generated
 * here from the font files and checked against them on every run. Regenerate after changing a
 * curated font, a pairing or a slot spec:
 *
 *   UPDATE_CARD_ENTRY_GLYPHS=1 npx vitest run --project unit src/lib/card/entry-glyphs.test.ts
 *
 * For each role (`display` for the title, `body` for the facts):
 * - `chars`: every character every face of the role can draw as the card sets it (the details are
 *   capitals, so a body character counts when each face has its capital), whitespace excepted;
 * - for each face, the advance of each of those characters in card units × 100, rounded up, as the
 *   card sets it at the slot's minimum size (the size a word must fit at): letter spacing and case
 *   included, measured by the same HarfBuzz measurement `layoutCard` uses.
 */

const OUT = path.join(import.meta.dirname, "entry-glyphs.json");

const ROLES = {
  display: CARD_SLOT_SPECS.title,
  body: CARD_SLOT_SPECS.babyName,
} as const;

type Role = keyof typeof ROLES;

function familiesOf(role: Role): string[] {
  return [...new Set(Object.values(TYPOGRAPHY).map((p) => p[role]))].sort();
}

async function cmapOf(family: string): Promise<Set<number>> {
  const file = curatedFontFileName({ family, weight: 400, italic: false });
  const sfnt = await fontFileToSfnt(readFileSync(path.join(CURATED_FONT_DIR, file)));
  // Copied out at once: the array is a view of HarfBuzz's memory, which later loads can move.
  const cmap = new Set(new hb.Face(new hb.Blob(sfnt)).collectUnicodes());
  if (cmap.size === 0) throw new Error(`${family}: no character map read`);
  return cmap;
}

let metrics: FontMetricsResolver;
const cmapByFamily = new Map<string, Set<number>>();
beforeAll(async () => {
  // The character maps first: loading every face grows HarfBuzz's memory, and a view taken after
  // that comes back empty.
  for (const role of Object.keys(ROLES) as Role[]) {
    for (const family of familiesOf(role)) cmapByFamily.set(family, await cmapOf(family));
  }
  metrics = await allCuratedMetrics();
});

async function generate() {
  const roles: Record<string, unknown> = {};
  for (const role of Object.keys(ROLES) as Role[]) {
    const spec = ROLES[role];
    const families = familiesOf(role);
    const cmaps = families.map((family) => cmapByFamily.get(family)!);
    // Candidates: everything any face maps, and every lower-case letter whose capital one does.
    const candidates = new Set<number>();
    for (const cmap of cmaps) for (const cp of cmap) candidates.add(cp);
    for (let cp = 0x20; cp < 0x3000; cp += 1) candidates.add(cp);
    const chars = [...candidates]
      .sort((a, b) => a - b)
      .map((cp) => String.fromCodePoint(cp))
      .filter((ch) => !/\s/.test(ch))
      .filter((ch) => {
        const drawn = [...applyTextCase(ch, spec.textCase)].map((c) => c.codePointAt(0)!);
        return cmaps.every((cmap) => drawn.every((cp) => cmap.has(cp)));
      });
    const style = {
      size: spec.min,
      letterSpacingEm: spec.letterSpacingEm,
      textCase: spec.textCase,
    };
    const faces: Record<string, { advances: number[]; kernAfter: number[] }> = {};
    for (const family of families) {
      const face = metrics({ family, weight: 400, italic: false });
      const exact = chars.map((ch) => face.measure(ch, style));
      // The most a following character adds beyond both advances (positive kerning), per character.
      const kernAfter = chars.map((a, i) =>
        Math.max(0, ...chars.map((b, j) => face.measure(a + b, style) - exact[i] - exact[j])),
      );
      faces[family] = {
        advances: exact.map((w) => Math.ceil(w * 100)),
        kernAfter: kernAfter.map((k) => Math.ceil(k * 100)),
      };
    }
    roles[role] = {
      size: spec.min,
      letterSpacingEm: spec.letterSpacingEm,
      textCase: spec.textCase,
      chars: chars.join(""),
      faces,
    };
  }
  return { roles };
}

describe("entry-glyphs.json", () => {
  it("is what the curated fonts give", async () => {
    const fresh = await generate();
    if (process.env.UPDATE_CARD_ENTRY_GLYPHS) {
      const options = { ...(await resolveConfig(OUT)), filepath: OUT };
      writeFileSync(OUT, await format(JSON.stringify(fresh), options));
    }
    expect(ENTRY_GLYPHS).toEqual(JSON.parse(JSON.stringify(fresh)));
  }, 60_000);

  /**
   * The table bounds a word's width from above: each character's own advance, plus after each
   * character but the last the most any following character kerns away from it. The card shapes
   * whole words (pair kerning, ligatures, contextual forms), so the bound is checked against
   * shaping: real words, and deterministic random strings of every drawable character. Every
   * pair is exact by construction (`kernAfter` is the maximum over all pairs).
   */
  it("bounds every face's shaped width from above", () => {
    const words = [
      ...Object.values({ ...TYPICAL, ...WORST }).flatMap((t) => (t ?? "").split(/\s+/)),
      "Wilhelmina",
      "Montgomery-",
      "Okonkwo-Fitzgerald",
      "Zoë",
      "Ægir",
      "Office",
      "AVATAR",
      "Tyrwhitt",
      "VAWAVAWA",
      "LTAVAWYT",
      "Wolfeschlegelsteinhausenbergerdorff",
      "fjord",
      "Hijjaj",
    ].filter(Boolean);
    let seed = 11;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let worst = -Infinity;
    for (const role of Object.keys(ROLES) as Role[]) {
      const spec = ROLES[role];
      const style = {
        size: spec.min,
        letterSpacingEm: spec.letterSpacingEm,
        textCase: spec.textCase,
      };
      const chars = [...ENTRY_GLYPHS.roles[role].chars];
      const strings = Array.from({ length: 400 }, () =>
        Array.from(
          { length: 2 + Math.floor(random() * 18) },
          () => chars[Math.floor(random() * chars.length)],
        ).join(""),
      );
      for (const family of familiesOf(role)) {
        const face = metrics({ family, weight: 400, italic: false });
        for (const word of [...words, ...strings]) {
          const bound = entryWordWidths(role, word);
          if (bound === null) continue; // a character the role cannot draw
          worst = Math.max(worst, face.measure(word, style) - bound[family]);
        }
      }
    }
    // Shaped minus bound, in card units: never above it.
    expect(worst).toBeLessThanOrEqual(1e-9);
  }, 120_000);
});
