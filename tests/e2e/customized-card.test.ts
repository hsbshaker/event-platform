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
 * A card the host has edited, in a real browser at 390 and 1280 (`spec.md §20.4`; §31 Card editor
 * "Each box's line breaks are computed deterministically and stored; guests see exactly the lines,
 * positions and styles the host saw, at every size; the browser never re-wraps card text"; Card
 * rendering and envelope "a real-browser fixture shows every stored line where the component sets
 * it"; "identical in proportion, line breaks and layout at 390px and 1280px"), through the
 * development fixture /dev/customized: boxes stored by the server's own path (edited fonts, sizes,
 * widths, spacing, case, rotation, hard breaks, a box past the outline), drawn by the production
 * `InvitationCard`.
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

interface StoredBox {
  id: string;
  x: number;
  y: number;
  width: number;
  lines: string[];
}

interface DrawnBox {
  id: string;
  /** Untransformed layout, as fractions of the card's width. */
  left: number;
  top: number;
  width: number;
  lines: { text: string; fragments: number; contentWidth: number; boxWidth: number }[];
}

async function open(viewport: { width: number; height: number }) {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  const { page, close } = await newPage(browser, viewport);
  await page.goto(`${app.baseUrl}/dev/customized`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, close };
}

async function read(
  page: Page,
): Promise<{ stored: StoredBox[]; drawn: DrawnBox[]; ratio: number }> {
  return page.evaluate(() => {
    const stored = JSON.parse(document.getElementById("stored-boxes")!.textContent!) as StoredBox[];
    const face = document.querySelector("[data-card-face]") as HTMLElement;
    const faceRect = face.getBoundingClientRect();
    const faceWidth = faceRect.width;
    const drawn = [...face.querySelectorAll<HTMLElement>("[data-card-box]")].map((p) => {
      // Measured unrotated, so widths are the text's own; the rotation is restored after.
      const transform = p.style.transform;
      p.style.transform = "none";
      const box = p.getBoundingClientRect();
      const result = {
        id: p.getAttribute("data-card-box") ?? "",
        left: (box.left - faceRect.left) / faceWidth,
        top: (box.top - faceRect.top) / faceWidth,
        width: box.width / faceWidth,
        lines: [...p.querySelectorAll<HTMLElement>("[data-card-line]")].map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span);
          return {
            text: span.textContent ?? "",
            fragments: range.getClientRects().length,
            contentWidth: range.getBoundingClientRect().width / faceWidth,
            boxWidth: span.getBoundingClientRect().width / faceWidth,
          };
        }),
      };
      p.style.transform = transform;
      return result;
    });
    return { stored, drawn, ratio: faceRect.height / faceWidth };
  });
}

describe("a customized card in the browser", () => {
  const sizes = [
    ["390", MOBILE],
    ["1280", DESKTOP],
  ] as const;

  it("sets every stored line, unwrapped and within its box, where the component places it", async () => {
    const results: Awaited<ReturnType<typeof read>>[] = [];
    for (const [name, viewport] of sizes) {
      const { page, close } = await open(viewport);
      const result = await read(page);
      results.push(result);
      expect(await hasHorizontalScroll(page), name).toBe(false);
      await close();

      const withLines = result.stored.filter((b) => b.lines.length > 0);
      expect(result.drawn.map((b) => b.id).sort(), name).toEqual(withLines.map((b) => b.id).sort());
      for (const box of withLines) {
        const drawn = result.drawn.find((d) => d.id === box.id)!;
        // Exactly the stored lines, in order: nothing re-wrapped, merged or dropped.
        expect(
          drawn.lines.map((l) => l.text),
          `${name} ${box.id}`,
        ).toEqual(box.lines);
        for (const line of drawn.lines) {
          expect(line.fragments, `${name} ${box.id} "${line.text}"`).toBe(1);
          // The server's measurement holds in the browser: each line fits its box's width.
          expect(line.contentWidth, `${name} ${box.id} "${line.text}"`).toBeLessThanOrEqual(
            line.boxWidth + 1e-3,
          );
        }
        // At the stored position and width (card units over the 1000-wide card).
        expect(drawn.left * 1000, `${name} ${box.id} x`).toBeCloseTo(box.x, 0);
        expect(drawn.top * 1000, `${name} ${box.id} y`).toBeCloseTo(box.y, 0);
        expect(drawn.width * 1000, `${name} ${box.id} width`).toBeCloseTo(box.width, 0);
      }
    }
    // The same card at both sizes: proportion, lines and layout.
    const [phone, desktop] = results;
    expect(phone.ratio).toBeCloseTo(1.4, 2);
    expect(desktop.ratio).toBeCloseTo(phone.ratio, 3);
    for (const box of phone.drawn) {
      const other = desktop.drawn.find((d) => d.id === box.id)!;
      expect(other.lines.map((l) => l.text)).toEqual(box.lines.map((l) => l.text));
      expect(other.left).toBeCloseTo(box.left, 3);
      expect(other.top).toBeCloseTo(box.top, 3);
      expect(other.width).toBeCloseTo(box.width, 3);
    }
  });

  it("stores and draws a hard break the host typed, and an edited box re-broken at its new width", async () => {
    const { page, close } = await open(MOBILE);
    const { stored } = await read(page);
    await close();
    const added = stored.find((b) => b.id === "added-1")!;
    expect(added.lines[0]).toBe("Lunch in the orchard");
    expect(added.lines.length).toBeGreaterThan(2);
    const date = stored.find((b) => b.id === "date")!;
    expect(date.lines.length).toBeGreaterThan(1);
  });
});
