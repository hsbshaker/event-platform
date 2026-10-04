/**
 * The layout set `card_layouts_v1` (`docs/card-system.md §2.3`), ported from the catalog validated
 * in Phase 3 (`scripts/phase-3/catalog.mjs`). One fix since: `zoneFor` also checks the band's
 * bottom edge, which the catalog's 4-unit step could miss, so a zone narrows by a few units where a
 * curved outline pinches there (no card had been made from the set yet).
 *
 * A layout decides only where the words go and which regions the artwork leaves quiet. It is
 * never shown to hosts. Adding, removing or changing a layout, a supported shape or a band is a
 * `CARD_LAYOUT_SET_VERSION` bump plus a fixture run (`spec.md §32 #24`).
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

export interface CardLayout {
  purpose: string;
  shapes: readonly CardShape[];
  artModes: readonly ArtMode[];
  /** Vertical text band in card units, per proportion. */
  band: Readonly<Record<CardProportion, TextBand>>;
  /** Widest the text zone may be, in card units. */
  maxWidth: number;
  /** Where the artwork goes and what stays quiet (goes into the art prompt verbatim). */
  composition: string;
  /** How much presence the artwork wants (goes into the art prompt verbatim). */
  presence: string;
}

export const CARD_LAYOUTS: Readonly<Record<CardLayoutId, CardLayout>> = {
  "art-top": {
    purpose: "A subject anchors the top of the card; the text sits calmly beneath it.",
    shapes: CARD_SHAPES,
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
    shapes: CARD_SHAPES,
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
    shapes: CARD_SHAPES,
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
    shapes: CARD_SHAPES,
    artModes: ["atmosphere", "minimal"],
    band: { "5:7": { top: 400, bottom: 1000 }, "1:1": { top: 260, bottom: 740 } },
    maxWidth: 680,
    composition:
      "Fill the whole canvas with a soft wash, scenery or texture. Keep contrast low and detail quiet through the centre of the canvas, where text will sit.",
    presence:
      "The atmosphere covers the whole card with real depth and variation; it is never a flat, empty field.",
  },
};

export function layoutSupportsShape(layout: CardLayoutId, shape: CardShape): boolean {
  return CARD_LAYOUTS[layout].shapes.includes(shape);
}

export function artModeCompatible(layout: CardLayoutId, artMode: ArtMode): boolean {
  return CARD_LAYOUTS[layout].artModes.includes(artMode);
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
  if (!layoutSupportsShape(layout, shape)) {
    throw new Error(`layout ${layout} does not support shape ${shape}`);
  }
  const def = CARD_LAYOUTS[layout];
  const proportion = SHAPE_PROPORTION[shape];
  const band = def.band[proportion];
  const w = CARD_CANVAS[proportion].width;
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
 * The slot specs of `card_layouts_v1` (`docs/card-system.md §2.3`): in this version one table
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
