/**
 * Guest visibility, which canon specified and nothing implemented until now.
 *
 * `docs/event-renderer-system.md §2.3` says registry becomes visible once it has an external
 * registry, native gift or cash fund, and RSVP once it is configured with at least one party
 * invited. The Phase 4D live smoke rendered neither rule: every section in the tree rendered
 * unconditionally, so two concepts were thousands of pixels of empty skeleton for features with no
 * operational data behind them.
 *
 * Rendered through `renderToStaticMarkup`, which is the same path `verify/html.ts` measures and
 * serves, so what is asserted here is the markup that actually ships rather than a DOM stand-in.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventPage } from "./page";
import { NOTHING_CONFIGURED, type FeaturePresentationState } from "./feature-presentation";
import type { EventContent, RenderAudience } from "./contract";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import { A1_SITES, page } from "@/lib/renderer/library";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition";
import type { DesignIntent } from "@/lib/renderer/design-intent";

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

const CONTENT: EventContent = {
  title: "A baby shower",
  date: "Saturday, December 12, 2026",
  dayNumeral: "12",
  monthShort: "Dec",
  year: "2026",
  weekday: "Saturday",
  time: "1:00 PM",
  venue: "Venue to be announced",
};

function intent(): DesignIntent {
  return {
    family: "editorial",
    tonalDirection: "light",
    palette: {
      colors: ["#F3EDE1", "#6E8B5B", "#3F4A38", "#C06A3E", "#8C9E7E"],
      dominant: "#6E8B5B",
    },
    typographyPairing: "transitional_instrument_manrope",
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: "editorial",
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "restrained",
    },
    motifs: [],
  };
}

/** A library page that genuinely carries both an rsvp and a registry section. */
function treeWithBoth(): CompositionTree {
  const site = A1_SITES[0];
  return page(site.hero, site.details, site.rsvp, site.registry, site.plan, site.align);
}

function markup(
  audience: RenderAudience,
  presentation: FeaturePresentationState = NOTHING_CONFIGURED,
): string {
  const spec = assemblePreVerificationSpec({
    composition: treeWithBoth(),
    designIntent: intent(),
    capabilities: CAPS,
    seed: 1,
  });
  return renderToStaticMarkup(
    createElement(EventPage, { spec, content: CONTENT, audience, presentation }),
  );
}

const CONFIGURED: FeaturePresentationState = {
  sections: { rsvp: "visible", registry: "visible" },
  leaves: NOTHING_CONFIGURED.leaves,
};

describe("a feature with nothing behind it is not shown to a guest", () => {
  it("omits an unconfigured rsvp and registry section entirely", () => {
    const html = markup("guest");
    // Absent, not hidden. An empty shell is what made two of the smoke's pages thousands of
    // pixels long, and a guest has nothing to do with a feature that is not set up.
    expect(html).not.toContain("ev-kind-rsvp");
    expect(html).not.toContain("ev-kind-registry");
  });

  it("still renders the sections that carry real content", () => {
    const html = markup("guest");
    expect(html).toContain("ev-kind-hero");
    expect(html).toContain("A baby shower");
  });

  it("shows a configured feature, so nothing legitimate is hidden", () => {
    const html = markup("guest", CONFIGURED);
    expect(html).toContain("ev-kind-rsvp");
    expect(html).toContain("ev-kind-registry");
  });

  it("gates each section independently", () => {
    const html = markup("guest", {
      sections: { rsvp: "visible", registry: "setup" },
      leaves: NOTHING_CONFIGURED.leaves,
    });
    expect(html).toContain("ev-kind-rsvp");
    expect(html).not.toContain("ev-kind-registry");
  });

  it("removes the placeholder shells, not just the heading", () => {
    const gated = markup("guest");
    const shown = markup("guest", CONFIGURED);
    // The shells are what consumed the height: placeholder rows and empty registry cards.
    expect(shown).toContain("ev-registry-item");
    expect(gated).not.toContain("ev-registry-item");
    expect(gated.length).toBeLessThan(shown.length);
  });
});

describe("a collaborator keeps the section they need in order to set it up", () => {
  it("renders an unconfigured section for a collaborator", () => {
    const html = markup("collaborator");
    // `§2.3`: the collaborator affordance stays anchored. Hiding it from the host would remove the
    // only place the feature can be configured from.
    expect(html).toContain("ev-kind-rsvp");
    expect(html).toContain("ev-kind-registry");
  });
});

describe("visibility changes what is shown, never what was composed", () => {
  it("leaves the composition identical whichever audience renders it", () => {
    const spec = assemblePreVerificationSpec({
      composition: treeWithBoth(),
      designIntent: intent(),
      capabilities: CAPS,
      seed: 1,
    });
    const before = JSON.stringify(spec.composition);
    renderToStaticMarkup(
      createElement(EventPage, { spec, content: CONTENT, audience: "guest" as const }),
    );
    renderToStaticMarkup(
      createElement(EventPage, { spec, content: CONTENT, audience: "collaborator" as const }),
    );
    // `spec.md §32 #16`: guest visibility is a render-time flag, never a recomposition.
    expect(JSON.stringify(spec.composition)).toBe(before);
  });

  it("defaults to nothing configured, which is the truthful answer today", () => {
    const spec = assemblePreVerificationSpec({
      composition: treeWithBoth(),
      designIntent: intent(),
      capabilities: CAPS,
      seed: 1,
    });
    // No registry, gift, guest or RSVP-party table exists yet, so a caller that passes no state
    // must not accidentally get the "configured" rendering.
    const html = renderToStaticMarkup(
      createElement(EventPage, { spec, content: CONTENT, audience: "guest" as const }),
    );
    expect(html).not.toContain("ev-kind-registry");
  });
});
