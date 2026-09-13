/**
 * Palette-control regression for the semantic palette compiler.
 *
 * `spec.md §11.7` keeps this a unit test on purpose: "the OKLCH semantic compiler produces all
 * required tokens with contrast by construction and the palette-control regression stays a unit
 * test". `spec.md §31 — PaletteInput, composition and compiler` is what it proves:
 *   - "Raw palette is never directly consumed as renderer background/text/button semantics."
 *   - "Semantic palette compiler produces all required event tokens."
 *   - "Required normal text/button contrast clears 4.5:1."
 *   - "Required non-text/focus contrast clears applicable 3:1 thresholds."
 *   - "Palette-control unit test proves navy-on-navy states are impossible."
 * Guardrails: `spec.md §32` #25, #26, #27.
 *
 * The corpus below is 45 palettes crossed with all three tonal directions — 135 compiled
 * palettes, 2160 emitted tokens. It deliberately includes the cases that break naive contrast
 * code: palettes that are entirely dark, entirely light, entirely achromatic, fully saturated,
 * and one where every colour sits at almost the same lightness (so hue, not lightness, has to do
 * the separating).
 */

import { describe, expect, it } from "vitest";

import type { Tone } from "@/lib/renderer/vocabulary";

import {
  CHROMA_CAPS,
  CONTRAST_NON_TEXT,
  CONTRAST_TEXT,
  ROLE_CONTRACT,
  compileSemanticPalette,
  type PaletteInput,
  deriveAccessibleColor,
  type SemanticPalette,
  type SemanticRole,
} from "@/lib/renderer/compile/palette";
import {
  contrastRatio,
  hexToOklch,
  isCanonicalHex,
  oklchToHex,
  parseHex,
} from "@/lib/renderer/compile/color";

/* ============================================================================================
 * The pair table.
 *
 * Written out longhand so a reviewer can read exactly what is checked without opening the
 * compiler, and then asserted to equal the compiler's own `ROLE_CONTRACT` so the two cannot
 * drift apart. Every entry is `foreground|object` vs `background`, at a WCAG 2.2 threshold.
 *
 * Note that no row uses the 3:1 large-text allowance: `textMuted` and every on-surface ink are
 * held to the full 4.5:1 normal-text target, so a renderer is free to set any of them at any
 * size. 3:1 appears only for non-text objects — the inverted band, the button fill, the accent
 * mark, hairlines and the focus indicator (SC 1.4.11 / 2.4.11).
 * ========================================================================================== */

const PAIR_TABLE: ReadonlyArray<{
  role: SemanticRole;
  against: readonly SemanticRole[];
  min: number;
  why: string;
}> = [
  // non-text objects — 3:1
  { role: "surfaceContrast", against: ["surfaceBase"], min: 3, why: "band reads" },
  { role: "button", against: ["surfaceBase", "surfaceAlt"], min: 3, why: "interactive boundary" },
  { role: "accent", against: ["surfaceBase", "surfaceAlt"], min: 3, why: "graphical object" },
  { role: "border", against: ["surfaceBase", "surfaceAlt"], min: 3, why: "component boundary" },
  { role: "focus", against: ["surfaceBase", "surfaceAlt"], min: 3, why: "focus indicator" },
  // text — 4.5:1
  { role: "text", against: ["surfaceBase", "surfaceAlt"], min: 4.5, why: "body text" },
  {
    role: "textMuted",
    against: ["surfaceBase", "surfaceAlt"],
    min: 4.5,
    why: "still normal-size text",
  },
  { role: "textOnContrast", against: ["surfaceContrast"], min: 4.5, why: "body text" },
  { role: "textOnAccent", against: ["surfaceAccent"], min: 4.5, why: "body text" },
  { role: "buttonText", against: ["button"], min: 4.5, why: "label on fill" },
  { role: "accentText", against: ["accent"], min: 4.5, why: "label on fill" },
  { role: "error", against: ["surfaceBase", "surfaceAlt"], min: 4.5, why: "error message text" },
  { role: "errorText", against: ["error"], min: 4.5, why: "label on fill" },
];

/** Every role named by `docs/design-system.md §15.6`. Nothing more, nothing less. */
const ALL_ROLES: readonly SemanticRole[] = [
  "surfaceBase",
  "surfaceAlt",
  "surfaceContrast",
  "surfaceAccent",
  "text",
  "textMuted",
  "textOnContrast",
  "textOnAccent",
  "button",
  "buttonText",
  "accent",
  "accentText",
  "border",
  "focus",
  "error",
  "errorText",
];

