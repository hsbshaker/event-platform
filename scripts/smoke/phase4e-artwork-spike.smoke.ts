/**
 * Phase 4E — one live image-provider capability spike.
 *
 * **This is not the Phase 4E quality gate.** It is a narrow provider + transparency + renderer
 * capability check, and its whole question is whether one real image model can return one
 * composition-aware, transparent, original asset that satisfies the `VisualArtIntent` contract,
 * survives objective measurement, attaches through the artwork system, and does so **without
 * changing the geometry the spec was already verified under**.
 *
 * One image. One call. No retry. No prompt tweak afterwards. No second seed.
 *
 * # What it borrows and what it does not touch
 *
 * The concept is Phase 4D's "Tended Welcome", read from
 * `docs/model-evals/results/phase-4d-live-smoke-locally-grown/` and **never written to**. Its hero
 * is already an `Overlay` whose decoration was a botanical `Glyph`, which makes it the cleanest
 * place to substitute the new `Artwork` leaf without redesigning a page.
 *
 * The derivative built here is a **diagnostic fixture, not composition evidence**. No model
 * authored it: one decorative leaf was substituted by hand, and nothing else about the tree moved.
 * It is not a new concept, it is not persisted as one, and no claim about composition quality can
 * be made from it.
 *
 * One thing is not a reproduction of the historical render: the compile seed. It derives from a
 * persisted identity-revision id that the evidence does not carry, so a fixed literal is used and
 * recorded. Before and after share it, which is what the comparison needs — but this page is a
 * fresh compile of the same tree, not the 4D screenshot with an image added.
 *
 * # Rehearsal
 *
 * `VITEST_SMOKE_OPENAI_STUB` aliases the `openai` package to a local transport stub, so every step
 * below — compile, verification, screenshots, measurement, attachment, evidence — can be run end
 * to end at zero cost before the one paid call. Run it that way first. Always.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createOpenAiArtworkProvider } from "@/lib/ai/openai/artwork";
import { ARTWORK_MODEL_RATES, outputTokensAffordable } from "@/lib/ai/openai/artwork-pricing";
import {
  STANDING_PROHIBITIONS,
  visualArtIntentSchema,
  VISUAL_ART_INTENT_VERSION,
  type VisualArtIntent,
} from "@/lib/ai/visual-art/contract";
import { generateVisualArt } from "@/lib/ai/visual-art/generate";
import { measureArtwork } from "@/lib/ai/visual-art/metrics";
import { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";
import type { ArtworkAssets } from "@/components/event-renderer/artwork";
import { compileConcept } from "@/lib/generation/compile-concept";
import { deriveEventContent } from "@/lib/generation/event-content";
import type { EventContentRow } from "@/lib/generation/content-profile";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { buildMeasurableDocument } from "@/lib/renderer/verify/html";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify/result";

/* ----------------------------------------------------------------- spike parameters */

/** Pinned and dated. An alias moves, and an asset whose model cannot be named is not evidence. */
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";

/** The authorization: one request, and a ceiling that makes a second one impossible. */
const CEILING_USD = 0.5;

/**
 * The reservation is the **whole** ceiling, deliberately.
 *
 * `ArtworkBatchBudget` debits a reservation's worst case up front and refuses anything that would
 * pass the ceiling, so committing all of it means the budget itself forbids a second request. That
 * is "exactly one image" enforced by the architecture rather than asked for in a comment.
 */
const RESERVE_USD = 0.5;

/** Not recoverable from the evidence (see the header); fixed, shared by before and after. */
const SEED = 1;

/** The instant the 4D run used, so the provisional date is the one that page was verified with. */
const NOW = new Date("2026-09-19T08:13:40.729Z");

const REPO = new URL("../..", import.meta.url).pathname;
const SOURCE = path.join(REPO, "docs/model-evals/results/phase-4d-live-smoke-locally-grown");
const OUT = path.join(
  REPO,
  "docs/model-evals/results/phase-4e-artwork-capability-spike-locally-grown",
);

const LIVE = process.env.VITEST_SMOKE_OPENAI_STUB === undefined;

/* ----------------------------------------------------------------- the fixed brief */

/**
 * The one `VisualArtIntent` this spike sends, schema-valid against the production contract.
 *
 * Authored here rather than by a model, and rather than by `assembleVisualArtIntent`, because the
 * spike's creative target is fixed by its authorization. Where the production assembler would
 * derive the same value it is noted; where it would derive a different one, that is recorded as a
 * finding rather than quietly reconciled.
 */
