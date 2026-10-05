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
  /** Runs before the page loads (a route the page asks for at once). */
  before?: (page: Page) => Promise<void>,
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width <= 700,
    hasTouch: viewport.width <= 700,
  });
  const page = await context.newPage();
  await before?.(page);
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

/**
 * Slice 2: the owner toolbar's Design panel (the shape control and its wait, `Try another
 * direction`, the designs list) and the readiness control with its setup checklist
 * (`docs/screen-spec.md` `design-panel`, `setup-checklist`; `spec.md §31` — Creation Mode). The
 * shape and design actions are stubs in the fixture; the generation poll is answered here, so no
 * model is ever called.
 */

type PollPhase = "running" | "succeeded" | "failed";

/** Answers the generation poll with whatever `phase.value` is when it is asked. */
async function stubPoll(page: Page): Promise<{ value: PollPhase }> {
  const phase: { value: PollPhase } = { value: "running" };
  await page.route("**/api/events/*/generation*", (route) => {
    const base = { id: "fixture-generation-1", stage: null, artifacts: {}, cardDesignId: null };
    const generation =
      phase.value === "succeeded"
        ? { ...base, status: "succeeded", failure: null, notice: null, cardDesignId: "d1" }
        : phase.value === "failed"
          ? {
              ...base,
              status: "failed",
              failure: {
                code: "shape_refusal",
                title: "We couldn't make that shape",
                body: "The new artwork for that shape came out too close to a well-known character, so for copyright reasons we couldn't use it. Your card stays as it is — you can try again.",
                retry: true,
              },
              notice: null,
            }
          : { ...base, status: "running", failure: null, notice: null };
    return route.fulfill({ json: { generation } });
  });
  return phase;
}

async function shotSheet(page: Page, viewport: { width: number }, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, `${name}-${viewport.width}.png`) });
}