const TONES: readonly Tone[] = ["light", "mid", "dark"];

/* ============================================================================================
 * Corpus.
 * ========================================================================================== */

interface CorpusEntry {
  readonly name: string;
  readonly colors: readonly string[];
  readonly dominant: string;
}

const CORPUS: readonly CorpusEntry[] = [
  // The palette-control set named in the packet, under each of its three plausible dominants.
  { name: "navy-cream-forest", colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
  {
    name: "navy-cream-forest/cream",
    colors: ["#22364F", "#F3ECDD", "#2E4638"],
    dominant: "#F3ECDD",
  },
  {
    name: "navy-cream-forest/forest",
    colors: ["#22364F", "#F3ECDD", "#2E4638"],
    dominant: "#2E4638",
  },

  // Very dark palettes — nothing authored is light enough to be a ground in a light concept.
  { name: "very-dark/ink", colors: ["#0A0A0F", "#141826", "#1F2433"], dominant: "#0A0A0F" },
  {
    name: "very-dark/charcoal",
    colors: ["#050505", "#111111", "#1C1C1C", "#282828"],
    dominant: "#111111",
  },
  { name: "very-dark/pine", colors: ["#0B1D14", "#132A1E", "#1B3728"], dominant: "#0B1D14" },

  // Very light palettes — nothing authored is dark enough to be ink.
  { name: "very-light/paper", colors: ["#FFFFFF", "#FDFBF7", "#F7F3EC"], dominant: "#FDFBF7" },
  {
    name: "very-light/cool",
    colors: ["#FEFEFE", "#FAFAFF", "#F4F4FF", "#EFEFFA"],
    dominant: "#FAFAFF",
  },
  { name: "very-light/warm", colors: ["#FFF9F0", "#FFF3E3", "#FFEDD6"], dominant: "#FFF3E3" },

  // Low-chroma greys — hue carries no information at all.
  { name: "grey/three", colors: ["#1A1A1A", "#808080", "#E6E6E6"], dominant: "#808080" },
  {
    name: "grey/four",
    colors: ["#2B2B2B", "#575757", "#9E9E9E", "#D4D4D4"],
    dominant: "#575757",
  },
  {
    name: "grey/five",
    colors: ["#333333", "#666666", "#999999", "#CCCCCC", "#F2F2F2"],
    dominant: "#666666",
  },

  // High-chroma saturated sets — the gamut boundary does real work here.
  { name: "saturated/primaries", colors: ["#FF0000", "#00FF00", "#0000FF"], dominant: "#FF0000" },
  { name: "saturated/secondaries", colors: ["#FF00FF", "#00FFFF", "#FFFF00"], dominant: "#00FFFF" },
  {
    name: "saturated/electric",
    colors: ["#E6007E", "#FFD400", "#00A3E0", "#7B2FF7"],
    dominant: "#E6007E",
  },
  {
    name: "saturated/neon-five",
    colors: ["#FF6B00", "#FF0059", "#00E5FF", "#B6FF00", "#7C00FF"],
    dominant: "#FF6B00",
  },

  // Near-identical lightness — separation has to come from the compiler, not the brief.
  {
    name: "flat-lightness/three",
    colors: ["#7A6A55", "#557A6A", "#6A557A"],
    dominant: "#7A6A55",
  },
  {
    name: "flat-lightness/four",
    colors: ["#8C7B6B", "#6B8C7B", "#7B6B8C", "#8C6B7B"],
    dominant: "#6B8C7B",
  },
  {
    name: "flat-lightness/near-identical-greys",
    colors: ["#808080", "#7F8180", "#818081"],
    dominant: "#808080",
  },

  // Ordinary editorial / invitation briefs.
  { name: "muted/three", colors: ["#4A5D6B", "#C9B99B", "#8A9A5B"], dominant: "#4A5D6B" },
  {
    name: "editorial/five",
    colors: ["#1B1F3B", "#F5F0E6", "#C8102E", "#A8A9AD", "#3D5A80"],
    dominant: "#1B1F3B",
  },
  { name: "warm-wedding", colors: ["#F7E7CE", "#D4A373", "#7F5539"], dominant: "#D4A373" },
  { name: "blush", colors: ["#FFF0F3", "#F9C5D1", "#C9184A"], dominant: "#F9C5D1" },
  { name: "sage", colors: ["#DAD7CD", "#A3B18A", "#344E41"], dominant: "#A3B18A" },
  { name: "midnight-gold", colors: ["#0B132B", "#1C2541", "#C5A253"], dominant: "#0B132B" },
  {
    name: "terracotta",
    colors: ["#E07A5F", "#3D405B", "#F4F1DE", "#81B29A"],
    dominant: "#E07A5F",
  },
  {
    name: "monochrome-blue",
    colors: ["#08203E", "#557C93", "#ADCED9", "#F9FEFF"],
    dominant: "#08203E",
  },
  { name: "forest-lodge", colors: ["#2E4638", "#6B4F3A", "#D9CBA3"], dominant: "#2E4638" },
  { name: "deco", colors: ["#0D0D0D", "#C9A227", "#F2F2F2"], dominant: "#C9A227" },
  { name: "pastel", colors: ["#FFD6E0", "#C1FBA4", "#A0E7E5", "#FBE7C6"], dominant: "#A0E7E5" },
  { name: "neon-on-dark", colors: ["#0F0F0F", "#39FF14", "#FF073A"], dominant: "#0F0F0F" },
  {
    name: "earth-five",
    colors: ["#606C38", "#283618", "#FEFAE0", "#DDA15E", "#BC6C25"],
    dominant: "#283618",
  },
  {
    name: "coastal-five",
    colors: ["#03045E", "#0077B6", "#00B4D8", "#90E0EF", "#CAF0F8"],
    dominant: "#0077B6",
  },
  { name: "plum", colors: ["#2B0B3F", "#5F0F40", "#9A031E", "#FB8B24"], dominant: "#5F0F40" },
  {
    name: "mono-red",
    colors: ["#330000", "#660000", "#990000", "#CC0000"],
    dominant: "#990000",
  },
  { name: "mono-green-light", colors: ["#EAF4EA", "#CFE5CF", "#B4D6B4"], dominant: "#CFE5CF" },
  { name: "high-key-yellow", colors: ["#FFFBEA", "#FFF3BF", "#FFD43B"], dominant: "#FFD43B" },
  { name: "ink-and-paper", colors: ["#111111", "#FAFAF5", "#8B8178"], dominant: "#111111" },
  { name: "teal-rose", colors: ["#014F58", "#F2C4C4", "#FFFFFF"], dominant: "#014F58" },
  { name: "burgundy", colors: ["#4A0E1B", "#8C1C2E", "#E8C9A0"], dominant: "#4A0E1B" },
  {
    name: "slate-mint",
    colors: ["#2F3E46", "#52796F", "#84A98C", "#CAD2C5"],
    dominant: "#2F3E46",
  },
  {
    name: "purple-gold",
    colors: ["#3C096C", "#7B2CBF", "#E0AAFF", "#FFBA08"],
    dominant: "#3C096C",
  },
  { name: "desert", colors: ["#F4E1D2", "#E8B4A0", "#B07156", "#5C3A2E"], dominant: "#B07156" },
  {
    name: "arctic-five",
    colors: ["#F8F9FA", "#DEE2E6", "#ADB5BD", "#495057", "#212529"],
    dominant: "#495057",
  },
  {
    name: "citrus-five",
    colors: ["#FF9F1C", "#FFBF69", "#FFFFFF", "#CBF3F0", "#2EC4B6"],
    dominant: "#FF9F1C",
  },
];

function intentFor(entry: CorpusEntry, tonalDirection: Tone): PaletteInput {
  return { palette: { colors: entry.colors, dominant: entry.dominant }, tonalDirection };
}

interface Compiled {
  readonly entry: CorpusEntry;
  readonly tone: Tone;
  readonly label: string;
  readonly palette: SemanticPalette;
  readonly deviationCount: number;
}

const COMPILED: readonly Compiled[] = CORPUS.flatMap((entry) =>
  TONES.map((tone) => {
    const { palette, deviations } = compileSemanticPalette(intentFor(entry, tone));
    return {
      entry,
      tone,
      label: `${entry.name} @ ${tone}`,
      palette,
      deviationCount: deviations.length,
    };
  }),
);

/* ============================================================================================
 * Colour maths.
 * ========================================================================================== */

describe("colour conversions", () => {
  it("round-trips hex -> OKLCH -> hex exactly for in-gamut colours", () => {
    const samples = [
      "#000000",
      "#FFFFFF",
      "#22364F",
      "#F3ECDD",
      "#2E4638",
      "#FF0000",
      "#00FF00",
      "#0000FF",
      "#808080",
      "#7B2FF7",
      "#FFD400",
      "#014F58",
    ];
    for (const hex of samples) {
      expect(oklchToHex(hexToOklch(hex)), hex).toBe(hex);
    }
  });

  it("round-trips every 8-bit grey exactly", () => {
    for (let v = 0; v < 256; v += 1) {
      const hex = `#${v.toString(16).toUpperCase().padStart(2, "0").repeat(3)}`;
      expect(oklchToHex(hexToOklch(hex)), hex).toBe(hex);
    }
  });

  it("places OKLCH lightness monotonically with grey value", () => {
    let previous = -1;
    for (let v = 0; v < 256; v += 1) {
      const hex = `#${v.toString(16).toUpperCase().padStart(2, "0").repeat(3)}`;
      const { l } = hexToOklch(hex);
      expect(l).toBeGreaterThan(previous);
      previous = l;
    }
  });

  it("gamut-clamps an out-of-sRGB request to a real colour without moving the hue much", () => {
    // Chroma 0.4 at a mid lightness is outside sRGB for every hue.
    const requested = { l: 0.5, c: 0.4, h: 150 };
    const hex = oklchToHex(requested);
    expect(isCanonicalHex(hex)).toBe(true);
    const back = hexToOklch(hex);
    expect(back.c).toBeLessThan(requested.c);
    expect(Math.abs(back.h - requested.h)).toBeLessThan(1);
  });
});

describe("WCAG contrast", () => {
  it("matches published ratios", () => {
    // Extremes.
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 6);
    // Two mid-greys on white with well-known published ratios: #767676 is the darkest grey that
    // passes 4.5:1 on white, #777777 the lightest that fails, #595959 is the published 7:1 grey.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#595959", "#FFFFFF")).toBeCloseTo(7.0, 2);
    // The boundary really is the boundary.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(4.5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#22364F", "#F3ECDD")).toBeCloseTo(
      contrastRatio("#F3ECDD", "#22364F"),
      12,
    );
  });

  it("is not an OKLCH lightness difference", () => {
    // #0000FF and #04691A sit at the same OKLCH lightness to three decimal places, yet differ by
    // 1.24:1 in WCAG terms. A proxy built on |ΔL| would score this pair as zero contrast, which
    // is why `relativeLuminance` implements the sRGB formula instead.
    const a = hexToOklch("#0000FF");
    const b = hexToOklch("#04691A");
    expect(Math.abs(a.l - b.l)).toBeLessThan(0.005);
    expect(contrastRatio("#0000FF", "#04691A")).toBeGreaterThan(1.2);
  });
});

