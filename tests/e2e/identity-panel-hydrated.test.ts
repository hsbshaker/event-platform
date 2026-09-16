import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";

import { DESKTOP, MOBILE, hasHorizontalScroll, launchBrowser, newPage } from "./harness";
import type { IdentityView } from "@/lib/generation/identity-view";

/**
 * The T11 interaction gate: the production panel, hydrated, in real Chromium, at both widths.
 *
 * The other browser file renders this component to static markup and measures layout. That is
 * genuinely useful and genuinely limited — unhydrated markup has no handlers, so it cannot say
 * anything about submitting, state replacement, focus after replacement, double-click behaviour,
 * reconnection or polling. Those are the behaviours T11 is actually judged on, and until now they
 * lived only in jsdom, which has no layout, no real focus model and no computed colour.
 *
 * So this bundles the real component with Vite, swaps **one** module — the server-action boundary,
 * which is the seam the design already put there — and drives the result with a browser. No
 * application route is added to be tested, no database is involved, and no provider is reachable:
 * the stub answers from a queue the test controls and records every call.
 *
 * Acceptance criteria: `spec.md §31 — Creation Mode`; `§31 — Responsive/accessibility`; `§7.6b`;
 * `docs/design-system.md §7.3`, `§7.6`, `§14.1`–`§14.4`.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * Timers run at thirty times speed inside the page.
 *
 * The surface polls every three seconds and owes its reconnection resume at thirty-three; waiting
 * those out for real would make this suite minutes long per case. Installed before the bundle so
 * the component's own `setTimeout`/`setInterval` are the ones scaled — the *durations* under test
 * are asserted in the component suite against the real constants, and what is exercised here is
 * the behaviour those timers drive.
 */
const TIME_SCALE = 30;

function stylesheet(): string | null {
  for (const base of [
    path.join(ROOT, ".next", "static", "css"),
    path.join(ROOT, ".next", "static", "chunks"),
  ]) {
    try {
      const file = readdirSync(base).find((f) => f.endsWith(".css"));
      if (file) return readFileSync(path.join(base, file), "utf8");
    } catch {
      // Not this directory; try the next.
    }
  }
  return null;
}

let browser: Browser;
let bundle: string;
let css: string;

