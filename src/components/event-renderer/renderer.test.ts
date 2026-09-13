/**
 * Renderer tests.
 *
 * No DOM environment is configured (`vitest.config.mts` runs every project on `node`), and this
 * task is not chartered to add one, so these render to static markup with `react-dom/server` and
 * assert over the string. That is enough for everything proven here — the invariants are about
 * what does and does not reach the output — and it keeps the suite in the `unit` project, whose
 * include glob covers `.test.ts` under `src` and no `.tsx` extension at all, so a `.test.tsx` file
 * here would be collected by no project and silently never run.
 */

import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveMotifs } from "@/lib/renderer/compile/motifs";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import { NO_OVERRIDES } from "@/lib/renderer/compile/verification";
import { canonicalize } from "@/lib/renderer/composition/canonicalize";
import { resolveLayout } from "@/lib/renderer/composition/layout";
import type { Capabilities, CNode, CompositionTree } from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { novelTree } from "../../../tests/fixtures/novel-composition";
import {
  PRIMITIVE_KINDS,
  type EventContent,
  type RenderAudience,
  type RenderContext,
} from "./contract";
import { EventPage } from "./page";
import { PRIMITIVES } from "./primitives";

const require_ = createRequire(import.meta.url);

const CONTENT: EventContent = {
  eyebrow: "The celebration",
  title: "Marissa and Eren are getting married",
  hosts: "Marissa & Eren",
  description: "An afternoon of good food and warm company.",
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

/** Raw creative colors chosen to be unmistakable if one ever reached the markup verbatim. */
const RAW_COLORS = ["#AB12EF", "#12FE34", "#5678BC"];

function intent(overrides: Partial<DesignIntent> = {}): DesignIntent {
  return {
    family: "editorial",
    tonalDirection: "light",
    palette: { colors: RAW_COLORS, dominant: RAW_COLORS[0] },
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

function buildSpec(tree: CompositionTree, designIntent: DesignIntent = intent(), seed = 7) {
  return assemblePreVerificationSpec({
    composition: tree,
    designIntent,
    capabilities: CAPABILITIES,
    seed,
  });
}

function renderPage(
  tree: CompositionTree,
  audience: RenderAudience = "guest",
  designIntent: DesignIntent = intent(),
): string {
  const spec = buildSpec(tree, designIntent);
  return renderToStaticMarkup(
    createElement(EventPage, { spec, content: CONTENT, audience, sectionActions: () => null }),
  );
}

/**
 * A context over a real compiled tree, so a primitive under test reads the same resolved layout
 * and motif entries it would on the page.
 */
function contextFor(tree: CompositionTree, designIntent: DesignIntent = intent()) {
  const { tree: canon } = canonicalize(tree);
  const layout = resolveLayout(canon, designIntent.density);
  const { motifs } = resolveMotifs(canon, designIntent, 1);
  const spec = buildSpec(canon, designIntent);
  const ctx: RenderContext = {
    layout,
    motifs,
    pageSystem: spec.pageSystem,
    palette: spec.tokens.palette,
    typography: spec.tokens.typography,
    content: CONTENT,
    audience: "guest",
    overrides: NO_OVERRIDES,
    renderNode: (node) => {
      const Primitive = PRIMITIVES[node.t];
      if (!Primitive) throw new Error(`no component for ${node.t}`);
      return createElement(Primitive, { node, ctx });
    },
  };
  return { ctx, canon };
}

/** Renders `root` as a lone hero section root and returns the markup of that subtree. */
function renderStandalone(root: CNode, designIntent: DesignIntent = intent()): string {
  const tree: CompositionTree = {
    version: "composition_v1",
    sections: [{ kind: "hero", surface: "base", root }],
  };
  const { ctx, canon } = contextFor(tree, designIntent);
  return renderToStaticMarkup(createElement("div", null, ctx.renderNode(canon.sections[0].root)));
}

/* ---------------------------------------------------------------- per-primitive node fixtures */

/**
 * Two nodes per primitive: one relying entirely on canonicalized defaults, one setting every
 * optional prop the language admits. Containers that cannot stand alone are wrapped in the parent
 * the language requires, so the primitive under test is still the one being exercised.
 */
const NODE_FIXTURES: Record<string, { minimal: CNode; maximal: CNode }> = {
  Stack: {
    minimal: { t: "Stack", children: [{ t: "Eyebrow" }] },
    maximal: { t: "Stack", gap: "loose", align: "center", children: [{ t: "Eyebrow" }] },
  },
  Cluster: {
    minimal: { t: "Cluster", children: [{ t: "Venue" }, { t: "Time" }] },
    maximal: {
      t: "Cluster",
      gap: "tight",
      justify: "between",
      children: [{ t: "Venue" }, { t: "Time" }],
    },
  },
  Split: {
    minimal: {
      t: "Split",
      ratio: "50",
      mobile: "stack",
      children: [{ t: "Venue" }, { t: "Time" }],
    },
    maximal: {
      t: "Split",
      ratio: "62",
      align: "center",
      divider: "dashed",
      mobile: "keep",
      children: [{ t: "Venue" }, { t: "Time" }],
    },
  },
  Rail: {
    minimal: {
      t: "Rail",
      side: "start",
      width: "thin",
      mobile: "top",
      rail: { t: "Date", form: "numeral" },
      child: { t: "EventTitle" },
    },
    maximal: {
      t: "Rail",
      side: "end",
      width: "wide",
      mobile: "hide",
      rail: { t: "MotifField", motif: { id: "linen", role: "field" }, extent: "half" },
      child: { t: "EventTitle", emphasis: "display", case: "upper", layout: "stagger" },
    },
  },
  Grid: {
    minimal: {
      t: "Grid",
      columns: 2,
      mobile: 1,
      children: [
        { t: "Cell", child: { t: "Venue" } },
        { t: "Cell", child: { t: "Time" } },
      ],
    },
    maximal: {
      t: "Grid",
      columns: 4,
      ruled: true,
      gap: "loose",
      mobile: 2,
      children: [
        { t: "Cell", span: 2, rowSpan: 2, child: { t: "Venue" } },
        { t: "Cell", span: 1, child: { t: "Time" } },
      ],
    },
  },
  Cell: {
    minimal: {
      t: "Grid",
      columns: 2,
      mobile: 1,
      children: [
        { t: "Cell", child: { t: "Venue" } },
        { t: "Cell", child: { t: "Time" } },
      ],
    },
    maximal: {
      t: "Grid",
      columns: 2,
      mobile: 1,
      children: [
        { t: "Cell", span: 2, rowSpan: 2, child: { t: "Venue" } },
        { t: "Cell", span: 1, rowSpan: 1, child: { t: "Time" } },
      ],
    },
  },
  Frame: {
    minimal: { t: "Frame", rule: "none", inset: "tight", child: { t: "EventTitle" } },
    maximal: {
      t: "Frame",
      rule: "double",
      inset: "deep",
      motif: { id: "plaid", role: "frame" },
      child: { t: "EventTitle" },
    },
  },
  Surface: {
    minimal: { t: "Surface", role: "base", child: { t: "EventTitle" } },
    maximal: { t: "Surface", role: "contrast", inset: "deep", child: { t: "EventTitle" } },
  },
  Overlay: {
    minimal: {
      t: "Overlay",
      content: { t: "EventTitle" },
      decoration: { t: "Monogram", style: "plain" },
      anchor: "center",
      extent: "half",
      mobile: "keep",
    },
    maximal: {
      t: "Overlay",
      content: { t: "Stack", gap: "loose", align: "end", children: [{ t: "EventTitle" }] },
      decoration: { t: "MotifField", motif: { id: "gingham", role: "field" }, extent: "quarter" },
      anchor: "bottom-end",
      extent: "quarter",
      mobile: "stack",
    },
  },
  MotifField: {
    minimal: { t: "MotifField", motif: { id: "linen", role: "field" } },
    maximal: { t: "MotifField", motif: { id: "plaid", role: "field" }, extent: "third" },
  },
  MotifBand: {
    minimal: { t: "MotifBand", height: "thin" },
    maximal: {
      t: "MotifBand",
      motif: { id: "stripe", role: "band" },
      height: "tall",
      fill: "pattern",
    },
  },
  Rule: {
    minimal: { t: "Rule", weight: "hairline" },
    maximal: { t: "Rule", weight: "double", orientation: "v", glyphs: "botanical" },
  },
  Glyph: {
    minimal: { t: "Glyph", motif: "celestial" },
    maximal: { t: "Glyph", motif: "equestrian", scale: "l" },
  },
  Monogram: {
    minimal: { t: "Monogram", style: "plain" },
    maximal: { t: "Monogram", style: "watermark" },
  },
  Eyebrow: {
    minimal: { t: "Eyebrow" },
    maximal: { t: "Eyebrow", emphasis: "caption", case: "upper" },
  },
  EventTitle: {
    minimal: { t: "EventTitle" },
    maximal: { t: "EventTitle", emphasis: "display", case: "upper", layout: "cascade" },
  },
  Hosts: { minimal: { t: "Hosts" }, maximal: { t: "Hosts", emphasis: "primary", case: "upper" } },
  Description: {
    minimal: { t: "Description" },
    maximal: { t: "Description", emphasis: "secondary", case: "none" },
  },
  Deadline: {
    minimal: { t: "Deadline" },
    maximal: { t: "Deadline", emphasis: "caption", case: "upper" },
  },
  Venue: { minimal: { t: "Venue" }, maximal: { t: "Venue", emphasis: "display", case: "upper" } },
  Location: {
    minimal: { t: "Location" },
    maximal: { t: "Location", emphasis: "primary", case: "none" },
  },
  Time: { minimal: { t: "Time" }, maximal: { t: "Time", emphasis: "caption", case: "upper" } },
  Date: {
    minimal: { t: "Date", form: "full" },
    maximal: { t: "Date", form: "numeral", emphasis: "display" },
  },
  CTA: {
    minimal: { t: "CTA", target: "rsvp" },
    maximal: { t: "CTA", target: "registry", style: "link" },
  },
  SectionHeading: {
    minimal: { t: "SectionHeading", for: "details" },
    maximal: { t: "SectionHeading", for: "registry", emphasis: "display" },
  },
  RSVP: { minimal: { t: "RSVP" }, maximal: { t: "RSVP" } },
  Registry: {
    minimal: {
      t: "Registry",
      layout: {
        t: "Grid",
        columns: 2,
        mobile: 1,
        children: [
          { t: "Cell", child: { t: "RegistryItem", kind: "gift" } },
          { t: "Cell", child: { t: "RegistryItem", kind: "external" } },
        ],
      },
    },
    maximal: {
      t: "Registry",
      layout: {
        t: "Stack",
        gap: "tight",
        children: [
          { t: "RegistryItem", kind: "gift", emphasis: "featured" },
          { t: "RegistryItem", kind: "cashfund", emphasis: "standard" },
        ],
      },
    },
  },
  RegistryItem: {
    minimal: { t: "RegistryItem", kind: "gift" },
    maximal: { t: "RegistryItem", kind: "external", emphasis: "featured" },
  },
  CashFund: { minimal: { t: "CashFund" }, maximal: { t: "CashFund" } },
};

/* ------------------------------------------------------------------------------------ tests */

describe("the primitive map", () => {
  it("has exactly the keys of PRIMITIVE_KINDS", () => {
    // Both directions: an extra key would be a renderer branch that is not a primitive, a missing
    // one a primitive the renderer cannot draw (`phase-3-invariant-obligations.md` row 10).
    expect(Object.keys(PRIMITIVES).sort()).toEqual([...PRIMITIVE_KINDS].sort());
  });

  it("covers all 29 primitives", () => {
    expect(PRIMITIVE_KINDS).toHaveLength(29);
  });

  it("has a fixture for every primitive", () => {
    expect(Object.keys(NODE_FIXTURES).sort()).toEqual([...PRIMITIVE_KINDS].sort());
  });
});

describe("every primitive renders", () => {
  for (const kind of PRIMITIVE_KINDS) {
    it(`${kind} renders with defaults and with every optional prop`, () => {
      const { minimal, maximal } = NODE_FIXTURES[kind];
      expect(() => renderStandalone(minimal)).not.toThrow();
      expect(() => renderStandalone(maximal)).not.toThrow();
    });
  }
});

describe("a full page", () => {
  it("renders every section of a real PreVerificationDesignSpec, in order", () => {
    const html = renderPage(novelTree());
    expect(html).toContain("ev-site");
    for (const kind of ["hero", "details", "rsvp", "registry", "band"]) {
      expect(html).toContain(`ev-kind-${kind}`);
    }
    // Section order is the composition's own, not re-sorted by the renderer.
    const order = [...html.matchAll(/ev-kind-([a-z]+)/g)].map((m) => m[1]);
    expect(order).toEqual(["hero", "details", "rsvp", "registry", "band"]);
  });

  it("binds event content rather than inventing it", () => {
    // The fixture's title uses `layout: "cascade"`, which puts each line in its own span, so the
    // comparison is against text content rather than the raw markup.
    const text = renderPage(novelTree())
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    expect(text).toContain(CONTENT.title);
    expect(text).toContain(CONTENT.venue);
    expect(text).toContain(CONTENT.description);
  });
});

describe("audience", () => {
  const COLLABORATOR_MARKERS = ["ev-collaborator-slot", "data-collaborator-section"];

  it("emits collaborator anchors for a collaborator", () => {
    const html = renderPage(novelTree(), "collaborator");
    for (const marker of COLLABORATOR_MARKERS) expect(html).toContain(marker);
    // One per section, in a stable position.
    expect(html.match(/ev-collaborator-slot/g)).toHaveLength(novelTree().sections.length);
  });

  it("emits no collaborator markup at all for a guest", () => {
    const html = renderPage(novelTree(), "guest");
    for (const marker of COLLABORATOR_MARKERS) expect(html).not.toContain(marker);
    // Absent, not merely hidden.
    expect(html).not.toContain('aria-hidden="true" class="ev-collaborator');
    expect(html).not.toMatch(/collaborator/i);
  });
});

describe("motif suppression is binding", () => {
  const ornamentNone = intent({
    composition: { ...intent().composition, ornament: "none" },
  });

  it("draws no pattern the ornament budget suppressed, but keeps it in the spec", () => {
    const spec = buildSpec(novelTree(), ornamentNone);
    const html = renderPage(novelTree(), "guest", ornamentNone);

    const suppressed = Object.entries(spec.motifs).filter(([, m]) => !m.render);
    const drawn = Object.entries(spec.motifs).filter(([, m]) => m.render);
    expect(suppressed.length).toBeGreaterThan(0);

    // The evidence stays: every suppressed motif is still a spec entry with a reason.
    for (const [id, motif] of suppressed) {
      expect(spec.motifs[id]).toBeDefined();
      expect(motif.suppressedBy).toBeTruthy();
    }

    // The pixels do not: exactly as many pattern classes as there are renderable pattern motifs.
    // Matched by motif id, not by the `ev-motif-` prefix, which the two custom properties share.
    const drawnPatterns = drawn.filter(([, m]) => m.kind === "pattern").length;
    expect(html.match(/ev-motif-(?:plaid|stripe|gingham|linen)\b/g) ?? []).toHaveLength(
      drawnPatterns,
    );
  });

  it("draws no arrangement glyphs when the ornament direction admits none", () => {
    const tree: CompositionTree = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: { t: "Stack", children: [{ t: "Glyph", motif: "celestial" }, { t: "EventTitle" }] },
        },
      ],
    };
    expect(renderPage(tree, "guest", ornamentNone)).not.toContain("ev-glyphs");
    expect(renderPage(tree, "guest", intent())).toContain("ev-glyphs");
  });
});

