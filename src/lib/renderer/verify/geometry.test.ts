/**
 * Geometry verification — the parts only a real browser can answer.
 *
 * Everything provable without Chromium is in `verify.test.ts` and always runs. What is left here is
 * what the reference could only get from a rendered document: whether the production renderer's own
 * pages actually fit at 390 and 1280, whether the sub-pixel tolerance means what `verify.ts` says it
 * means, whether the fonts load, and whether a second run measures the same page the same way.
 *
 * # Skipping is loud
 *
 * Chromium is not launchable everywhere this suite runs. Where it is not, these cases are *skipped*
 * — reported by the runner as skipped, with the launch failure printed — and never quietly passed.
 * Set `REQUIRE_GEOMETRY_BROWSER=1` to turn an unavailable runtime into a failure instead, which is
 * what a CI job that is supposed to have one should do.
 */

import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";

import type { EventContent } from "@/components/event-renderer/contract";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import { NO_OVERRIDES } from "@/lib/renderer/compile/verification";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import type { ArtworkAsset } from "@/components/event-renderer/artwork";
import { ALL_STUB_ARTWORK, NEAR_BLACK, NEAR_WHITE } from "../../../../tests/fixtures/artwork-stubs";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { chromiumAvailability, withGeometryPage } from "./browser";
import { buildMeasurableDocument } from "./html";
import { VIEWPORTS, type PageMeasurement } from "./measure";
import { TOLERANCE_PX, verifyGeometry } from "./verify";

const require_ = createRequire(import.meta.url);
const TIMEOUT = 180_000;

const availability = await chromiumAvailability();
const required = process.env.REQUIRE_GEOMETRY_BROWSER === "1";

if (!availability.available) {
  const message = `[geometry] headless Chromium is unavailable in this environment: ${availability.reason}`;
  if (required) throw new Error(`${message} — REQUIRE_GEOMETRY_BROWSER=1 was set`);
  console.warn(`${message}\n[geometry] browser-backed cases will be SKIPPED, not passed.`);
}

/** `it` where Chromium runs, `it.skip` where it does not — never a silent pass. */
const browserIt = availability.available ? it : it.skip;

/** Printed at the end of the run so the report can quote real numbers rather than "it passed". */
const observations: string[] = [];
afterAll(() => {
  if (observations.length === 0) return;
  console.info(`\n[geometry] observed:\n  ${observations.join("\n  ")}`);
});

/* ------------------------------------------------------------------------------- fixtures */

const CONTENT: EventContent = {
  eyebrow: "The celebration",
  title: "Marissa and Eren are getting married",
  hosts: "Marissa & Eren",
  description: "An afternoon of good food and warm company, out at the lodge by the water.",
  date: "Saturday, June 14, 2026",
  dayNumeral: "14",
  monthShort: "Jun",
  year: "2026",
  weekday: "Saturday",
  time: "1:00-5:00 PM",
  venue: "Hanson Park",
  location: "Berkeley, CA",
  deadline: "RSVP by December 1",
  initial: "M",
};

/** The same page with content long enough that the authored emphasis cannot hold. */
const LONG_CONTENT: EventContent = {
  ...CONTENT,
  title: "Marissa Aleksandrova and Erenhardt Kristoffersen are finally getting married",
  description:
    "An unhurried afternoon of good food, long toasts and warm company, out at the old lodge " +
    "by the water, with dancing afterwards for anyone still standing when the sun goes down.",
  venue: "The Old Hanson Lodge and Boathouse",
  location: "Point Richmond, Contra Costa County, California",
};

const CAPABILITIES: Capabilities = {
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

function intent(overrides: Partial<DesignIntent> = {}): DesignIntent {
  return {
    family: "editorial",
    tonalDirection: "light",
    palette: { colors: ["#AB12EF", "#12FE34", "#5678BC"], dominant: "#AB12EF" },
    typographyPairing: "heritage_caslon_karla",
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: "editorial",
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "decorative",
    },
    motifs: ["plaid", "stripe"],
    ...overrides,
  };
}

function buildSpec(tree: CompositionTree = novelTree(), designIntent = intent(), seed = 7) {
  return assemblePreVerificationSpec({
    composition: tree,
    designIntent,
    capabilities: CAPABILITIES,
    seed,
  });
}

