import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";

import {
  DESKTOP,
  MOBILE,
  hasHorizontalScroll,
  launchBrowser,
  newPage,
  startApp,
  type AppServer,
} from "./harness";

/**
 * The card editor's text background in a real browser at 390 and 1280 (`spec.md §20.1`; §31 Card
 * editor, "Text background"; `docs/design-system.md §4.10a`), through the development fixture
 * /dev/card-editor: the production `InvitationCard` over a card whose starting text is computed as
 * generation computes it, the `TextBackgroundControl`, and the server's own save path (no database,
 * no model). Each style is applied and read back from the stored boxes and the card; the text
 * colour and the artwork never change; the controls work by keyboard and meet the 44px target.
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

interface StoredBackground {
  style: string;
  color: string;
  opacity: number;
  padding: number;
}

interface StoredBox {
  id: string;
  x: number;
  y: number;
  width: number;
  size: number;
  color: string;
  background?: StoredBackground;
}

async function open(viewport: { width: number; height: number }, card = "notorious") {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const { page, close } = await newPage(browser, viewport);
  await page.goto(`${app.baseUrl}/dev/card-editor?card=${card}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, close };
}

async function stored(page: Page, id: string): Promise<StoredBox> {
  return page.evaluate((boxId) => {
    const boxes = JSON.parse(document.getElementById("stored-boxes")!.textContent!) as StoredBox[];
    return boxes.find((b) => b.id === boxId)!;
  }, id);
}

/** Waits until the stored box satisfies `predicate` (run in the page, on the stored box). */
async function waitStored(page: Page, id: string, predicate: string) {
  await page.waitForFunction(
    ({ boxId, body }) => {
      const boxes = JSON.parse(document.getElementById("stored-boxes")!.textContent!) as StoredBox[];
      const box = boxes.find((b) => b.id === boxId);
      return box !== undefined && new Function("box", `return (${body});`)(box) === true;
    },
    { boxId: id, body: predicate },
  );
}

async function settled(page: Page) {
  await page.waitForFunction(
    () => document.getElementById("save-status")!.getAttribute("data-status") !== "saving",
  );
}

async function artwork(page: Page) {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>("[data-card-face] img")!;
    return {
      src: img.getAttribute("src"),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      sha: document.querySelector("[data-artwork-sha256]")!.getAttribute("data-artwork-sha256"),
    };
  });
}

/** The title's text-background element, relative to the card face, in fractions of its width. */
async function backgroundRect(page: Page, style: string) {
  return page.evaluate((s) => {
    const face = document.querySelector("[data-card-face]")!.getBoundingClientRect();
    const el = document.querySelector(
      `[data-card-box="title"] [data-card-text-background="${s}"]`,
    );
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: (rect.left - face.left) / face.width,
      top: (rect.top - face.top) / face.width,
      width: rect.width / face.width,
    };
  }, style);
}

function textColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const line = document.querySelector('[data-card-box="title"] [data-card-line]')!;
    return getComputedStyle(line).color;
  });
}

const STYLES = [
  ["highlight", "Highlight"],
  ["box", "Rounded box"],
  ["backdrop", "Soft backdrop"],
] as const;

