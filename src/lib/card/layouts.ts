/**
 * The layout set `card_layouts_v7` (`docs/card-system.md §2.3`). The covers arrived in v6 (v4 and
 * v5, the art giving way by crop and plate, were withdrawn before release; owner decision
 * 2026-10-07).
 *
 * `card_layouts_v7` (owner decision 2026-10-07: generated cards are editable starting designs)
 * drops the legibility panel from the catalog — no new card gets one — and asks the artwork for a
 * *quieter* area for the words rather than a completely clear one: low detail, in whatever suits
 * the design (sky, a wall, brick, fabric, a gradient, a texture, the paper), with the subject's
 * main features kept out of it. Bands, zones and presence are those of `card_layouts_v6`. Panels
 * persisted with earlier artwork keep their stored geometry and are drawn as stored
 * (`card-data.ts`, `PanelFade` below); they are never re-resolved (`spec.md §32 #27`).
 *
 * `card_layouts_v1` was ported from the catalog validated in Phase 3 (`scripts/phase-3/catalog.mjs`),
 * with two fixes that landed before any card was made from it: `zoneFor` also checks the band's
 * bottom edge, and each layout's legibility-panel shape. `card_layouts_v2` carries the
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
 * ending at a soft-edged rounded rectangle (`PanelFade`). Bands, zones, composition and
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
  "cover-top",
  "cover-bottom",
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
   * For a picture above or below the words: the part of the canvas the composition keeps quieter
   * for the words, as a share of the canvas height measured from one edge. The composition names
   * the same share, and the band lies inside it (`layouts.test.ts`).
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
}

/**
 * How a persisted legibility panel gives way to the picture (`card_layouts_v3`–`v6`; no layout
 * makes one since `card_layouts_v7`, and stored panels are drawn as stored: `card-data.ts`
 * `CardPanel`, `card-record.server.ts` `zoneInk`). The paper is the panel colour throughout,
 * opaque over the panel's rectangle, then eased to transparent (`PANEL_FADE_STOPS`, `card-data.ts`):
 *
 * - `edge` — for words at one end of the card and the picture at the other: the paper runs the
 *   card's full width from the edge named by `from` to the far side of the text zone (plus the
 *   padding), then fades over `length` card units toward the picture;
 * - `wash` — for words in the middle: the paper covers the zone plus the padding and feathers out
 *   over `feather` card units on every side, with no visible boundary.
 */
export type PanelFade =
  { kind: "edge"; from: "top" | "bottom"; length: number } | { kind: "wash"; feather: number };

// Art instructions shared by several shapes. Since `card_layouts_v7` the words' part of the
// canvas is quieter, not empty: low detail in whatever suits the design, the subject's main
// features kept out of it (owner decision 2026-10-07). The 40% wording follows the half-card one.

const PICTURE_ABOVE_HALF = {
  composition:
    "Place the subject in the upper half of the canvas. Let the lower part of the canvas — the bottom 45% — be a quieter area for the invitation's words, with low detail: whatever suits this design, such as sky, a wall, brick, a floor, fabric, a soft gradient, a gentle texture, a solid colour or the paper itself. Keep the subject's main features out of it; supporting details may reach a little way in. Unless the design calls for one, there is no hard edge or separate band between it and the picture.",
  presence:
    "The subject is large and confident: it fills most of the upper half, with supporting elements that may trail a little way down the sides. It must not shrink to a small vignette floating in empty space.",
  clear: { edge: "bottom", percent: 45 },
} as const;

const PICTURE_ABOVE_40 = {
  composition:
    "Place the subject in the upper 40% of the canvas. Let the lower part of the canvas — the bottom 60% — be a quieter area for the invitation's words, with low detail: whatever suits this design, such as sky, a wall, brick, a floor, fabric, a soft gradient, a gentle texture, a solid colour or the paper itself. Keep the subject's main features out of it; supporting details may reach a little way in. Unless the design calls for one, there is no hard edge or separate band between it and the picture.",
  presence:
    "The subject is large and confident: it fills most of the upper 40%, with supporting elements that may trail a little way down the sides. It must not shrink to a small vignette floating in empty space.",
  clear: { edge: "bottom", percent: 60 },
} as const;

const PICTURE_BELOW_HALF = {
  composition:
    "Ground the subject along the bottom of the canvas, rising through the lower half. Let the upper part of the canvas — the top 45% — be a quieter area for the invitation's words, with low detail: whatever suits this design, such as sky, a wall, a ceiling, fabric, a soft gradient, a gentle texture, a solid colour or the paper itself. Keep the subject's main features out of it; supporting details may rise a little way in. Unless the design calls for one, there is no hard edge or separate band between it and the picture.",
  presence:
    "The subject is generous and fills most of the lower half, edge to edge where it suits it. It must not shrink to a small object in empty space.",
  clear: { edge: "top", percent: 45 },
} as const;

