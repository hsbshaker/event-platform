/**
 * F1 — typography composition, against a real browser at 390 and 1280.
 *
 * The defects Human Test #1 reviewers reported were all *contained*: every one of them renders
 * inside its box, so §3.1's three overflow clauses passed the page
 * (`docs/human-test-1/qualitative-findings.md`, F1, "Why verification passed all of it"). These
 * cases are the named examples, and each asserts the same two things: that the old criterion still
 * says the page is fine, and that the new one does not.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` ("Content fit is
 * verified against rendered geometry at 390 and 1280"; "Every structural rule ... is validated and
 * repaired deterministically, with every repair logged by kind"); `spec.md §31 — Renderer proof`;
 * `spec.md §31 — Responsive/accessibility`. `spec.md §32` #20, #21, #24.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { titleLines } from "../compile/title-lines";
import { assemblePreVerificationSpec } from "../compile/spec";
import { NO_OVERRIDES } from "../compile/verification";
import type { AnyNode, Capabilities, CompositionTree } from "../composition/nodes";
import type { DesignIntent } from "../design-intent";
import type { EventContent } from "@/components/event-renderer/contract";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { chromiumAvailability, withGeometryPage } from "./browser";
import { buildMeasurableDocument } from "./html";
import { BREAKPOINTS, VIEWPORTS, type Breakpoint, type PageMeasurement } from "./measure";
import { TOLERANCE_PX, summarise, verifyGeometry } from "./verify";

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

/** The Human Test #1 content, verbatim: these are the strings reviewers saw break. */
const CONTENT: EventContent = {
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

const INTENT: DesignIntent = {
  family: "editorial",
  tonalDirection: "light",
  palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
  typographyPairing: "heritage_caslon_karla",
  density: "balanced",
  composition: {
    asymmetry: "strong",
    hierarchy: "monumental",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "decorative",
  },
  motifs: ["plaid", "equestrian"],
};

/** A deep copy of the novel tree with every `EventTitle` given `layout`. */
function tree(layout: "stagger" | "cascade" | "block"): CompositionTree {
  const copy = JSON.parse(JSON.stringify(novelTree())) as CompositionTree;
  const visit = (node: AnyNode): void => {
    const n = node as unknown as Record<string, unknown>;
    if (n.t === "EventTitle") n.layout = layout;
    for (const value of Object.values(n)) {
      if (Array.isArray(value))
        value.forEach((v) => typeof v === "object" && v && visit(v as AnyNode));
      else if (value && typeof value === "object") visit(value as AnyNode);
    }
  };
  copy.sections.forEach((s) => visit(s.root));
  return copy;
}

/**
 * One of the 72 frozen confirmation trees, by the id it carries in the §9 replay gate.
 *
 * The narrow-measure cases are taken from the confirmation set rather than hand-built, because
 * these are the compositions the defect actually occurred in: 32 sets the date in a column too
 * narrow for its words, 51 sets the venue four lines deep in a rail track. A synthetic tree would
 * only prove the check fires on a tree written to make it fire.
 */
function frozen(id: string): {
  composition: CompositionTree;
  designIntent: DesignIntent;
  seed: number;
} {
  const all = JSON.parse(readFileSync(`${GOLDEN}frozen-final.json`, "utf8")) as Record<
    string,
    { spec: { composition: CompositionTree; designIntent: Record<string, unknown>; seed?: number } }
  >;
  const record = all[id];
  if (!record) throw new Error(`frozen tree ${id} is not in the confirmation set`);
  // The recorded intent, completed exactly as `frozen-replay.test.ts` completes it, so this file
  // and the §9 gate measure the same page.
  const r = record.spec.designIntent;
  return {
    composition: record.spec.composition,
    seed: record.spec.seed ?? 1,
    designIntent: {
      family: r.family as DesignIntent["family"],
      tonalDirection: r.tonalDirection as DesignIntent["tonalDirection"],
      palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
      typographyPairing: (r.typography ??
        "heritage_caslon_karla") as DesignIntent["typographyPairing"],
      density: (r.density ?? "balanced") as DesignIntent["density"],
      composition: r.composition as DesignIntent["composition"],
      motifs: ["plaid", "equestrian"],
    },
  };
}

function spec(composition: CompositionTree, designIntent: DesignIntent = INTENT, seed = 7) {
  return assemblePreVerificationSpec({ composition, designIntent, capabilities: CAPS, seed });
}

const chromium = await chromiumAvailability();
const requireBrowser = process.env.REQUIRE_GEOMETRY_BROWSER === "1";
if (!chromium.available && requireBrowser)
  throw new Error(
    `[typography] REQUIRE_GEOMETRY_BROWSER=1 but Chromium is unavailable: ${chromium.reason}`,
  );
const inBrowser = chromium.available ? it : it.skip;
if (!chromium.available)
  console.warn(`[typography] Chromium unavailable — browser cases SKIPPED: ${chromium.reason}`);

/** Measure one composition, unrepaired, at both widths. */
async function measureRaw(
  input:
    CompositionTree | { composition: CompositionTree; designIntent: DesignIntent; seed: number },
  content: EventContent = CONTENT,
): Promise<Record<Breakpoint, PageMeasurement>> {
  const pre =
    "sections" in input ? spec(input) : spec(input.composition, input.designIntent, input.seed);
  const { html, families } = buildMeasurableDocument({
    spec: pre,
    content,
    overrides: NO_OVERRIDES,
  });
  return withGeometryPage(async (page) => {
    const out = {} as Record<Breakpoint, PageMeasurement>;
    for (const bp of BREAKPOINTS) {
      out[bp] = await page.measure(html, {
        mode: bp,
        viewport: VIEWPORTS[bp],
        tolerancePx: TOLERANCE_PX,
        requiredFamilies: families,
        overflowLimit: 12,
      });
    }
    return out;
  });
}

const titleOf = (m: PageMeasurement) => m.texts.find((t) => t.kind === "EventTitle")!;

describe("F1: the title treatments compose rather than fracture", () => {
  for (const layout of ["stagger", "cascade"] as const) {
    it(`${layout} emits exactly the breaker's lines as markup, with no browser involved`, () => {
      const expected = titleLines(CONTENT.title);
      expect(expected).toEqual(["Baby Shaker", "is on the way"]);

      const { html } = buildMeasurableDocument({
        spec: spec(tree(layout)),
        content: CONTENT,
        overrides: NO_OVERRIDES,
      });
      const h1 = /<h1[^>]*ev-lay-(?:stagger|cascade)[^>]*>([\s\S]*?)<\/h1>/.exec(html);
      expect(h1, "a treated title is in the document").not.toBeNull();
      const rendered = [...h1![1].matchAll(/<span class="ev-line">([^<]*)<\/span>/g)].map(
        (m) => m[1],
      );
      // Not two words, then two, then the rest: the lines the breaker chose.
      expect(rendered).toEqual(expected);
    });

    inBrowser(
      `${layout} never lets a rendered line fall inside a word, at either width`,
      async () => {
        const expected = titleLines(CONTENT.title);
        const m = await measureRaw(tree(layout));
        for (const bp of BREAKPOINTS) {
          const title = titleOf(m[bp]);
          // A treated line may still wrap where the measure is genuinely tight (F1, M3) — what it
          // may never do is break inside a word, which is the artifact that reads as a fault.
          expect(
            title.lineGeometry.count,
            `${bp} at least the breaker's lines`,
          ).toBeGreaterThanOrEqual(expected.length);
          expect(title.lineGeometry.count, `${bp} no intra-word break`).toBeLessThanOrEqual(
            title.words,
          );
        }
      },
      180_000,
    );

    inBrowser(
      `${layout} still displaces a line, and never across the whole measure`,
      async () => {
        // The non-goal: "not removing stagger or cascade. Not banning asymmetry." The treatment
        // must still be visible — and bounded, which the old `text-align: right` flip was not.
        const m = await measureRaw(tree(layout));
        for (const bp of BREAKPOINTS) {
          const title = titleOf(m[bp]);
          const spread = title.lineGeometry.edgeSpread;
          expect(spread, `${bp} treatment is visible`).toBeGreaterThan(1);
          // A bounded indent: at most a fifth of the widest line, never edge to edge.
          expect(spread, `${bp} displacement is bounded`).toBeLessThan(
            title.lineGeometry.maxWidth * 0.2,
          );
        }
      },
      180_000,
    );
  }

  inBrowser(
    "an untreated title's lines share one edge",
    async () => {
      const m = await measureRaw(tree("block"));
      for (const bp of BREAKPOINTS) {
        expect(titleOf(m[bp]).lineGeometry.edgeSpread, bp).toBeLessThanOrEqual(TOLERANCE_PX);
      }
    },
    180_000,
  );
});

describe("F1: a measure too narrow for its words", () => {
  inBrowser(
    'frozen 51: "The Lodge at Hanson Park" fragmented in a rail, contained and therefore invisible',
    async () => {
      const m = await measureRaw(frozen("51"));

      // The mutation check, as data. On §3.1's criterion as written this page is clean at both
      // widths — which is exactly how a venue set four lines deep in a 62px track reached a
      // reviewer (F1, "Why verification passed all of it").
      for (const bp of BREAKPOINTS) {
        const s = summarise(m[bp], TOLERANCE_PX);
        expect(s.pageOverflow, `${bp} pageOverflow`).toBe(false);
        expect(s.overflowingElements, `${bp} elements`).toBe(0);
        expect(s.textOverflow, `${bp} text overflow`).toBe(0);
      }

      // And on the new one it is not.
      const venue = m.desktop.texts.find((t) => t.kind === "Venue" && t.lineGeometry.count > 2);
      expect(venue, "the fragmented venue is measured").toBeDefined();
      expect(venue!.emphasis, "already at the emphasis floor, so only the box can give").toBe(
        "secondary",
      );
      expect(summarise(m.desktop, TOLERANCE_PX).textOverMetadataLimit).toBeGreaterThan(0);
    },
    180_000,
  );

  inBrowser(
    "frozen 32: a date broken inside its own words at both widths",
    async () => {
      const m = await measureRaw(frozen("32"));
      for (const bp of BREAKPOINTS) {
        const date = m[bp].texts.find((t) => t.kind === "Date" && t.lineGeometry.count > t.words);
        // "Saturday, December 19, 2026" is four words; it renders on six lines at 1280 and nine at
        // 390. Two of those breaks are inside a word — provably, since four words offer three.
        expect(date, `${bp}: the fragmented date is measured`).toBeDefined();
        expect(summarise(m[bp], TOLERANCE_PX).textWordBroken, bp).toBeGreaterThan(0);
      }
    },
    180_000,
  );

  for (const id of ["32", "51"]) {
    inBrowser(
      `frozen ${id} repairs deterministically and comes out clean, with the repair logged`,
      async () => {
        const { composition, designIntent, seed } = frozen(id);
        const pre = spec(composition, designIntent, seed);
        const result = await verifyGeometry({ spec: pre, content: CONTENT });
        expect(result.ok, result.ok ? "" : result.detail).toBe(true);
        if (!result.ok) return;

        // §3.1's ladder did the work — no model was called — and the box that gave is named.
        const structural = result.spec.compilerRepairs.filter(
          (r) => String(r.rule) === "fit.verified.structural",
        );
        expect(structural.length, "a box was relaxed").toBeGreaterThan(0);

        expect(result.spec.verified.clean).toBe(true);
        for (const bp of BREAKPOINTS) {
          const s = result.spec.verified[bp];
          expect(s.textWordBroken, `${bp} word breaks`).toBe(0);
          expect(s.textOverMetadataLimit, `${bp} metadata lines`).toBe(0);
          expect(s.textEdgeIncoherent, `${bp} edges`).toBe(0);
        }

        // The tree is untouched: the fit lives in the override map (§6).
        expect(result.spec.compositionHash).toBe(pre.compositionHash);
        expect(JSON.stringify(result.spec.composition)).toBe(JSON.stringify(pre.composition));
      },
      600_000,
    );
  }

  inBrowser(
    "leaves a legitimately long venue alone — length is not fragmentation",
    async () => {
      const wordy: EventContent = {
        ...CONTENT,
        venue:
          "The Lodge at Hanson Park on the far side of the north meadow, past the equestrian centre",
      };
      const m = await measureRaw(tree("block"), wordy);
      for (const bp of BREAKPOINTS) {
        expect(summarise(m[bp], TOLERANCE_PX).textOverMetadataLimit, bp).toBe(0);
      }
    },
    180_000,
  );
});

describe("F1: an expressive composition stays expressive", () => {
  inBrowser(
    "a pronounced, monumental, cascaded page verifies clean and keeps its asymmetry",
    async () => {
      const result = await verifyGeometry({ spec: spec(tree("cascade")), content: CONTENT });
      expect(result.ok, result.ok ? "" : result.detail).toBe(true);
      if (!result.ok) return;
      expect(result.spec.verified.clean).toBe(true);

      // Nothing flattened the treatment on the way through: the title is still displaced.
      const m = await measureRaw(tree("cascade"));
      for (const bp of BREAKPOINTS) {
        expect(titleOf(m[bp]).lineGeometry.edgeSpread, bp).toBeGreaterThan(1);
      }
    },
    600_000,
  );
});