const INTENT: VisualArtIntent = visualArtIntentSchema.parse({
  version: VISUAL_ART_INTENT_VERSION,
  // The assembler derives this from the leaf. Same value.
  role: "object",
  subject:
    "An original, refined grouping of locally grown garden produce with tender botanical " +
    "growth, leafy forms and a few small seasonal blossoms. It should read unmistakably as " +
    "growing things, garden abundance and cultivation — a celebratory locally grown world — " +
    "and never as cartoon, children's illustration, rustic kitsch, grocery advertising or " +
    "generic stock clip art.",
  medium:
    "Sophisticated hand-painted editorial illustration: gouache and watercolour-like pigment " +
    "with subtle coloured-pencil and natural line detail. Bespoke and tactile, not " +
    "photorealistic, and imitating no named artist, brand or existing artwork.",
  composition:
    "A hero decorative anchor beside the event's own words, never the content itself. Weight " +
    "the visual mass toward the upper left of the frame and leave meaningful open transparent " +
    "space toward the lower right, so the text set nearby stays dominant. Keep the meaningful " +
    "subject comfortably inside the canvas, with no leaf, produce or blossom cut by an edge.",
  // The assembler derives `balanced` for the object role. Same value.
  subjectWeight: "balanced",
  // The overlay anchors its content bottom-end, so the assembler derives `bottom`. The
  // authorization asks for the lower *right* specifically, and the enum has no corner — the prose
  // above carries the corner, and §9D measures the lower-right quadrant either way.
  negativeSpace: "bottom",
  // The assembler derives `transparent` for the object role. Same value, and the provider is sent
  // `background: transparent` to match.
  background: "transparent",
  // **A divergence worth recording.** The assembler reads crop safety off the leaf's extent, and
  // an `object` leaf with no authored extent defaults to `third`, which maps to `tight`. That
  // mapping assumes the box's aspect travels with the leaf's extent — true for a leaf in normal
  // flow, false inside an `Overlay.decoration`, whose box is the overlay's. The authorization asks
  // for a comfortable margin, which is `generous`, and that is what is sent.
  cropSafety: "generous",
  // The assembler derives `harmonize` on a base surface with no scrim. Same value.
  paletteRelationship: "harmonize",
  // The compiled semantic palette of this concept, never its raw creative palette.
  paletteHexes: ["#F3EAD7", "#65704A", "#C75B3F", "#D6A84B"],
  // The two real authoritative constraints, verbatim. Nothing else is promoted to host authority.
  hostConstraints: ["Not childish.", "Not cheesy."],
  prohibited: [
    ...STANDING_PROHIBITIONS,
    "No labels, signage, packaging or product branding of any kind.",
    "No opaque rectangular background, canvas, paper texture or field of colour behind the subject.",
    "No photorealistic grocery or product-advertising composition.",
  ],
} satisfies VisualArtIntent);

/* ----------------------------------------------------------------- the derivative */

interface ConceptRecord {
  readonly presentation: { name: string; description: string };
  readonly designIntent: DesignIntent;
  readonly capabilities: Capabilities;
  readonly compositionCanonical: CompositionTree;
  readonly compositionHash: string;
}

/** Replace the hero's decorative `Glyph` with an `Artwork` leaf. Nothing else moves. */
function substituteDecoration(tree: CompositionTree): {
  tree: CompositionTree;
  replaced: unknown;
} {
  const next = JSON.parse(JSON.stringify(tree)) as CompositionTree;
  const hero = next.sections[0].root as { t: string; decoration?: unknown };
  if (hero.t !== "Overlay") throw new Error(`expected an Overlay hero, found ${hero.t}`);
  const replaced = hero.decoration;
  const id = (replaced as { id?: string } | undefined)?.id;
  hero.decoration = { t: "Artwork", role: "object", ...(id ? { id } : {}) } as never;
  return { tree: next, replaced };
}

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