describe("no creative value reaches the markup", () => {
  it("contains no raw DesignIntent palette hex", () => {
    const html = renderPage(novelTree()).toLowerCase();
    for (const hex of RAW_COLORS) expect(html).not.toContain(hex.toLowerCase());
  });

  it("emits only numeric custom properties outside the root token layer", () => {
    const html = renderPage(novelTree());
    const styled = [...html.matchAll(/<[a-z0-9]+([^>]*?)style="([^"]*)"/g)];
    expect(styled.length).toBeGreaterThan(1);

    for (const [, attrs, style] of styled) {
      // Decode before tokenizing. React escapes a quote inside an attribute (`'` → `&#x27;`), and
      // that escape contains a `;` — so splitting the raw attribute text would cut a declaration
      // in half. The browser decodes the attribute before the CSS parser sees it; so does this.
      const declarations = style
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean);

      if (attrs.includes("ev-site")) {
        // The one element carrying the compiled token layer: semantic palette and resolved font
        // family names, both compiler output. Still custom properties, and still never the raw
        // creative palette — the test above proves that separately.
        for (const declaration of declarations) expect(declaration).toMatch(/^--ev-[a-z-]+:/);
        // A family name is quoted, so it is a CSS <string> and stays valid whatever it contains.
        // Unquoted, `Source Sans 3` ends in a <number> and invalidates the whole declaration —
        // and an invalid custom-property substitution takes the fallback stack down with it.
        expect(declarations).toContain("--ev-font-display:'Libre Caslon Text'");
        expect(declarations).toContain("--ev-font-body:'Karla'");
        continue;
      }

      // Everywhere else: a number with a unit this code chose, and nothing that could be CSS text.
      for (const declaration of declarations) {
        expect(declaration).toMatch(/^--ev-[a-z-]+:\s*-?\d+(\.\d+)?(px|em|%)?$/);
      }
    }
  });
});

