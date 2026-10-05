/**
 * Deterministic line breaking for card text (`docs/card-system.md §4.3`, §7 "Line breaking for
 * edited boxes"; `spec.md §20.4`).
 *
 * Break opportunities are spaces (U+0020 and tab; a no-break space joins) and, at lower priority,
 * the point just after a hyphen (U+002D or U+2010) that sits between two letters, as in
 * "Montgomery-Whitworth". The hyphen stays at the end of the first line. Nothing else breaks a
 * word: not a hyphen beside a digit or a space ("12:30-4:45", "Smith -"), a non-breaking hyphen
 * (U+2011), a dash or a slash.
 *
 * Rules, in priority order for each paragraph (text between hard breaks the host typed):
 * 1. never break inside a word except after such a hyphen;
 * 2. use the fewest lines that fit `maxWidth`;
 * 3. at that line count, use as few hyphen breaks as possible (a space is always preferred);
 * 4. then strand as few short words as possible: a line that is one word of `SHORT_WORD_MAX`
 *    characters or fewer ("A", "The", "Our"), as in "A / Wild Beginning", wherever it falls
 *    (`card_compiler_v3`, owner decision 2026-10-05);
 * 5. then never leave a one-word last line (a line with no space in it) where another break exists;
 * 6. then balance the lines: minimise the sum of squared slack, so lines come out even
 *    (the `text-wrap: balance` shape) rather than greedy-full-then-short.
 *
 * A single unbreakable piece (a word, or the part of a hyphenated word between break points)
 * wider than `maxWidth` goes on its own line and sets `overflow`; nothing is ever truncated. Ties
 * resolve by a fixed rule — within the lines before the last, the later break; for the last line,
 * the earlier start — so the result depends only on the inputs.
 *
 * Whitespace inside a paragraph collapses to single spaces and is trimmed at line ends, so stored
 * lines are exactly what is drawn. A blank line the host typed between paragraphs is kept as an
 * empty line; leading and trailing blank lines are not. Pure: `measure` is injected.
 */

export interface BrokenLines {
  lines: string[];
  /** Measured width of each line, in the units `measure` returns. */
  widths: number[];
  /**
   * True when some unbreakable piece is wider than `maxWidth` (it still sits whole on its own
   * line).
   */
  overflow: boolean;
}

/** Hard breaks: CRLF, LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR. */
const HARD_BREAK = new RegExp("\\r\\n|[\\n\\r\\u2028\\u2029]");
const SPACES = /[ \t]+/;

/**
 * Every character a line may break at: the spaces and the hard breaks above. Any other
 * whitespace (a no-break space, a thin space) joins, and is an ordinary character to measure and
 * draw. The entry check splits words at exactly these, so what it accepts breaks the same way.
 */
export const BREAK_CHARACTER = /[ \t\r\n\u2028\u2029]/;
export const BREAK_RUN = /[ \t\r\n\u2028\u2029]+/;
/**
 * A hyphen (HYPHEN-MINUS or HYPHEN) after a letter (or a letter's combining mark) and before a
 * letter: the break goes after it.
 */
const HYPHEN_BETWEEN_LETTERS = /(?<=[\p{L}\p{M}][-\u2010])(?=\p{L})/u;

/**
 * The unbreakable pieces of one word: the word split just after each hyphen between letters
 * ("Montgomery-Whitworth" → "Montgomery-", "Whitworth"). A line never breaks inside a piece.
 */
export function wordPieces(word: string): string[] {
  return word.split(HYPHEN_BETWEEN_LETTERS);
}

/**
 * The longest word, in characters (combining marks not counted), that rule 4 treats as short when
 * it stands alone on a line.
 */
export const SHORT_WORD_MAX = 3;

const COMBINING_MARK = /\p{M}/gu;

/** Whether `line` (one word: no space in it) is a short word under rule 4. */
function isShortWord(line: string): boolean {
  return Array.from(line.replace(COMBINING_MARK, "")).length <= SHORT_WORD_MAX;
}

/** One unbreakable run of a paragraph, and whether a space precedes it. */
interface Piece {
  text: string;
  /** True when a space separates it from the piece before; false after a hyphen break point. */
  spaceBefore: boolean;
}

function piecesOf(words: readonly string[], hyphens: boolean): Piece[] {
  const pieces: Piece[] = [];
  for (const word of words) {
    (hyphens ? wordPieces(word) : [word]).forEach((text, k) => {
      pieces.push({ text, spaceBefore: k === 0 && pieces.length > 0 });
    });
  }
  return pieces;
}

interface Cost {
  lines: number;
  /** Line breaks taken after a hyphen rather than at a space. */
  hyphens: number;
  /** Lines that are one short word (rule 4). */
  stranded: number;
  slack: number;
}

function better(a: Cost, b: Cost): boolean {
  if (a.lines !== b.lines) return a.lines < b.lines;
  if (a.hyphens !== b.hyphens) return a.hyphens < b.hyphens;
  if (a.stranded !== b.stranded) return a.stranded < b.stranded;
  return a.slack < b.slack;
}

