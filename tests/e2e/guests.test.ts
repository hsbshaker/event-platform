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
  undersizedTapTargets,
  type AppServer,
} from "./harness";

/**
 * The guest workspace in a real browser at 390 and 1280 (`docs/screen-spec.md` `guests-workspace`,
 * `setup-checklist`; `docs/design-system.md §4.9`; `spec.md §7.13`, §12.2, §12.5; §31 — RSVP:
 * "Manual add requires phone or explicit no-phone acknowledgement.", "CSV with missing phone rows
 * imports and flags Needs phone.", "Every party has a personal invitation link ... can be rotated
 * by the host"; Creation Mode: "Guest workspace returns to prior Creation Mode context.";
 * Responsive/accessibility), through the development fixtures, no database:
 *
 * - add a party with a phone; a save with neither a phone nor No phone available is refused
 *   inline; the No phone available path saves; a CSV with missing phones imports and flags Needs
 *   phone; fix a phone from the editor; delete with confirmation;
 * - on a published event, Copy personal link and Rotate link (with its confirmation); before
 *   publish a row says nothing about links;
 * - the toolbar's Guests and the setup checklist's Guests row open the workspace, and Close
 *   returns to Creation Mode;
 * - keyboard: every action reachable, focus back where it belongs after a sheet closes and after a
 *   delete, changes announced.
 *
 * No sideways scroll, 44px targets and text contrast of at least 4.5:1 throughout. Screenshots go
 * to GUESTS_SHOTS_DIR when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.GUESTS_SHOTS_DIR;
const PHONE_ERROR = "Enter a US or Canadian mobile number, or choose No phone available.";

beforeAll(async () => {
  app = await startApp();
  if (app) browser = await launchBrowser();
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await app?.stop();
});

async function open(
  viewport: { width: number; height: number },
  url: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width <= 700,
    hasTouch: viewport.width <= 700,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.baseUrl });
  const page = await context.newPage();
  await page.goto(`${app.baseUrl}${url}`, { waitUntil: "networkidle" });
  return { page, close: () => context.close() };
}

async function shot(page: Page, viewport: { width: number }, name: string) {
  if (!SHOTS) return;
  await page.screenshot({
    path: path.join(SHOTS, `${name}-${viewport.width}.png`),
    fullPage: true,
  });
}

/** WCAG contrast of every matching element's text against its first opaque ancestor background. */
async function lowestContrast(page: Page, selector: string): Promise<number> {
  const ratios = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
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
      }),
  );
  expect(ratios.length, selector).toBeGreaterThan(0);
  return Math.min(...ratios);
}

const TEXT = "h1, h2, h3, p, li, label, button, a, span, dt, dd, legend";

function row(page: Page, name: string) {
  return page.locator("[data-party]").filter({
    has: page.locator("[data-party-name]", { hasText: new RegExp(`^${name}$`) }),
  });
}

