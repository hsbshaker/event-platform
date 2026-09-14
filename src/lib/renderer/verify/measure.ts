/**
 * What the browser is asked, and what it answers.
 *
 * `docs/event-renderer-system.md §3.1`: "Each text node's line count and bounds are measured at
 * both breakpoints; nodes over their limit ... or overflowing their container are demoted one
 * emphasis step". This module owns the measurement half of that: the function serialised into the
 * page, and the shapes it returns.
 *
 * # Rendered geometry, not an estimate
 *
 * Every number here comes from `getBoundingClientRect`, `scrollWidth`/`clientWidth` and
 * `getComputedStyle` on the real document. Nothing is inferred from character counts — that is the
 * advisory static estimate (`composition/fit-estimate.ts`), which §3.1 and `spec.md §32` #24 keep
 * explicitly subordinate to this. `proof-b/renderer.js`'s `measure()` is the reference for *what*
 * to collect; the hooks are the production renderer's own `data-id` and `data-t` attributes.
 *
 * # What is deliberately not measured
 *
 * Two categories are excluded at collection time, both because a width comparison is the wrong
 * question for them, and both inherited from the reference:
 *
 * - **vertical writing modes.** A thin rail sets its label on its side; the label's width is a line
 *   height, and its height is its length. Comparing its right edge to its container's tells you
 *   nothing about whether it fits. The rail's own clipping is checked instead (see `rail-clip`).
 * - **overlay decorations.** `.ev-overlay-decoration` is a watermark the stylesheet clips and holds
 *   behind the content by rule, so it can never take space from text or widen the page
 *   (`event-tokens.css §5`). Measuring it would report an overflow that cannot reach a viewer.
 *
 * Excluded nodes are counted, not silently dropped, so a summary can say how many there were.
 * Everything that *is* collected must come back clean — there is no allowance for "small" overflow
 * beyond the sub-pixel tolerance in `verify.ts`.
 *
 * # Serialisation
 *
 * `measureInPage` is handed to Playwright's `page.evaluate`, which serialises it with
 * `Function.prototype.toString`. It therefore closes over nothing: every helper it uses is defined
 * inside it, and it is written with indexed loops rather than `for...of` over DOM collections so
 * that no transpiler helper can end up referenced from a scope the page does not have.
 */

import { FIT_LIMITS } from "../composition/fit-estimate";

export type Breakpoint = "desktop" | "mobile";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * The two authoritative widths (`docs/event-renderer-system.md §3.1`, §6). The heights are the
 * reference harness's (`proof-b/verify.js`) and matter only for `svh`-relative hero fill: width is
 * what verification is about, and vertical scrolling is expected.
 */
export const VIEWPORTS: Record<Breakpoint, Viewport> = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
};

export const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "mobile"];

/**
 * Line limits per emphasis (`§3.1`: "display and primary: three lines at desktop, four at
 * mobile"). Imported from the static estimator rather than restated, so the advisory pass and the
 * authoritative one can never disagree about the table itself — only about how it is applied.
 */
export const LINE_LIMITS = FIT_LIMITS;

