/**
 * Deterministic line breaking for card text (`docs/card-system.md §4.3`, §7 "Line breaking for
 * edited boxes"; `spec.md §20.4`).
 *
 * Rules, in priority order for each paragraph (text between hard breaks the host typed):
 * 1. never break inside a word — breaks happen only at spaces (U+0020 and tab; a no-break space
 *    joins, a hyphenated name stays whole);
 * 2. use the fewest lines that fit `maxWidth`;
 * 3. at that line count, never leave a one-word last line where another break exists;
 * 4. then balance the lines: minimise the sum of squared slack, so lines come out even
 *    (the `text-wrap: balance` shape) rather than greedy-full-then-short.
 *
 * A single word wider than `maxWidth` goes on its own line and sets `overflow`; nothing is ever
 * truncated. Ties resolve to the earliest break, so the result depends only on the inputs.
 *
 * Whitespace inside a paragraph collapses to single spaces and is trimmed at line ends, so stored
 * lines are exactly what is drawn. A blank line the host typed between paragraphs is kept as an
 * empty line; leading and trailing blank lines are not. Pure: `measure` is injected.
 */

export interface BrokenLines {
  lines: string[];
  /** Measured width of each line, in the units `measure` returns. */
  widths: number[];
  /** True when some single word is wider than `maxWidth` (it still sits whole on its own line). */
  overflow: boolean;
}

/** Hard breaks: CRLF, LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR. */
const HARD_BREAK = new RegExp("\\r\\n|[\\n\\r\\u2028\\u2029]");
const SPACES = /[ \t]+/;

interface Cost {
  lines: number;
  slack: number;
}

function better(a: Cost, b: Cost): boolean {
  return a.lines < b.lines || (a.lines === b.lines && a.slack < b.slack);
}

function breakParagraph(
  words: string[],
  maxWidth: number,
  measure: (line: string) => number,
): BrokenLines {
  const n = words.length;
  const widthCache = new Map<number, number>();
  const widthOf = (i: number, j: number): number => {
    const key = i * (n + 1) + j;
    let w = widthCache.get(key);
    if (w === undefined) {
      w = measure(words.slice(i, j).join(" "));
      widthCache.set(key, w);
    }
    return w;
  };
  // A line of words[i..j) is allowed when it fits, or when it is a single (overflowing) word.
  const allowed = (i: number, j: number): boolean => j - i === 1 || widthOf(i, j) <= maxWidth;
  const slackOf = (i: number, j: number): number => {
    const s = maxWidth - widthOf(i, j);
    return s > 0 ? s * s : 0;
  };

  // best[j]: the best way to set words[0..j) as complete lines; from[j]: start of its last line.
  const best: (Cost | null)[] = new Array(n + 1).fill(null);
  const from = new Int32Array(n + 1);
  best[0] = { lines: 0, slack: 0 };
  for (let j = 1; j <= n; j += 1) {
    for (let i = j - 1; i >= 0; i -= 1) {
      if (!allowed(i, j)) break; // wider prefixes only get wider
      const prev = best[i];
      if (!prev) continue;
      const cost = { lines: prev.lines + 1, slack: prev.slack + slackOf(i, j) };
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
      orphan: lines > 1 && n - i === 1 ? 1 : 0,
      slack: prev.slack + slackOf(i, n),
    };
    const wins =
      !chosenCost ||
      cost.lines < chosenCost.lines ||
      (cost.lines === chosenCost.lines &&
        (cost.orphan < chosenCost.orphan ||
          (cost.orphan === chosenCost.orphan && cost.slack <= chosenCost.slack)));
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
    lines.push(words.slice(i, j).join(" "));
    const w = widthOf(i, j);
    widths.push(w);
    if (w > maxWidth) overflow = true;
  }
  return { lines, widths, overflow };
}

/**
 * Break `text` into lines no wider than `maxWidth` (see the module comment for the rules).
 * Empty or whitespace-only text gives no lines.
 */
export function breakLines(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
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
    const broken = breakParagraph(words, maxWidth, measure);
    out.lines.push(...broken.lines);
    out.widths.push(...broken.widths);
    out.overflow ||= broken.overflow;
  }
  return out;
}