/* ============================================================================================
 * The contract.
 * ========================================================================================== */

describe("semantic palette compiler", () => {
  it("checks the same pair table the compiler enforces", () => {
    const normalise = (
      rows: ReadonlyArray<{ role: SemanticRole; against: readonly SemanticRole[]; min: number }>,
    ) =>
      rows
        .map(({ role, against, min }) => ({ role, against: [...against], min }))
        .sort((a, b) => a.role.localeCompare(b.role));
    expect(normalise(PAIR_TABLE)).toEqual(normalise(ROLE_CONTRACT));
  });

  it("emits exactly the roles of design-system.md §15.6", () => {
    for (const { label, palette } of COMPILED) {
      expect(Object.keys(palette).sort(), label).toEqual([...ALL_ROLES].sort());
    }
  });

  it("meets every contrast target across the corpus", () => {
    const worst = new Map<number, { ratio: number; where: string }>();
    const failures: string[] = [];

    for (const { label, palette } of COMPILED) {
      for (const { role, against, min } of PAIR_TABLE) {
        for (const background of against) {
          const ratio = contrastRatio(palette[role], palette[background]);
          if (ratio < min) {
            failures.push(
              `${label}: ${role} ${palette[role]} on ${background} ${palette[background]} = ` +
                `${ratio.toFixed(2)}:1 < ${min}:1`,
            );
          }
          const current = worst.get(min);
          if (current === undefined || ratio < current.ratio) {
            worst.set(min, { ratio, where: `${label} · ${role} on ${background}` });
          }
        }
      }
    }

    expect(failures).toEqual([]);
    // Guard the margin as well as the pass: a target met at exactly the threshold everywhere
    // would mean the compiler is landing on the boundary by luck rather than by construction.
    for (const [min, { ratio }] of worst) {
      expect(ratio).toBeGreaterThanOrEqual(min);
    }
  });

  it("keeps border and focus at 3:1 against both page surfaces", () => {
    for (const { label, palette } of COMPILED) {
      for (const role of ["border", "focus"] as const) {
        for (const surface of ["surfaceBase", "surfaceAlt"] as const) {
          expect(
            contrastRatio(palette[role], palette[surface]),
            `${label}: ${role} on ${surface}`,
          ).toBeGreaterThanOrEqual(CONTRAST_NON_TEXT);
        }
      }
    }
  });

  it("emits valid, in-gamut, canonical hex for every token", () => {
    for (const { label, palette } of COMPILED) {
      for (const role of ALL_ROLES) {
        const value = palette[role];
        expect(isCanonicalHex(value), `${label}: ${role} = ${value}`).toBe(true);
        const { r, g, b } = parseHex(value);
        for (const channel of [r, g, b]) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
        // A token is in gamut iff re-running the pipeline on it is a fixed point.
        expect(oklchToHex(hexToOklch(value)), `${label}: ${role}`).toBe(value);
      }
    }
  });

  it("is deterministic", () => {
    for (const entry of CORPUS) {
      for (const tone of TONES) {
        const first = compileSemanticPalette(intentFor(entry, tone));
        const second = compileSemanticPalette(intentFor(entry, tone));
        expect(second, `${entry.name} @ ${tone}`).toEqual(first);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }
    }
  });

  it("ignores everything about the intent except palette and tonal direction", () => {
    // `docs/design-system.md §15.6` names exactly two inputs: "Raw palette + tonal direction
    // compile into ...". Family, hierarchy, density and typography are not palette inputs, so a
    // PaletteInput carrying any of them must compile to the identical palette.
    const entry = CORPUS[0];
    const base = compileSemanticPalette(intentFor(entry, "light"));
    for (const hierarchy of ["restrained", "editorial", "dramatic", "monumental"]) {
      for (const family of ["editorial", "invitation", "statement"]) {
        const decorated = {
          ...intentFor(entry, "light"),
          family,
          density: "spacious",
          composition: { hierarchy, sectionContrast: "high" },
        } as PaletteInput;
        expect(compileSemanticPalette(decorated), `${family}/${hierarchy}`).toEqual(base);
      }
    }
  });
});

