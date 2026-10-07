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
      const boxes = JSON.parse(
        document.getElementById("stored-boxes")!.textContent!,
      ) as StoredBox[];
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

/**
 * The artwork as the guest sees it: its source and natural size, where it sits on the face and how
 * it is drawn (any transform, filter or fade would show here), and a SHA-256 of its decoded pixels
 * drawn to a canvas.
 */
async function artwork(page: Page) {
  return page.evaluate(async () => {
    const face = document.querySelector("[data-card-face]")!.getBoundingClientRect();
    const img = document.querySelector<HTMLImageElement>("[data-card-face] img")!;
    await img.decode();
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
      src: img.getAttribute("src"),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      sha: document.querySelector("[data-artwork-sha256]")!.getAttribute("data-artwork-sha256"),
      onFace: {
        left: round((rect.left - face.left) / face.width),
        top: round((rect.top - face.top) / face.width),
        width: round(rect.width / face.width),
        height: round(rect.height / face.width),
      },
      drawn: {
        opacity: style.opacity,
        transform: style.transform,
        filter: style.filter,
        objectPosition: style.objectPosition,
      },
      pixels: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""),
    };
  });
}

/** SHA-256 of the artwork's bytes as served now. */
async function servedSha(src: string): Promise<string> {
  const served = await fetch(new URL(src, app!.baseUrl));
  return createHash("sha256")
    .update(Buffer.from(await served.arrayBuffer()))
    .digest("hex");
}

/** The artwork is exactly what it was: the same bytes served, the same pixels, drawn the same. */
async function expectArtworkUnchanged(page: Page, before: Awaited<ReturnType<typeof artwork>>) {
  expect(await artwork(page)).toEqual(before);
  expect(await servedSha(before.src!)).toBe(before.sha);
}

/** Every title line, and everything above it up to the face, is drawn at full opacity. */
function titleOpacities(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const face = document.querySelector("[data-card-face]")!;
    const seen: string[] = [];
    for (const line of document.querySelectorAll('[data-card-box="title"] [data-card-line]')) {
      for (let el: Element | null = line; el && el !== face; el = el.parentElement) {
        seen.push(getComputedStyle(el).opacity);
      }
    }
    return seen;
  });
}

/**
 * The title's drawn text background (the shape of a box or backdrop, the union of a highlight's
 * lines), relative to the card face, in fractions of its width.
 */
async function backgroundRect(page: Page, style: string) {
  return page.evaluate((s) => {
    const face = document.querySelector("[data-card-face]")!.getBoundingClientRect();
    const layer = document.querySelector(
      `[data-card-box="title"] [data-card-text-background="${s}"]`,
    );
    if (!layer) return null;
    const parts = [
      ...layer.querySelectorAll("[data-card-text-background-shape], [data-card-text-highlight]"),
    ].map((el) => el.getBoundingClientRect());
    if (parts.length === 0) return null;
    const left = Math.min(...parts.map((r) => r.left));
    const top = Math.min(...parts.map((r) => r.top));
    const right = Math.max(...parts.map((r) => r.right));
    const bottom = Math.max(...parts.map((r) => r.bottom));
    return {
      left: (left - face.left) / face.width,
      top: (top - face.top) / face.width,
      width: (right - left) / face.width,
      height: (bottom - top) / face.width,
    };
  }, style);
}

/** The title box itself, relative to the card face, in fractions of its width. */
async function titleBoxRect(page: Page) {
  return page.evaluate(() => {
    const face = document.querySelector("[data-card-face]")!.getBoundingClientRect();
    const rect = document.querySelector('[data-card-box="title"]')!.getBoundingClientRect();
    return {
      left: (rect.left - face.left) / face.width,
      top: (rect.top - face.top) / face.width,
      width: rect.width / face.width,
      height: rect.height / face.width,
    };
  });
}

type Rect = { left: number; top: number; width: number; height: number };

