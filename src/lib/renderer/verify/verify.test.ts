/**
 * Geometry verification — everything provable without a browser.
 *
 * Chromium is not launchable in every environment this suite runs in, so the split is deliberate:
 * this file covers the whole algorithm — round ordering, demotion selection, relaxation choice, the
 * clean predicate, the two outcome shapes, the immutability invariant, override application and
 * document assembly — against a stand-in page, and always runs. `geometry.test.ts` covers the
 * things only a real browser can answer, and skips loudly where it cannot.
 *
 * The stand-in page is not a stand-in *renderer*: it is handed the real document `html.ts` builds
 * from the real `EventPage`, and reads emphasis back out of that markup. So a test here still fails
 * if the override wiring in the renderer breaks.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventPage } from "@/components/event-renderer/page";
import type { EventContent } from "@/components/event-renderer/contract";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import {
  NO_OVERRIDES,
  withDemotion,
  withRelaxation,
  type VerificationOverrides,
} from "@/lib/renderer/compile/verification";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition/nodes";
import { SCALES } from "@/lib/renderer/composition/layout";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "@/lib/renderer/vocabulary";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import type { GeometryPage } from "./browser";
import { buildMeasurableDocument, inlineFontFaces, requiredFamilies } from "./html";
import type { Breakpoint, MeasureOptions, PageMeasurement } from "./measure";
import type { BreakpointSummaries, BreakpointSummary } from "./result";
import {
  MAX_DEMOTION_ROUNDS,
  MAX_RELAXATION_ROUNDS,
  TOLERANCE_PX,
  applyDemotions,
  applyRelaxations,
  demotionViolations,
  indexTree,
  innermostRelaxation,
  isClean,
  orderIds,
  runFitLoop,
  summarise,
} from "./verify";

/* ------------------------------------------------------------------------------- fixtures */

const CONTENT: EventContent = {
  eyebrow: "The celebration",
  title: "Marissa and Eren are getting married this coming summer",
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

/* --------------------------------------------------------------------------- the stand-in page */

interface RenderedText {
  readonly id: string | null;
  readonly emphasis: string | null;
}

const TAG_RE = /<[a-z0-9]+\b[^>]*\bdata-t="text"[^>]*>/g;

/** Read every measured text leaf back out of the real markup, with the emphasis it rendered at. */
function renderedTexts(html: string): RenderedText[] {
  const out: RenderedText[] = [];
  for (const tag of html.match(TAG_RE) ?? []) {
    const cls = /class="([^"]*)"/.exec(tag)?.[1] ?? "";
    out.push({
      id: /data-id="([^"]*)"/.exec(tag)?.[1] ?? null,
      emphasis: /(?:^|\s)ev-em-([a-z]+)(?:\s|$)/.exec(cls)?.[1] ?? null,
    });
  }
  return out;
}

interface Simulation {
  /** Lines reported for a text at this emphasis. */
  lines(emphasis: string | null): number;
  /** Whether a text at this emphasis is reported as overflowing its container. */
  overflow(emphasis: string | null): boolean;
  /** Elements reported as overflowing, regardless of emphasis. */
  overflowingIds?(html: string): string[];
  missingFonts?: readonly string[];
}

function fakePage(
  simulation: Simulation,
  seen: MeasureOptions[] = [],
): GeometryPage & {
  readonly calls: MeasureOptions[];
  readonly documents: string[];
} {
  const documents: string[] = [];
  return {
    version: "stand-in",
    calls: seen,
    documents,
    async measure(html: string, options: MeasureOptions): Promise<PageMeasurement> {
      seen.push(options);
      documents.push(html);
      const texts = renderedTexts(html).map((t) => {
        const lines = simulation.lines(t.emphasis);
        const overflow = simulation.overflow(t.emphasis);
        const box = { left: 0, right: overflow ? 500 : 100, width: 100, height: 10 };
        return {
          id: t.id,
          emphasis: t.emphasis,
          kind: null,
          layout: null,
          // Enough words for `lines` never to imply a break inside one, and line boxes that agree
          // on their edge: this stand-in simulates the *old* defects, not the typographic ones.
          words: Math.max(lines, 1) + 1,
          segments: Math.max(lines, 1) + 1,
          lines,
          fontPx: 16,
          lineHeightPx: 16,
          box,
          containerBox: { left: 0, right: 400, width: 400, height: 10 },
          lineGeometry: { count: lines, maxWidth: 100, minWidth: 80, edgeSpread: 0 },
          overflow,
        };
      });
      const overflowing = (simulation.overflowingIds?.(html) ?? []).map((id) => ({
        id,
        className: "ev-stack",
        reason: "element" as const,
        box: { left: 0, right: 500, width: 500, height: 10 },
        containerBox: { left: 0, right: 400, width: 400, height: 10 },
      }));
      const required = options.requiredFamilies;
      const missing = required.filter((f) => (simulation.missingFonts ?? []).includes(f));
      return {
        mode: options.mode,
        viewport: options.viewport,
        documentWidth: options.viewport.width,
        clientWidth: options.viewport.width,
        documentHeight: 2000,
        pageOverflow: false,
        heroHeight: 600,
        fonts: {
          required,
          loaded: required.filter((f) => !missing.includes(f)),
          missing,
          faces: [],
          checked: required,
        },
        texts,
        overflowing,
        overflowingTotal: overflowing.length,
        excludedTexts: 0,
      };
    },
  };
}

