/**
 * Test support: the legibility panels artwork persisted before `card_compiler_v7`, for the tests
 * and layout fixtures that prove stored panels are still read and drawn exactly as stored (owner
 * decision 2026-10-07; `spec.md §32 #27`). Imported by tests only: no new card gets a panel.
 *
 * `storedPanel` is a frozen copy of what `layouts.ts` `panelFor` returned under `card_layouts_v3`
 * to `card_layouts_v6`: for words at one end of the card (an `edge` fade), the card's full width
 * from that edge to the zone's far side plus 30 units, fading over 180 units toward the picture;
 * for words in the middle (a `wash`), the zone ± 40 × 30, feathered over 70 units; kept within the
 * canvas.
 */

import type { CardPanel } from "./card-data";
import { zoneFor, type CardLayoutId, type PanelFade } from "./layouts";
import { CARD_CANVAS, SHAPE_PROPORTION, type CardShape } from "./shapes";

const PAD_X = 40;
const PAD_Y = 30;

/** Each layout's stored fade (`card_layouts_v3`–`v6`). */
const STORED_FADE: Readonly<Record<CardLayoutId, PanelFade>> = {
  "art-top": { kind: "edge", from: "bottom", length: 180 },
  "art-bottom": { kind: "edge", from: "top", length: 180 },
  framed: { kind: "wash", feather: 70 },
  corners: { kind: "wash", feather: 70 },
  atmosphere: { kind: "wash", feather: 70 },
  "cover-top": { kind: "edge", from: "top", length: 180 },
  "cover-bottom": { kind: "edge", from: "bottom", length: 180 },
};

/** The panel a layout × shape's artwork stored before `card_compiler_v7`, without its colour. */
export function storedPanelShape(layout: CardLayoutId, shape: CardShape): Omit<CardPanel, "color"> {
  const zone = zoneFor(layout, shape);
  const fade = STORED_FADE[layout];
  const canvas = CARD_CANVAS[SHAPE_PROPORTION[shape]];
  let x0 = Math.max(0, zone.x - PAD_X);
  let y0 = Math.max(0, zone.y - PAD_Y);
  let x1 = Math.min(canvas.width, zone.x + zone.width + PAD_X);
  let y1 = Math.min(canvas.height, zone.y + zone.height + PAD_Y);
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

/** `storedPanelShape` in a paper colour, as `zoneInk` reads it back. */
export function storedPanel(layout: CardLayoutId, shape: CardShape, color: string): CardPanel {
  return { ...storedPanelShape(layout, shape), color };
}
