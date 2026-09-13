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

export interface MeasuredText {
  /** The canonical node id this text belongs to, from `data-id` on it or its nearest ancestor. */
  readonly id: string | null;
  /** The emphasis it actually rendered at, read back off its `ev-em-*` class. */
  readonly emphasis: string | null;
  readonly lines: number;
  readonly fontPx: number;
  readonly lineHeightPx: number;
  readonly box: Box;
  readonly containerBox: Box;
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

  function escapes(inner: Box, outer: Box): boolean {
    return inner.right > outer.right + tol || inner.left < outer.left - tol;
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
    const emphasisMatch = /(?:^|\s)ev-em-([a-z]+)(?:\s|$)/.exec(el.className);
    texts.push({
      id: canonicalId(el),
      emphasis: emphasisMatch ? emphasisMatch[1] : null,
      lines: Math.max(1, Math.round(b.height / lineHeightPx)),
      fontPx,
      lineHeightPx,
      box: b,
      containerBox: cb,
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

/** The line limit for an emphasis at a breakpoint, or `null` where §3.1 sets none. */
export function lineLimit(mode: Breakpoint, emphasis: string | null): number | null {
  if (emphasis !== "display" && emphasis !== "primary") return null;
  return LINE_LIMITS[mode][emphasis] ?? null;
}
