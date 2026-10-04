/**
 * The generated card's text layer (`docs/card-system.md §4.3`, §6.1): the boxes `InvitationCard`
 * renders for a design with no customization, from the layout's zone for the shape, the design's
 * typography pairing, the event's current content and the zone's resolved ink, laid out by
 * `layoutCard` with the curated fonts' own metrics.
 *
 * A generated card whose text does not fit is a failure, never a card (`spec.md §31`, "Card
 * design, artwork and compiler"; `docs/development-plan.md` Phase 4): an `overflow` layout, or one
 * with characters its fonts lack (their stored widths would not be what a browser draws), throws
 * `CardTextLayoutError` and is never returned for rendering.
 */

import "server-only";

import { layoutCard, pairingFaces, type CardTextLayout } from "./layout-card";
import { zoneFor, type CardLayoutId } from "./layouts";
import { proportionOf, type CardShape } from "./shapes";
import type { CardContent, TextBox } from "./text-box";
import { curatedMetricsResolver } from "./text/curated-fonts";
import type { TypographyPairingId } from "./typography";

export type CardTextLayoutFailure = "overflow" | "missing-characters";

/** The generated text layer cannot be rendered; `layout` is kept for diagnostics only. */
export class CardTextLayoutError extends Error {
  readonly reasons: readonly CardTextLayoutFailure[];
  readonly layout: CardTextLayout;

  constructor(reasons: readonly CardTextLayoutFailure[], layout: CardTextLayout, context: string) {
    const parts = reasons.map((reason) =>
      reason === "overflow"
        ? "the text does not fit its zone at minimum sizes"
        : `characters missing from the fonts (${Object.entries(layout.missingCharacters)
            .map(([id, chars]) => `${id}: ${chars.join(" ")}`)
            .join("; ")})`,
    );
    super(`Generated card text for ${context} cannot be rendered: ${parts.join("; ")}`);
    this.name = "CardTextLayoutError";
    this.reasons = reasons;
    this.layout = layout;
  }
}

export interface GeneratedTextLayerInput {
  layout: CardLayoutId;
  shape: CardShape;
  pairing: TypographyPairingId;
  /** The event's current words: the effective title, the invitation line and the facts. */
  content: CardContent;
  /** The zone's resolved ink for this artwork and shape (`resolveInk`), `#RRGGBB`. */
  ink: string;
}

/**
 * The generated card's text boxes. Throws `CardTextLayoutError` when they cannot be rendered as
 * laid out, and a plain error for an unsupported layout × shape or an invalid ink.
 */
export async function generatedTextLayer(input: GeneratedTextLayerInput): Promise<TextBox[]> {
  const { layout, shape, pairing, content, ink } = input;
  const zone = zoneFor(layout, shape);
  const faces = pairingFaces(pairing);
  const metrics = await curatedMetricsResolver([faces.display, faces.body]);
  const result = layoutCard({
    zone,
    proportion: proportionOf(shape),
    pairing: faces,
    content,
    ink,
    metrics,
  });
  const reasons: CardTextLayoutFailure[] = [];
  if (result.overflow) reasons.push("overflow");
  if (Object.keys(result.missingCharacters).length > 0) reasons.push("missing-characters");
  if (reasons.length > 0) {
    throw new CardTextLayoutError(reasons, result, `${layout}/${shape}/${pairing}`);
  }
  return result.boxes;
}
