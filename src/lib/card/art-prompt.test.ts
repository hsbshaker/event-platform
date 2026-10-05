import { describe, expect, it } from "vitest";

import {
  ART_RASTER_SIZE,
  assembleArtPrompt,
  assembleShapeSwitchPrompt,
  CARD_ART_PROMPT_VERSION,
  cropShapeFor,
  fitsShapes,
  REPAINT_COMPOSITION,
  withRepaintComposition,
} from "./art-prompt";
import { ART_MODE_FIT, ART_MODES } from "./art-modes";
import type { CardDesign } from "./design";
import { artModeCompatible, CARD_LAYOUT_IDS, CARD_LAYOUTS, layoutArtFor } from "./layouts";
import { PEOPLE_FREE_RENDERINGS, RENDERING_ART_PROMPT, RENDERINGS } from "./renderings";
import type { Rendering } from "./renderings";

const brief: CardDesign["artBrief"] = {
  subject: "A small bear holding a red balloon, standing on grass",
  rendering: "painterly",
  aesthetic: "romantic",
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
  rendering: Rendering = brief.rendering,
) => ({ shape, layout, artMode, artBrief: { ...brief, avoid, rendering } });

const ALWAYS = [
  "Absolutely no text of any kind: no letters, words, numbers, initials, monograms, signatures, labels, logos, wordmarks, crests or watermarks anywhere in the image.",
  "This is the artwork itself, filling the canvas — not a mockup: no photograph of a printed card, no envelope, table edge, hands, shadows of paper or frame around the canvas. The artwork may itself be a photograph when the rendering says so.",
  "The calm area will carry typeset text that is added later, so leave it genuinely clear — but do not leave the rest of the card empty.",
];
const CORNER_LINE =
  "The trimming is done later by the printer: carry the background all the way into every corner and edge of the canvas. Do not draw the outline itself, a vignette, a border line or blank corners.";

describe("card_art_v4", () => {
  it("is versioned", () => {
    expect(CARD_ART_PROMPT_VERSION).toBe("card_art_v4");
    expect(ART_RASTER_SIZE).toEqual({ "5:7": "1440x2016", "1:1": "1440x1440" });
  });

  it("assembles an illustration prompt: proportion-fit crop rule, corner line, brief fields", () => {
    const p = assembleArtPrompt(design("arch", "art-top", "illustration"));
    expect(p.startsWith("Original artwork for the front of an invitation card, portrait 5:7")).toBe(
      true,
    );
    expect(p).toContain("\nA recognizable, specific subject anchors the card, made with care.\n");
    expect(p).toContain("Subject: A small bear holding a red balloon, standing on grass.");
    expect(p).toContain(
      "\nRendering: Painterly artwork: organic hand-painted watercolour or gouache, translucent colour, soft edges and artistic texture. Aesthetic: romantic.\nMedium: ",
    );
    expect(p).toContain(
      "Medium: watercolour on cotton paper. Texture: soft paper grain. Mood: tender and playful.",
    );
    expect(p).toContain("Palette: warm honey and dusty rose (#F2D7A0, #C98B8B, #FFF8EE).");
    // An arch gives the picture 40% of the card (card_layouts_v2).
    expect(p).toContain(
      "Composition: Place the subject in the upper 40% of the canvas. Keep the lower part of the canvas — the bottom 60% — completely clear",
    );
    expect(p).toContain("it fills most of the upper 40%");
    // The artwork fits the arch and the oval, so it obeys the oval's crop.
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
    expect(p).toContain(
      "Restrained: a refined border, pattern or surface texture only, but crafted and visible — never a blank card.",
    );
    expect(p).toContain("Outline: The card is cut to an oval");
    expect(p).not.toContain(CORNER_LINE);
    expect(p.endsWith("An original style.")).toBe(true);
    expect(p).not.toContain("Do not depict");
  });

  it("is exactly thirteen lines for a proportion-fit design, built from the brief, layout and shape only", () => {
    const p = assembleArtPrompt(design("rectangle", "corners", "illustration"));
    expect(p.split("\n")).toHaveLength(13);
  });
});

