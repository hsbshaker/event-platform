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

import { breakWidth, FIT_SAFETY } from "./fit";
import { layoutCard, type CardTextLayout, type LayoutCardInput } from "./layout-card";
import type { CardShape } from "./shapes";
import { CARD_SLOT_IDS, type CardSlotId, type FactSlotId, type WordingSlotId } from "./slots";
import { breakLines, linesSpell, type BrokenLines } from "./text/line-break";
import type { FontMetricsResolver, FontRef, TextCase } from "./text/metrics";

export type TextBoxSource =
  | { kind: "wording"; slot: WordingSlotId }
  | { kind: "fact"; slot: FactSlotId }
  | { kind: "custom" };

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
export type CardContent = Partial<Record<CardSlotId, string | null>>;

export { breakWidth, FIT_SAFETY };

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
  factSlots: readonly FactSlotId[],
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

/** What a box's lines depend on, besides its text (`docs/card-system.md §7`). */
export type BoxBreakStyle = Pick<TextBox, "width" | "font" | "size" | "letterSpacing" | "textCase">;

/**
 * The line breaking for an edited box (`docs/card-system.md §7`, "Line breaking for edited boxes";
 * `spec.md §20.4`): one deterministic function from a box's text, width, font, size, letter spacing
 * and case to its stored `lines`, with the generated card's rules (`text/line-break.ts`, §4.3): the
 * fewest lines; a break inside a word only just after a hyphen between letters, with a space
 * always ranked above it at the same line count; then no stranded short word; then no one-word last
 * line where another break exists; then even lines; a hard break wherever the host typed one.
 * Measured from the face's own metrics (`text/metrics.ts`: the curated fonts, or the font store's)
 * at `breakWidth(width)`, the margin `layoutCard` uses, so the server and every browser agree.
 *
 * A piece wider than the box sits whole on its own line and sets `overflow`; nothing is truncated.
 * Lines are in the text's own case (the case is applied when measuring and when drawing).
 * `metrics` throws for a face it does not have (`UnknownCardFontError`): a box is never measured
 * with another face.
 */
export function breakBoxText(
  text: string,
  style: BoxBreakStyle,
  metrics: FontMetricsResolver,
): BrokenLines {
  if (!(Number.isFinite(style.size) && style.size > 0)) {
    throw new Error(`Invalid font size ${style.size}`);
  }
  if (!Number.isFinite(style.letterSpacing)) {
    throw new Error(`Invalid letter spacing ${style.letterSpacing}`);
  }
  const face = metrics(style.font);
  const measure = {
    size: style.size,
    letterSpacingEm: style.letterSpacing,
    textCase: style.textCase,
  };
  return breakLines(text, breakWidth(style.width), (line) => face.measure(line, measure));
}

/** Whether two boxes break a text alike: the same width, font, size, letter spacing and case. */
export function sameBreakStyle(a: BoxBreakStyle, b: BoxBreakStyle): boolean {
  return (
    a.width === b.width &&
    a.size === b.size &&
    a.letterSpacing === b.letterSpacing &&
    a.textCase === b.textCase &&
    a.font.family === b.font.family &&
    a.font.weight === b.font.weight &&
    a.font.italic === b.font.italic
  );
}

/**
 * Re-break one box at its width from the font's own metrics (`breakBoxText`). Returns a new box;
 * the input is not mutated.
 */
export function rebreakBox(
  box: TextBox,
  content: CardContent,
  metrics: FontMetricsResolver,
): RebrokenBox {
  const broken = breakBoxText(boxText(box, content), box, metrics);
  return { box: { ...copyBox(box), lines: broken.lines }, overflow: broken.overflow };
}

/** Whether a box's text comes from the event — the title and the facts — rather than the box. */
export function isLinkedBox(box: TextBox): boolean {
  return (
    box.source.kind === "fact" || (box.source.kind === "wording" && box.source.slot === "title")
  );
}

/**
 * The boxes with every linked box's (the title's and the facts') lines matching `content`. A box
 * whose stored lines already spell its text (`linesSpell`) keeps them exactly, as the host saw
 * them; any other is re-broken at its width (`breakBoxText`): its fact or the title changed since
 * it was broken, or `content` is not what it was broken for (a placeholder in Creation Mode;
 * nothing, for a guest, where the host has not saved the fact). The invitation line and added
 * boxes keep their lines. Returns new boxes and the ids re-broken; `metrics` is called only for
 * those.
 */
export function withLinkedLines(
  boxes: readonly TextBox[],
  content: CardContent,
  metrics: FontMetricsResolver,
): { boxes: TextBox[]; rebroken: string[] } {
  const rebroken: string[] = [];
  const out = boxes.map((box) => {
    if (!isLinkedBox(box)) return copyBox(box);
    const text = boxText(box, content);
    if (linesSpell(box.lines, text)) return copyBox(box);
    rebroken.push(box.id);
    return { ...copyBox(box), lines: breakBoxText(text, box, metrics).lines };
  });
  return { boxes: out, rebroken };
}

/** Re-break every box showing `slot`, after that fact changed (`docs/card-system.md §7`). */
export function rebreakFactBoxes(
  boxes: readonly TextBox[],
  slot: FactSlotId,
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
  /**
   * The customization of the card being switched from. A card without one carries nothing: the new
   * card keeps its own generated layout and wording (`docs/card-system.md §7`).
   */
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
 * own fact styling. An invitation line the host deleted stays absent: the carried layout has no box
 * for it.
 */
export function carryWords({ from, content, card }: CarryWordsInput): CardTextLayout {
  const wording = (slot: WordingSlotId) =>
    from.find((b) => b.source.kind === "wording" && b.source.slot === slot);
  const title = wording("title");
  const invitation = wording("invitationLine");
  const added = from
    .filter((b) => b.source.kind === "custom")
    .map((b) => ({ id: b.id, text: b.text ?? "", font: { ...b.font } }));

  return layoutCard({
    ...card,
    // A deleted invitation line is left out, not carried as an empty box the host cannot see.
    slots: invitation
      ? card.slots
      : (card.slots ?? CARD_SLOT_IDS).filter((s) => s !== "invitationLine"),
    content: { ...content, invitationLine: invitation?.text ?? null },
    carried: {
      ...(title ? { title: { ...title.font } } : {}),
      ...(invitation ? { invitationLine: { ...invitation.font } } : {}),
      added,
    },
  });
}
