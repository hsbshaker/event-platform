/**
 * The semantic copy table is pinned because it is geometry.
 *
 * A longer heading is a different line count, a different verified fit and a different
 * `ResolvedDesignSpec`. This test exists so that changing one of these strings is a deliberate act
 * that fails a test and forces a geometry regression run
 * (`docs/event-renderer-system.md §2.2`, §9), rather than a quiet edit whose effect shows up in a
 * rendered page nobody re-measured.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and `Renderer proof`.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CTA_COPY, SECTION_HEADING_COPY, SEMANTIC_COPY_STRINGS } from "./semantic-copy";

describe("the semantic copy table", () => {
  it("is exactly the canonical MVP wording", () => {
    expect(SECTION_HEADING_COPY).toEqual({
      details: "Details",
      rsvp: "RSVP",
      registry: "Registry",
    });
    expect(CTA_COPY).toEqual({ rsvp: "RSVP", registry: "Registry" });
    expect(SEMANTIC_COPY_STRINGS).toEqual(["Details", "RSVP", "Registry"]);
  });

  it("covers every heading slot and CTA target the language admits", () => {
    expect(Object.keys(SECTION_HEADING_COPY).sort()).toEqual(["details", "registry", "rsvp"]);
    expect(Object.keys(CTA_COPY).sort()).toEqual(["registry", "rsvp"]);
  });

  it("is not something a renderer component can invent for itself", () => {
    // The table is compiler-owned. A component holding its own literal would change rendered
    // geometry without passing through anything that re-verifies the fit.
    const dir = new URL("../../../components/event-renderer/", import.meta.url).pathname;
    const sources: { file: string; code: string }[] = [];
    const walkDir = (d: string, prefix = "") => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walkDir(path.join(d, entry.name), `${prefix}${entry.name}/`);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
          sources.push({
            file: `${prefix}${entry.name}`,
            code: readFileSync(path.join(d, entry.name), "utf8")
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/(^|[^:])\/\/.*$/gm, "$1"),
          });
      }
    };
    walkDir(dir);
    expect(sources.length).toBeGreaterThan(0);

    for (const { file, code } of sources) {
      for (const copy of SEMANTIC_COPY_STRINGS) {
        // A bare string literal of a table value, anywhere in component code.
        expect(
          new RegExp(`["'\`]${copy}["'\`]`).test(code),
          `${file} hard-codes the semantic copy "${copy}" instead of reading the compiler table`,
        ).toBe(false);
      }
      expect(
        /SECTION_HEADING_COPY\s*[:=]\s*\{/.test(code) || /CTA_COPY\s*[:=]\s*\{/.test(code),
        `${file} declares its own copy table`,
      ).toBe(false);
    }
  });

  it("changes only through the compiler, so a change is a geometry change", () => {
    // The table's own module must not import anything that could vary it per event, per concept
    // or per model output. It is a constant.
    const source = readFileSync(new URL("./semantic-copy.ts", import.meta.url).pathname, "utf8");
    expect(source).not.toMatch(/^import\s/m);
  });
});