async function shoot(
  spec: ResolvedDesignSpec,
  content: ReturnType<typeof deriveEventContent>,
  artworkAssets: ArtworkAssets,
  label: "before" | "after",
): Promise<Record<string, { width: number; height: number }>> {
  const [{ default: chromium }, { chromium: pw }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("playwright-core"),
  ]);
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
  const sizes: Record<string, { width: number; height: number }> = {};
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
    const doc = buildMeasurableDocument({
      spec: spec as never,
      content,
      overrides: spec.overrides,
      artworkAssets,
    });
    for (const [name, width] of [
      ["mobile", 390],
      ["desktop", 1280],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(doc.html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // `complete` is not enough and the difference is not theoretical: it goes true once the
      // bytes are in, while the first paint still needs the image *decoded*. The first viewport in
      // this loop screenshotted an empty box for exactly that reason, and the second looked fine
      // because the decode had since been cached — a race that silently produces a "before" and an
      // "after" that are byte-identical. `decode()` resolves only when the frame is paintable, and
      // two animation frames afterwards let the compositor settle.
      await page.evaluate(() =>
        Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))).then(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        ),
      );
      const box = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      sizes[name] = box;
      await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`), fullPage: true });
    }
  } finally {
    await browser.close();
  }
  return sizes;
}

/* ----------------------------------------------------------------- the run */

describe("Phase 4E artwork capability spike", () => {
  it("generates one asset and proves it does not move a verified page", async () => {
    mkdirSync(OUT, { recursive: true });

    // ---- 1. the concept, read and never written
    const record = JSON.parse(
      readFileSync(path.join(SOURCE, "concepts/concept-1.json"), "utf8"),
    ) as ConceptRecord;
    expect(record.presentation.name).toBe("Tended Welcome");

    const { tree, replaced } = substituteDecoration(record.compositionCanonical);
    const capabilities: Capabilities = { ...record.capabilities, artwork: true };
    const content = deriveEventContent(EMPTY_EVENT, NOW);

    // ---- 2. compile and verify, with the slot reserved and empty. This is the "before".
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
      throw new Error(`the diagnostic derivative did not verify: ${JSON.stringify(compiled)}`);
    }
    const spec = compiled.spec;
    const slots = Object.entries(spec.artwork);
    expect(slots).toHaveLength(1);
    const [slotId, slot] = slots[0];
    expect(slot.role).toBe("object");
    expect(slot.render).toBe(true);
    expect(spec.verified.clean).toBe(true);

    // The reserved box must be in the markup with nothing inside it. If it is not, the "after"
    // would differ for the wrong reason and the whole comparison would be meaningless.
    // Scoped to the markup: the document also carries the stylesheet, which names every class.
    const bodyOf = (html: string) => html.slice(html.indexOf("<body>"));
    const beforeBody = bodyOf(
      buildMeasurableDocument({
        spec: spec as never,
        content,
        overrides: spec.overrides,
        artworkAssets: {},
      }).html,
    );
    expect(beforeBody).toContain("ev-art-object");
    expect(beforeBody).not.toContain("<img");

    const before = await shoot(spec, content, {}, "before");

    // ---- 3. the spend gate, before any transport exists
    const rates = ARTWORK_MODEL_RATES[MODEL];
    const budget = ArtworkBatchBudget.open({
      id: "phase4e-capability-spike",
      batchCeilingUsd: CEILING_USD,
      perRequestEstimateUsd: RESERVE_USD,
    });
    const grant = budget.reserve();
    if (!grant.ok) throw new Error(`the spike could not reserve: ${grant.detail}`);
    // The ceiling is now fully committed. A second image is refused by arithmetic, not by promise.
    const second = budget.reserve();
    expect(second.ok).toBe(false);

    // ---- 4. the one authorized call
    const provider = createOpenAiArtworkProvider({
      model: MODEL,
      size: "1024x1024",
      quality: "high",
      background: "transparent",
      outputFormat: "png",
    });
    const startedAt = Date.now();
    const outcome = await generateVisualArt({
      intent: INTENT,
      budget,
      reservation: grant.reservation,
      provider,
    });
    const wallMs = Date.now() - startedAt;

    const call = provider.lastCall;
    const failure = outcome.ok ? null : outcome.failure;

    // ---- 5. measure the exact returned bytes
    let metrics: ReturnType<typeof measureArtwork> | null = null;
    let after: Record<string, { width: number; height: number }> | null = null;
    let assetPath: string | null = null;

    if (outcome.ok && outcome.asset.payload.kind === "bytes") {
      const bytes = outcome.asset.payload.bytes;
      assetPath = path.join(OUT, "artwork.png");
      writeFileSync(assetPath, bytes);
      metrics = measureArtwork(bytes, INTENT.paletteHexes);

      // ---- 6. attach it through the renderer's own asset path and shoot the "after"
      const assets: ArtworkAssets = {
        [slotId]: {
          src: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
          width: metrics.width,
          height: metrics.height,
          hasAlpha: outcome.asset.transparency === "verified_present",
          alt: "",
        },
      };
      const afterBody = bodyOf(
        buildMeasurableDocument({
          spec: spec as never,
          content,
          overrides: spec.overrides,
          artworkAssets: assets,
        }).html,
      );
      // The asset really reached the renderer. Without this the two screenshots can be identical
      // for the most boring possible reason, and a geometry claim drawn from them proves nothing.
      expect(afterBody).toContain("ev-art-img");
      expect(afterBody).toContain("data:image/png;base64,");

      after = await shoot(spec, content, assets, "after");
    }

    // ---- 7. evidence. No credential, no base64, no full provider payload.
    const write = (name: string, value: unknown) =>
      writeFileSync(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);

    write("visual-art-intent.json", INTENT);
    write("provider-request-summary.json", {
      live: LIVE,
      provider: "openai-images",
      model: MODEL,
      parameters: {
        n: 1,
        size: "1024x1024",
        quality: "high",
        background: "transparent",
        output_format: "png",
        partial_images: 0,
        moderation: "default (unset)",
      },
      promptChars: call?.promptChars ?? null,
      intentVersion: INTENT.version,
    });
    write("provider-response-summary.json", {
      ok: outcome.ok,
      providerRequestId: call?.providerRequestId ?? null,
      usage: call?.usage ?? null,
      costUsd: call?.costUsd ?? null,
      providerLatencyMs: call?.latencyMs ?? null,
      wallMs,
      decodedBytes: call?.decodedBytes ?? null,
      transparency: outcome.ok ? outcome.asset.transparency : null,
      format: outcome.ok ? outcome.asset.format : null,
      failure,
      telemetry: outcome.telemetry,
    });
    write("metrics.json", {
      label:
        "Phase 4E artwork capability spike — objective measurements of one asset from one model. " +
        "Not a quality gate, not a provider selection, not a generalization.",
      model: MODEL,
      seed: SEED,
      conceptSource: "phase-4d-live-smoke-locally-grown/concepts/concept-1.json (read-only)",
      derivative: {
        note:
          "Diagnostic fixture. One decorative leaf substituted by hand; no model authored this " +
          "tree and it is not composition evidence.",
        replacedDecoration: replaced,
        artworkSlotId: slotId,
        resolvedSlot: slot,
        historicalCompositionHash: record.compositionHash,
      },
      spend: {
        ceilingUsd: CEILING_USD,
        reservedUsd: RESERVE_USD,
        rates,
        outputTokensCeilingCovers: outputTokensAffordable(MODEL, CEILING_USD, 2000),
        secondRequestRefused: !second.ok,
        actualCostUsd: call?.costUsd ?? null,
        budget: budget.state(),
      },
      asset: metrics,
      textInImage: "requires visual operator inspection",
      geometry: {
        before,
        after,
        unchanged: after ? JSON.stringify(before) === JSON.stringify(after) : null,
      },
      verifiedClean: {
        mobile: !spec.verified.mobile.pageOverflow,
        desktop: !spec.verified.desktop.pageOverflow,
      },
    });

    // ---- 8. the contact sheet. Facts and pictures; no score, no verdict, no band.
    const row = (k: string, v: unknown) =>
      `<tr><th>${k}</th><td><code>${String(v).replace(/</g, "&lt;")}</code></td></tr>`;
    const m = metrics;
    writeFileSync(
      path.join(OUT, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Phase 4E artwork capability spike</title>
<style>
 :root{color-scheme:light dark}
 body{font:14px/1.55 ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px;max-width:1180px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:36px 0 10px;text-transform:uppercase;letter-spacing:.08em}
 .note{padding:12px 14px;border:1px solid currentColor;border-radius:6px;opacity:.85;margin:16px 0}
 table{border-collapse:collapse;width:100%;margin:8px 0 18px} th,td{text-align:left;padding:5px 8px;border-bottom:1px solid rgba(128,128,128,.3);vertical-align:top}
 th{width:290px;font-weight:600} code{font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}
 .pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
 .pair figcaption{font-weight:600;margin-bottom:6px}
 img.shot{width:100%;border:1px solid rgba(128,128,128,.45)}
 .checker{background-image:linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0;background-color:#fff;padding:12px;display:inline-block}
 .checker img{display:block;width:512px;max-width:100%}
 pre{background:rgba(128,128,128,.12);padding:12px;border-radius:6px;overflow:auto;font-size:12px}
 .flag{font-weight:700}
</style>
<h1>Phase 4E — artwork capability spike</h1>
<p>Premise: <strong>Tended Welcome</strong> (Phase 4D concept 1, read-only). One image, one call, no retry.</p>
<div class="note"><strong>This is not the Phase 4E quality gate</strong> and not a provider selection.
One asset from one model tells you whether the path works, not whether the artwork is good.
The design is deliberately not scored here — that is the operator's to judge from the pictures below.</div>
<div class="note">The page is a <strong>diagnostic derivative</strong>: one decorative leaf in the 4D hero was
substituted by hand for an <code>Artwork</code> leaf. No model authored it and it is not composition evidence.</div>

<h2>The asset, on a transparency checkerboard</h2>
<div class="checker"><img src="artwork.png" alt=""></div>

<h2>Text in image</h2>
<p class="flag">requires visual operator inspection — no local detector ran, and no second paid model was called to look.</p>

<h2>Provider</h2>
<table>
${row("provider", "openai-images")}
${row("model (pinned, dated)", MODEL)}
${row("parameters", "n=1, size=1024x1024, quality=high, background=transparent, output_format=png, partial_images=0")}
${row("request id", call?.providerRequestId ?? "n/a")}
${row("usage", JSON.stringify(call?.usage ?? null))}
${row("cost (USD, from reported usage)", call?.costUsd ?? "unknown")}
${row("provider latency (ms)", call?.latencyMs ?? "n/a")}
${row("wall (ms)", wallMs)}
${row("ceiling / reserved (USD)", `${CEILING_USD} / ${RESERVE_USD}`)}
${row("second request refused by budget", !second.ok)}
</table>

<h2>Asset measurements</h2>
<table>
${row("dimensions / bytes", m ? `${m.width}x${m.height}, ${m.byteLength} bytes` : "n/a")}
${row("alpha channel present", m?.alpha.hasAlphaChannel)}
${row("fully transparent", m ? `${m.alpha.fullyTransparent} (${m.alpha.fullyTransparentPct}%)` : "n/a")}
${row("partially transparent", m ? `${m.alpha.partiallyTransparent} (${m.alpha.partiallyTransparentPct}%)` : "n/a")}
${row("fully opaque", m ? `${m.alpha.fullyOpaque} (${m.alpha.fullyOpaquePct}%)` : "n/a")}
${row("looks like an opaque canvas", m?.alpha.looksLikeOpaqueCanvas)}
${row("all four outer edges clear", m?.alpha.allEdgesClear)}
${row("clear edges", JSON.stringify(m?.alpha.clearEdges ?? null))}
${row("content bounding box", JSON.stringify(m?.crop.box ?? null))}
${row("margins (px)", JSON.stringify(m?.crop.marginsPx ?? null))}
${row("margins (%)", JSON.stringify(m?.crop.marginsPct ?? null))}
${row("edge-risk (content within 2% of an edge)", `${m?.crop.edgeRisk} ${JSON.stringify(m?.crop.edgesAtRisk ?? [])}`)}
${row("centroid (0..1)", JSON.stringify(m?.placement.centroid ?? null))}
${row("quadrant share of visual mass", JSON.stringify(m?.placement.quadrantShare ?? null))}
${row("quadrant transparent ratio", JSON.stringify(m?.placement.quadrantTransparentRatio ?? null))}
${row("lower-right transparency (the requested open space)", m?.placement.quadrantTransparentRatio.bottomRight)}
${row("dominant colours", JSON.stringify(m?.palette.dominant ?? null))}
${row("distance to each intended colour", JSON.stringify(m?.palette.nearestToIntended ?? null))}
</table>

<h2>Geometry</h2>
<table>
${row("before — 390 / 1280", `${before.mobile.width}x${before.mobile.height} / ${before.desktop.width}x${before.desktop.height}`)}
${row("after — 390 / 1280", after ? `${after.mobile.width}x${after.mobile.height} / ${after.desktop.width}x${after.desktop.height}` : "n/a")}
${row("unchanged by attaching the asset", after ? JSON.stringify(before) === JSON.stringify(after) : "n/a")}
${row("verified clean at 390 / 1280", `${!spec.verified.mobile.pageOverflow} / ${!spec.verified.desktop.pageOverflow}`)}
</table>

<h2>Mobile — 390</h2>
<div class="pair">
 <figure><figcaption>before (slot reserved, no asset)</figcaption><img class="shot" src="before-mobile.png" alt=""></figure>
 <figure><figcaption>after (this asset attached)</figcaption><img class="shot" src="after-mobile.png" alt=""></figure>
</div>

<h2>Desktop — 1280</h2>
<div class="pair">
 <figure><figcaption>before (slot reserved, no asset)</figcaption><img class="shot" src="before-desktop.png" alt=""></figure>
 <figure><figcaption>after (this asset attached)</figcaption><img class="shot" src="after-desktop.png" alt=""></figure>
</div>

<h2>The VisualArtIntent that was sent</h2>
<pre>${JSON.stringify(INTENT, null, 2).replace(/</g, "&lt;")}</pre>
`,
    );

    // ---- 9. the invariant this spike exists to test
    expect(outcome.ok).toBe(true);
    if (after) {
      expect(after.mobile).toEqual(before.mobile);
      expect(after.desktop).toEqual(before.desktop);
    }
  }, 900_000);
});
