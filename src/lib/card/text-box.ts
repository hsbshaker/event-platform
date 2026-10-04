/**
 * The card's text layer: `TextBox` and `CardCustomization` (`spec.md §20.5`), and the pure
 * operations the card editor builds on (`docs/card-system.md §7`):
 *
 * - `seedCustomization` — the first edit's starting boxes: the generated layout, with a box for
 *   every fact slot the layout defines (an empty one renders nothing until its fact exists);
 * - `rebreakBox` / `rebreakFactBoxes` — re-break a box at its width after a change to its text,
 *   width, font, size, spacing or case, or after a fact edit;
 * - `carryWords` — lay the host's words out fresh on a new design or shape.
 *
 * Geometry is in card units (the card is 1000 wide), rotation in degrees, letter spacing in em of
 * the box's size (CSS `letter-spacing`), line height a multiple of the size. No model is called and
 * nothing here checks contrast or position: host edits are the host's (`spec.md §20.1`).
 */

import { layoutCard, type CardTextLayout, type LayoutCardInput } from "./layout-card";
import type { CardShape } from "./shapes";
import { breakLines } from "./text/line-break";
import type { FontMetricsResolver, FontRef, TextCase } from "./text/metrics";

export const WORDING_SLOTS = ["title", "invitationLine"] as const;
export type WordingSlot = (typeof WORDING_SLOTS)[number];

export const FACT_SLOTS = ["babyName", "hosts", "date", "time", "venue", "rsvpBy"] as const;
export type FactSlot = (typeof FACT_SLOTS)[number];

/** Every card slot, in the generated layout's stacking order (`docs/card-system.md §2.5`). */
export const CARD_SLOTS = [...WORDING_SLOTS, ...FACT_SLOTS] as const;
export type CardSlot = (typeof CARD_SLOTS)[number];

export type TextBoxSource =
  { kind: "wording"; slot: WordingSlot } | { kind: "fact"; slot: FactSlot } | { kind: "custom" };

export type TextAlign = "left" | "center" | "right";

export interface TextBox {
  id: string;
  source: TextBoxSource;
  /** Invitation line and custom boxes only: the title lives on `Event.title`, facts on the event. */
  text?: string;
  /** Top-left corner, card units. */
  x: number;
  y: number;
  /** Card units; lines are broken at this width. */
  width: number;
  /** Degrees, clockwise, about the box's centre. */
  rotation: number;
  font: FontRef;
  /** Card units. */
  size: number;
  /** `#RRGGBB`. */
  color: string;
  align: TextAlign;
  /** Em of `size`, as CSS `letter-spacing`. */
  letterSpacing: number;
  /** Multiple of `size`. */
  lineHeight: number;
  textCase: TextCase;
  /** Stacking order; higher draws above. */
  z: number;
  /** The stored line breaks, in the source text's own case; the renderer sets exactly these. */
  lines: string[];
}

export interface CardCustomization {
  eventId: string;
  cardDesignId: string;
  shape: CardShape;
  boxes: TextBox[];
  revision: number;
  updatedBy: string;
  updatedAt: string;
}

/** The event's current words for the card: the effective title and the facts, as display text. */
export type CardContent = Partial<Record<CardSlot, string | null>>;

/**
 * Measured width × (1 + FIT_SAFETY) must fit the box: the margin that absorbs browser rendering
 * differences (`docs/card-system.md §4.3`). Measurement agrees with Chromium within 0.03%; the rest
 * is headroom for other engines and sub-pixel rounding.
 */
export const FIT_SAFETY = 0.03;

/** The width lines are broken at for a box (or zone) of `width`. */
export function breakWidth(width: number): number {
  return width / (1 + FIT_SAFETY);
}

/** The text a box shows for the event's current content. */
export function boxText(box: TextBox, content: CardContent): string {
  switch (box.source.kind) {
    case "wording":
      return box.source.slot === "title" ? (content.title ?? "") : (box.text ?? "");
    case "fact":
      return content[box.source.slot] ?? "";
    case "custom":
      return box.text ?? "";
  }
}