describe("rendering families", () => {
  it.each(RENDERINGS)("puts the exact %s Rendering line right before the Medium line", (r) => {
    const lines = assembleArtPrompt(design("rectangle", "art-top", "illustration", [], r)).split(
      "\n",
    );
    const at = lines.indexOf(`Rendering: ${RENDERING_ART_PROMPT[r]} Aesthetic: romantic.`);
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1].startsWith("Medium: ")).toBe(true);
    expect(lines.filter((l) => l.startsWith("Rendering: "))).toHaveLength(1);
  });

  it("refuses a brief with no known rendering, such as one persisted under schema v1", () => {
    const d = design("rectangle", "art-top", "illustration");
    const v1 = { ...d, artBrief: { ...d.artBrief, rendering: undefined } };
    expect(() => assembleArtPrompt(v1 as unknown as typeof d)).toThrow(/no known rendering/);
    const odd = { ...d, artBrief: { ...d.artBrief, rendering: "toString" } };
    expect(() => assembleArtPrompt(odd as unknown as typeof d)).toThrow(/no known rendering/);
  });

  it("carries the aesthetic on the Rendering line, without a doubled full stop", () => {
    const d = design("rectangle", "art-top", "illustration");
    const p = assembleArtPrompt({
      ...d,
      artBrief: { ...d.artBrief, aesthetic: "Luxury editorial." },
    });
    expect(p).toContain(" Aesthetic: Luxury editorial.\nMedium: ");
  });

  it("asks for no people in photographic, editorial, 3D and collage artwork only", () => {
    const people = "No people, faces, hands or bodies.";
    for (const r of RENDERINGS) {
      const p = assembleArtPrompt(design("rectangle", "art-top", "illustration", [], r));
      expect(p.includes(people), r).toBe(PEOPLE_FREE_RENDERINGS.includes(r));
    }
  });

  // Regression guard (card_art_v3): the prompt itself never pushes toward paint or away from
  // photography; only the painterly family's own Rendering line names paint.
  it("never says paint, painted or not a photograph outside the painterly rendering line", () => {
    const forbidden = [/\bpaint\b/i, /\bpainted\b/i, /not a photograph/i];
    for (const layout of CARD_LAYOUT_IDS) {
      for (const artMode of ART_MODES.filter((m) => artModeCompatible(layout, m))) {
        for (const shape of CARD_LAYOUTS[layout].shapes) {
          for (const r of RENDERINGS) {
            const d = design(shape, layout, artMode, [], r);
            for (const prompt of [
              assembleArtPrompt(d),
              ...CARD_LAYOUTS[layout].shapes.map((to) => assembleShapeSwitchPrompt(d, to)),
            ]) {
              const label = `${layout}/${artMode}/${shape}/${r}`;
              const text =
                r === "painterly"
                  ? prompt.replace(`Rendering: ${RENDERING_ART_PROMPT.painterly}`, "")
                  : prompt;
              for (const word of forbidden) expect(text, label).not.toMatch(word);
            }
          }
        }
      }
    }
  });
});

