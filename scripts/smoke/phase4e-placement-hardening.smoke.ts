/**
 * Phase 4E — artwork placement hardening, measured against the frozen capability-spike asset.
 *
 * **No provider call of any kind.** Nothing here imports an SDK or reads a credential: the image
 * is the exact PNG the one authorized spike returned, read off disk, and the only thing under test
 * is what the deterministic compiler and renderer do with it.
 *
 * The comparison isolates one change. Same asset bytes, same concept, same content, same
 * DesignIntent, same palette, same typography — the artwork *treatment* system is the variable.
 *
 * The baseline images are the capability spike's own `after-*.png`, copied rather than re-rendered.
 * They are not an approximation of how head `5287be` drew this asset; they are that drawing, which
 * is the strongest baseline available and the only one with no chance of drift.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { measureArtwork } from "@/lib/ai/visual-art/metrics";
import { assembleVisualArtIntent } from "@/lib/ai/visual-art/assemble";
import type { ArtworkAssets } from "@/components/event-renderer/artwork";
import { compileConcept } from "@/lib/generation/compile-concept";
import { deriveEventContent } from "@/lib/generation/event-content";
import type { EventContentRow } from "@/lib/generation/content-profile";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { buildMeasurableDocument } from "@/lib/renderer/verify/html";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify/result";
import { PREMISE_FIXTURE_IDENTITY } from "../../tests/fixtures/concept-premise";

const SEED = 1;
const NOW = new Date("2026-09-19T08:13:40.729Z");

const REPO = new URL("../..", import.meta.url).pathname;
const RESULTS = path.join(REPO, "docs/model-evals/results");
const SPIKE = path.join(RESULTS, "phase-4e-artwork-capability-spike-locally-grown");
const SOURCE = path.join(RESULTS, "phase-4d-live-smoke-locally-grown");
const OUT = path.join(RESULTS, "phase-4e-artwork-placement-hardening-locally-grown");

const EMPTY_EVENT: EventContentRow = {
  title: null,
  description: null,
  hosts: null,
  baby_name: null,
  venue_name: null,
  address: null,
  event_date: null,
  start_time: null,
  timezone: null,
  rsvp_deadline: null,
};

interface ConceptRecord {
  readonly presentation: { name: string; description: string };
  readonly designIntent: DesignIntent;
  readonly capabilities: Capabilities;
  readonly compositionCanonical: CompositionTree;
}

/** The capability spike's derivative, rebuilt byte for byte: one decorative leaf substituted. */
function derivative(tree: CompositionTree): CompositionTree {
  const next = JSON.parse(JSON.stringify(tree)) as CompositionTree;
  const hero = next.sections[0].root as { t: string; decoration?: { id?: string } };
  if (hero.t !== "Overlay") throw new Error(`expected an Overlay hero, found ${hero.t}`);
  const id = hero.decoration?.id;
  hero.decoration = { t: "Artwork", role: "object", ...(id ? { id } : {}) } as never;
  return next;
}

