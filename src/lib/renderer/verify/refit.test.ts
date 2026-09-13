/**
 * The content re-fit invariant (CO-11).
 *
 * `docs/event-renderer-system.md §6`: a content edit appends a new immutable revision with the
 * **same tree**, the **same `compositionHash`** and **no model call**. This is what makes a
 * concept's identity survive a host typing a longer venue name into the details panel.
 *
 * The case is deliberately the one that actually stresses it: a short venue that fits, then a long
 * one that does not, on a `monumental` hierarchy where the display type is largest.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` ("A content edit
 * re-fits into a new revision of the same concept without a model call"); `spec.md §32` #20, #21.
 */

import { describe, expect, it } from "vitest";

import { assemblePreVerificationSpec } from "../compile/spec";
import type { Capabilities } from "../composition/nodes";
import type { DesignIntent } from "../design-intent";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { chromiumAvailability } from "./browser";
import { refitContent } from "./refit";
import type { ResolvedDesignSpec } from "./result";
import { verifyGeometry } from "./verify";

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
  tonalDirection: "dark",
  palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
  typographyPairing: "heritage_caslon_karla",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "monumental",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
  },
  motifs: ["plaid"],
};

const BASE = {
  eyebrow: "A winter gathering",
  title: "Baby Shaker is on the way",
  hosts: "Hosted with love by Haseeb & Shezia",
  description: "An afternoon of good food and warm company.",
  date: "Saturday, December 19, 2026",
  dayNumeral: "19",
  monthShort: "Dec",
  year: "2026",
  weekday: "Saturday",
  time: "1:00–5:00 PM",
  location: "Aldie, Virginia",
  deadline: "Kindly respond by December 1",
  initial: "B",
};

const SHORT = { ...BASE, venue: "The Lodge" };
const LONG = {
  ...BASE,
  venue: "The Lodge at Hanson Park on the far side of the north meadow, past the equestrian centre",
};

const chromium = await chromiumAvailability();
const inBrowser = chromium.available ? it : it.skip;
if (!chromium.available)
  console.warn(`[refit] Chromium unavailable — CO-11 cases SKIPPED: ${chromium.reason}`);

describe("CO-11: a content edit re-fits into a new revision of the same concept", () => {
  inBrowser(
    "keeps the tree and the hash, increments contentVersion, and points back",
    async () => {
      const pre = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: INTENT,
        capabilities: CAPS,
        seed: 7,
      });

      const first = await verifyGeometry({ spec: pre, content: SHORT, contentVersion: 1 });
      expect(first.ok, first.ok ? "" : JSON.stringify(first)).toBe(true);
      if (!first.ok) return;
      const v1: ResolvedDesignSpec = first.spec;
      expect(v1.verified.clean).toBe(true);

      const second = await refitContent({
        previous: v1,
        content: LONG,
        previousSpecId: "spec-1",
      });
      expect(second.ok, second.ok ? "" : JSON.stringify(second)).toBe(true);
      if (!second.ok) return;
      const v2 = second.spec;

      // The concept's identity is unchanged.
      expect(v2.compositionHash).toBe(v1.compositionHash);
      expect(JSON.stringify(v2.composition)).toBe(JSON.stringify(v1.composition));
      expect(v2.designIntent).toEqual(v1.designIntent);
      expect(v2.seed).toBe(v1.seed);

      // The revision bookkeeping §6 requires.
      expect(v2.contentVersion).toBe(2);
      expect(v2.supersedesSpecId).toBe("spec-1");

      // New geometry evidence, truthfully clean.
      expect(v2.verified.clean).toBe(true);
      expect(v2.verified.authoritative).toBe("rendered-geometry");
      expect(v2.verified).not.toEqual(v1.verified);

      // And the earlier revision is untouched — revisions are immutable.
      expect(v1.contentVersion).toBe(1);
      expect(v1.supersedesSpecId).toBeUndefined();
    },
    180_000,
  );

  inBrowser(
    "re-fits the longer content rather than reusing the shorter content's geometry",
    async () => {
      const pre = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: INTENT,
        capabilities: CAPS,
        seed: 7,
      });
      const short = await verifyGeometry({ spec: pre, content: SHORT, contentVersion: 1 });
      expect(short.ok).toBe(true);
      if (!short.ok) return;

      const long = await refitContent({
        previous: short.spec,
        content: LONG,
        previousSpecId: "spec-1",
      });
      expect(long.ok).toBe(true);
      if (!long.ok) return;

      // The measurement is of the new content: at least one summary differs. If these were equal
      // the re-fit would be reporting the old page's geometry for a page nobody measured.
      const changed =
        JSON.stringify(long.spec.verified.desktop) !==
          JSON.stringify(short.spec.verified.desktop) ||
        JSON.stringify(long.spec.verified.mobile) !== JSON.stringify(short.spec.verified.mobile);
      expect(changed, "re-fit produced identical geometry for different content").toBe(true);
    },
    180_000,
  );

  inBrowser(
    "runs no repair, no planner and no selector — only resolution and geometry",
    async () => {
      const pre = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: INTENT,
        capabilities: CAPS,
        seed: 7,
        repairs: [{ rule: "coverage.missing", path: "sections[0]", kind: "coverage" }],
      });
      const first = await verifyGeometry({ spec: pre, content: SHORT, contentVersion: 1 });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.spec.compilerRepairs.some((r) => r.rule === "coverage.missing")).toBe(true);

      const refit = await refitContent({
        previous: first.spec,
        content: LONG,
        previousSpecId: "spec-1",
      });
      expect(refit.ok).toBe(true);
      if (!refit.ok) return;

      // The generation-time repairs belong to the revision that ran them. A re-fit runs none, so
      // its log carries only its own verified-fit entries.
      for (const repair of refit.spec.compilerRepairs)
        expect(["fit.verified", "fit.verified.structural"], repair.rule).toContain(repair.rule);
    },
    180_000,
  );
});