describe("the text background in the card editor fixture", () => {
  for (const [name, viewport] of [
    ["390", MOBILE],
    ["1280", DESKTOP],
  ] as const) {
    it(`applies each style, then None, without touching the text or the artwork (${name})`, async () => {
      const { page, close } = await open(viewport);
      try {
        const before = await artwork(page);
        expect(before.naturalWidth).toBeGreaterThan(0);
        // The served bytes are the ones hashed: the route never re-encodes.
        const served = await fetch(new URL(before.src!, app!.baseUrl));
        expect(createHash("sha256").update(Buffer.from(await served.arrayBuffer())).digest("hex")).toBe(
          before.sha,
        );

        await page.click('[data-dev-select="title"]');
        const title = await stored(page, "title");
        expect(title.background).toBeUndefined();
        const color = await textColor(page);

        for (const [style, label] of STYLES) {
          await page.getByRole("radio", { name: label }).click();
          await waitStored(page, "title", `box.background && box.background.style === "${style}"`);
          await settled(page);
          const after = await stored(page, "title");
          expect(after.color).toBe(title.color);
          expect(after.background!.opacity).toBeGreaterThan(0);
          await page.waitForSelector(`[data-card-box="title"] [data-card-text-background="${style}"]`);
          expect(await textColor(page)).toBe(color);
          expect(await page.getByRole("radio", { name: label }).getAttribute("aria-checked")).toBe(
            "true",
          );
        }

        await page.getByRole("radio", { name: "None" }).click();
        await waitStored(page, "title", "box.background === undefined");
        await settled(page);
        expect(await page.locator('[data-card-box="title"] [data-card-text-background]').count()).toBe(
          0,
        );
        expect(await textColor(page)).toBe(color);
        expect(await hasHorizontalScroll(page)).toBe(false);

        // Nothing above changed the artwork.
        expect(await artwork(page)).toEqual(before);
      } finally {
        await close();
      }
    });

    it(`moves and resizes a box and its background goes with it (${name})`, async () => {
      const { page, close } = await open(viewport);
      try {
        const before = await artwork(page);
        await page.click('[data-dev-select="title"]');
        await page.getByRole("radio", { name: "Rounded box" }).click();
        await waitStored(page, "title", `box.background && box.background.style === "box"`);
        await settled(page);
        const start = await stored(page, "title");
        const rect = await backgroundRect(page, "box");
        expect(rect).not.toBeNull();
        const faceWidth = await page.evaluate(
          () => document.querySelector("[data-card-face]")!.getBoundingClientRect().width,
        );

        await page.click('[data-dev-action="right"]');
        await waitStored(page, "title", `box.x === ${start.x + 10}`);
        await settled(page);
        await page.click('[data-dev-action="down"]');
        await waitStored(page, "title", `box.y === ${start.y + 10}`);
        await settled(page);
        const moved = await backgroundRect(page, "box");
        expect((moved!.left - rect!.left) * faceWidth).toBeCloseTo((10 / 1000) * faceWidth, 0);
        expect((moved!.top - rect!.top) * faceWidth).toBeCloseTo((10 / 1000) * faceWidth, 0);

        await page.click('[data-dev-action="narrower"]');
        await waitStored(page, "title", `box.width === ${start.width - 20}`);
        await settled(page);
        const narrower = await stored(page, "title");
        expect(narrower.width).toBe(start.width - 20);
        expect(narrower.background).toEqual(start.background);
        const resized = await backgroundRect(page, "box");
        expect(resized).not.toBeNull();

        await page.click('[data-dev-action="larger"]');
        await waitStored(page, "title", `box.size === ${start.size + 4}`);
        await settled(page);
        const larger = await backgroundRect(page, "box");
        expect(larger).not.toBeNull();
        expect(await hasHorizontalScroll(page)).toBe(false);

        expect(await artwork(page)).toEqual(before);
      } finally {
        await close();
      }
    });

    it(`is operable by keyboard and has 44px targets (${name})`, async () => {
      const { page, close } = await open(viewport);
      try {
        await page.click('[data-dev-select="title"]');
        await page.getByRole("radio", { name: "Highlight" }).click();
        await waitStored(page, "title", `box.background && box.background.style === "highlight"`);
        await settled(page);

        // The style group: arrow keys move the choice (and the one tab stop with it).
        await page.getByRole("radio", { name: "Highlight" }).focus();
        await page.keyboard.press("ArrowRight");
        await waitStored(page, "title", `box.background && box.background.style === "box"`);
        await settled(page);
        expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Rounded box");
        await page.keyboard.press("ArrowLeft");
        await waitStored(page, "title", `box.background && box.background.style === "highlight"`);
        await settled(page);

        // Sliders: arrow keys step by one.
        const opacity = (await stored(page, "title")).background!.opacity;
        await page.locator("#bg-opacity-slider").focus();
        await page.keyboard.press("ArrowLeft");
        await waitStored(
          page,
          "title",
          `Math.round(box.background.opacity * 100) === ${Math.round(opacity * 100) - 1}`,
        );
        await settled(page);
        const padding = (await stored(page, "title")).background!.padding;
        await page.locator("#bg-padding-slider").focus();
        await page.keyboard.press("ArrowRight");
        await waitStored(page, "title", `box.background.padding === ${padding + 1}`);
        await settled(page);

        // The paired numeric field and the hex field, typed.
        await page.fill("#bg-opacity", "40");
        await waitStored(page, "title", "Math.round(box.background.opacity * 100) === 40");
        await page.fill("#bg-hex", "aa3311");
        await waitStored(page, "title", `box.background.color === "#AA3311"`);
        await settled(page);
        expect(await page.locator("#bg-opacity-slider").inputValue()).toBe("40");

        // Every control of the editor is at least 44px in both directions.
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('section[aria-label="Editor"] button, section[aria-label="Editor"] input')]
            .map((el) => ({ el, rect: el.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0 && (rect.width < 43.5 || rect.height < 43.5))
            .map(({ el, rect }) => `${el.tagName} ${el.id || el.textContent} ${rect.width}x${rect.height}`),
        );
        expect(small).toEqual([]);
        expect(await hasHorizontalScroll(page)).toBe(false);
      } finally {
        await close();
      }
    });
  }

  it("works on the second card too, with its own artwork", async () => {
    const { page, close } = await open(MOBILE, "boystory");
    try {
      const art = await artwork(page);
      expect(art.src).toContain("/artwork/boystory");
      await page.click('[data-dev-select="title"]');
      await page.getByRole("radio", { name: "Soft backdrop" }).click();
      await waitStored(page, "title", `box.background && box.background.style === "backdrop"`);
      await page.waitForSelector('[data-card-box="title"] [data-card-text-background="backdrop"]');
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(await artwork(page)).toEqual(art);
    } finally {
      await close();
    }
  });
});