/** Display starts too tall, primary is still too tall at desktop, secondary fits. */
const SHRINKS: Simulation = {
  lines: (e) => (e === "display" ? 5 : e === "primary" ? 4 : 1),
  overflow: () => false,
};

/** Nothing the fit can do reaches this page. */
const HOPELESS: Simulation = {
  lines: () => 1,
  overflow: () => true,
  overflowingIds: () => ["s0"],
};

/* -------------------------------------------------------------------------------- ordering */

describe("canonical id order", () => {
  it("orders affected ids by their position in the canonical tree, not by string", () => {
    // Eleven siblings, so document order (`s0.0 … s0.10`) and string order ("s0.10" before
    // "s0.2") genuinely disagree. Without that the assertion below would pass vacuously.
    const wide = buildSpec({
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            gap: "normal",
            children: Array.from({ length: 11 }, () => ({ t: "Hosts" })),
          },
        },
      ],
    } as unknown as CompositionTree);
    const index = indexTree(wide.composition);
    const ids = [...index.keys()];
    expect(ids).toContain("s0.10");
    expect([...ids].sort()).not.toEqual(ids);

    expect(orderIds([...ids].reverse(), index)).toEqual(ids);
    expect(orderIds(["s0.10", "s0.2"], index)).toEqual(["s0.2", "s0.10"]);
  });

  it("de-duplicates and puts ids the tree does not know last", () => {
    const spec = buildSpec();
    const index = indexTree(spec.composition);
    const [first, second] = [...index.keys()];
    expect(orderIds([second, "not-a-node", first, second], index)).toEqual([
      first,
      second,
      "not-a-node",
    ]);
  });

  it("maps a section id to the section's root node, not to the section", () => {
    const spec = buildSpec();
    const index = indexTree(spec.composition);
    expect(index.get("s0")?.node.t).toBe(spec.composition.sections[0].root.t);
  });
});

/* ------------------------------------------------------------------------ demotion selection */

function measurementWith(
  mode: Breakpoint,
  texts: {
    id: string;
    emphasis: string;
    lines: number;
    overflow?: boolean;
    kind?: string;
    layout?: string;
    words?: number;
    segments?: number;
    lineBoxes?: number;
    edgeSpread?: number;
  }[],
): PageMeasurement {
  return {
    mode,
    viewport: { width: mode === "mobile" ? 390 : 1280, height: 800 },
    documentWidth: 1280,
    clientWidth: 1280,
    documentHeight: 2000,
    pageOverflow: false,
    heroHeight: 500,
    fonts: { required: [], loaded: [], missing: [], faces: [], checked: [] },
    texts: texts.map((t) => {
      const lineBoxes = t.lineBoxes ?? t.lines;
      return {
        id: t.id,
        emphasis: t.emphasis,
        kind: t.kind ?? null,
        layout: t.layout ?? null,
        // Defaults that assert nothing: enough words to hold the lines whole, and one shared edge.
        words: t.words ?? lineBoxes + 1,
        segments: t.segments ?? t.words ?? lineBoxes + 1,
        lines: t.lines,
        fontPx: 16,
        lineHeightPx: 16,
        box: { left: 0, right: t.overflow ? 500 : 100, width: 100, height: 10 },
        containerBox: { left: 0, right: 400, width: 400, height: 10 },
        lineGeometry: {
          count: lineBoxes,
          maxWidth: 100,
          minWidth: 80,
          edgeSpread: t.edgeSpread ?? 0,
        },
        overflow: !!t.overflow,
      };
    }),
    overflowing: [],
    overflowingTotal: 0,
    excludedTexts: 0,
  };
}

