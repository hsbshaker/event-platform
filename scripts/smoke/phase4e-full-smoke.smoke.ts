/**
 * Phase 4E — the first full three-concept artwork smoke.
 *
 * One authoritative creative world in; three rendered event concepts out, with original thematic
 * artwork wherever the creative direction asked for it and nothing where it did not.
 *
 * **This is a single diagnostic/product smoke.** Not a generalization benchmark, not a fresh 4C
 * gate, not a Human Test, not a provider bake-off, not a claim about quality. Nothing here is
 * scored; the operator reviews the finished websites.
 *
 * # What is fixed, and why
 *
 * The `EventIdentity` is the exact fixture the Phase 4D smoke used, read from its frozen evidence.
 * Event Identity is never called, no raw prompt is introduced and clarification is not exercised —
 * which is what lets this run isolate the downstream creative pipeline rather than re-testing
 * interpretation.
 *
 * # Artwork is optional, and this run must be able to say so
 *
 * The production decision logic chooses, per concept, from its own `DesignIntent`. A sibling that
 * chooses zero artwork is a valid output and is not overridden. If all three choose zero, the run
 * stops before any image call and reports that faithfully — which is why the image budget is
 * constructed but nothing reaches a provider until a reservation has been made against it.
 *
 * # Rehearsal
 *
 * `VITEST_SMOKE_OPENAI_STUB` aliases the `openai` package to an offline stub, so the whole path —
 * planner, premise, design intents, compositions, collision, compiler, optionality, briefs,
 * storage, persistence, geometry, renderer — runs at zero cost first. Run it that way. Always.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";

import { supabaseShim } from "../../tests/db/supabase-shim";
import { withWrites } from "./pg-supabase-writes";
import { diagnosticArtworkStore } from "./diagnostic-artwork-store";
import { runConceptBatch } from "@/lib/generation/concept-batch";
import { deriveEventContent } from "@/lib/generation/event-content";
import type { EventContentRow } from "@/lib/generation/content-profile";
import { ArtworkAttemptBudget } from "@/lib/generation/artwork-stage";
import { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";
import { createOpenAiArtworkProvider } from "@/lib/ai/openai/artwork";
import { measureArtwork } from "@/lib/ai/visual-art/metrics";
import { buildMeasurableDocument } from "@/lib/renderer/verify";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify";
import type { ArtworkAssets } from "@/components/event-renderer/artwork";
import { GPT_5_6_SOL } from "@/lib/generation/identity-cost";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ run parameters */

/** Pinned and dated, as proven by the capability spike. Never an alias. */
const IMAGE_MODEL = "gpt-image-2.5-sunburst-2026-09-08";

/** Image generation only. Text-model spend is separate and recorded separately. */
const IMAGE_CEILING_USD = 1.5;

/**
 * The worst case debited per request.
 *
 * The one real asset cost $0.055, and a reservation is not an estimate of the likely — it is what
 * must be affordable before a request is permitted. $0.25 is roughly four times observed, which
 * leaves the $1.50 ceiling able to fund six requests: exactly the normal maximum number of slots.
 */
const IMAGE_PER_REQUEST_USD = 0.25;

/** A hard count, independent of money: six normal slots plus two bounded retries. */
const MAX_IMAGE_ATTEMPTS = 8;

const OUT = path.resolve("docs/model-evals/results/phase-4e-full-smoke-locally-grown");
const VIS = path.join(OUT, "visuals");
const CONCEPTS = path.join(OUT, "concepts");
const ART = path.join(OUT, "artwork");
const INTENTS = path.join(OUT, "artwork-intents");

const SOURCE = path.resolve("docs/model-evals/results/phase-4d-live-smoke-locally-grown");

/** `1` runs the paid batch; anything else refuses to spend. */
const LIVE = process.env.SMOKE_LIVE === "1";

/* ---------------------------------------------------------------------- pricing */

