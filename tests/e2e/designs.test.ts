import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import {
  DESKTOP,
  MOBILE,
  hasHorizontalScroll,
  launchBrowser,
  startApp,
  type AppServer,
} from "./harness";

/**
 * The designs list in a real browser at 390 and 1280 (`docs/screen-spec.md` `try-another-direction`,
 * "Designs list"; `spec.md §31` — Card experience), driven through the development fixture
 * /dev/designs with 1, 3 and 5 designs and a published variant, no database. Screenshots go to
 * DESIGNS_SHOTS_DIR when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.DESIGNS_SHOTS_DIR;

beforeAll(async () => {
  app = await startApp();
  if (app) browser = await launchBrowser();
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await app?.stop();
});

async function openFixture(
  viewport: { width: number; height: number },
  query: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width <= 700,
    hasTouch: viewport.width <= 700,
  });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/dev/designs?${query}`, { waitUntil: "networkidle" });
  return { page, close: () => context.close() };
}

async function shot(page: Page, viewport: { width: number }, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: path.join(SHOTS, `${name}-${viewport.width}.png`),
    fullPage: true,
  });
}

/** What the list must never carry: a ranking, a label or a score (`docs/design-system.md §10.21`). */
const RANKING = /\bbest\b|recommended|top pick|score|rank|\d+\s?%|match/i;

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("designs list at %s", (_label, viewport) => {
  it.each([1, 3, 5])(
    "%i designs: every entry shown with name and description, the active one marked, no scroll sideways",
    async (count) => {
      const { page, close } = await openFixture(viewport, `count=${count}&active=${count}`);
      try {
        await page.getByRole("heading", { name: "Your designs" }).waitFor();
        const entries = page.locator("[data-design-entry]");
        expect(await entries.count()).toBe(count);
        for (const heading of await entries.getByRole("heading").all()) {
          expect(((await heading.textContent()) ?? "").length).toBeGreaterThan(0);
        }
        // Order is by round: the first entry is the first design.
        expect(await entries.first().getByRole("heading").textContent()).toBe("Lemons & Linen");
        // Exactly the active one is marked, in text, and has no choose action.
        expect(await page.getByText("Current card").count()).toBe(1);
        const active = page.locator("[data-design-active]");
        expect(await active.count()).toBe(1);
        expect(await active.getByRole("button").count()).toBe(0);
        expect(await page.getByRole("button", { name: /Choose this direction/ }).count()).toBe(
          count - 1,
        );
        // Each card is the one card component, small, inside the viewport.
        for (const card of await page.locator("[data-design-entry] [data-invitation-card]").all()) {
          const box = await card.boundingBox();
          expect(box && box.width).toBeLessThan(viewport.width - 24);
        }
        expect(await hasHorizontalScroll(page)).toBe(false);
        expect((await page.locator("main").innerText()).match(RANKING)).toBeNull();
        await shot(page, viewport, `designs-${count}`);
      } finally {
        await close();
      }
    },
  );

  it("lays out one column on a phone and several on a desktop", async () => {
    const { page, close } = await openFixture(viewport, "count=5");
    try {
      await page.getByRole("heading", { name: "Your designs" }).waitFor();
      const xs = new Set<number>();
      for (const entry of await page.locator("[data-design-entry]").all()) {
        xs.add(Math.round((await entry.boundingBox())!.x));
      }
      expect(xs.size).toBe(viewport.width <= 700 ? 1 : 3);
    } finally {
      await close();
    }
  });

  it("published: read-only, every entry still shown, the active one marked, no choose action", async () => {
    const { page, close } = await openFixture(viewport, "count=3&published=1");
    try {
      await page.getByRole("heading", { name: "Your designs" }).waitFor();
      expect(await page.locator("[data-design-entry]").count()).toBe(3);
      expect(await page.getByText("Current card").count()).toBe(1);
      expect(await page.getByRole("button").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "designs-published");
    } finally {
      await close();
    }
  });

  it("choosing makes that design the current one; the others offer choosing", async () => {
    const { page, close } = await openFixture(viewport, "count=3&active=2");
    try {
      await page.getByRole("button", { name: "Choose this direction: Lemons & Linen" }).click();
      await page
        .locator("[data-design-active]")
        .getByRole("heading", { name: "Lemons & Linen" })
        .waitFor();
      expect(await page.getByText("Current card").count()).toBe(1);
      expect(await page.getByRole("button", { name: /Choose this direction/ }).count()).toBe(2);
      expect(
        await page.getByRole("button", { name: "Choose this direction: Moonlit Meadow" }).count(),
      ).toBe(1);
    } finally {
      await close();
    }
  });

  it("a refused choice shows plain copy and changes nothing", async () => {
    const { page, close } = await openFixture(viewport, "count=3&choose=published");
    try {
      await page.getByRole("button", { name: "Choose this direction: Lemons & Linen" }).click();
      await page.locator("[data-design-entry] [role=alert]").waitFor();
      expect(await page.locator("[data-design-entry] [role=alert]").textContent()).toContain(
        "published",
      );
      const active = page.locator("[data-design-active]");
      expect(await active.getByRole("heading").textContent()).toBe("Moonlit Meadow");
      await shot(page, viewport, "designs-refused");
    } finally {
      await close();
    }
  });
});