function breakParagraph(
  words: string[],
  maxWidth: number,
  measure: (line: string) => number,
  hyphens: boolean,
): BrokenLines {
  const pieces = piecesOf(words, hyphens);
  const n = pieces.length;
  const textOf = (i: number, j: number): string => {
    let text = pieces[i].text;
    for (let k = i + 1; k < j; k += 1) {
      text += pieces[k].spaceBefore ? ` ${pieces[k].text}` : pieces[k].text;
    }
    return text;
  };
  const widthCache = new Map<number, number>();
  const widthOf = (i: number, j: number): number => {
    const key = i * (n + 1) + j;
    let w = widthCache.get(key);
    if (w === undefined) {
      w = measure(textOf(i, j));
      widthCache.set(key, w);
    }
    return w;
  };
  // A line of pieces[i..j) is allowed when it fits, or when it is a single (overflowing) piece.
  const allowed = (i: number, j: number): boolean => j - i === 1 || widthOf(i, j) <= maxWidth;
  const slackOf = (i: number, j: number): number => {
    const s = maxWidth - widthOf(i, j);
    return s > 0 ? s * s : 0;
  };
  // A line starting at piece i (i > 0) means a break before it: after a hyphen, or at a space.
  const hyphenBreak = (i: number): number => (i > 0 && !pieces[i].spaceBefore ? 1 : 0);
  // A line of pieces[i..j) is one word when no space falls inside it.
  const oneWordLine = (i: number, j: number): boolean => {
    for (let k = i + 1; k < j; k += 1) if (pieces[k].spaceBefore) return false;
    return true;
  };
  const strandedOf = (i: number, j: number): number =>
    oneWordLine(i, j) && isShortWord(textOf(i, j)) ? 1 : 0;

  // best[j]: the best way to set pieces[0..j) as complete lines; from[j]: start of its last line.
  const best: (Cost | null)[] = new Array(n + 1).fill(null);
  const from = new Int32Array(n + 1);
  best[0] = { lines: 0, hyphens: 0, stranded: 0, slack: 0 };
  for (let j = 1; j <= n; j += 1) {
    for (let i = j - 1; i >= 0; i -= 1) {
      if (!allowed(i, j)) break; // wider prefixes only get wider
      const prev = best[i];
      if (!prev) continue;
      const cost = {
        lines: prev.lines + 1,
        hyphens: prev.hyphens + hyphenBreak(i),
        stranded: prev.stranded + strandedOf(i, j),
        slack: prev.slack + slackOf(i, j),
      };
      if (!best[j] || better(cost, best[j]!)) {
        best[j] = cost;
        from[j] = i;
      }
    }
  }

  // Choose the last line separately so the one-word-last-line rule ranks above balance.
  let chosen = -1;
  let chosenCost: (Cost & { orphan: number }) | null = null;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (!allowed(i, n)) break;
    const prev = best[i];
    if (!prev) continue;
    const lines = prev.lines + 1;
    const cost = {
      lines,
      hyphens: prev.hyphens + hyphenBreak(i),
      stranded: prev.stranded + strandedOf(i, n),
      orphan: lines > 1 && oneWordLine(i, n) ? 1 : 0,
      slack: prev.slack + slackOf(i, n),
    };
    const wins =
      !chosenCost ||
      cost.lines < chosenCost.lines ||
      (cost.lines === chosenCost.lines &&
        (cost.hyphens < chosenCost.hyphens ||
          (cost.hyphens === chosenCost.hyphens &&
            (cost.stranded < chosenCost.stranded ||
              (cost.stranded === chosenCost.stranded &&
                (cost.orphan < chosenCost.orphan ||
                  (cost.orphan === chosenCost.orphan && cost.slack <= chosenCost.slack)))))));
    if (wins) {
      chosen = i;
      chosenCost = cost;
    }
  }

  const starts: number[] = [];
  for (let j = chosen; j > 0; j = from[j]) starts.unshift(from[j]);
  starts.push(chosen);
  const lines: string[] = [];
  const widths: number[] = [];
  let overflow = false;
  for (let k = 0; k < starts.length; k += 1) {
    const i = starts[k];
    const j = k + 1 < starts.length ? starts[k + 1] : n;
    lines.push(textOf(i, j));
    const w = widthOf(i, j);
    widths.push(w);
    if (w > maxWidth) overflow = true;
  }
  return { lines, widths, overflow };
}

export interface BreakOptions {
  /**
   * Whether a break may fall after a hyphen between letters (default true). `layoutCard` first
   * looks for sizes that need none, so a name stays whole wherever a size allows it.
   */
  hyphens?: boolean;
}

/**
 * Break `text` into lines no wider than `maxWidth` (see the module comment for the rules).
 * Empty or whitespace-only text gives no lines.
 */
export function breakLines(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
  { hyphens = true }: BreakOptions = {},
): BrokenLines {
  if (!(maxWidth > 0)) throw new Error(`Invalid line width ${maxWidth}`);
  const paragraphs = text.split(HARD_BREAK).map((p) => p.split(SPACES).filter(Boolean));
  while (paragraphs.length > 0 && paragraphs[0].length === 0) paragraphs.shift();
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1].length === 0) paragraphs.pop();

  const out: BrokenLines = { lines: [], widths: [], overflow: false };
  for (const words of paragraphs) {
    if (words.length === 0) {
      out.lines.push("");
      out.widths.push(0);
      continue;
    }
    const broken = breakParagraph(words, maxWidth, measure, hyphens);
    out.lines.push(...broken.lines);
    out.widths.push(...broken.widths);
    out.overflow ||= broken.overflow;
  }
  return out;
}