describe("demotion selection", () => {
  const spec = buildSpec();
  const index = indexTree(spec.composition);
  const ids = [...index.keys()];

  it("flags a node over its line limit, per breakpoint", () => {
    // Four lines at display: over the desktop limit of 3, exactly at the mobile limit of 4.
    const measurements = {
      desktop: measurementWith("desktop", [{ id: ids[3], emphasis: "display", lines: 4 }]),
      mobile: measurementWith("mobile", [{ id: ids[3], emphasis: "display", lines: 4 }]),
    };
    const violations = demotionViolations(measurements, index);
    expect(violations).toHaveLength(1);
    expect(violations[0].evidence).toContain("desktop: 4 lines at display (limit 3)");
    expect(violations[0].evidence).not.toContain("mobile");
  });

  it("flags an overflowing display or primary node, and not a demoted one", () => {
    const overflowing = (emphasis: string) => ({
      desktop: measurementWith("desktop", [{ id: ids[3], emphasis, lines: 1, overflow: true }]),
      mobile: measurementWith("mobile", [{ id: ids[3], emphasis, lines: 1, overflow: true }]),
    });
    expect(demotionViolations(overflowing("display"), index)).toHaveLength(1);
    expect(demotionViolations(overflowing("primary"), index)).toHaveLength(1);
    // `secondary` has nowhere to go that is not a legibility regression; the structural pass owns it.
    expect(demotionViolations(overflowing("secondary"), index)).toHaveLength(0);
    expect(demotionViolations(overflowing("caption"), index)).toHaveLength(0);
  });

  it("ignores ids the tree does not contain", () => {
    const measurements = {
      desktop: measurementWith("desktop", [{ id: "ghost", emphasis: "display", lines: 9 }]),
      mobile: measurementWith("mobile", [{ id: "ghost", emphasis: "display", lines: 9 }]),
    };
    expect(demotionViolations(measurements, index)).toHaveLength(0);
  });

  it("returns violations in canonical id order", () => {
    const [a, b, c] = [ids[8], ids[4], ids[2]];
    const texts = [a, b, c].map((id) => ({ id, emphasis: "display", lines: 9 }));
    const measurements = {
      desktop: measurementWith("desktop", texts),
      mobile: measurementWith("mobile", texts),
    };
    expect(demotionViolations(measurements, index).map((v) => v.id)).toEqual(
      orderIds([a, b, c], index),
    );
  });
});

describe("applying demotions", () => {
  const spec = buildSpec();
  const index = indexTree(spec.composition);

  /** The first node in the tree that actually carries an emphasis we can demote. */
  const demotable = [...index.entries()].find(([, entry]) => {
    const e = (entry.node as { emphasis?: string }).emphasis;
    return e === "display" || e === "primary";
  })!;

  it("moves one step, never two, and logs a fit-verified repair", () => {
    const before = (demotable[1].node as { emphasis?: string }).emphasis;
    const applied = applyDemotions(
      [{ id: demotable[0], evidence: "desktop: 5 lines" }],
      index,
      NO_OVERRIDES,
    );
    expect(applied.overrides.emphasis[demotable[0]]).toBe(
      before === "display" ? "primary" : "secondary",
    );
    expect(applied.repairs).toHaveLength(1);
    expect(applied.repairs[0]).toMatchObject({ rule: "fit.verified", kind: "fit-verified" });
    expect(applied.repairs[0].path).toContain(demotable[0]);
  });

  it("reads the current emphasis from the override map, so rounds compose", () => {
    const first = applyDemotions(
      [{ id: demotable[0], evidence: "r1" }],
      index,
      NO_OVERRIDES,
    ).overrides;
    const second = applyDemotions([{ id: demotable[0], evidence: "r2" }], index, first).overrides;
    expect(first.emphasis[demotable[0]]).not.toBe(second.emphasis[demotable[0]]);
  });

  it("stops at secondary and reports no progress", () => {
    const floored = withDemotion(NO_OVERRIDES, demotable[0], "secondary");
    const applied = applyDemotions([{ id: demotable[0], evidence: "r3" }], index, floored);
    expect(applied.repairs).toHaveLength(0);
    expect(applied.overrides).toBe(floored);
  });

  it("never mutates the override map it was given, nor the tree", () => {
    const treeBefore = JSON.stringify(spec.composition);
    const applied = applyDemotions([{ id: demotable[0], evidence: "e" }], index, NO_OVERRIDES);
    expect(NO_OVERRIDES.emphasis).toEqual({});
    expect(applied.overrides).not.toBe(NO_OVERRIDES);
    expect(JSON.stringify(spec.composition)).toBe(treeBefore);
  });
});

