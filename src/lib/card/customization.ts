/**
 * The card editor's text layer, between the editor and storage (`spec.md §20.2`, §20.4, §20.5;
 * `docs/card-system.md §7`). Pure: the server wires it to the event, the design and the fonts
 * (`customization.server.ts`).
 *
 * What a stored customization holds, line by line:
 *
 * - **The invitation line and added boxes** hold their own words, and lines broken from them.
 * - **The title and fact boxes** hold no words (the title is `Event.title`, a fact is the event's),
 *   and lines broken from the event's *saved* words: the effective title, and each fact the host
 *   has saved — none for a fact not yet saved, which renders nothing for guests. A placeholder or a
 *   prompt-stated value (`spec.md §7.3`) is never stored: it depends on the day, is never
 *   published, and Creation Mode breaks it at the box's width when it draws the card
 *   (`withLinkedLines`).
 *
 * A box keeps its stored lines while its words, width, font, size, spacing and case are unchanged;
 * a change to any of them re-breaks it (`breakBoxText`). No line the editor sends is ever kept.
 */

import { applyTextCase, type FontMetricsResolver } from "./text/metrics";
import { linesSpell } from "./text/line-break";
import type { CardTextLayout } from "./layout-card";
import {
  boxText,
  breakBoxText,
  carryWords,
  isLinkedBox,
  sameBreakStyle,
  seedCustomization,
  withLinkedLines,
  type CardContent,
  type CarryWordsInput,
  type TextBox,
} from "./text-box";
import type { EditorTextBox } from "./text-box-schema";
import { FACT_SLOT_IDS } from "./slots";

/** Two boxes speak for the same words: the same source kind and slot. */
function sameSource(a: TextBox["source"], b: TextBox["source"]): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "custom" || b.kind === "custom") return true;
  return a.slot === b.slot;
}

/**
 * The stored seed of a customization (`docs/card-system.md §7`, "First edit of a card"): the
 * generated layout as Creation Mode shows it (`generated`, laid out for the host's content, so its
 * boxes sit where the host saw them), with a box for every fact slot, and every linked box's lines
 * broken from the event's saved words (`saved`) — none for a fact not yet saved.
 */
export function seedBoxes(
  generated: readonly TextBox[],
  saved: CardContent,
  metrics: FontMetricsResolver,
): TextBox[] {
  return withLinkedLines(seedCustomization(generated, FACT_SLOT_IDS), saved, metrics).boxes;
}

export interface CarriedBoxesInput {
  /** The customization of the card being switched from. */
  from: readonly TextBox[];
  /** Creation Mode's words for the new card: its boxes are laid out where the host will see them. */
  host: CardContent;
  /** The event's saved words for the new card: what its linked boxes are stored broken from. */
  saved: CardContent;
  /** The new card's generated-layout inputs; `metrics` covers its pairing and the carried fonts. */
  card: CarryWordsInput["card"];
}

/**
 * The host's words laid out fresh on a new design or shape (`carryWords`; `docs/card-system.md
 * §7`, "Carrying words to a fresh layout"), as its customization stores them: the linked boxes'
 * lines broken from the saved words, like a seed.
 */
export function carriedBoxesFrom({ from, host, saved, card }: CarriedBoxesInput): CardTextLayout {
  const layout = carryWords({ from, content: host, card });
  return { ...layout, boxes: withLinkedLines(layout.boxes, saved, card.metrics).boxes };
}

/** Characters a box's face lacks in `text`, as drawn (its case applied). */
export function missingCharacters(
  box: Pick<TextBox, "font" | "textCase">,
  text: string,
  metrics: FontMetricsResolver,
): string[] {
  if (text.trim() === "") return [];
  return metrics(box.font).missingCharacters(applyTextCase(text, box.textCase));
}

export interface BoxesToStoreInput {
  /**
   * The boxes the save replaces: the customization at the revision the editor read, or the seed
   * for a first edit. Their lines are the server's own.
   */
  previous: readonly TextBox[];
  /** The boxes the editor sent (`parseEditorBoxes`): no lines, and no words on linked boxes. */
  incoming: readonly EditorTextBox[];
  /** The event's saved words, with the effective title after this save. */
  saved: CardContent;
  metrics: FontMetricsResolver;
}

export type BoxesToStore =
  | { ok: true; boxes: TextBox[]; rebroken: string[] }
  /** A box's face cannot draw some of its words: keyed `boxes.<index>.<field>`. */
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * The boxes to store for a save (`spec.md §20.4`; `docs/card-system.md §7`): each box's lines
 * kept from `previous` when the same box (id and source) breaks the same words the same way, and
 * broken afresh otherwise. Lines are never taken from the editor. Refuses words a box's face cannot
 * draw — the browser would draw them from a fallback font, and the stored lines would not be what
 * guests see.
 */
export function boxesToStore({
  previous,
  incoming,
  saved,
  metrics,
}: BoxesToStoreInput): BoxesToStore {
  const before = new Map(previous.map((box) => [box.id, box]));
  const fieldErrors: Record<string, string> = {};
  const rebroken: string[] = [];
  const boxes = incoming.map((box, i): TextBox => {
    const shell: TextBox = { ...box, source: { ...box.source }, font: { ...box.font }, lines: [] };
    const linked = isLinkedBox(shell);
    const text = boxText(shell, saved);

    const missing = missingCharacters(shell, text, metrics);
    if (missing.length > 0) {
      const shown = missing.slice(0, 3).join(" ");
      fieldErrors[`boxes.${i}.${linked ? "font" : "text"}`] = linked
        ? `This font can't show ${shown} — please choose another.`
        : `The card can't show ${shown} in this font — please remove ${missing.length === 1 ? "it" : "them"}.`;
      return shell;
    }

    const prev = before.get(box.id);
    const keep =
      prev !== undefined &&
      sameSource(prev.source, shell.source) &&
      sameBreakStyle(prev, shell) &&
      (linked || prev.text === shell.text) &&
      linesSpell(prev.lines, text);
    if (keep) return { ...shell, lines: [...prev.lines] };
    rebroken.push(box.id);
    return { ...shell, lines: breakBoxText(text, shell, metrics).lines };
  });
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, boxes, rebroken };
}