describe("cropShapeFor and fitsShapes", () => {
  it("uses the design's own shape for own-shape modes", () => {
    expect(cropShapeFor("framed", "framed", "arch")).toBe("arch");
    expect(cropShapeFor("minimal", "atmosphere", "rounded-rectangle")).toBe("rounded-rectangle");
    expect(fitsShapes("framed", "framed", "arch")).toEqual(["arch"]);
    expect(fitsShapes("minimal", "atmosphere", "circle")).toEqual(["circle"]);
  });

  it("uses the tightest outline the artwork fits for proportion-fit modes", () => {
    expect(cropShapeFor("illustration", "art-top", "rectangle")).toBe("rounded-rectangle");
    expect(cropShapeFor("illustration", "art-top", "arch")).toBe("oval");
    expect(cropShapeFor("illustration", "art-bottom", "oval")).toBe("oval");
    expect(cropShapeFor("illustration", "art-top", "square")).toBe("square");
    expect(cropShapeFor("illustration", "corners", "rectangle")).toBe("rounded-rectangle");
    expect(cropShapeFor("illustration", "corners", "square")).toBe("square");
    expect(cropShapeFor("atmosphere", "atmosphere", "arch")).toBe("oval");
    expect(cropShapeFor("atmosphere", "atmosphere", "square")).toBe("circle");
  });

  it("fits the shapes of the proportion painted with the same composition and presence", () => {
    // Bottom 45% quiet: the rectangle and rounded rectangle; bottom 60% quiet: the arch and oval.
    expect(fitsShapes("illustration", "art-top", "rectangle")).toEqual([
      "rectangle",
      "rounded-rectangle",
    ]);
    expect(fitsShapes("illustration", "art-top", "arch")).toEqual(["arch", "oval"]);
    expect(fitsShapes("illustration", "art-bottom", "oval")).toEqual(["arch", "oval"]);
    expect(fitsShapes("illustration", "art-top", "square")).toEqual(["square"]);
    expect(fitsShapes("illustration", "corners", "rectangle")).toEqual([
      "rectangle",
      "rounded-rectangle",
    ]);
    expect(fitsShapes("illustration", "corners", "square")).toEqual(["square"]);
    expect(fitsShapes("atmosphere", "atmosphere", "oval")).toEqual([
      "rectangle",
      "rounded-rectangle",
      "arch",
      "oval",
    ]);
    expect(fitsShapes("atmosphere", "atmosphere", "circle")).toEqual(["square", "circle"]);
  });

  it("refuses a shape the layout does not support", () => {
    expect(() => fitsShapes("illustration", "art-top", "circle")).toThrow(/does not support/);
    expect(() => cropShapeFor("illustration", "art-bottom", "circle")).toThrow(/does not support/);
    expect(() => assembleArtPrompt(design("circle", "art-top", "illustration"))).toThrow(
      /does not support/,
    );
  });

  it("fits a proportion-fit artwork to exactly the shapes whose art prompt is the same", () => {
    for (const layout of CARD_LAYOUT_IDS) {
      for (const artMode of ART_MODES.filter((m) => artModeCompatible(layout, m))) {
        for (const shape of CARD_LAYOUTS[layout].shapes) {
          const fits = fitsShapes(artMode, layout, shape);
          const label = `${layout}/${artMode}/${shape}`;
          expect(fits, label).toContain(shape);
          if (ART_MODE_FIT[artMode] === "own-shape") {
            expect(fits, label).toEqual([shape]);
            continue;
          }
          const prompt = assembleArtPrompt(design(shape, layout, artMode));
          const same = CARD_LAYOUTS[layout].shapes.filter(
            (s) => assembleArtPrompt(design(s, layout, artMode)) === prompt,
          );
          expect(fits, label).toEqual(same);
        }
      }
    }
  });
});

