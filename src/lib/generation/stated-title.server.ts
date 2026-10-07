import "server-only";

import { validateCardText } from "@/lib/card/entry";
import { cardTextFitsEveryDesign } from "@/lib/card/entry-fit.server";

/**
 * The host's title from the prompt (owner decisions, 2026-10-06; `spec.md §7.3`, §7.7;
 * `docs/model-contracts.md §4.3`, §5.4).
 *
 * A name the host gives the event or its idea — in quotation marks, or right after "called",
 * "named" or "titled" — is the card's title, verbatim. Fact extraction (`fact_extraction_v2`)
 * decides what is a title (never a quoted vibe word, a banner's words, a lyric, or the bare name of
 * a brand, show or character the party is themed on); this guard decides only what code can:
 *
 * 1. the extracted title, its surrounding quotation marks stripped, appears verbatim in the prompt
 *    (`not-verbatim` otherwise), and at one of those places it sits directly inside quotation
 *    marks — straight, curly, low or guillemets — or right after "called", "named" or "titled"
 *    (`not-named` otherwise);
 * 2. it passes the checks a typed title gets in the details form: the entry check
 *    (`validateCardText("title")`, `entry`) and the fit check (`cardTextFitsEveryDesign`, `fit`).
 *
 * What it keeps is host content: the design uses it verbatim, never fact-checked or replaced
 * (`docs/card-system.md §2.5`). It is never written to `events.title`; it lives in
 * `events.prompt_facts.title` and the host's own title, once given, wins (`hostEventFacts`).
 */

/** Why a stated title was dropped, recorded in telemetry (`titleDropped`). */
export type StatedTitleDrop = "not-verbatim" | "not-named" | "entry" | "fit";

/** Quotation marks a title may sit inside: straight, curly, low-9, reversed and guillemets. */
const QUOTES = new Set(['"', "'", "“", "”", "„", "‟", "‘", "’", "‚", "‛", "«", "»", "‹", "›"]);

/** A letter, a digit or a combining mark: a title may not be cut out of a longer word. */
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;

/** "called", "named" or "titled" (any case), as a whole word, then optional `:` and whitespace, ending the text. */
const NAMING_WORD = /(?:^|[^\p{L}\p{N}\p{M}-])(?:called|named|titled):?\s+$/iu;

function firstChar(text: string): string {
  return String.fromCodePoint(text.codePointAt(0) ?? 0);
}

function lastChar(text: string): string {
  return Array.from(text).at(-1) ?? "";
}

/** The title without one pair of surrounding quotation marks, trimmed. */
export function withoutQuotes(value: string): string {
  const text = value.trim();
  const chars = Array.from(text);
  if (chars.length >= 2 && QUOTES.has(chars[0]) && QUOTES.has(chars[chars.length - 1])) {
    return chars.slice(1, -1).join("").trim();
  }
  return text;
}

/**
 * The stated title as the prompt writes it, or why it is not one. Pure: the verbatim and context
 * check only (step 1 above), exact to the character after Unicode normalization (NFC).
 */
export function statedTitleSpan(
  prompt: string,
  extracted: string,
): { title: string } | { dropped: "not-verbatim" | "not-named" } {
  const source = prompt.normalize("NFC");
  const title = withoutQuotes(extracted.normalize("NFC"));
  if (title === "") return { dropped: "not-verbatim" };
  let found = false;
  for (let at = source.indexOf(title); at !== -1; at = source.indexOf(title, at + 1)) {
    const before = lastChar(source.slice(0, at));
    const after = firstChar(source.slice(at + title.length));
    // A whole span: neither edge continues a word of the prompt.
    const startsClean = !WORD_CHARACTER.test(firstChar(title)) || !WORD_CHARACTER.test(before);
    const endsClean = !WORD_CHARACTER.test(lastChar(title)) || !WORD_CHARACTER.test(after);
    if (!startsClean || !endsClean) continue;
    found = true;
    if (QUOTES.has(before) && QUOTES.has(after)) return { title };
    if (NAMING_WORD.test(source.slice(0, at))) return { title };
  }
  return { dropped: found ? "not-named" : "not-verbatim" };
}

/**
 * The stated title the card may use, or null with the reason it was dropped. Server-only: the fit
 * check shapes the text with the card fonts.
 */
export async function statedTitle(
  prompt: string,
  extracted: string | null | undefined,
): Promise<{ title: string | null; dropped: StatedTitleDrop | null }> {
  if (!extracted || extracted.trim() === "") return { title: null, dropped: null };
  const span = statedTitleSpan(prompt, extracted);
  if ("dropped" in span) return { title: null, dropped: span.dropped };
  if (!validateCardText("title", span.title).ok) return { title: null, dropped: "entry" };
  if (!(await cardTextFitsEveryDesign("title", span.title))) {
    return { title: null, dropped: "fit" };
  }
  return { title: span.title, dropped: null };
}