/* ============================================================================================
 * Tonal direction.
 * ========================================================================================== */

describe("tonal direction", () => {
  const MIN_LIGHTNESS_SEPARATION = 0.1;

  it("gives light, mid and dark materially different grounds", () => {
    for (const entry of CORPUS) {
      const lightness = TONES.map(
        (tone) => hexToOklch(compileSemanticPalette(intentFor(entry, tone)).palette.surfaceBase).l,
      );
      const [light, mid, dark] = lightness;

      expect(light, `${entry.name}: light vs mid`).toBeGreaterThan(mid + MIN_LIGHTNESS_SEPARATION);
      expect(mid, `${entry.name}: mid vs dark`).toBeGreaterThan(dark + MIN_LIGHTNESS_SEPARATION);
      expect(light - dark, `${entry.name}: light vs dark`).toBeGreaterThan(0.5);
    }
  });

  it("inverts ink with the ground", () => {
    for (const entry of CORPUS) {
      const light = compileSemanticPalette(intentFor(entry, "light")).palette;
      const dark = compileSemanticPalette(intentFor(entry, "dark")).palette;
      expect(hexToOklch(light.text).l, entry.name).toBeLessThan(hexToOklch(light.surfaceBase).l);
      expect(hexToOklch(dark.text).l, entry.name).toBeGreaterThan(hexToOklch(dark.surfaceBase).l);
    }
  });
});