async function activeId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function announced(page: Page, text: string) {
  await page.waitForFunction(
    (t) => document.querySelector("[data-guests-announcement]")?.textContent === t,
    text,
  );
}

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("guest workspace at %s", (_label, viewport) => {
  it("starts empty and plain, and adds a party with a phone", async () => {
    const { page, close } = await open(viewport, "/dev/guests?data=empty");
    try {
      await page.locator("[data-guests-empty]").waitFor();
      expect(await page.getByRole("heading", { level: 1, name: "Guests" }).count()).toBe(1);
      expect(await page.locator("[data-guests-summary]").textContent()).toBe(
        "0 parties · 0 guests",
      );
      expect(await page.locator("[data-guests-filter]").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await undersizedTapTargets(page, "main button, header a")).toEqual([]);
      expect(await lowestContrast(page, `:is(header, main) :is(${TEXT})`)).toBeGreaterThanOrEqual(
        4.5,
      );
      await shot(page, viewport, "guests-empty");

      // Keyboard: Add party opens the editor on the main contact's name.
      await page.locator("#guests-add").focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("dialog", { name: "Add party" });
      await editor.waitFor({ state: "visible" });
      await page.waitForFunction(() => document.activeElement?.closest("[data-guest-row='0']"));
      await page.keyboard.type("Ana Garcia");
      await editor.getByRole("button", { name: "Add a guest" }).click();
      await page.waitForFunction(() => document.activeElement?.closest("[data-guest-row='1']"));
      await page.keyboard.type("Luis Garcia");
      await editor.getByRole("button", { name: "Add a guest" }).click();
      await page.keyboard.type("Mia Garcia");
      await editor.locator("[data-guest-row='2']").getByLabel("Child").check();
      await editor.getByLabel("Allow a plus-one").check();
      // The name on the invitation follows the guests unless the host gives one.
      expect(
        await editor.getByText("Optional. Leave blank to use “The Garcia family”.").count(),
      ).toBe(1);
      await editor.getByLabel("Mobile phone").fill("(512) 555-0123");
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(
        await undersizedTapTargets(
          page,
          "dialog[open] button, dialog[open] input:not([type=checkbox])",
        ),
      ).toEqual([]);
      await shot(page, viewport, "guests-add-party");
      await editor.getByRole("button", { name: "Add party", exact: true }).click();
      await editor.waitFor({ state: "hidden" });

      const added = row(page, "The Garcia family");
      await added.waitFor();
      expect(await added.getAttribute("data-contact")).toBe("ready");
      expect(await added.textContent()).toContain("2 adults, 1 child · plus-one");
      expect(await added.locator("[data-contact-state]").textContent()).toBe("Ready");
      expect(await added.locator("[data-rsvp-state]").textContent()).toBe("Awaiting");
      expect(await added.locator("[data-invitation-state]").textContent()).toBe("Not sent");
      // Before publish a row says nothing about links.
      expect(await page.getByText(/personal link/i).count()).toBe(0);
      expect(await page.locator("[data-guests-summary]").textContent()).toBe("1 party · 3 guests");
      await announced(page, "Added The Garcia family.");
      // Focus lands on the party just added.
      expect(await activeId(page)).toMatch(/^party-/);
    } finally {
      await close();
    }
  });

  it("refuses a save with neither a phone nor No phone available, and saves the override", async () => {
    const { page, close } = await open(viewport, "/dev/guests?data=empty");
    try {
      await page.getByRole("button", { name: "Add party" }).click();
      const editor = page.getByRole("dialog", { name: "Add party" });
      await editor.waitFor({ state: "visible" });
      await editor.getByLabel(/Main contact/).fill("Rose Park");
      await editor.getByRole("button", { name: "Add party", exact: true }).click();
      // Refused inline, the sheet stays, the phone field says why and has focus.
      await editor.getByText(PHONE_ERROR).waitFor();
      expect(await editor.isVisible()).toBe(true);
      expect(await activeId(page)).toBe("party-phone");
      expect(await editor.getByLabel("Mobile phone").getAttribute("aria-invalid")).toBe("true");
      // An unrecognized number is refused the same way.
      await editor.getByLabel("Mobile phone").fill("+44 20 7946 0958");
      await editor.getByRole("button", { name: "Add party", exact: true }).click();
      await editor.getByText(PHONE_ERROR).waitFor();

      await editor.getByLabel("No phone available").check();
      expect(await editor.getByLabel("Mobile phone").isDisabled()).toBe(true);
      expect(await editor.getByLabel("Mobile phone").inputValue()).toBe("");
      await editor
        .getByText("They won't get texts. You can send them their personal link yourself.")
        .waitFor();
      await shot(page, viewport, "guests-no-phone");
      await editor.getByRole("button", { name: "Add party", exact: true }).click();
      await editor.waitFor({ state: "hidden" });
      const saved = row(page, "Rose Park");
      await saved.waitFor();
      expect(await saved.locator("[data-contact-state]").textContent()).toBe("No phone available");
    } finally {
      await close();
    }
  });

  it("imports a CSV, flags the parties without a phone, and filters them", async () => {
    const { page, close } = await open(viewport, "/dev/guests?data=empty");
    try {
      await page.getByRole("button", { name: "Import CSV" }).click();
      const sheet = page.getByRole("dialog", { name: "Import CSV" });
      await sheet.waitFor({ state: "visible" });

      // The sample is made in the browser, with placeholder rows only.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        sheet.getByRole("button", { name: "Download a sample CSV" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("guest-list-sample.csv");

      const csv = [
        "﻿Name,Household,Phone,Child",
        "Ana Garcia,Garcias,512-555-0123,",
        "Luis Garcia,garcias,,",
        "Mia Garcia,Garcias,,yes",
        "Bo Chen,,,",
        '"Diaz, Cy",,555-12,',
        ",,,",
        ",Nobody,5125550100,",
      ].join("\r\n");
      await sheet.getByLabel("CSV file").setInputFiles({
        name: "guests.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      });
      const summary = sheet.locator("[data-import-summary]");
      await summary.waitFor();
      expect(await summary.textContent()).toBe("We found 3 parties (5 guests). 2 need a phone.");
      const issues = await sheet.locator("[data-import-issues] li").allTextContents();
      expect(issues).toEqual([
        "Row 6: “555-12” isn't a US or Canadian mobile number, so it was left out.",
        "Row 8: no name, so it was skipped.",
      ]);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await shot(page, viewport, "guests-import-preview");

      await sheet.getByRole("button", { name: "Import", exact: true }).click();
      await sheet.locator("[data-import-done]").waitFor();
      expect(await sheet.locator("[data-import-done]").textContent()).toBe(
        "Added 3 parties to your guest list.",
      );
      await announced(page, "Added 3 parties.");
      await sheet.getByRole("button", { name: "Close import csv" }).click();
      await sheet.waitFor({ state: "hidden" });
      // Focus returns to the control that opened the sheet.
      expect(await activeId(page)).toBe("guests-import");

      expect(await page.locator("[data-guests-summary]").textContent()).toBe(
        "3 parties · 5 guests · 2 need a phone",
      );
      expect(await page.locator("[data-contact=needs_phone]").count()).toBe(2);
      expect(await row(page, "Garcias").getAttribute("data-contact")).toBe("ready");
      expect(await row(page, "Bo Chen").locator("[data-contact-state]").textContent()).toBe(
        "Needs phone",
      );
      expect(await row(page, "Diaz, Cy").getAttribute("data-contact")).toBe("needs_phone");

      await page.getByRole("button", { name: "Needs phone (2)" }).click();
      expect(await page.locator("[data-party]").count()).toBe(2);
      expect(
        await page.getByRole("button", { name: "Needs phone (2)" }).getAttribute("aria-pressed"),
      ).toBe("true");
      expect(await lowestContrast(page, `main :is(${TEXT})`)).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "guests-needs-phone");
      await page.getByRole("button", { name: "All parties" }).click();
      expect(await page.locator("[data-party]").count()).toBe(3);
    } finally {
      await close();
    }
  });

  it("fixes a phone from the editor and deletes a party with confirmation", async () => {
    const { page, close } = await open(viewport, "/dev/guests");
    try {
      await page.locator("[data-guests-list]").waitFor();
      expect(await page.locator("[data-guests-summary]").textContent()).toBe(
        "3 parties · 5 guests · 1 needs a phone",
      );
      // Desktop uses the width as a grid; a phone stacks the rows.
      const display = await page
        .locator("[data-party]")
        .first()
        .evaluate((el) => getComputedStyle(el).display);
      expect(display).toBe(viewport.width >= 1024 ? "grid" : "flex");
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await undersizedTapTargets(page, "main button, header a")).toEqual([]);
      expect(await lowestContrast(page, `:is(header, main) :is(${TEXT})`)).toBeGreaterThanOrEqual(
        4.5,
      );
      await shot(page, viewport, "guests-list");

      const bo = row(page, "Bo Chen");
      const boButton = bo.getByRole("button", { name: /Bo Chen/ });
      const boId = await boButton.getAttribute("id");
      await boButton.click();
      const editor = page.getByRole("dialog", { name: "Edit party" });
      await editor.waitFor({ state: "visible" });
      expect(await editor.getByLabel(/Main contact/).inputValue()).toBe("Bo Chen");
      await editor.getByLabel("Mobile phone").fill("416 555 0199");
      await editor.getByRole("button", { name: "Save" }).click();
      await editor.waitFor({ state: "hidden" });
      expect(await row(page, "Bo Chen").locator("[data-contact-state]").textContent()).toBe(
        "Ready",
      );
      expect(await page.locator("[data-guests-filter]").count()).toBe(0);
      await announced(page, "Saved Bo Chen.");
      expect(await activeId(page)).toBe(boId);

      // The phone shows formatted when the party is opened again.
      await page.keyboard.press("Enter");
      await editor.waitFor({ state: "visible" });
      expect(await editor.getByLabel("Mobile phone").inputValue()).toBe("(416) 555-0199");
      await editor.getByRole("button", { name: "Delete", exact: true }).click();
      const confirm = editor.locator("[data-confirm-delete]");
      await confirm.waitFor();
      expect(await confirm.textContent()).toContain(
        "Delete Bo Chen? They'll be removed from your guest list.",
      );
      expect(await activeId(page)).toBe("party-confirm-delete");
      // Cancel keeps it.
      await confirm.getByRole("button", { name: "Cancel" }).click();
      expect(await activeId(page)).toBe("party-delete");
      await editor.getByRole("button", { name: "Delete", exact: true }).click();
      await editor.getByRole("button", { name: "Delete party" }).click();
      await editor.waitFor({ state: "hidden" });
      expect(await row(page, "Bo Chen").count()).toBe(0);
      expect(await page.locator("[data-party]").count()).toBe(2);
      await announced(page, "Deleted Bo Chen.");
      expect(await activeId(page)).toBe("guests-heading");

      // Escape closes the editor and returns focus to the party that opened it.
      const rose = row(page, "Grandma Rose").getByRole("button", { name: /Grandma Rose/ });
      const roseId = await rose.getAttribute("id");
      await rose.click();
      await editor.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await editor.waitFor({ state: "hidden" });
      await page.waitForFunction((id) => document.activeElement?.id === id, roseId);
    } finally {
      await close();
    }
  });

  it("on a published event, copies and rotates a party's personal link", async () => {
    const { page, close } = await open(viewport, "/dev/guests?published=1");
    try {
      const garcias = row(page, "Ana & Luis Garcia");
      await garcias.waitFor();
      expect(await page.getByRole("button", { name: /^Copy personal link for/ }).count()).toBe(3);
      expect(await undersizedTapTargets(page, "main button")).toEqual([]);
      expect(await hasHorizontalScroll(page)).toBe(false);

      await garcias
        .getByRole("button", { name: "Copy personal link for Ana & Luis Garcia" })
        .click();
      await garcias.getByText("Link copied").waitFor();
      const first = await clipboard(page);
      expect(first).toMatch(new RegExp(`^${app!.baseUrl}/g/[A-Za-z0-9_-]{43}$`));
      await announced(page, "Personal link for Ana & Luis Garcia copied.");
      // The same link again.
      await garcias
        .getByRole("button", { name: "Copy personal link for Ana & Luis Garcia" })
        .click();
      expect(await clipboard(page)).toBe(first);

      // Rotate asks first; Cancel keeps the link.
      await garcias
        .getByRole("button", { name: "Rotate personal link for Ana & Luis Garcia" })
        .click();
      const confirm = garcias.locator("[data-confirm-rotate]");
      await confirm.waitFor();
      expect(await confirm.textContent()).toContain("The old link will stop working.");
      expect(await activeId(page)).toMatch(/^confirm-rotate-/);
      await shot(page, viewport, "guests-rotate-confirm");
      await confirm.getByRole("button", { name: "Cancel" }).click();
      expect(await activeId(page)).toMatch(/^rotate-/);

      await garcias
        .getByRole("button", { name: "Rotate personal link for Ana & Luis Garcia" })
        .click();
      await confirm.getByRole("button", { name: "Make a new link" }).click();
      await garcias.getByText("New link copied. The old one no longer works.").waitFor();
      const second = await clipboard(page);
      expect(second).toMatch(new RegExp(`^${app!.baseUrl}/g/[A-Za-z0-9_-]{43}$`));
      expect(second).not.toBe(first);
      expect(await activeId(page)).toMatch(/^copy-/);
      await garcias
        .getByRole("button", { name: "Copy personal link for Ana & Luis Garcia" })
        .click();
      expect(await clipboard(page)).toBe(second);
      expect(await lowestContrast(page, `main :is(${TEXT})`)).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "guests-published");
    } finally {
      await close();
    }
  });

  it("is reached from the toolbar and the setup checklist, and Close returns to Creation Mode", async () => {
    const published = await open(viewport, "/dev/creation?published=1");
    try {
      const toolbar = published.page.getByRole("group", { name: "Invitation tools" });
      await toolbar.getByRole("link", { name: "Guests" }).click();
      await published.page.waitForURL(/\/dev\/guests\?published=1$/);
      await published.page.locator("[data-guests-workspace]").waitFor();
      await published.page.getByRole("link", { name: "Close" }).click();
      await published.page.waitForURL(/\/dev\/creation\?published=1$/);
      await published.page.locator("[data-toolbar=guests]").waitFor();
    } finally {
      await published.close();
    }

    const draft = await open(viewport, "/dev/creation?data=empty&guests=2");
    try {
      await draft.page.locator("[data-setup-pill]").click();
      const checklist = draft.page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      const guestsRow = checklist.locator("[data-recommended=guests]");
      expect(await guestsRow.textContent()).toContain("2 parties added.");
      expect(await guestsRow.getAttribute("data-done")).toBe("");
      await guestsRow.click();
      await draft.page.waitForURL(/\/dev\/guests$/);
      await draft.page.locator("[data-guests-workspace]").waitFor();
    } finally {
      await draft.close();
    }

    const fresh = await open(viewport, "/dev/creation?data=empty");
    try {
      await fresh.page.locator("[data-setup-pill]").click();
      const checklist = fresh.page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      const guestsRow = checklist.locator("[data-recommended=guests]");
      expect(await guestsRow.textContent()).toContain("Add the people you're inviting.");
      expect(await guestsRow.getAttribute("data-done")).toBeNull();
    } finally {
      await fresh.close();
    }
  });
});

describe("the guest workspace route", () => {
  it("shows the plain not-available state to a signed-out visitor", async () => {
    const { page, close } = await open(
      MOBILE,
      "/events/6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11/guests",
    );
    try {
      await page.getByRole("heading", { name: "This event isn't available" }).waitFor();
      expect(await page.locator("[data-guests-workspace]").count()).toBe(0);
    } finally {
      await close();
    }
  });
});