function libraryPage(id: string): CompositionTree {
  const pages = require_("../../../../tests/fixtures/renderer-golden/library-pages.json") as Record<
    string,
    { canonical: CompositionTree }
  >;
  return pages[id].canonical;
}

/** A document with nothing in it but the two boxes under test, on the real `.ev-site` root. */
function probeDocument(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
.ev-site{width:200px}
.ev-site,.ev-site *{box-sizing:border-box;min-width:0}
.box{width:100px;overflow:visible}
</style></head><body><div class="ev-site">${inner}</div></body></html>`;
}

/* ---------------------------------------------------------------------- what the browser says */

describe("the geometry runtime", () => {
  it("reports whether it is available, and never passes a browser case silently", () => {
    expect(typeof availability.available).toBe("boolean");
    if (!availability.available) expect(required).toBe(false);
  });

  browserIt(
    "launches the Phase 0 runtime and closes it again",
    async () => {
      const version = await withGeometryPage(async (page) => page.version);
      expect(version).toMatch(/^\d+\./);
      observations.push(`chromium ${version}`);
    },
    TIMEOUT,
  );
});

/* -------------------------------------------------------------------------------- tolerance */

describe("the sub-pixel tolerance", () => {
  const measureProbe = (html: string, tolerancePx: number): Promise<PageMeasurement> =>
    withGeometryPage((page) =>
      page.measure(html, {
        mode: "desktop",
        viewport: VIEWPORTS.desktop,
        tolerancePx,
        requiredFamilies: [],
        overflowLimit: 12,
      }),
    );

  browserIt(
    "catches a two-pixel escape at 1px and absorbs a half-pixel one",
    async () => {
      const real = probeDocument(
        '<div class="box" data-id="outer"><div style="width:102px;height:10px" data-id="inner"></div></div>',
      );
      const subpixel = probeDocument(
        '<div class="box" data-id="outer"><div style="width:100.5px;height:10px" data-id="inner"></div></div>',
      );

      const caught = await measureProbe(real, TOLERANCE_PX);
      expect(caught.overflowingTotal).toBeGreaterThan(0);
      expect(caught.overflowing.map((o) => o.id)).toContain("inner");

      const absorbed = await measureProbe(subpixel, TOLERANCE_PX);
      expect(absorbed.overflowingTotal).toBe(0);

      // And the epsilon is genuinely what decides it: widen it and the real overflow disappears,
      // which is exactly the weakening `spec.md §32` #24 forbids and why 1px is not negotiable.
      const hidden = await measureProbe(real, 8);
      expect(hidden.overflowingTotal).toBe(0);

      observations.push(
        `tolerance ${TOLERANCE_PX}px: 2px escape caught, 0.5px absorbed, 8px would hide it`,
      );
    },
    TIMEOUT,
  );

  browserIt(
    "excludes rotated text and clipped decorations, and counts the exclusions",
    async () => {
      const html = probeDocument(
        '<div class="ev-overlay-decoration"><div data-id="deco" data-t="text" style="width:900px">wide</div></div>' +
          '<div style="writing-mode:vertical-rl"><div data-id="rot" data-t="text">sideways</div></div>' +
          '<div data-id="plain" data-t="text">ordinary</div>',
      );
      const m = await measureProbe(html, TOLERANCE_PX);
      expect(m.excludedTexts).toBe(2);
      expect(m.texts.map((t) => t.id)).toEqual(["plain"]);
    },
    TIMEOUT,
  );

  browserIt(
    "reports a family with no face as missing, despite document.fonts.check saying otherwise",
    async () => {
      const m = await withGeometryPage((page) =>
        page.measure(probeDocument("<div>x</div>"), {
          mode: "desktop",
          viewport: VIEWPORTS.desktop,
          tolerancePx: TOLERANCE_PX,
          requiredFamilies: ["No Such Family"],
          overflowLimit: 12,
        }),
      );
      expect(m.fonts.missing).toEqual(["No Such Family"]);
      expect(m.fonts.loaded).toEqual([]);
      // The vacuous-true trap: `check()` says yes for a family with no matching face at all, which
      // is why `missing` is derived from face status instead.
      expect(m.fonts.checked).toEqual(["No Such Family"]);
    },
    TIMEOUT,
  );
});

/* ------------------------------------------------------------------------- real pages, real fit */

describe("real pages verify against rendered geometry", () => {
  browserIt(
    "the novel tree comes clean at 390 and 1280, with its fonts loaded",
    async () => {
      const spec = buildSpec();
      const result = await verifyGeometry({ spec, content: CONTENT });
      if (!result.ok) throw new Error(`expected clean, got ${result.kind}: ${result.detail}`);

      const { verified } = result.spec;
      expect(verified.clean).toBe(true);
      expect(verified.authoritative).toBe("rendered-geometry");
      expect(verified.tolerancePx).toBe(TOLERANCE_PX);
      expect(verified.fonts.loaded).toEqual(["Libre Caslon Text", "Karla"]);
      expect(verified.fonts.required).toEqual(verified.fonts.loaded);

      for (const bp of ["desktop", "mobile"] as const) {
        const s = verified[bp];
        expect(s.pageOverflow).toBe(false);
        expect(s.overflowingElements).toBe(0);
        expect(s.textOverflow).toBe(0);
        expect(s.measuredTexts).toBeGreaterThan(5);
        expect(s.documentWidth).toBeLessThanOrEqual(s.clientWidth + TOLERANCE_PX);
      }
      observations.push(
        `novel tree: clean in ${verified.demotionRounds}+${verified.relaxationRounds} rounds, ` +
          `${verified.fitDemotions} demotions; hero ${verified.desktop.heroHeight}px @1280, ` +
          `${verified.mobile.heroHeight}px @390; texts ${verified.desktop.measuredTexts} ` +
          `(${verified.desktop.excludedTexts} excluded)`,
      );
    },
    TIMEOUT,
  );

  browserIt(
    "a library page comes clean at 390 and 1280",
    async () => {
      const spec = buildSpec(libraryPage("01"));
      const result = await verifyGeometry({ spec, content: CONTENT });
      if (!result.ok) throw new Error(`expected clean, got ${result.kind}: ${result.detail}`);
      expect(result.spec.verified.clean).toBe(true);
      expect(result.spec.verified.desktop.overflowingElements).toBe(0);
      expect(result.spec.verified.mobile.overflowingElements).toBe(0);
      observations.push(
        `A.1 page 01: clean in ${result.spec.verified.demotionRounds}+` +
          `${result.spec.verified.relaxationRounds} rounds, ` +
          `${result.spec.verified.fitDemotions} demotions, ` +
          `${result.spec.verified.fitRelaxations} relaxations`,
      );
    },
    TIMEOUT,
  );

  browserIt(
    "content that will not hold at its authored emphasis is demoted until it fits",
    async () => {
      // `monumental` puts the display step at 152px on desktop; the long title cannot hold three
      // lines there, so §3.1's demotion is what has to make the page fit.
      const spec = buildSpec(
        novelTree(),
        intent({
          typographyPairing: "hc_bodoni_inter",
          composition: { ...intent().composition, hierarchy: "monumental" },
        }),
      );
      const result = await verifyGeometry({ spec, content: LONG_CONTENT });
      if (!result.ok) throw new Error(`expected clean, got ${result.kind}: ${result.detail}`);

      const { verified, overrides, compilerRepairs } = result.spec;
      expect(verified.clean).toBe(true);
      expect(verified.fitDemotions).toBeGreaterThan(0);
      expect(verified.demotionRounds).toBeGreaterThan(0);
      expect(verified.demotionRounds).toBeLessThanOrEqual(3);
      expect(Object.keys(overrides.emphasis).length).toBeGreaterThan(0);

      const fitRepairs = compilerRepairs.filter((r) => r.kind === "fit-verified");
      expect(fitRepairs.length).toBe(verified.fitDemotions + verified.fitRelaxations);
      // Every repair names the node it touched and what it moved it from and to (`§3`).
      for (const repair of fitRepairs) {
        expect(repair.rule).toMatch(/^fit\.verified(\.structural)?$/);
        expect(repair.path).toBeTruthy();
        expect(repair.before).toBeTruthy();
        expect(repair.after).toBeTruthy();
      }

      observations.push(
        `monumental + long content: ${verified.fitDemotions} demotions over ` +
          `${verified.demotionRounds} rounds, ${verified.fitRelaxations} relaxations over ` +
          `${verified.relaxationRounds}; overrides ${JSON.stringify(overrides.emphasis)}`,
      );
    },
    TIMEOUT,
  );

  browserIt(
    "a real verification leaves the canonical tree and the compositionHash byte-identical",
    async () => {
      const spec = buildSpec();
      const before = JSON.stringify(spec);
      const treeBefore = JSON.stringify(spec.composition);

      const result = await verifyGeometry({ spec, content: LONG_CONTENT });
      if (!result.ok) throw new Error(`expected clean, got ${result.kind}: ${result.detail}`);

      expect(JSON.stringify(spec)).toBe(before);
      expect(JSON.stringify(result.spec.composition)).toBe(treeBefore);
      expect(result.spec.compositionHash).toBe(spec.compositionHash);
      expect(result.spec.state).toBe("verified");
    },
    TIMEOUT,
  );

  browserIt(
    "measures the same page the same way twice",
    async () => {
      const spec = buildSpec();
      const runs = [];
      for (let i = 0; i < 2; i += 1) {
        const r = await verifyGeometry({ spec, content: CONTENT });
        if (!r.ok) throw new Error(`expected clean, got ${r.kind}: ${r.detail}`);
        runs.push(JSON.stringify(r.spec.verified));
      }
      expect(runs[0]).toBe(runs[1]);
    },
    TIMEOUT,
  );

  browserIt(
    "returns a failure, not a spec, when it is given no rounds to fix a page with",
    async () => {
      const spec = buildSpec(
        novelTree(),
        intent({
          typographyPairing: "hc_bodoni_inter",
          composition: { ...intent().composition, hierarchy: "monumental" },
        }),
      );
      // Whether zero rounds is enough depends on the page, so only assert the shape when the
      // unbounded run needed rounds at all.
      const unbounded = await verifyGeometry({ spec, content: LONG_CONTENT });
      if (!unbounded.ok) throw new Error(`expected clean, got ${unbounded.detail}`);
      if (unbounded.spec.verified.fitDemotions === 0) return;

      const bounded = await verifyGeometry(
        { spec, content: LONG_CONTENT },
        { maxDemotionRounds: 0, maxRelaxationRounds: 0 },
      );
      // A page that needed demotions to fit must not come back clean without them — unless the only
      // thing it violated was a line limit, which the clean predicate deliberately does not gate on.
      if (!bounded.ok) {
        expect(bounded.kind).toBe("unresolved");
        expect(bounded).not.toHaveProperty("spec");
      } else {
        expect(bounded.spec.verified.fitDemotions).toBe(0);
        expect(bounded.spec.verified.desktop.textOverLimit).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );
});

/* ----------------------------------------------------------------------- fonts actually load */

describe("fonts", () => {
  browserIt(
    "loads the pairing's real faces rather than a fallback",
    async () => {
      const spec = buildSpec(
        novelTree(),
        intent({ typographyPairing: "grotesk_space_sourcesans" }),
      );
      const { html, families } = buildMeasurableDocument({
        spec,
        content: CONTENT,
        overrides: NO_OVERRIDES,
      });
      expect(families).toEqual(["Space Grotesk", "Source Sans 3"]);

      const m = await withGeometryPage((page) =>
        page.measure(html, {
          mode: "desktop",
          viewport: VIEWPORTS.desktop,
          tolerancePx: TOLERANCE_PX,
          requiredFamilies: families,
          overflowLimit: 12,
        }),
      );
      expect(m.fonts.missing).toEqual([]);
      expect(m.fonts.loaded).toEqual(families);
      expect(m.fonts.faces.filter((f) => f.status === "loaded").length).toBeGreaterThan(0);
      observations.push(
        `fonts: ${families.join(" + ")} loaded (${m.fonts.faces.length} faces in the document)`,
      );
    },
    TIMEOUT,
  );
});

/* --------------------------------------------------------------------------------- artwork */

/**
 * The Phase 4E invariant that everything else rests on.
 *
 * A `ResolvedDesignSpec` is compiled, measured at 390 and 1280, and frozen *before* any artwork
 * exists; an asset attaches to a reserved slot afterwards, or never (`spec.md §7.6a #1`). That is
 * only sound if the two pages a spec can produce — with the asset and without it — measure the
 * same. Otherwise verification covered one of them and the other ships unverified.
 *
 * The compiler and the stylesheet are written to make that true: `.ev-art` fixes the frame and
 * `object-fit: cover` crops the image into it. These cases hold them to it in a real browser,
 * against deliberately awkward stub assets, rather than taking the CSS at its word.
 */
describe("artwork cannot move a page that was verified without it", () => {
  const ART_TREE: CompositionTree = {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "base",
        root: {
          t: "Overlay",
          content: {
            t: "Stack",
            children: [{ t: "Eyebrow" }, { t: "EventTitle" }, { t: "Hosts" }],
          },
          decoration: { t: "Artwork", role: "atmosphere" },
          anchor: "center",
          extent: "full",
          mobile: "stack",
        },
      },
      {
        kind: "details",
        surface: "alt",
        root: {
          t: "Stack",
          children: [
            { t: "Artwork", role: "anchor", extent: "half" },
            { t: "Date", form: "full" },
            { t: "Venue" },
            { t: "Location" },
          ],
        },
      },
      {
        kind: "band",
        surface: "contrast",
        root: { t: "Artwork", role: "framed", extent: "third" },
      },
    ],
  } as CompositionTree;

  const slots = (spec: ReturnType<typeof buildSpec>) => Object.keys(spec.artwork);

  const measureAt = (
    mode: "desktop" | "mobile",
    artworkAssets: Record<string, ArtworkAsset> | undefined,
  ) => {
    const spec = buildSpec(ART_TREE, intent(), 7);
    const { html, families } = buildMeasurableDocument({
      spec,
      content: CONTENT,
      overrides: NO_OVERRIDES,
      ...(artworkAssets ? { artworkAssets } : {}),
    });
    return withGeometryPage((page) =>
      page.measure(html, {
        mode,
        viewport: VIEWPORTS[mode],
        tolerancePx: TOLERANCE_PX,
        requiredFamilies: families,
        overflowLimit: 12,
      }),
    );
  };

  /** Every reserved slot filled with the same stub, so the comparison is asset-for-no-asset. */
  const fillAll = (asset: ArtworkAsset) =>
    Object.fromEntries(slots(buildSpec(ART_TREE, intent(), 7)).map((id) => [id, asset]));

  browserIt(
    "reserves real boxes for artwork and still comes clean at 390 and 1280 with no asset at all",
    async () => {
      const spec = buildSpec(ART_TREE, intent(), 7);
      // Three slots, and the tree is legal: this is not a page that quietly lost its artwork.
      expect(slots(spec)).toHaveLength(3);
      expect(Object.values(spec.artwork).filter((a) => a.render)).not.toHaveLength(0);

      for (const mode of ["mobile", "desktop"] as const) {
        const m = await measureAt(mode, undefined);
        expect(m.overflowingTotal).toBe(0);
        observations.push(`artwork, no asset @${VIEWPORTS[mode].width}: 0 overflow`);
      }
    },
    TIMEOUT,
  );

  browserIt(
    "measures identically with an asset and without one, at both breakpoints",
    async () => {
      for (const mode of ["mobile", "desktop"] as const) {
        const empty = await measureAt(mode, undefined);
        for (const asset of ALL_STUB_ARTWORK) {
          const filled = await measureAt(mode, fillAll(asset));
          // The whole claim, in one assertion: an asset cannot change the page's height, and it
          // cannot introduce an overflow. A wide asset, a tall one and a transparent one all agree.
          expect(filled.documentHeight).toBeCloseTo(empty.documentHeight, 1);
          expect(filled.overflowingTotal).toBe(0);
        }
        observations.push(
          `artwork @${VIEWPORTS[mode].width}: ${ALL_STUB_ARTWORK.length} stub shapes, ` +
            `document height unchanged at ${empty.documentHeight.toFixed(1)}px`,
        );
      }
    },
    TIMEOUT,
  );

  browserIt(
    "keeps the page clean when the asset is the darkest or lightest thing a provider could return",
    async () => {
      // §7.6a #5 at its extremes. The scrim was chosen against exactly these two, so neither may
      // produce an overflow or a different page.
      for (const mode of ["mobile", "desktop"] as const) {
        for (const asset of [NEAR_BLACK, NEAR_WHITE]) {
          const m = await measureAt(mode, fillAll(asset));
          expect(m.overflowingTotal).toBe(0);
        }
      }
      observations.push("artwork: black and white extremes render clean at both breakpoints");
    },
    TIMEOUT,
  );
});
