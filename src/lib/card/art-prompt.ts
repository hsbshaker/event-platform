/**
 * Art prompt assembly, `card_art_v7` (`docs/model-contracts.md §7.1`, `docs/card-system.md §2.4`).
 *
 * The art prompt is assembled by code from the validated art brief plus the layout and shape
 * rules; a model never writes it and the raw host prompt is never part of it (`spec.md §32 #17`).
 * `card_art_v1` was ported faithfully from the catalog validated in Phase 3
 * (`scripts/phase-3/catalog.mjs`, `run.mjs stageSwitch`). `card_art_v2` takes the composition and
 * presence from the layout's entry for the shape (`card_layouts_v2`: a picture above or below the
 * words takes 40% of a square, oval or arch card), and an artwork fits only the shapes painted
 * with the same instructions, so its crop rule is the tightest outline among those. `card_art_v3`
 * (owner decisions, 2026-10-04) adds the brief's rendering family and aesthetic mood as a
 * `Rendering:` line (`renderings.ts`) and drops the wording that pushed every card toward paint: the art modes no
 * longer say "painted", the corner line says "carry" rather than "paint", and the mockup line no
 * longer reads as "never photographic". `card_art_v4` (owner decision, 2026-10-05) adds one
 * composition line to a repaint of art that has a subject (`repaintComposition`). `card_art_v5`
 * (Phase 5d, owner decisions 2026-10-05) adds the revision prompt: a change to part of a card is an
 * edit of that card's artwork, framed as a revision of the reference (`assembleRevisionPrompt`).
 * `card_art_v6` carried the cover layouts' composition (`card_layouts_v6`). `card_art_v7` (owner
 * decision 2026-10-07: generated cards are editable starting designs) asks for a *quieter* area for
 * the words — low detail, not necessarily empty, white or flat — in the layouts' composition
 * (`card_layouts_v7`) and in the line on the text area below, and its repaint line asks for a
 * generous quieter part of the picture in every art mode (`REPAINT_COMPOSITION`).
 * Changing any sentence is a `CARD_ART_PROMPT_VERSION` bump.
 */

import { CARD_ART_PROMPT_VERSION } from "@/lib/ai/versions";

import { ART_MODE_FIT } from "./art-modes";
import type { ArtMode } from "./art-modes";
import type { CardDesign } from "./design";
import { CARD_LAYOUTS, layoutArtFor, layoutSupportsShape } from "./layouts";
import type { CardLayoutId } from "./layouts";
import { RENDERING_ART_PROMPT } from "./renderings";
import { SHAPE_PROPORTION } from "./shapes";
import type { CardProportion, CardShape } from "./shapes";

export { CARD_ART_PROMPT_VERSION };

/** Raster size requested from the image model, per proportion. */
export const ART_RASTER_SIZE: Readonly<Record<CardProportion, string>> = {
  "5:7": "1440x2016",
  "1:1": "1440x1440",
};