describe("the renderer is recipe-agnostic", () => {
  /** The legacy fixture library, read only to prove none of its identifiers reaches the output. */
  function libraryIdentifiers(): string[] {
    const globalWithWindow = globalThis as { window?: unknown };
    globalWithWindow.window = globalThis;
    const library = require_("../../../proof-b/library.js") as Record<
      string,
      Record<string, unknown>
    >;
    const shelves = ["HEROES", "DETAILS", "RSVPS", "REGISTRIES", "PLANS"];
    const ids = new Set<string>();
    for (const shelf of shelves) {
      for (const key of Object.keys(library[shelf] ?? {})) {
        ids.add(key);
        // Hero keys are `<silhouette>:<variant>`; the silhouette name alone must not appear either.
        if (key.includes(":")) ids.add(key.split(":")[0]);
      }
    }
    return [...ids];
  }

  it("leaks no recipe, silhouette or template identifier into rendered output", () => {
    const identifiers = libraryIdentifiers();
    expect(identifiers.length).toBeGreaterThan(40);

    const pages = require_("../../../tests/fixtures/renderer-golden/library-pages.json") as Record<
      string,
      { canonical: CompositionTree }
    >;
    const html = Object.values(pages)
      .map((page) => renderPage(page.canonical))
      .join("\n");

    for (const id of identifiers) expect(html).not.toContain(id);
  });
});

describe("the frozen fixtures render", () => {
  it("renders all 16 A.1 pages", () => {
    const pages = require_("../../../tests/fixtures/renderer-golden/library-pages.json") as Record<
      string,
      { canonical: CompositionTree }
    >;
    const ids = Object.keys(pages);
    expect(ids).toHaveLength(16);
    for (const id of ids) {
      expect(() => renderPage(pages[id].canonical), `A.1 page ${id}`).not.toThrow();
    }
  });

  it("renders a sample of the frozen model trees", () => {
    const frozen = require_("../../../tests/fixtures/renderer-golden/frozen-final.json") as Record<
      string,
      { spec?: { composition?: CompositionTree } }
    >;
    const trees = Object.entries(frozen)
      .filter(([, entry]) => entry.spec?.composition)
      .slice(0, 20);
    expect(trees.length).toBeGreaterThan(10);
    for (const [id, entry] of trees) {
      expect(() => renderPage(entry.spec!.composition!), `frozen tree ${id}`).not.toThrow();
    }
  });
});
