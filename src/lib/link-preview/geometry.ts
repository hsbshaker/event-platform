/**
 * Where things sit in a link-preview image: a 1200 × 630 PNG (the Open Graph size iMessage, Slack
 * and the rest also crop well) on the house background.
 */

import { CARD_CANVAS, SHAPE_PROPORTION, type CardShape } from "@/lib/card/shapes";

export const PREVIEW_SIZE = { width: 1200, height: 630 } as const;

/**
 * The card's height in the image, px: 35px of house background above and below. A portrait card
 * is then 400 × 560 (0.4 px per card unit), a square one 560 × 560 (0.56).
 */
export const CARD_PREVIEW_HEIGHT = 560;

/** The card's box in the image, px: centred. */
export function cardPreviewBox(shape: CardShape): {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pixels per card unit. */
  scale: number;
} {
  const canvas = CARD_CANVAS[SHAPE_PROPORTION[shape]];
  const scale = CARD_PREVIEW_HEIGHT / canvas.height;
  const width = canvas.width * scale;
  return {
    x: (PREVIEW_SIZE.width - width) / 2,
    y: (PREVIEW_SIZE.height - CARD_PREVIEW_HEIGHT) / 2,
    width,
    height: CARD_PREVIEW_HEIGHT,
    scale,
  };
}

/**
 * The envelope's width in the image, px: it is 10:7, so 448 tall, centred on the dusk field, with
 * room under it for its light pool.
 */
export const ENVELOPE_PREVIEW_WIDTH = 640;