/** Price one run row exactly as `identity-cost.ts` prices a response, at its served tier. */
function priceRun(row: {
  input_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_input_tokens: number | null;
  output_tokens: number | null;
}): number {
  const input = row.input_tokens ?? 0;
  const cached = row.cached_input_tokens ?? 0;
  const written = row.cache_write_input_tokens ?? 0;
  const output = row.output_tokens ?? 0;
  const tier = input > GPT_5_6_SOL.longContextThresholdTokens ? "longContext" : "standard";
  const p = GPT_5_6_SOL[tier];
  const uncached = Math.max(0, input - cached - written);
  return (
    (uncached * p.input +
      cached * p.cachedInput +
      written * p.cacheWriteInput +
      output * p.output) /
    1_000_000
  );
}

/* ------------------------------------------------------------------------ render */

async function shoot(
  jobs: readonly {
    readonly name: string;
    readonly spec: ResolvedDesignSpec;
    readonly content: ReturnType<typeof deriveEventContent>;
    readonly assets: ArtworkAssets;
  }[],
): Promise<Record<string, { width: number; height: number }>> {
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
  const sizes: Record<string, { width: number; height: number }> = {};
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
    for (const job of jobs) {
      const { html } = buildMeasurableDocument({
        spec: job.spec as never,
        content: job.content,
        overrides: job.spec.overrides,
        artworkAssets: job.assets,
      });
      for (const [label, width] of [
        ["mobile", 390],
        ["desktop", 1280],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        // `complete` is not enough for a first paint; `decode()` resolves when the frame is
        // paintable. Two animation frames afterwards let the compositor settle.
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
        await page.screenshot({ path: path.join(VIS, `${job.name}-${label}.png`), fullPage: true });
      }
    }
  } finally {
    await browser.close();
  }
  return sizes;
}

/* ------------------------------------------------------------------------- the smoke */

