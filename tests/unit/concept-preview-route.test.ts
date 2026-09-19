import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The concept preview is the real page, or it is nothing.
 *
 * `spec.md §31 — Concept experience` requires that "three concepts use live production renderer",
 * and the failure mode this guards is a cheap one to reach for: a thumbnail, a cached screenshot,
 * a static approximation, an iframe of something else. Any of those makes the preview a picture of
 * a site rather than the site, and a host would be choosing between images of pages they have not
 * actually been shown.
 *
 * This is a source-shape assertion rather than a render, because the route is an async server
 * component whose every input is a database read — rendering it in a unit test would prove the
 * mock, not the route. What it is worth is exactly this: it cannot be quietly replaced by an
 * approximation without failing. That the rendered page itself is correct at 390 and 1280 is
 * proven where it can be: rendered-geometry verification, which every persisted spec must pass
 * before it exists, and the screenshots each live smoke writes from the same document.
 */
const ROUTE = path.resolve("src/app/events/[id]/concepts/[index]/page.tsx");

/**
 * Comments stripped before matching.
 *
 * The route's own header says in prose that it is "not a thumbnail, not a screenshot", which is
 * exactly the sentence a naive search for those words would trip over — and a test that fails on
 * a comment saying the right thing teaches everyone to weaken the test.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the concept preview renders the production renderer", () => {
  const source = code(readFileSync(ROUTE, "utf8"));

  it("imports EventPage from the event renderer", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bEventPage\b[^}]*\}\s*from\s*"@\/components\/event-renderer\/page"/,
    );
  });

  it("renders it, rather than merely importing it", () => {
    expect(source).toMatch(/<EventPage\b/);
  });

  it("hands it a persisted resolved spec", () => {
    // The spec comes out of `resolved_design_specs`, not out of a recompile: generated design data
    // is immutable and a preview that recompiled would be showing a different page from the one
    // that was verified (`spec.md §32 #20`).
    expect(source).toContain("resolved_design_specs");
    expect(source).toMatch(/spec=\{/);
  });

  it("substitutes no image, thumbnail, snapshot or embedded frame for the page", () => {
    for (const substitute of [
      /<img\b/,
      /<iframe\b/i,
      /thumbnail/i,
      /screenshot/i,
      /placeholder/i,
    ]) {
      expect(source).not.toMatch(substitute);
    }
  });

  it("tells the renderer the truth about unconfigured features", () => {
    // No registry, gift, guest or RSVP-party table exists for an event at this stage, so the
    // truthful presentation state is the empty one — and passing it is what keeps an unconfigured
    // RSVP or registry out of the guest view (`docs/event-renderer-system.md §2.3`).
    expect(source).toContain("NOTHING_CONFIGURED");
  });
});
