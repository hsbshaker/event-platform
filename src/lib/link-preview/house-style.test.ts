import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOUSE } from "./house-style";

const css = readFileSync(path.resolve(import.meta.dirname, "../../styles/app-tokens.css"), "utf8");

/** A token's value, white space collapsed (a gradient spans several lines). */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`no token --${name}`);
  return m[1].trim().replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

describe("the preview's house style", () => {
  it("is the app tokens, restated", () => {
    expect(HOUSE.bg).toBe(token("app-bg"));
    expect(HOUSE.dusk).toBe(token("dusk"));
    expect(HOUSE.lit).toBe(token("app-lit"));
    expect(HOUSE.action).toBe(token("app-action"));
    expect(HOUSE.actionText).toBe(token("app-action-text"));
    expect(HOUSE.text).toBe(token("app-text"));
    expect(`${HOUSE.radiusSm}px`).toBe(token("radius-sm"));
    expect(`${HOUSE.widthNarrow}px`).toBe(token("width-narrow"));
    expect(`${HOUSE.space4}px`).toBe(token("space-4"));
    expect(`${HOUSE.space8}px`).toBe(token("space-8"));

    const { rx, ry, stops } = HOUSE.litGradient;
    expect(token("app-surface-lit-gradient")).toBe(
      `radial-gradient(${pct(rx)} ${pct(ry)} at 50% 0%, ` +
        stops.map((s) => `${s.color} ${pct(s.at)}`).join(", ") +
        ")",
    );
    const pool = `${HOUSE.duskPool.rgb.join(", ")}`;
    expect(token("dusk-pool")).toBe(
      `radial-gradient(closest-side, rgba(${pool}, ${HOUSE.duskPool.opacity}), rgba(${pool}, 0))`,
    );

    const { y, blur, color, opacity } = HOUSE.shadowSoft;
    expect(token("shadow-soft")).toBe(`0 ${y}px ${blur}px rgba(${rgb(color)}, ${opacity})`);
    for (const [scale, type] of [
      ["heading-md", HOUSE.headingMd],
      ["heading-lg", HOUSE.headingLg],
    ] as const) {
      expect(token(`type-${scale}`)).toBe(
        `${type.weight} ${type.size}px/${type.lineHeight}px var(--font-app)`,
      );
      expect(token(`tracking-${scale}`)).toBe(`${type.trackingEm}em`);
    }
  });

  it("uses the app's font family", () => {
    expect(token("font-app")).toMatch(/^var\(--font-alegreya-sans, "Alegreya Sans"\)/);
  });

  it("draws the seal as BrandSeal sets it", () => {
    const seal = readFileSync(
      path.resolve(import.meta.dirname, "../../components/app/BrandSeal.tsx"),
      "utf8",
    );
    // `lg`: 3rem square (Tailwind's h-12, 48px) at heading-lg, bold over the type class.
    expect(seal).toContain('lg: "h-12 w-12 text-heading-lg"');
    expect(HOUSE.seal.diameter).toBe(48);
    expect(seal).toContain("rounded-pill bg-app-action font-bold text-app-action-text shadow-soft");
    expect(HOUSE.seal.weight).toBe(700);
    expect(seal).toMatch(/>\s*R\s*<\/span>/);
  });
});
