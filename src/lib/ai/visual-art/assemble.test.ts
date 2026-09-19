import { describe, expect, it } from "vitest";

import { assembleVisualArtIntent, BRIEF_DISPOSITION } from "./assemble";
import { FORBIDDEN_INTENT_FIELDS, STANDING_PROHIBITIONS } from "./contract";
import { eventIdentitySchema } from "@/lib/ai/event-identity/contract";
import { decideArtwork } from "@/lib/renderer/compile/artwork-decision";
import { resolveArtwork, type ResolvedArtwork } from "@/lib/renderer/compile/artwork";
import { compileSemanticPalette } from "@/lib/renderer/compile/palette";
import type { CNode, CompositionTree, Section } from "@/lib/renderer/composition/nodes";
import type { Anchor, ArtworkRole } from "@/lib/renderer/composition/tokens";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { PREMISE_FIXTURE_IDENTITY } from "../../../../tests/fixtures/concept-premise";

const IDENTITY = PREMISE_FIXTURE_IDENTITY;

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

/** Resolve one slot through the real compiler, so the brief is briefed on a real placement. */
function slotFor(root: CNode, surface: Section["surface"] = "base"): ResolvedArtwork {
  const tree: CompositionTree = {
    version: "composition_v1",
    sections: [{ kind: "hero", surface, root }],
  };
  const { artwork } = resolveArtwork(tree, ALLOWED, PALETTE);
  return Object.values(artwork)[0];
}

const bare = (role: ArtworkRole, extent?: "quarter" | "third" | "half" | "full") =>
  slotFor({ t: "Artwork", role, ...(extent ? { extent } : {}) } as CNode);

const underText = (anchor: Anchor, role: ArtworkRole = "atmosphere") =>
  slotFor({
    t: "Overlay",
    content: { t: "Stack", children: [{ t: "EventTitle" }] },
    decoration: { t: "Artwork", role },
    anchor,
    extent: "full",
    mobile: "stack",
  } as CNode);

const brief = (slot: ResolvedArtwork) =>
  assembleVisualArtIntent({ slot, identity: IDENTITY, palette: PALETTE });

describe("the disposition map decides every identity field", () => {
  it("covers the contract exactly, so a new field cannot leak by default", () => {
    expect(Object.keys(BRIEF_DISPOSITION).sort()).toEqual(
      Object.keys(eventIdentitySchema.shape).sort(),
    );
  });

  it("withholds creativeGuidance, which is what keeps advisory taste from becoming law", () => {
    // `spec.md §32 #12`. Absence is the only guarantee that holds — a carried-but-labelled field
    // is a field a model can still read as an instruction.
    expect(BRIEF_DISPOSITION.creativeGuidance).toBe("withheld");
    const assembled = JSON.stringify(brief(bare("anchor")));
    expect(assembled).not.toContain(IDENTITY.creativeGuidance);
  });

  it("withholds the raw creative palette and the inspiration evidence", () => {
    const assembled = JSON.stringify(brief(bare("anchor")));
    const rawColors = [
      ...IDENTITY.paletteIntent.requiredColors,
      ...IDENTITY.paletteIntent.preferredColors,
      ...IDENTITY.paletteIntent.avoidColors,
    ];
    expect(rawColors.length).toBeGreaterThan(0);
    for (const hex of rawColors) expect(assembled).not.toContain(hex);
    expect(assembled).not.toContain(IDENTITY.paletteIntent.dominanceNotes);
    expect(assembled).not.toContain(IDENTITY.inspirationSummary);
  });
});

describe("the host's authority survives to the image model", () => {
  it("carries every constraint verbatim and complete", () => {
    const intent = brief(bare("anchor"));
    expect(intent.hostConstraints).toEqual([...IDENTITY.hostConstraints]);
  });

  it("always carries the standing prohibitions, whatever the caller did", () => {
    for (const role of ["anchor", "object", "atmosphere", "framed"] as ArtworkRole[]) {
      expect(brief(bare(role)).prohibited).toEqual([...STANDING_PROHIBITIONS]);
    }
  });
});