/** Also the art-mode catalog the card-design call is given (`src/lib/ai/requests.ts`), as in Phase 3. */
export const ART_MODE_DESCRIPTION: Readonly<Record<ArtMode, string>> = {
  illustration: "A recognizable, specific subject anchors the card, made with care.",
  framed:
    "The artwork is a border, wreath, garland, corner treatment or frame around the text area.",
  atmosphere: "No discrete subject: a soft thematic wash, scenery or texture across the card.",
  minimal:
    "Restrained: a refined border, pattern or surface texture only, but crafted and visible — never a blank card.",
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

/** The full art prompt for a validated design (since `card_art_v3`). */
export function assembleArtPrompt(design: ArtPromptInput): string {
  const { artBrief: b, artMode, layout, shape } = design;
  // A brief persisted before `card_design_schema_v2` has no rendering: refuse it rather than
  // paint with a missing instruction (callers assemble before any image request).
  const rendering = Object.hasOwn(RENDERING_ART_PROMPT, b.rendering)
    ? RENDERING_ART_PROMPT[b.rendering]
    : null;
  if (rendering === null) throw new Error(`art brief has no known rendering (${b.rendering})`);
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
    `Rendering: ${rendering} Aesthetic: ${clause(b.aesthetic)}.`,
    `Medium: ${clause(b.medium)}. Texture: ${clause(b.texture)}. Mood: ${clause(b.mood)}.`,
    `Palette: ${clause(b.palette.description)} (${b.palette.colors.join(", ")}).`,
    `Composition: ${L.composition} ${L.presence}`,
    `Outline: ${CROP_RULE[cropShape]}${framedOutline}`,
    ...(cropShape === shape && ownShape
      ? []
      : [
          "The trimming is done later by the printer: carry the background all the way into every corner and edge of the canvas. Do not draw the outline itself, a vignette, a border line or blank corners.",
        ]),
    "The quieter area will carry the invitation's words, set later as type: keep its detail low enough for words to read clearly over it. It need not be empty, white or flat, and the rest of the card should not be empty.",
    "Absolutely no text of any kind: no letters, words, numbers, initials, monograms, signatures, labels, logos, wordmarks, crests or watermarks anywhere in the image.",
    "This is the artwork itself, filling the canvas — not a mockup: no photograph of a printed card, no envelope, table edge, hands, shadows of paper or frame around the canvas. The artwork may itself be a photograph when the rendering says so.",
    `An original style.${avoid}`,
  ].join("\n");
}

/**
 * The line a repaint adds (`card_art_v7`). A repaint follows an artwork with no workable space for
 * the words on some shape it fits (`text-space.ts`, `docs/card-system.md §3`): at most one per
 * artwork. The line asks, in every art mode, for a generous quieter part of the picture, since an
 * atmosphere or a minimal texture can be as busy under the words as a subject. It never refers to
 * an earlier image: on a shape switch the only image the model sees is the reference it must keep.
 *
 * `card_art_v4`–`v6` added it only for art with a subject or a border, and asked for the whole
 * subject to stay entirely outside a calm area that held only background.
 */
export const REPAINT_COMPOSITION =
  "Leave a generous, quieter part of the picture for the invitation's words — low detail, such as open sky, a wall, a plain surface or the paper — and keep the subject's main features out of it.";

/** An art prompt as a repaint sends it: the prompt, then `REPAINT_COMPOSITION`. */
export function withRepaintComposition(prompt: string): string {
  return `${prompt}\n${REPAINT_COMPOSITION}`;
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
  return `${assembleArtPrompt(switched)}\nKeep the same subject, character, rendering, medium and palette as the reference artwork — the same ${subjectLead(design.artBrief.subject)} — rearranged for this new canvas and outline. Do not copy the reference's framing or the subject's size in it; recompose it to this canvas's composition, making the subject smaller where the composition gives it less of the card, and keep the quieter area for the words quiet.`;
}

/**
 * The framing of a revision (`card_art_v5`, `docs/model-contracts.md §7.2`; the sentence the Phase 5
 * refine experiment validated): a change to part of a card is sent to the edits endpoint with the
 * changed card's artwork as the reference, and the assembled art prompt after this line.
 */
export const REVISION_PREFIX =
  "Revise the reference image to match this description, keeping its composition, subject placement, rendering, lighting and palette wherever the description does not change them:";

/**
 * The prompt for a change to part of a card (`refinement: "part"`): the revised design's full art
 * prompt, framed as a revision of the reference — the event's own artwork of the card being changed,
 * the only image the image model receives (`spec.md §7.6a` rule 3). Unlike a shape switch it says
 * nothing about keeping the subject: the description says what stays and what changes. A repaint
 * adds the composition line after it (`withRepaintComposition`).
 */
export function assembleRevisionPrompt(design: ArtPromptInput): string {
  return `${REVISION_PREFIX}\n${assembleArtPrompt(design)}`;
}
