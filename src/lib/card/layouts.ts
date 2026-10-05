/**
 * The layout set `card_layouts_v3` (`docs/card-system.md §2.3`).
 *
 * `card_layouts_v1` was ported from the catalog validated in Phase 3 (`scripts/phase-3/catalog.mjs`),
 * with two fixes that landed before any card was made from it: `zoneFor` also checks the band's
 * bottom edge, and each layout's legibility-panel shape (`PanelSpec`). `card_layouts_v2` carries the
 * owner's fit decisions (`docs/CHANGELOG-v7.md`, "Phase 4 — fitting every detail on every card"),
 * proven by the layout fixtures with worst-case content in every layout × shape × pairing:
 * - on `square`, `oval` and `arch`, a picture above or below the words takes roughly 40% of the
 *   card and the text gets the other 60%: its own band, composition and presence per shape
 *   (`LayoutArt`);
 * - `art-top` and `art-bottom` no longer offer `circle`: circles keep the words in the middle;
 * - `framed` and `corners` take a 260–740 band on square cards, as `atmosphere` already did;
 * - free-text fact limits cover the baby name, hosts and venue only; the date, time and RSVP-by
 *   are formatted by code (`slots.ts`, `facts.ts`).
 * No card was made from `card_layouts_v1`, so the renderer carries `card_layouts_v2` onward only.
 *
 * `card_layouts_v3` changes only the legibility panel (owner verdict on round-three CU-08,
 * 2026-10-05: the panel read as a box laid over the picture): it fades into the artwork instead of
 * ending at a soft-edged rounded rectangle (`PanelSpec.fade`). Bands, zones, composition and
 * presence are those of `card_layouts_v2`. A panel persisted with `card_layouts_v2` artwork has no
 * `fade` and is still drawn as it was (`card-data.ts`); persisted ink and panels are never
 * re-resolved (`spec.md §32 #27`).
 *
 * A layout decides only where the words go and which regions the artwork leaves quiet. It is
 * never shown to hosts. Adding, removing or changing a layout, a supported shape or a band is a
 * `CARD_LAYOUT_SET_VERSION` bump plus a fixture run (`spec.md §32 #24`); changing composition or
 * presence text is also a `CARD_ART_PROMPT_VERSION` bump (`art-prompt.ts`).
 */

import { CARD_LAYOUT_SET_VERSION } from "@/lib/ai/versions";

import type { ArtMode } from "./art-modes";
import { CARD_CANVAS, CARD_SHAPES, insideTextSafe, SHAPE_PROPORTION } from "./shapes";
import type { CardProportion, CardShape } from "./shapes";
import type { CardSlotId } from "./slots";
import type { TextCase } from "./text/metrics";

export { CARD_LAYOUT_SET_VERSION };

export const CARD_LAYOUT_IDS = [
  "art-top",
  "art-bottom",
  "framed",
  "corners",
  "atmosphere",
] as const;

export type CardLayoutId = (typeof CARD_LAYOUT_IDS)[number];

export interface TextBand {
  top: number;
  bottom: number;
}

/**
 * What a layout asks of one shape: where the words go, and what the artwork does around them.
 * Shapes of one proportion with the same composition and presence share artwork
 * (`art-prompt.ts` `fitsShapes`).
 */
export interface LayoutArt {
  /** Vertical text band in card units. */
  band: TextBand;
  /** Where the artwork goes and what stays quiet (goes into the art prompt verbatim). */
  composition: string;
  /** How much presence the artwork wants (goes into the art prompt verbatim). */
  presence: string;
  /**
   * For a picture above or below the words: the part of the canvas the composition keeps
   * completely clear, as a share of the canvas height measured from one edge. The composition
   * names the same share, and the band lies inside it (`layouts.test.ts`).
   */
  clear?: { edge: "top" | "bottom"; percent: number };
}

export interface CardLayout {
  purpose: string;
  /** The shapes the layout supports, in `CARD_SHAPES` order: exactly the keys of `art`. */
  shapes: readonly CardShape[];
  artModes: readonly ArtMode[];
  /** Widest the text zone may be, in card units. */
  maxWidth: number;
  /** Per supported shape: the text band and the art instructions. */
  art: Readonly<Partial<Record<CardShape, LayoutArt>>>;
  /** The legibility panel's shape, used only when ink resolution needs it (`panelFor`). */
  panel: PanelSpec;
}