/* --------------------------------------------------------------------- relaxation selection */

describe("structural relaxation", () => {
  const tree: CompositionTree = {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "base",
        root: {
          t: "Rail",
          side: "start",
          width: "thin",
          mobile: "top",
          rail: { t: "Date", form: "numeral" },
          child: {
            t: "Frame",
            rule: "hairline",
            inset: "deep",
            child: {
              t: "Surface",
              role: "alt",
              inset: "deep",
              child: { t: "Stack", gap: "normal", children: [{ t: "EventTitle" }] },
            },
          },
        },
      },
    ],
  } as unknown as CompositionTree;

  const spec = buildSpec(tree);
  const index = indexTree(spec.composition);
  const titleId = [...index.entries()].find(([, e]) => e.node.t === "EventTitle")![0];
  const surfaceId = [...index.entries()].find(([, e]) => e.node.t === "Surface")![0];
  const frameId = [...index.entries()].find(([, e]) => e.node.t === "Frame")![0];
  const railId = [...index.entries()].find(([, e]) => e.node.t === "Rail")![0];

  it("picks the innermost box around the node and works outward as each is spent", () => {
    let overrides: VerificationOverrides = NO_OVERRIDES;
    const picked: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const choice = innermostRelaxation(titleId, index, overrides);
      if (!choice) break;
      picked.push(`${choice.nodeId}:${choice.relaxation}`);
      overrides = withRelaxation(overrides, choice.nodeId, choice.relaxation);
    }
    expect(picked).toEqual([
      `${surfaceId}:surface-inset-tight`,
      `${frameId}:frame-as-stack`,
      `${railId}:rail-widen`,
    ]);
  });

  it("starts at the node itself when the node is one of the three boxes", () => {
    const choice = innermostRelaxation(frameId, index, NO_OVERRIDES);
    expect(choice).toEqual({
      nodeId: frameId,
      relaxation: "frame-as-stack",
      forNodeId: frameId,
    });
  });

  it("steps over a box with nothing left to give", () => {
    // The same shape, but the Surface is already at `tight` and the Rail already at `wide`, so
    // neither has a step left and the Frame is the only box that can still relieve the title.
    const spent = buildSpec({
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Rail",
            side: "start",
            width: "wide",
            mobile: "top",
            rail: { t: "Date", form: "numeral" },
            child: {
              t: "Frame",
              rule: "hairline",
              inset: "deep",
              child: {
                t: "Surface",
                role: "alt",
                inset: "tight",
                child: { t: "Stack", gap: "normal", children: [{ t: "EventTitle" }] },
              },
            },
          },
        },
      ],
    } as unknown as CompositionTree);
    const spentIndex = indexTree(spent.composition);
    const id = [...spentIndex.entries()].find(([, e]) => e.node.t === "EventTitle")![0];
    const frame = [...spentIndex.entries()].find(([, e]) => e.node.t === "Frame")![0];
    expect(innermostRelaxation(id, spentIndex, NO_OVERRIDES)).toEqual({
      nodeId: frame,
      relaxation: "frame-as-stack",
      forNodeId: id,
    });
    // And once the Frame is spent too, there is nothing left at all — which is what makes the
    // relaxation loop terminate rather than spin.
    expect(
      innermostRelaxation(id, spentIndex, withRelaxation(NO_OVERRIDES, frame, "frame-as-stack")),
    ).toBeNull();
  });

  it("logs a fit.verified.structural repair and leaves the tree alone", () => {
    const treeBefore = JSON.stringify(spec.composition);
    const measurements = {
      desktop: measurementWith("desktop", [
        { id: titleId, emphasis: "secondary", lines: 1, overflow: true },
      ]),
      mobile: measurementWith("mobile", []),
    };
    const applied = applyRelaxations(measurements, index, NO_OVERRIDES);
    expect(applied.repairs).toHaveLength(1);
    expect(applied.repairs[0]).toMatchObject({
      rule: "fit.verified.structural",
      kind: "fit-verified",
    });
    expect(applied.overrides.structural[surfaceId]).toBe("surface-inset-tight");
    expect(JSON.stringify(spec.composition)).toBe(treeBefore);
  });
});

/* ------------------------------------------------------------------------- the clean predicate */