export interface Box {
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The rendered line boxes of one text node.
 *
 * §3.1 as written measures a node's *bounding box* and divides by its line height. That answers
 * "how tall is this" and nothing else: a line starting far right of its siblings, or a column so
 * narrow that every line holds two words, produces exactly the same height as a well-set one.
 * Human Test #1 reviewers read both as rendering faults
 * (`docs/human-test-1/qualitative-findings.md`, F1, blind spots 1-3), so the line boxes themselves
 * are measured here.
 *
 * From `Range.getClientRects()`, which returns the real inline fragments the browser laid out —
 * not an inference from character counts, which is the advisory static estimate's job.
 */
export interface LineGeometry {
  /** Line boxes actually laid out. `0` only where the node rendered nothing measurable. */
  readonly count: number;
  /** The widest and narrowest line, in CSS pixels. Both `0` when `count` is `0`. */
  readonly maxWidth: number;
  readonly minWidth: number;
  /**
   * How far apart the lines' *aligned* edges sit — left edges for start-aligned text, centers for
   * centered text, right edges for end-aligned. Zero for well-set text at any alignment; large
   * only when something displaced one line relative to its siblings.
   */
  readonly edgeSpread: number;
}

export interface MeasuredText {
  /** The canonical node id this text belongs to, from `data-id` on it or its nearest ancestor. */
  readonly id: string | null;
  /** The emphasis it actually rendered at, read back off its `ev-em-*` class. */
  readonly emphasis: string | null;
  /** The primitive it is, read back off its `ev-t-*` class — `Date`, `Venue`, `EventTitle`, … */
  readonly kind: string | null;
  /** The title treatment in effect, read back off its `ev-lay-*` class, or `null` for none. */
  readonly layout: string | null;
  /** Whitespace-separated words in the rendered text, for the metadata budget. */
  readonly words: number;
  /**
   * Runs of the rendered text with no break opportunity inside them — whitespace, hyphens, dashes
   * and slashes all end one. The floor on how few lines the text can legally take.
   */
  readonly segments: number;
  /**
   * Of those, how many were laid out across more than one line box — each one a break the text
   * did not offer. Direct evidence, where `segments` against `lineGeometry.count` is only an
   * inequality; see `breaksInsideWords`.
   */
  readonly segmentsSplit: number;
  readonly lines: number;
  readonly fontPx: number;
  readonly lineHeightPx: number;
  readonly box: Box;
  readonly containerBox: Box;
  readonly lineGeometry: LineGeometry;
  /** Wider than its own content box, or past its container's edges, beyond the tolerance. */
  readonly overflow: boolean;
}

export type OverflowReason = "element" | "rail-clip";

export interface MeasuredElement {
  readonly id: string | null;
  readonly className: string;
  readonly reason: OverflowReason;
  readonly box: Box;
  readonly containerBox: Box;
}

export interface FontFaceReport {
  readonly family: string;
  readonly weight: string;
  readonly status: string;
}

export interface FontReport {
  /** The display and body families this concept's pairing resolved to. */
  readonly required: readonly string[];
  /** Of those, the ones with at least one `loaded` face in the document. */
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
  readonly faces: readonly FontFaceReport[];
  /**
   * `document.fonts.check` per required family. Recorded as evidence, never as the test: it is
   * vacuously true for a family with no matching face at all, so a missing `@font-face` rule
   * passes it. `missing` is derived from face status, which is not vacuous.
   */
  readonly checked: readonly string[];
}

export interface PageMeasurement {
  readonly mode: Breakpoint;
  readonly viewport: Viewport;
  readonly documentWidth: number;
  readonly clientWidth: number;
  readonly documentHeight: number;
  readonly pageOverflow: boolean;
  readonly heroHeight: number;
  readonly fonts: FontReport;
  readonly texts: readonly MeasuredText[];
  /** Up to `overflowLimit` records; `overflowingTotal` is the true count. */
  readonly overflowing: readonly MeasuredElement[];
  readonly overflowingTotal: number;
  /** Vertical-writing-mode and decoration text, excluded by rule rather than by failure. */
  readonly excludedTexts: number;
}

export interface MeasureOptions {
  readonly mode: Breakpoint;
  readonly viewport: Viewport;
  readonly tolerancePx: number;
  readonly requiredFamilies: readonly string[];
  readonly overflowLimit: number;
}

/**
 * Runs inside the page. Closes over nothing; see the module doc.
 */
export function measureInPage(options: MeasureOptions): PageMeasurement {
  const tol = options.tolerancePx;

  function box(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height };
  }

  function containerBoxOf(el: Element): Box {
    return box(el.parentElement ?? el);
  }

  function canonicalId(el: Element): string | null {
    const own = el.getAttribute("data-id");
    if (own) return own;
    const near = el.closest("[data-id]");
    return near ? near.getAttribute("data-id") : null;
  }

  function isVertical(el: Element): boolean {
    return window.getComputedStyle(el).writingMode.indexOf("vertical") === 0;
  }