/** `inner` lies within `outer` grown by `pad` (fractions of the face width), to half a pixel. */
function expectWithin(inner: Rect, outer: Rect, pad: number, faceWidth: number) {
  const slack = pad + 0.5 / faceWidth;
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - slack);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - slack);
  expect(inner.left + inner.width).toBeLessThanOrEqual(outer.left + outer.width + slack);
  expect(inner.top + inner.height).toBeLessThanOrEqual(outer.top + outer.height + slack);
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
        expect(await servedSha(before.src!)).toBe(before.sha);

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
          await page.waitForSelector(
            `[data-card-box="title"] [data-card-text-background="${style}"]`,
          );
          expect(await textColor(page)).toBe(color);
          // The background's opacity is its fill's alone: the text stays fully opaque.
          expect(new Set(await titleOpacities(page))).toEqual(new Set(["1"]));
          expect(await page.getByRole("radio", { name: label }).getAttribute("aria-checked")).toBe(
            "true",
          );
          await expectArtworkUnchanged(page, before);
        }

        await page.getByRole("radio", { name: "None" }).click();
        await waitStored(page, "title", "box.background === undefined");
        await settled(page);
        expect(
          await page.locator('[data-card-box="title"] [data-card-text-background]').count(),
        ).toBe(0);
        expect(await textColor(page)).toBe(color);
        expect(new Set(await titleOpacities(page))).toEqual(new Set(["1"]));
        expect(await hasHorizontalScroll(page)).toBe(false);

        // Nothing above changed the artwork.
        await expectArtworkUnchanged(page, before);
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
        const faceWidth = await page.evaluate(
          () => document.querySelector("[data-card-face]")!.getBoundingClientRect().width,
        );
        // The padding, in fractions of the face width (the face is 1000 card units wide).
        const pad = start.background!.padding / 1000;
        const rect = await backgroundRect(page, "box");
        expect(rect).not.toBeNull();
        expectWithin(rect!, await titleBoxRect(page), pad, faceWidth);

        await page.click('[data-dev-action="right"]');
        await waitStored(page, "title", `box.x === ${start.x + 10}`);
        await settled(page);
        await page.click('[data-dev-action="down"]');
        await waitStored(page, "title", `box.y === ${start.y + 10}`);
        await settled(page);
        const moved = await backgroundRect(page, "box");
        expect((moved!.left - rect!.left) * faceWidth).toBeCloseTo((10 / 1000) * faceWidth, 0);
        expect((moved!.top - rect!.top) * faceWidth).toBeCloseTo((10 / 1000) * faceWidth, 0);
        expectWithin(moved!, await titleBoxRect(page), pad, faceWidth);
        await expectArtworkUnchanged(page, before);

        await page.click('[data-dev-action="narrower"]');
        await waitStored(page, "title", `box.width === ${start.width - 20}`);
        await settled(page);
        const narrower = await stored(page, "title");
        expect(narrower.width).toBe(start.width - 20);
        expect(narrower.background).toEqual(start.background);
        const resized = await backgroundRect(page, "box");
        expect(resized).not.toBeNull();
        expectWithin(resized!, await titleBoxRect(page), pad, faceWidth);

        await page.click('[data-dev-action="larger"]');
        await waitStored(page, "title", `box.size === ${start.size + 4}`);
        await settled(page);
        const larger = await backgroundRect(page, "box");
        expect(larger).not.toBeNull();
        // Larger type, the same lines: the background grows with the box.
        expect(larger!.height).toBeGreaterThan(resized!.height);
        expectWithin(larger!, await titleBoxRect(page), pad, faceWidth);
        expect(new Set(await titleOpacities(page))).toEqual(new Set(["1"]));
        expect(await hasHorizontalScroll(page)).toBe(false);

        await expectArtworkUnchanged(page, before);
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

        // A half-typed colour is kept with its error when the field is left, never dropped, and
        // the colour in force does not change; corrected, it applies and the error goes.
        await page.fill("#bg-hex", "AA33");
        await page.locator("#bg-hex").press("Enter");
        await page.locator("#bg-hex").blur();
        await page.waitForSelector("#bg-hex-error");
        expect(await page.locator("#bg-hex").inputValue()).toBe("AA33");
        expect((await stored(page, "title")).background!.color).toBe("#AA3311");
        await page.fill("#bg-hex", "#112233");
        await waitStored(page, "title", `box.background.color === "#112233"`);
        await settled(page);
        expect(await page.locator("#bg-hex-error").count()).toBe(0);

        // Every control of the editor is at least 44px in both directions.
        const small = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              'section[aria-label="Editor"] button, section[aria-label="Editor"] input',
            ),
          ]
            .map((el) => ({ el, rect: el.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0 && (rect.width < 43.5 || rect.height < 43.5))
            .map(
              ({ el, rect }) =>
                `${el.tagName} ${el.id || el.textContent} ${rect.width}x${rect.height}`,
            ),
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
      expect(new Set(await titleOpacities(page))).toEqual(new Set(["1"]));
      expect(await hasHorizontalScroll(page)).toBe(false);
      await expectArtworkUnchanged(page, art);
    } finally {
      await close();
    }
  });
});
