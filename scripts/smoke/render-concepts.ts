/**
 * Render verified specs through the real renderer and screenshot them, at both authoritative
 * breakpoints.
 *
 * Extracted from the Phase 4E full smoke so the 4G end-to-end harness renders concepts the same
 * way rather than approximately the same way. A second copy of this would be a second set of
 * waiting rules, and the waiting rules are the whole difficulty: two of them were bugs found by
 * screenshots that looked plausible and were wrong.
 *
 * It renders `buildMeasurableDocument` — the same document rendered-geometry verification measures
 * (`docs/event-renderer-system.md §8`) — so a screenshot here is the page the verifier passed, not
 * a second rendering path that could disagree with it. There is no thumbnail and no approximation.
 */
import path from "node:path";

import type { ArtworkAssets } from "@/components/event-renderer/artwork";
import { buildMeasurableDocument } from "@/lib/renderer/verify";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify/result";
import type { deriveEventContent } from "@/lib/generation/event-content";

export interface RenderJob {
  /** The screenshot's base name. `<name>-mobile.png` and `<name>-desktop.png` are written. */
  readonly name: string;
  readonly spec: ResolvedDesignSpec;
  readonly content: ReturnType<typeof deriveEventContent>;
  /** Delivered artwork, keyed by canonical node id. `{}` for a page with none. */
  readonly assets: ArtworkAssets;
}

export interface RenderedSize {
  readonly width: number;
  readonly height: number;
}

/** The two authoritative breakpoints, and the only two. `docs/event-renderer-system.md §3.1`. */
export const BREAKPOINTS = [
  ["mobile", 390],
  ["desktop", 1280],
] as const;

/**
 * Screenshot every job at both breakpoints into `outDir`, returning each page's rendered size.
 *
 * The sizes are returned rather than merely asserted because they are the evidence for the one
 * property that is easy to get wrong and invisible in a picture: attaching an asset to an
 * already-verified reservation must not change the page. A height comparison catches that; an
 * overflow check does not, because a page growing downwards overflows nothing.
 */
export async function renderConcepts(
  jobs: readonly RenderJob[],
  outDir: string,
): Promise<Record<string, RenderedSize>> {
  if (jobs.length === 0) return {};
  const [{ default: chromium }, { chromium: pw }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("playwright-core"),
  ]);
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
  const sizes: Record<string, RenderedSize> = {};
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
    for (const job of jobs) {
      const { html } = buildMeasurableDocument({
        spec: job.spec as never,
        content: job.content,
        overrides: job.spec.overrides,
        artworkAssets: job.assets,
      });
      for (const [label, width] of BREAKPOINTS) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        // `complete` is not enough for a first paint; `decode()` resolves when the frame is
        // paintable. Two animation frames afterwards let the compositor settle. Both were added
        // for real defects: a screenshot taken before decode showed a reserved box with no image
        // in it, which reads exactly like artwork that failed.
        await page.evaluate(() =>
          Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))).then(
            () =>
              new Promise<void>((r) =>
                requestAnimationFrame(() => requestAnimationFrame(() => r())),
              ),
          ),
        );
        const box = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        sizes[`${job.name}-${label}`] = box;
        await page.screenshot({
          path: path.join(outDir, `${job.name}-${label}.png`),
          fullPage: true,
        });
      }
    }
  } finally {
    await browser.close();
  }
  return sizes;
}