beforeAll(async () => {
  const found = stylesheet();
  if (!found) throw new Error("No built stylesheet found; run `npm run build` first.");
  css = found;
  // In a child process: vitest *is* a Vite server, and building inside one of its workers hangs.
  const dir = mkdtempSync(path.join(tmpdir(), "identity-harness-"));
  const out = path.join(dir, "harness.js");
  try {
    // A clean environment, deliberately. A vitest worker exports `NODE_OPTIONS` loader hooks and
    // `VITEST_*`, and a Vite build that inherits them tries to join the run it was spawned from
    // and never returns — which is how this hung, silently, with vitest buffering the output.
    const env = { ...process.env, NODE_ENV: "production" };
    delete env.NODE_OPTIONS;
    for (const key of Object.keys(env)) if (key.startsWith("VITEST")) delete env[key];
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", path.join(ROOT, "tests/e2e/hydrated/build.ts"), out],
      { cwd: ROOT, stdio: "pipe", env, timeout: 120_000 },
    );
    bundle = readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  browser = await launchBrowser();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const BOUNDARY: IdentityView = {
  state: "clarification_required",
  hasAuthoritativeIdentity: false,
  revision: 1,
  questions: [
    {
      kind: "boundary",
      index: 0,
      question:
        "Is this a surprise, or does she already know? That is not a call we should make for her.",
      options: [
        { label: "She already knows about it", isDefer: false },
        { label: "It's a surprise — please keep it that way", isDefer: false },
      ],
    },
  ],
};

const CREATIVE: IdentityView = {
  state: "ready",
  hasAuthoritativeIdentity: true,
  revision: 2,
  questions: [
    {
      kind: "creative",
      index: 0,
      question: "Should the feeling lean warm and golden, or cool and green?",
      options: [
        { label: "Warm and golden", isDefer: false },
        { label: "Cool and green", isDefer: false },
        { label: "You choose", isDefer: true },
      ],
    },
  ],
};

const READY: IdentityView = { state: "ready", hasAuthoritativeIdentity: true, revision: 1 };
const RUNNING: IdentityView = { state: "running", hasAuthoritativeIdentity: false };
const RETRY: IdentityView = {
  state: "retry_available",
  hasAuthoritativeIdentity: false,
  revision: 1,
};

interface HarnessSetup {
  /** Replies consumed in order, per action. */
  queue?: Partial<Record<"start" | "read" | "answer", IdentityView[]>>;
  /** The reply used once a queue runs out. */
  fallback?: Partial<Record<"start" | "read" | "answer", IdentityView>>;
  /** How many calls of each action should reject, standing in for a lost transport. */
  reject?: Partial<Record<"start" | "read" | "answer", number>>;
  /** Actions held open until `release()`. */
  hold?: Partial<Record<"start" | "read" | "answer", boolean>>;
}

async function open(
  initial: IdentityView,
  viewport: { width: number; height: number },
  setup: HarnessSetup = {},
) {
  const { page, close } = await newPage(browser, viewport);

  // Both installed before any page script runs, which is what `addInitScript` is for: the timer
  // shim has to be in place before the bundle schedules anything, and the harness's replies have to
  // be queued before the panel's arrival effect asks for one.
  //
  // Passed as **source text**, not as functions. Vitest transforms this file through Vite, and a
  // function handed to `addInitScript` is serialised from its *transformed* source — which carries
  // references that mean nothing in a browser. The page then throws on load and every wait hangs
  // with no output, which is exactly how this failed. Strings cannot be rewritten.
  await page.addInitScript({
    content: `(() => {
      const scale = ${TIME_SCALE};
      const t = window.setTimeout.bind(window);
      const i = window.setInterval.bind(window);
      window.setTimeout = (fn, ms, ...rest) =>
        t(fn, Math.max(0, Math.floor((ms || 0) / scale)), ...rest);
      window.setInterval = (fn, ms, ...rest) =>
        i(fn, Math.max(1, Math.floor((ms || 0) / scale)), ...rest);
    })();`,
  });
  await page.addInitScript({
    content: `window.identityHarnessSetup = ${JSON.stringify(setup)};`,
  });

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head>
<body class="bg-app-bg"><main class="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col gap-8 px-4 py-10 lg:py-14">
<div class="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
<div id="panel"></div>
<div class="rounded-2xl border border-app-border bg-app-surface p-5 text-app-text">Details form stands here.</div>
</div></main>
<script type="application/json" id="initial">${JSON.stringify(initial)}</script>
<script>${bundle}</script>
</body></html>`;
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message.split("\n")[0]));
  await page.setContent(html, { waitUntil: "load" });
  // Hydration has run once the panel exists in the document. Bounded, and it reports what the page
  // threw: a harness that silently fails to mount is indistinguishable from a slow one.
  await page
    .waitForSelector("section[aria-labelledby='identity-panel-heading']", { timeout: 10_000 })
    .catch(() => {
      throw new Error(`the harness did not hydrate: ${failures.join("; ") || "no page error"}`);
    });
  return { page, close };
}

const calls = (page: Page, action?: string) =>
  page.evaluate(
    (a) =>
      window.identityHarness.calls.filter((c) => (a ? c.action === a : true)) as {
        action: string;
        payload: unknown;
      }[],
    action,
  );

const panelText = (page: Page) => page.locator("section").innerText();

/** WCAG relative-luminance contrast, computed from what the browser actually painted. */
const CONTRAST = `(a, b) => {
  const parse = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const lum = (c) => {
    const [r, g, bl] = parse(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}`;

describe.each([
  ["mobile 390", MOBILE],
  ["desktop 1280", DESKTOP],
])("hydrated at %s", (_label, viewport) => {
  /* ---------------------------------------------------------------- Route B */

  it("walks a boundary question's options by keyboard", async () => {
    const { page, close } = await open(BOUNDARY, viewport, { fallback: { read: BOUNDARY } });
    try {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("INPUT");
      expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe(
        "She already knows about it",
      );

      // Native radio-group traversal, which is the reason this is a real `<input type=radio>`.
      await page.keyboard.press("ArrowDown");
      expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe(
        "It's a surprise — please keep it that way",
      );

      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BUTTON");
    } finally {
      await close();
    }
  });

  it("will not continue until the host has actually answered", async () => {
    // A fresh page, with nothing selected: arrowing through a radio group *selects*, so proving
    // the empty-submit guard needs a host who has genuinely chosen nothing.
    const { page, close } = await open(BOUNDARY, viewport, { fallback: { read: BOUNDARY } });
    try {
      await page.getByRole("button", { name: /continue/i }).click();
      expect(await panelText(page)).toMatch(/choose an option to continue/i);
      expect(await calls(page, "answer")).toHaveLength(0);
      // Still the question, not a state that moved on.
      expect(await page.locator("legend").count()).toBe(1);
    } finally {
      await close();
    }
  });

  it("submits the chosen option once, replaces the state, and moves focus", async () => {
    const { page, close } = await open(BOUNDARY, viewport, {
      fallback: { answer: READY, read: READY },
    });
    try {
      await page.getByRole("radio", { name: /it's a surprise/i }).check();
      await page.getByRole("button", { name: /continue/i }).click();
      await page.waitForFunction(() =>
        /ready/i.test(document.querySelector("h2")?.textContent ?? ""),
      );

      const sent = await calls(page, "answer");
      expect(sent).toHaveLength(1);
      expect(sent[0].payload).toMatchObject({
        revision: 1,
        answers: [
          { questionIndex: 0, selectedOptionLabel: "It's a surprise — please keep it that way" },
        ],
      });

      // The control the host was using is gone; focus must not fall to the body.
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("identity-panel-heading");
      expect(await panelText(page)).not.toMatch(/is this a surprise/i);
    } finally {
      await close();
    }
  });

  /* ---------------------------------------------------------------- Route A */

  it("keeps a creative question beside `ready`, with its own defer and nothing invented", async () => {
    const { page, close } = await open(CREATIVE, viewport, {
      fallback: { answer: READY, read: READY },
    });
    try {
      expect(await page.locator("h2").innerText()).toMatch(/ready/i);
      expect(await page.locator("legend").innerText()).toMatch(/warm and golden|feeling lean/i);
      expect(await page.locator("[role=dialog]").count()).toBe(0);
      // The model's defer, and no `Skip` of ours. No typed channel either.
      expect(await page.getByRole("radio", { name: "You choose" }).count()).toBe(1);
      expect(await panelText(page)).not.toMatch(/\bskip\b/i);
      expect(await page.locator("textarea").count()).toBe(0);

      await page.getByRole("radio", { name: "You choose" }).check();
      await page.getByRole("button", { name: /send this/i }).click();
      await page.waitForFunction(() =>
        window.identityHarness.calls.some((c) => c.action === "answer"),
      );

      const sent = await calls(page, "answer");
      expect(sent).toHaveLength(1);
      expect(sent[0].payload).toMatchObject({
        answers: [{ questionIndex: 0, selectedOptionLabel: "You choose" }],
      });
    } finally {
      await close();
    }
  });

  /* ---------------------------------------------------------------- retry */

  it("offers Retry only at rest, sends one explicit retry, and ignores a double click", async () => {
    const recovering: IdentityView = { state: "recovering", hasAuthoritativeIdentity: false };
    const { page: quiet, close: closeQuiet } = await open(recovering, viewport, {
      fallback: { read: recovering },
    });
    try {
      // `recovering` means the host has nothing to do; a Retry here invites a call the system is
      // still reconciling.
      expect(await quiet.getByRole("button", { name: /try again/i }).count()).toBe(0);
    } finally {
      await closeQuiet();
    }

    const { page, close } = await open(RETRY, viewport, {
      queue: { start: [RETRY] },
      fallback: { start: RUNNING, read: RUNNING },
      hold: { start: true },
    });
    try {
      // The arrival start resolves still-blocked, which is what a terminal failure does.
      await page.evaluate(() => window.identityHarness.release());
      await page.waitForSelector("button:has-text('Try again')");

      const retry = page.getByRole("button", { name: /try again/i });
      await page.evaluate(() => {
        window.identityHarness.hold.start = true;
      });
      await retry.click();
      await retry.click({ force: true }).catch(() => {});
      await retry.click({ force: true }).catch(() => {});

      const started = await calls(page, "start");
      // Arrival (ordinary) plus exactly one explicit retry — not three.
      expect(started).toHaveLength(2);
      expect(started[0].payload).toMatchObject({ options: { explicitRetry: false } });
      expect(started[1].payload).toMatchObject({ options: { explicitRetry: true } });
      await page.evaluate(() => window.identityHarness.release());
    } finally {
      await close();
    }
  });

  /* ---------------------------------------------------------------- first start and reconnect */

  it("opens a never-generated event without failure language, then starts it", async () => {
    const { page, close } = await open(
      { state: "retry_available", hasAuthoritativeIdentity: false },
      viewport,
      { fallback: { start: RUNNING, read: RUNNING }, hold: { start: true } },
    );
    try {
      // Hydrated, auto-start in flight: neutral and true, no failure copy, no Retry.
      const early = await panelText(page);
      expect(early).not.toMatch(/couldn't finish|nothing was lost/i);
      expect(early).toMatch(/starting on your event/i);
      expect(await page.getByRole("button", { name: /try again/i }).count()).toBe(0);

      await page.evaluate(() => window.identityHarness.release());
      await page.waitForFunction(() =>
        /reading your description/i.test(document.querySelector("h2")?.textContent ?? ""),
      );

      const started = await calls(page, "start");
      expect(started).toHaveLength(1);
      expect(started[0].payload).toMatchObject({ options: { explicitRetry: false } });
    } finally {
      await close();
    }
  });

  it("resumes once, ordinarily, after a lost start that a poll then reports as retryable", async () => {
    const { page, close } = await open(
      { state: "retry_available", hasAuthoritativeIdentity: false },
      viewport,
      {
        // The arrival start's transport dies; polling then reports the truthful resting state of
        // an event whose claim a poll has just reclaimed.
        reject: { start: 1 },
        fallback: { start: RUNNING, read: RETRY },
      },
    );
    try {
      await page.waitForFunction(
        () => window.identityHarness.calls.filter((c) => c.action === "start").length === 2,
        undefined,
        { timeout: 20_000 },
      );
      const started = await calls(page, "start");
      expect(started).toHaveLength(2);
      // Ordinary, never explicit: the resume must not convert a maybe-paid failure into a call.
      expect(started[1].payload).toMatchObject({ options: { explicitRetry: false } });

      // And exactly once — not a loop.
      await page.waitForTimeout(3_000);
      expect(await calls(page, "start")).toHaveLength(2);
    } finally {
      await close();
    }
  }, 40_000);

  /* ---------------------------------------------------------------- accessibility and layout */

  it("names its group and controls, shows focus, and keeps one live region", async () => {
    const { page, close } = await open(BOUNDARY, viewport, { fallback: { read: BOUNDARY } });
    try {
      const group = await page.getByRole("radiogroup").getAttribute("role");
      expect(group).toBe("radiogroup");
      // The legend is the group's accessible name.
      expect(
        await page.evaluate(() => {
          const fieldset = document.querySelector("fieldset")!;
          return fieldset.querySelector("legend")?.textContent ?? "";
        }),
      ).toMatch(/is this a surprise/i);

      expect(
        (await page.getByRole("button", { name: /continue/i }).innerText()).trim().length,
      ).toBeGreaterThan(0);

      await page.keyboard.press("Tab");
      const outline = await page.evaluate(() => {
        const label = document.activeElement?.closest("label");
        return label ? getComputedStyle(label).outlineStyle : "none";
      });
      expect(outline).not.toBe("none");

      // Exactly one live region: a second would announce the same transition twice.
      expect(await page.locator("[aria-live]").count()).toBe(1);
    } finally {
      await close();
    }
  });

  it("meets the touch target and stays inside the viewport, even with long text", async () => {
    const long: IdentityView = {
      ...BOUNDARY,
      questions: [
        {
          ...BOUNDARY.questions![0],
          question:
            "Has she agreed to this being a surprise, or would she rather know in advance so " +
            "that she can decide for herself how she wants the day to feel and who is there?",
          options: [
            {
              label: "She already knows, and has been part of planning it from the very beginning",
              isDefer: false,
            },
            {
              label:
                "It is a surprise, and we would like to keep it that way right up until the day",
              isDefer: false,
            },
          ],
        },
      ],
    };
    const { page, close } = await open(long, viewport, { fallback: { read: long } });
    try {
      expect(await hasHorizontalScroll(page)).toBe(false);
      const small = await page.evaluate(() => {
        const nodes = [
          ...document.querySelectorAll("label:has(input[type=radio]), button"),
        ] as HTMLElement[];
        return nodes
          .map((n) => ({ text: n.innerText.slice(0, 24), ...n.getBoundingClientRect().toJSON() }))
          .filter((b) => b.width < 44 || b.height < 44);
      });
      expect(small).toEqual([]);
    } finally {
      await close();
    }
  });

  it("paints text and focus at the contrast the design system asks for", async () => {
    const { page, close } = await open(BOUNDARY, viewport, { fallback: { read: BOUNDARY } });
    try {
      await page.keyboard.press("Tab");
      const measured = await page.evaluate((ratioSrc) => {
        const ratio = eval(`(${ratioSrc})`) as (a: string, b: string) => number;
        const surface = getComputedStyle(document.querySelector("section")!).backgroundColor;
        const legend = getComputedStyle(document.querySelector("legend")!);
        const option = document.querySelector("label:has(input[type=radio])") as HTMLElement;
        const optionStyle = getComputedStyle(option);
        const button = getComputedStyle(document.querySelector("button")!);
        const focused = document.activeElement?.closest("label") as HTMLElement;
        const focusStyle = getComputedStyle(focused);
        return {
          legend: ratio(legend.color, surface),
          optionLabel: ratio(
            getComputedStyle(option.querySelector("span span")!).color,
            optionStyle.backgroundColor,
          ),
          buttonLabel: ratio(button.color, button.backgroundColor),
          focus: ratio(focusStyle.outlineColor, surface),
          border: ratio(optionStyle.borderTopColor, surface),
        };
      }, CONTRAST);

      // `docs/design-system.md §14.1`: normal text ≥ 4.5:1; interactive boundaries and focus
      // indicators ≥ 3:1 against the adjacent surface. Measured from what Chromium painted, using
      // the tokens already in the system — nothing here was recoloured to pass.
      expect(measured.legend).toBeGreaterThanOrEqual(4.5);
      expect(measured.optionLabel).toBeGreaterThanOrEqual(4.5);
      expect(measured.buttonLabel).toBeGreaterThanOrEqual(4.5);
      expect(measured.focus).toBeGreaterThanOrEqual(3);
    } finally {
      await close();
    }
  });
});

describe("the hydrated harness is a harness, not a shipped surface", () => {
  it("adds no route to the application", () => {
    const routes = readdirSync(path.join(ROOT, "src", "app"), { recursive: true }) as string[];
    expect(routes.filter((f) => String(f).includes("harness"))).toEqual([]);
  });
});
