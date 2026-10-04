import { describe, expect, it } from "vitest";

import {
  ART_RASTER_SIZE,
  assembleArtPrompt,
  assembleShapeSwitchPrompt,
  CARD_ART_PROMPT_VERSION,
  cropShapeFor,
  fitsShapes,
} from "./art-prompt";
import type { CardDesign } from "./design";

const brief: CardDesign["artBrief"] = {
  subject: "A small bear holding a red balloon, standing on grass",
  medium: "watercolour on cotton paper",
  mood: "tender and playful",
  palette: { description: "warm honey and dusty rose", colors: ["#F2D7A0", "#C98B8B", "#FFF8EE"] },
  texture: "soft paper grain",
  avoid: ["text", "balloons with faces"],
};

const design = (
  shape: CardDesign["shape"],
  layout: CardDesign["layout"],
  artMode: CardDesign["artMode"],
  avoid = brief.avoid,
) => ({ shape, layout, artMode, artBrief: { ...brief, avoid } });

const ALWAYS = [
  "Absolutely no text of any kind: no letters, words, numbers, initials, monograms, signatures, labels, logos, wordmarks, crests or watermarks anywhere in the image.",
  "This is the flat artwork itself, not a photograph or mockup: no card, envelope, table, hands, shadows of paper, or frame around the canvas.",
  "The calm area will carry typeset text that is added later, so leave it genuinely clear — but do not leave the rest of the card empty.",
];
const CORNER_LINE = "paint the background all the way into every corner and edge of the canvas";

describe("card_art_v1", () => {
  it("is versioned", () => {
    expect(CARD_ART_PROMPT_VERSION).toBe("card_art_v1");
    expect(ART_RASTER_SIZE).toEqual({ "5:7": "1440x2016", "1:1": "1440x1440" });
  });

  it("assembles an illustration prompt: proportion-fit crop rule, corner line, brief fields", () => {
    const p = assembleArtPrompt(design("arch", "art-top", "illustration"));
    expect(p.startsWith("Original artwork for the front of an invitation card, portrait 5:7")).toBe(
      true,
    );
    expect(p).toContain("A recognizable, specific subject anchors the card");
    expect(p).toContain("Subject: A small bear holding a red balloon, standing on grass.");
    expect(p).toContain(
      "Medium: watercolour on cotton paper. Texture: soft paper grain. Mood: tender and playful.",
    );
    expect(p).toContain("Palette: warm honey and dusty rose (#F2D7A0, #C98B8B, #FFF8EE).");
    expect(p).toContain("Composition: Place the subject in the upper half of the canvas.");
    // the tightest 5:7 outline art-top supports is the oval, whatever the design's own shape
    expect(p).toContain("Outline: The card is cut to an oval inscribed in the canvas");
    expect(p).toContain(CORNER_LINE);
    expect(p).toContain("An original style. Do not depict: text; balloons with faces.");
    for (const line of ALWAYS) expect(p).toContain(line);
  });

  it("assembles a framed prompt: own-shape outline, no corner line", () => {
    const p = assembleArtPrompt(design("rectangle", "framed", "framed"));
    expect(p).toContain("The artwork is a border, wreath, garland");
    expect(p).toContain("Composition: Arrange the artwork as a border");
    expect(p).toContain("Outline: The card is trimmed with square corners");
    expect(p).not.toContain(CORNER_LINE);
    for (const line of ALWAYS) expect(p).toContain(line);
  });

  it("asks a framed border to follow a curved outline", () => {
    expect(assembleArtPrompt(design("circle", "framed", "framed"))).toContain(
      "Let the border follow the circle outline just inside its edge.",
    );
    expect(assembleArtPrompt(design("arch", "framed", "framed"))).toContain(
      "Let the border follow the arched outline just inside its edge.",
    );
    expect(assembleArtPrompt(design("oval", "framed", "minimal"))).toContain(
      "Let the border follow the oval outline",
    );
    expect(assembleArtPrompt(design("rectangle", "framed", "framed"))).not.toContain("follow the");
  });

  it("assembles an atmosphere prompt on a square canvas", () => {
    const p = assembleArtPrompt(design("square", "atmosphere", "atmosphere"));
    expect(p).toContain("square 1:1");
    expect(p).toContain("No discrete subject: a soft thematic wash");
    expect(p).toContain("Composition: Fill the whole canvas with a soft wash");
    // circle is supported by atmosphere, so a square design obeys the circle crop
    expect(p).toContain("Outline: The card is cut to a circle inscribed in the canvas");
    expect(p).toContain(CORNER_LINE);
  });

  it("assembles a minimal prompt that is own-shape", () => {
    const p = assembleArtPrompt(design("oval", "atmosphere", "minimal", []));
    expect(p).toContain("Restrained: a refined border or paper texture only");
    expect(p).toContain("Outline: The card is cut to an oval");
    expect(p).not.toContain(CORNER_LINE);
    expect(p.endsWith("An original style.")).toBe(true);
    expect(p).not.toContain("Do not depict");
  });

  it("is exactly twelve lines for a proportion-fit design, built from the brief, layout and shape only", () => {
    const p = assembleArtPrompt(design("rectangle", "corners", "illustration"));
    expect(p.split("\n")).toHaveLength(12);
  });
});

