/**
 * `layoutCard`: the generated card's text layer (`docs/card-system.md §4.3`; `spec.md §31`, "Card
 * design, artwork and compiler": "`layoutCard` decides every slot's size and line breaks; no text
 * leaves its zone; no word is broken; text is never silently truncated").
 *
 * Pure and deterministic: the same inputs give the same boxes. It stacks the zone's slots in order,
 * centred horizontally and vertically in the zone, each slot one `TextBox` the zone's width; a slot
 * with no value takes no space (its box is still emitted, empty, so a customization can be seeded
 * with a box for every fact slot). Sizing follows the Phase 3 mock the owner judged
 * (`scripts/phase-3/compose.mjs`): every slot starts at its maximum; the title steps down first,
 * 2 units at a time, then the body slots together, until the stack fits the zone's height and the
 * title is at most three lines. If it cannot fit at minimum sizes the result says `overflow` and
 * the stack runs past the zone's bottom — text is never truncated.
 *
 * Widths are measured from the fonts' own metrics (`text/metrics.ts`) with the `FIT_SAFETY` margin.
 */

import { isCanonicalHex } from "./color";
import type { CardRect } from "./ink";
import type { CardProportion } from "./shapes";
import {
  breakWidth,
  CARD_SLOTS,
  type CardContent,
  type CardSlot,
  type TextBox,
  type TextBoxSource,
} from "./text-box";
import { breakLines } from "./text/line-break";
import type { FontMetricsResolver, FontRef, TextCase } from "./text/metrics";
import { TYPOGRAPHY, type TypographyPairingId } from "./typography";

/** Version of the slot specs and sizing below; part of the compiler version (`card-system.md §8`). */
export const LAYOUT_CARD_VERSION = "layout_card_v1";

type SlotGroup = "title" | "invitation" | "details" | "added";

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
 * v1 slot specs, from the Phase 3 mock: title 104 (5:7) or 92 (1:1) down to 48, line height 1.05,
 * at most 3 lines; invitation line 32 → 22, 1.3, letter spacing .02em, 0.9em above; details 24 → 18,
 * 1.45, uppercase, .06em, 1.3em above the group and nothing between its lines. Phase 3 set only the
 * date, time and venue as details; the baby name, hosts and RSVP-by join that group here.
 */
