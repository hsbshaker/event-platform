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
 * title is at most three lines. A break after a hyphen (`text/line-break.ts`) ranks below a space
 * here too: the sizes are first searched with no hyphen breaks, and only if nothing fits are they
 * searched again with them, so "Montgomery-Whitworth" stays whole at any size that allows it. If
 * it cannot fit at minimum sizes the result says `overflow` and the stack runs past the zone's
 * bottom — text is never truncated.
 *
 * Widths are measured from the fonts' own metrics (`text/metrics.ts`) with the `FIT_SAFETY` margin.
 */

import { isCanonicalHex } from "./color";
import type { CardRect } from "./ink";
import { ADDED_SLOT_SPEC, CARD_SLOT_SPECS, type SlotGroup, type SlotSpec } from "./layouts";
import type { CardProportion } from "./shapes";
import { CARD_SLOT_IDS, type CardSlotId } from "./slots";
import { breakWidth, type CardContent, type TextBox, type TextBoxSource } from "./text-box";
import { breakLines } from "./text/line-break";
import { applyTextCase, type FontMetricsResolver, type FontRef } from "./text/metrics";
import { TYPOGRAPHY, type TypographyPairingId } from "./typography";

// The slot specs are layout-set data (`layouts.ts`, CARD_LAYOUT_SET_VERSION); the sizing steps
// and line breaking below are versioned by CARD_COMPILER_VERSION (`docs/card-system.md §8`).

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
  /** The zone's stored ink (`text-space.ts` `placeText`), `#RRGGBB`. */
  ink: string;
  metrics: FontMetricsResolver;
  /** The zone's slots, in order; defaults to every slot in the canonical order. */
  slots?: readonly CardSlotId[];
  /** Carrying words to a fresh layout (`text-box.ts` `carryWords`): kept fonts and added text. */
  carried?: {
    title?: FontRef;
    invitationLine?: FontRef;
    added?: readonly AddedText[];
  };
}

