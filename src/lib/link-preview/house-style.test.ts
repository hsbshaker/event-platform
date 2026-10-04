import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOUSE } from "./house-style";

const css = readFileSync(path.resolve(import.meta.dirname, "../../styles/app-tokens.css"), "utf8");

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`no token --${name}`);
  return m[1].trim();
}

describe("the preview's house style", () => {
  it("is the app tokens, restated", () => {
    expect(HOUSE.bg).toBe(token("app-bg"));
    expect(HOUSE.surfaceSubtle).toBe(token("app-surface-subtle"));
    expect(HOUSE.surfaceMuted).toBe(token("app-surface-muted"));
    expect(HOUSE.text).toBe(token("app-text"));
    expect(HOUSE.borderStrong).toBe(token("app-border-strong"));
    expect(`${HOUSE.radiusLg}px`).toBe(token("radius-lg"));
    expect(`${HOUSE.widthNarrow}px`).toBe(token("width-narrow"));
    expect(`${HOUSE.space4}px`).toBe(token("space-4"));
    expect(`${HOUSE.space6}px`).toBe(token("space-6"));
    const { y, blur, color, opacity } = HOUSE.shadowSoft;
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).join(", ");
    expect(token("shadow-soft")).toBe(`0 ${y}px ${blur}px rgba(${rgb}, ${opacity})`);
    const { weight, size, lineHeight, trackingEm } = HOUSE.headingMd;
    expect(token("type-heading-md")).toBe(`${weight} ${size}px/${lineHeight}px var(--font-app)`);
    expect(token("tracking-heading-md")).toBe(`${trackingEm}em`);
  });

  it("uses the app's font family", () => {
    expect(token("font-app")).toMatch(/^var\(--font-inter, Inter\)/);
  });
});