export const SLOT_SPECS_V1: Readonly<Record<CardSlot, SlotSpec>> = {
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
export const ADDED_SPEC_V1: SlotSpec = { ...INVITATION, group: "added" };

const TITLE_STEP = 2;
/** Body steps: the invitation line (and added text) lose 1 unit per step, details 1 until 18. */
const BODY_STEPS = 10;

function bodySize(spec: SlotSpec, proportion: CardProportion, step: number): number {
  return Math.max(spec.min, spec.max[proportion] - step);
}

/** The faces of a curated pairing, at the weight Phase 3 set both in (400). */
export function pairingFaces(id: TypographyPairingId): { display: FontRef; body: FontRef } {
  const p = TYPOGRAPHY[id];
  return {
    display: { family: p.display, weight: 400, italic: false },
    body: { family: p.body, weight: 400, italic: false },
  };
}

export interface AddedText {
  id: string;
  text: string;
  font: FontRef;
}

export interface LayoutCardInput {
  /** The layout's text zone for this shape, card units. */
  zone: CardRect;
  proportion: CardProportion;
  /** Display face (title) and body face (everything else). */
  pairing: { display: FontRef; body: FontRef };
  content: CardContent;
  /** The zone's resolved ink (`resolveInk`), `#RRGGBB`. */
  ink: string;
  metrics: FontMetricsResolver;
  /** The zone's slots, in order; defaults to every slot in the canonical order. */
  slots?: readonly CardSlot[];
  /** Carrying words to a fresh layout (`text-box.ts` `carryWords`): kept fonts and added text. */
  carried?: {
    title?: FontRef;
    invitationLine?: FontRef;
    added?: readonly AddedText[];
  };
}

export interface CardTextLayout {
  boxes: TextBox[];
  /** The generated slots do not fit the zone even at minimum sizes; nothing was truncated. */
  overflow: boolean;
  /** Added boxes that did not fit and were stacked below the zone (carried words only). */
  belowZone: string[];
  /** The sizes chosen. */
  sizes: { title: number; bodyStep: number };
}

interface Item {
  id: string;
  source: TextBoxSource;
  text: string;
  storedText?: string;
  spec: SlotSpec;
  font: FontRef;
}

interface Placed {
  item: Item;
  size: number;
  lines: string[];
  overflow: boolean;
  empty: boolean;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function sourceOf(slot: CardSlot): TextBoxSource {
  return slot === "title" || slot === "invitationLine"
    ? { kind: "wording", slot }
    : { kind: "fact", slot };
}

function validate(input: LayoutCardInput, slots: readonly CardSlot[]): void {
  const { zone } = input;
  if (!(zone.width > 0 && zone.height > 0)) throw new Error("layoutCard: empty zone");
  if (!isCanonicalHex(input.ink)) throw new Error(`layoutCard: ink ${input.ink} is not #RRGGBB`);
  if (new Set(slots).size !== slots.length) throw new Error("layoutCard: duplicate slot");
  const ids = new Set<string>(slots);
  for (const added of input.carried?.added ?? []) {
    if (ids.has(added.id)) throw new Error(`layoutCard: duplicate box id ${added.id}`);
    ids.add(added.id);
  }
}

/** Lay out the generated card's text layer (see the module comment). */
export function layoutCard(input: LayoutCardInput): CardTextLayout {
  const slots = input.slots ?? CARD_SLOTS;
  validate(input, slots);
  const { zone, proportion, pairing, content, ink, metrics, carried } = input;

  const slotItems: Item[] = slots.map((slot) => {
    const spec = SLOT_SPECS_V1[slot];
    const carriedFont = slot === "title" || slot === "invitationLine" ? carried?.[slot] : undefined;
    const text = content[slot] ?? "";
    return {
      id: slot,
      source: sourceOf(slot),
      text,
      ...(slot === "invitationLine" ? { storedText: text } : {}),
      spec,
      font: carriedFont ?? (spec.role === "display" ? pairing.display : pairing.body),
    };
  });
  const addedItems: Item[] = (carried?.added ?? []).map((a) => ({
    id: a.id,
    source: { kind: "custom" },
    text: a.text,
    storedText: a.text,
    spec: ADDED_SPEC_V1,
    font: a.font,
  }));

  const width = breakWidth(zone.width);
  const sizeOf = (spec: SlotSpec, titleSize: number, step: number): number =>
    spec.group === "title" ? titleSize : bodySize(spec, proportion, step);

  const place = (item: Item, size: number): Placed => {
    if (item.text.trim() === "") return { item, size, lines: [], overflow: false, empty: true };
    const face = metrics(item.font);
    const style = {
      size,
      letterSpacingEm: item.spec.letterSpacingEm,
      textCase: item.spec.textCase,
    };
    const broken = breakLines(item.text, width, (line) => face.measure(line, style));
    return { item, size, lines: broken.lines, overflow: broken.overflow, empty: false };
  };

  const stackHeight = (placed: readonly Placed[]): number => {
    let height = 0;
    let prev: SlotGroup | null = null;
    for (const p of placed) {
      if (p.empty) continue;
      if (prev !== null && prev !== p.item.spec.group) height += p.item.spec.gapBeforeEm * p.size;
      height += p.lines.length * p.size * p.item.spec.lineHeight;
      prev = p.item.spec.group;
    }
    return height;
  };

  const attempt = (items: readonly Item[], titleSize: number, step: number) => {
    const placed = items.map((item) => place(item, sizeOf(item.spec, titleSize, step)));
    const height = stackHeight(placed);
    const fits =
      height <= zone.height + 1e-9 &&
      placed.every(
        (p) =>
          !p.overflow && (p.item.spec.maxLines === null || p.lines.length <= p.item.spec.maxLines),
      );
    return { placed, height, fits };
  };

  const titleMax = TITLE.max[proportion];
  const search = (items: readonly Item[]) => {
    let titleSize = titleMax;
    let step = 0;
    let result = attempt(items, titleSize, step);
    while (!result.fits && titleSize > TITLE.min) {
      titleSize = Math.max(TITLE.min, titleSize - TITLE_STEP);
      result = attempt(items, titleSize, step);
    }
    while (!result.fits && step < BODY_STEPS) {
      step += 1;
      result = attempt(items, titleSize, step);
    }
    return { ...result, titleSize, step };
  };

  // Every added box if they all fit; otherwise as many as fit, in order, the rest below the zone.
  let fitted = addedItems.length;
  let result = search([...slotItems, ...addedItems]);
  while (!result.fits && fitted > 0) {
    fitted -= 1;
    result = search([...slotItems, ...addedItems.slice(0, fitted)]);
  }
  const overflow = !result.fits;

  const boxes: TextBox[] = [];
  const emit = (p: Placed, y: number): void => {
    const spec = p.item.spec;
    boxes.push({
      id: p.item.id,
      source: p.item.source,
      ...(p.item.storedText !== undefined ? { text: p.item.storedText } : {}),
      x: round3(zone.x),
      y: round3(y),
      width: round3(zone.width),
      rotation: 0,
      font: { ...p.item.font },
      size: p.size,
      color: ink,
      align: "center",
      letterSpacing: spec.letterSpacingEm,
      lineHeight: spec.lineHeight,
      textCase: spec.textCase,
      z: boxes.length,
      lines: p.lines,
    });
  };

  // Centred when it fits; from the zone's top when it does not, so the overflow is visible below.
  let y = overflow ? zone.y : zone.y + (zone.height - result.height) / 2;
  let prev: SlotGroup | null = null;
  for (const p of result.placed) {
    if (!p.empty) {
      if (prev !== null && prev !== p.item.spec.group) y += p.item.spec.gapBeforeEm * p.size;
      prev = p.item.spec.group;
    }
    emit(p, y);
    y += p.lines.length * p.size * p.item.spec.lineHeight;
  }

  // Added boxes that did not fit: stacked below the zone (and below an overflowing stack) at the
  // body size reached.
  const below = addedItems.slice(fitted);
  let belowY = Math.max(zone.y + zone.height, y);
  for (const item of below) {
    const p = place(item, bodySize(item.spec, proportion, result.step));
    if (!p.empty) belowY += item.spec.gapBeforeEm * p.size;
    emit(p, belowY);
    belowY += p.lines.length * p.size * item.spec.lineHeight;
  }

  return {
    boxes,
    overflow,
    belowZone: below.map((item) => item.id),
    sizes: { title: result.titleSize, bodyStep: result.step },
  };
}
