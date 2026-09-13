/**
 * §9 gate 4, the geometry half: all 72 frozen confirmation trees verify clean through production.
 *
 * The non-geometry half is in `tests/unit/phase3-exit.test.ts`. This one launches Chromium, so it
 * is slow and lives beside the verifier. Together they are the Phase 3 replay gate: 72 of 72, and
 * the two rejected collision attempts are not trees and are not counted.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof` ("Content fit is verified against rendered
 * geometry at 390 and 1280"); `spec.md §32` #20.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assemblePreVerificationSpec } from "../compile/spec";
import type { Capabilities, CompositionTree } from "../composition/nodes";
import type { DesignIntent } from "../design-intent";
import { chromiumAvailability } from "./browser";
import { verifyGeometry } from "./verify";

const GOLDEN = new URL("../../../../tests/fixtures/renderer-golden/", import.meta.url).pathname;

const FULL: Capabilities = {
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
const REDUCED: Capabilities = {
  ...FULL,
  registry: false,
  gifts: false,
  externalRegistry: false,
  cashFund: false,
  description: false,
};

const CONTENT = {
  eyebrow: "A baby shower for our little boy",
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

interface FrozenRecord {
  spec: {
    composition: CompositionTree;
    designIntent: Record<string, unknown>;
    seed?: number;
  };
}

/** The recorded intent, completed with the fields the harness never produced. */
function intentFor(recorded: Record<string, unknown>): DesignIntent {
  const composition = recorded.composition as DesignIntent["composition"];
  return {
    family: recorded.family as DesignIntent["family"],
    tonalDirection: recorded.tonalDirection as DesignIntent["tonalDirection"],
    palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
    typographyPairing: (recorded.typography ??
      "heritage_caslon_karla") as DesignIntent["typographyPairing"],
    density: (recorded.density ?? "balanced") as DesignIntent["density"],
    composition,
    motifs: ["plaid", "equestrian"],
  };
}

function frozen(file: string): [string, FrozenRecord][] {
  return Object.entries(
    JSON.parse(readFileSync(`${GOLDEN}${file}`, "utf8")) as Record<string, FrozenRecord>,
  );
}

const chromium = await chromiumAvailability();
/**
 * `REQUIRE_GEOMETRY_BROWSER=1` turns an unavailable runtime into a failure rather than a skip. The
 * 72-tree replay is the Phase 3 exit gate; a CI job that is supposed to have a browser must not be
 * able to report it green having measured nothing.
 */
const requireBrowser = process.env.REQUIRE_GEOMETRY_BROWSER === "1";
if (!chromium.available && requireBrowser)
  throw new Error(
    `[frozen replay] REQUIRE_GEOMETRY_BROWSER=1 but Chromium is unavailable: ${chromium.reason}`,
  );
const inBrowser = chromium.available ? it : it.skip;
if (!chromium.available)
  console.warn(
    `[frozen replay] Chromium unavailable — the 72-tree gate is SKIPPED: ${chromium.reason}`,
  );

describe("§9: the frozen confirmation set verifies clean through production", () => {
  inBrowser(
    "60 full-capability trees, all clean at 390 and 1280",
    async () => {
      const trees = frozen("frozen-final.json");
      expect(trees).toHaveLength(60);
      const failures: string[] = [];
      let demotions = 0;
      let relaxations = 0;

      for (const [id, rec] of trees) {
        const pre = assemblePreVerificationSpec({
          composition: rec.spec.composition,
          designIntent: intentFor(rec.spec.designIntent),
          capabilities: FULL,
          seed: rec.spec.seed ?? 1,
        });
        const before = JSON.stringify(pre.composition);
        const result = await verifyGeometry({ spec: pre, content: CONTENT });

        expect(JSON.stringify(pre.composition), `${id} mutated`).toBe(before);
        if (!result.ok) {
          failures.push(`${id}: ${result.kind} — ${result.detail}`);
          continue;
        }
        expect(result.spec.verified.desktop.pageOverflow, id).toBe(false);
        expect(result.spec.verified.mobile.pageOverflow, id).toBe(false);
        expect(result.spec.compositionHash, id).toBe(pre.compositionHash);
        demotions += result.spec.verified.fitDemotions;
        relaxations += result.spec.verified.fitRelaxations;
      }

      console.warn(
        `[frozen replay] final: ${trees.length - failures.length}/60 clean, ` +
          `${demotions} demotions, ${relaxations} relaxations`,
      );
      expect(failures).toEqual([]);
    },
    1_800_000,
  );

  inBrowser(
    "12 reduced-capability trees, all clean, with no disabled feature rendered",
    async () => {
      const trees = frozen("frozen-final-reduced.json");
      expect(trees).toHaveLength(12);
      const failures: string[] = [];

      for (const [id, rec] of trees) {
        const pre = assemblePreVerificationSpec({
          composition: rec.spec.composition,
          designIntent: intentFor(rec.spec.designIntent),
          capabilities: REDUCED,
          seed: rec.spec.seed ?? 1,
        });
        const result = await verifyGeometry({ spec: pre, content: CONTENT });
        if (!result.ok) {
          failures.push(`${id}: ${result.kind} — ${result.detail}`);
          continue;
        }
        expect(result.spec.verified.desktop.pageOverflow, id).toBe(false);
        expect(result.spec.verified.mobile.pageOverflow, id).toBe(false);
      }

      console.warn(`[frozen replay] reduced: ${trees.length - failures.length}/12 clean`);
      expect(failures).toEqual([]);
    },
    600_000,
  );
});
