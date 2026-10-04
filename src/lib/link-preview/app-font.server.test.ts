import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { INTER_SUBSETS } from "./app-font.server";

describe("the preview's app font", () => {
  it("draws exactly the Inter subsets the app loads", () => {
    const layout = readFileSync(path.resolve(import.meta.dirname, "../../app/layout.tsx"), "utf8");
    const m = /Inter\(\{[^}]*subsets:\s*\[([^\]]*)\]/.exec(layout);
    expect(m, "Inter's subsets in src/app/layout.tsx").not.toBeNull();
    const loaded = [...m![1].matchAll(/"([^"]+)"/g)].map((s) => s[1]);
    expect(INTER_SUBSETS.map((s) => s.name).sort()).toEqual(loaded.sort());
  });
});
