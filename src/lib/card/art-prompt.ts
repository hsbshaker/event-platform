/**
 * Art prompt assembly, `card_art_v2` (`docs/model-contracts.md §7.1`, `docs/card-system.md §2.4`).
 *
 * The art prompt is assembled by code from the validated art brief plus the layout and shape
 * rules; a model never writes it and the raw host prompt is never part of it (`spec.md §32 #17`).
 * `card_art_v1` was ported faithfully from the catalog validated in Phase 3
 * (`scripts/phase-3/catalog.mjs`, `run.mjs stageSwitch`). `card_art_v2` takes the composition and
 * presence from the layout's entry for the shape (`card_layouts_v2`: a picture above or below the
 * words takes 40% of a square, oval or arch card), and an artwork fits only the shapes painted
 * with the same instructions, so its crop rule is the tightest outline among those. Changing any
 * sentence is a `CARD_ART_PROMPT_VERSION` bump.
 */

import { CARD_ART_PROMPT_VERSION } from "@/lib/ai/versions";

import { ART_MODE_FIT } from "./art-modes";
import type { ArtMode } from "./art-modes";
import type { CardDesign } from "./design";
import { CARD_LAYOUTS, layoutArtFor, layoutSupportsShape } from "./layouts";
import type { CardLayoutId } from "./layouts";
import { SHAPE_PROPORTION } from "./shapes";
import type { CardProportion, CardShape } from "./shapes";

export { CARD_ART_PROMPT_VERSION };

/** Raster size requested from the image model, per proportion. */
export const ART_RASTER_SIZE: Readonly<Record<CardProportion, string>> = {
  "5:7": "1440x2016",
  "1:1": "1440x1440",
};

const ART_MODE_DESCRIPTION: Readonly<Record<ArtMode, string>> = {
  illustration: "A recognizable, specific subject anchors the card, painted with care.",
  framed:
    "The artwork is a border, wreath, garland, corner treatment or frame around the text area.",
  atmosphere: "No discrete subject: a soft thematic wash, scenery or texture across the card.",
  minimal:
    "Restrained: a refined border or paper texture only, but crafted and visible — never a blank card.",
};

const CROP_RULE: Readonly<Record<CardShape, string>> = {
  rectangle: "The card is trimmed with square corners; the artwork runs full bleed to every edge.",
  "rounded-rectangle":
    "The card is trimmed with softly rounded corners; the artwork runs full bleed, with nothing important in the extreme corners.",
  arch: "The top of the card is cut into a semicircular arch, so the top-left and top-right corners are lost: keep anything important below or inside that curve.",
  oval: "The card is cut to an oval inscribed in the canvas, so all four corners are lost: keep everything important inside that oval; the corners hold only background.",
  square: "The card is trimmed with square corners; the artwork runs full bleed to every edge.",
  circle:
    "The card is cut to a circle inscribed in the canvas, so all four corners are lost: keep everything important inside that circle; the corners hold only background.",
};

/** Tightest outline first. */
const TIGHTNESS: readonly CardShape[] = [
  "circle",
  "oval",
  "arch",
  "rounded-rectangle",
  "square",
  "rectangle",
];

/**
 * Shapes a finished artwork fits (`docs/card-system.md §2.4`): for own-shape modes, only the shape
 * it was painted for; for proportion-fit modes, every shape of its proportion the layout supports
 * whose composition and presence are the ones it was painted with. An artwork painted to keep one
 * region quiet never fits a shape whose text needs another: a rectangle's picture-above artwork
 * (bottom 45% quiet) does not fit the oval's 60% band, nor the oval's artwork the rectangle (its
 * picture would end well above the rectangle's text, leaving an empty gap the layout does not
 * intend). Throws if the layout does not support the shape.
 */
