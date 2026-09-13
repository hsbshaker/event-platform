import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import {
  DESKTOP,
  MOBILE,
  hasHorizontalScroll,
  launchBrowser,
  newPage,
  startApp,
  undersizedTapTargets,
  type AppServer,
} from "./harness";

/**
 * The Human Test #1 reviewer survey in a real browser, at the two canonical widths
 * (`docs/human-test-1/README.md`; design-system §7.3, §7.6).
 *
 * Reviewers are five people doing a favour, on whatever device is in their hand. They get one
 * link and no support, so the questionnaire has to be completable on a phone without anyone
 * explaining anything: every screen ratable with a thumb, nothing hidden under the sticky bar,
 * no sideways scroll, and a refusal that names what is missing rather than a silent partial
 * submission. That is what these assert.
 *
 * The submit endpoint is intercepted rather than driven: the local app under test has no
 * database behind it, and what matters here is the page's half of the contract — that it posts
 * exactly the object `review.html` has always produced, once, under one capability, and shows
 * the success state only when the server said yes. The server's half is covered in
 * `src/app/api/human-test-1/submit/route.test.ts` and `tests/db/human-test-1.test.ts`, and the
 * two are joined on a real deployment before reviewers are sent the link.
 *
 * The sheets are not asserted on beyond loading, on purpose: they are the frozen artifact being
 * judged (`tests/unit/human-test-blinding.test.ts` pins their bytes), and nothing here may
 * change what a reviewer sees.
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

function requireApp(): AppServer {
  if (!app) throw new Error("The app under test did not start; run `npm run build` first.");
  return app;
}

/**
 * Captures every submission the page attempts, and answers as the endpoints would.
 *
 * Two routes now: the page asks for a reviewer capability before it can submit. The stub issues a
 * fixed one rather than a real signed capability, because this file tests the page's half of the
 * contract — that it obtains one, keeps one per session, and sends it. Whether a capability is
 * genuine is decided server-side, and covered in `src/lib/human-test/capability.test.ts` and the
 * route tests.
 */
const STUB_CAPABILITY = `v1.${"A".repeat(43)}.9999999999999.${"B".repeat(43)}`;
/** Bodies the page sent to the session endpoint, so renewal can be asserted. */
let sessionRequests: unknown[] = [];
/** A capability whose window has closed — what a reviewer's tab holds a day later. */
const STALE_CAPABILITY = `v1.${"C".repeat(43)}.1.${"D".repeat(43)}`;

async function interceptSubmit(
  page: Page,
  respond: { ok: boolean; status?: number; body?: unknown } = { ok: true },
): Promise<unknown[]> {
  sessionRequests = [];
  const posted: unknown[] = [];
  await page.route("**/api/human-test-1/session", async (route) => {
    sessionRequests.push(JSON.parse(route.request().postData() || "null"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, capability: STUB_CAPABILITY, expiresAt: 9999999999999 }),
    });
  });
  await page.route("**/api/human-test-1/submit", async (route) => {
    posted.push(JSON.parse(route.request().postData() ?? "null"));
    await route.fulfill({
      status: respond.status ?? (respond.ok ? 200 : 400),
      contentType: "application/json",
      body: JSON.stringify(
        respond.body ??
          (respond.ok
            ? { ok: true, submissionId: "row-1" }
            : { ok: false, error: "This submission could not be saved." }),
      ),
    });
  });
  return posted;
}