/**
 * How a layout's legibility panel gives way to the picture (`card_layouts_v3`). The paper is the
 * panel colour throughout, opaque over the panel's rectangle, then eased to transparent
 * (`PANEL_FADE_STOPS`, `card-data.ts`):
 *
 * - `edge` — for words at one end of the card and the picture at the other: the paper runs the
 *   card's full width from the edge named by `from` to the far side of the text zone (plus the
 *   padding), then fades over `length` card units toward the picture, so the background blends
 *   into paper rather than a box sitting on it;
 * - `wash` — for words in the middle: the paper covers the zone plus the padding and feathers out
 *   over `feather` card units on every side, with no visible boundary.
 */
export type PanelFade =
  { kind: "edge"; from: "top" | "bottom"; length: number } | { kind: "wash"; feather: number };

/**
 * A layout's legibility-panel shape (`docs/card-system.md §2.2`, §2.3, §4.2), in card units. The
 * opaque paper covers at least the text zone padded by `padX` across and `padY` down (the Phase 3
 * mock's padding, `scripts/phase-3/compose.mjs`), then fades (`fade`). It is drawn opaque, because
 * ink is resolved against the panel's own colour (`resolveInk`) and contrast is only what was
 * measured if nothing shows through behind the text: every text of the zone sits on the opaque
 * part (`layouts.test.ts`, the layout fixtures).
 *
 * `card_layouts_v2` drew the zone ± padding as a rounded rectangle (radius 28) with a soft edge
 * (`box-shadow: 0 0 40 20`); panels persisted with it keep those fields and render unchanged.
 */
export interface PanelSpec {
  /** Padding beyond the zone on the left and right (a `wash` panel; an `edge` spans the card). */
  padX: number;
  /** Padding beyond the zone above and below. */
  padY: number;
  fade: PanelFade;
}

/**
 * Fade lengths, card units. `edge`: 180, about an eighth of a 5:7 card's height. The opaque paper
 * ends at the boundary of the region the composition keeps clear or up to 10 units inside it, so
 * the fade runs 170–180 units into the picture's part of the card: long enough to read as the sky
 * or background turning to paper, short enough to leave most of the subject. `wash`: 140, enough
 * that no edge is seen, while reaching only the inner edge of a frame or corner cluster.
 */
const EDGE_FADE_LENGTH = 180;
const WASH_FEATHER = 140;

/** Words above, picture below: paper from the top edge down, fading toward the picture. */
const PANEL_FROM_TOP: PanelSpec = {
  padX: 40,
  padY: 30,
  fade: { kind: "edge", from: "top", length: EDGE_FADE_LENGTH },
};

/** Picture above, words below: paper from the bottom edge up, fading toward the picture. */
const PANEL_FROM_BOTTOM: PanelSpec = {
  padX: 40,
  padY: 30,
  fade: { kind: "edge", from: "bottom", length: EDGE_FADE_LENGTH },
};

/** Words in the middle: the padded zone, feathered out on every side. */
const PANEL_WASH: PanelSpec = {
  padX: 40,
  padY: 30,
  fade: { kind: "wash", feather: WASH_FEATHER },
};

// Art instructions shared by several shapes. The half-card wording for a picture above or below
// the words is Phase 3's, unchanged; the 40% wording keeps its tone.

const PICTURE_ABOVE_HALF = {
  composition:
    "Place the subject in the upper half of the canvas. Keep the lower part of the canvas — the bottom 45% — completely clear: nothing from the subject (feet, paws, tails, ribbons, fabric, shadows, foliage) crosses into it; only the paper, wash or a very soft continuation of the background texture.",
  presence:
    "The subject is large and confident: it fills most of the upper half, with supporting elements that may trail a little way down the sides. It must not shrink to a small vignette floating in empty space.",
  clear: { edge: "bottom", percent: 45 },
} as const;

const PICTURE_ABOVE_40 = {
  composition:
    "Place the subject in the upper 40% of the canvas. Keep the lower part of the canvas — the bottom 60% — completely clear: nothing from the subject (feet, paws, tails, ribbons, fabric, shadows, foliage) crosses into it; only the paper, wash or a very soft continuation of the background texture.",
  presence:
    "The subject is large and confident: it fills most of the upper 40%, with supporting elements that may trail a little way down the sides. It must not shrink to a small vignette floating in empty space.",
  clear: { edge: "bottom", percent: 60 },
} as const;

