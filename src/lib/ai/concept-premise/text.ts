/**
 * The text measurements `./validate.ts` decides on, kept separate so each one is unit-testable
 * without a premise, an identity or a provider anywhere near it.
 *
 * Every function here is pure, deterministic and locale-independent. None of them judges quality:
 * they answer "do these two passages say the same thing in different words" and "does this passage
 * assert something the brief does not carry", which are the two questions a deterministic stage can
 * honestly ask about prose. Whether a premise is any *good* is not decidable here and is not
 * attempted — `docs/phase-4b-plan.md §E` is explicit that the creative-worlds question is not
 * deterministic and that no metric should pretend otherwise.
 *
 * # Why there is no word list of forbidden terms
 *
 * There is exactly one closed list below — `STOPWORDS` — and it is a similarity-measurement aid,
 * not a prohibition: removing "the" and "with" from both sides of an overlap comparison is what
 * makes the comparison about content. Nothing here bans a word, a name, a phrase or a concept.
 * A ban list would encode the T22 cases into the implementation, which is the one thing this
 * remediation may not do.
 */

/**
 * Ordinary English function words, removed from both sides of every overlap comparison.
 *
 * Deliberately generic and deliberately short. It contains no event vocabulary, no design
 * vocabulary, no colour, no name and nothing drawn from any corpus — so it cannot quietly become a
 * list of things a premise may not say, and it means the same thing for every event.
 */
const STOPWORDS = new Set([
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "already",
  "also",
  "among",
  "and",
  "another",
  "any",
  "are",
  "around",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "came",
  "come",
  "could",
  "does",
  "doing",
  "done",
  "down",
  "during",
  "each",
  "either",
  "else",
  "even",
  "ever",
  "every",
  "from",
  "further",
  "give",
  "given",
  "gives",
  "had",
  "has",
  "have",
  "having",
  "here",
  "how",
  "however",
  "into",
  "its",
  "itself",
  "just",
  "keep",
  "kept",
  "less",
  "like",
  "made",
  "make",
  "makes",
  "many",
  "may",
  "might",
  "more",
  "most",
  "much",
  "must",
  "near",
  "need",
  "needs",
  "neither",
  "never",
  "next",
  "not",
  "nothing",
  "now",
  "off",
  "once",
  "one",
  "only",
  "onto",
  "other",
  "others",
  "our",
  "ours",
  "out",
  "over",
  "own",
  "per",
  "put",
  "quite",
  "rather",
  "really",
  "same",
  "says",
  "see",
  "seem",
  "seems",
  "shall",
  "she",
  "should",
  "since",
  "some",
  "something",
  "still",
  "such",
  "take",
  "takes",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "things",
  "this",
  "those",
  "though",
  "through",
  "thus",
  "too",
  "toward",
  "towards",
  "under",
  "until",
  "upon",
  "use",
  "used",
  "uses",
  "very",
  "was",
  "way",
  "ways",
  "were",
  "what",
  "when",
  "where",
  "whether",
  "which",
  "while",
  "who",
  "whom",
  "whose",
  "why",
  "will",
  "with",
  "within",
  "without",
  "would",
  "yet",
  "you",
  "your",
  "yours",
]);

/** The shortest token that carries content. Three-letter words are almost all function words. */
const MIN_CONTENT_LENGTH = 4;

/**
 * Fold a string to a comparison form: lower case, diacritics removed, one shape per character.
 *
 * NFKD then stripping combining marks means a decomposed accent and a precomposed one compare
 * equal — the same reasoning `PRESENTATION_NAME` applies to accepting names, applied to comparing
 * them. Without it, two premises could carry the same title in two encodings and pass as distinct.
 */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** Every word-shaped run in a string, folded. Digits stay: they are content here. */
export function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/** The content words of a passage: long enough to mean something, and not a function word. */
export function contentTokens(text: string): Set<string> {
  return new Set(
    words(text).filter((token) => token.length >= MIN_CONTENT_LENGTH && !STOPWORDS.has(token)),
  );
}

