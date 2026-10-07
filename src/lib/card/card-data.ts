/**
 * The data a card is drawn from, and the one validation both of its renderers apply to it
 * (`docs/card-system.md §6.1`, §6.4): `InvitationCard` in the DOM, and the link-preview image
 * (`preview-svg.server.ts`). Sharing the validation and the paint order is part of what keeps the
 * two from disagreeing: neither can accept a card the other would refuse or stack it differently.
 *
 * The data is untrusted — a stored customization is host content — so every value that reaches a
 * style or a drawing is checked, and anything malformed throws `InvalidCardDataError` rather than
 * rendering something the host never saw. Pure, no DOM.
 */

import { isCanonicalHex } from "./color";
import type { CardRect } from "./ink";
import type { PanelFade } from "./layouts";
import { CARD_SHAPES, SHAPE_PROPORTION, type CardProportion, type CardShape } from "./shapes";
import type { TextBox } from "./text-box";

/**
 * A legibility panel behind a text zone (`layouts.ts` `panelFor`), in its resolved paper colour
 * (`ink.ts` `resolveInk`). Its rectangle is drawn opaque: the zone's ink was chosen against
 * exactly this colour.
 *
 * Two forms, by the layout set the artwork was made with:
 * - with `fade` (`card_layouts_v3`): the rectangle is the opaque paper, square-cornered, and the
 *   paper fades out beyond it (`panelFeather`, `panelFadeAxis`); `radius` and `softEdge` are zero;
 * - without (`card_layouts_v2`): a rounded rectangle with a soft edge, drawn as it always was.
 */
export interface CardPanel extends CardRect {
  radius: number;
  /** CSS `box-shadow` semantics: the panel colour spread by `spread` and blurred by `blur`. */
  softEdge: { spread: number; blur: number };
  /** `#RRGGBB`. */
  color: string;
  /** How the paper fades into the artwork beyond the rectangle; absent on `card_layouts_v2`. */
  fade?: PanelFade;
}

/**
 * The fade's alpha by progress across it, from the opaque edge (`at` 0) to nothing (`at` 1):
 * `(1 + cos πt) / 2` at every eighth. The curve leaves the opaque paper and reaches nothing with
 * zero slope, so neither end of the fade draws a line, and nine stops keep the linear
 * interpolation between them from showing as bands. Both renderers draw exactly these stops.
 */
export const PANEL_FADE_STOPS: readonly { at: number; alpha: number }[] = Array.from(
  { length: 9 },
  (_, i) => ({ at: i / 8, alpha: Math.round(((1 + Math.cos((Math.PI * i) / 8)) / 2) * 1e4) / 1e4 }),
);