const PICTURE_BELOW_HALF = {
  composition:
    "Ground the subject along the bottom of the canvas, rising through the lower half. Keep the upper part of the canvas — the top 45% — completely clear: nothing from the subject (leaves, steam, branches, shadows) rises into it; only paper, wash or soft sky.",
  presence:
    "The subject is generous and fills most of the lower half, edge to edge where it suits it. It must not shrink to a small object in empty space.",
  clear: { edge: "top", percent: 45 },
} as const;

const PICTURE_BELOW_40 = {
  composition:
    "Ground the subject along the bottom of the canvas, rising through the lower 40%. Keep the upper part of the canvas — the top 60% — completely clear: nothing from the subject (leaves, steam, branches, shadows) rises into it; only paper, wash or soft sky.",
  presence:
    "The subject is generous and fills most of the lower 40%, edge to edge where it suits it. It must not shrink to a small object in empty space.",
  clear: { edge: "top", percent: 60 },
} as const;

const FRAME = {
  composition:
    "Arrange the artwork as a border, wreath, garland or frame running around the outer part of the canvas. Keep the central area (roughly the middle 60% of the width and the middle 45% of the height) calm and open: soft background only.",
  presence:
    "The frame is rich and substantial — a generous band of detail around all sides, not a thin line — unless the mode is minimal, where it is a refined, delicate border.",
} as const;

/** On square cards the text band is 260–740, so the calm centre is stated as the middle 50%. */
const FRAME_SQUARE = {
  ...FRAME,
  composition: FRAME.composition.replace(
    "the middle 45% of the height",
    "the middle 50% of the height",
  ),
} as const;

const CORNER_CLUSTERS = {
  composition:
    "Cluster the artwork in at least two corners (for example top-left and bottom-right, or all four), flowing a little along the edges. Keep the centre of the canvas (roughly a vertical oval covering the middle 60% of the width and 45% of the height) calm and open.",
  presence:
    "Each corner cluster is substantial — roughly a quarter to a third of the card's width and height — and full of detail. Do not reduce the artwork to a few small props around an empty field.",
} as const;

const CORNER_CLUSTERS_SQUARE = {
  ...CORNER_CLUSTERS,
  composition: CORNER_CLUSTERS.composition.replace(
    "and 45% of the height",
    "and 50% of the height",
  ),
} as const;

const WASH = {
  composition:
    "Fill the whole canvas with a soft wash, scenery or texture. Keep contrast low and detail quiet through the centre of the canvas, where text will sit.",
  presence:
    "The atmosphere covers the whole card with real depth and variation; it is never a flat, empty field.",
} as const;

const band = (top: number, bottom: number): TextBand => ({ top, bottom });

function defineLayout(def: Omit<CardLayout, "shapes">): CardLayout {
  return { ...def, shapes: CARD_SHAPES.filter((shape) => def.art[shape] !== undefined) };
}

