/**
 * The headless Chromium runtime, carried over from the Phase 0 spike.
 *
 * `docs/technology-decisions.md` ("Geometry verification runtime") and `docs/spike/README.md`
 * settled this: `@sparticuz/chromium` driven through `playwright-core`, on the locked Vercel Node
 * runtime. The spike measured it end to end — launch, fonts, determinism, cold start, memory — and
 * the verdict was GO. So this module reproduces that sequence rather than choosing again: the same
 * dynamic import of both packages, the same `executablePath()` inflate, the same
 * `launch({ executablePath, args: chromium.args, headless: true })`. No Puppeteer, no second
 * browser provider.
 *
 * # One context, one page
 *
 * `chromium.args` carries `--single-process`. Under it, closing the only page tears the browser
 * down, so a session creates one context and one page and reuses them for every render. Each render
 * is a fresh document via `setContent`, which is what keeps successive measurements independent
 * without needing a new page. This is exactly what the spike route does and the reason its geometry
 * was identical across repeats and across invocations.
 *
 * # Two carry-overs the spike wrote down
 *
 * 1. **Serialize the launch.** The package inflates its archives into `/tmp` behind an `existsSync`
 *    gate that is not atomic, so two concurrent cold launches in one instance can race and leave a
 *    partial extraction — which made the browser exit on context creation during the spike. Launches
 *    are therefore queued per process. Warm launches cost tens of milliseconds, so the queue is not
 *    a throughput concern.
 * 2. **Cold start is per instance, not per request.** Nothing here caches a browser across calls:
 *    every session closes its browser in a `finally`, because a leaked Chromium in a serverless
 *    instance is far more expensive than a re-launch.
 *
 * # Imports are dynamic on purpose
 *
 * Both packages are `serverExternalPackages` and pull in native binaries. Importing them lazily
 * means the pure parts of this directory — the round loop's ordering, the clean predicate, the
 * document builder — can be imported and unit-tested in an environment where Chromium cannot run
 * at all.
 */

import { measureInPage, type MeasureOptions, type PageMeasurement } from "./measure";
import { GeometryInfrastructureError } from "./result";

/** Generous enough for a cold archive inflate, short enough that a hung page is not forever. */
const LAUNCH_TIMEOUT_MS = 60_000;
const RENDER_TIMEOUT_MS = 30_000;
const FONT_TIMEOUT_MS = 20_000;

/** One page, already loaded with the runtime, able to render and measure a document. */
export interface GeometryPage {
  /** The Chromium build this measurement was taken on, recorded with the run. */
  readonly version: string;
  measure(html: string, options: MeasureOptions): Promise<PageMeasurement>;
}

interface LaunchedBrowser {
  readonly page: GeometryPage;
  close(): Promise<void>;
}

let launchQueue: Promise<unknown> = Promise.resolve();

/** Run `fn` after every previously queued launch has settled. See carry-over 1. */
function serializeLaunch<T>(fn: () => Promise<T>): Promise<T> {
  const run = launchQueue.then(fn, fn);
  launchQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new GeometryInfrastructureError(`${what} did not finish within ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([work, guard]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

async function launch(): Promise<LaunchedBrowser> {
  const [{ default: chromium }, { chromium: pw }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("playwright-core"),
  ]);
  const executablePath = await chromium.executablePath();
  const browser = await pw.launch({ executablePath, args: chromium.args, headless: true });

  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();

    const geometryPage: GeometryPage = {
      version: browser.version(),
      async measure(html, options) {
        await page.setViewportSize({
          width: options.viewport.width,
          height: options.viewport.height,
        });
        await page.setContent(html, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
        // Layout before fonts land is fallback typography, and a line count taken against it is a
        // wrong answer rather than a slow one (`docs/event-renderer-system.md §3.1`). Whether the
        // families that were asked for actually arrived is checked by the caller, from the face
        // statuses this measurement reports.
        await withTimeout(
          page.evaluate(() => document.fonts.ready.then(() => undefined)),
          FONT_TIMEOUT_MS,
          "waiting for document.fonts.ready",
        );
        return withTimeout(
          page.evaluate(measureInPage, options as MeasureOptions),
          RENDER_TIMEOUT_MS,
          "measuring rendered geometry",
        );
      },
    };

    return {
      page: geometryPage,
      // Never `page.close()` first: under `--single-process` closing the only page takes the
      // browser with it, and the close below would then throw on an already-dead target.
      close: () => browser.close(),
    };
  } catch (cause) {
    await browser.close().catch(() => undefined);
    throw cause;
  }
}

/**
 * Launch Chromium, run `fn` against its single reusable page, and close the browser whatever
 * happens.
 */
export async function withGeometryPage<T>(fn: (page: GeometryPage) => Promise<T>): Promise<T> {
  let browser: LaunchedBrowser;
  try {
    browser = await serializeLaunch(() =>
      withTimeout(launch(), LAUNCH_TIMEOUT_MS, "launching headless Chromium"),
    );
  } catch (cause) {
    throw cause instanceof GeometryInfrastructureError
      ? cause
      : new GeometryInfrastructureError(
          `headless Chromium could not be launched: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause },
        );
  }
  try {
    return await fn(browser.page);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export type ChromiumAvailability =
  | { readonly available: true; readonly version: string }
  | { readonly available: false; readonly reason: string };

let availability: Promise<ChromiumAvailability> | null = null;

/**
 * Can this environment actually run the geometry pass?
 *
 * For tests, which must skip the browser-backed cases loudly rather than pass quietly where
 * Chromium is unavailable. Memoised per process: the answer cannot change, and asking it twice
 * would mean two cold launches.
 */
export function chromiumAvailability(): Promise<ChromiumAvailability> {
  availability ??= withGeometryPage(async (page) => page.version)
    .then((version): ChromiumAvailability => ({ available: true, version }))
    .catch((cause): ChromiumAvailability => ({
      available: false,
      reason: cause instanceof Error ? cause.message : String(cause),
    }));
  return availability;
}