describe("cropShapeFor and fitsShapes", () => {
  it("uses the design's own shape for own-shape modes", () => {
    expect(cropShapeFor("framed", "framed", "arch")).toBe("arch");
    expect(cropShapeFor("minimal", "atmosphere", "rounded-rectangle")).toBe("rounded-rectangle");
    expect(fitsShapes("framed", "framed", "arch")).toEqual(["arch"]);
    expect(fitsShapes("minimal", "atmosphere", "circle")).toEqual(["circle"]);
  });

  it("uses the tightest supported outline for proportion-fit modes", () => {
    expect(cropShapeFor("illustration", "art-top", "rectangle")).toBe("oval");
    expect(cropShapeFor("illustration", "art-top", "square")).toBe("circle");
    expect(cropShapeFor("illustration", "corners", "rectangle")).toBe("rounded-rectangle");
    expect(cropShapeFor("illustration", "corners", "square")).toBe("square");
    expect(cropShapeFor("atmosphere", "atmosphere", "arch")).toBe("oval");
  });

  it("fits every supported shape of the proportion for proportion-fit modes", () => {
    expect(fitsShapes("illustration", "art-top", "arch")).toEqual([
      "rectangle",
      "rounded-rectangle",
      "arch",
      "oval",
    ]);
    expect(fitsShapes("illustration", "art-top", "circle")).toEqual(["square", "circle"]);
    expect(fitsShapes("illustration", "corners", "rectangle")).toEqual([
      "rectangle",
      "rounded-rectangle",
    ]);
    expect(fitsShapes("illustration", "corners", "square")).toEqual(["square"]);
  });
});

describe("assembleShapeSwitchPrompt", () => {
  it("is the target shape's prompt plus the reference-continuity sentence", () => {
    const d = design("rectangle", "art-top", "illustration");
    const p = assembleShapeSwitchPrompt(d, "square");
    const target = assembleArtPrompt({ ...d, shape: "square" });
    expect(p.startsWith(target)).toBe(true);
    expect(p).toContain("square 1:1");
    expect(p).toContain(
      "\nKeep the same subject, character, medium and palette as the reference artwork — the same A small bear holding a red balloon — rearranged for this new canvas and outline. Do not copy the reference's framing; recompose it.",
    );
  });

  it("refuses a shape the layout does not support", () => {
    expect(() =>
      assembleShapeSwitchPrompt(design("rectangle", "corners", "illustration"), "circle"),
    ).toThrow(/does not support/);
  });
});