/** How far a faded panel's paper reaches beyond its opaque rectangle on each side, card units. */
export interface PanelFeather {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The fade beyond each side of a panel's rectangle: an `edge` fade on the side away from its
 * `from` edge only, a `wash` on every side. Zero everywhere for a panel without `fade`.
 */
export function panelFeather(panel: Pick<CardPanel, "fade">): PanelFeather {
  const { fade } = panel;
  if (!fade) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (fade.kind === "wash") {
    const f = fade.feather;
    return { top: f, right: f, bottom: f, left: f };
  }
  return fade.from === "top"
    ? { top: 0, right: 0, bottom: fade.length, left: 0 }
    : { top: fade.length, right: 0, bottom: 0, left: 0 };
}

/**
 * The paper's alpha along one axis of a faded panel's drawn extent — `before` units fading in,
 * `opaque` units of opaque paper, `after` units fading out — as gradient stops at offsets 0–1 of
 * the whole extent. A side without a fade starts or ends opaque. The paper's alpha at a point is
 * the product of its two axes' alphas, so a `wash` panel's corners round off softly.
 */
export function panelFadeAxis(
  before: number,
  opaque: number,
  after: number,
): { offset: number; alpha: number }[] {
  const total = before + opaque + after;
  const stops: { offset: number; alpha: number }[] = [];
  if (before > 0) {
    for (const s of [...PANEL_FADE_STOPS].reverse()) {
      stops.push({ offset: (before * (1 - s.at)) / total, alpha: s.alpha });
    }
  } else {
    stops.push({ offset: 0, alpha: 1 });
  }
  if (after > 0) {
    for (const s of PANEL_FADE_STOPS) {
      stops.push({ offset: (before + opaque + after * s.at) / total, alpha: s.alpha });
    }
  } else {
    stops.push({ offset: 1, alpha: 1 });
  }
  return stops;
}

export class InvalidCardDataError extends Error {
  constructor(message: string) {
    super(`InvitationCard: ${message}`);
    this.name = "InvalidCardDataError";
  }
}

const ALIGNS = new Set(["left", "center", "right"]);
const CASES = new Set(["none", "uppercase", "lowercase"]);
// Control characters and line terminators: a stored line is exactly one line.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function check(ok: boolean, message: string): void {
  if (!ok) throw new InvalidCardDataError(message);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateBox(box: TextBox): void {
  const id = typeof box.id === "string" ? box.id : "?";
  check(typeof box.id === "string" && box.id.length > 0, "a box has no id");
  for (const key of ["x", "y", "rotation", "letterSpacing"] as const) {
    check(finite(box[key]), `box ${id}: ${key} is not a finite number`);
  }
  // CSS `z-index` takes an integer; a fractional value would be dropped by the browser and
  // stacked as `auto`, so both renderers refuse it rather than each guessing.
  check(Number.isSafeInteger(box.z), `box ${id}: z is not an integer`);
  for (const key of ["width", "size", "lineHeight"] as const) {
    check(finite(box[key]) && box[key] > 0, `box ${id}: ${key} must be positive`);
  }
  check(isCanonicalHex(box.color), `box ${id}: colour ${String(box.color)} is not #RRGGBB`);
  check(ALIGNS.has(box.align), `box ${id}: invalid alignment`);
  check(CASES.has(box.textCase), `box ${id}: invalid text case`);
  const { font } = box;
  check(
    typeof font?.family === "string" && font.family.trim() !== "" && !CONTROL.test(font.family),
    `box ${id}: invalid font family`,
  );
  check(
    Number.isInteger(font.weight) && font.weight >= 1 && font.weight <= 1000,
    `box ${id}: invalid font weight`,
  );
  check(typeof font.italic === "boolean", `box ${id}: invalid font style`);
  check(Array.isArray(box.lines), `box ${id}: lines must be an array`);
  for (const line of box.lines) {
    check(typeof line === "string" && !CONTROL.test(line), `box ${id}: a line is not one line`);
  }
}

function validatePanel(panel: CardPanel, index: number): void {
  for (const key of ["x", "y"] as const) {
    check(finite(panel[key]), `panel ${index}: ${key} is not a finite number`);
  }
  for (const key of ["width", "height"] as const) {
    check(finite(panel[key]) && panel[key] > 0, `panel ${index}: ${key} must be positive`);
  }
  check(finite(panel.radius) && panel.radius >= 0, `panel ${index}: invalid radius`);
  check(
    finite(panel.softEdge?.spread) &&
      panel.softEdge.spread >= 0 &&
      finite(panel.softEdge.blur) &&
      panel.softEdge.blur >= 0,
    `panel ${index}: invalid soft edge`,
  );
  check(isCanonicalHex(panel.color), `panel ${index}: colour is not #RRGGBB`);
  if (panel.fade === undefined) return;
  const fade = panel.fade as Partial<Record<string, unknown>> | null;
  check(
    typeof fade === "object" &&
      fade !== null &&
      ((fade.kind === "edge" &&
        (fade.from === "top" || fade.from === "bottom") &&
        finite(fade.length) &&
        fade.length > 0) ||
        (fade.kind === "wash" && finite(fade.feather) && fade.feather > 0)),
    `panel ${index}: invalid fade`,
  );
  // A faded panel is drawn by its fade alone; a radius or soft edge would be a second, different
  // edge that the two renderers would each have to guess how to combine.
  check(
    panel.radius === 0 && panel.softEdge.spread === 0 && panel.softEdge.blur === 0,
    `panel ${index}: a faded panel has no radius or soft edge`,
  );
}

export interface CardData {
  shape: CardShape;
  /** The proportion of the artwork supplied for the shape. */
  artworkProportion: CardProportion | undefined;
  panels: readonly CardPanel[];
  boxes: readonly TextBox[];
}

/**
 * Validate everything a renderer draws. Returns the card's proportion. Throws
 * `InvalidCardDataError` for anything malformed.
 */
export function validateCardData({
  shape,
  artworkProportion,
  panels,
  boxes,
}: CardData): CardProportion {
  check(CARD_SHAPES.includes(shape), `unknown shape ${String(shape)}`);
  const proportion = SHAPE_PROPORTION[shape];
  check(
    artworkProportion === proportion,
    `artwork is ${String(artworkProportion)}, the ${shape} card is ${proportion}`,
  );
  panels.forEach(validatePanel);
  const ids = new Set<string>();
  for (const box of boxes) {
    validateBox(box);
    check(!ids.has(box.id), `duplicate box id ${box.id}`);
    ids.add(box.id);
  }
  return proportion;
}

/**
 * Reading order: top to bottom, then left to right, then as given. The DOM order of the card's
 * text, and so the order its live text is read in. Stacking is `z`, not order.
 */
export function readingOrder(boxes: readonly TextBox[]): TextBox[] {
  return boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.index - b.index)
    .map(({ box }) => box);
}

/**
 * The order boxes are painted in, bottom first: by `z`, and among equal `z` in reading (DOM)
 * order — what CSS does for positioned siblings with integer `z-index` in one stacking context.
 * Boxes without lines render nothing and are left out.
 */
export function paintOrder(boxes: readonly TextBox[]): TextBox[] {
  return readingOrder(boxes)
    .filter((box) => box.lines.length > 0)
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.z - b.box.z || a.index - b.index)
    .map(({ box }) => box);
}
