import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import {
  DESKTOP,
  MOBILE,
  becomesVisible,
  hasHorizontalScroll,
  launchBrowser,
  newPage,
  startApp,
  undersizedTapTargets,
  type AppServer,
} from "./harness";

/**
 * The Phase 2 surfaces in a real browser at the two canonical widths
 * (spec.md §7.1, §22; design-system §7.3, §7.6).
 *
 * What this asserts is what a browser can settle on its own: the composer is the landing
 * page, it works and keeps its text at 390 and 1280, the sign-in surface offers the canonical
 * options, and none of the forbidden onboarding furniture is present. The persisted path is
 * covered in tests/db (the claim and its retries) and in the unit suites (the callback's
 * decisions), so nothing here needs a live database to be meaningful.
 */

let app: AppServer | null;
let browser: Browser;

const PROMPT =
  "A calm spring baby shower in a walled garden — sage & cream, long tables, lemon tart.";

beforeAll(async () => {
  app = await startApp();
  if (app) browser = await launchBrowser();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await app?.stop();
});

function requireApp(): AppServer {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  return app;
}

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("landing composer at %s", (_label, viewport) => {
  it("is the landing page: the prompt, inspiration and create action, nothing before them", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });

      expect(await page.locator("h1").innerText()).toMatch(/Describe your event/i);
      expect(await becomesVisible(page, "#prompt")).toBe(true);
      expect(await page.getByRole("button", { name: /add inspiration/i }).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: /create my event/i }).isVisible()).toBe(true);
      expect(await page.getByRole("link", { name: /^sign in$/i }).isVisible()).toBe(true);

      // §32 #3 and #6: nothing stands between arriving and writing. The canonical
      // reassurance line says "No templates", so the check is for a gallery, not the word.
      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const forbidden of [
        "browse templates",
        "choose a template",
        "start from a template",
        "template gallery",
        "choose a theme",
        "step 1",
        "create an account to",
      ]) {
        expect(body, forbidden).not.toContain(forbidden);
      }
      expect(await page.locator("input[type=password]").count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("does not scroll sideways and keeps tap targets reachable", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      expect(await hasHorizontalScroll(page)).toBe(false);
      await page.locator("#prompt").fill(PROMPT);
      expect(await hasHorizontalScroll(page)).toBe(false);
      if (viewport.width <= 700) {
        // design-system §7.6: touch targets are at least 44x44 on mobile.
        expect(await undersizedTapTargets(page, "button, a[href]")).toEqual([]);
      }
    } finally {
      await close();
    }
  });

  it("gives the composer the first viewport without cutting it off", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      const box = await page.locator("#prompt").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeLessThan(viewport.height);
      expect(box!.width).toBeLessThanOrEqual(viewport.width);
      if (viewport.width >= 1024) {
        // design-system §4.1: a real desktop layout, composer about 640-800px, not full bleed.
        expect(box!.width).toBeLessThan(viewport.width * 0.85);
      }
    } finally {
      await close();
    }
  });
});

describe("the composer keeps what the visitor wrote", () => {
  it("restores the prompt after a reload, without a server draft", async () => {
    const { page, close } = await newPage(browser, MOBILE);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#prompt").fill(PROMPT);
      await page.locator("#prompt").blur();
      // The local mirror is §7.2 step 3 client state and the safety net behind a restore
      // failure; it must hold the text exactly, including punctuation and the em dash.
      await page.waitForFunction(
        (expected) => Object.values(localStorage).some((v) => v.includes(expected)),
        PROMPT.slice(0, 40),
        { timeout: 10_000 },
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        (expected) =>
          (document.querySelector("#prompt") as HTMLTextAreaElement)?.value === expected,
        PROMPT,
        { timeout: 10_000 },
      );
      expect(await page.locator("#prompt").inputValue()).toBe(PROMPT);
    } finally {
      await close();
    }
  });

  it("tells the visitor when a saved idea could not be restored, and keeps their text", async () => {
    const { page, close } = await newPage(browser, MOBILE);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#prompt").fill(PROMPT);
      await page.locator("#prompt").blur();
      await page.waitForFunction(
        (expected) => Object.values(localStorage).some((v) => v.includes(expected)),
        PROMPT.slice(0, 40),
        { timeout: 10_000 },
      );

      await page.goto(`${requireApp().baseUrl}/?restore=expired`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForFunction(
        (expected) =>
          (document.querySelector("#prompt") as HTMLTextAreaElement)?.value === expected,
        PROMPT,
        { timeout: 10_000 },
      );
      expect(await page.locator("#prompt").inputValue()).toBe(PROMPT);
      const body = await page.locator("body").innerText();
      expect(body).toMatch(/could not|couldn['’]t|expired|still here/i);
    } finally {
      await close();
    }
  });

  it("will not submit an empty composer", async () => {
    const { page, close } = await newPage(browser, DESKTOP);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      const create = page.getByRole("button", { name: /create my event/i });
      expect(await create.isDisabled()).toBe(true);
      await page.locator("#prompt").fill("A baby shower");
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find((b) =>
            /create my event/i.test(b.textContent ?? ""),
          )?.disabled,
        undefined,
        { timeout: 5_000 },
      );
      expect(await create.isDisabled()).toBe(false);
    } finally {
      await close();
    }
  });
});

describe("auth/save surface", () => {
  it("offers the canonical sign-in options and no profile wizard", async () => {
    const { page, close } = await newPage(browser, MOBILE);
    try {
      await page.goto(`${requireApp().baseUrl}/signin`, { waitUntil: "domcontentloaded" });
      expect(await becomesVisible(page, "input[type=email]")).toBe(true);
      expect(
        await page
          .getByRole("button", { name: /link|continue|send/i })
          .first()
          .isVisible(),
      ).toBe(true);
      // design-system §4.2: lightweight. No password, no profile fields.
      expect(await page.locator("input[type=password]").count()).toBe(0);
      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const forbidden of ["first name", "last name", "company", "how did you hear"]) {
        expect(body, forbidden).not.toContain(forbidden);
      }
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("shows a single friendly line when the provider refused", async () => {
    const { page, close } = await newPage(browser, DESKTOP);
    try {
      await page.goto(`${requireApp().baseUrl}/signin?error=provider`, {
        waitUntil: "domcontentloaded",
      });
      const body = await page.locator("body").innerText();
      expect(body).toMatch(/sign|try again|again/i);
      expect(body).not.toMatch(/undefined|null|\[object/i);
    } finally {
      await close();
    }
  });
});

describe("the generation and details surface is private", () => {
  it("does not reveal whether an event exists to someone who cannot see it", async () => {
    const { page, close } = await newPage(browser, MOBILE);
    try {
      const response = await page.goto(
        `${requireApp().baseUrl}/events/00000000-0000-4000-8000-000000000000/create`,
        { waitUntil: "domcontentloaded" },
      );
      expect(response?.status()).toBeLessThan(500);
      const body = (await page.locator("body").innerText()).toLowerCase();
      expect(body).not.toContain("forbidden");
      expect(body).not.toMatch(/stack|at object|supabase/i);
    } finally {
      await close();
    }
  });
});
