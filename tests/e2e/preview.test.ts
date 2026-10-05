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
 * Preview in a real browser at 390 and 1280 (`docs/screen-spec.md` `preview`; `spec.md §31` —
 * Creation Mode, Card rendering and envelope, Responsive/accessibility), driven through the
 * development fixture /dev/preview, no database, no model call: the production envelope opens on
 * tap (or at once under reduced motion) to the card and the guest page; no owner controls; facts
 * the host has not saved are absent, with the one plain line; the Mobile / Desktop toggle on wide
 * screens only; `Back to editing`; no sideways scroll; readable chrome text. Screenshots go to
 * PREVIEW_SHOTS_DIR when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.PREVIEW_SHOTS_DIR;
const HIDDEN_LINE = "Details you haven't confirmed aren't shown to guests.";

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
  url: string,
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
  await page.goto(`${app.baseUrl}${url}`, { waitUntil: "networkidle" });
  return { page, close: () => context.close() };
}

/** Opens the envelope and waits for the card to be in it. */
async function openEnvelope(page: Page) {
  await page.getByRole("button", { name: /Lemons & Linen/ }).click();
  await page.locator("[data-preview-card]").waitFor({ state: "visible" });
  // Past the opening animation.
  await page.waitForFunction(
    () => (document.querySelector("[data-envelope-card]")?.getAnimations?.() ?? []).length === 0,
  );
}

async function shot(page: Page, viewport: { width: number }, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: path.join(SHOTS, `${name}-${viewport.width}.png`),
    fullPage: true,
  });
}

