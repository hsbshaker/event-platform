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
 * The generation surface and the card reveal in a real browser at 390 and 1280
 * (`docs/screen-spec.md` `generation`, `card-reveal`; `spec.md §31` — Prompt, auth, and generation;
 * Card experience; Creation Mode), driven through the development fixture /dev/generation: every
 * state from fixture data, no database. Screenshots of each state go to SHOTS when it is set.
 */

let app: AppServer | null;
let browser: Browser;

const SHOTS = process.env.GENERATION_SHOTS_DIR;

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

/** Words the host never sees (`docs/screen-spec.md` global rules; `spec.md §26`). */
const INTERNAL = /Event Identity|art mode|\blayout\b|\bink\b|\bpanel\b|\d+\s?%|GPT|OpenAI|token/i;

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("generation surface at %s", (_label, viewport) => {
  const states: [string, string, RegExp | null][] = [
    ["starting", "state=starting", /Getting started/],
    ["identity", "state=identity", /Designing your card/],
    ["design", "state=design", /Painting the artwork/],
    ["notice", "state=notice", /for copyright reasons/],
  ];
  for (const [name, query, line] of states) {
    it(`${name}: renders the header, the details and one truthful line, no horizontal scroll`, async () => {
      const { page, close } = await openFixture(viewport, query);
      try {
        await page
          .getByRole("heading", { name: "A few details while we create…" })
          .waitFor({ state: "visible" });
        if (line) await page.getByText(line).first().waitFor({ state: "visible" });
        expect(await hasHorizontalScroll(page)).toBe(false);
        expect(await page.locator("body").innerText()).not.toMatch(INTERNAL);
        expect(await page.getByRole("button", { name: "Try again" }).count()).toBe(0);
        await shot(page, viewport, name);
      } finally {
        await close();
      }
    });
  }

  it("shows the identity's words, then the design's name, description and art direction", async () => {
    const { page, close } = await openFixture(viewport, "state=design");
    try {
      const identity = page.locator('[data-generation-artifact="identity"]');
      await identity.waitFor({ state: "visible" });
      expect(await identity.innerText()).toContain("lemon yellow, olive, cream");
      const design = page.locator('[data-generation-artifact="design"]');
      const text = await design.innerText();
      expect(text).toContain("Lemons & Linen");
      expect(text).toContain("Loose watercolour on textured paper");
      // Before the design is recorded there is no design block.
      const early = await openFixture(viewport, "state=identity");
      try {
        expect(await early.page.locator('[data-generation-artifact="design"]').count()).toBe(0);
        expect(await early.page.locator('[data-generation-artifact="identity"]').count()).toBe(1);
      } finally {
        await early.close();
      }
    } finally {
      await close();
    }
  });

  for (const [code, title, retry] of [
    ["provider_error", /We couldn't finish your card/, true],
    ["artwork_invalid", /The artwork wasn't right/, true],
    ["provider_refusal", /We need a fresh take/, true],
    ["stopped", /Your card stopped partway/, true],
    ["event_cap", /That's a lot of designs for one day/, false],
    ["host_cap", /That's a lot of designs for one day/, false],
    ["published", /Your invitation is published/, false],
  ] as [string, RegExp, boolean][]) {
    it(`failure ${code}: honest copy, ${retry ? "with" : "without"} Try again`, async () => {
      const { page, close } = await openFixture(viewport, `state=failed&code=${code}`);
      try {
        await page.getByRole("heading", { name: title }).waitFor({ state: "visible" });
        expect(await page.getByRole("button", { name: "Try again" }).count()).toBe(retry ? 1 : 0);
        expect(await hasHorizontalScroll(page)).toBe(false);
        expect(await page.locator("body").innerText()).not.toMatch(INTERNAL);
        await shot(page, viewport, `failed-${code}`);
      } finally {
        await close();
      }
    });
  }

  it("details: values from the description are pre-filled, marked and not saved until confirmed", async () => {
    const { page, close } = await openFixture(viewport, "state=starting");
    try {
      expect(await page.getByRole("textbox", { name: "Hosts" }).inputValue()).toBe("Ana & Leo");
      expect(await page.getByRole("textbox", { name: "Baby's name" }).inputValue()).toBe(
        "Maya Lopez",
      );
      expect(await page.getByRole("textbox", { name: "Venue name" }).inputValue()).toBe(
        "Villa Rosa",
      );
      expect(await page.getByRole("textbox", { name: "Address" }).inputValue()).toBe("");
      expect(await page.getByText("From your description").count()).toBe(3);
      await page.getByRole("button", { name: "Confirm Hosts" }).waitFor({ state: "visible" });
      // The date and time are never parsed: the pickers stay empty, with what the host wrote beside.
      expect(await page.getByLabel(/Event date/).inputValue()).toBe("");
      expect(await page.getByLabel(/Start time/).inputValue()).toBe("");
      await page.getByText("You wrote “December 19”").waitFor({ state: "visible" });
      await page.getByText("You wrote “2pm”").waitFor({ state: "visible" });
      // Editing a value makes it the host's: its marker goes.
      await page.getByRole("textbox", { name: "Hosts" }).fill("Ana & Leo Park");
      await page.getByRole("button", { name: "Confirm Hosts" }).waitFor({ state: "detached" });
      expect(await page.getByText("From your description").count()).toBe(2);
      // Confirming removes the marker too.
      await page.getByRole("button", { name: "Confirm Baby's name" }).click();
      expect(await page.getByText("From your description").count()).toBe(1);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });
});

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("card reveal at %s", (_label, viewport) => {
  for (const shape of ["rectangle", "square"] as const) {
    it(`${shape}: the box is reserved, the card opens on a tap, actions and markers follow`, async () => {
      const { page, close } = await openFixture(viewport, `state=reveal&shape=${shape}&delay=600`);
      try {
        const envelope = page.getByRole("button", { name: /Lemons & Linen/ });
        await envelope.waitFor({ state: "visible" });
        // Nothing of the card, the actions or the markers before the tap.
        expect(await page.locator("[data-invitation-card]").count()).toBe(0);
        expect(await page.locator("[data-reveal-actions]").count()).toBe(0);
        expect(await page.getByText("Try another direction").count()).toBe(0);
        expect(await hasHorizontalScroll(page)).toBe(false);
        await shot(page, viewport, `reveal-closed-${shape}`);

        const reserved = page.locator("[data-reveal-box]");
        const before = await reserved.boundingBox();
        await envelope.click();
        // The card is loading: the box is already reserved at the card's size.
        await page.getByText("Opening your invitation…").waitFor({ state: "visible" });
        const loading = await reserved.boundingBox();
        expect(loading!.height).toBeCloseTo(before!.height, 0);

        await page.locator("[data-invitation-card]").waitFor({ state: "visible" });
        await page.locator("[data-reveal-actions]").waitFor({ state: "visible", timeout: 5_000 });
        const after = await reserved.boundingBox();
        expect(after!.height).toBeCloseTo(before!.height, 0);
        expect(after!.y).toBeCloseTo(before!.y, 0);
        const card = await page.locator("[data-envelope-card]").boundingBox();
        expect(card!.height).toBeCloseTo(after!.height, 0);
        expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width);

        const actions = page.locator("[data-reveal-actions]");
        const text = await actions.innerText();
        expect(text).toContain("Lemons & Linen");
        expect(text).toContain("A lemon branch over soft linen.");
        expect(text).toMatch(/Your invitation looks great\.\s*Let.s make it real\./);
        const link = page.getByRole("link", { name: /Make it yours/ });
        expect(await link.getAttribute("href")).toMatch(/^\/events\/.+/);
        expect(await link.getAttribute("href")).not.toMatch(/create/);
        // Try another direction arrives with its own flow.
        expect(await page.getByText("Try another direction").count()).toBe(0);

        // Needs-confirmation markers: named for the detail, on the prompt-stated values.
        const markers = page.locator("[data-confirm-marker]");
        expect(await markers.count()).toBe(4);
        const labels = await markers.evaluateAll((els) =>
          els.map((el) => el.getAttribute("aria-label")),
        );
        expect(labels).toEqual(
          expect.arrayContaining([
            "Baby's name needs confirming",
            "Date needs confirming",
            "Time needs confirming",
            "Venue needs confirming",
          ]),
        );
        // Each marker lies over its box and inside the card.
        const cardBox = await page.locator("[data-invitation-card]").boundingBox();
        for (const handle of await markers.elementHandles()) {
          const box = await handle.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
          expect(box!.x + box!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
          expect(box!.y).toBeGreaterThanOrEqual(cardBox!.y - 1);
          expect(box!.y + box!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
        }
        // The marker layer sits outside the card's own element: card text is untouched.
        expect(await page.locator("[data-invitation-card] [data-confirm-marker]").count()).toBe(0);
        expect(await hasHorizontalScroll(page)).toBe(false);
        await shot(page, viewport, `reveal-open-${shape}`);
      } finally {
        await close();
      }
    });
  }

  it("reduced motion opens the card without animation", async () => {
    const { page, close } = await openFixture(viewport, "state=reveal", "reduce");
    try {
      await page.getByRole("button", { name: /Lemons & Linen/ }).click();
      const card = page.locator("[data-envelope-card]");
      await card.waitFor({ state: "visible", timeout: 1_500 });
      expect(await page.locator(".envelope-shell-opening, .envelope-card-opening").count()).toBe(0);
      expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
      await page.locator("[data-reveal-actions]").waitFor({ state: "visible", timeout: 1_500 });
    } finally {
      await close();
    }
  });
});