describe("the clean predicate", () => {
  const ok: BreakpointSummary = {
    viewport: { width: 1280, height: 800 },
    documentWidth: 1280,
    clientWidth: 1280,
    documentHeight: 2000,
    pageOverflow: false,
    overflowingElements: 0,
    textOverflow: 0,
    textOverLimit: 0,
    textWordBroken: 0,
    textOverMetadataLimit: 0,
    textEdgeIncoherent: 0,
    measuredTexts: 12,
    excludedTexts: 1,
    heroHeight: 600,
  };
  const both = (patch: Partial<BreakpointSummary> = {}): BreakpointSummaries => ({
    desktop: { ...ok, ...patch },
    mobile: { ...ok, ...patch },
  });

  it("passes only with zero page, element and text overflow at both widths", () => {
    expect(isClean(both())).toBe(true);
    expect(isClean(both({ pageOverflow: true }))).toBe(false);
    expect(isClean(both({ overflowingElements: 1 }))).toBe(false);
    expect(isClean(both({ textOverflow: 1 }))).toBe(false);
  });

  it("also fails on the three composition defects, each on its own", () => {
    // F1: all three render inside their boxes, so every overflow clause above passes them.
    expect(isClean(both({ textWordBroken: 1 }))).toBe(false);
    expect(isClean(both({ textOverMetadataLimit: 1 }))).toBe(false);
    expect(isClean(both({ textEdgeIncoherent: 1 }))).toBe(false);
  });

  it("fails when only one breakpoint is dirty", () => {
    expect(isClean({ desktop: ok, mobile: { ...ok, pageOverflow: true } })).toBe(false);
    expect(isClean({ desktop: { ...ok, textOverflow: 2 }, mobile: ok })).toBe(false);
  });

  it("does not treat a remaining line-limit excess as unclean", () => {
    // A limit drives demotion; it is not itself a rendering defect, and below `primary` there is
    // no limit left to exceed.
    expect(isClean(both({ textOverLimit: 3 }))).toBe(true);
  });

  it("counts over-limit and overflowing texts separately in the summary", () => {
    const m = measurementWith("desktop", [
      { id: "a", emphasis: "display", lines: 5 },
      { id: "b", emphasis: "secondary", lines: 9, overflow: true },
    ]);
    const s = summarise(m, TOLERANCE_PX);
    expect(s.textOverLimit).toBe(1);
    expect(s.textOverflow).toBe(1);
    expect(s.measuredTexts).toBe(2);
  });

  it("counts each composition defect, and counts nothing for well-set text", () => {
    const clean = summarise(
      measurementWith("desktop", [
        { id: "a", emphasis: "secondary", kind: "Venue", lines: 2, words: 5, lineBoxes: 2 },
      ]),
      TOLERANCE_PX,
    );
    expect([clean.textWordBroken, clean.textOverMetadataLimit, clean.textEdgeIncoherent]).toEqual([
      0, 0, 0,
    ]);

    const defective = summarise(
      measurementWith("desktop", [
        // Four words on six lines: two breaks landed inside a word.
        { id: "a", emphasis: "secondary", kind: "Date", lines: 6, words: 4, lineBoxes: 6 },
        // Within its words, but a three-line venue at desktop is past the budget of two.
        { id: "b", emphasis: "secondary", kind: "Venue", lines: 3, words: 5, lineBoxes: 3 },
        // Lines that do not share an edge, with no treatment asking them to.
        { id: "c", emphasis: "secondary", lines: 2, words: 6, lineBoxes: 2, edgeSpread: 40 },
      ]),
      TOLERANCE_PX,
    );
    expect(defective.textWordBroken).toBe(1);
    expect(defective.textOverMetadataLimit).toBe(2);
    expect(defective.textEdgeIncoherent).toBe(1);
  });

  it("exempts a staggered title's displaced lines, and prose from the metadata budget", () => {
    const s = summarise(
      measurementWith("desktop", [
        {
          id: "a",
          emphasis: "display",
          kind: "EventTitle",
          layout: "stagger",
          lines: 3,
          words: 6,
          lineBoxes: 3,
          edgeSpread: 60,
        },
        { id: "b", emphasis: "secondary", kind: "Description", lines: 6, words: 40, lineBoxes: 6 },
      ]),
      TOLERANCE_PX,
    );
    expect(s.textEdgeIncoherent).toBe(0);
    expect(s.textOverMetadataLimit).toBe(0);
  });
});

/* --------------------------------------------------------------------- document and fonts */