/** WCAG contrast of an element's text colour against its first opaque ancestor background. */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => {
        const channel = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const fg = parse(getComputedStyle(el).color);
      let node: Element | null = el;
      let bg = [255, 255, 255];
      while (node) {
        const rgba = parse(getComputedStyle(node).backgroundColor);
        if (rgba.length >= 3 && (rgba.length === 3 || rgba[3] > 0.99)) {
          bg = rgba;
          break;
        }
        node = node.parentElement;
      }
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    });
}

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("preview at %s", (_label, viewport) => {
  const wide = viewport.width >= 1024;

  it("opens from the envelope to the card, then the guest page, with no owner controls", async () => {
    const { page, close } = await openFixture(viewport, "/dev/preview?data=full");
    try {
      await page.getByRole("button", { name: /Lemons & Linen/ }).waitFor();
      // Closed: the card is not on screen yet.
      expect(await page.locator("[data-preview-card]").count()).toBe(0);
      await shot(page, viewport, "preview-closed");
      await openEnvelope(page);

      const card = (await page.locator("[data-preview-card]").textContent()) ?? "";
      for (const text of ["Lemons & Linen", "Maya Lopez", "Villa Rosa", "Saturday, December 19"]) {
        expect(card).toContain(text);
      }
      const details = page.locator("[data-section=details]");
      expect(await details.textContent()).toContain("Villa Rosa");
      // Order: the envelope's card, then the page.
      const cardBox = await page.locator("[data-preview-card]").boundingBox();
      const pageBox = await page.locator("[data-event-page]").boundingBox();
      expect(cardBox && pageBox && cardBox.y < pageBox.y).toBe(true);

      // No owner controls, readiness pill, toolbar, anchors or markers.
      for (const selector of [
        "[data-toolbar]",
        "[data-setup-pill]",
        "[data-collaborator-anchor]",
        "[data-needs-confirming]",
      ]) {
        expect(await page.locator(selector).count(), selector).toBe(0);
      }
      expect(await page.getByRole("button", { name: /^(Edit|Add|Design|Publish)/ }).count()).toBe(
        0,
      );
      // Nothing is missing: no line about hidden details.
      expect(await page.locator("[data-preview-hidden]").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "preview-full");
    } finally {
      await close();
    }
  });

  it("leaves out facts the host has not saved, and says so in one plain line", async () => {
    const { page, close } = await openFixture(viewport, "/dev/preview?data=empty");
    try {
      expect(await page.locator("[data-preview-hidden]").textContent()).toBe(HIDDEN_LINE);
      await openEnvelope(page);
      const card = (await page.locator("[data-preview-card]").textContent()) ?? "";
      expect(card).toContain("Lemons & Linen");
      expect(card).toContain("Please join us for a garden shower");
      const body = (await page.locator("body").textContent()) ?? "";
      for (const text of ["to be announced", "Needs confirming", "Saturday", "1:00 pm"]) {
        expect(card + body, text).not.toContain(text);
      }
      // The page has the title and no fact rows.
      expect(await page.locator("[data-section=details] dt").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "preview-empty");
    } finally {
      await close();
    }
  });

  it("never shows a value only the prompt stated", async () => {
    const { page, close } = await openFixture(viewport, "/dev/preview?data=prompt");
    try {
      await openEnvelope(page);
      const body = (await page.locator("body").textContent()) ?? "";
      for (const text of ["December 19", "Villa Rosa", "Maya Lopez", "Ana & Leo", "2pm"]) {
        expect(body, text).not.toContain(text);
      }
      expect(await page.locator("[data-preview-hidden]").count()).toBe(1);
    } finally {
      await close();
    }
  });

  it("opens at once under reduced motion", async () => {
    const { page, close } = await openFixture(viewport, "/dev/preview?data=full", "reduce");
    try {
      await page.getByRole("button", { name: /Lemons & Linen/ }).click();
      await page.locator("[data-preview-card]").waitFor({ state: "visible" });
      expect(
        await page.locator("[data-envelope-card]").evaluate((e) => e.getAnimations().length),
      ).toBe(0);
    } finally {
      await close();
    }
  });

  it(
    wide ? "has a Mobile / Desktop toggle, Mobile by default" : "has no width toggle",
    async () => {
      const { page, close } = await openFixture(viewport, "/dev/preview?data=full");
      try {
        const toggle = page.locator("[data-preview-toggle]");
        const frame = page.locator("[data-preview-frame]");
        if (!wide) {
          expect(await toggle.isVisible()).toBe(false);
          return;
        }
        expect(await toggle.isVisible()).toBe(true);
        const mobile = toggle.getByRole("button", { name: "Mobile" });
        const desktop = toggle.getByRole("button", { name: "Desktop" });
        expect(await mobile.getAttribute("aria-pressed")).toBe("true");
        expect(await desktop.getAttribute("aria-pressed")).toBe("false");

        // Mobile: the page at a 390px phone's width, not a phone frame.
        await openEnvelope(page);
        const mobileWidth = (await frame.boundingBox())?.width ?? 0;
        expect(mobileWidth).toBeLessThanOrEqual(390 - 32 + 0.5);
        expect(mobileWidth).toBeGreaterThan(300);
        const pageMobile = (await page.locator("[data-event-page]").boundingBox())?.width ?? 0;
        expect(pageMobile).toBeLessThanOrEqual(390);
        await shot(page, viewport, "preview-mobile-width");

        // Desktop: the wide layout, with the envelope still open.
        await desktop.click();
        expect(await desktop.getAttribute("aria-pressed")).toBe("true");
        const desktopWidth = (await frame.boundingBox())?.width ?? 0;
        expect(desktopWidth).toBeGreaterThan(mobileWidth);
        expect(await page.locator("[data-preview-card]").isVisible()).toBe(true);
        expect(await hasHorizontalScroll(page)).toBe(false);
        await shot(page, viewport, "preview-desktop-width");

        await mobile.click();
        expect((await frame.boundingBox())?.width).toBeCloseTo(mobileWidth, 0);
        // Not stored: a new visit starts on Mobile.
        await page.reload({ waitUntil: "networkidle" });
        expect(await mobile.getAttribute("aria-pressed")).toBe("true");
      } finally {
        await close();
      }
    },
  );

  it("names itself, goes back to editing, and its chrome text is readable", async () => {
    const { page, close } = await openFixture(viewport, "/dev/preview?data=empty");
    try {
      expect(await page.locator("[data-preview-banner]").textContent()).toBe(
        "Preview — this is what your guests will see",
      );
      expect(await contrastOf(page, "[data-preview-banner]")).toBeGreaterThanOrEqual(4.5);
      expect(await contrastOf(page, "[data-preview-hidden]")).toBeGreaterThanOrEqual(4.5);
      const back = page.getByRole("link", { name: "Back to editing" });
      expect(await contrastOf(page, "a:has-text('Back to editing')")).toBeGreaterThanOrEqual(4.5);
      if (wide) {
        for (const name of ["Mobile", "Desktop"]) {
          const selector = `[data-preview-toggle] button:has-text('${name}')`;
          expect(await contrastOf(page, selector), name).toBeGreaterThanOrEqual(4.5);
        }
      }
      await back.click();
      await page.waitForURL(/\/dev\/creation\?data=empty/);
      await page.locator("[data-section=details]").waitFor();
    } finally {
      await close();
    }
  });

  it("is reached from the owner toolbar's Preview, beside Design", async () => {
    const { page, close } = await openFixture(viewport, "/dev/creation?data=empty");
    try {
      const toolbar = page.getByRole("group", { name: "Invitation tools" });
      expect(await toolbar.getByRole("button", { name: "Design" }).isVisible()).toBe(true);
      await toolbar.getByRole("link", { name: "Preview" }).click();
      await page.waitForURL(/\/dev\/preview\?data=empty/);
      await page.getByRole("button", { name: /Lemons & Linen/ }).waitFor();
    } finally {
      await close();
    }
  });
});