const PICTURE_BELOW_40 = {
  composition:
    "Ground the subject along the bottom of the canvas, rising through the lower 40%. Let the upper part of the canvas — the top 60% — be a quieter area for the invitation's words, with low detail: whatever suits this design, such as sky, a wall, a ceiling, fabric, a soft gradient, a gentle texture, a solid colour or the paper itself. Keep the subject's main features out of it; supporting details may rise a little way in. Unless the design calls for one, there is no hard edge or separate band between it and the picture.",
  presence:
    "The subject is generous and fills most of the lower 40%, edge to edge where it suits it. It must not shrink to a small object in empty space.",
  clear: { edge: "top", percent: 60 },
} as const;

const FRAME = {
  composition:
    "Arrange the artwork as a border, wreath, garland or frame running around the outer part of the canvas. Keep the central area (roughly the middle 60% of the width and the middle 45% of the height) quieter, for the invitation's words: background, paper or a gentle texture with low detail.",
  presence:
    "The frame is rich and substantial — a generous band of detail around all sides, not a thin line — unless the mode is minimal, where it is a refined, delicate border.",
} as const;

/** On square cards the text band is 260–740, so the quieter centre is stated as the middle 50%. */
const FRAME_SQUARE = {
  ...FRAME,
  composition: FRAME.composition.replace(
    "the middle 45% of the height",
    "the middle 50% of the height",
  ),
} as const;

const CORNER_CLUSTERS = {
  composition:
    "Cluster the artwork in at least two corners (for example top-left and bottom-right, or all four), flowing a little along the edges. Keep the centre of the canvas (roughly a vertical oval covering the middle 60% of the width and 45% of the height) quieter, with low detail, for the invitation's words.",
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

// The cover layouts (`card_layouts_v6`, owner decisions 2026-10-06): one full-bleed scene with the
// words set in a quieter stretch of it, as on a record sleeve or a poster. That stretch is the
// scene's own backdrop, not paper; the shares match the picture layouts' so the zones are theirs.
// The text never names the format: an image model asked for a cover or poster letters it.

const COVER_WORDS_ABOVE_HALF = {
  composition:
    "Fill the whole canvas edge to edge with one scene. Ground one or two bold subjects in the lower 55% of the canvas, large and close, free to run off the bottom and sides; let the top 45% be a quieter stretch of the same scene for the words — open sky, a wall or a deep field of colour, with low detail. Keep the subjects' main features out of it.",
  presence:
    "Bold and graphic: strong shapes, confident contrast and a few large elements given room to stand out. The subjects are big and close; nothing shrinks to a small vignette, and there is no border, frame or paper margin anywhere.",
  clear: { edge: "top", percent: 45 },
} as const;

const COVER_WORDS_ABOVE_40 = {
  composition:
    "Fill the whole canvas edge to edge with one scene. Ground one or two bold subjects in the lower 40% of the canvas, large and close, free to run off the bottom and sides; let the top 60% be a quieter stretch of the same scene for the words — open sky, a wall or a deep field of colour, with low detail. Keep the subjects' main features out of it.",
  presence: COVER_WORDS_ABOVE_HALF.presence,
  clear: { edge: "top", percent: 60 },
} as const;

const COVER_WORDS_BELOW_HALF = {
  composition:
    "Fill the whole canvas edge to edge with one scene. One or two bold subjects fill the upper 55% of the canvas, large and close, free to run off the top and sides; let the bottom 45% be a quieter stretch of the same scene for the words — a floor, still water or a deep field of colour, with low detail. Keep the subjects' main features out of it.",
  presence: COVER_WORDS_ABOVE_HALF.presence,
  clear: { edge: "bottom", percent: 45 },
} as const;

const COVER_WORDS_BELOW_40 = {
  composition:
    "Fill the whole canvas edge to edge with one scene. One or two bold subjects fill the upper 40% of the canvas, large and close, free to run off the top and sides; let the bottom 60% be a quieter stretch of the same scene for the words — a floor, still water or a deep field of colour, with low detail. Keep the subjects' main features out of it.",
  presence: COVER_WORDS_ABOVE_HALF.presence,
  clear: { edge: "bottom", percent: 60 },
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
  }),
  // A cover's bands and width are `art-bottom`'s and `art-top`'s, so its zones are theirs and no
  // slot limit or stored text changes (`entry-fit.server.ts`, `layouts.test.ts`).
  "cover-top": defineLayout({
    purpose:
      "A bold, full-bleed scene, like a record sleeve or a poster: the words sit in the calm sky or wall across the top, and one or two big subjects fill the rest.",
    artModes: ["illustration"],
    maxWidth: 760,
    art: {
      rectangle: { band: band(150, 600), ...COVER_WORDS_ABOVE_HALF },
      "rounded-rectangle": { band: band(150, 600), ...COVER_WORDS_ABOVE_HALF },
      square: { band: band(80, 560), ...COVER_WORDS_ABOVE_40 },
    },
  }),
  "cover-bottom": defineLayout({
    purpose:
      "A bold, full-bleed scene, like a record sleeve or a poster: one or two big subjects fill the top, and the words sit in the calm ground or colour across the bottom.",
    artModes: ["illustration"],
    maxWidth: 760,
    art: {
      rectangle: { band: band(800, 1250), ...COVER_WORDS_BELOW_HALF },
      "rounded-rectangle": { band: band(800, 1250), ...COVER_WORDS_BELOW_HALF },
      square: { band: band(440, 920), ...COVER_WORDS_BELOW_40 },
    },
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