export const CARD_LAYOUTS: Readonly<Record<CardLayoutId, CardLayout>> = {
  "art-top": defineLayout({
    purpose: "A subject anchors the top of the card; the text sits calmly beneath it.",
    artModes: ["illustration"],
    maxWidth: 760,
    art: {
      rectangle: { band: band(800, 1250), ...PICTURE_ABOVE_HALF },
      "rounded-rectangle": { band: band(800, 1250), ...PICTURE_ABOVE_HALF },
      arch: { band: band(600, 1260), ...PICTURE_ABOVE_40 },
      oval: { band: band(600, 1180), ...PICTURE_ABOVE_40 },
      square: { band: band(440, 920), ...PICTURE_ABOVE_40 },
    },
    panel: PANEL_FROM_BOTTOM,
  }),
  "art-bottom": defineLayout({
    purpose:
      "A grounded subject (still life, scenery, a gathering of objects) holds the bottom; text sits above.",
    artModes: ["illustration"],
    maxWidth: 760,
    art: {
      rectangle: { band: band(150, 600), ...PICTURE_BELOW_HALF },
      "rounded-rectangle": { band: band(150, 600), ...PICTURE_BELOW_HALF },
      arch: { band: band(240, 800), ...PICTURE_BELOW_40 },
      oval: { band: band(220, 800), ...PICTURE_BELOW_40 },
      square: { band: band(80, 560), ...PICTURE_BELOW_40 },
    },
    panel: PANEL_FROM_TOP,
  }),
  framed: defineLayout({
    purpose: "A border, wreath, garland or frame surrounds a quiet centre that holds the text.",
    artModes: ["framed", "minimal"],
    maxWidth: 620,
    art: {
      rectangle: { band: band(400, 1000), ...FRAME },
      "rounded-rectangle": { band: band(400, 1000), ...FRAME },
      arch: { band: band(400, 1000), ...FRAME },
      oval: { band: band(400, 1000), ...FRAME },
      square: { band: band(260, 740), ...FRAME_SQUARE },
      circle: { band: band(260, 740), ...FRAME_SQUARE },
    },
    panel: PANEL_WASH,
  }),
  corners: defineLayout({
    purpose: "Motifs cluster in the corners and along the edges; the centre stays open for text.",
    artModes: ["illustration", "framed"],
    maxWidth: 640,
    art: {
      rectangle: { band: band(420, 980), ...CORNER_CLUSTERS },
      "rounded-rectangle": { band: band(420, 980), ...CORNER_CLUSTERS },
      square: { band: band(260, 740), ...CORNER_CLUSTERS_SQUARE },
    },
    panel: PANEL_WASH,
  }),
  atmosphere: defineLayout({
    purpose: "A soft full-bleed wash, scenery or texture carries the mood; no discrete subject.",
    artModes: ["atmosphere", "minimal"],
    maxWidth: 680,
    art: {
      rectangle: { band: band(400, 1000), ...WASH },
      "rounded-rectangle": { band: band(400, 1000), ...WASH },
      arch: { band: band(400, 1000), ...WASH },
      oval: { band: band(400, 1000), ...WASH },
      square: { band: band(260, 740), ...WASH },
      circle: { band: band(260, 740), ...WASH },
    },
    panel: PANEL_WASH,
  }),
};

export function layoutSupportsShape(layout: CardLayoutId, shape: CardShape): boolean {
  return CARD_LAYOUTS[layout].shapes.includes(shape);
}

export function artModeCompatible(layout: CardLayoutId, artMode: ArtMode): boolean {
  return CARD_LAYOUTS[layout].artModes.includes(artMode);
}

/** The layout's band and art instructions for a shape. Throws if the layout does not support it. */
export function layoutArtFor(layout: CardLayoutId, shape: CardShape): LayoutArt {
  const art = CARD_LAYOUTS[layout].art[shape];
  if (!art) throw new Error(`layout ${layout} does not support shape ${shape}`);
  return art;
}

export interface CardZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The legibility panel behind a zone, in card units: the rectangle the paper covers opaque, and
 * how it fades (`fade`). A panel persisted with `card_layouts_v2` artwork has no `fade`: it is a
 * rounded rectangle (`radius`) with a soft edge (`softEdge`, CSS `box-shadow: 0 0 blur spread`).
 * A faded panel has neither: `radius` 0 and `softEdge` zero.
 */
export interface CardPanelShape {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  softEdge: { spread: number; blur: number };
  fade?: PanelFade;
}

/**
 * The legibility panel for the layout's zone in this shape, kept within the canvas: for an `edge`
 * fade, the card's full width from the `from` edge to the zone's far side plus `padY`; for a
 * `wash`, the zone expanded by the padding. The fade lies outside this rectangle and the text
 * zone inside it. Where the outline is curved the panel is clipped by the outline, as everything
 * on the card is: the renderer masks the whole card, panel included (`outline.ts`). The zone lies
 * in the shape's text-safe area, so the clipped panel still backs all of it (`layouts.test.ts`).
 */
