/**
 * Draft `card_layouts_v1` for Phase 3 validation (docs/card-system.md §2.1–§2.5).
 *
 * A proposal under test, not the product catalog: Phase 4 turns the version that survives this
 * phase into versioned code. Geometry is in card units (portrait 1000 × 1400, square 1000 × 1000).
 */

export const CANVAS = { "5:7": { w: 1000, h: 1400 }, "1:1": { w: 1000, h: 1000 } };

export const SHAPES = {
  rectangle: { proportion: "5:7", margin: 80, outline: "square corners" },
  "rounded-rectangle": {
    proportion: "5:7",
    margin: 90,
    radius: 70,
    outline: "softly rounded corners",
  },
  arch: { proportion: "5:7", margin: 80, outline: "flat bottom, semicircular top" },
  oval: { proportion: "5:7", margin: 70, outline: "ellipse inscribed in the canvas" },
  square: { proportion: "1:1", margin: 70, outline: "square corners" },
  circle: { proportion: "1:1", margin: 70, outline: "circle inscribed in the canvas" },
};

/** Is card-unit point (x, y) inside the shape's text-safe area? */
export function insideTextSafe(shape, x, y) {
  const s = SHAPES[shape];
  const { w, h } = CANVAS[s.proportion];
  const m = s.margin;
  switch (shape) {
    case "rectangle":
    case "rounded-rectangle":
    case "square":
      return x >= m && x <= w - m && y >= m && y <= h - m;
    case "arch": {
      const r = w / 2;
      if (x < m || x > w - m || y > h - m) return false;
      if (y >= r) return true;
      return Math.hypot(x - r, y - r) <= r - m;
    }
    case "oval": {
      const rx = w / 2 - m;
      const ry = h / 2 - m;
      return ((x - w / 2) / rx) ** 2 + ((y - h / 2) / ry) ** 2 <= 1;
    }
    case "circle":
      return Math.hypot(x - w / 2, y - h / 2) <= w / 2 - m;
    default:
      throw new Error(`unknown shape ${shape}`);
  }
}

/** Widest centred zone for a vertical band that stays inside the text-safe area. */
export function zoneFor(shape, band, maxWidth) {
  const { w } = CANVAS[SHAPES[shape].proportion];
  let half = maxWidth / 2;
  for (let y = band.top; y <= band.bottom; y += 4) {
    while (
      half > 40 &&
      !(insideTextSafe(shape, w / 2 - half, y) && insideTextSafe(shape, w / 2 + half, y))
    ) {
      half -= 2;
    }
  }
  return { x: w / 2 - half, y: band.top, width: half * 2, height: band.bottom - band.top };
}

const ALL = ["rectangle", "rounded-rectangle", "arch", "oval", "square", "circle"];

/**
 * Each layout: text band per proportion, max text width, supported shapes, compatible art modes,
 * the composition rule (where the artwork goes and what stays quiet) and the presence it wants.
 */
export const LAYOUTS = {
  "art-top": {
    purpose: "A subject anchors the top of the card; the text sits calmly beneath it.",
    shapes: ALL,
    artModes: ["illustration"],
    band: { "5:7": { top: 800, bottom: 1250 }, "1:1": { top: 540, bottom: 840 } },
    maxWidth: 760,
    composition:
      "Place the subject in the upper half of the canvas. Keep the lower part of the canvas — the bottom 45% — completely clear: nothing from the subject (feet, paws, tails, ribbons, fabric, shadows, foliage) crosses into it; only the paper, wash or a very soft continuation of the background texture.",
    presence:
      "The subject is large and confident: it fills most of the upper half, with supporting elements that may trail a little way down the sides. It must not shrink to a small vignette floating in empty space.",
  },
  "art-bottom": {
    purpose:
      "A grounded subject (still life, scenery, a gathering of objects) holds the bottom; text sits above.",
    shapes: ALL,
    artModes: ["illustration"],
    band: { "5:7": { top: 150, bottom: 600 }, "1:1": { top: 120, bottom: 440 } },
    maxWidth: 760,
    composition:
      "Ground the subject along the bottom of the canvas, rising through the lower half. Keep the upper part of the canvas — the top 45% — completely clear: nothing from the subject (leaves, steam, branches, shadows) rises into it; only paper, wash or soft sky.",
    presence:
      "The subject is generous and fills most of the lower half, edge to edge where it suits it. It must not shrink to a small object in empty space.",
  },
  framed: {
    purpose: "A border, wreath, garland or frame surrounds a quiet centre that holds the text.",
    shapes: ALL,
    artModes: ["framed", "minimal"],
    band: { "5:7": { top: 400, bottom: 1000 }, "1:1": { top: 280, bottom: 720 } },
    maxWidth: 620,
    composition:
      "Arrange the artwork as a border, wreath, garland or frame running around the outer part of the canvas. Keep the central area (roughly the middle 60% of the width and the middle 45% of the height) calm and open: soft background only.",
    presence:
      "The frame is rich and substantial — a generous band of detail around all sides, not a thin line — unless the mode is minimal, where it is a refined, delicate border.",
  },
  corners: {
    purpose: "Motifs cluster in the corners and along the edges; the centre stays open for text.",
    shapes: ["rectangle", "rounded-rectangle", "square"],
    artModes: ["illustration", "framed"],
    band: { "5:7": { top: 420, bottom: 980 }, "1:1": { top: 300, bottom: 700 } },
    maxWidth: 640,
    composition:
      "Cluster the artwork in at least two corners (for example top-left and bottom-right, or all four), flowing a little along the edges. Keep the centre of the canvas (roughly a vertical oval covering the middle 60% of the width and 45% of the height) calm and open.",
    presence:
      "Each corner cluster is substantial — roughly a quarter to a third of the card's width and height — and full of detail. Do not reduce the artwork to a few small props around an empty field.",
  },
  atmosphere: {
    purpose: "A soft full-bleed wash, scenery or texture carries the mood; no discrete subject.",
    shapes: ALL,
    artModes: ["atmosphere", "minimal"],
    band: { "5:7": { top: 400, bottom: 1000 }, "1:1": { top: 260, bottom: 740 } },
    maxWidth: 680,
    composition:
      "Fill the whole canvas with a soft wash, scenery or texture. Keep contrast low and detail quiet through the centre of the canvas, where text will sit.",
    presence:
      "The atmosphere covers the whole card with real depth and variation; it is never a flat, empty field.",
  },
};