/** Fills the questionnaire the way a reviewer would: name, one grouping, all forty ratings. */
async function completeSurvey(page: Page, reviewer = "AB") {
  await page.fill("#reviewer", reviewer);
  await page.fill("#groups", "3 17 22\n8 31");
  for (let i = 1; i <= 40; i += 1) {
    await page.check(`input[name=r${i}][value="${(i % 5) + 1}"]`);
  }
}

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("the survey at %s", (label, viewport) => {
  const mobile = viewport.width <= 700;

  it("opens directly from the one link a reviewer is sent", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      const response = await page.goto(`${requireApp().baseUrl}/human-test-1`, {
        waitUntil: "load",
      });
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/human-test-1/review.html");
      expect(await page.locator("h1").innerText()).toBe("Design-quality review");
      // No app chrome: no navigation, no sign-in, no product branding around the survey.
      expect(await page.locator("nav, header, footer").count()).toBe(0);
      expect(await page.getByRole("link", { name: /sign in/i }).count()).toBe(0);
      expect(await page.locator("a").count()).toBe(0);
    } finally {
      await close();
    }
  });

  it("loads both frozen sheets", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      const sheets = await page.locator("img.sheet").evaluateAll((images) =>
        images.map((img) => ({
          src: (img as HTMLImageElement).getAttribute("src"),
          natural: (img as HTMLImageElement).naturalWidth,
          rendered: Math.round(img.getBoundingClientRect().width),
        })),
      );
      expect(sheets).toHaveLength(2);
      for (const sheet of sheets) {
        expect(sheet.natural).toBeGreaterThan(0);
        expect(sheet.rendered).toBeGreaterThan(0);
      }
      expect(sheets.map((s) => s.src)).toEqual([
        "sheets/human-test-1280-gray-unlabeled.png",
        "sheets/human-test-390-gray-unlabeled.png",
      ]);
    } finally {
      await close();
    }
  });

  it("never scrolls sideways", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await close();
    }
  });

  it("offers all forty ratings as comfortable tap targets", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      expect(await page.locator(".rating").count()).toBe(40);
      expect(await page.locator(".rating label").count()).toBe(200);
      expect(await undersizedTapTargets(page, ".rating label")).toEqual([]);
      expect(await undersizedTapTargets(page, "#submit, #reviewer")).toEqual([]);
    } finally {
      await close();
    }
  });

  it("takes a name, a grouping and every rating", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      await completeSurvey(page, "R. Okafor");
      expect(await page.inputValue("#reviewer")).toBe("R. Okafor");
      expect(await page.inputValue("#groups")).toBe("3 17 22\n8 31");
      expect(await page.locator(".rating input:checked").count()).toBe(40);
    } finally {
      await close();
    }
  });

  it("keeps the sticky bar clear of the questionnaire", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const covered = await page.evaluate(() => {
        const bar = document.getElementById("bar")!.getBoundingClientRect();
        const last = document.querySelector(".rating:last-child")!.getBoundingClientRect();
        const summary = document.querySelector("#fallback summary")!.getBoundingClientRect();
        const overlaps = (a: DOMRect) => a.bottom > bar.top && a.top < bar.bottom;
        return { lastRating: overlaps(last), fallback: overlaps(summary) };
      });
      expect(covered).toEqual({ lastRating: false, fallback: false });
    } finally {
      await close();
    }
  });

  it("refuses to submit a partial review, and says what is missing", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      const posted = await interceptSubmit(page);
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });

      await page.click("#submit");
      expect(await page.locator("#status").innerText()).toMatch(/name or initials/i);

      await page.fill("#reviewer", "AB");
      await page.check(`input[name=r1][value="4"]`);
      await page.click("#submit");
      expect(await page.locator("#status").innerText()).toMatch(/Missing ratings for: 2, 3/);

      for (let i = 2; i <= 40; i += 1) await page.check(`input[name=r${i}][value="4"]`);
      await page.fill("#groups", "3 17 22\n17 8");
      await page.click("#submit");
      expect(await page.locator("#status").innerText()).toMatch(
        /Screen 17 appears in more than one group/,
      );

      expect(posted).toEqual([]);
      expect(await page.locator("#done").isVisible()).toBe(false);
    } finally {
      await close();
    }
  });

  it("submits once, posts exactly the frozen response, and confirms it was recorded", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      const posted = await interceptSubmit(page);
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      await completeSurvey(page, "AB");
      await page.click("#submit");

      await page.locator("#done").waitFor({ state: "visible" });
      expect(await page.locator("#done").innerText()).toBe("Thanks — your feedback was recorded.");
      expect(await page.locator("#submit").isDisabled()).toBe(true);
      expect(await page.locator("#submit").innerText()).toBe("Submitted");
      // The troubleshooting fallback is gone once there is nothing to troubleshoot.
      expect(await page.locator("#fallback").isVisible()).toBe(false);

      expect(posted).toHaveLength(1);
      const body = posted[0] as { capability: string; response: Record<string, unknown> };
      expect(Object.keys(body).sort()).toEqual(["capability", "response"]);
      // The server issued this; the page did not invent it, which is what stops one reviewer
      // from naming — and overwriting — another reviewer's row.
      expect(body.capability).toBe(STUB_CAPABILITY);
      expect(Object.keys(body.response).sort()).toEqual(["ok", "protocol", "result", "reviewer"]);
      expect(body.response.reviewer).toBe("AB");
      expect(body.response.ok).toBe(true);
      expect(body.response.protocol).toBe("proof-b/human-test-form.md");
      const result = body.response.result as {
        groups: number[][];
        ratings: Record<string, number>;
      };
      expect(Object.keys(result.ratings)).toHaveLength(40);
      expect(result.groups.flat().sort((a, b) => a - b)).toEqual(
        Array.from({ length: 40 }, (_, i) => i + 1),
      );
      expect(result.groups).toContainEqual([3, 17, 22]);
      expect(result.groups).toContainEqual([8, 31]);
    } finally {
      await close();
    }
  });

  it("reuses one capability, so a retry cannot become a second reviewer", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      // First attempt refused by the server, so the page stays submittable and tries again.
      const posted = await interceptSubmit(page, { ok: false, status: 500 });
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      await completeSurvey(page);
      await page.click("#submit");
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>("#submit")!.disabled,
      );
      expect(await page.locator("#status").innerText()).toMatch(/could not be saved/i);

      await page.click("#submit");
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>("#submit")!.disabled,
      );

      expect(posted.length).toBeGreaterThanOrEqual(2);
      const keys = new Set((posted as { capability: string }[]).map((p) => p.capability));
      expect(keys.size).toBe(1);
      expect(
        await page.evaluate(
          () => JSON.parse(sessionStorage.getItem("human-test-1-capability")!).capability,
        ),
      ).toBe([...keys][0]);
    } finally {
      await close();
    }
  });

  it("mints a fresh capability rather than dead-ending on a stale one", async () => {
    const { page, close } = await newPage(browser, viewport);
    try {
      const posted = await interceptSubmit(page);
      await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
      // A reviewer who opened the link, was interrupted, and came back the next day in the same
      // tab. The stale capability must not be presented, and must not survive as a refusal the
      // reviewer cannot escape by reloading.
      await page.evaluate(
        (stale) =>
          sessionStorage.setItem(
            "human-test-1-capability",
            JSON.stringify({ capability: stale, expiresAt: Date.now() - 1000 }),
          ),
        STALE_CAPABILITY,
      );
      await completeSurvey(page);
      await page.click("#submit");
      await page.locator("#done").waitFor({ state: "visible" });

      expect(posted).toHaveLength(1);
      expect((posted[0] as { capability: string }).capability).toBe(STUB_CAPABILITY);
      // And it offered the stale one back for renewal rather than discarding it. The nonce inside
      // names the row this session owns, so throwing it away would turn a reviewer's correction
      // into a second response instead of replacing their own.
      const renewals = sessionRequests.filter(
        (b) => (b as { previous?: string } | null)?.previous === STALE_CAPABILITY,
      );
      expect(renewals.length).toBeGreaterThanOrEqual(1);
    } finally {
      await close();
    }
  });

  if (mobile) {
    it("lets a phone pinch-zoom the desktop sheet", async () => {
      const { page, close } = await newPage(browser, viewport);
      try {
        await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
        // Nothing in the viewport meta may disable zoom — the instructions tell reviewers to
        // pinch the desktop sheet, so the page must not be the thing that stops them.
        const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewportMeta).toBe("width=device-width, initial-scale=1");
        expect(viewportMeta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
        expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).not.toBe(
          "none",
        );
        // And the sheet is rendered large enough to be worth zooming into rather than clipped.
        const sheet = await page.locator("img.sheet").first().boundingBox();
        expect(sheet!.width).toBeGreaterThan(viewport.width * 0.85);
      } finally {
        await close();
      }
    });

    it("shows the whole questionnaire in one column, nothing cramped", async () => {
      const { page, close } = await newPage(browser, viewport);
      try {
        await page.goto(`${requireApp().baseUrl}/human-test-1`, { waitUntil: "load" });
        const columns = await page.evaluate(
          () =>
            getComputedStyle(document.getElementById("ratings")!).gridTemplateColumns.split(" ")
              .length,
        );
        expect(columns).toBe(1);
      } finally {
        await close();
      }
    });
  }
});
