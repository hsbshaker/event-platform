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
 * The house envelope in a real browser at 390 and 1280 (spec.md §31 — Card rendering and
 * envelope; design-system §8.3, §8.5, §10.20), driven through the development fixture
 * /dev/envelope, where a plain block stands in for the card.
 */

let app: AppServer | null;
let browser: Browser;

beforeAll(async () => {
  app = await startApp();
  if (app) browser = await launchBrowser();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await app?.stop();
});

const CARD_TEXT = "Placeholder card content";

async function openFixture(
  viewport: { width: number; height: number },
  query = "",
  reducedMotion: "reduce" | "no-preference" = "no-preference",
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/dev/envelope${query}`, { waitUntil: "networkidle" });
  return { page, close: () => context.close() };
}

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("envelope at %s", (_label, viewport) => {
  for (const proportion of ["portrait", "square"] as const) {
    it(`${proportion}: closed button is named with the title, opens by keyboard, focus lands on the card`, async () => {
      const { page, close } = await openFixture(viewport, `?proportion=${proportion}`);
      try {
        const button = page.getByRole("button", { name: /Maya & Jonas: Garden Supper/ });
        await button.waitFor({ state: "visible" });
        // Nothing of the card until the guest acts.
        expect(await page.getByText(CARD_TEXT).count()).toBe(0);
        expect(await hasHorizontalScroll(page)).toBe(false);

        await button.focus();
        await page.keyboard.press("Enter");

        const card = page.locator("[data-envelope-card]");
        await card.waitFor({ state: "visible" });
        await page.getByText(CARD_TEXT).waitFor({ state: "visible" });
        expect(await card.evaluate((el) => el === document.activeElement)).toBe(true);
        expect(await hasHorizontalScroll(page)).toBe(false);

        // Settles: the animation completes and the envelope shell is gone.
        await page.waitForFunction(
          () => document.querySelectorAll(".envelope-shell-opening").length === 0,
          undefined,
          { timeout: 3_000 },
        );
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.width / box!.height).toBeCloseTo(proportion === "portrait" ? 5 / 7 : 1, 1);

        // Focus is not trapped: Tab leaves the card container.
        await page.keyboard.press("Tab");
        expect(await card.evaluate((el) => el === document.activeElement)).toBe(false);
      } finally {
        await close();
      }
    });
  }

  it("reduced motion shows the card at once with no animation", async () => {
    const { page, close } = await openFixture(viewport, "", "reduce");
    try {
      await page.getByRole("button", { name: /Garden Supper/ }).click();
      const card = page.locator("[data-envelope-card]");
      await card.waitFor({ state: "visible", timeout: 500 });
      expect(await page.locator(".envelope-shell-opening, .envelope-card-opening").count()).toBe(0);
      expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
      expect(await card.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await close();
    }
  });

  it("sealed shows the title and the gate slot, and nothing of the card", async () => {
    const { page, close } = await openFixture(viewport, "?sealed=1");
    try {
      await page.getByRole("heading", { name: /Garden Supper/ }).waitFor({ state: "visible" });
      await page.getByText("Event code goes here").waitFor({ state: "visible" });
      expect(await page.getByRole("button", { name: /Garden Supper/ }).count()).toBe(0);
      expect(await page.locator("[data-envelope-card]").count()).toBe(0);
      expect(await page.getByText(CARD_TEXT).count()).toBe(0);
      expect(await page.content()).not.toContain(CARD_TEXT);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("a failing onOpen returns to closed with a plain retry, and the retry opens", async () => {
    const { page, close } = await openFixture(viewport, "?failFirst=1&delay=150");
    try {
      await page.getByRole("button", { name: /Garden Supper/ }).click();
      await page.getByText(/couldn.t open the invitation/i).waitFor({ state: "visible" });
      expect(await page.locator("[data-envelope-card]").count()).toBe(0);
      await page.getByRole("button", { name: /try again/i }).click();
      await page.locator("[data-envelope-card]").waitFor({ state: "visible" });
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });
});