export const ART_MODES = {
  illustration: "A recognizable, specific subject anchors the card, painted with care.",
  framed:
    "The artwork is a border, wreath, garland, corner treatment or frame around the text area.",
  atmosphere: "No discrete subject: a soft thematic wash, scenery or texture across the card.",
  minimal:
    "Restrained: a refined border or paper texture only, but crafted and visible — never a blank card.",
};

export const ART_MODE_FIT = {
  illustration: "proportion",
  atmosphere: "proportion",
  framed: "own-shape",
  minimal: "own-shape",
};

const CROP = {
  rectangle: "The card is trimmed with square corners; the artwork runs full bleed to every edge.",
  "rounded-rectangle":
    "The card is trimmed with softly rounded corners; the artwork runs full bleed, with nothing important in the extreme corners.",
  arch: "The top of the card is cut into a semicircular arch, so the top-left and top-right corners are lost: keep anything important below or inside that curve.",
  oval: "The card is cut to an oval inscribed in the canvas, so all four corners are lost: keep everything important inside that oval; the corners hold only background.",
  square: "The card is trimmed with square corners; the artwork runs full bleed to every edge.",
  circle:
    "The card is cut to a circle inscribed in the canvas, so all four corners are lost: keep everything important inside that circle; the corners hold only background.",
};

const TIGHTNESS = ["circle", "oval", "arch", "rounded-rectangle", "square", "rectangle"];

/** The outline whose crop rule the art must obey (card-system.md §2.4). */
export function cropShapeFor(artMode, layout, shape) {
  if (ART_MODE_FIT[artMode] === "own-shape") return shape;
  const proportion = SHAPES[shape].proportion;
  const candidates = LAYOUTS[layout].shapes.filter((s) => SHAPES[s].proportion === proportion);
  return TIGHTNESS.find((s) => candidates.includes(s));
}

/** Shapes a finished artwork fits. */
export function fitsShapes(artMode, layout, shape) {
  if (ART_MODE_FIT[artMode] === "own-shape") return [shape];
  const proportion = SHAPES[shape].proportion;
  return LAYOUTS[layout].shapes.filter((s) => SHAPES[s].proportion === proportion);
}

export const RASTER = { "5:7": "1440x2016", "1:1": "1440x1440" };

/** `card_art_v1`: the art prompt is assembled by code, never written by a model (model-contracts.md §7.1). */
export function assembleArtPrompt(design) {
  const { artBrief: b, artMode, layout, shape } = design;
  const L = LAYOUTS[layout];
  const proportion = SHAPES[shape].proportion;
  const cropShape = cropShapeFor(artMode, layout, shape);
  const framedOutline =
    ART_MODE_FIT[artMode] === "own-shape" &&
    (shape === "oval" || shape === "circle" || shape === "arch")
      ? ` Let the border follow the ${shape === "arch" ? "arched" : shape} outline just inside its edge.`
      : "";
  const avoid = b.avoid.length ? ` Do not depict: ${b.avoid.join("; ")}.` : "";
  return [
    `Original artwork for the front of an invitation card, ${proportion === "5:7" ? "portrait 5:7" : "square 1:1"}, filling the entire canvas edge to edge.`,
    `${ART_MODES[artMode]}`,
    `Subject: ${b.subject}.`,
    `Medium: ${b.medium}. Texture: ${b.texture}. Mood: ${b.mood}.`,
    `Palette: ${b.palette.description} (${b.palette.colors.join(", ")}).`,
    `Composition: ${L.composition} ${L.presence}`,
    `Outline: ${CROP[cropShape]}${framedOutline}`,
    ...(cropShape === shape && ART_MODE_FIT[artMode] === "own-shape"
      ? []
      : [
          "The trimming is done later by the printer: paint the background all the way into every corner and edge of the canvas. Do not paint the outline itself, a vignette, a border line or blank corners.",
        ]),
    "The calm area will carry typeset text that is added later, so leave it genuinely clear — but do not leave the rest of the card empty.",
    "Absolutely no text of any kind: no letters, words, numbers, initials, monograms, signatures, labels, logos, wordmarks, crests or watermarks anywhere in the image.",
    "This is the flat artwork itself, not a photograph or mockup: no card, envelope, table, hands, shadows of paper, or frame around the canvas.",
    `An original style.${avoid}`,
  ].join("\n");
}