export function panelFor(layout: CardLayoutId, shape: CardShape): CardPanelShape {
  const zone = zoneFor(layout, shape);
  const { padX, padY, fade } = CARD_LAYOUTS[layout].panel;
  const canvas = CARD_CANVAS[SHAPE_PROPORTION[shape]];
  let x0 = Math.max(0, zone.x - padX);
  let y0 = Math.max(0, zone.y - padY);
  let x1 = Math.min(canvas.width, zone.x + zone.width + padX);
  let y1 = Math.min(canvas.height, zone.y + zone.height + padY);
  if (fade.kind === "edge") {
    x0 = 0;
    x1 = canvas.width;
    if (fade.from === "top") y0 = 0;
    else y1 = canvas.height;
  }
  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    radius: 0,
    softEdge: { spread: 0, blur: 0 },
    fade: { ...fade },
  };
}

/**
 * The widest centred zone for the layout's text band that stays inside the shape's text-safe
 * area, in card units. Throws if the layout does not support the shape.
 */
export function zoneFor(layout: CardLayoutId, shape: CardShape): CardZone {
  const { band } = layoutArtFor(layout, shape);
  const def = CARD_LAYOUTS[layout];
  const w = CARD_CANVAS[SHAPE_PROPORTION[shape]].width;
  let half = def.maxWidth / 2;
  // Every 4 units down the band, and its bottom edge itself, which the step may not land on.
  const rows: number[] = [];
  for (let y = band.top; y < band.bottom; y += 4) rows.push(y);
  rows.push(band.bottom);
  for (const y of rows) {
    while (
      half > 40 &&
      !(insideTextSafe(shape, w / 2 - half, y) && insideTextSafe(shape, w / 2 + half, y))
    ) {
      half -= 2;
    }
  }
  return { x: w / 2 - half, y: band.top, width: half * 2, height: band.bottom - band.top };
}

export type SlotGroup = "title" | "invitation" | "details" | "added";

export interface SlotSpec {
  role: "display" | "body";
  group: SlotGroup;
  /** Starting size per proportion, card units. */
  max: Record<CardProportion, number>;
  /** Smallest size, card units. */
  min: number;
  lineHeight: number;
  letterSpacingEm: number;
  textCase: TextCase;
  /** Most lines this slot may take; `null` when only the zone's height bounds it. */
  maxLines: number | null;
  /** Space above the slot, in em of its own size, when it follows a slot of another group. */
  gapBeforeEm: number;
}

const TITLE: SlotSpec = {
  role: "display",
  group: "title",
  max: { "5:7": 104, "1:1": 92 },
  min: 48,
  lineHeight: 1.05,
  letterSpacingEm: 0,
  textCase: "none",
  maxLines: 3,
  gapBeforeEm: 0,
};

const INVITATION: SlotSpec = {
  role: "body",
  group: "invitation",
  max: { "5:7": 32, "1:1": 32 },
  min: 22,
  lineHeight: 1.3,
  letterSpacingEm: 0.02,
  textCase: "none",
  maxLines: null,
  gapBeforeEm: 0.9,
};

const DETAIL: SlotSpec = {
  role: "body",
  group: "details",
  max: { "5:7": 24, "1:1": 24 },
  min: 18,
  lineHeight: 1.45,
  letterSpacingEm: 0.06,
  textCase: "uppercase",
  maxLines: null,
  gapBeforeEm: 1.3,
};

/**
 * The slot specs of `card_layouts_v3`, unchanged from `card_layouts_v1` (`docs/card-system.md
 * §2.3`): in this version one table
 * serves every layout and shape. They are layout-set data, so changing one is a
 * `CARD_LAYOUT_SET_VERSION` bump. From the Phase 3 mock: title 104 (5:7) or 92 (1:1) down to 48, line height 1.05,
 * at most 3 lines; invitation line 32 → 22, 1.3, letter spacing .02em, 0.9em above; details 24 → 18,
 * 1.45, uppercase, .06em, 1.3em above the group and nothing between its lines. Phase 3 set only the
 * date, time and venue as details; the baby name, hosts and RSVP-by join that group here.
 */
export const CARD_SLOT_SPECS: Readonly<Record<CardSlotId, SlotSpec>> = {
  title: TITLE,
  invitationLine: INVITATION,
  babyName: DETAIL,
  hosts: DETAIL,
  date: DETAIL,
  time: DETAIL,
  venue: DETAIL,
  rsvpBy: DETAIL,
};

/** Text the host added, carried to a fresh layout as extra body lines in the invitation line's style. */
export const ADDED_SLOT_SPEC: SlotSpec = { ...INVITATION, group: "added" };
