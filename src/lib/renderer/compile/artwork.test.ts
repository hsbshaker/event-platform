import { describe, expect, it } from "vitest";

import { ARTWORK_SCRIM_STEPS, DEFAULT_ARTWORK_EXTENT, resolveArtwork, scrimFor } from "./artwork";
import { decideArtwork } from "./artwork-decision";
import { compileSemanticPalette } from "./palette";
import { contrastRatio } from "./color";
import type { CNode, CompositionTree, Section } from "../composition/nodes";
import type { ArtworkRole } from "../composition/tokens";
import type { DesignIntent } from "../design-intent";

const INTENT: DesignIntent = {
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
    ornament: "decorative",
  },
  motifs: ["botanical"],
};

const PALETTE = compileSemanticPalette(INTENT).palette;
const ALLOWED = decideArtwork(INTENT);

const artwork = (role: ArtworkRole, extra: Record<string, unknown> = {}): CNode =>
  ({ t: "Artwork", role, ...extra }) as CNode;

function tree(root: CNode, surface: Section["surface"] = "base"): CompositionTree {
  return { version: "composition_v1", sections: [{ kind: "hero", surface, root }] };
}

/** An Overlay whose content is real text, so its decoration slot is genuinely behind text. */
const overlayOverText = (decoration: CNode): CNode =>
  ({
    t: "Overlay",
    content: { t: "Stack", children: [{ t: "EventTitle" }] },
    decoration,
    anchor: "center",
    extent: "full",
    mobile: "stack",
  }) as CNode;

