import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
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
      expect(await page.getByRole("button", { name: /create my invitation/i }).isVisible()).toBe(
        true,
      );
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

  it("says so plainly when the browser cannot open a HEIC photo, and uploads nothing", async () => {
    // Chromium has no HEIC decoder, so a HEIC selection must end in the canonical message.
    const { page, close } = await newPage(browser, viewport);
    try {
      let uploads = 0;
      await page.route("**/api/inspiration", (route) => {
        uploads += 1;
        return route.abort();
      });
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator("input[type=file]").setInputFiles({
        name: "IMG_0001.HEIC",
        mimeType: "image/heic",
        buffer: Buffer.from("not really an image"),
      });
      const message = "This browser can't open HEIC photos — please add a JPEG or PNG instead.";
      await page.getByText(message).waitFor({ timeout: 10_000 });
      expect(uploads).toBe(0);
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

  it("shows showcase cards as captioned pictures, never as choices", async () => {
    // design-system §4.1 and spec.md §32 #6: real cards for sample events, never selectable.
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      const cards = page.locator("figure img[src*='showcase']");
      const shown = await cards.evaluateAll((imgs) =>
        imgs
          .filter((img) => (img as HTMLElement).offsetParent !== null)
          .map((img) => ({
            alt: img.getAttribute("alt") ?? "",
            interactive: Boolean(img.closest("a, button, [tabindex], [role=button], [role=link]")),
            caption: img.closest("figure")?.querySelector("figcaption")?.textContent ?? "",
          })),
      );
      // A phone shows one; a 1280 desktop the outer pair (the inner pair needs 1440).
      expect(shown.length).toBe(viewport.width < 1024 ? 1 : 2);
      for (const card of shown) {
        expect(card.alt.length).toBeGreaterThan(20);
        expect(card.interactive).toBe(false);
        expect(card.caption).toMatch(/^“.+”$/);
      }
    } finally {
      await close();
    }
  });

  it("rings the composer in amber on the dusk field when it has focus", async () => {
    // design-system §5.3, §14.1: a focus indicator clears 3:1 against the surface it sits on.
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#prompt").focus();
      const ring = await page.locator("#prompt").evaluate((el) => {
        const box = getComputedStyle(el.closest(".surface-lit")!);
        return { style: box.outlineStyle, width: box.outlineWidth, color: box.outlineColor };
      });
      expect(ring).toEqual({ style: "solid", width: "2px", color: "rgb(244, 164, 58)" });
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

/** WCAG contrast of every matching element's text against its first opaque ancestor background. */
async function lowestContrast(page: Page, selector: string): Promise<number> {
  const ratios = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
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

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("whose account Create uses, at %s", (_label, viewport) => {
  // spec.md §7.1: a sign-in link works in any browser, so a signed-in landing names the account
  // under Create, in full, with a way out. The signed-in states come from the /dev/landing fixture
  // (the real LandingView; this app has no database to sign anyone in).
  const LINE = "[data-signed-in-as]";

  it("signed out: offers Sign in and names no account", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "Sign in" }).waitFor({ timeout: 10_000 });
      expect(await page.locator(LINE).count()).toBe(0);
      expect(await page.getByRole("button", { name: "Sign out" }).count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("signed in: names the account under Create, with Sign out, in place of Sign in", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/dev/landing`, { waitUntil: "domcontentloaded" });
      const line = page.locator(LINE);
      await line.waitFor({ timeout: 10_000 });
      expect((await line.innerText()).replace(/\s+/g, " ")).toBe(
        "Creating as host@example.com. Not you? Sign out",
      );
      expect(await page.getByRole("link", { name: "Sign in" }).count()).toBe(0);

      // Just above the composer, which still starts in the first viewport, and on screen
      // whenever Create is: scrolled to the action, the line is still in view.
      const prompt = await page.locator("#prompt").boundingBox();
      expect((await line.boundingBox())!.y).toBeLessThan(prompt!.y);
      expect(prompt!.y).toBeLessThan(viewport.height);
      const create = page.getByRole("button", { name: /create my invitation/i }).first();
      await create.scrollIntoViewIfNeeded();
      const inView = async (el: typeof line) =>
        el.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        });
      expect(await inView(create)).toBe(true);
      expect(await inView(line)).toBe(true);

      // Its own form: Sign out never submits the composer, and the composer never signs out.
      expect(
        await page
          .getByRole("button", { name: "Sign out" })
          .evaluate((b) => b.closest("form")?.contains(document.querySelector("#prompt"))),
      ).toBe(false);

      // design-system §14.1: text on dusk clears 4.5:1; §7.6: 44px touch targets on phones.
      expect(
        await lowestContrast(page, `${LINE} p, ${LINE} span, ${LINE} button`),
      ).toBeGreaterThanOrEqual(4.5);
      expect(await hasHorizontalScroll(page)).toBe(false);
      if (viewport.width <= 700) {
        expect(await undersizedTapTargets(page, "button, a[href]")).toEqual([]);
      }
    } finally {
      await close();
    }
  });

  it("shows a long address in full and never scrolls sideways for it", async () => {
    const email = "a.very.long.address.for.testing.wrapping@subdomain.example-events.example.com";
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/dev/landing?email=${encodeURIComponent(email)}`, {
        waitUntil: "domcontentloaded",
      });
      const line = page.locator(LINE);
      await line.waitFor({ timeout: 10_000 });
      expect((await line.innerText()).replace(/\s+/g, "")).toContain(email);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("signed in without an address: still says so, with Sign out", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/dev/landing?state=no-email`, {
        waitUntil: "domcontentloaded",
      });
      const line = page.locator(LINE);
      await line.waitFor({ timeout: 10_000 });
      expect((await line.innerText()).replace(/\s+/g, " ")).toBe(
        "You’re signed in. Not you? Sign out",
      );
    } finally {
      await close();
    }
  });
});

describe("signing out from the landing page", () => {
  it("returns to the landing page signed out, keeping what was written", async () => {
    const { page, close } = await newPage(browser, MOBILE);
    try {
      await page.goto(`${requireApp().baseUrl}/dev/landing`, { waitUntil: "domcontentloaded" });
      await page.locator("#prompt").fill(PROMPT);
      await page.locator("#prompt").blur();
      await page.waitForFunction(
        (expected) => Object.values(localStorage).some((v) => v.includes(expected)),
        PROMPT.slice(0, 40),
        { timeout: 10_000 },
      );
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL(`${requireApp().baseUrl}/`, { timeout: 15_000 });
      await page.getByRole("link", { name: "Sign in" }).waitFor({ timeout: 10_000 });
      expect(await page.locator("[data-signed-in-as]").count()).toBe(0);
      await page.waitForFunction(
        (expected) =>
          (document.querySelector("#prompt") as HTMLTextAreaElement)?.value === expected,
        PROMPT,
        { timeout: 10_000 },
      );
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
      const create = page.getByRole("button", { name: /create my invitation/i });
      expect(await create.isDisabled()).toBe(true);
      await page.locator("#prompt").fill("A baby shower");
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find((b) =>
            /create my invitation/i.test(b.textContent ?? ""),
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

describe.each([
  ["desktop 1024", { width: 1024, height: 800 }],
  ["desktop 1440", { width: 1440, height: 900 }],
])("landing showcase at %s", (_label, viewport) => {
  it("keeps every hanging card and caption on screen and clear of the composer", async () => {
    // design-system §4.1: cards hang beside the composer's column, never over it.
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(requireApp().baseUrl, { waitUntil: "domcontentloaded" });
      const composer = await page
        .locator("#prompt")
        .evaluate((el) => el.closest(".surface-lit")!.getBoundingClientRect().toJSON());
      const figures = await page.locator("figure:has(img[src*='showcase'])").evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            // The caption may be wider than the card, so measure both together.
            const card = el.getBoundingClientRect();
            const caption = el.querySelector("figcaption")!.getBoundingClientRect();
            return {
              left: Math.min(card.left, caption.left),
              right: Math.max(card.right, caption.right),
            };
          }),
      );
      expect(figures.length).toBe(viewport.width >= 1440 ? 4 : 2);
      for (const f of figures) {
        expect(f.left).toBeGreaterThanOrEqual(0);
        expect(f.right).toBeLessThanOrEqual(viewport.width);
        const apart = f.right <= composer.left || f.left >= composer.right;
        expect(apart).toBe(true);
      }
    } finally {
      await close();
    }
  });
});