async function render(
  spec: ResolvedDesignSpec,
  content: ReturnType<typeof deriveEventContent>,
  artworkAssets: ArtworkAssets,
  label: string,
) {
  const { html } = buildMeasurableDocument({
    spec: spec as never,
    content,
    overrides: spec.overrides,
    artworkAssets,
  });
  const [{ default: chromium }, { chromium: pw }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("playwright-core"),
  ]);
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
  const out: Record<string, unknown> = {};
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
    for (const [name, width] of [
      ["mobile", 390],
      ["desktop", 1280],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.evaluate(() =>
        Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))).then(
          () =>
            new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
        ),
      );
      out[name] = await page.evaluate(() => {
        const art = document.querySelector(".ev-art") as HTMLElement | null;
        const img = document.querySelector(".ev-art-img") as HTMLElement | null;
        const scrim = document.querySelector(".ev-art-scrim") as HTMLElement | null;
        const texts = [...document.querySelectorAll(".ev-overlay-content .ev-text")];
        const doc = document.documentElement;
        const round = (n: number) => Math.round(n * 100) / 100;
        const box = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            width: round(r.width),
            height: round(r.height),
            left: round(r.left),
            top: round(r.top),
          };
        };
        return {
          page: { width: doc.scrollWidth, height: doc.scrollHeight },
          artBox: box(art),
          imgBox: box(img),
          imgObjectFit: img ? getComputedStyle(img).objectFit : null,
          scrimOpacity: scrim ? getComputedStyle(scrim).opacity : null,
          textRight: texts.reduce((m, el) => Math.max(m, el.getBoundingClientRect().right), 0),
          textCount: texts.length,
        };
      });
      if (label) {
        await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`), fullPage: true });
      }
    }
  } finally {
    await browser.close();
  }
  return out as Record<
    string,
    {
      page: { width: number; height: number };
      artBox: { width: number; height: number; left: number } | null;
      imgBox: { width: number; height: number } | null;
      imgObjectFit: string | null;
      scrimOpacity: string | null;
      textRight: number;
      textCount: number;
    }
  >;
}

describe("Phase 4E artwork placement hardening", () => {
  it("renders the frozen asset through the improved treatment system", async () => {
    mkdirSync(OUT, { recursive: true });

    const record = JSON.parse(
      readFileSync(path.join(SOURCE, "concepts/concept-1.json"), "utf8"),
    ) as ConceptRecord;
    expect(record.presentation.name).toBe("Tended Welcome");

    // The exact bytes the one authorized image call returned. Never regenerated, never edited.
    const bytes = readFileSync(path.join(SPIKE, "artwork.png"));
    const asset = measureArtwork(new Uint8Array(bytes), [
      "#F3EAD7",
      "#65704A",
      "#C75B3F",
      "#D6A84B",
    ]);
    expect(asset.width).toBe(1024);
    expect(asset.byteLength).toBe(1_595_223);

    const tree = derivative(record.compositionCanonical);
    const capabilities: Capabilities = { ...record.capabilities, artwork: true };
    const content = deriveEventContent(EMPTY_EVENT, NOW);

    const compiled = await compileConcept({
      tree,
      designIntent: record.designIntent,
      capabilities,
      content,
      seed: SEED,
      forbiddenTokens: [],
      presentation: record.presentation,
    });
    if (compiled.state !== "verified") {
      throw new Error(`the derivative did not verify: ${JSON.stringify(compiled).slice(0, 400)}`);
    }
    const spec = compiled.spec;
    const [slotId, slot] = Object.entries(spec.artwork)[0];

    const assets: ArtworkAssets = {
      [slotId]: {
        src: `data:image/png;base64,${bytes.toString("base64")}`,
        width: asset.width,
        height: asset.height,
        hasAlpha: asset.alpha.hasAlphaChannel,
        alt: "",
      },
    };

    // The improved render, and the same spec with no asset — the fallback the page must still be.
    const improved = await render(spec, content, assets, "improved");
    const improvedEmpty = await render(spec, content, {}, "");

    // The baseline is the capability spike's own `after-*` render at head 5287be.
    for (const name of ["mobile", "desktop"] as const) {
      copyFileSync(path.join(SPIKE, `after-${name}.png`), path.join(OUT, `baseline-${name}.png`));
    }
    const baselineGeometry = (
      JSON.parse(readFileSync(path.join(SPIKE, "metrics.json"), "utf8")) as {
        geometry: { after: Record<string, { width: number; height: number }> };
      }
    ).geometry.after;

    const brief = assembleVisualArtIntent({
      slot,
      identity: PREMISE_FIXTURE_IDENTITY,
      palette: spec.tokens.palette,
    });

    writeFileSync(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify(
        {
          label:
            "Phase 4E artwork placement hardening — the same frozen asset through the improved " +
            "treatment system. Zero provider calls. Not a quality gate and not a score.",
          asset: {
            source: "phase-4e-artwork-capability-spike-locally-grown/artwork.png",
            bytes: asset.byteLength,
            dimensions: [asset.width, asset.height],
            note: "byte-identical to the spike's asset; never regenerated, edited or recropped",
          },
          resolvedSlot: slot,
          visualArtIntent: {
            version: brief.version,
            composition: brief.composition,
            negativeSpace: brief.negativeSpace,
            cropSafety: brief.cropSafety,
            subjectWeight: brief.subjectWeight,
          },
          baselineGeometry,
          improved,
          improvedWithNoAsset: improvedEmpty,
          geometryUnchangedByAsset: {
            mobile:
              JSON.stringify(improved.mobile.page) === JSON.stringify(improvedEmpty.mobile.page),
            desktop:
              JSON.stringify(improved.desktop.page) === JSON.stringify(improvedEmpty.desktop.page),
          },
          verifiedClean: {
            mobile: !spec.verified.mobile.pageOverflow && spec.verified.mobile.textOverflow === 0,
            desktop:
              !spec.verified.desktop.pageOverflow && spec.verified.desktop.textOverflow === 0,
          },
        },
        null,
        2,
      )}\n`,
    );

    const row = (k: string, v: unknown) =>
      `<tr><th>${k}</th><td><code>${String(v).replace(/</g, "&lt;")}</code></td></tr>`;
    const geo = (g: {
      page: { width: number; height: number };
      artBox: { width: number; height: number } | null;
      imgObjectFit: string | null;
      scrimOpacity: string | null;
    }) =>
      `page ${g.page.width}x${g.page.height}; artwork box ${g.artBox ? `${Math.round(g.artBox.width)}x${Math.round(g.artBox.height)}` : "none"}; ` +
      `fit ${g.imgObjectFit ?? "n/a"}; scrim ${g.scrimOpacity ?? "none"}`;

    writeFileSync(
      path.join(OUT, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Phase 4E artwork placement hardening</title>
<style>
 :root{color-scheme:light dark}
 body{font:14px/1.55 ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px;max-width:1240px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:36px 0 10px;text-transform:uppercase;letter-spacing:.08em}
 .note{padding:12px 14px;border:1px solid currentColor;border-radius:6px;opacity:.85;margin:16px 0}
 table{border-collapse:collapse;width:100%;margin:8px 0 18px} th,td{text-align:left;padding:5px 8px;border-bottom:1px solid rgba(128,128,128,.3);vertical-align:top}
 th{width:300px;font-weight:600} code{font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}
 .pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
 .pair figcaption{font-weight:600;margin-bottom:6px}
 img.shot{width:100%;border:1px solid rgba(128,128,128,.45)}
 ul{margin:8px 0 18px;padding-left:20px} li{margin:4px 0}
 pre{background:rgba(128,128,128,.12);padding:12px;border-radius:6px;overflow:auto;font-size:12px}
</style>
<h1>Phase 4E — artwork placement hardening</h1>
<p>Premise: <strong>Tended Welcome</strong>. Same concept, same content, same DesignIntent, same palette, same typography,
and <strong>the same image bytes</strong> as the capability spike. The artwork <em>treatment</em> system is the only variable.</p>

<div class="note"><strong>Zero provider calls.</strong> No image was generated, no text model was called, and the asset was
never regenerated, repainted, recropped or recoloured. Baseline is the capability spike's own render at head <code>5287be</code>.</div>
<div class="note">This is <strong>not</strong> a quality gate and nothing here is scored. Whether the result is good is the
operator's judgement from the pictures below.</div>

<h2>What changed, mechanically</h2>
<table>
${row("treatment resolved", slot.treatment)}
${row("side of the section it takes", slot.side ?? "none")}
${row("protection", `${slot.protection} (scrim: ${slot.scrim ?? "none"})`)}
${row("fit", slot.fit)}
${row("reservation shape 1280 / 390", `${slot.aspect.desktop} / ${slot.aspect.mobile}`)}
${row("baseline geometry 390 / 1280", `${baselineGeometry.mobile.width}x${baselineGeometry.mobile.height} / ${baselineGeometry.desktop.width}x${baselineGeometry.desktop.height}`)}
${row("improved geometry 390", geo(improved.mobile))}
${row("improved geometry 1280", geo(improved.desktop))}
${row("text ends / artwork starts at 1280", `${Math.round(improved.desktop.textRight)}px / ${Math.round(improved.desktop.artBox!.left)}px`)}
${row("geometry unchanged when the asset is removed", `390 ${JSON.stringify(improved.mobile.page) === JSON.stringify(improvedEmpty.mobile.page)}, 1280 ${JSON.stringify(improved.desktop.page) === JSON.stringify(improvedEmpty.desktop.page)}`)}
${row("verified clean 390 / 1280", `${!spec.verified.mobile.pageOverflow} / ${!spec.verified.desktop.pageOverflow}`)}
</table>

<h2>Mobile — 390</h2>
<div class="pair">
 <figure><figcaption>baseline (head 5287be)</figcaption><img class="shot" src="baseline-mobile.png" alt=""></figure>
 <figure><figcaption>improved</figcaption><img class="shot" src="improved-mobile.png" alt=""></figure>
</div>

<h2>Desktop — 1280</h2>
<div class="pair">
 <figure><figcaption>baseline (head 5287be)</figcaption><img class="shot" src="baseline-desktop.png" alt=""></figure>
 <figure><figcaption>improved</figcaption><img class="shot" src="improved-desktop.png" alt=""></figure>
</div>

<h2>For the operator</h2>
<p>These are questions for you, deliberately unanswered here and not put to any model.</p>
<ul>
 <li>Does the artwork now feel integral to the hero, or still appended to it?</li>
 <li>Is it compositionally important enough — or has it become too large?</li>
 <li>Is the text still clearly dominant where it should be?</li>
 <li>Does desktop still look washed out?</li>
 <li>Does mobile still feel like the art is merely appended?</li>
 <li>Does &ldquo;locally grown&rdquo; come through more strongly?</li>
 <li>Does this read closer to a finished invitation than to a design-system demo?</li>
</ul>

<h2>The brief this reservation would now produce</h2>
<pre>${JSON.stringify(brief, null, 2).replace(/</g, "&lt;")}</pre>
`,
    );

    // The claims this run exists to make.
    expect(slot.treatment).toBe("contained");
    expect(slot.protection).toBe("none");
    expect(slot.scrim).toBeNull();
    // No scrim element at all, so nothing is dimming the artwork.
    expect(improved.desktop.scrimOpacity).toBeNull();
    // A zone, with every word clear of it.
    expect(improved.desktop.textCount).toBeGreaterThan(0);
    expect(improved.desktop.textRight).toBeLessThanOrEqual(improved.desktop.artBox!.left + 1);
    // And the asset still cannot move the page.
    expect(improved.mobile.page).toEqual(improvedEmpty.mobile.page);
    expect(improved.desktop.page).toEqual(improvedEmpty.desktop.page);
  }, 900_000);
});