/**
 * Jaccard overlap of two passages' content words, in `[0, 1]`.
 *
 * Chosen over a sequence measure because the failure being detected is **restatement**, which
 * reorders and re-words freely while reusing the same content. Two passages with no content words
 * at all are reported as fully overlapping, because that is the honest answer: nothing
 * distinguishes them.
 */
export function contentOverlap(a: string, b: string): number {
  const left = contentTokens(a);
  const right = contentTokens(b);
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 1 : shared / union;
}

/** How many content words a passage shares with a corpus. The anchor test for `grounding`. */
export function sharedContentTokens(text: string, corpus: string): number {
  const corpusTokens = contentTokens(corpus);
  let shared = 0;
  for (const token of contentTokens(text)) if (corpusTokens.has(token)) shared += 1;
  return shared;
}

/** Uppercase or lowercase six-digit hex. A premise naming one has left its own stage. */
export const HEX_COLOR_ANYWHERE = /#[0-9A-Fa-f]{6}\b/;

/**
 * A specific this passage asserts: a number, or a proper noun used mid-sentence.
 *
 * These are the two shapes a *fact* takes in prose. A premise may infer creative expression
 * freely; it may not introduce a name, a place, a year, an age or a count the brief does not
 * carry — `docs/designintent-sibling-convergence.md §8.3`, and `docs/product-doctrine.md §11` for
 * the named-reference half, which requires a named designer or house to have already become
 * abstract attributes upstream.
 *
 * **Sentence-initial capitals are not specifics.** A word is treated as proper-noun-shaped only
 * where the preceding non-space character is an ordinary mid-sentence one: not the start of the
 * string, not after `.`, `!`, `?`, `:`, `;`, a dash, a quote or an opening bracket, and not after
 * a line break. Emphasis and ordinary sentence starts therefore cost nothing, and the check stays
 * about names.
 *
 * The line-break case is not decoration. Two independent passages concatenated for one scan would
 * otherwise make the second one's first word read as mid-sentence whenever the first did not end
 * in punctuation — which is a property of the concatenation, not of the text. Callers scan passages
 * separately for the same reason; this handles the residue.
 *
 * Known limits, stated rather than papered over: a specific spelled out in words ("the fortieth
 * year") is not caught, and neither is an invented common-noun detail ("the orchard"). This check
 * is one control among several, not a proof of faithfulness — the reviewer's judgement remains the
 * authority on unsupported narrative, exactly as `docs/phase-4b-plan.md §3.3` places it.
 */
export function assertedSpecifics(text: string): string[] {
  const out: string[] = [];
  const pattern = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (/\p{N}/u.test(token)) {
      out.push(token);
      continue;
    }
    if (token.length < 2) continue;
    const first = token[0];
    if (first !== first.toLocaleUpperCase() || first === first.toLocaleLowerCase()) continue;
    const preceding = text.slice(0, at);
    const gap = preceding.slice(preceding.replace(/\s+$/u, "").length);
    const before = preceding.replace(/\s+$/u, "");
    // Start of the passage, a new line, or the start of a new clause: an ordinary capital.
    if (before.length === 0 || /[\r\n]/u.test(gap) || /[.!?:;—–\-"'“‘([]$/u.test(before)) continue;
    out.push(token);
  }
  return [...new Set(out)];
}

/**
 * Does `corpus` contain `phrase` as a whole phrase, comparing folded word sequences?
 *
 * Word-sequence rather than substring, so "rose" does not match inside "primrose" and a doubled
 * space in either side cannot hide a match.
 */
export function containsPhrase(corpus: string, phrase: string): boolean {
  const needle = words(phrase);
  if (needle.length === 0) return false;
  const haystack = words(corpus);
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** Folded word sequence of a short label, for exact and reordered comparison of titles. */
export function titleKey(title: string): string {
  return words(title).join(" ");
}

/** The same title's words in any order — "Two Words" and "Words Two" are one name. */
export function titleTokenKey(title: string): string {
  return [...words(title)].sort().join(" ");
}