export function fitsShapes(
  artMode: ArtMode,
  layout: CardLayoutId,
  shape: CardShape,
): readonly CardShape[] {
  const own = layoutArtFor(layout, shape);
  if (ART_MODE_FIT[artMode] === "own-shape") return [shape];
  const proportion = SHAPE_PROPORTION[shape];
  return CARD_LAYOUTS[layout].shapes.filter((s) => {
    if (SHAPE_PROPORTION[s] !== proportion) return false;
    const art = layoutArtFor(layout, s);
    return art.composition === own.composition && art.presence === own.presence;
  });
}

/**
 * The outline whose crop rule the art must obey (`docs/card-system.md §2.4`): the design's own
 * shape for own-shape modes; for proportion-fit modes, the tightest outline among the shapes the
 * artwork fits (`fitsShapes`), so any of them can trim it.
 */
export function cropShapeFor(artMode: ArtMode, layout: CardLayoutId, shape: CardShape): CardShape {
  const fits = fitsShapes(artMode, layout, shape);
  return TIGHTNESS.find((s) => fits.includes(s)) ?? shape;
}

type ArtPromptInput = Pick<CardDesign, "artBrief" | "artMode" | "layout" | "shape">;

/** A brief field as one sentence's worth: trimmed, without the full stop the template adds. */
function clause(text: string): string {
  return text.trim().replace(/[.\s]+$/, "");
}

/** The subject's lead phrase, for "the same …": up to the first comma, without a leading article. */
function subjectLead(subject: string): string {
  return clause(subject.split(",")[0]).replace(/^(a|an|the)\s+/i, "");
}

/** `card_art_v2`: the full art prompt for a validated design. */
export function assembleArtPrompt(design: ArtPromptInput): string {
  const { artBrief: b, artMode, layout, shape } = design;
  const L = layoutArtFor(layout, shape);
  const proportion = SHAPE_PROPORTION[shape];
  const cropShape = cropShapeFor(artMode, layout, shape);
  const ownShape = ART_MODE_FIT[artMode] === "own-shape";
  const framedOutline =
    ownShape && (shape === "oval" || shape === "circle" || shape === "arch")
      ? ` Let the border follow the ${shape === "arch" ? "arched" : shape} outline just inside its edge.`
      : "";
  const avoid = b.avoid.length ? ` Do not depict: ${b.avoid.join("; ")}.` : "";
  return [
    `Original artwork for the front of an invitation card, ${proportion === "5:7" ? "portrait 5:7" : "square 1:1"}, filling the entire canvas edge to edge.`,
    `${ART_MODE_DESCRIPTION[artMode]}`,
    `Subject: ${clause(b.subject)}.`,
    `Medium: ${clause(b.medium)}. Texture: ${clause(b.texture)}. Mood: ${clause(b.mood)}.`,
    `Palette: ${clause(b.palette.description)} (${b.palette.colors.join(", ")}).`,
    `Composition: ${L.composition} ${L.presence}`,
    `Outline: ${CROP_RULE[cropShape]}${framedOutline}`,
    ...(cropShape === shape && ownShape
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

/**
 * The prompt for regenerating a design's artwork at another shape, with the design's own earlier
 * artwork sent as the reference image (the only image the image model may receive).
 * The target shape must be one the design's layout supports: the host is never offered a shape
 * the layout does not support (`CLAUDE.md §5`).
 */
export function assembleShapeSwitchPrompt(design: ArtPromptInput, targetShape: CardShape): string {
  if (!layoutSupportsShape(design.layout, targetShape)) {
    throw new Error(`layout ${design.layout} does not support shape ${targetShape}`);
  }
  const switched = { ...design, shape: targetShape };
  return `${assembleArtPrompt(switched)}\nKeep the same subject, character, medium and palette as the reference artwork — the same ${subjectLead(design.artBrief.subject)} — rearranged for this new canvas and outline. Do not copy the reference's framing or the subject's size in it; recompose it to this canvas's composition, making the subject smaller where the composition gives it less of the card, and keep the clear area completely clear.`;
}
