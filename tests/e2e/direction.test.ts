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
 * `Try another direction` in a real browser at 390 and 1280 (`docs/screen-spec.md`
 * `try-another-direction`; `spec.md §31` — Try another direction; Card experience), driven through
 * the development fixture /dev/generation: the box, the wait and the new card's reveal from fixture
 * data, no database. Screenshots go to SHOTS when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.GENERATION_SHOTS_DIR;
const EVENT = "00000000-0000-4000-8000-000000000000";

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
  reducedMotion: "reduce" | "no-preference" = "no-preference",
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const context = await browser.newContext({
    viewport,
    reducedMotion,
    isMobile: viewport.width <= 700,
    hasTouch: viewport.width <= 700,
  });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}/dev/generation?${query}`, { waitUntil: "networkidle" });
  return { page, close: () => context.close() };
}

async function shot(page: Page, viewport: { width: number }, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: path.join(SHOTS, `${name}-${viewport.width}.png`),
    fullPage: true,
  });
}

/** Words the host never sees (`docs/screen-spec.md` global rules; `spec.md §10`, §26). */
const INTERNAL =
  /Event Identity|art mode|\blayout\b|\bink\b|\bpanel\b|\d+\s?%|GPT|OpenAI|token|credit|remaining|\d+\s*\/\s*500/i;

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("try another direction at %s", (_label, viewport) => {
  it("box: the card, the question, the helper and the reassurance; no counter, no credits", async () => {
    const { page, close } = await openFixture(viewport, "state=direction-box");
    try {
      await page.getByRole("heading", { name: "What should we change?" }).waitFor();
      await page.getByText("Say what to change, or leave it empty for a new idea.").waitFor();
      await page.getByText("Your event details stay exactly as they are.").waitFor();
      await page.getByRole("button", { name: "Make a new card" }).waitFor();
      const back = page.getByRole("link", { name: "Back to your card" });
      expect(await back.getAttribute("href")).toBe(`/events/${EVENT}`);
      // The card being changed is on screen, small, above the box.
      const card = page.locator("[data-direction-current] [data-invitation-card]");
      const cardBox = await card.boundingBox();
      expect(cardBox!.width).toBeLessThan(200);
      const heading = await page
        .getByRole("heading", { name: "What should we change?" })
        .boundingBox();
      expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(heading!.y);
      // One box, optional, no upload and no character counter.
      expect(await page.getByRole("textbox").count()).toBe(1);
      expect(await page.locator("input[type=file]").count()).toBe(0);
      expect(await page.locator("body").innerText()).not.toMatch(INTERNAL);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "direction-box");
    } finally {
      await close();
    }
  });

  it("box: an empty box is a new idea; words are sent trimmed", async () => {
    const { page, close } = await openFixture(viewport, "state=direction-box");
    try {
      await page.getByRole("button", { name: "Make a new card" }).click();
      await page.getByText("Sent: a new idea").waitFor();
      await page.getByRole("textbox").fill("  add a little dinosaur  ");
      await page.getByRole("button", { name: "Make a new card" }).click();
      await page.getByText("Sent: add a little dinosaur", { exact: true }).waitFor();
    } finally {
      await close();
    }
  });

  it("box: more than 500 characters is refused plainly, 500 is not, and typing shows no counter", async () => {
    const { page, close } = await openFixture(viewport, "state=direction-box");
    try {
      const box = page.getByRole("textbox");
      await box.fill("x".repeat(501));
      expect(await page.locator("body").innerText()).not.toMatch(
        /501|500\s*\/|\d+ (characters )?left/i,
      );
      await page.getByRole("button", { name: "Make a new card" }).click();
      const alert = page.locator("[role=alert]:not(#__next-route-announcer__)");
      await alert.waitFor({ state: "visible" });
      expect(await alert.innerText()).toMatch(/keep it to 500 characters or fewer/);
      expect(await page.locator("[data-fixture-submitted]").count()).toBe(0);
      // The words are kept, and editing clears the message.
      expect((await box.inputValue()).length).toBe(501);
      await box.fill("y".repeat(500));
      expect(await page.locator("[role=alert]:not(#__next-route-announcer__)").count()).toBe(0);
      await page.getByRole("button", { name: "Make a new card" }).click();
      await page.locator("[data-fixture-submitted]").waitFor();
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("wait: the honest panel with the design's words, the current card stays, no counters", async () => {
    const { page, close } = await openFixture(viewport, "state=direction-wait");
    try {
      await page.getByRole("heading", { name: "Making your new card…" }).waitFor();
      await page
        .getByText("Your current card stays as it is until you choose the new one.")
        .waitFor();
      await page.getByText("Painting the artwork").waitFor();
      expect(await page.locator('[data-generation-artifact="design"]').innerText()).toContain(
        "Lemons & Linen",
      );
      expect(await page.getByRole("button", { name: "Try again" }).count()).toBe(0);
      expect(await page.getByRole("link", { name: "Back to your card" }).count()).toBe(1);
      expect(await page.locator("body").innerText()).not.toMatch(INTERNAL);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "direction-wait");
    } finally {
      await close();
    }
  });

  for (const [code, retry] of [
    ["provider_error", true],
    ["event_cap", false],
    ["published", false],
    ["no_design", false],
  ] as [string, boolean][]) {
    it(`failure ${code}: honest copy, ${retry ? "with" : "without"} Try again, a way back`, async () => {
      const { page, close } = await openFixture(viewport, `state=direction-failed&code=${code}`);
      try {
        await page
          .locator("[role=alert]:not(#__next-route-announcer__)")
          .waitFor({ state: "visible" });
        expect(await page.getByRole("button", { name: "Try again" }).count()).toBe(retry ? 1 : 0);
        expect(await page.getByRole("link", { name: "Back to your card" }).count()).toBe(1);
        expect(await page.locator("body").innerText()).not.toMatch(INTERNAL);
        expect(await hasHorizontalScroll(page)).toBe(false);
        await shot(page, viewport, `direction-failed-${code}`);
      } finally {
        await close();
      }
    });
  }

  it("new card: revealed from its envelope, with its name and its three actions", async () => {
    const { page, close } = await openFixture(viewport, "state=direction-reveal&delay=300");
    try {
      await page.getByRole("button", { name: /Lemons & Linen/ }).click();
      await page.locator("[data-invitation-card]").waitFor({ state: "visible" });
      await page.locator("[data-direction-actions]").waitFor({ state: "visible", timeout: 5_000 });
      const reveal = await page.locator("[data-reveal-actions]").innerText();
      expect(reveal).toContain("Lemons & Linen");
      expect(reveal).toContain("A lemon branch over soft linen.");
      // The first card's message is not repeated for a new direction.
      expect(reveal).not.toMatch(/Make it yours/);
      await page.getByRole("button", { name: "Choose this direction" }).waitFor();
      const keep = page.getByRole("link", { name: "Keep current" });
      expect(await keep.getAttribute("href")).toBe(`/events/${EVENT}`);
      const another = page.getByRole("link", { name: /Try another direction/ });
      expect(await another.getAttribute("href")).toBe(
        `/events/${EVENT}/direction?from=fixture-design`,
      );
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await page.locator("body").innerText()).not.toMatch(INTERNAL);
      await shot(page, viewport, "direction-reveal");
    } finally {
      await close();
    }
  });

  it("new card: choosing goes on, and a refusal is shown plainly", async () => {
    const ok = await openFixture(viewport, "state=direction-reveal");
    try {
      await ok.page.getByRole("button", { name: /Lemons & Linen/ }).click();
      await ok.page.getByRole("button", { name: "Choose this direction" }).click();
      await ok.page.locator("[data-fixture-chosen]").waitFor();
    } finally {
      await ok.close();
    }
    const refused = await openFixture(viewport, "state=direction-reveal&choose=published");
    try {
      await refused.page.getByRole("button", { name: /Lemons & Linen/ }).click();
      await refused.page.getByRole("button", { name: "Choose this direction" }).click();
      const alert = refused.page.locator("[role=alert]:not(#__next-route-announcer__)");
      await alert.waitFor({ state: "visible" });
      expect(await alert.innerText()).toMatch(/published, so its card stays as it is/);
      expect(await refused.page.locator("[data-fixture-chosen]").count()).toBe(0);
      // The host can try again: the button is live again.
      expect(
        await refused.page.getByRole("button", { name: "Choose this direction" }).isDisabled(),
      ).toBe(false);
      await shot(refused.page, viewport, "direction-choose-refused");
    } finally {
      await refused.close();
    }
  });

  it("reduced motion: the new card opens without animation", async () => {
    const { page, close } = await openFixture(viewport, "state=direction-reveal", "reduce");
    try {
      await page.getByRole("button", { name: /Lemons & Linen/ }).click();
      const card = page.locator("[data-envelope-card]");
      await card.waitFor({ state: "visible", timeout: 1_500 });
      expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
      await page.locator("[data-direction-actions]").waitFor({ state: "visible", timeout: 1_500 });
    } finally {
      await close();
    }
  });
});
