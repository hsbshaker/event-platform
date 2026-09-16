import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";

import {
  DESKTOP,
  MOBILE,
  hasHorizontalScroll,
  launchBrowser,
  newPage,
  undersizedTapTargets,
} from "./harness";
import { EventIdentityPanel } from "@/app/events/[id]/create/EventIdentityPanel";
import type { IdentityView } from "@/lib/generation/identity-view";

/**
 * The clarification surface at the two canonical widths, in a real browser, with the real CSS.
 *
 * **Why it is built this way.** The panel lives on `/events/[id]/create`, which needs an
 * authenticated host and a live Supabase to render at all; this environment has neither, and the
 * one deployment that does would make real provider calls to exercise. So the document under test
 * is assembled from the production component through `renderToStaticMarkup` and the stylesheet the
 * production build actually emitted. Nothing is mocked into the markup and no test-only route
 * ships: what the browser lays out is exactly what React produces for that component, styled by
 * exactly the app's own CSS.
 *
 * **What that means it can and cannot prove.** It proves what only a browser can settle — layout
 * at 390 and 1280, horizontal overflow, tap-target size, keyboard traversal and a visible focus
 * ring — all of which are native behaviour on the elements this surface uses and need no React
 * handlers. It cannot prove state transitions; those are driven in
 * `EventIdentityPanel.component.test.tsx`, and the orchestration behind them against real Postgres
 * in `tests/db/phase4b-t10.test.ts`. Each claim is made where it is actually settled.
 *
 * Acceptance criteria: `spec.md §31 — Responsive/accessibility`; `§22`;
 * `docs/design-system.md §7.3`, `§7.6`, `§14`.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * The stylesheet the production build actually emitted, found by extension rather than by name:
 * Next hashes it, and hard-coding a hash would silently stop testing the real CSS the first time
 * it changed.
 */
function stylesheet(): string | null {
  for (const base of [
    path.join(ROOT, ".next", "static", "css"),
    path.join(ROOT, ".next", "static", "chunks"),
  ]) {
    try {
      const file = readdirSync(base).find((f) => f.endsWith(".css"));
      if (file) return readFileSync(path.join(base, file), "utf8");
    } catch {
      // Not this directory; try the next.
    }
  }
  return null;
}