const cardShape = (page: Page) =>
  page.locator("[data-card-shape]").first().getAttribute("data-card-shape");

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("design panel at %s", (_label, viewport) => {
  it("the toolbar opens the Design panel with only what exists, and Escape returns focus", async () => {
    const { page, close } = await openFixture(viewport, "data=full");
    try {
      const design = page.getByRole("button", { name: "Design", exact: true });
      await design.click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.waitFor({ state: "visible" });

      // Shapes of the layout, the current one marked, each labelled for a screen reader.
      const shapes = dialog.locator("[data-shape]");
      expect(
        await shapes.evaluateAll((els) => els.map((el) => el.getAttribute("data-shape"))),
      ).toEqual(["rectangle", "rounded-rectangle", "arch", "oval", "square"]);
      await expect(
        dialog.getByRole("button", { name: "Rectangle", exact: true }).getAttribute("aria-pressed"),
      ).resolves.toBe("true");
      await expect(
        dialog.getByRole("button", { name: "Oval", exact: true }).getAttribute("aria-pressed"),
      ).resolves.toBe("false");
      expect(await dialog.getByRole("button", { name: "Square — new artwork" }).count()).toBe(1);

      // Try another direction, before publish, from the active design.
      const another = dialog.getByRole("link", { name: "Try another direction ✦" });
      expect(await another.getAttribute("href")).toBe(
        "/events/fixture-event/direction?from=fixture-design-1",
      );
      // The designs list lives here, once.
      expect(await dialog.getByRole("heading", { name: "Your designs" }).count()).toBe(1);
      expect(await page.getByRole("heading", { name: "Your designs" }).count()).toBe(1);
      expect(await dialog.getByRole("button", { name: /Choose this direction/ }).count()).toBe(1);
      // The card editor does not exist yet: no placeholders for it.
      expect(await dialog.getByText(/Edit card|Reset card/).count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shotSheet(page, viewport, "design-panel");

      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      expect(await page.evaluate(() => document.activeElement?.getAttribute("data-toolbar"))).toBe(
        "design",
      );
    } finally {
      await close();
    }
  });

  it("an instant shape applies at once", async () => {
    const { page, close } = await openFixture(viewport, "data=full");
    try {
      expect(await cardShape(page)).toBe("rectangle");
      await page.getByRole("button", { name: "Design", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.getByRole("button", { name: "Oval", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("[data-card-shape]")?.getAttribute("data-card-shape") === "oval",
      );
      await expect(
        dialog.getByRole("button", { name: "Oval", exact: true }).getAttribute("aria-pressed"),
      ).resolves.toBe("true");
      // No wait, no notice: it was instant.
      expect(await dialog.locator("[data-shape-wait], [data-shape-notice]").count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("a shape that needs new artwork says so, waits with the card unchanged, then applies", async () => {
    const { page, close } = await openFixture(viewport, "data=full");
    try {
      const phase = await stubPoll(page);
      await page.getByRole("button", { name: "Design", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.getByRole("button", { name: "Square — new artwork" }).click();

      // The notice first; nothing has started, and Cancel backs out.
      const notice = dialog.locator("[data-shape-notice]");
      await notice.waitFor();
      expect(await notice.textContent()).toContain("new artwork of the same subject");
      expect(await notice.textContent()).toContain("current card stays as it is until it's ready");
      expect(await cardShape(page)).toBe("rectangle");
      await notice.getByRole("button", { name: "Cancel" }).click();
      expect(await dialog.locator("[data-shape-notice]").count()).toBe(0);

      await dialog.getByRole("button", { name: "Square — new artwork" }).click();
      await notice.getByRole("button", { name: "Make it" }).click();

      // The wait: plain words, no number, in the panel and by the card; the card is unchanged.
      const wait = dialog.locator("[data-shape-wait]");
      await wait.waitFor();
      expect(await wait.textContent()).toContain("Painting your card as a square…");
      expect(await wait.textContent()).not.toMatch(/\d|%/);
      expect(await cardShape(page)).toBe("rectangle");
      await shotSheet(page, viewport, "shape-wait");

      // Closing the panel leaves the wait running, told quietly by the card.
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      const status = page.locator("[data-shape-status]");
      await status.waitFor();
      expect(await status.textContent()).toContain("Painting your card as a square…");
      expect(await cardShape(page)).toBe("rectangle");
      await shot(page, viewport, "shape-wait-page");

      phase.value = "succeeded";
      await page.waitForFunction(
        () =>
          document.querySelector("[data-card-shape]")?.getAttribute("data-card-shape") === "square",
        undefined,
        { timeout: 15_000 },
      );
      expect(await page.locator("[data-shape-status]").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("a failed shape says why, keeps the card, and Try again can succeed", async () => {
    const { page, close } = await openFixture(viewport, "data=full");
    try {
      const phase = await stubPoll(page);
      phase.value = "failed";
      await page.getByRole("button", { name: "Design", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.getByRole("button", { name: "Square — new artwork" }).click();
      await dialog.getByRole("button", { name: "Make it" }).click();

      const failure = dialog.locator("[data-shape-failure]");
      await failure.waitFor({ timeout: 15_000 });
      expect(await failure.textContent()).toContain("We couldn't make that shape");
      expect(await failure.textContent()).toContain("Your card stays as it is");
      expect(await cardShape(page)).toBe("rectangle");
      await shotSheet(page, viewport, "shape-failed");

      phase.value = "succeeded";
      await failure.getByRole("button", { name: "Try again" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("[data-card-shape]")?.getAttribute("data-card-shape") === "square",
        undefined,
        { timeout: 15_000 },
      );
    } finally {
      await close();
    }
  });

  it("after a failure, another shape asks again; Dismiss clears the failure", async () => {
    const { page, close } = await openFixture(viewport, "data=full");
    try {
      const phase = await stubPoll(page);
      phase.value = "failed";
      await page.getByRole("button", { name: "Design", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.getByRole("button", { name: "Square — new artwork" }).click();
      await dialog.getByRole("button", { name: "Make it" }).click();
      const failure = dialog.locator("[data-shape-failure]");
      await failure.waitFor({ timeout: 15_000 });
      // Choosing again: the failure gives way to the notice for the new choice.
      await dialog.getByRole("button", { name: "Square — new artwork" }).click();
      await dialog.locator("[data-shape-notice]").waitFor();
      expect(await failure.count()).toBe(0);
      await dialog.getByRole("button", { name: "Cancel" }).click();
      // Dismiss clears a failure without trying again.
      await dialog.getByRole("button", { name: "Square — new artwork" }).click();
      await dialog.getByRole("button", { name: "Make it" }).click();
      await failure.waitFor({ timeout: 15_000 });
      await failure.getByRole("button", { name: "Dismiss" }).click();
      expect(await failure.count()).toBe(0);
      expect(await cardShape(page)).toBe("rectangle");
    } finally {
      await close();
    }
  });

  it("a page loaded while a shape is painting shows the wait, then the new shape", async () => {
    let phase: { value: PollPhase } = { value: "running" };
    const { page, close } = await openFixture(viewport, "data=full&wait=square", async (p) => {
      phase = await stubPoll(p);
    });
    try {
      const status = page.locator("[data-shape-status]");
      await status.waitFor();
      expect(await status.textContent()).toContain("Painting your card as a square");
      expect(await cardShape(page)).toBe("rectangle");
      // The panel shows the same wait, and its swatches are unavailable meanwhile (still focusable).
      await page.getByRole("button", { name: "Design", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.locator("[data-shape-wait]").waitFor();
      expect(await dialog.getByRole("button", { name: "Oval" }).getAttribute("aria-disabled")).toBe(
        "true",
      );
      phase.value = "succeeded";
      await page.waitForFunction(
        () =>
          document.querySelector("[data-card-shape]")?.getAttribute("data-card-shape") === "square",
        undefined,
        { timeout: 15_000 },
      );
    } finally {
      await close();
    }
  });

  it("after publish only shapes the artwork fits are offered, and no Try another or choosing", async () => {
    const { page, close } = await openFixture(viewport, "data=full&published=1");
    try {
      await page.getByRole("button", { name: "Design", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Design" });
      await dialog.waitFor({ state: "visible" });
      const shapes = await dialog
        .locator("[data-shape]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-shape")));
      expect(shapes).toEqual(["rectangle", "rounded-rectangle", "arch", "oval"]);
      expect(await dialog.getByText("New artwork").count()).toBe(0);
      expect(await dialog.getByRole("link", { name: /Try another direction/ }).count()).toBe(0);
      expect(await dialog.getByRole("button", { name: /Choose this direction/ }).count()).toBe(0);
      // The list is there, read-only.
      expect(await dialog.getByRole("heading", { name: "Your designs" }).count()).toBe(1);
      await shotSheet(page, viewport, "design-panel-published");
    } finally {
      await close();
    }
  });

  it("guests get no toolbar and no readiness control", async () => {
    const { page, close } = await openFixture(viewport, "data=full&variant=guest");
    try {
      await page.locator("[data-section=details]").waitFor();
      expect(await page.locator("[data-toolbar], [data-setup-pill]").count()).toBe(0);
    } finally {
      await close();
    }
  });
});

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("readiness at %s", (_label, viewport) => {
  it("counts the publish blockers, and its rows open the editor on the right field", async () => {
    const { page, close } = await openFixture(viewport, "data=empty");
    try {
      const pill = page.locator("[data-setup-pill]");
      await pill.waitFor();
      // Date, start time, venue, RSVP deadline, who can see it; the title is the design's and the
      // zone is set.
      expect((await pill.textContent())?.trim()).toBe("Finish setup · 5 left");
      expect(await contrastOf(page, "[data-setup-pill]")).toBeGreaterThanOrEqual(4.5);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "pill-left");

      await pill.click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      expect(await checklist.getByRole("heading", { name: "Needed to publish" }).count()).toBe(1);
      const rows = await checklist
        .locator("[data-blocker]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-blocker")));
      expect(rows).toEqual(["eventDate", "startTime", "venue", "rsvpDeadline", "visibility"]);
      // Recommended work has no surface yet: no group, no dead links.
      expect(await checklist.getByText(/Recommended/).count()).toBe(0);
      expect(await contrastOf(page, "[data-blocker=eventDate] span")).toBeGreaterThanOrEqual(4.5);
      await shotSheet(page, viewport, "checklist");

      // A row opens the editor on its field.
      await checklist.getByRole("button", { name: /Venue/ }).click();
      const editor = page.getByRole("dialog", { name: "Event details" });
      await editor.waitFor({ state: "visible" });
      await checklist.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.id === "venueName");

      // Saving one updates the count live.
      await editor.getByText("Public", { exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector("[data-setup-pill]")?.textContent?.includes("4 left"),
      );

      // Escape returns to the readiness control that started it.
      await page.keyboard.press("Escape");
      await editor.waitFor({ state: "hidden" });
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute("data-setup-pill")),
      ).toBe("left");
    } finally {
      await close();
    }
  });

  it("the date row focuses the date field; prompt-stated facts do not count", async () => {
    const { page, close } = await openFixture(viewport, "data=prompt");
    try {
      const pill = page.locator("[data-setup-pill]");
      await pill.waitFor();
      expect((await pill.textContent())?.trim()).toBe("Finish setup · 5 left");
      await pill.click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      await checklist.getByRole("button", { name: /Event date/ }).click();
      await page.getByRole("dialog", { name: "Event details" }).waitFor({ state: "visible" });
      await page.waitForFunction(() => document.activeElement?.id === "eventDate");
    } finally {
      await close();
    }
  });

  it("says Ready to publish when everything is saved, with recommended work unfinished", async () => {
    const { page, close } = await openFixture(viewport, "data=full");
    try {
      const pill = page.locator("[data-setup-pill]");
      await pill.waitFor();
      expect(await pill.getAttribute("data-setup-pill")).toBe("ready");
      expect((await pill.textContent())?.trim()).toBe("✓ Ready to publish");
      expect(await contrastOf(page, "[data-setup-pill]")).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "pill-ready");
      await pill.click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      expect(await checklist.locator("[data-setup-ready]").count()).toBe(1);
      expect(await checklist.locator("[data-blocker]").count()).toBe(0);
      await shotSheet(page, viewport, "checklist-ready");
      await page.keyboard.press("Escape");
      await checklist.waitFor({ state: "hidden" });
    } finally {
      await close();
    }
  });

  it("a private event is not ready without its event code, which no surface sets yet", async () => {
    const { page, close } = await openFixture(viewport, "data=full&visibility=private");
    try {
      const pill = page.locator("[data-setup-pill]");
      await pill.waitFor();
      expect((await pill.textContent())?.trim()).toBe("Finish setup · 1 left");
      await pill.click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      const row = checklist.locator("[data-blocker=accessCode]");
      await row.waitFor();
      expect(await row.textContent()).toContain("Private event code");
      // Listed, but not a control: nothing to open yet.
      expect(await row.evaluate((el) => el.tagName)).toBe("DIV");
    } finally {
      await close();
    }
  });
});
