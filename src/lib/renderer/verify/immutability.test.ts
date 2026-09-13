/**
 * The invariant this whole verifier exists to protect, checked independently of the verifier's
 * own suite: **geometry verification never touches the canonical CompositionTree.**
 *
 * `proof-b/verify.js` fits by mutating `spec.composition` — rewriting `emphasis`, swapping a
 * `Frame` for a `Stack`. `docs/event-renderer-system.md §6` forbids that in production, because a
 * content re-fit must append a revision with the same tree and the same `compositionHash`:
 *
 * > "A content edit that affects fit appends a new immutable revision (same tree, same
 * > `compositionHash`, no model call)."
 *
 * If this file ever fails, the concept's identity is no longer stable across a content edit and
 * every persisted revision's hash is suspect. It is written from the outside — against serialised
 * bytes and the public result type, not the round loop's internals — so a change that edits
 * `verify.ts` and `verify.test.ts` together still fails here.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`; `spec.md §32` #20.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assemblePreVerificationSpec } from "../compile/spec";
import { NO_OVERRIDES } from "../compile/verification";
import { canonicalize } from "../composition/canonicalize";
import type { Capabilities, CompositionTree } from "../composition/nodes";
import { walk } from "../composition/walk";
import type { DesignIntent } from "../design-intent";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { chromiumAvailability } from "./browser";
import { verifyGeometry } from "./verify";

const GOLDEN = new URL("../../../../tests/fixtures/renderer-golden/", import.meta.url).pathname;

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

/** Long enough to force demotions, so the fit path actually runs. */
const LONG_CONTENT = {
  eyebrow: "An afternoon in the depths of a long and particularly unhurried winter",
  title: "Baby Shaker Is On The Way And We Would Be Delighted If You Came To Celebrate",
  hosts: "Hosted with a great deal of love by Haseeb and Shezia and the whole extended family",
  description: "An afternoon of good food, warm company, and celebrating our little boy.",
  date: "Saturday, December 19, 2026",
  dayNumeral: "19",
  monthShort: "Dec",
  year: "2026",
  weekday: "Saturday",
  time: "1:00–5:00 PM",
  venue: "The Lodge at Hanson Park on the far side of the north meadow",
  location: "Aldie, Virginia",
  deadline: "Kindly respond by December 1",
  initial: "B",
};

const chromium = await chromiumAvailability();
/**
 * `REQUIRE_GEOMETRY_BROWSER=1` turns an unavailable runtime into a failure rather than a skip.
 * Without it these cases skip loudly where Chromium cannot launch; with it, a CI job that is
 * supposed to have a browser cannot report this file green having measured nothing.
 */
const requireBrowser = process.env.REQUIRE_GEOMETRY_BROWSER === "1";
if (!chromium.available && requireBrowser)
  throw new Error(
    `[immutability] REQUIRE_GEOMETRY_BROWSER=1 but Chromium is unavailable: ${chromium.reason}`,
  );
const inBrowser = chromium.available ? it : it.skip;
if (!chromium.available)
  console.warn(`[immutability] Chromium unavailable — browser cases SKIPPED: ${chromium.reason}`);

function specFor(tree: CompositionTree) {
  return assemblePreVerificationSpec({
    composition: tree,
    designIntent: INTENT,
    capabilities: CAPS,
    seed: 7,
  });
}

describe("geometry verification cannot alter the canonical tree", () => {
  inBrowser(
    "leaves the serialized tree and the hash byte-identical, on a page that needs fitting",
    async () => {
      const pre = specFor(novelTree());
      const treeBefore = JSON.stringify(pre.composition);
      const hashBefore = pre.compositionHash;
      const specBefore = JSON.stringify(pre);

      const result = await verifyGeometry({ spec: pre, content: LONG_CONTENT });

      // The input spec is untouched, whatever the outcome.
      expect(JSON.stringify(pre)).toBe(specBefore);
      expect(JSON.stringify(pre.composition)).toBe(treeBefore);

      expect(result.ok, result.ok ? "" : JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      // The output carries the same tree — the same object, not a rewritten copy.
      expect(result.spec.composition).toBe(pre.composition);
      expect(JSON.stringify(result.spec.composition)).toBe(treeBefore);
      expect(result.spec.compositionHash).toBe(hashBefore);
      expect(canonicalize(result.spec.composition).hash).toBe(hashBefore);
    },
    120_000,
  );

  inBrowser(
    "records the fit in overrides rather than in the tree",
    async () => {
      const pre = specFor(novelTree());
      const authored = new Map<string, unknown>();
      walk(pre.composition, ({ node }) => {
        if ((node as { emphasis?: string }).emphasis)
          authored.set(node.id!, (node as { emphasis?: string }).emphasis);
      });

      const result = await verifyGeometry({ spec: pre, content: LONG_CONTENT });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Every authored emphasis is still what the model wrote.
      walk(result.spec.composition, ({ node }) => {
        if (authored.has(node.id!))
          expect((node as { emphasis?: string }).emphasis, node.id).toBe(authored.get(node.id!));
      });

      // And the demotions are somewhere — in the overrides, with a matching repair each.
      const demoted = Object.keys(result.spec.overrides.emphasis);
      expect(result.spec.verified.fitDemotions).toBe(
        result.spec.compilerRepairs.filter((r) => r.rule === "fit.verified").length,
      );
      if (result.spec.verified.fitDemotions > 0) {
        expect(demoted.length).toBeGreaterThan(0);
        for (const id of demoted) expect(authored.has(id) || true).toBe(true);
      }
    },
    120_000,
  );

  inBrowser(
    "keeps all 12 reduced-capability frozen trees byte-identical through verification",
    async () => {
      const recs = JSON.parse(readFileSync(`${GOLDEN}frozen-final-reduced.json`, "utf8")) as Record<
        string,
        { spec: { composition: CompositionTree } }
      >;
      const reduced: Capabilities = {
        ...CAPS,
        registry: false,
        gifts: false,
        externalRegistry: false,
        cashFund: false,
        description: false,
      };

      let checked = 0;
      for (const [id, rec] of Object.entries(recs)) {
        const pre = assemblePreVerificationSpec({
          composition: rec.spec.composition,
          designIntent: INTENT,
          capabilities: reduced,
          seed: 1,
        });
        const before = JSON.stringify(pre.composition);
        const hash = pre.compositionHash;

        const result = await verifyGeometry({ spec: pre, content: LONG_CONTENT });
        expect(JSON.stringify(pre.composition), `${id} input mutated`).toBe(before);
        if (result.ok) {
          expect(JSON.stringify(result.spec.composition), id).toBe(before);
          expect(result.spec.compositionHash, id).toBe(hash);
        }
        checked++;
      }
      expect(checked).toBe(12);
    },
    600_000,
  );

  it("never starts from a spec that already claims to be verified", () => {
    const pre = specFor(novelTree());
    expect(pre.state).toBe("pre-verification");
    expect(pre.verified).toBeNull();
    // A pre-verification spec carries no overrides at all — they are the verifier's output.
    expect((pre as { overrides?: unknown }).overrides ?? NO_OVERRIDES).toEqual(NO_OVERRIDES);
  });
});
