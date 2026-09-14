/**
 * Where a staggered or cascaded title breaks.
 *
 * The renderer used to split on a fixed word index — words 0–1, 2–3, then the rest. For "Baby
 * Shaker is on the way" that is `["Baby Shaker", "is on", "the way"]`, and the treatment then
 * displaced the middle line. Because the split is positional rather than syntactic, the displaced
 * line is almost always the grammatically weakest fragment: a connective. Human Test #1 reviewers
 * described the result as looking like a rendering defect
 * (`docs/human-test-1/qualitative-findings.md`, F1, mechanisms M1–M2).
 *
 * This chooses the break points instead of assuming them. It is deterministic, pure, and takes no
 * measurement: fitting is still the geometry verifier's job, and it still adapts by demoting
 * emphasis rather than by re-breaking lines. Nothing here is exposed to the model — the model
 * chooses a treatment (`EventTitle.layout`), never a break point, an offset or a pixel.
 *
 * # How
 *
 * Titles are short, so the optimal split is found by enumerating every way to cut the words into
 * `k` lines and scoring each. Exhaustive search is the clearest correct implementation at this
 * size and removes any question of a heuristic going wrong on an unusual title.
 *
 * The score prefers lines of even length, and penalises the two shapes that read as accidents:
 *
 * - a line that is nothing but a short function word ("is on", "of the"), which is what made the
 *   old split look broken;
 * - a break taken after a preposition or article, which strands the phrase it opens;
 * - a last line far shorter than the others — an orphan.
 *
 * # How many lines
 *
 * From the title's length, not its word count. A short title gets two lines; only a genuinely
 * long one gets three. The old rule produced three lines for almost everything, which is how a
 * five-word title ended up with a two-word middle line. Capped at three, because §3.1 allows a
 * display node three lines at desktop and the treatment should not be the reason a title needs
 * demoting.
 */

/** Roughly the measure a display line wants, in characters. Tuned to give short titles two lines. */
const TARGET_CHARS_PER_LINE = 18;

/** The most lines any treatment produces; §3.1's desktop line limit for display and primary. */
export const MAX_TITLE_LINES = 3;

/**
 * Words that carry no weight alone. A line made only of these reads as a fragment that fell off
 * the line above, which is exactly the artifact F1 describes.
 */
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "to",
  "with",
  "&",
]);

const isFunctionWord = (word: string) =>
  FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-z&]/gi, ""));

/** Every way to cut `n` items into exactly `k` non-empty runs, as cut positions. */
function compositions(n: number, k: number): number[][] {
  if (k === 1) return [[]];
  const out: number[][] = [];
  // The first cut must leave room for k-1 more non-empty runs.
  for (let first = 1; first <= n - (k - 1); first += 1) {
    for (const rest of compositions(n - first, k - 1)) {
      out.push([first, ...rest.map((c) => c + first)]);
    }
  }
  return out;
}

function linesFor(words: readonly string[], cuts: readonly number[]): string[] {
  const bounds = [0, ...cuts, words.length];
  const out: string[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    out.push(words.slice(bounds[i], bounds[i + 1]).join(" "));
  }
  return out;
}

/**
 * Lower is better. Raggedness dominates; the two penalties are large enough to overrule a
 * marginally more even split that reads badly.
 */
function score(lines: readonly string[]): number {
  const lengths = lines.map((l) => l.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  let s = lengths.reduce((acc, len) => acc + (len - mean) ** 2, 0);

  for (const [i, line] of lines.entries()) {
    const words = line.split(" ");
    // A line of nothing but function words: the "is on" case.
    if (words.every(isFunctionWord)) s += 400;
    // A line broken after a preposition or article — "An Evening of" / "Music and Light". The
    // phrase it opens lands on the next line, so the break reads as arbitrary. Smaller than the
    // penalty above: it is a worse reading, not a defect, and should not buy unlimited raggedness.
    if (i < lines.length - 1 && isFunctionWord(words[words.length - 1]!)) s += 60;
  }

  // An orphaned last line: markedly shorter than the mean, and only one word.
  const last = lines[lines.length - 1]!;
  if (lines.length > 1 && last.split(" ").length === 1 && last.length < mean * 0.55) s += 200;

  return s;
}

/**
 * Break `title` into coherent lines for a staggered or cascaded treatment.
 *
 * Returns one line for a title that should not be broken at all. Never returns an empty line, and
 * never reorders or alters the words: the event's own copy is preserved exactly
 * (`docs/event-renderer-system.md §2.2`).
 */
export function titleLines(title: string, maxLines: number = MAX_TITLE_LINES): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.length === 1 ? [words[0]!] : [];

  // How many lines this title's length wants, capped by the caller and by §3.1's line limit. A
  // title short enough for a single line keeps it: breaking "Maya & Tom" to satisfy a treatment
  // is the same class of artifact the treatment is meant to avoid, and a one-line title simply
  // renders without an offset.
  const wanted = Math.ceil(title.trim().length / TARGET_CHARS_PER_LINE);
  if (wanted < 2) return [words.join(" ")];
  const k = Math.min(wanted, maxLines, words.length);
  if (k < 2) return [words.join(" ")];

  let best: string[] | null = null;
  let bestScore = Infinity;
  // Consider the target line count and everything down to the two-line floor: a split into fewer,
  // cleaner lines is often better than an even split that strands a connective. One line is not a
  // candidate — a single line is perfectly even, so it would win every comparison and silently
  // cancel the treatment the model asked for.
  for (let lines = k; lines >= 2; lines -= 1) {
    for (const cuts of compositions(words.length, lines)) {
      const candidate = linesFor(words, cuts);
      // Fewer lines is a mild tiebreak, so an equally good split does not gain a line for nothing.
      const s = score(candidate) + candidate.length * 4;
      if (s < bestScore) {
        bestScore = s;
        best = candidate;
      }
    }
  }
  return best ?? [title.trim()];
}