function copyBox(box: TextBox): TextBox {
  return {
    ...box,
    source: { ...box.source },
    font: { ...box.font },
    lines: [...box.lines],
  };
}

/**
 * The starting boxes of a new customization: the generated layout, with a box for every fact slot
 * the layout defines. `layoutCard` emits a box for every slot it is given, empty ones included at
 * zero height; a fact slot without a box means the generated layer did not come from this layout,
 * and seeding it with an invented box would misplace it, so that throws.
 */
export function seedCustomization(
  generatedBoxes: readonly TextBox[],
  factSlots: readonly FactSlot[],
): TextBox[] {
  const ids = new Set<string>();
  for (const box of generatedBoxes) {
    if (ids.has(box.id)) throw new Error(`Duplicate text box id ${box.id}`);
    ids.add(box.id);
  }
  for (const slot of factSlots) {
    const found = generatedBoxes.some((b) => b.source.kind === "fact" && b.source.slot === slot);
    if (!found) throw new Error(`Generated layout has no box for fact slot ${slot}`);
  }
  return generatedBoxes.map((box, z) => ({ ...copyBox(box), z }));
}

export interface RebrokenBox {
  box: TextBox;
  /** A single word is wider than the box; it sits whole on its own line, never truncated. */
  overflow: boolean;
}

/**
 * Re-break one box at its width from the font's own metrics, with the generated card's rules
 * (`docs/card-system.md §7`). Returns a new box; the input is not mutated.
 */
export function rebreakBox(
  box: TextBox,
  content: CardContent,
  metrics: FontMetricsResolver,
): RebrokenBox {
  const face = metrics(box.font);
  const style = { size: box.size, letterSpacingEm: box.letterSpacing, textCase: box.textCase };
  const broken = breakLines(boxText(box, content), breakWidth(box.width), (line) =>
    face.measure(line, style),
  );
  return { box: { ...copyBox(box), lines: broken.lines }, overflow: broken.overflow };
}

/** Re-break every box showing `slot`, after that fact changed (`docs/card-system.md §7`). */
export function rebreakFactBoxes(
  boxes: readonly TextBox[],
  slot: FactSlot,
  content: CardContent,
  metrics: FontMetricsResolver,
): TextBox[] {
  return boxes.map((box) =>
    box.source.kind === "fact" && box.source.slot === slot
      ? rebreakBox(box, content, metrics).box
      : copyBox(box),
  );
}

export interface CarryWordsInput {
  /** The text layer of the card being switched from: its customization, else its generated layout. */
  from: readonly TextBox[];
  /** The event's current content (effective title and facts). */
  content: CardContent;
  /** The new card's generated-layout inputs: its zone, proportion, pairing, resolved ink, slots. */
  card: Omit<LayoutCardInput, "content" | "carried">;
}

/**
 * Lay the host's words out fresh on a new design or shape (`docs/card-system.md §7`, "Carrying
 * words to a fresh layout"; `spec.md §20.6`).
 *
 * The title, the invitation line and every added (custom) box keep their text and fonts from
 * `from`; `layoutCard` places them in the new card's zone — the generated slots first, then the
 * added boxes in their order as extra body lines — and sizes and breaks them as usual. Positions,
 * rotation and colours come from the new card. Added boxes that cannot all fit the zone at minimum
 * size are stacked below it, for the host to arrange. Facts come from `content`, in the new card's
 * own fact styling. An invitation line the host deleted stays absent.
 */
export function carryWords({ from, content, card }: CarryWordsInput): CardTextLayout {
  const wording = (slot: WordingSlot) =>
    from.find((b) => b.source.kind === "wording" && b.source.slot === slot);
  const title = wording("title");
  const invitation = wording("invitationLine");
  const added = from
    .filter((b) => b.source.kind === "custom")
    .map((b) => ({ id: b.id, text: b.text ?? "", font: { ...b.font } }));

  return layoutCard({
    ...card,
    content: { ...content, invitationLine: invitation?.text ?? null },
    carried: {
      ...(title ? { title: { ...title.font } } : {}),
      ...(invitation ? { invitationLine: { ...invitation.font } } : {}),
      added,
    },
  });
}