/** An independent blend, written from the rule rather than imported, so the test can disagree. */
function over(surface: string, image: string, alpha: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = (i: number) => Math.round(ch(surface, i) * alpha + ch(image, i) * (1 - alpha));
  return "#" + [0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0").toUpperCase()).join("");
}

/** Whether `ink` clears AA over *every* image at this scrim, i.e. at both extremes. */
const survivesAnyImage = (ink: string, surface: string, alpha: number) =>
  contrastRatio(ink, over(surface, "#000000", alpha)) >= 4.5 &&
  contrastRatio(ink, over(surface, "#FFFFFF", alpha)) >= 4.5;

describe("a scrim is proved against every image that could arrive", () => {
  it("clears AA against an all-black and an all-white asset, not just against the surface", () => {
    const alpha = scrimFor(PALETTE.text, PALETTE.surfaceBase);
    expect(alpha).not.toBeNull();
    expect(survivesAnyImage(PALETTE.text, PALETTE.surfaceBase, alpha!)).toBe(true);
  });

  it("takes the lightest approved step that works, never a stronger one", () => {
    const alpha = scrimFor(PALETTE.text, PALETTE.surfaceBase)!;
    expect(ARTWORK_SCRIM_STEPS).toContain(alpha);
    // Minimality, asserted rather than assumed: every lighter step must genuinely fail.
    for (const step of ARTWORK_SCRIM_STEPS.filter((s) => s < alpha)) {
      expect(survivesAnyImage(PALETTE.text, PALETTE.surfaceBase, step)).toBe(false);
    }
  });

  it("refuses rather than guesses when no step keeps the ink legible", () => {
    // Mid-grey ink on mid-grey ground clears nothing at any alpha, because the scrim converges on
    // the ground and the ground does not contrast with the ink.
    expect(scrimFor("#808080", "#7F7F7F")).toBeNull();
    for (const step of ARTWORK_SCRIM_STEPS) {
      expect(survivesAnyImage("#808080", "#7F7F7F", step)).toBe(false);
    }
  });

  it("is decided from compiler-owned colours only — it never sees an asset", () => {
    expect(scrimFor(PALETTE.text, PALETTE.surfaceBase)).toBe(
      scrimFor(PALETTE.text, PALETTE.surfaceBase),
    );
  });
});

describe("placement is resolved, never measured", () => {
  it("gives each role its default extent when the model did not say", () => {
    for (const role of Object.keys(DEFAULT_ARTWORK_EXTENT) as ArtworkRole[]) {
      const { artwork: resolved } = resolveArtwork(tree(artwork(role)), ALLOWED, PALETTE);
      expect(Object.values(resolved)[0].extent).toBe(DEFAULT_ARTWORK_EXTENT[role]);
    }
  });

  it("keeps an extent the model did author", () => {
    const { artwork: resolved } = resolveArtwork(
      tree(artwork("anchor", { extent: "quarter" })),
      ALLOWED,
      PALETTE,
    );
    expect(Object.values(resolved)[0].extent).toBe("quarter");
  });

  it("keys entries by the canonical node id the rest of the compiler uses", () => {
    const { artwork: resolved } = resolveArtwork(tree(artwork("anchor")), ALLOWED, PALETTE);
    expect(Object.keys(resolved)).toEqual(["sections[0].root"]);
  });
});

describe("a scrim appears exactly where text sits over artwork", () => {
  it("assigns none to artwork that nothing is written over", () => {
    const { artwork: resolved } = resolveArtwork(tree(artwork("framed")), ALLOWED, PALETTE);
    expect(Object.values(resolved)[0].scrim).toBeNull();
  });

  it("assigns one to artwork in an overlay's decoration slot beneath text", () => {
    const { artwork: resolved } = resolveArtwork(
      tree(overlayOverText(artwork("atmosphere"))),
      ALLOWED,
      PALETTE,
    );
    const entry = Object.values(resolved)[0];
    expect(entry.scrim).not.toBeNull();
    expect(ARTWORK_SCRIM_STEPS).toContain(entry.scrim!);
    expect(entry.render).toBe(true);
  });

  it("assigns none when the overlay's content carries no text to protect", () => {
    const overlay = {
      t: "Overlay",
      content: { t: "Stack", children: [{ t: "Rule" }] },
      decoration: artwork("atmosphere"),
      anchor: "center",
      extent: "full",
      mobile: "stack",
    } as CNode;
    expect(
      Object.values(resolveArtwork(tree(overlay), ALLOWED, PALETTE).artwork)[0].scrim,
    ).toBeNull();
  });

  it("reads the ink and ground of the section the artwork is actually in", () => {
    const scrimOn = (surface: Section["surface"]) =>
      Object.values(
        resolveArtwork(tree(overlayOverText(artwork("atmosphere")), surface), ALLOWED, PALETTE)
          .artwork,
      )[0].scrim;
    // Each section's own ink-and-ground pair, not the page's default one.
    expect(scrimOn("base")).toBe(scrimFor(PALETTE.text, PALETTE.surfaceBase));
    expect(scrimOn("alt")).toBe(scrimFor(PALETTE.text, PALETTE.surfaceAlt));
    expect(scrimOn("contrast")).toBe(scrimFor(PALETTE.textOnContrast, PALETTE.surfaceContrast));
    expect(scrimOn("accent")).toBe(scrimFor(PALETTE.textOnAccent, PALETTE.surfaceAccent));
  });
});

describe("text readability wins, and the page never waits on the asset to know it", () => {
  it("does not draw artwork behind text no approved scrim can protect", () => {
    const grey = { ...PALETTE, text: "#808080", surfaceBase: "#7F7F7F" };
    const { artwork: resolved, deviations } = resolveArtwork(
      tree(overlayOverText(artwork("atmosphere"))),
      ALLOWED,
      grey,
    );
    const entry = Object.values(resolved)[0];
    expect(entry.render).toBe(false);
    expect(entry.suppressedBy).toBe("illegible");
    expect(deviations.map((d) => d.rule)).toContain("artwork.legibility");
  });
});

describe("the direction's budget is enforced, and nothing is deleted to enforce it", () => {
  it("draws up to the budget and records the rest as evidence", () => {
    const decision = decideArtwork({
      ...INTENT,
      composition: { ...INTENT.composition, ornament: "restrained" },
    });
    expect(decision.maxArtwork).toBe(1);
    const root = { t: "Stack", children: [artwork("anchor"), artwork("object")] } as CNode;
    const { artwork: resolved, deviations } = resolveArtwork(tree(root), decision, PALETTE);
    const entries = Object.values(resolved);
    expect(entries.map((e) => e.render)).toEqual([true, false]);
    expect(entries[1].suppressedBy).toBe("artwork-budget");
    // The over-budget node keeps its entry: the tree is never silently edited.
    expect(entries).toHaveLength(2);
    expect(deviations.map((d) => d.rule)).toContain("artwork.budget");
  });

  it("spends the budget in document order, the only ordering the model authored", () => {
    const decision = decideArtwork({
      ...INTENT,
      composition: { ...INTENT.composition, ornament: "restrained" },
    });
    const root = { t: "Stack", children: [artwork("framed"), artwork("anchor")] } as CNode;
    const entries = Object.values(resolveArtwork(tree(root), decision, PALETTE).artwork);
    expect(entries[0].role).toBe("framed");
    expect(entries[0].render).toBe(true);
  });
});

describe("artwork cannot enter through the compiler", () => {
  it("refuses to draw an Artwork node on a concept whose direction declined artwork", () => {
    const declined = decideArtwork({
      ...INTENT,
      composition: { ...INTENT.composition, ornament: "none" },
    });
    expect(declined.allowed).toBe(false);
    const { artwork: resolved, deviations } = resolveArtwork(
      tree(artwork("anchor")),
      declined,
      PALETTE,
    );
    const entry = Object.values(resolved)[0];
    expect(entry.render).toBe(false);
    expect(entry.suppressedBy).toBe("artwork-disabled");
    expect(deviations.map((d) => d.rule)).toContain("artwork.disabled");
  });

  it("leaves an image-free tree with no artwork entries at all", () => {
    const root = { t: "Stack", children: [{ t: "EventTitle" }] } as CNode;
    const { artwork: resolved, deviations } = resolveArtwork(tree(root), ALLOWED, PALETTE);
    expect(resolved).toEqual({});
    expect(deviations).toEqual([]);
  });
});