  /** A rotated ancestor makes a horizontal width comparison meaningless for its descendants too. */
  function insideVertical(el: Element): boolean {
    let node: Element | null = el;
    while (node && node !== document.documentElement) {
      if (isVertical(node)) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * The node's rendered text.
   *
   * `innerText`, not `textContent`. A treated title renders each of its lines as a sibling span
   * with no whitespace between them in the markup, so `textContent` fuses the last word of one
   * line with the first of the next — "Mariana's" + "Quinceanera" becomes one token, and the node
   * then looks as though it were broken inside a word when it was not. `innerText` is the text as
   * laid out, with a break between block-level children, which is the text these counts are about.
   */
  function renderedText(el: Element): string {
    const html = el as HTMLElement;
    const text = typeof html.innerText === "string" ? html.innerText : el.textContent || "";
    return text.trim();
  }

  function wordsIn(text: string): number {
    if (text.length === 0) return 0;
    return text.split(/\s+/).length;
  }

  /**
   * Runs of text with no break opportunity inside them.
   *
   * Whitespace is not the only place a browser may break. UAX #14 also allows a break after a
   * hyphen, an en or em dash and (in Chromium) a slash, so "Wells-next-the-Sea" legitimately sets
   * on two lines while being one word. Counting these segments rather than words is what keeps
   * `breaksInsideWords` a proof rather than a heuristic.
   */
  function segmentsIn(text: string): number {
    if (text.length === 0) return 0;
    const parts = text.split(/[\s\u002D\u2010-\u2015\u2043/]+/);
    let n = 0;
    for (let i = 0; i < parts.length; i += 1) if (parts[i].length > 0) n += 1;
    return n;
  }

  /**
   * Does this character end a segment — that is, may a line break there?
   *
   * Whitespace, and the dashes and slashes UAX #14 allows a break after. Kept as explicit code
   * points rather than a regex so the same list is used here and by `segmentsIn`.
   */
  function isBreakChar(code: number): boolean {
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12) return true;
    if (code === 45 || code === 47) return true; // hyphen-minus, solidus
    if (code >= 0x2010 && code <= 0x2015) return true; // hyphen … horizontal bar
    return code === 0x2043; // hyphen bullet
  }

  /**
   * Does this character offer a break *inside* a run with no whitespace in it?
   *
   * Han, Hiragana, Katakana and Hangul do: a line of Japanese breaks between characters, so a run
   * of them spanning two lines is correct typography rather than a chopped word. Such runs are
   * excluded from the split test below, which is why that test cannot condemn them.
   */
  function isIdeographic(code: number): boolean {
    return (
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xa960 && code <= 0xa97f) ||
      (code >= 0xac00 && code <= 0xd7ff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff9f)
    );
  }

  /**
   * How many segments were laid out across more than one line box.
   *
   * `lineGeometry.count > segments` proves *that* some segment broke, by counting; it cannot prove
   * that none did. Two lines and two segments is the same arithmetic whether the break fell
   * between them or inside the first — "Konstantinopo" / "ulos ok" counts exactly like
   * "Konstantinopoulos" / "ok". So each segment is measured on its own: a range over just its
   * characters, and rects on two different lines means the browser broke where the text offered
   * nothing.
   */
  function splitSegmentsIn(el: Element, lineHeightPx: number): number {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let split = 0;
    let node = walker.nextNode();
    while (node) {
      const data = node.nodeValue || "";
      let start = -1;
      let ideographic = false;
      for (let i = 0; i <= data.length; i += 1) {
        const ends = i === data.length || isBreakChar(data.charCodeAt(i));
        if (!ends) {
          if (start === -1) {
            start = i;
            ideographic = false;
          }
          if (isIdeographic(data.charCodeAt(i))) ideographic = true;
          continue;
        }
        if (start === -1) continue;
        if (!ideographic) {
          range.setStart(node, start);
          range.setEnd(node, i);
          const rects = range.getClientRects();
          let tops = 0;
          let first = 0;
          for (let j = 0; j < rects.length; j += 1) {
            const r = rects[j];
            if (r.width <= 0 || r.height <= 0) continue;
            if (tops === 0) {
              tops = 1;
              first = r.top;
            } else if (Math.abs(r.top - first) >= lineHeightPx * 0.5) {
              tops = 2;
              break;
            }
          }
          if (tops > 1) split += 1;
        }
        start = -1;
      }
      node = walker.nextNode();
    }
    return split;
  }

  function escapes(inner: Box, outer: Box): boolean {
    return inner.right > outer.right + tol || inner.left < outer.left - tol;
  }