describe("the brief follows the resolved reservation (spec.md §7.6a #2)", () => {
  it("asks for no clear region when nothing is set over the artwork", () => {
    // Three of the four treatments lay the text beside the artwork, so the whole frame is the
    // artwork's and asking it to keep a region open would cost composition for nothing.
    expect(brief(bare("framed")).negativeSpace).toBe("none");
    expect(brief(underText("bottom-end", "object")).negativeSpace).toBe("none");
    expect(brief(underText("top-start", "anchor")).negativeSpace).toBe("none");
  });

  it("asks for restraint throughout when text really is set across it", () => {
    // A field is the one treatment where text and artwork share pixels, and an overlay's content
    // is in normal flow across the whole box rather than gathered in a corner — so "throughout" is
    // the only honest answer. Naming a side here is what the old code got wrong.
    expect(brief(underText("center", "atmosphere")).negativeSpace).toBe("throughout");
    expect(brief(underText("bottom-end", "atmosphere")).negativeSpace).toBe("throughout");
  });

  it("no longer reads the artwork's own anchor as though it were the text's", () => {
    // The regression this replaces: `bottom-end` positions the *decoration*, and the brief used to
    // read it as "text is at the bottom" and ask for open space exactly where the artwork sat.
    const slot = underText("bottom-end", "object");
    expect(slot.artworkAnchor).toBe("bottom-end");
    expect(brief(slot).negativeSpace).not.toBe("bottom");
  });

  it("tells the model a scrimmed frame will lose fine detail, and only then", () => {
    expect(brief(underText("center", "atmosphere")).composition).toContain("tinted wash");
    expect(brief(bare("framed")).composition).not.toContain("tinted wash");
    expect(brief(underText("bottom-end", "object")).composition).not.toContain("tinted wash");
  });

  it("reads crop safety off the resolved fit, not off the leaf's extent", () => {
    // The modelling gap the capability spike exposed. `extent` says how much of a *section* the
    // artwork is for; inside an overlay the box is the overlay's, and what decides how much
    // survives is whether the compiler will crop it.
    const contained = slotFor({ t: "Artwork", role: "object", extent: "full" } as CNode);
    expect(contained.fit).toBe("contain");
    expect(brief(contained).cropSafety).toBe("tight");

    const cropped = underText("top-start", "anchor");
    expect(cropped.fit).toBe("cover");
    expect(brief(cropped).cropSafety).toBe("generous");
  });

  it("weights the subject by how much of the page the treatment gives it", () => {
    expect(brief(underText("top-start", "anchor")).subjectWeight).toBe("dominant");
    expect(brief(underText("bottom-end", "object")).subjectWeight).toBe("balanced");
    // Atmosphere overrides its treatment: it is defined as ground, however much space it has.
    expect(brief(underText("center", "atmosphere")).subjectWeight).toBe("incidental");
  });

  it("requires transparency only where the role is defined by compositing", () => {
    expect(brief(bare("object")).background).toBe("transparent");
    expect(brief(underText("center", "atmosphere")).background).toBe("opaque");
    expect(brief(bare("anchor")).background).toBe("either");
  });

  it("asks scrimmed artwork to stay muted and inverted bands for a counterpoint", () => {
    expect(brief(underText("center", "atmosphere")).paletteRelationship).toBe("muted");
    expect(
      brief(slotFor({ t: "Artwork", role: "anchor" } as CNode, "contrast")).paletteRelationship,
    ).toBe("contrast");
    expect(brief(bare("anchor")).paletteRelationship).toBe("harmonize");
  });

  it("names the side a zone takes, so the brief knows which way the page reads", () => {
    expect(brief(underText("bottom-end", "object")).composition).toContain("trailing side");
    expect(brief(underText("top-start", "object")).composition).toContain("leading side");
  });

  it("describes both breakpoints when the reservation changes shape between them", () => {
    // A column at 1280 is a band at 390. A brief that mentioned only one would be briefing half
    // the pages this asset appears on.
    const column = brief(underText("top-start", "anchor")).composition;
    expect(column).toContain("wide screen");
    expect(column).toContain("phone");
    // And says so once when the shape does not change.
    const framed = brief(bare("framed")).composition;
    expect(framed).toContain("every screen width");
  });
});

describe("the image model is never handed a placement", () => {
  it("carries no field this contract forbids", () => {
    const keys = Object.keys(brief(bare("anchor")));
    for (const forbidden of FORBIDDEN_INTENT_FIELDS) expect(keys).not.toContain(forbidden);
  });

  it("describes the space without a single measurement", () => {
    for (const slot of [bare("anchor", "full"), bare("object", "quarter"), underText("center")]) {
      const text = brief(slot).composition;
      // No pixels, no percentages, no aspect ratios: a number offered is a number honoured, and
      // then the compiler no longer owns realization.
      expect(text).not.toMatch(/\d+\s*(px|%|:|x)\b/i);
      expect(text).not.toMatch(/\b\d{2,}\b/);
    }
  });

  it("sends the compiled semantic palette, never the raw creative one", () => {
    const intent = brief(bare("anchor"));
    for (const hex of intent.paletteHexes) {
      expect(Object.values(PALETTE)).toContain(hex);
      expect(INTENT.palette.colors).not.toContain(hex);
    }
  });
});

describe("briefing is downstream of placement, and says so", () => {
  it("refuses to brief a slot the compiler suppressed", () => {
    const declined = decideArtwork({
      ...INTENT,
      composition: { ...INTENT.composition, ornament: "none" },
    });
    const tree: CompositionTree = {
      version: "composition_v1",
      sections: [
        { kind: "hero", surface: "base", root: { t: "Artwork", role: "anchor" } as CNode },
      ],
    };
    const slot = Object.values(resolveArtwork(tree, declined, PALETTE).artwork)[0];
    expect(() => assembleVisualArtIntent({ slot, identity: IDENTITY, palette: PALETTE })).toThrow(
      /suppressed/,
    );
  });

  it("is deterministic: the same placement briefs the same way", () => {
    const slot = underText("bottom-end", "object");
    expect(brief(slot)).toEqual(brief(slot));
  });

  it("produces a brief that validates against its own schema", () => {
    // `assembleVisualArtIntent` parses before returning, so this asserts the parse is real rather
    // than that the object looks right.
    for (const role of ["anchor", "object", "atmosphere", "framed"] as ArtworkRole[]) {
      expect(() => brief(bare(role))).not.toThrow();
    }
  });
});