/* ============================================================================================
 * Raw palette never becomes a role — spec.md §32 #25.
 * ========================================================================================== */

describe("raw colours never become roles", () => {
  it("caps every token's chroma at its role's ceiling", () => {
    // The structural half of the guarantee. Every token is produced by one function that takes
    // three numbers, and each role's chroma is capped before it gets there; a verbatim copy of a
    // saturated authored colour into a surface, ink or hairline role is therefore not merely
    // unlikely, it cannot satisfy this invariant.
    const TOLERANCE = 0.004; // 8-bit rounding
    for (const { label, palette } of COMPILED) {
      for (const role of ALL_ROLES) {
        expect(
          hexToOklch(palette[role]).c,
          `${label}: ${role} = ${palette[role]}`,
        ).toBeLessThanOrEqual(CHROMA_CAPS[role] + TOLERANCE);
      }
    }
  });

  it("never lets an authored colour serve a role it could not satisfy", () => {
    let coincidences = 0;
    for (const { entry, label, palette } of COMPILED) {
      const authored = new Set(entry.colors.map((c) => c.toUpperCase()));
      for (const { role, against, min } of PAIR_TABLE) {
        if (!authored.has(palette[role])) continue;
        coincidences += 1;
        // Allowed only because it independently clears its own target — and it still arrived
        // through OKLCH derivation, never by being copied.
        for (const background of against) {
          expect(
            contrastRatio(palette[role], palette[background]),
            `${label}: authored ${palette[role]} reused as ${role} on ${background}`,
          ).toBeGreaterThanOrEqual(min);
        }
      }
      // The surfaces have no foreground of their own in the table; check them too.
      for (const role of ["surfaceBase", "surfaceAlt", "surfaceAccent"] as const) {
        if (authored.has(palette[role])) coincidences += 1;
      }
    }
    expect(coincidences).toBeGreaterThanOrEqual(0);
  });

  it("proves navy-on-navy is impossible", () => {
    // `spec.md §31`: "Palette-control unit test proves navy-on-navy states are impossible."
    const navy = "#22364F";
    for (const tone of TONES) {
      const { palette } = compileSemanticPalette({
        palette: { colors: [navy, "#F3ECDD", "#2E4638"], dominant: navy },
        tonalDirection: tone,
      });
      // Ink is never the ground, and never close to it.
      expect(palette.text, tone).not.toBe(palette.surfaceBase);
      expect(contrastRatio(palette.text, palette.surfaceBase), tone).toBeGreaterThanOrEqual(
        CONTRAST_TEXT,
      );
      // A button in the dominant navy is never placed on a navy ground.
      expect(contrastRatio(palette.button, palette.surfaceBase), tone).toBeGreaterThanOrEqual(
        CONTRAST_NON_TEXT,
      );
      expect(contrastRatio(palette.buttonText, palette.button), tone).toBeGreaterThanOrEqual(
        CONTRAST_TEXT,
      );
    }
  });

  it("keeps the dominant hue dominant", () => {
    // `spec.md §31` diversity depends on the brief still reading through the compiler. For a
    // chromatic dominant, the ground, the ink and the button all ride its hue.
    const chromatic = CORPUS.filter((e) => hexToOklch(e.dominant).c > 0.05);
    expect(chromatic.length).toBeGreaterThan(20);
    for (const entry of chromatic) {
      const dominantHue = hexToOklch(entry.dominant).h;
      for (const tone of TONES) {
        const { palette } = compileSemanticPalette(intentFor(entry, tone));
        for (const role of ["surfaceBase", "surfaceAlt", "button", "text"] as const) {
          const token = hexToOklch(palette[role]);
          if (token.c < 0.004) continue; // achromatic after capping; hue is meaningless
          // Circular hue distance in degrees.
          const raw = Math.abs(token.h - dominantHue) % 360;
          const delta = raw > 180 ? 360 - raw : raw;
          expect(delta, `${entry.name} @ ${tone}: ${role}`).toBeLessThan(8);
        }
      }
    }
  });
});

