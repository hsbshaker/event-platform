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
 * Co-host invitations in a real browser at 390 and 1280 (`docs/screen-spec.md`
 * `cohost-invite-accept`; `spec.md §6.2`, §19.2, §25, §31 — Roles/publishing, Creation Mode,
 * Responsive/accessibility), through the development fixtures, no database:
 *
 * - the invite page (/dev/invite): signed out (the event and inviter, then sign-in), signed in (the
 *   role summary and `Join event`, into the existing event), not valid (one calm message, nothing
 *   about the event), and the owner opening their own link;
 * - the owner's Co-hosts sheet (/dev/creation): from the toolbar and from the setup checklist's
 *   Recommended group; create a link, copy it, revoke one, remove a co-host; absent for co-hosts.
 *
 * No sideways scroll and text contrast of at least 4.5:1 throughout. Screenshots go to
 * COHOSTS_SHOTS_DIR when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.COHOSTS_SHOTS_DIR;
const INVALID =
  "This invitation link isn't valid anymore. Ask the person who invited you for a new one.";
const FIRST_TOKEN = "fixtureInviteToken0000000000000000000000001";

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

async function shot(page: Page, viewport: { width: number }, name: string, fullPage = true) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, `${name}-${viewport.width}.png`), fullPage });
}

/** WCAG contrast of every matching element's text against its first opaque ancestor background. */
async function lowestContrast(page: Page, selector: string): Promise<number> {
  const ratios = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null || el.tagName === "DIALOG")
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

