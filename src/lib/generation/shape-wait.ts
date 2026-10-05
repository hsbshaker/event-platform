import type { CardShape } from "@/lib/card/shapes";

import { generationFailure, type GenerationFailure } from "./failure-copy";

/**
 * Words for the card's shape control and its wait (`docs/screen-spec.md` `design-panel`; `spec.md
 * §7.14`, §10): the shape's name, the one line before new artwork is made, the wait's plain line
 * (never a percentage), and what a switch's answer means for the surface. Pure and isomorphic.
 */

export const SHAPE_LABEL: Readonly<Record<CardShape, string>> = {
  rectangle: "Rectangle",
  "rounded-rectangle": "Rounded rectangle",
  arch: "Arch",
  oval: "Oval",
  square: "Square",
  circle: "Circle",
};

/** The shape with its article, for a sentence ("as an oval"). */
const SHAPE_PHRASE: Readonly<Record<CardShape, string>> = {
  rectangle: "a rectangle",
  "rounded-rectangle": "a rounded rectangle",
  arch: "an arch",
  oval: "an oval",
  square: "a square",
  circle: "a circle",
};

/** The wait's one line, while new artwork for the shape is made. */
export function shapeWaitLine(shape: CardShape): string {
  return `Painting your card as ${SHAPE_PHRASE[shape]}…`;
}

/** What the host is told before a shape that needs new artwork is made. */
export function shapeNotice(shape: CardShape): string {
  return `We'll paint new artwork of the same subject for ${SHAPE_PHRASE[shape]}, which takes about as long as a new design. Your current card stays as it is until it's ready.`;
}

/** Announced once the card shows the shape. */
export function shapeAppliedLine(shape: CardShape): string {
  return `Your card is now ${SHAPE_PHRASE[shape]}.`;
}

/** A swatch's accessible name: "Oval", or "Square — new artwork" when it must be painted. */
export function shapeSwatchLabel(shape: CardShape, instant: boolean): string {
  return instant ? SHAPE_LABEL[shape] : `${SHAPE_LABEL[shape]} — new artwork`;
}

export type AfterShapeSwitch =
  /** Applied now: show the card as it is. */
  | { kind: "applied" }
  /** New artwork is being made: follow the generation. */
  | { kind: "poll" }
  | { kind: "failed"; failure: GenerationFailure };

/** What a `switchCardShape` outcome means for the surface. */
export function afterShapeSwitch(outcome: string, generationId: string | null): AfterShapeSwitch {
  switch (outcome) {
    case "switched":
      return { kind: "applied" };
    case "started":
    case "existing":
    case "in_flight":
      // With nothing to follow, the answer is unreadable: the generic failure with a retry.
      return generationId ? { kind: "poll" } : { kind: "failed", failure: generationFailure(null) };
    case "busy":
    case "published":
    case "event_cap":
    case "host_cap":
    case "disabled":
    case "no_design":
    case "unsupported_shape":
      return { kind: "failed", failure: generationFailure(outcome) };
    default:
      return { kind: "failed", failure: generationFailure(null) };
  }
}