describe("assembleShapeSwitchPrompt", () => {
  it("is the target shape's prompt plus the reference-continuity sentence", () => {
    const d = design("rectangle", "art-top", "illustration");
    const p = assembleShapeSwitchPrompt(d, "square");
    const target = assembleArtPrompt({ ...d, shape: "square" });
    expect(p.startsWith(target)).toBe(true);
    expect(p).toContain("square 1:1");
    // The target's own composition: the square gives the picture 40%.
    expect(p).toContain("Place the subject in the upper 40% of the canvas.");
    expect(p).not.toContain("upper half");
    expect(p).toContain(
      "\nKeep the same subject, character, rendering, medium and palette as the reference artwork — the same small bear holding a red balloon — rearranged for this new canvas and outline. Do not copy the reference's framing or the subject's size in it; recompose it to this canvas's composition, making the subject smaller where the composition gives it less of the card, and keep the clear area completely clear.",
    );
  });

  it("is consistent with assembleArtPrompt for every layout, mode and pair of supported shapes", () => {
    for (const layout of CARD_LAYOUT_IDS) {
      for (const artMode of ART_MODES.filter((m) => artModeCompatible(layout, m))) {
        for (const from of CARD_LAYOUTS[layout].shapes) {
          for (const to of CARD_LAYOUTS[layout].shapes) {
            const d = design(from, layout, artMode);
            const p = assembleShapeSwitchPrompt(d, to);
            const target = assembleArtPrompt({ ...d, shape: to });
            expect(
              p.startsWith(`${target}\nKeep the same subject`),
              `${layout}/${from}→${to}`,
            ).toBe(true);
            expect(p, `${layout}/${from}→${to}`).toContain(
              `Composition: ${layoutArtFor(layout, to).composition}`,
            );
          }
        }
      }
    }
  });

  it("keeps the design's rendering on a shape switch", () => {
    for (const r of RENDERINGS) {
      const p = assembleShapeSwitchPrompt(
        design("rectangle", "art-top", "illustration", [], r),
        "oval",
      );
      expect(p).toContain(`\nRendering: ${RENDERING_ART_PROMPT[r]} Aesthetic: romantic.\n`);
      expect(p).toContain("Keep the same subject, character, rendering, medium and palette");
    }
  });

  it("refuses a shape the layout does not support", () => {
    expect(() =>
      assembleShapeSwitchPrompt(design("rectangle", "corners", "illustration"), "circle"),
    ).toThrow(/does not support/);
    expect(() =>
      assembleShapeSwitchPrompt(design("square", "art-top", "illustration"), "circle"),
    ).toThrow(/does not support/);
  });
});

describe("brief fields in the prompt", () => {
  it("never doubles a full stop the brief already ends with, and drops a leading article in the switch", () => {
    const design = {
      artMode: "illustration" as const,
      layout: "art-top" as const,
      shape: "rectangle" as const,
      artBrief: {
        subject: "An heirloom teddy bear, sitting upright.",
        rendering: "painterly" as const,
        aesthetic: "romantic",
        medium: "Watercolour with gouache.",
        texture: "Matte paper grain. ",
        mood: "Quietly celebratory.",
        palette: { description: "Navy and brown.", colors: ["#172638", "#735039", "#E7DDCA"] },
        avoid: [],
      },
    };
    const prompt = assembleShapeSwitchPrompt(design, "rounded-rectangle");
    expect(prompt).not.toMatch(/\.\./);
    expect(prompt).toContain("Subject: An heirloom teddy bear, sitting upright.");
    expect(prompt).toContain("Texture: Matte paper grain. Mood: Quietly celebratory.");
    expect(prompt).toContain("Palette: Navy and brown (#172638, #735039, #E7DDCA).");
    expect(prompt).toContain("the same heirloom teddy bear — rearranged");
  });
});

describe("the repaint composition line (card_art_v4, owner decision 2026-10-05)", () => {
  it("adds one line to a repaint of art with a subject, and nothing to a wash", () => {
    const prompt = "line one\nline two";
    for (const mode of ["illustration", "framed"] as const) {
      expect(withRepaintComposition(prompt, mode)).toBe(`${prompt}\n${REPAINT_COMPOSITION}`);
    }
    for (const mode of ["atmosphere", "minimal"] as const) {
      expect(withRepaintComposition(prompt, mode)).toBe(prompt);
    }
    expect(REPAINT_COMPOSITION).toMatch(/calm area kept for the words/);
    // It never refers to an earlier image: on a shape switch the reference is the one to keep.
    expect(REPAINT_COMPOSITION).not.toMatch(/previous|last|earlier|reference|attempt/i);
    expect(REPAINT_COMPOSITION).not.toMatch(
      /\b(text|letters?|words?) (in|on) the (image|picture)\b/i,
    );
  });
});
