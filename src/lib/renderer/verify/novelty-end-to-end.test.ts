/**
 * Invariant obligation row 2, end to end.
 *
 * A valid novel `CompositionTree` with no counterpart in the legacy fixture library must validate,
 * repair, canonicalize, compile, render and geometry-verify clean at 390 and 1280 — **without any
 * library selection being invoked** (`docs/event-renderer-system.md §7.1`).
 *
 * The library adapters are not merely "not expected" here; they are replaced with functions that
 * throw, so entering one is a loud failure rather than something a later reader has to notice.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof`; `spec.md §32` #14.
 */

import { describe, expect, it, vi } from "vitest";

import { assemblePreVerificationSpec } from "../compile/spec";
import { canonicalize } from "../composition/canonicalize";
import type { Capabilities } from "../composition/nodes";
import { repair, type Macros } from "../composition/repair";
import { seqSim, skeleton } from "../composition/signature";
import { validateSchema } from "../composition/validate-schema";
import { validateStructure } from "../composition/validate-structure";
import type { DesignIntent } from "../design-intent";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { chromiumAvailability } from "./browser";
import { verifyGeometry } from "./verify";

vi.mock("../recovery", () => ({
  libraryMacros: () => {
    throw new Error("row 2 violated: the recovery adapter was entered for a novel tree");
  },
  terminalFallback: () => {
    throw new Error("row 2 violated: the terminal fallback was entered for a novel tree");
  },
}));

vi.mock("../few-shot", () => ({
  FEW_SHOT_EXAMPLE_COUNT: 3,
  compositionExamples: () => {
    throw new Error("row 2 violated: the few-shot adapter was entered during compilation");
  },
}));

const CAPS: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

const INTENT: DesignIntent = {
  family: "editorial",
  tonalDirection: "mid",
  palette: { colors: ["#1B3A2F", "#EFE6D3", "#8C6A3F"], dominant: "#1B3A2F" },
  typographyPairing: "transitional_newsreader_tight",
  density: "balanced",
  composition: {
    asymmetry: "strong",
    hierarchy: "dramatic",
    rhythm: "punctuated",
    sectionContrast: "high",
    ornament: "restrained",
  },
  motifs: ["gingham", "celestial"],
};

const CONTENT = {
  eyebrow: "A winter gathering",
  title: "Baby Shaker is on the way",
  hosts: "Hosted with love by Haseeb & Shezia",
  description: "An afternoon of good food, warm company, and celebrating our little boy.",
  date: "Saturday, December 19, 2026",
  dayNumeral: "19",
  monthShort: "Dec",
  year: "2026",
  weekday: "Saturday",
  time: "1:00–5:00 PM",
  venue: "The Lodge at Hanson Park",
  location: "Aldie, Virginia",
  deadline: "Kindly respond by December 1",
  initial: "B",
};

/** Macros that make any library entry through the repair hook a failure too. */
const forbiddenMacros: Macros = {
  hero: () => {
    throw new Error("row 2 violated: a repair macro was invoked for a clean novel tree");
  },
  rsvpSection: () => {
    throw new Error("row 2 violated: a repair macro was invoked for a clean novel tree");
  },
  registrySection: () => {
    throw new Error("row 2 violated: a repair macro was invoked for a clean novel tree");
  },
};

const chromium = await chromiumAvailability();
const inBrowser = chromium.available ? it : it.skip;
if (!chromium.available)
  console.warn(`[row 2] Chromium unavailable — the geometry case is SKIPPED: ${chromium.reason}`);

describe("row 2: a novel tree is first-class, end to end", () => {
  inBrowser(
    "validates, repairs, canonicalizes, compiles, renders and verifies clean at 390 and 1280",
    async () => {
      const tree = novelTree();

      expect(validateSchema(tree).ok).toBe(true);
      expect(validateStructure(tree, CAPS)).toEqual([]);

      const repaired = repair(tree, CAPS, 7, forbiddenMacros);
      expect(repaired.repairs).toEqual([]);
      expect(repaired.remaining).toEqual([]);

      const canon = canonicalize(repaired.tree);
      const spec = assemblePreVerificationSpec({
        composition: canon.tree,
        designIntent: INTENT,
        capabilities: CAPS,
        seed: 11,
      });

      const result = await verifyGeometry({ spec, content: CONTENT });
      expect(result.ok, result.ok ? "" : JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      expect(result.spec.verified.clean).toBe(true);
      expect(result.spec.verified.authoritative).toBe("rendered-geometry");
      expect(result.spec.verified.desktop.pageOverflow).toBe(false);
      expect(result.spec.verified.mobile.pageOverflow).toBe(false);
      expect(result.spec.compositionHash).toBe(canon.hash);
    },
    180_000,
  );

  it("is genuinely novel: it resembles no library hero skeleton at either breakpoint", async () => {
    // If the fixture ever drifted into resembling a library silhouette, the test above would stop
    // proving what it claims. The library skeletons come from the committed oracle rather than
    // from the library module, so this holds after `proof-b/` is gone.
    const { readFileSync } = await import("node:fs");
    const golden = JSON.parse(
      readFileSync(
        new URL("../../../../tests/fixtures/renderer-golden/library-heroes.json", import.meta.url)
          .pathname,
        "utf8",
      ),
    ) as Record<
      string,
      { skeletonDesktop: { hero: string[] }; skeletonMobile: { hero: string[] } }
    >;

    expect(Object.keys(golden)).toHaveLength(26);
    const tree = canonicalize(novelTree()).tree;
    for (const mode of ["desktop", "mobile"] as const) {
      const hero = skeleton(tree, mode).hero;
      for (const [key, entry] of Object.entries(golden)) {
        const libraryHero =
          mode === "desktop" ? entry.skeletonDesktop.hero : entry.skeletonMobile.hero;
        expect(seqSim(hero, libraryHero), `${key} at ${mode}`).toBeLessThan(0.7);
      }
    }
  });
});
