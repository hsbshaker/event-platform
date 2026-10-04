import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "./typography";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const css = readFileSync(path.join(ROOT, "src/styles/card-fonts.css"), "utf8");
const faces = [...css.matchAll(/@font-face\s*{[^}]*}/g)].map((m) => m[0]);

describe("card typography catalog", () => {
  it("lists every pairing exactly once in TYPOGRAPHY_KEYS", () => {
    expect([...TYPOGRAPHY_KEYS].sort()).toEqual(Object.keys(TYPOGRAPHY).sort());
  });

  it("has at least one @font-face for every pairing's display and body family", () => {
    const declared = new Set(
      faces.map((face) => /font-family:\s*"([^"]+)"/.exec(face)?.[1]).filter(Boolean),
    );
    for (const id of TYPOGRAPHY_KEYS) {
      expect(declared, `${id} display`).toContain(TYPOGRAPHY[id].display);
      expect(declared, `${id} body`).toContain(TYPOGRAPHY[id].body);
    }
  });

  it("references every woff2 in public/fonts/card, and only files that exist", () => {
    const onDisk = readdirSync(path.join(ROOT, "public/fonts/card")).filter((f) =>
      f.endsWith(".woff2"),
    );
    const referenced = [...css.matchAll(/url\("\/fonts\/card\/([^"]+\.woff2)"\)/g)].map(
      (m) => m[1],
    );
    expect(onDisk.length).toBeGreaterThan(0);
    expect([...referenced].sort()).toEqual([...onDisk].sort());
  });
});