function documentFor(view: IdentityView, css: string): string {
  const markup = renderToStaticMarkup(
    createElement(EventIdentityPanel, { eventId: "e2e", initial: view }),
  );
  // The same wrapper the page puts the panel in, so the width it is laid out at is the real one.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head>
<body class="bg-app-bg"><main class="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col gap-8 px-4 py-10 lg:py-14">
<div class="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">${markup}
<div class="rounded-2xl border border-app-border bg-app-surface p-5">Details form stands here.</div>
</div></main></body></html>`;
}

const BOUNDARY: IdentityView = {
  state: "clarification_required",
  hasAuthoritativeIdentity: false,
  revision: 1,
  questions: [
    {
      kind: "boundary",
      index: 0,
      question:
        "Is this a surprise, or does she already know? We shouldn't decide that on her behalf.",
      options: [
        { label: "She already knows", isDefer: false },
        { label: "It's a surprise", isDefer: false },
      ],
    },
  ],
};

const CREATIVE: IdentityView = {
  state: "ready",
  hasAuthoritativeIdentity: true,
  revision: 2,
  questions: [
    {
      kind: "creative",
      index: 0,
      question: "Should the feeling lean warm and golden, or cool and green?",
      options: [
        { label: "Warm and golden", isDefer: false },
        { label: "Cool and green", isDefer: false },
        { label: "You choose", isDefer: true },
      ],
    },
  ],
};

const RUNNING: IdentityView = { state: "running", hasAuthoritativeIdentity: false };

let browser: Browser;
let css: string | null;

beforeAll(async () => {
  css = stylesheet();
  if (css) browser = await launchBrowser();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

function requireCss(): string {
  if (!css) throw new Error("No built stylesheet found; run `npm run build` first.");
  return css;
}

async function open(view: IdentityView, viewport: { width: number; height: number }) {
  const { page, close } = await newPage(browser, viewport);
  await page.setContent(documentFor(view, requireCss()), { waitUntil: "load" });
  return { page, close };
}

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("the clarification surface at %s", (label, viewport) => {
  it("shows a boundary question without pushing the page sideways", async () => {
    const { page, close } = await open(BOUNDARY, viewport);
    try {
      expect(await page.locator("h2").innerText()).toMatch(/one question before we start/i);
      expect(await page.locator("legend").innerText()).toMatch(/is this a surprise/i);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("gives every option and the submit control a comfortable target", async () => {
    const { page, close } = await open(BOUNDARY, viewport);
    try {
      // `docs/design-system.md §7.6`: at least 44 x 44 where practical. Measured, not assumed.
      expect(await undersizedTapTargets(page, "label:has(input[type=radio])")).toEqual([]);
      expect(await undersizedTapTargets(page, "button")).toEqual([]);
    } finally {
      await close();
    }
  });

  it("lets a keyboard reach and move through the options, visibly", async () => {
    const { page, close } = await open(BOUNDARY, viewport);
    try {
      await page.keyboard.press("Tab");
      const first = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        value: (document.activeElement as HTMLInputElement | null)?.value,
      }));
      expect(first.tag).toBe("INPUT");
      expect(first.value).toBe("She already knows");

      // Native radio-group traversal: arrow keys move within the group, Tab leaves it.
      await page.keyboard.press("ArrowDown");
      expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe(
        "It's a surprise",
      );

      // The focus ring is drawn by the label's `has-[:focus-visible]` outline, so it is the
      // option row that shows focus rather than a hairline on the control alone.
      const outline = await page.evaluate(() => {
        const label = document.activeElement?.closest("label");
        return label ? getComputedStyle(label).outlineStyle : "none";
      });
      expect(outline).not.toBe("none");

      await page.keyboard.press("Tab");
      const next = await page.evaluate(() => document.activeElement?.tagName);
      expect(next).toBe("BUTTON");
    } finally {
      await close();
    }
  });

  it("names its submit control for a screen reader", async () => {
    const { page, close } = await open(BOUNDARY, viewport);
    try {
      const name = await page.getByRole("button").first().innerText();
      expect(name.trim().length).toBeGreaterThan(0);
      expect(name).toMatch(/continue/i);
    } finally {
      await close();
    }
  });

  it("keeps a Route A question beside a ready identity rather than over it", async () => {
    const { page, close } = await open(CREATIVE, viewport);
    try {
      expect(await page.locator("h2").innerText()).toMatch(/ready/i);
      expect(await page.locator("legend").innerText()).toMatch(/warm and golden|feeling lean/i);
      // Never a modal: Route A does not gate, so it must not trap anyone either.
      expect(await page.locator("[role=dialog]").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await undersizedTapTargets(page, "label:has(input[type=radio])")).toEqual([]);
    } finally {
      await close();
    }
  });

  it("says something true while running, and nothing that looks like progress", async () => {
    const { page, close } = await open(RUNNING, viewport);
    try {
      const body = await page.locator("body").innerText();
      expect(body).toMatch(/working out the creative direction/i);
      expect(body).not.toMatch(/\d+\s?%/);
      expect(await page.locator("progress, [role=progressbar]").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });
});

describe("the desktop layout is a desktop layout", () => {
  it("puts the panel in its own column rather than centring a phone", async () => {
    const { page, close } = await open(BOUNDARY, DESKTOP);
    try {
      const { panel, viewportWidth } = await page.evaluate(() => ({
        panel: document.querySelector("section")!.getBoundingClientRect().width,
        viewportWidth: document.documentElement.clientWidth,
      }));
      // `docs/design-system.md §7.3`: a real desktop layout, not a 390 frame on a big canvas.
      // The grid gives the panel a fixed column beside the form, so it is a minority of the width.
      expect(panel).toBeGreaterThan(300);
      expect(panel).toBeLessThan(viewportWidth * 0.5);
    } finally {
      await close();
    }
  });
});