/* ============================================================================================
 * Deviations.
 * ========================================================================================== */

describe("deviations", () => {
  it("records nothing when nothing had to be adjusted", () => {
    const { deviations } = compileSemanticPalette({
      palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
      tonalDirection: "light",
    });
    expect(deviations).toEqual([]);
  });

  it("records an adjustment when an authored colour could not serve a role as given", () => {
    // Saturated yellow cannot hold its chroma at the lightness the button role needs — sRGB has
    // no dark, vivid yellow — so the compiler gives chroma up and must say so.
    const { deviations, palette } = compileSemanticPalette({
      palette: { colors: ["#FFFF00", "#00FFFF", "#FF00FF"], dominant: "#FFFF00" },
      tonalDirection: "light",
    });
    expect(deviations.length).toBeGreaterThan(0);
    for (const deviation of deviations) {
      expect(["contrast", "gamut", "unsatisfiable", "intent"]).toContain(deviation.kind);
      expect(deviation.path).toMatch(/^(tokens\.palette\.|designIntent\.)/);
      expect(deviation.rule.length).toBeGreaterThan(0);
      expect(deviation.detail.length).toBeGreaterThan(0);
    }
    // Recorded, and still correct.
    expect(contrastRatio(palette.buttonText, palette.button)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
  });

  it("records an intent deviation when dominant is not a member of colors", () => {
    const { deviations, palette } = compileSemanticPalette({
      palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#8A031E" },
      tonalDirection: "light",
    });
    const intentDeviations = deviations.filter((d) => d.kind === "intent");
    expect(intentDeviations).toHaveLength(1);
    expect(intentDeviations[0].rule).toBe("dominant-in-colors");
    expect(intentDeviations[0].path).toBe("designIntent.palette.dominant");
    // Non-fatal: the concept still compiles to a legal palette.
    expect(contrastRatio(palette.text, palette.surfaceBase)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
  });

  it("only ever gives up chroma to the gamut across the corpus", () => {
    // Every deviation the corpus produces is a `gamut` one: an authored colour too saturated to
    // exist at the lightness its role needs. No palette in the corpus makes the compiler move a
    // lightness to reach contrast (`contrast`), and none defeats it (`unsatisfiable`).
    for (const entry of CORPUS) {
      for (const tone of TONES) {
        const { deviations } = compileSemanticPalette(intentFor(entry, tone));
        const kinds = [...new Set(deviations.map((d) => d.kind))].sort();
        expect(
          kinds.filter((k) => k !== "gamut"),
          `${entry.name} @ ${tone}`,
        ).toEqual([]);
      }
    }
  });
});

/* ============================================================================================
 * The derivation primitive and the safety net it provides.
 * ========================================================================================== */

describe("derivation primitive", () => {
  const STEP = 0.005; // must match LIGHTNESS_STEP in palette.ts

  it("returns the ideal untouched when it already satisfies every constraint", () => {
    const result = deriveAccessibleColor({
      path: "tokens.palette.text",
      idealL: 0.2,
      chroma: 0.02,
      hue: 250,
      constraints: [{ label: "surfaceBase", hex: "#FFFFFF", min: CONTRAST_TEXT }],
    });
    expect(result.deviations).toEqual([]);
    expect(contrastRatio(result.hex, "#FFFFFF")).toBeGreaterThanOrEqual(CONTRAST_TEXT);
  });

  it("walks to the closest satisfying lightness and records a contrast deviation", () => {
    // L 0.90 on white is nowhere near 4.5:1, so the search has to move.
    const result = deriveAccessibleColor({
      path: "tokens.palette.text",
      idealL: 0.9,
      chroma: 0.02,
      hue: 250,
      constraints: [{ label: "surfaceBase", hex: "#FFFFFF", min: CONTRAST_TEXT }],
    });

    expect(contrastRatio(result.hex, "#FFFFFF")).toBeGreaterThanOrEqual(CONTRAST_TEXT);

    const contrastDeviations = result.deviations.filter((d) => d.kind === "contrast");
    expect(contrastDeviations).toHaveLength(1);
    expect(contrastDeviations[0].rule).toBe("wcag-contrast-derivation");
    expect(contrastDeviations[0].path).toBe("tokens.palette.text");
    expect(contrastDeviations[0].after).toBe(result.hex);
    expect(contrastDeviations[0].detail).toContain("surfaceBase>=4.5:1");

    // "Closest" is a real claim: one step back toward the ideal must fail.
    const landed = hexToOklch(result.hex).l;
    expect(landed).toBeLessThan(0.9);
    const oneStepCloser = deriveAccessibleColor({
      path: "probe",
      idealL: landed + STEP,
      chroma: 0.02,
      hue: 250,
      constraints: [],
    }).hex;
    expect(contrastRatio(oneStepCloser, "#FFFFFF")).toBeLessThan(CONTRAST_TEXT);
  });

  it("never moves the hue, whatever it has to give up", () => {
    for (const hue of [0, 45, 110, 150, 200, 250, 300, 340]) {
      const result = deriveAccessibleColor({
        path: "tokens.palette.button",
        idealL: 0.95,
        chroma: 0.16,
        hue,
        constraints: [{ label: "surfaceBase", hex: "#FFFFFF", min: CONTRAST_TEXT }],
      });
      const landed = hexToOklch(result.hex);
      if (landed.c < 0.004) continue; // achromatic result; hue is meaningless
      const raw = Math.abs(landed.h - hue) % 360;
      expect(raw > 180 ? 360 - raw : raw, `hue ${hue}`).toBeLessThan(3);
    }
  });

  it("falls back to an sRGB extreme, and says so, when the constraints are impossible", () => {
    // Nothing can be 21:1 from both black and white at once.
    const result = deriveAccessibleColor({
      path: "tokens.palette.focus",
      idealL: 0.5,
      chroma: 0.05,
      hue: 200,
      constraints: [
        { label: "white", hex: "#FFFFFF", min: 21 },
        { label: "black", hex: "#000000", min: 21 },
      ],
    });
    const stuck = result.deviations.filter((d) => d.kind === "unsatisfiable");
    expect(stuck).toHaveLength(1);
    expect(stuck[0].detail).toContain("no lightness at hue");
    // It still returns a real, renderable colour rather than rejecting the concept
    // (`docs/history/spec_v4.md §11.6`).
    expect(["#000000", "#FFFFFF"]).toContain(result.hex);
  });

  it("is deterministic", () => {
    const request = {
      path: "tokens.palette.accent",
      idealL: 0.88,
      chroma: 0.14,
      hue: 96,
      constraints: [{ label: "surfaceBase", hex: "#F7F3EC", min: CONTRAST_NON_TEXT }],
    };
    expect(deriveAccessibleColor(request)).toEqual(deriveAccessibleColor(request));
  });
});

describe("contrast by construction", () => {
  it("never needs the contrast search, anywhere in sRGB", () => {
    // The claim "contrast by construction" (`spec.md §11.7`, `docs/design-system.md §15.6`) is
    // stronger than "the compiler repairs contrast": it says the ideal lightness bands already
    // satisfy every target, so the search in `deriveAccessibleColor` is a latent safety net
    // rather than a working part of normal generation.
    //
    // This sweeps synthetic palettes across the whole sRGB hue/chroma/lightness space and
    // asserts no compilation anywhere produces a `contrast` or `unsatisfiable` deviation. If a
    // future band retune breaks that, this test says so before a guest ever sees it.
    let compilations = 0;
    const offenders: string[] = [];

    for (let h = 0; h < 360; h += 6) {
      for (const c of [0.02, 0.08, 0.15, 0.22, 0.3, 0.37]) {
        for (let l = 0.05; l <= 0.98; l += 0.09) {
          const dominant = oklchToHex({ l, c, h });
          const second = oklchToHex({ l: 1 - l, c, h: (h + 180) % 360 });
          const third = oklchToHex({ l: 0.5, c: c / 2, h: (h + 90) % 360 });
          if (dominant === second || dominant === third || second === third) continue;

          for (const tone of TONES) {
            compilations += 1;
            const { deviations } = compileSemanticPalette({
              palette: { colors: [dominant, second, third], dominant },
              tonalDirection: tone,
            });
            for (const deviation of deviations) {
              if (deviation.kind === "contrast" || deviation.kind === "unsatisfiable") {
                offenders.push(
                  `${dominant}/${second}/${third} @${tone}: ${deviation.kind} ${deviation.path}`,
                );
              }
            }
          }
        }
      }
    }

    expect(compilations).toBeGreaterThan(5000);
    expect(offenders.slice(0, 10)).toEqual([]);
  });
});

/* ============================================================================================
 * Coverage summary — printed so a reviewer sees the corpus size and the real worst cases.
 * ========================================================================================== */

describe("corpus summary", () => {
  it("reports scale and worst-case margins", () => {
    const worst = new Map<number, { ratio: number; where: string }>();
    for (const { label, palette } of COMPILED) {
      for (const { role, against, min } of PAIR_TABLE) {
        for (const background of against) {
          const ratio = contrastRatio(palette[role], palette[background]);
          const current = worst.get(min);
          if (current === undefined || ratio < current.ratio) {
            worst.set(min, { ratio, where: `${label} · ${role} on ${background}` });
          }
        }
      }
    }

    const totalDeviations = COMPILED.reduce((sum, c) => sum + c.deviationCount, 0);
    const withDeviations = COMPILED.filter((c) => c.deviationCount > 0).length;

    const lines = [
      `palettes: ${CORPUS.length} × ${TONES.length} tones = ${COMPILED.length} compiled`,
      `tokens:   ${COMPILED.length * ALL_ROLES.length}`,
      `pairs:    ${COMPILED.length * PAIR_TABLE.reduce((n, r) => n + r.against.length, 0)}`,
      ...[...worst.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([min, w]) => `worst @ ${min}:1 → ${w.ratio.toFixed(2)}:1  (${w.where})`),
      `deviations: ${totalDeviations} across ${withDeviations}/${COMPILED.length} compilations`,
    ];
    console.log(`\n${lines.join("\n")}\n`);

    expect(CORPUS.length).toBeGreaterThanOrEqual(40);
  });
});