  /**
   * Group a node's rendered text fragments into line boxes and describe them.
   *
   * The rects come from a range over each **text node**, not from one range over the element's
   * contents. `Range.getClientRects()` on an element's contents also returns the border box of
   * every element fully inside it, and those boxes are the wrong shape for both questions asked
   * here: a full-width `.ev-line` span reports a box spanning the whole measure however narrow its
   * text is, and it starts at the box's edge however far the text inside is indented — so an
   * indented line would look flush and a fragmented one would look wide.
   *
   * Fragments are then grouped by vertical position rather than counted, because one visual line
   * can produce several rects: a staggered title puts each line in its own span, and any inline run
   * with mixed metrics splits too. Two fragments belong to the same line when their tops are within
   * half a line height, which is unambiguous for stacked lines at any line height the stylesheet
   * sets, including the 0.9 a display treatment uses.
   */
  function lineGeometryOf(
    el: Element,
    lineHeightPx: number,
    align: string,
    direction: string,
  ): LineGeometry {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const tops: number[] = [];
    const lefts: number[] = [];
    const rights: number[] = [];
    let node = walker.nextNode();
    while (node) {
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        if (r.width <= 0 || r.height <= 0) continue;
        let group = -1;
        for (let j = 0; j < tops.length; j += 1) {
          if (Math.abs(tops[j] - r.top) < lineHeightPx * 0.5) {
            group = j;
            break;
          }
        }
        if (group === -1) {
          tops.push(r.top);
          lefts.push(r.left);
          rights.push(r.right);
        } else {
          if (r.left < lefts[group]) lefts[group] = r.left;
          if (r.right > rights[group]) rights[group] = r.right;
        }
      }
      node = walker.nextNode();
    }
    if (tops.length === 0) return { count: 0, maxWidth: 0, minWidth: 0, edgeSpread: 0 };