/** Every text-bearing element of the invite page and the Co-hosts sheet that must be readable. */
const TEXT = "h1, h2, h3, p, li, label, button, a, span";

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("invite page at %s", (_label, viewport) => {
  it("signed out: the event and who invited them, then sign-in, and nothing else", async () => {
    const { page, close } = await open(viewport, "/dev/invite?state=signed-out");
    try {
      const screen = page.locator("[data-invite-state=signed-out]");
      await screen.waitFor();
      expect(await page.locator("[data-invite-title]").textContent()).toBe("Maya's Garden Shower");
      expect(await screen.textContent()).toContain("Ana Lopez invited you to co-host");
      // The existing sign-in, not a join button: they must authenticate first.
      expect(await page.getByLabel(/Email address/).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "Send me a sign-in link" }).isVisible()).toBe(
        true,
      );
      expect(await page.getByRole("button", { name: "Join event" }).count()).toBe(0);
      expect(await page.locator("[data-role-summary]").count()).toBe(0);
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await lowestContrast(page, `main :is(${TEXT})`)).toBeGreaterThanOrEqual(4.5);
      expect(await undersizedTapTargets(page, "main button, main input")).toEqual([]);
      await shot(page, viewport, "invite-signed-out");
    } finally {
      await close();
    }
  });

  it("signed in: the role summary, and Join event goes into the existing event", async () => {
    const { page, close } = await open(viewport, "/dev/invite?state=signed-in");
    try {
      await page.locator("[data-invite-state=signed-in]").waitFor();
      const summary = page.locator("[data-role-summary]");
      expect(await summary.getByRole("heading", { name: "As a co-host you can" }).count()).toBe(1);
      const text = (await summary.textContent()) ?? "";
      expect(text).toContain("publish once the event has been paid for");
      expect(text).toContain("Only the owner can pay, manage co-hosts or delete the event.");
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await lowestContrast(page, `main :is(${TEXT})`)).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "invite-signed-in");

      await page.getByRole("button", { name: "Join event" }).click();
      // The event's Creation Mode, as a co-host: no co-host management anywhere.
      await page.waitForURL(/\/dev\/creation\?data=full&role=cohost/);
      await page.locator("[data-toolbar=design]").waitFor();
      expect(await page.locator("[data-toolbar=cohosts]").count()).toBe(0);
      await page.locator("[data-setup-pill]").click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      expect(await checklist.locator("[data-recommended]").count()).toBe(0);
      expect(await checklist.getByText(/Recommended/).count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("a link that no longer works: one calm message, nothing about the event", async () => {
    const { page, close } = await open(viewport, "/dev/invite?state=invalid");
    try {
      const notice = page.locator("[data-invite-state=notice]");
      await notice.waitFor();
      const said = [
        await notice.getByRole("heading", { level: 1 }).textContent(),
        await notice.locator("p").textContent(),
      ].join(" ");
      expect(said).toBe(INVALID);
      const all = (await page.locator("main").textContent()) ?? "";
      expect(all).not.toContain("Maya");
      expect(all).not.toContain("Ana");
      expect(await page.getByRole("link", { name: "Go to the home page" }).isVisible()).toBe(true);
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await lowestContrast(page, `main :is(${TEXT})`)).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "invite-invalid");
    } finally {
      await close();
    }
  });

  it("the real route: a malformed link gets the same message, no index and no referrer", async () => {
    const { page, close } = await open(viewport, "/invite/not-a-real-token");
    try {
      const notice = page.locator("[data-invite-state=notice]");
      await notice.waitFor();
      expect(await notice.getByRole("heading", { level: 1 }).textContent()).toBe(
        "This invitation link isn't valid anymore.",
      );
      // The link never leaks to another site through a click or the sign-in redirect.
      expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe(
        "no-referrer",
      );
      expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain(
        "noindex",
      );
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("Join event on a link used or revoked meanwhile shows the same message", async () => {
    const { page, close } = await open(viewport, "/dev/invite?state=signed-in&accept=invalid");
    try {
      await page.getByRole("button", { name: "Join event" }).click();
      const notice = page.locator("[data-invite-state=notice]");
      await notice.waitFor();
      expect(await notice.textContent()).toContain("This invitation link isn't valid anymore.");
      expect(await page.locator("main").textContent()).not.toContain("Maya");
    } finally {
      await close();
    }
  });

  it("the owner opening their own link is told they own the event", async () => {
    const { page, close } = await open(viewport, "/dev/invite?state=owner");
    try {
      const screen = page.locator("[data-invite-state=member-owner]");
      await screen.waitFor();
      expect(await screen.textContent()).toContain("You already own this event.");
      expect(await page.getByRole("button", { name: "Join event" }).count()).toBe(0);
      expect(await page.getByRole("link", { name: "Open event" }).getAttribute("href")).toBe(
        "/dev/creation?data=full&role=cohost",
      );
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await lowestContrast(page, `main :is(${TEXT})`)).toBeGreaterThanOrEqual(4.5);
    } finally {
      await close();
    }
  });
});

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("the owner's Co-hosts sheet at %s", (_label, viewport) => {
  it("lists the people and the links; create, copy, revoke and remove", async () => {
    const { page, close } = await open(viewport, "/dev/creation?data=full&cohosts=2&pending=1");
    try {
      const toolbarButton = page.locator("[data-toolbar=cohosts]");
      await toolbarButton.waitFor();
      expect(await toolbarButton.textContent()).toBe("Co-hosts");
      expect(await hasHorizontalScroll(page)).toBe(false);
      await toolbarButton.click();
      const sheet = page.getByRole("dialog", { name: "Co-hosts" });
      await sheet.waitFor({ state: "visible" });
      await sheet.locator("[data-cohosts-panel]").waitFor();

      // The owner first, then co-hosts by name, else email.
      const people = await sheet
        .locator("[data-member]")
        .evaluateAll((els) =>
          els.map((el) => [el.getAttribute("data-member"), el.textContent?.replace(/\s+/g, " ")]),
        );
      expect(people.map(([role]) => role)).toEqual(["owner", "cohost", "cohost"]);
      expect(people[0]![1]).toContain("Ana Lopez (you)");
      expect(people[1]![1]).toContain("Leo Park");
      expect(people[2]![1]).toContain("sam@example.com");
      // The owner has no Remove.
      expect(await sheet.locator("[data-member=owner] button").count()).toBe(0);
      // The open link, with its dates.
      const pendingRows = sheet.locator("[data-pending-invite]");
      expect(await pendingRows.count()).toBe(1);
      expect(await pendingRows.first().textContent()).toContain("Made Oct 3 · Expires Oct 10");
      expect(
        await lowestContrast(page, `[data-cohosts-panel] :is(${TEXT})`),
      ).toBeGreaterThanOrEqual(4.5);
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await undersizedTapTargets(page, "[data-cohosts-panel] button")).toEqual([]);
      await shot(page, viewport, "cohosts-sheet", false);

      // Create: the link once, with Copy, explained.
      await sheet.getByRole("button", { name: "Create invite link" }).click();
      const created = sheet.locator("[data-new-invite]");
      await created.waitFor();
      const link = sheet.getByLabel("New invite link");
      expect(await link.inputValue()).toBe(`${app!.baseUrl}/invite/${FIRST_TOKEN}`);
      expect(await created.textContent()).toContain(
        "you won't see it again. It works once and expires Oct 12.",
      );
      expect(await pendingRows.count()).toBe(2);
      await sheet.getByRole("button", { name: "Copy", exact: true }).click();
      await sheet.getByText("Copied").waitFor();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `${app!.baseUrl}/invite/${FIRST_TOKEN}`,
      );
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await lowestContrast(page, `[data-new-invite] :is(${TEXT})`)).toBeGreaterThanOrEqual(
        4.5,
      );
      await shot(page, viewport, "cohosts-created", false);

      // Revoke the older link.
      await sheet.getByRole("button", { name: /Revoke the invite link made Oct 3/ }).click();
      await page.waitForFunction(
        () => document.querySelectorAll("[data-pending-invite]").length === 1,
      );
      expect(await pendingRows.first().textContent()).toContain("Made Oct 5");
      // Its row is gone: focus lands on the section's heading, not the page.
      await page.waitForFunction(() => document.activeElement?.id === "links-heading");

      // Remove asks once more, inline, then removes; Cancel keeps them.
      await sheet.getByRole("button", { name: "Remove Leo Park" }).click();
      const confirm = sheet.locator("[data-confirm-remove]");
      await confirm.waitFor();
      expect(await confirm.textContent()).toContain("Remove Leo Park? They'll lose access");
      // Focus moves to the confirmation's first choice.
      await page.waitForFunction(() => document.activeElement?.id?.startsWith("confirm-remove-"));
      expect(
        await lowestContrast(page, `[data-confirm-remove] :is(p, button)`),
      ).toBeGreaterThanOrEqual(4.5);
      await confirm.getByRole("button", { name: "Cancel" }).click();
      expect(await sheet.locator("[data-member=cohost]").count()).toBe(2);
      // Back to the Remove it came from.
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Remove Leo Park",
      );
      await sheet.getByRole("button", { name: "Remove Leo Park" }).click();
      await sheet.getByRole("button", { name: "Remove co-host" }).click();
      await page.waitForFunction(
        () => document.querySelectorAll("[data-member=cohost]").length === 1,
      );
      expect(await sheet.locator("[data-member]").allTextContents()).not.toContain("Leo Park");
      await page.waitForFunction(() => document.activeElement?.id === "people-heading");

      // Escape returns focus to the toolbar's Co-hosts.
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden" });
      expect(await page.evaluate(() => document.activeElement?.getAttribute("data-toolbar"))).toBe(
        "cohosts",
      );
    } finally {
      await close();
    }
  });

  it("is reached from the setup checklist's Recommended group, which never counts", async () => {
    const { page, close } = await open(viewport, "/dev/creation?data=full");
    try {
      const pill = page.locator("[data-setup-pill]");
      await pill.waitFor();
      // Co-host is never a publish blocker (spec.md §23.1).
      expect((await pill.textContent())?.trim()).toBe("✓ Ready to publish");
      await pill.click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      expect(await checklist.locator("[data-setup-ready]").count()).toBe(1);
      const row = checklist.locator("[data-recommended=cohost]");
      expect((await row.innerText()).split("\n").map((line) => line.trim())).toEqual([
        "Co-host",
        "Invite someone to help you plan and host.",
        "›",
      ]);
      expect(await lowestContrast(page, `[data-recommended] span`)).toBeGreaterThanOrEqual(4.5);
      await shot(page, viewport, "checklist-recommended", false);
      await row.click();
      const sheet = page.getByRole("dialog", { name: "Co-hosts" });
      await sheet.waitFor({ state: "visible" });
      await checklist.waitFor({ state: "hidden" });
      await sheet.locator("[data-no-pending]").waitFor();
      await sheet.getByRole("button", { name: "Create invite link" }).waitFor();
      // Closing returns to the readiness control that started it.
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden" });
      expect(
        await page.evaluate(() => document.activeElement?.hasAttribute("data-setup-pill")),
      ).toBe(true);
    } finally {
      await close();
    }
  });

  it("a co-host sees no co-host management at all", async () => {
    const { page, close } = await open(viewport, "/dev/creation?data=empty&role=cohost&cohosts=1");
    try {
      await page.locator("[data-toolbar=design]").waitFor();
      expect(await page.locator("[data-toolbar=cohosts]").count()).toBe(0);
      expect(await page.getByRole("button", { name: "Co-hosts" }).count()).toBe(0);
      await page.locator("[data-setup-pill]").click();
      const checklist = page.getByRole("dialog", { name: "Setup" });
      await checklist.waitFor({ state: "visible" });
      expect(await checklist.locator("[data-recommended]").count()).toBe(0);
      expect(await page.getByRole("dialog", { name: "Co-hosts" }).count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("after publish, the toolbar's Co-hosts is still there for the owner", async () => {
    const { page, close } = await open(viewport, "/dev/creation?data=full&published=1&cohosts=1");
    try {
      await page.locator("[data-toolbar=design]").waitFor();
      // Readiness is hidden once published; the toolbar is the way in.
      expect(await page.locator("[data-setup-pill]").count()).toBe(0);
      await page.locator("[data-toolbar=cohosts]").click();
      const sheet = page.getByRole("dialog", { name: "Co-hosts" });
      await sheet.waitFor({ state: "visible" });
      await sheet.locator("[data-cohosts-panel]").waitFor();
      expect(await sheet.locator("[data-member=cohost]").count()).toBe(1);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });
});