it(
  "turns one authoritative identity into three concepts, with artwork where the direction asked",
  async () => {
    const startedAt = new Date();
    for (const dir of [VIS, CONCEPTS, ART, INTENTS]) mkdirSync(dir, { recursive: true });

    // The fixture, read from frozen evidence and never modified.
    const identityFixture = JSON.parse(
      readFileSync(path.join(SOURCE, "identity-fixture.json"), "utf8"),
    ) as Record<string, unknown>;
    copyFileSync(
      path.join(SOURCE, "identity-fixture.json"),
      path.join(OUT, "identity-fixture.json"),
    );

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    const admin = withWrites(client, supabaseShim(client)) as SupabaseClient<Database>;

    // ---- seed: a real event whose authoritative identity is the fixture, and nothing else.
    const who = `smoke4e-owner-${startedAt.getTime()}@example.test`;
    const { rows: users } = await client.query(
      `insert into auth.users (email) values ($1) returning id`,
      [who],
    );
    const ownerId = users[0].id as string;
    await client.query(
      `insert into public.profiles (id, email) values ($1, $2) on conflict (id) do nothing`,
      [ownerId, who],
    );
    const { rows: events } = await client.query(
      `insert into public.events (owner_id, prompt) values ($1, $2) returning id`,
      // Stored because the column is NOT NULL. Never read below Event Identity, which is not called.
      [ownerId, "Baby shower with a locally grown theme."],
    );
    const eventId = events[0].id as string;

    const { rows: revisions } = await client.query(
      `insert into public.event_identity_revisions
         (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
          provider, model)
       values ($1, 1, $2::jsonb, 'event_identity_v5', 'event_identity_schema_v5',
               'event_identity_input_v2', 'fixture', 'fixture')
       returning id`,
      [
        eventId,
        JSON.stringify({
          identity: identityFixture,
          suppliedFacts: {
            hostNames: null,
            honoreeName: null,
            honoreeDescriptionText: null,
            eventDate: null,
            startTime: null,
            endTime: null,
            venueName: null,
            address: null,
            rsvpDeadline: null,
            guestCount: null,
          },
          clarification: { needed: false, questions: [] },
        }),
      ],
    );
    const revisionId = revisions[0].id as string;
    await client.query(
      `update public.events set authoritative_identity_revision_id = $1 where id = $2`,
      [revisionId, eventId],
    );

    // ---- the artwork lifecycle's dependencies. Shared across the batch's three siblings.
    const budget = ArtworkBatchBudget.open({
      id: `phase4e-full-smoke-${startedAt.getTime()}`,
      batchCeilingUsd: IMAGE_CEILING_USD,
      perRequestEstimateUsd: IMAGE_PER_REQUEST_USD,
    });
    const attempts = new ArtworkAttemptBudget(MAX_IMAGE_ATTEMPTS);
    const store = diagnosticArtworkStore(ART);
    const provider = createOpenAiArtworkProvider({
      model: IMAGE_MODEL,
      size: "1024x1024",
      quality: "high",
      background: "transparent",
      outputFormat: "png",
    });

    // ---- the run. Everything from here is production code.
    const t0 = Date.now();
    const outcome = await runConceptBatch(admin, {
      eventId,
      userId: ownerId,
      artwork: { provider, budget, attempts, store },
    });
    const wallMs = Date.now() - t0;

    // ---- telemetry, read back from the rows production wrote.
    const q = async (sql: string) => (await client.query(sql, [eventId])).rows;
    const runs = await q(
      `select operation, concept_index, model, provider_request_id, input_tokens,
              cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_tokens,
              latency_ms, success, error_code, prompt_version, schema_version,
              input_assembly_version, primitive_set_version, compiler_version,
              schema_valid_first_call, reprompts, fallback, nearest_sibling, created_at
         from public.generation_runs where event_id = $1 order by created_at`,
    );
    const artifacts = await q(
      `select id, concept_index, concept_premise, presentation, design_intent, card_deviations
         from public.design_intent_artifacts where event_id = $1 order by concept_index`,
    );
    const concepts = await q(
      `select id, concept_index, name, description, composition_hash, fallback,
              active_resolved_spec_id, composition_raw, composition, capabilities,
              content_profile, composition_prompt_version, composition_schema_version,
              composition_input_assembly_version, primitive_set_version, compiler_version
         from public.design_concepts where event_id = $1 order by concept_index`,
    );
    const specs = await q(
      `select s.id, s.concept_id, s.revision, s.verified_clean, s.spec, c.concept_index
         from public.resolved_design_specs s
         join public.design_concepts c on c.id = s.concept_id
        where c.event_id = $1 order by c.concept_index`,
    );
    const slotRows = await q(
      `select a.resolved_spec_id, a.slot_id, a.role, a.extent, a.status, a.visual_art_intent,
              a.visual_art_intent_version, a.provider, a.model, a.storage_bucket, a.storage_path,
              a.width_px, a.height_px, a.byte_size, a.content_type, a.has_alpha,
              a.failure_kind, a.failure_detail, a.latency_ms, a.cost_estimate_usd,
              a.mobile_width_px, a.mobile_height_px, a.desktop_width_px, a.desktop_height_px,
              c.concept_index
         from public.resolved_spec_artwork_slots a
         join public.resolved_design_specs s on s.id = a.resolved_spec_id
         join public.design_concepts c on c.id = s.concept_id
        where c.event_id = $1 order by c.concept_index, a.slot_id`,
    );
    const siblings = await q(
      `select gs.concept_index, gs.status, gs.attempt from public.generation_batch_siblings gs
         join public.generation_batches b on b.id = gs.batch_id
        where b.event_id = $1 order by gs.concept_index`,
    );
    const batches = await q(
      `select id, status, round, started_at, settled_at from public.generation_batches
        where event_id = $1`,
    );

    // ---- content, at the run's own instant, so the page screenshotted is the page verified.
    const contentRow = (
      await client.query(
        `select title, description, hosts, baby_name, venue_name, address, event_date,
                start_time, timezone, rsvp_deadline from public.events where id = $1`,
        [eventId],
      )
    ).rows[0] as EventContentRow;
    const content = deriveEventContent(contentRow, startedAt);

    // ---- assets, read back from the store by the lineage the database recorded.
    const assetsBySpec = new Map<
      string,
      Record<string, { src: string; width: number; height: number; hasAlpha: boolean; alt: string }>
    >();
    const artworkEvidence: Record<string, unknown>[] = [];

    for (const row of slotRows) {
      const index = (row.concept_index as number) + 1;
      const slotSafe = String(row.slot_id)
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      // The brief is persisted for every attempted slot, delivered or not.
      writeFileSync(
        path.join(INTENTS, `concept-${index}-slot-${slotSafe}.json`),
        `${JSON.stringify(row.visual_art_intent, null, 2)}\n`,
      );

      let metrics = null;
      if (row.status === "delivered" && row.storage_path) {
        const file = path.join(ART, String(row.storage_path));
        const bytes = new Uint8Array(readFileSync(file));
        const intent = row.visual_art_intent as { paletteHexes?: string[] };
        metrics = measureArtwork(bytes, intent.paletteHexes ?? []);
        // A copy under the evidence name the operator reads by.
        copyFileSync(file, path.join(ART, `concept-${index}-slot-${slotSafe}.png`));
        const map = assetsBySpec.get(String(row.resolved_spec_id)) ?? {};
        map[String(row.slot_id)] = {
          src: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
          width: metrics.width,
          height: metrics.height,
          hasAlpha: row.has_alpha === true,
          alt: "",
        };
        assetsBySpec.set(String(row.resolved_spec_id), map);
      }
      artworkEvidence.push({
        conceptIndex: row.concept_index,
        slotId: row.slot_id,
        role: row.role,
        extent: row.extent,
        status: row.status,
        provider: row.provider,
        model: row.model,
        intentVersion: row.visual_art_intent_version,
        storage: row.storage_path ? { bucket: row.storage_bucket, path: row.storage_path } : null,
        reservedBox: {
          mobile: { widthPx: row.mobile_width_px, heightPx: row.mobile_height_px },
          desktop: { widthPx: row.desktop_width_px, heightPx: row.desktop_height_px },
        },
        recorded: {
          widthPx: row.width_px,
          heightPx: row.height_px,
          byteSize: row.byte_size,
          contentType: row.content_type,
          hasAlpha: row.has_alpha,
        },
        failure: row.failure_kind ? { kind: row.failure_kind, detail: row.failure_detail } : null,
        measured: metrics,
        evidenceFile:
          row.status === "delivered" ? `artwork/concept-${index}-slot-${slotSafe}.png` : null,
        intentFile: `artwork-intents/concept-${index}-slot-${slotSafe}.json`,
      });
    }

    // ---- renders: the final page, plus a no-art diagnostic pair for any concept that got art.
    const jobs: Parameters<typeof shoot>[0][number][] = [];
    for (const row of specs) {
      const spec = row.spec as ResolvedDesignSpec;
      const n = (row.concept_index as number) + 1;
      const assets = (assetsBySpec.get(String(row.id)) ?? {}) as ArtworkAssets;
      jobs.push({ name: `concept-${n}`, spec, content, assets });
      if (Object.keys(assets).length > 0) {
        // Same spec, same reservations, assets detached. Zero cost, and the only way to isolate
        // what the generated artwork contributes.
        jobs.push({ name: `concept-${n}-no-art`, spec, content, assets: {} });
      }
    }
    const pageSizes = await shoot(jobs);

    // ---- evidence
    const write = (file: string, value: unknown) =>
      writeFileSync(path.join(OUT, file), `${JSON.stringify(value, null, 2)}\n`);

    for (const row of concepts) {
      const n = (row.concept_index as number) + 1;
      const artifact = artifacts.find((a) => a.concept_index === row.concept_index);
      write(`concepts/concept-${n}.json`, {
        index: row.concept_index,
        presentation: artifact?.presentation ?? null,
        premise: artifact?.concept_premise ?? null,
        designIntent: artifact?.design_intent ?? null,
        capabilities: row.capabilities,
        contentProfile: row.content_profile,
        compositionRaw: row.composition_raw,
        compositionCanonical: row.composition,
        compositionHash: row.composition_hash,
        fallback: row.fallback,
        artwork: artworkEvidence.filter((a) => a.conceptIndex === row.concept_index),
      });
    }

    writeFileSync(
      path.join(OUT, "provider-telemetry.jsonl"),
      `${runs.map((r) => JSON.stringify(r)).join("\n")}\n`,
    );
    writeFileSync(
      path.join(OUT, "artwork-telemetry.jsonl"),
      artworkEvidence.length === 0
        ? ""
        : `${artworkEvidence.map((a) => JSON.stringify(a)).join("\n")}\n`,
    );

    const textCost = runs.reduce((sum, r) => sum + priceRun(r as never), 0);
    const imageCost = slotRows.reduce((sum, r) => sum + Number(r.cost_estimate_usd ?? 0), 0);

    write("run-summary.json", {
      label:
        "Phase 4E first full three-concept artwork smoke — locally grown baby shower. " +
        "Diagnostic/product evidence only. Not a benchmark, not a gate, not scored.",
      live: LIVE,
      startedAt: startedAt.toISOString(),
      wallMs,
      outcomeState: outcome.state,
      batch: batches[0] ?? null,
      siblings,
      identity: {
        source: "phase-4d-live-smoke-locally-grown/identity-fixture.json",
        revisionId,
        eventIdentityCalled: false,
      },
      providerCalls: {
        text: runs.length,
        byOperation: runs.reduce<Record<string, number>>((acc, r) => {
          const key = String(r.operation);
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
        image: {
          attempted: attempts.spent,
          limit: MAX_IMAGE_ATTEMPTS,
          delivered: slotRows.filter((r) => r.status === "delivered").length,
          failed: slotRows.filter((r) => r.status === "failed").length,
        },
      },
      spend: {
        textUsd: textCost,
        imageUsd: imageCost,
        totalUsd: textCost + imageCost,
        imageCeilingUsd: IMAGE_CEILING_USD,
        imagePerRequestReservationUsd: IMAGE_PER_REQUEST_USD,
        budget: budget.state(),
      },
      artworkStore: { id: store.id, supabaseUploadExercised: false },
      imageProvider: { provider: "openai-images", model: IMAGE_MODEL },
      concepts: concepts.map((c) => ({
        index: c.concept_index,
        name: c.name,
        compositionHash: c.composition_hash,
        fallback: c.fallback,
        specId: c.active_resolved_spec_id,
      })),
      resolvedSpecs: specs.map((s) => ({
        conceptIndex: s.concept_index,
        id: s.id,
        verifiedClean: s.verified_clean,
        verified: (s.spec as ResolvedDesignSpec).verified,
      })),
      pageSizes,
      content,
    });

    await client.end();

    // ---- the objective claims this run exists to make.
    expect(outcome.state).toBe("generated");
    expect(specs).toHaveLength(3);
    for (const row of specs) {
      const spec = row.spec as ResolvedDesignSpec;
      expect(spec.verified.clean).toBe(true);
      expect(spec.verified.mobile.pageOverflow).toBe(false);
      expect(spec.verified.desktop.pageOverflow).toBe(false);
      expect(spec.verified.mobile.textOverflow).toBe(0);
      expect(spec.verified.desktop.textOverflow).toBe(0);
    }
    // No asset may reach a slot of another sibling.
    for (const row of slotRows) {
      if (row.status !== "delivered") continue;
      expect(String(row.storage_path)).toContain(String(row.resolved_spec_id));
    }
    // Every concept that got artwork has a no-art pair, and the two measure the same.
    for (const row of specs) {
      const n = (row.concept_index as number) + 1;
      if (!pageSizes[`concept-${n}-no-art-mobile`]) continue;
      expect(pageSizes[`concept-${n}-mobile`]).toEqual(pageSizes[`concept-${n}-no-art-mobile`]);
      expect(pageSizes[`concept-${n}-desktop`]).toEqual(pageSizes[`concept-${n}-no-art-desktop`]);
    }
    expect(attempts.spent).toBeLessThanOrEqual(MAX_IMAGE_ATTEMPTS);
    expect(imageCost).toBeLessThanOrEqual(IMAGE_CEILING_USD);
  },
  30 * 60_000,
);