describe("the measurable document", () => {
  const spec = buildSpec();

  it("is the real EventPage under the real stylesheet", () => {
    const { html } = buildMeasurableDocument({
      spec,
      content: CONTENT,
      overrides: NO_OVERRIDES,
    });
    const direct = renderToStaticMarkup(
      createElement(EventPage, {
        spec,
        content: CONTENT,
        audience: "guest" as const,
        overrides: NO_OVERRIDES,
      }),
    );
    expect(html).toContain(direct);
    expect(html).toContain(".ev-site {");
    expect(html).toMatch(/^<!doctype html>/);
  });

  it("renders as a guest, so no collaborator markup is measured", () => {
    const { html } = buildMeasurableDocument({ spec, content: CONTENT, overrides: NO_OVERRIDES });
    // The stylesheet legitimately declares `.ev-collaborator-slot`; the body must not contain one.
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toContain("ev-collaborator-slot");
    expect(body).not.toContain("data-collaborator-section");
  });

  it("inlines the pairing's faces as data URIs and drops every other family", () => {
    const { html, families } = buildMeasurableDocument({
      spec,
      content: CONTENT,
      overrides: NO_OVERRIDES,
    });
    expect(families).toEqual(["Libre Caslon Text", "Karla"]);
    expect(html).toContain('font-family: "Libre Caslon Text"');
    expect(html).toContain('font-family: "Karla"');
    expect(html).toContain("url(data:font/woff2;base64,");
    // No face is left pointing at a relative URL: `setContent` gives the document no origin to
    // resolve one against. (The section-0 comment mentions the path in prose; that is not a src.)
    expect(html).not.toMatch(/url\(\s*["']?\/fonts\/event\//);
    expect(html).not.toContain('font-family: "Bodoni Moda"');
  });

  it("names both families of every pairing, so no concept can reach the browser unfaced", () => {
    // Guards the 20-family @font-face block against a pairing being added without its faces.
    const css = buildMeasurableDocument({
      spec,
      content: CONTENT,
      overrides: NO_OVERRIDES,
    }).html;
    expect(css).toBeTruthy();
    for (const pairing of [
      "hc_bodoni_inter",
      "oldstyle_cormorant_figtree",
      "soft_dmserif_dmsans",
      "grotesk_space_sourcesans",
      "transitional_instrument_manrope",
    ] as const) {
      const s = buildSpec(novelTree(), intent({ typographyPairing: pairing }));
      expect(() =>
        buildMeasurableDocument({ spec: s, content: CONTENT, overrides: NO_OVERRIDES }),
      ).not.toThrow();
      expect(requiredFamilies(s)).toHaveLength(2);
    }
  });

  it("emits every family as a quoted CSS string, including one that ends in a digit", () => {
    // `Source Sans 3` unquoted is `Source Sans` followed by a <number>, which is not a valid
    // identifier sequence: the whole `font-family` declaration becomes invalid at computed-value
    // time and takes the stylesheet's fallback stack with it, leaving the UA default. Rendered
    // geometry caught it as an unloaded face (`geometry.test.ts`); this catches it without a
    // browser, for every pairing in the catalog.
    for (const pairing of TYPOGRAPHY_KEYS) {
      const s = buildSpec(novelTree(), intent({ typographyPairing: pairing }));
      const { html } = buildMeasurableDocument({
        spec: s,
        content: CONTENT,
        overrides: NO_OVERRIDES,
      });
      const { display, body } = s.tokens.typography;
      // React escapes the quote to `&#x27;` in the attribute; the HTML parser decodes it before
      // the CSS parser sees it.
      expect(html).toContain(`--ev-font-display:&#x27;${display}&#x27;`);
      expect(html).toContain(`--ev-font-body:&#x27;${body}&#x27;`);
    }
    // The family the bug was found on is really in the catalog, so the loop is not vacuous.
    expect(TYPOGRAPHY_KEYS.flatMap((k) => [TYPOGRAPHY[k].display, TYPOGRAPHY[k].body])).toContain(
      "Source Sans 3",
    );
  });

  it("fails loudly rather than measuring fallback typography", () => {
    expect(() => inlineFontFaces("/* no faces here */", ["Karla"], "/tmp")).toThrow(
      /declares no @font-face for Karla/,
    );
    expect(() =>
      inlineFontFaces(
        '@font-face { font-family: "Karla"; src: url("/fonts/event/Nope-normal-400.woff2"); }',
        ["Karla"],
        "/nonexistent-font-dir",
      ),
    ).toThrow(/is missing from/);
  });
});

/* ---------------------------------------------------------------- overrides reach the renderer */

describe("overrides reach the renderer", () => {
  const tree: CompositionTree = {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "base",
        root: {
          t: "Rail",
          side: "start",
          width: "thin",
          mobile: "top",
          rail: { t: "Eyebrow" },
          child: {
            t: "Frame",
            rule: "strong",
            inset: "deep",
            child: {
              t: "Surface",
              role: "alt",
              inset: "deep",
              child: { t: "Stack", gap: "normal", children: [{ t: "EventTitle" }] },
            },
          },
        },
      },
    ],
  } as unknown as CompositionTree;

  const spec = buildSpec(tree);
  const index = indexTree(spec.composition);
  const idOf = (t: string) => [...index.entries()].find(([, e]) => e.node.t === t)![0];

  const render = (overrides: VerificationOverrides) =>
    renderToStaticMarkup(
      createElement(EventPage, {
        spec,
        content: CONTENT,
        audience: "guest" as const,
        overrides,
      }),
    );

  it("defaults to no overrides, so existing callers render the authored tree", () => {
    const withNone = render(NO_OVERRIDES);
    const withDefault = renderToStaticMarkup(
      createElement(EventPage, { spec, content: CONTENT, audience: "guest" as const }),
    );
    expect(withDefault).toBe(withNone);
    expect(withNone).toContain("ev-em-display");
  });

  it("renders a demoted text at the override's emphasis", () => {
    const html = render(withDemotion(NO_OVERRIDES, idOf("EventTitle"), "secondary"));
    expect(html).toContain("ev-t-EventTitle ev-em-secondary");
    expect(html).not.toContain("ev-em-display");
    // The tree is untouched: the node still says what the model authored.
    expect((index.get(idOf("EventTitle"))!.node as { emphasis?: string }).emphasis).toBe("display");
  });

  it("frame-as-stack drops the rule and the inset, and the node stays a Frame", () => {
    const html = render(withRelaxation(NO_OVERRIDES, idOf("Frame"), "frame-as-stack"));
    expect(html).toContain("ev-frame-box ev-rule-none");
    expect(html).toContain("--ev-inset:0px");
    expect(html).toContain(`class="ev-frame" data-id="${idOf("Frame")}"`);
    expect(render(NO_OVERRIDES)).toContain("ev-frame-box ev-rule-strong");
  });

  it("surface-inset-tight renders at the tight inset", () => {
    const html = render(withRelaxation(NO_OVERRIDES, idOf("Surface"), "surface-inset-tight"));
    expect(html).toContain(`--ev-inset:${SCALES.insetPx.tight}px`);
    expect(render(NO_OVERRIDES)).toContain(`--ev-inset:${SCALES.insetPx.deep}px`);
  });

  it("rail-widen moves one step along the approved widths", () => {
    const html = render(withRelaxation(NO_OVERRIDES, idOf("Rail"), "rail-widen"));
    expect(html).toContain("ev-w-medium");
    expect(html).toContain(`--ev-rail-w:${SCALES.railPx.medium}px`);
    expect(render(NO_OVERRIDES)).toContain("ev-w-thin");
  });
});

/* ------------------------------------------------------------------------------- the fit loop */

describe("the fit loop", () => {
  it("demotes an over-tall page until it comes clean, and returns a verified spec", async () => {
    const spec = buildSpec();
    const page = fakePage(SHRINKS);
    const result = await runFitLoop(page, { spec, content: CONTENT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.verified.clean).toBe(true);
    expect(result.spec.verified.authoritative).toBe("rendered-geometry");
    expect(result.spec.state).toBe("verified");
    expect(result.spec.verified.fitDemotions).toBeGreaterThan(0);
    // display → primary → secondary is two rounds, and the loop stops as soon as it is clean.
    expect(result.spec.verified.demotionRounds).toBe(2);
    expect(result.spec.verified.relaxationRounds).toBe(0);
    expect(result.spec.compilerRepairs.filter((r) => r.rule === "fit.verified").length).toBe(
      result.spec.verified.fitDemotions,
    );
    // The pre-verification repairs are kept, and the fit ones are appended after them.
    expect(result.spec.compilerRepairs.slice(0, spec.compilerRepairs.length)).toEqual(
      spec.compilerRepairs,
    );
    expect(Object.values(result.spec.overrides.emphasis)).not.toContain("display");
  });

  it("records both breakpoints' geometry", async () => {
    const result = await runFitLoop(fakePage(SHRINKS), { spec: buildSpec(), content: CONTENT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.verified.desktop.viewport).toEqual({ width: 1280, height: 800 });
    expect(result.spec.verified.mobile.viewport).toEqual({ width: 390, height: 844 });
    expect(result.spec.verified.tolerancePx).toBe(TOLERANCE_PX);
  });

  it("leaves the canonical tree and the compositionHash byte-identical", async () => {
    const spec = buildSpec();
    const treeBefore = JSON.stringify(spec.composition);
    const specBefore = JSON.stringify(spec);
    const hashBefore = spec.compositionHash;

    const result = await runFitLoop(fakePage(SHRINKS), { spec, content: CONTENT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The input is untouched...
    expect(JSON.stringify(spec)).toBe(specBefore);
    expect(JSON.stringify(spec.composition)).toBe(treeBefore);
    // ...and the output carries the same tree and the same hash, which is what §6's re-fit
    // contract requires of a revision that only re-fitted content.
    expect(JSON.stringify(result.spec.composition)).toBe(treeBefore);
    expect(result.spec.composition).toBe(spec.composition);
    expect(result.spec.compositionHash).toBe(hashBefore);
  });

  it("threads the tolerance through to the measurement", async () => {
    const calls: MeasureOptions[] = [];
    await runFitLoop(
      fakePage(SHRINKS, calls),
      { spec: buildSpec(), content: CONTENT },
      {
        tolerancePx: 0.25,
      },
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.tolerancePx === 0.25)).toBe(true);
    expect(calls.map((c) => c.mode)).toEqual(
      Array.from({ length: calls.length / 2 }, () => ["desktop", "mobile"]).flat(),
    );
  });

  it("returns a failure, not a spec, when clean is unreachable", async () => {
    const result = await runFitLoop(fakePage(HOPELESS), { spec: buildSpec(), content: CONTENT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unresolved");
    expect(result).not.toHaveProperty("spec");
    expect(result).not.toHaveProperty("composition");
    expect(result).not.toHaveProperty("verified");
    // It stops either at the bound or as soon as no box has anything left to give — both are
    // "no progress is possible", and neither may produce a spec.
    expect(result.relaxationRounds).toBeGreaterThanOrEqual(1);
    expect(result.relaxationRounds).toBeLessThanOrEqual(MAX_RELAXATION_ROUNDS);
    expect(Object.keys(result.overrides.structural).length).toBeGreaterThan(0);
    expect(result.outstanding.length).toBeGreaterThan(0);
    expect(result.detail).toContain("did not come clean");
  });

  it("honours the round bounds", async () => {
    const calls: MeasureOptions[] = [];
    const result = await runFitLoop(
      fakePage(SHRINKS, calls),
      { spec: buildSpec(), content: CONTENT },
      { maxDemotionRounds: 0, maxRelaxationRounds: 0 },
    );
    // No rounds allowed, so nothing was demoted; SHRINKS never overflows, so the page is clean
    // anyway — the point is that exactly one measurement pair was taken.
    expect(calls).toHaveLength(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.verified.fitDemotions).toBe(0);
    expect(MAX_DEMOTION_ROUNDS).toBe(3);
  });

  it("reports a missing font as infrastructure, never as clean", async () => {
    const result = await runFitLoop(fakePage({ ...SHRINKS, missingFonts: ["Karla"] }), {
      spec: buildSpec(),
      content: CONTENT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("infrastructure");
    expect(result.detail).toContain("Karla");
    expect(result.detail).toContain("fallback typography");
    expect(result).not.toHaveProperty("spec");
  });

  it("reports an unexpected throw as infrastructure rather than swallowing it", async () => {
    const exploding: GeometryPage = {
      version: "stand-in",
      measure: async () => {
        throw new TypeError("something in the verifier is wrong");
      },
    };
    const result = await runFitLoop(exploding, { spec: buildSpec(), content: CONTENT });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("infrastructure");
    expect(result.detail).toContain("TypeError: something in the verifier is wrong");
    expect(result.measurements).toBeNull();
  });

  it("passes the re-fit bookkeeping through without deriving it", async () => {
    const result = await runFitLoop(fakePage(SHRINKS), {
      spec: buildSpec(),
      content: CONTENT,
      contentVersion: 4,
      supersedesSpecId: "spec_3",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.contentVersion).toBe(4);
    expect(result.spec.supersedesSpecId).toBe("spec_3");

    const without = await runFitLoop(fakePage(SHRINKS), { spec: buildSpec(), content: CONTENT });
    expect(without.ok).toBe(true);
    if (!without.ok) return;
    expect(without.spec).not.toHaveProperty("contentVersion");
  });

  it("returns a frozen spec", async () => {
    const result = await runFitLoop(fakePage(SHRINKS), { spec: buildSpec(), content: CONTENT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.spec)).toBe(true);
    expect(Object.isFrozen(result.spec.verified)).toBe(true);
    expect(Object.isFrozen(result.spec.overrides.emphasis)).toBe(true);
  });
});
