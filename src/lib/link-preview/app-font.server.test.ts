import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_FONT_FAMILY,
  APP_FONT_SUBSETS,
  APP_FONT_WEIGHTS,
  loadAppFont,
} from "./app-font.server";

const layout = readFileSync(path.resolve(import.meta.dirname, "../../app/layout.tsx"), "utf8");
/** The `next/font/google` call that loads the app's family in `src/app/layout.tsx`. */
const call = new RegExp(`${APP_FONT_FAMILY.replaceAll(" ", "_")}\\(\\{([^}]*)\\}\\)`).exec(layout);

describe("the preview's app font", () => {
  it("is the family the app loads", () => {
    expect(call, `${APP_FONT_FAMILY}({ … }) in src/app/layout.tsx`).not.toBeNull();
  });

  it("draws exactly the subsets the app loads", () => {
    const m = /subsets:\s*\[([^\]]*)\]/.exec(call![1]);
    expect(m, "subsets in src/app/layout.tsx").not.toBeNull();
    const loaded = [...m![1].matchAll(/"([^"]+)"/g)].map((s) => s[1]);
    expect(APP_FONT_SUBSETS.map((s) => s.name).sort()).toEqual(loaded.sort());
  });

  it("draws only weights the app loads, each from its own static file", async () => {
    const m = /weight:\s*\[([^\]]*)\]/.exec(call![1]);
    const loaded = [...m![1].matchAll(/"(\d+)"/g)].map((s) => Number(s[1]));
    for (const weight of APP_FONT_WEIGHTS) expect(loaded).toContain(weight);
    const [medium, bold] = await Promise.all([loadAppFont(500), loadAppFont(700)]);
    const style = { size: 26, letterSpacingEm: 0 };
    expect(bold.measure("Revelnote", style)).not.toBe(medium.measure("Revelnote", style));
    // Static: a weight without a file is refused, never synthesized from another.
    await expect(loadAppFont(400)).rejects.toThrow(/500, 700 only/);
    await expect(loadAppFont(650)).rejects.toThrow(/500, 700 only/);
  });
});