    let maxWidth = 0;
    let minWidth = Infinity;
    let minEdge = Infinity;
    let maxEdge = -Infinity;
    const centered = align === "center";
    // `start` and `end` follow the writing direction; `left` and `right` do not. Nothing in the
    // stylesheet sets `direction` today, but reading it costs nothing and a single `dir` attribute
    // would otherwise make every line of an RTL block look displaced from every other.
    const rtl = direction === "rtl";
    const toEnd =
      align === "right" || align === "end" || (rtl && (align === "start" || align === "left"));
    for (let i = 0; i < tops.length; i += 1) {
      const width = rights[i] - lefts[i];
      if (width > maxWidth) maxWidth = width;
      if (width < minWidth) minWidth = width;
      const edge = centered ? (lefts[i] + rights[i]) / 2 : toEnd ? rights[i] : lefts[i];
      if (edge < minEdge) minEdge = edge;
      if (edge > maxEdge) maxEdge = edge;
    }
    return {
      count: tops.length,
      maxWidth,
      minWidth,
      edgeSpread: tops.length > 1 ? maxEdge - minEdge : 0,
    };
  }

  const texts: MeasuredText[] = [];
  const overflowing: MeasuredElement[] = [];
  let overflowingTotal = 0;
  let excludedTexts = 0;

  const textEls = Array.from(document.querySelectorAll("[data-t='text']"));
  for (let i = 0; i < textEls.length; i += 1) {
    const el = textEls[i];
    if (insideVertical(el) || el.closest(".ev-overlay-decoration")) {
      excludedTexts += 1;
      continue;
    }
    const cs = window.getComputedStyle(el);
    const fontPx = parseFloat(cs.fontSize) || 0;
    const lineHeightPx = parseFloat(cs.lineHeight) || fontPx * 1.2 || 1;
    const b = box(el);
    const cb = containerBoxOf(el);
    const text = renderedText(el);
    const words = wordsIn(text);
    const emphasisMatch = /(?:^|\s)ev-em-([a-z]+)(?:\s|$)/.exec(el.className);
    const kindMatch = /(?:^|\s)ev-t-([A-Za-z]+)(?:\s|$)/.exec(el.className);
    const layoutMatch = /(?:^|\s)ev-lay-([a-z]+)(?:\s|$)/.exec(el.className);
    texts.push({
      id: canonicalId(el),
      emphasis: emphasisMatch ? emphasisMatch[1] : null,
      kind: kindMatch ? kindMatch[1] : null,
      layout: layoutMatch ? layoutMatch[1] : null,
      words,
      segments: segmentsIn(text),
      segmentsSplit: splitSegmentsIn(el, lineHeightPx),
      lines: Math.max(1, Math.round(b.height / lineHeightPx)),
      fontPx,
      lineHeightPx,
      box: b,
      containerBox: cb,
      lineGeometry: lineGeometryOf(el, lineHeightPx, cs.textAlign, cs.direction),
      overflow: el.scrollWidth > el.clientWidth + tol || escapes(b, cb),
    });
  }

  // Every element under the site root, minus the categories a width comparison cannot speak to:
  // text leaves (measured above), decorations (clipped by rule), rail tracks (clipped by design,
  // checked separately below) and anything that hides its own horizontal overflow.
  const all = Array.from(document.querySelectorAll(".ev-site *"));
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i];
    if (
      el.closest("[data-t='text']") ||
      el.closest(".ev-overlay-decoration") ||
      el.closest(".ev-rail-track") ||
      insideVertical(el)
    ) {
      continue;
    }
    const cs = window.getComputedStyle(el);
    if (cs.overflowX === "hidden" || cs.overflowX === "clip") continue;
    const b = box(el);
    const cb = containerBoxOf(el);
    if (!(el.scrollWidth > el.clientWidth + tol) && !escapes(b, cb)) continue;
    overflowingTotal += 1;
    if (overflowing.length < options.overflowLimit) {
      overflowing.push({
        id: canonicalId(el),
        className: el.className,
        reason: "element",
        box: b,
        containerBox: cb,
      });
    }
  }

  // A rail track clips (`event-tokens.css`: "nothing inside a fixed-width column may widen the
  // page"), so its contents never reach the page-overflow check. Content that would be cut off is
  // still a fit failure, and it is the rail around it that has to give — which is what
  // `rail-widen` does.
  const tracks = Array.from(document.querySelectorAll(".ev-rail .ev-rail-track"));
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    const tb = box(track);
    const inner = Array.from(track.querySelectorAll("[data-t='text']"));
    for (let j = 0; j < inner.length; j += 1) {
      const child = inner[j];
      const cbx = box(child);
      if (!escapes(cbx, tb)) continue;
      overflowingTotal += 1;
      if (overflowing.length < options.overflowLimit) {
        overflowing.push({
          id: canonicalId(child),
          className: child.className,
          reason: "rail-clip",
          box: cbx,
          containerBox: tb,
        });
      }
      break;
    }
  }

  const faces: FontFaceReport[] = [];
  document.fonts.forEach((face) => {
    faces.push({
      family: face.family.replace(/^["']|["']$/g, ""),
      weight: face.weight,
      status: face.status,
    });
  });
  const loaded: string[] = [];
  const missing: string[] = [];
  const checked: string[] = [];
  for (let i = 0; i < options.requiredFamilies.length; i += 1) {
    const family = options.requiredFamilies[i];
    let ok = false;
    for (let j = 0; j < faces.length; j += 1) {
      if (faces[j].family === family && faces[j].status === "loaded") {
        ok = true;
        break;
      }
    }
    (ok ? loaded : missing).push(family);
    if (document.fonts.check("16px '" + family + "'")) checked.push(family);
  }

  const root = document.documentElement;
  const hero = document.querySelector(".ev-section.ev-kind-hero");

  return {
    mode: options.mode,
    viewport: options.viewport,
    documentWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    documentHeight: root.scrollHeight,
    pageOverflow: root.scrollWidth > root.clientWidth + tol,
    heroHeight: hero ? hero.getBoundingClientRect().height : 0,
    fonts: { required: options.requiredFamilies, loaded, missing, faces, checked },
    texts,
    overflowing,
    overflowingTotal,
    excludedTexts,
  };
}

/**
 * The text kinds whose content is one atomic value rather than prose.
 *
 * A date, a time, a venue and a locality are single facts. They are short, they are never written
 * to fill a measure, and a reader takes them in at a glance — so unlike a description or a set of
 * hosts, there is a number of lines past which they are not "long", they are *fragmented*
 * ("…December 19," / "2026"). Everything else is prose and gets no budget: a description that runs
 * to six lines is a description.
 */
export const ATOMIC_METADATA_KINDS: readonly string[] = ["Date", "Time", "Venue", "Location"];

/**
 * The lines an atomic metadata value gets for free, before its own length earns it more.
 *
 * This is F1 blind spot 3 (`docs/human-test-1/qualitative-findings.md`): `FIT_LIMITS` covers
 * `display` and `primary` only, and these four kinds default to `secondary`, so the nodes most
 * exposed to a narrow column were the ones with no budget at all. Two lines at desktop and three
 * at mobile — one more at 390, where a narrower measure is the medium rather than a defect.
 */
export const METADATA_LINE_LIMITS: Record<Breakpoint, number> = { desktop: 2, mobile: 3 };

/**
 * Beyond the free lines, one more line per this many words.
 *
 * Without it the budget would be a length limit rather than a fragmentation limit, and would
 * condemn a legitimately long value — a host who types a venue as a sentence — for being long.
 * Three words to a line is the point below which a short fact stops reading as a phrase and starts
 * reading as a column of fragments, which is what reviewers saw.
 */
const METADATA_WORDS_PER_LINE = 3;

/**
 * The line budget for an atomic metadata node, or `null` where `FIT_LIMITS` already governs it.
 *
 * `display` and `primary` are deliberately excluded rather than tightened: a date set large across
 * three lines is a composition, and §3.1's own limit already bounds it. The budget applies where
 * §3.1 is silent.
 */
export function metadataLineLimit(
  mode: Breakpoint,
  kind: string | null,
  emphasis: string | null,
  words: number,
): number | null {
  if (kind === null || ATOMIC_METADATA_KINDS.indexOf(kind) === -1) return null;
  if (emphasis !== "secondary" && emphasis !== "caption") return null;
  return Math.max(METADATA_LINE_LIMITS[mode], Math.ceil(words / METADATA_WORDS_PER_LINE));
}

/**
 * Is this node being broken where the text offers no break?
 *
 * The minimum usable measure, stated so that it needs no threshold. Laying `s` unbreakable
 * segments out on `n` lines needs `n - 1` break points, and the text offers only `s - 1` of them;
 * so `n > s` proves at least one break landed inside a segment. That is the column-too-narrow
 * failure F1 describes (mechanism M4) — "the zero-overflow floor converts would-be overflows into
 * arbitrary wraps" — caught without asking how many ems a line ought to be.
 *
 * That inequality is sound but not complete: it proves a break happened, never that none did.
 * "Konstantinopo" / "ulos ok" is two lines and two segments, exactly like the correct
 * "Konstantinopoulos" / "ok". So the primary test is `segmentsSplit`, which measures each segment
 * on its own and needs no inequality at all; the counting rule remains as a backstop.
 *
 * Segments, not words, because a hyphen or a slash is a legal break too: "Wells-next-the-Sea" on
 * two lines is one word and four segments, and is not a defect.
 *
 * A measure in ems was the obvious alternative and is the wrong instrument: display type gets few
 * ems per line by its nature, so any threshold strict enough to catch a title chopped across eight
 * lines also condemns a large, well-set one. This rule separates them exactly.
 */
export function breaksInsideWords(text: MeasuredText): boolean {
  // Direct evidence first: a segment measured across two line boxes broke where nothing allowed
  // it to. The counting rule stays as a backstop for the cases a per-segment range cannot see —
  // text split across several nodes, or a segment excluded as ideographic.
  if (text.segmentsSplit > 0) return true;
  return text.segments > 0 && text.lineGeometry.count > text.segments;
}

/**
 * Do this node's lines share an edge?
 *
 * Normal multiline text agrees on its aligned edge to within a fraction of a pixel. A `stagger` or
 * `cascade` title does not, by design — those are the only treatments that displace a line, and
 * their offsets are bounded by the stylesheet — so they are exempt. Anything else whose lines
 * disagree is the "arbitrarily indented continuation line" F1 records, and it is a defect no
 * amount of demoting or widening repairs: it means a rule displaced a line that nothing asked to
 * be displaced.
 */
export function edgesIncoherent(text: MeasuredText, tolerancePx: number): boolean {
  if (text.layout === "stagger" || text.layout === "cascade") return false;
  return text.lineGeometry.edgeSpread > tolerancePx;
}

/** The line limit for an emphasis at a breakpoint, or `null` where §3.1 sets none. */
export function lineLimit(mode: Breakpoint, emphasis: string | null): number | null {
  if (emphasis !== "display" && emphasis !== "primary") return null;
  return LINE_LIMITS[mode][emphasis] ?? null;
}
