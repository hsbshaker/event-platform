import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

/**
 * Browser coverage for the Phase 2 surfaces at the two canonical widths
 * (spec.md §22; design-system §7.3: design from 390, desktop is a real desktop layout).
 *
 * Scope. These drive a production build of the app and assert what the browser can settle on
 * its own: that the canonical surfaces render, that they work at 390 and 1280, and that the
 * composer keeps the person's text. The data path behind them is covered where it actually
 * lives — `tests/db/*.test.ts` exercises the claim, its retries and its RLS against a real
 * Postgres, and the unit suites cover the routes' and modules' logic. By default no Supabase
 * is configured, so server writes fail on purpose and the UI must degrade honestly; point
 * E2E_BASE_URL at a deployment with a live database to drive the persisted path instead.
 */

export const MOBILE = { width: 390, height: 844 } as const;
export const DESKTOP = { width: 1280, height: 800 } as const;

const EXECUTABLE = process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = Number(process.env.E2E_PORT ?? 3210);
const ROOT = path.resolve(import.meta.dirname, "../..");

export interface AppServer {
  baseUrl: string;
  /** True when a live Supabase is configured, so persisted flows can be asserted. */
  persisted: boolean;
  stop: () => Promise<void>;
}

async function waitForHealth(baseUrl: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Uses an existing deployment when E2E_BASE_URL is set, otherwise starts the built app here.
 * Requires `npm run build` to have run; it does not build, so a test run never silently
 * measures a stale bundle.
 */
export async function startApp(): Promise<AppServer | null> {
  const external = process.env.E2E_BASE_URL;
  if (external) {
    const ok = await waitForHealth(external, 30_000);
    return ok ? { baseUrl: external, persisted: true, stop: async () => {} } : null;
  }

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const child: ChildProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      // Deliberately absent: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY. The proxy treats an
      // unconfigured Supabase as "nothing to refresh", so pages render and writes fail.
      NEXT_PUBLIC_APP_URL: baseUrl,
    },
    stdio: "ignore",
    detached: true,
  });

  const stop = async () => {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  };

  if (!(await waitForHealth(baseUrl))) {
    await stop();
    return null;
  }
  return { baseUrl, persisted: false, stop };
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/** A fresh, isolated page: every test starts with no cookies and no local storage. */
export async function newPage(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width <= 700,
    hasTouch: viewport.width <= 700,
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

/** True when the document scrolls sideways — what spec.md §22 and design-system §7 forbid. */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

export interface TapTarget {
  label: string;
  width: number;
  height: number;
}

/**
 * Visible interactive elements smaller than `min` in either direction — the 44px rule in
 * design-system §7.6. Returns what failed, so a failure names the control.
 */
export async function undersizedTapTargets(
  page: Page,
  selector: string,
  min = 44,
): Promise<TapTarget[]> {
  return page.evaluate(
    ({ sel, limit }) =>
      [...document.querySelectorAll(sel)]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            label: `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 30) || (el as HTMLElement).getAttribute("aria-label") || ""}`,
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        })
        .filter((t) => t.width < limit || t.height < limit),
    { sel: selector, limit: min },
  );
}

/** Waits for a locator to be visible, returning false instead of throwing on timeout. */
export async function becomesVisible(page: Page, selector: string, timeout = 10_000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}
