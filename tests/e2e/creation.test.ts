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
 * Creation Mode's canvas in a real browser at 390 and 1280 (`docs/screen-spec.md` `creation-mode`,
 * `event-details-editor`; `spec.md §31` — Creation Mode, Responsive/accessibility), driven through
 * the development fixture /dev/creation, no database: the page's sections, the placeholders marked
 * in Creation Mode and absent in the guest variant, the collaborator anchors and their keyboard
 * use, the editor as a sheet on a phone and a panel on desktop, focus back on the anchor, no
 * sideways scroll, and readable text. Screenshots go to CREATION_SHOTS_DIR when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.CREATION_SHOTS_DIR;

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
  await page.goto(`${app.baseUrl}/dev/creation?${query}`, { waitUntil: "networkidle" });
  return { page, close: () => context.close() };
}

async function shot(page: Page, viewport: { width: number }, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: path.join(SHOTS, `${name}-${viewport.width}.png`),
    fullPage: true,
  });
}

/** A field's label, which may carry a required-field asterisk. */
function labelOf(label: string): RegExp {
  return new RegExp(`^${label}( \\*)?$`);
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
])("creation canvas at %s", (_label, viewport) => {
  it("renders the page's sections under the card, placeholders marked, no scroll sideways", async () => {
    const { page, close } = await openFixture(viewport, "data=empty");
    try {
      const details = page.locator("[data-section=details]");
      await details.waitFor();
      await expect(details.getByRole("heading", { level: 1 }).textContent()).resolves.toBe(
        "Lemons & Linen",
      );
      // Placeholders for date, time and venue, each marked as needing confirming.
      expect(await details.locator("[data-needs-confirming]").count()).toBeGreaterThanOrEqual(3);
      expect(await details.textContent()).toContain("Venue to be announced");
      // The description section exists in Creation Mode as the place to Add one.
      const description = page.locator("[data-section=description]");
      expect(await description.textContent()).toContain("Add a note for your guests");
      // Order: details, description, footer.
      const order = await page.evaluate(() =>
        [...document.querySelectorAll("[data-event-page] > *")].map((el) => el.tagName),
      );
      expect(order).toEqual(["SECTION", "SECTION", "FOOTER"]);
      expect(await page.locator("footer").textContent()).toContain("Made with");
      expect(await hasHorizontalScroll(page)).toBe(false);
      // Text on the page and the marker are readable.
      expect(await contrastOf(page, "[data-needs-confirming]")).toBeGreaterThanOrEqual(4.5);
      expect(await contrastOf(page, "[data-collaborator-anchor=details]")).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(await contrastOf(page, "footer")).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "creation-empty");
    } finally {
      await close();
    }
  });

  it("prompt-stated facts show as written, marked", async () => {
    const { page, close } = await openFixture(viewport, "data=prompt");
    try {
      const details = page.locator("[data-section=details]");
      await details.waitFor();
      const text = (await details.textContent()) ?? "";
      expect(text).toContain("December 19");
      expect(text).toContain("Villa Rosa");
      expect(await details.locator("[data-needs-confirming]").count()).toBeGreaterThanOrEqual(3);
      await shot(page, viewport, "creation-prompt");
    } finally {
      await close();
    }
  });

  it("real values show unmarked, with the RSVP-by line and the description", async () => {
    const { page, close } = await openFixture(viewport, "data=full&description=1");
    try {
      const details = page.locator("[data-section=details]");
      await details.waitFor();
      const text = (await details.textContent()) ?? "";
      expect(text).toContain("Saturday, December 19");
      expect(text).toContain("1:00 pm");
      expect(text).toContain("Villa Rosa");
      expect(text).toContain("Tucson, AZ");
      expect(text).toContain("RSVP by December 5");
      expect(await page.locator("[data-needs-confirming]").count()).toBe(0);
      expect(await page.locator("[data-section=description]").textContent()).toContain(
        "Lunch in the garden",
      );
      await expect(page.getByRole("button", { name: "Edit description" }).count()).resolves.toBe(1);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "creation-full");
    } finally {
      await close();
    }
  });

  it("the guest variant shows real values only: no placeholders, no anchors", async () => {
    const { page, close } = await openFixture(viewport, "data=empty&variant=guest");
    try {
      const details = page.locator("[data-section=details]");
      await details.waitFor();
      expect(await page.locator("[data-needs-confirming]").count()).toBe(0);
      expect(await page.locator("[data-collaborator-anchor]").count()).toBe(0);
      expect(await page.locator("[data-section=description]").count()).toBe(0);
      const text = (await details.textContent()) ?? "";
      expect(text).not.toContain("Venue to be announced");
      expect(text).not.toMatch(/Date|Time|Where|RSVP/);
      await shot(page, viewport, "guest-empty");

      const full = await openFixture(viewport, "data=full&description=1&variant=guest");
      try {
        await full.page.locator("[data-section=details]").waitFor();
        expect(await full.page.locator("[data-collaborator-anchor]").count()).toBe(0);
        expect(await full.page.locator("[data-section=details]").textContent()).toContain(
          "Saturday, December 19",
        );
        expect(await hasHorizontalScroll(full.page)).toBe(false);
        await shot(full.page, viewport, "guest-full");
      } finally {
        await full.close();
      }
    } finally {
      await close();
    }
  });

  it("anchors are labelled and keyboard-operable; the editor opens and closes back to the anchor", async () => {
    const { page, close } = await openFixture(viewport, "data=full&description=1");
    try {
      const edit = page.getByRole("button", { name: "Edit event details" });
      await edit.waitFor();
      expect(await edit.textContent()).toBe("Edit");

      // Reachable by keyboard: Tab from the top of the page lands on the anchors in order.
      await page.locator("body").press("Tab");
      let reached = false;
      for (let i = 0; i < 6 && !reached; i++) {
        reached = await page.evaluate(
          () => document.activeElement?.getAttribute("data-collaborator-anchor") === "details",
        );
        if (!reached) await page.keyboard.press("Tab");
      }
      expect(reached).toBe(true);

      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Event details" });
      await dialog.waitFor({ state: "visible" });
      // Every field is there.
      for (const label of [
        "Title",
        "Hosts",
        "Baby's name",
        "Event date",
        "Start time",
        "End time",
        "Venue name",
        "Address",
        "Description",
        "RSVP deadline",
      ]) {
        expect(await dialog.getByLabel(labelOf(label)).count()).toBe(1);
      }
      expect(await dialog.getByText("Public", { exact: true }).count()).toBe(1);
      expect(await dialog.getByText("Leave empty to keep the card's title").count()).toBe(1);

      const box = await dialog.boundingBox();
      if (!box) throw new Error("no dialog box");
      if (viewport.width <= 700) {
        // A phone: the sheet fills the screen.
        expect(Math.round(box.x)).toBe(0);
        expect(Math.round(box.width)).toBe(viewport.width);
        expect(Math.round(box.height)).toBe(viewport.height);
      } else {
        // Desktop: a panel on the right edge, the event still visible to its left.
        expect(Math.round(box.x + box.width)).toBe(viewport.width);
        expect(box.width).toBeLessThan(viewport.width / 2);
        expect(box.height).toBe(viewport.height);
        expect(box.x).toBeGreaterThan(viewport.width / 2);
      }
      await shot(page, viewport, "editor-open");

      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute("data-collaborator-anchor")),
      ).toBe("details");

      // The close button does the same, from the description anchor.
      await page.getByRole("button", { name: "Edit description" }).click();
      await dialog.waitFor({ state: "visible" });
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("description");
      await dialog.getByRole("button", { name: "Close event details" }).click();
      await dialog.waitFor({ state: "hidden" });
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute("data-collaborator-anchor")),
      ).toBe("description");
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("edits in the editor update the page, including a description added from `Add`", async () => {
    const { page, close } = await openFixture(viewport, "data=empty");
    try {
      await page.getByRole("button", { name: "Add a description" }).click();
      const dialog = page.getByRole("dialog", { name: "Event details" });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByLabel(labelOf("Title")).fill("Maya's Garden Shower");
      await dialog.getByLabel(labelOf("Event date")).fill("2026-12-19");
      await dialog.getByLabel(labelOf("Description")).fill("Lunch in the garden.");
      // The description autosaves after its debounce; closing sends it at once.
      await dialog.getByRole("button", { name: "Close event details" }).click();
      await dialog.waitFor({ state: "hidden" });

      const details = page.locator("[data-section=details]");
      await page.getByRole("heading", { level: 1, name: "Maya's Garden Shower" }).waitFor();
      await page.locator("[data-section=description]").getByText("Lunch in the garden.").waitFor();
      expect(await details.textContent()).toContain("Saturday, December 19");
      // The date is real now; time and venue are still placeholders.
      expect(await details.locator("[data-needs-confirming]").count()).toBe(2);
      await expect(page.getByRole("button", { name: "Edit description" }).count()).resolves.toBe(1);
      await shot(page, viewport, "after-edit");
    } finally {
      await close();
    }
  });
  it("reopening the editor before the page catches up shows the newest saved values", async () => {
    const { page, close } = await openFixture(viewport, "data=empty&lag=1");
    try {
      await page.getByRole("button", { name: "Add a description" }).click();
      const dialog = page.getByRole("dialog", { name: "Event details" });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByLabel(labelOf("Description")).fill("Lunch in the garden.");
      await dialog.getByRole("button", { name: "Close event details" }).click();
      await dialog.waitFor({ state: "hidden" });
      // At once, while the page still shows the old data.
      await page.getByRole("button", { name: "Add a description" }).click();
      await dialog.waitFor({ state: "visible" });
      expect(await dialog.getByLabel(labelOf("Description")).inputValue()).toBe(
        "Lunch in the garden.",
      );
    } finally {
      await close();
    }
  });

  it("a change refused as the editor closes keeps it open with the message", async () => {
    const { page, close } = await openFixture(viewport, "data=full&refuse=1");
    try {
      await page.getByRole("button", { name: "Edit event details" }).click();
      const dialog = page.getByRole("dialog", { name: "Event details" });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByLabel(labelOf("Title")).fill("Refuse this title");
      // Closed inside the autosave's debounce: the edit is sent, refused, and shown.
      await page.keyboard.press("Escape");
      await dialog.getByText("This title is too long for the card.").waitFor();
      expect(await dialog.isVisible()).toBe(true);
      // Closing again leaves.
      await dialog.getByRole("button", { name: "Close event details" }).click();
      await dialog.waitFor({ state: "hidden" });
    } finally {
      await close();
    }
  });
});