export interface CardTextLayout {
  boxes: TextBox[];
  /**
   * The generated slots do not fit the zone even at minimum sizes; nothing was truncated. In the
   * pairing's own faces this cannot happen for content within the entry limits (proven by the
   * layout fixtures, `docs/card-system.md §4.3`), so for a generated card it is a failure to report,
   * never a card to render. With carried host fonts it can, and the stack runs below the zone for
   * the host to arrange (§7).
   */
  overflow: boolean;
  /** Added boxes that did not fit and were stacked below the zone (carried words only). */
  belowZone: string[];
  /**
   * Characters a box's face lacks, by box id (boxes with none are left out). They were measured
   * with the face's replacement glyph, while a browser would draw them from a fallback font, so
   * the stored lines may not match what is drawn. Never ignored: the policy for them (fallback
   * face, or refusal at entry) is settled with the layout fixtures; until then a caller treats a
   * non-empty map as a failure for the generated card.
   */
  missingCharacters: Record<string, string[]>;
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

function sourceOf(slot: CardSlotId): TextBoxSource {
  return slot === "title" || slot === "invitationLine"
    ? { kind: "wording", slot }
    : { kind: "fact", slot };
}

function validate(input: LayoutCardInput, slots: readonly CardSlotId[]): void {
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

interface Attempt {
  placed: Placed[];
  height: number;
  fits: boolean;
}

interface SearchResult extends Attempt {
  titleSize: number;
  step: number;
  hyphens: boolean;
}

/**
 * The size search shared by `layoutCard` and `layoutCardFits`: the input's items and the steps
 * that place, measure and search them. One code path, so the fit test cannot drift from the
 * layout it predicts.
 */
interface Planner {
  slotItems: Item[];
  addedItems: Item[];
  place(item: Item, size: number, hyphens: boolean): Placed;
  attempt(items: readonly Item[], titleSize: number, step: number, hyphens: boolean): Attempt;
  search(items: readonly Item[]): SearchResult;
}

const TITLE = CARD_SLOT_SPECS.title;

function planner(input: LayoutCardInput): Planner {
  const slots = input.slots ?? CARD_SLOT_IDS;
  validate(input, slots);
  const { zone, proportion, pairing, content, metrics, carried } = input;

  const slotItems: Item[] = slots.map((slot) => {
    const spec = CARD_SLOT_SPECS[slot];
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
    spec: ADDED_SLOT_SPEC,
    font: a.font,
  }));

  const width = breakWidth(zone.width);
  const sizeOf = (spec: SlotSpec, titleSize: number, step: number): number =>
    spec.group === "title" ? titleSize : bodySize(spec, proportion, step);

  // The size search re-places every item at every step, though most keep their size between
  // steps; breaking is pure, so each item is broken once per size and hyphen mode.
  const placedCache = new Map<Item, Map<string, Placed>>();
  const place = (item: Item, size: number, hyphens: boolean): Placed => {
    let bySize = placedCache.get(item);
    if (!bySize) {
      bySize = new Map();
      placedCache.set(item, bySize);
    }
    const key = `${size}|${hyphens ? 1 : 0}`;
    const known = bySize.get(key);
    if (known) return known;
    let placed: Placed;
    if (item.text.trim() === "") {
      placed = { item, size, lines: [], overflow: false, empty: true };
    } else {
      const face = metrics(item.font);
      const style = {
        size,
        letterSpacingEm: item.spec.letterSpacingEm,
        textCase: item.spec.textCase,
      };
      const broken = breakLines(item.text, width, (line) => face.measure(line, style), {
        hyphens,
      });
      placed = { item, size, lines: broken.lines, overflow: broken.overflow, empty: false };
    }
    bySize.set(key, placed);
    return placed;
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

  const attempt = (
    items: readonly Item[],
    titleSize: number,
    step: number,
    hyphens: boolean,
  ): Attempt => {
    const placed = items.map((item) => place(item, sizeOf(item.spec, titleSize, step), hyphens));
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
  const searchSizes = (items: readonly Item[], hyphens: boolean): SearchResult => {
    let titleSize = titleMax;
    let step = 0;
    let result = attempt(items, titleSize, step, hyphens);
    while (!result.fits && titleSize > TITLE.min) {
      titleSize = Math.max(TITLE.min, titleSize - TITLE_STEP);
      result = attempt(items, titleSize, step, hyphens);
    }
    while (!result.fits && step < BODY_STEPS) {
      step += 1;
      result = attempt(items, titleSize, step, hyphens);
    }
    return { ...result, titleSize, step, hyphens };
  };
  // Without hyphen breaks if any sizes allow it; otherwise with them.
  const search = (items: readonly Item[]): SearchResult => {
    const whole = searchSizes(items, false);
    return whole.fits ? whole : searchSizes(items, true);
  };

  return { slotItems, addedItems, place, attempt, search };
}

/**
 * Whether `layoutCard(input)` fits, i.e. would not report `overflow` — without building its boxes.
 * Exactly `!layoutCard(input).overflow`, from the same search code.
 *
 * Fast path: the last attempt `layoutCard`'s search makes — the title at its minimum, the body at
 * its last step, breaks after hyphens allowed — is its smallest. If the generated slots fit there,
 * the search reaches a fit at or before it, so `layoutCard` fits; one attempt settles the common
 * case. If they do not fit there, the full search decides, so the answer stays exact even where a
 * smaller size would not fit better (a variable face's `opsz` instance can widen as it shrinks).
 * Added (carried) boxes never cause `overflow` (`layoutCard` stacks those below the zone), so only
 * the slots are searched: they fit with some added boxes only if they fit alone.
 */
export function layoutCardFits(input: LayoutCardInput): boolean {
  const plan = planner(input);
  return (
    plan.attempt(plan.slotItems, TITLE.min, BODY_STEPS, true).fits ||
    plan.search(plan.slotItems).fits
  );
}

/** Lay out the generated card's text layer (see the module comment). */
export function layoutCard(input: LayoutCardInput): CardTextLayout {
  const { zone, proportion, ink, metrics } = input;
  const { slotItems, addedItems, place, search } = planner(input);

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
    const p = place(item, bodySize(item.spec, proportion, result.step), result.hyphens);
    if (!p.empty) belowY += item.spec.gapBeforeEm * p.size;
    emit(p, belowY);
    belowY += p.lines.length * p.size * item.spec.lineHeight;
  }

  const missingCharacters: Record<string, string[]> = {};
  for (const box of boxes) {
    if (box.lines.length === 0) continue;
    // As drawn: the box's case applied.
    const missing = metrics(box.font).missingCharacters(
      applyTextCase(box.lines.join(" "), box.textCase),
    );
    if (missing.length > 0) missingCharacters[box.id] = missing;
  }

  return {
    boxes,
    overflow,
    belowZone: below.map((item) => item.id),
    missingCharacters,
    sizes: { title: result.titleSize, bodyStep: result.step },
  };
}
