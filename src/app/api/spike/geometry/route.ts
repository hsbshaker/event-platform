import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { spikeToken } from "@/lib/env";

/**
 * Phase 0 geometry-runtime spike (docs/development-plan.md, Phase 0; technology-decisions.md
 * "Geometry verification runtime"). Answers one question: can the locked Vercel Node runtime
 * launch serverless Chromium, render the production-shaped renderer with self-hosted fonts at
 * 390 and 1280, and return deterministic DOM geometry reliably?
 *
 * Not product code and not the Phase 3 engine. Removed when the production verifier lands.
 * Fail-closed: the route is 404 unless SPIKE_TOKEN is configured and presented, and never
 * runs in the production environment, so it can never be a free Chromium endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WIDTHS = [390, 1280] as const;
const FIXTURE = path.join(process.cwd(), "src/spike/fixture.generated.html");

let coldStart = true;
let invocations = 0;
let browserVersion: string | null = null;

interface SpikeMeasure {
  width: number;
  mode: string;
  fonts: { family: string; loaded: boolean }[];
  fontFaces: number;
  docWidth: number;
  docHeight: number;
  measure: {
    pageOverflow: boolean;
    heroHeight: number;
    texts: { id: string; lines: number; overflow: boolean; fontPx: number }[];
    overflowing: string[];
  };
}

function geometryKey(m: SpikeMeasure): string {
  return JSON.stringify({
    w: m.width,
    hero: Math.round(m.measure.heroHeight * 100) / 100,
    doc: [m.docWidth, m.docHeight],
    texts: m.measure.texts.map((t) => [t.id, t.lines, t.overflow, t.fontPx]),
    overflowing: m.measure.overflowing,
    pageOverflow: m.measure.pageOverflow,
  });
}

export async function GET(request: NextRequest) {
  const token = spikeToken();
  if (!token || process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const presented = Buffer.from(request.headers.get("x-spike-token") ?? "");
  const expected = Buffer.from(token);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const requested = Number(request.nextUrl.searchParams.get("repeats") ?? 2);
  if (!Number.isFinite(requested)) {
    return NextResponse.json({ error: "repeats must be a number" }, { status: 400 });
  }
  const repeats = Math.min(5, Math.max(1, Math.round(requested)));
  const wasCold = coldStart;
  coldStart = false;
  invocations += 1;

  const t0 = performance.now();
  const memBefore = process.memoryUsage();
  const timings: Record<string, number> = {};
  const runs: {
    width: number;
    repeat: number;
    renderMs: number;
    fontsLoaded: boolean;
    heroHeight: number;
    texts: number;
    textOverflow: number;
    overflowing: number;
    pageOverflow: boolean;
    docHeight: number;
    key: string;
  }[] = [];
  let error: string | null = null;

  try {
    const [{ default: chromium }, { chromium: pw }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    const tImport = performance.now();
    timings.importMs = Math.round(tImport - t0);

    const executablePath = await chromium.executablePath();
    const tInflate = performance.now();
    timings.inflateMs = Math.round(tInflate - tImport);

    const browser = await pw.launch({ executablePath, args: chromium.args, headless: true });
    const tLaunch = performance.now();
    timings.launchMs = Math.round(tLaunch - tInflate);
    browserVersion = browser.version();

    try {
      const fixture = readFileSync(FIXTURE, "utf8");
      // Serverless Chromium runs --single-process: one context and one page are reused for
      // every render (closing the only page tears the browser down). Each render is a fresh
      // document via setContent, so measurements stay independent.
      const context = await browser.newContext({ deviceScaleFactor: 1 });
      const page = await context.newPage();
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        for (const width of WIDTHS) {
          const tr = performance.now();
          await page.setViewportSize({ width, height: width <= 700 ? 844 : 800 });
          await page.setContent(
            fixture.replace("<body>", `<body><script>window.__SPIKE_WIDTH = ${width};</script>`),
            { waitUntil: "load" },
          );
          await page.waitForFunction(
            () => {
              const w = window as unknown as { __SPIKE_RESULT?: unknown; __SPIKE_ERROR?: string };
              return w.__SPIKE_RESULT !== undefined || w.__SPIKE_ERROR !== undefined;
            },
            null,
            { timeout: 15_000 },
          );
          const result = await page.evaluate(() => {
            const w = window as unknown as {
              __SPIKE_RESULT?: SpikeMeasure;
              __SPIKE_ERROR?: string;
            };
            if (w.__SPIKE_ERROR) throw new Error(w.__SPIKE_ERROR);
            return w.__SPIKE_RESULT as SpikeMeasure;
          });
          runs.push({
            width,
            repeat,
            renderMs: Math.round(performance.now() - tr),
            fontsLoaded: result.fonts.every((f) => f.loaded),
            heroHeight: result.measure.heroHeight,
            texts: result.measure.texts.length,
            textOverflow: result.measure.texts.filter((t) => t.overflow).length,
            overflowing: result.measure.overflowing.length,
            pageOverflow: result.measure.pageOverflow,
            docHeight: result.docHeight,
            key: geometryKey(result),
          });
        }
      }
    } finally {
      const tc = performance.now();
      await browser.close();
      timings.closeMs = Math.round(performance.now() - tc);
    }
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  const memAfter = process.memoryUsage();
  const byWidth = Object.fromEntries(
    WIDTHS.map((w) => {
      const rs = runs.filter((r) => r.width === w);
      return [
        w,
        {
          runs: rs.length,
          deterministic: new Set(rs.map((r) => r.key)).size <= 1,
          fontsLoaded: rs.every((r) => r.fontsLoaded),
          clean: rs.every((r) => !r.pageOverflow && r.overflowing === 0 && r.textOverflow === 0),
          heroHeight: rs[0]?.heroHeight ?? null,
          renderMs: rs.map((r) => r.renderMs),
        },
      ];
    }),
  );

  return NextResponse.json({
    ok: error === null && runs.length === repeats * WIDTHS.length,
    error,
    coldStart: wasCold,
    invocation: invocations,
    totalMs: Math.round(performance.now() - t0),
    timings,
    byWidth,
    runs: runs.map((r) => ({ ...r, key: undefined })),
    env: {
      region: process.env.VERCEL_REGION ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      lambdaMemoryMb: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null,
      node: process.version,
      chromium: browserVersion,
    },
    memoryMb: {
      rssBefore: Math.round(memBefore.rss / 1048576),
      rssAfter: Math.round(memAfter.rss / 1048576),
      heapUsedAfter: Math.round(memAfter.heapUsed / 1048576),
    },
  });
}
