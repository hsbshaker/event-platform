/**
 * The Phase 4E path, proved end to end without spending a cent.
 *
 * The authorization that produced this work says: implement enough that the *next* authorized task
 * can run one real artwork smoke, and prove it with stub assets only. So this file walks a concept
 * from a `DesignIntent` through the artwork decision, the composition language, the compiler, the
 * art brief and the production renderer — four roles, with assets and without — and never calls a
 * provider.
 *
 * What it is not. These stubs are flat single-colour PNGs. **No image of one is evidence about
 * image quality**, no image model has been selected (`docs/technology-decisions.md §8`) and none
 * has been called. The question 4E exists to answer — whether art-directed imagery raises the
 * design ceiling — is untouched by anything here.
 *
 * Two of the ten demonstrations live elsewhere because they need a runtime this file does not
 * have, and neither is duplicated here:
 *
 * - **rendered geometry at 390 and 1280**, with and without assets, across five stub shapes:
 *   `src/lib/renderer/verify/geometry.test.ts`, "artwork cannot move a page that was verified
 *   without it" — a real headless Chromium.
 * - **persistence and lineage**: `tests/db/phase4e-artwork.test.ts`, against a disposable local
 *   Postgres.
 *
 * And the existing regression gates — `proof-b/test.js`, `proof-b/adv-run.js` and the full unit
 * suite — are what prove image-free trees are undisturbed.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { EventPage } from "@/components/event-renderer/page";
import type { EventContent } from "@/components/event-renderer/contract";
import { NO_ARTWORK, type ArtworkAssets } from "@/components/event-renderer/artwork";
import { FULLY_CONFIGURED } from "@/components/event-renderer/feature-presentation";
import { assembleVisualArtIntent } from "@/lib/ai/visual-art/assemble";
import { FORBIDDEN_INTENT_FIELDS } from "@/lib/ai/visual-art/contract";
import { decideArtwork } from "@/lib/renderer/compile/artwork-decision";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import { NO_OVERRIDES } from "@/lib/renderer/compile/verification";
import { repair } from "@/lib/renderer/composition/repair";
import { validateStructure } from "@/lib/renderer/composition/validate-structure";
import type { Capabilities, CNode, CompositionTree } from "@/lib/renderer/composition/nodes";
import type { ArtworkRole } from "@/lib/renderer/composition/tokens";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { PREMISE_FIXTURE_IDENTITY } from "../fixtures/concept-premise";
import { OPAQUE_WIDE, TRANSPARENT_SQUARE } from "../fixtures/artwork-stubs";

const require_ = createRequire(import.meta.url);
const { renderToStaticMarkup } = require_("react-dom/server") as {
  renderToStaticMarkup: (node: unknown) => string;
};

const CONTENT: EventContent = {
  eyebrow: "Please join us",
  title: "A morning for Wren",
  hosts: "Priya and Sam",
  description: "Coffee, cake, and an hour in the garden before it gets too warm.",
  date: "Saturday, May 9, 2026",
  dayNumeral: "9",
  monthShort: "May",
  year: "2026",
  weekday: "Saturday",
  time: "10:00 AM",
  venue: "The Long Room",
  location: "Hudson, NY",
  deadline: "RSVP by April 25",
  initial: "W",
};

const CAPS = (artwork: boolean): Capabilities => ({
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
  artwork,
});

const DIRECTION = (ornament: "none" | "restrained" | "decorative"): DesignIntent => ({
  family: "invitation",
  tonalDirection: "light",
  palette: { colors: ["#1A1A1A", "#F5F0E6", "#7A3B2E"], dominant: "#F5F0E6" },
  typographyPairing: "heritage_caslon_karla",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament,
  },
  motifs: ["botanical"],
});

const WANTS_ARTWORK = DIRECTION("decorative");
const TYPOGRAPHY_LED = DIRECTION("none");

/** A page whose hero carries one artwork leaf in the given role. */
function pageWith(role: ArtworkRole, inOverlay = false): CompositionTree {
  const art = { t: "Artwork", role } as CNode;
  const root = inOverlay
    ? ({
        t: "Overlay",
        content: { t: "Stack", children: [{ t: "EventTitle" }, { t: "Hosts" }] },
        decoration: art,
        anchor: "bottom-start",
        extent: "full",
        mobile: "stack",
      } as CNode)
    : ({ t: "Stack", children: [{ t: "EventTitle" }, art, { t: "Hosts" }] } as CNode);
  return {
    version: "composition_v1",
    sections: [
      { kind: "hero", surface: "base", root },
      {
        kind: "details",
        surface: "alt",
        root: { t: "Stack", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
      },
      {
        kind: "rsvp",
        surface: "base",
        root: {
          t: "Stack",
          children: [{ t: "SectionHeading", for: "rsvp" }, { t: "RSVP" }],
        },
      },
      {
        kind: "registry",
        surface: "alt",
        root: {
          t: "Stack",
          children: [
            { t: "SectionHeading", for: "registry" },
            { t: "Registry", layout: { t: "Grid", cols: 2, children: [] } },
          ],
        },
      },
    ],
  } as CompositionTree;
}

const IMAGE_FREE: CompositionTree = {
  version: "composition_v1",
  sections: [
    {
      kind: "hero",
      surface: "base",
      root: { t: "Stack", children: [{ t: "EventTitle" }, { t: "Hosts" }] },
    },
    {
      kind: "details",
      surface: "alt",
      root: { t: "Stack", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
    },
    {
      kind: "rsvp",
      surface: "base",
      root: { t: "Stack", children: [{ t: "SectionHeading", for: "rsvp" }, { t: "RSVP" }] },
    },
    {
      kind: "registry",
      surface: "alt",
      root: {
        t: "Stack",
        children: [
          { t: "SectionHeading", for: "registry" },
          { t: "Registry", layout: { t: "Grid", cols: 2, children: [] } },
        ],
      },
    },
  ],
} as CompositionTree;

function compile(tree: CompositionTree, intent: DesignIntent) {
  const decision = decideArtwork(intent);
  return assemblePreVerificationSpec({
    composition: tree,
    designIntent: intent,
    capabilities: CAPS(decision.allowed),
    seed: 7,
    artworkDecision: decision,
  });
}

function render(spec: ReturnType<typeof compile>, artworkAssets: ArtworkAssets = NO_ARTWORK) {
  return renderToStaticMarkup(
    EventPage({
      spec,
      content: CONTENT,
      audience: "guest",
      overrides: NO_OVERRIDES,
      presentation: FULLY_CONFIGURED,
      artworkAssets,
    }) as unknown,
  );
}

/** Fill every reserved slot of a spec with one stub. */
const fill = (spec: ReturnType<typeof compile>, asset: typeof OPAQUE_WIDE): ArtworkAssets =>
  Object.fromEntries(Object.keys(spec.artwork).map((id) => [id, asset]));

describe("1. an image-free concept is untouched by any of this", () => {
  it("compiles with no artwork entries and renders no artwork markup", () => {
    const spec = compile(IMAGE_FREE, WANTS_ARTWORK);
    expect(spec.artwork).toEqual({});
    const html = render(spec);
    expect(html).not.toContain("ev-art");
    expect(html).toContain("A morning for Wren");
  });

  it("is what a typography-led direction gets even if a tree tried to carry artwork", () => {
    // The gate is upstream of the model, so a declined direction is never offered the primitive;
    // and if a node reaches the language anyway, the validator strips it.
    const decision = decideArtwork(TYPOGRAPHY_LED);
    expect(decision.allowed).toBe(false);
    const violations = validateStructure(pageWith("anchor"), CAPS(false));
    expect(violations.some((v) => v.rule === "capability.node")).toBe(true);
  });
});

describe("2-4. each artwork role compiles and renders, with an asset and without", () => {
  const cases: [ArtworkRole, boolean, typeof OPAQUE_WIDE][] = [
    ["anchor", false, OPAQUE_WIDE],
    ["object", false, TRANSPARENT_SQUARE],
    ["atmosphere", true, OPAQUE_WIDE],
    ["framed", false, OPAQUE_WIDE],
  ];

  for (const [role, inOverlay, asset] of cases) {
    it(`${role}: reserves a box, briefs it, and paints it when an asset exists`, () => {
      const tree = pageWith(role, inOverlay);
      expect(validateStructure(tree, CAPS(true))).toEqual([]);

      const spec = compile(tree, WANTS_ARTWORK);
      const slots = Object.values(spec.artwork);
      expect(slots).toHaveLength(1);
      expect(slots[0].render).toBe(true);
      expect(slots[0].role).toBe(role);

      // The brief is assembled from the resolved placement, and says what this role needs.
      const brief = assembleVisualArtIntent({
        slot: slots[0],
        identity: PREMISE_FIXTURE_IDENTITY,
        palette: spec.tokens.palette,
      });
      expect(brief.role).toBe(role);
      if (role === "object") expect(brief.background).toBe("transparent");
      if (role === "atmosphere") expect(brief.negativeSpace).toBe("bottom");

      const empty = render(spec);
      expect(empty).toContain(`ev-art-${role}`);
      expect(empty).not.toContain("<img");

      const painted = render(spec, fill(spec, asset));
      expect(painted).toContain("ev-art-img");
      expect(painted).toContain(asset.src);
    });
  }

  it("puts a scrim between artwork and text, and only there", () => {
    const over = compile(pageWith("atmosphere", true), WANTS_ARTWORK);
    expect(Object.values(over.artwork)[0].scrim).not.toBeNull();
    expect(render(over, fill(over, OPAQUE_WIDE))).toContain("ev-art-scrim");

    const beside = compile(pageWith("framed"), WANTS_ARTWORK);
    expect(Object.values(beside.artwork)[0].scrim).toBeNull();
    expect(render(beside, fill(beside, OPAQUE_WIDE))).not.toContain("ev-art-scrim");
  });
});

describe("5. a missing or failed asset is an ordinary page, not a broken one", () => {
  const spec = compile(pageWith("anchor"), WANTS_ARTWORK);

  it("renders the reserved box and nothing inside it", () => {
    const html = render(spec);
    expect(html).toContain("ev-art");
    expect(html).not.toContain("<img");
  });

  it("shows no placeholder, no spinner, no broken-image and no failure reason", () => {
    // Scoped to the artwork element. `ev-placeholder` elsewhere is the RSVP/Registry shell, which
    // is a different feature with its own rules.
    const html = render(spec);
    const art = html.slice(html.indexOf('<div class="ev-art'));
    const element = art.slice(0, art.indexOf("</div>") + 6).toLowerCase();
    expect(element).toContain("ev-art");
    for (const tell of ["placeholder", "spinner", "loading", "failed", "unavailable", "error"]) {
      expect(element).not.toContain(tell);
    }
    // An empty slot is a finished appearance, so it contributes nothing accessible either.
    expect(element).toContain('aria-hidden="true"');
  });

  it("is the same page whichever way the asset failed to arrive", () => {
    // Not requested, outstanding, refused, failed — the renderer is handed the same empty map for
    // all four, because the absence reason is telemetry and never guest-visible.
    expect(render(spec, {})).toBe(render(spec, NO_ARTWORK));
  });

  it("still renders every piece of the event's own content", () => {
    const html = render(spec);
    for (const text of [CONTENT.title, CONTENT.hosts, CONTENT.venue]) {
      expect(html).toContain(text);
    }
  });
});

describe("10. artwork cannot get in around the trusted primitive and compiler system", () => {
  it("carries no url, coordinate or size in the tree — the leaf is a role and an extent", () => {
    const spec = compile(pageWith("anchor"), WANTS_ARTWORK);
    const leaf = JSON.stringify(spec.composition).match(/\{"t":"Artwork"[^}]*\}/)?.[0] ?? "";
    expect(leaf).not.toBe("");
    // `extent` is absent because the model did not author one — the compiler supplies the role's
    // default. What matters is that nothing beyond these four can appear.
    for (const key of Object.keys(JSON.parse(leaf))) {
      expect(["t", "role", "extent", "id"]).toContain(key);
    }
    for (const banned of ["src", "url", "href", "width", "height", "x", "y", "css"]) {
      expect(leaf).not.toContain(`"${banned}"`);
    }
  });

  it("carries no placement field into the art brief either", () => {
    const spec = compile(pageWith("anchor"), WANTS_ARTWORK);
    const brief = assembleVisualArtIntent({
      slot: Object.values(spec.artwork)[0],
      identity: PREMISE_FIXTURE_IDENTITY,
      palette: spec.tokens.palette,
    });
    for (const forbidden of FORBIDDEN_INTENT_FIELDS) {
      expect(Object.keys(brief)).not.toContain(forbidden);
    }
  });

  it("strips an Artwork node from a concept that was never offered artwork, and logs it", () => {
    const repaired = repair(pageWith("anchor"), CAPS(false), 7);
    expect(repaired.remaining).toEqual([]);
    expect(repaired.repairs.some((r) => r.kind === "capability")).toBe(true);
    expect(JSON.stringify(repaired.tree)).not.toContain('"Artwork"');
  });

  it("refuses to draw one that reaches the compiler anyway, rather than trusting it", () => {
    // Defence in depth: the validator should have caught it. If it did not, the page is still
    // the page the direction asked for.
    const spec = assemblePreVerificationSpec({
      composition: pageWith("anchor"),
      designIntent: TYPOGRAPHY_LED,
      capabilities: CAPS(false),
      seed: 7,
    });
    const slot = Object.values(spec.artwork)[0];
    expect(slot.render).toBe(false);
    expect(slot.suppressedBy).toBe("artwork-disabled");
    expect(spec.intentDeviations.some((d) => d.rule === "artwork.disabled")).toBe(true);
    expect(render(spec, fill(spec, OPAQUE_WIDE))).not.toContain("<img");
  });

  it("honours the direction's budget, keeping the surplus as evidence rather than deleting it", () => {
    const restrained = DIRECTION("restrained");
    expect(decideArtwork(restrained).maxArtwork).toBe(1);
    const two: CompositionTree = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [{ t: "EventTitle" }, { t: "Artwork", role: "anchor" }],
          },
        },
        {
          kind: "details",
          surface: "alt",
          root: {
            t: "Stack",
            children: [
              { t: "Artwork", role: "framed" },
              { t: "Date", form: "full" },
            ],
          },
        },
        {
          kind: "rsvp",
          surface: "base",
          root: { t: "Stack", children: [{ t: "SectionHeading", for: "rsvp" }, { t: "RSVP" }] },
        },
        {
          kind: "registry",
          surface: "alt",
          root: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "registry" },
              { t: "Registry", layout: { t: "Grid", cols: 2, children: [] } },
            ],
          },
        },
      ],
    } as CompositionTree;
    const spec = compile(two, restrained);
    const slots = Object.values(spec.artwork);
    expect(slots.map((s) => s.render)).toEqual([true, false]);
    expect(spec.intentDeviations.some((d) => d.rule === "artwork.budget")).toBe(true);
  });
});
