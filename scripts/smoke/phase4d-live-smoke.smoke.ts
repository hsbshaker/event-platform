/**
 * Phase 4D live integration smoke — one batch, once.
 *
 * **What this is:** a product integration smoke. It asks one question — can the completed
 * downstream pipeline take a realistic authoritative `EventIdentity` and turn it into three real
 * model-authored `CompositionTree`s that compile, geometry-verify, persist and render as three
 * actual event websites?
 *
 * **What this is not:** an EventIdentity test, a sealed benchmark, fresh or generalization
 * evidence, or a creative-quality score. One example proves a path works; it proves nothing about
 * a population.
 *
 * Deliberately named `.smoke.ts` so no vitest project's `include` can ever pick it up: a file that
 * spends money must be invoked on purpose, never swept into `npm test`.
 *
 * Everything below the orchestrator is production code. The only test doubles are the *transport*
 * (a `pg`-backed `SupabaseClient` shim, so the real RPCs run against a real PostgreSQL) and a
 * screenshot pass that reuses the verifier's own document builder and its own Chromium recipe.
 * There is no second renderer, no second compiler and no re-implemented orchestration.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";

import { supabaseShim } from "../../tests/db/supabase-shim";
import { LOCALLY_GROWN_IDENTITY } from "./locally-grown-identity";
import { runConceptBatch } from "@/lib/generation/concept-batch";
import { deriveEventContent } from "@/lib/generation/event-content";
import type { EventContentRow } from "@/lib/generation/content-profile";
import { buildMeasurableDocument } from "@/lib/renderer/verify";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify";
import { GPT_5_6_SOL } from "@/lib/generation/identity-cost";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const OUT = path.resolve("docs/model-evals/results/phase-4d-live-smoke-locally-grown");
const VIS = path.join(OUT, "visuals");
const CONCEPTS = path.join(OUT, "concepts");

/** Set by the caller. `1` runs the paid batch; anything else refuses to spend. */
const LIVE = process.env.SMOKE_LIVE === "1";

/* ------------------------------------------------------------------ transport */

/**
 * `insert` and `update` over the shared shim, which supports `select` and `rpc` only.
 *
 * Still transport, never behaviour: each statement is the one PostgREST would issue for the same
 * builder call, and every constraint, trigger and `security definer` function below it is the real
 * database's. Written here rather than in `tests/db/supabase-shim.ts` so the smoke cannot change
 * what the existing DB suite is testing.
 */
function withWrites(client: Client, base: SupabaseClient<Database>): SupabaseClient<Database> {
  const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;
  /**
   * `jsonb` columns take JSON text.
   *
   * PostgREST sends the whole row as JSON, so a `jsonb` column arrives as JSON either way. Over
   * `pg`, a plain object is serialized for us but a JS **array** is turned into a Postgres array
   * literal — `{}` for `[]` — which `jsonb` then rejects as invalid JSON. Every object and array
   * this path inserts targets a json column, so both are stringified and nothing else is touched.
   */
  const encode = (value: unknown) =>
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value;
  const shim = {
    rpc: base.rpc.bind(base),
    from(table: string) {
      const inner = (base as unknown as { from: (t: string) => unknown }).from(table) as Record<
        string,
        unknown
      >;
      return {
        select: inner.select,
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = Array.isArray(rows) ? rows : [rows];
          const columns = Object.keys(list[0]);
          const values: unknown[] = [];
          const tuples = list.map(
            (row) =>
              `(${columns
                .map((c) => {
                  values.push(encode(row[c]));
                  return `$${values.length}`;
                })
                .join(", ")})`,
          );
          const run = async (returning: string) => {
            try {
              const result = await client.query(
                `insert into public.${quote(table)} (${columns.map(quote).join(", ")}) ` +
                  `values ${tuples.join(", ")}${returning}`,
                values,
              );
              return { data: result.rows, error: null };
            } catch (error) {
              const e = error as { code?: string; message?: string };
              return { data: null, error: { code: e.code, message: e.message ?? String(error) } };
            }
          };
          const chain = {
            select: (cols = "*") => ({
              maybeSingle: async () => {
                const r = await run(` returning ${cols === "*" ? "*" : cols}`);
                return r.error
                  ? { data: null, error: r.error }
                  : { data: (r.data as unknown[])[0] ?? null, error: null };
              },
              then: (resolve: (v: unknown) => unknown) =>
                run(` returning ${cols === "*" ? "*" : cols}`).then(resolve),
            }),
            then: (resolve: (v: unknown) => unknown) => run("").then(resolve),
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          const sets: string[] = [];
          const values: unknown[] = [];
          for (const [k, v] of Object.entries(patch)) {
            values.push(encode(v));
            sets.push(`${quote(k)} = $${values.length}`);
          }
          return {
            eq: async (column: string, value: unknown) => {
              values.push(value);
              try {
                await client.query(
                  `update public.${quote(table)} set ${sets.join(", ")} ` +
                    `where ${quote(column)} = $${values.length}`,
                  values,
                );
                return { data: null, error: null };
              } catch (error) {
                const e = error as { code?: string; message?: string };
                return { data: null, error: { code: e.code, message: e.message ?? String(error) } };
              }
            },
          };
        },
      };
    },
  };
  return shim as unknown as SupabaseClient<Database>;
}

/* --------------------------------------------------------------------- pricing */

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

/* ------------------------------------------------------------------ the smoke */

it(
  "turns one authoritative identity into three compiled, verified, rendered concepts",
  async () => {
    const startedAt = new Date();
    mkdirSync(VIS, { recursive: true });
    mkdirSync(CONCEPTS, { recursive: true });

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    const admin = withWrites(client, supabaseShim(client));

    // ---- seed: a real event whose authoritative identity is the fixture, and nothing else.
    // Unique per run, so a rehearsal left in the database cannot collide with the real one.
    const who = `smoke-owner-${startedAt.getTime()}@example.test`;
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
      [
        ownerId,
        // Stored because the column is NOT NULL. It is never read by any stage below Event
        // Identity, and Event Identity is not called here.
        "Baby shower with a locally grown theme.",
      ],
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
          identity: LOCALLY_GROWN_IDENTITY,
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
          // No clarification: this smoke does not exercise the 4B loop.
          clarification: { needed: false, questions: [] },
        }),
      ],
    );
    const revisionId = revisions[0].id as string;
    await client.query(
      `update public.events set authoritative_identity_revision_id = $1 where id = $2`,
      [revisionId, eventId],
    );

    // ---- the run. Everything from here is production code.
    const t0 = Date.now();
    const outcome = await runConceptBatch(admin, { eventId, userId: ownerId });
    const wallMs = Date.now() - t0;

    // ---- telemetry, read back from the rows production wrote.
    const { rows: runs } = await client.query(
      `select operation, concept_index, model, provider_request_id, input_tokens,
              cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_tokens,
              latency_ms, success, error_code, prompt_version, schema_version,
              input_assembly_version, primitive_set_version, compiler_version,
              schema_valid_first_call, reprompts, fallback, nearest_sibling, created_at
         from public.generation_runs where event_id = $1 order by created_at`,
      [eventId],
    );
    const { rows: artifacts } = await client.query(
      `select id, concept_index, concept_premise, presentation, design_intent, card_deviations,
              design_intent_prompt_version, concept_premise_prompt_version
         from public.design_intent_artifacts where event_id = $1 order by concept_index`,
      [eventId],
    );
    const { rows: concepts } = await client.query(
      `select id, concept_index, name, description, composition_hash, fallback,
              design_intent_artifact_id, active_resolved_spec_id, composition_raw, composition,
              capabilities, content_profile, composition_prompt_version,
              composition_schema_version, composition_input_assembly_version,
              primitive_set_version, compiler_version
         from public.design_concepts where event_id = $1 order by concept_index`,
      [eventId],
    );
    const { rows: specs } = await client.query(
      `select s.id, s.concept_id, s.revision, s.content_version, s.verified_clean, s.spec,
              c.concept_index
         from public.resolved_design_specs s
         join public.design_concepts c on c.id = s.concept_id
        where c.event_id = $1 order by c.concept_index`,
      [eventId],
    );
    const { rows: siblings } = await client.query(
      `select gs.concept_index, gs.status, gs.attempt, gs.generation_run_id
         from public.generation_batch_siblings gs
         join public.generation_batches b on b.id = gs.batch_id
        where b.event_id = $1 order by gs.concept_index`,
      [eventId],
    );
    const { rows: batches } = await client.query(
      `select id, status, round, started_at, settled_at from public.generation_batches
        where event_id = $1`,
      [eventId],
    );

    // ---- screenshots of the exact persisted specs, through the production renderer.
    const contentRow = (
      await client.query(
        `select title, description, hosts, baby_name, venue_name, address, event_date,
                start_time, timezone, rsvp_deadline from public.events where id = $1`,
        [eventId],
      )
    ).rows[0] as EventContentRow;
    // The same instant the run used, so the page screenshotted is the page verified. The
    // provisional date is derived from "now", and a later "now" would move it.
    const content = deriveEventContent(contentRow, startedAt);

    const shots: { index: number; mobile: string; desktop: string }[] = [];
    if (specs.length > 0) {
      const [{ default: chromium }, { chromium: pw }] = await Promise.all([
        import("@sparticuz/chromium"),
        import("playwright-core"),
      ]);
      const executablePath = await chromium.executablePath();
      const browser = await pw.launch({ executablePath, args: chromium.args, headless: true });
      try {
        const context = await browser.newContext({ deviceScaleFactor: 1 });
        const page = await context.newPage();
        for (const row of specs) {
          const spec = row.spec as ResolvedDesignSpec;
          const doc = buildMeasurableDocument({
            spec: spec as never,
            content,
            // The final verification overrides, so the screenshot is the verified page and not a
            // fresh render that never had its emphasis demoted.
            overrides: spec.overrides,
          });
          const n = (row.concept_index as number) + 1;
          for (const [label, width] of [
            ["mobile", 390],
            ["desktop", 1280],
          ] as const) {
            await page.setViewportSize({ width, height: 900 });
            await page.setContent(doc.html, { waitUntil: "load" });
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            const file = path.join(VIS, `concept-${n}-${label}.png`);
            await page.screenshot({ path: file, fullPage: true });
          }
          shots.push({
            index: n,
            mobile: `concept-${n}-mobile.png`,
            desktop: `concept-${n}-desktop.png`,
          });
        }
      } finally {
        await browser.close();
      }
    }

    // ---- evidence
    const cost = runs.reduce((sum, r) => sum + priceRun(r as never), 0);
    const summary = {
      label:
        "Phase 4D live integration smoke — locally grown baby shower — diagnostic/product " +
        "evidence only; not a benchmark and no generalization claim.",
      live: LIVE,
      startedAt: startedAt.toISOString(),
      wallMs,
      outcomeState: outcome.state,
      batch: batches[0] ?? null,
      siblings,
      providerCalls: {
        total: runs.length,
        byOperation: runs.reduce<Record<string, number>>((acc, r) => {
          acc[r.operation as string] = (acc[r.operation as string] ?? 0) + 1;
          return acc;
        }, {}),
        failures: runs.filter((r) => !r.success).length,
      },
      tokens: {
        input: runs.reduce((s, r) => s + ((r.input_tokens as number) ?? 0), 0),
        cached: runs.reduce((s, r) => s + ((r.cached_input_tokens as number) ?? 0), 0),
        output: runs.reduce((s, r) => s + ((r.output_tokens as number) ?? 0), 0),
        reasoning: runs.reduce((s, r) => s + ((r.reasoning_tokens as number) ?? 0), 0),
      },
      estimatedCostUsd: Number(cost.toFixed(4)),
      concepts: concepts.map((c) => ({
        index: c.concept_index,
        name: c.name,
        description: c.description,
        compositionHash: c.composition_hash,
        fallback: c.fallback,
        activeResolvedSpecId: c.active_resolved_spec_id,
        designIntentArtifactId: c.design_intent_artifact_id,
        versions: {
          compositionPrompt: c.composition_prompt_version,
          compositionSchema: c.composition_schema_version,
          compositionInputAssembly: c.composition_input_assembly_version,
          primitiveSet: c.primitive_set_version,
          compiler: c.compiler_version,
        },
      })),
      resolvedSpecs: specs.map((s) => ({
        conceptIndex: s.concept_index,
        id: s.id,
        revision: s.revision,
        contentVersion: s.content_version,
        verifiedClean: s.verified_clean,
        verified: (s.spec as ResolvedDesignSpec).verified,
        compilerRepairs: (s.spec as ResolvedDesignSpec).compilerRepairs,
        intentDeviations: (s.spec as ResolvedDesignSpec).intentDeviations,
      })),
      premises: artifacts.map((a) => ({
        index: a.concept_index,
        premise: a.concept_premise,
        presentation: a.presentation,
        cardDeviations: a.card_deviations,
      })),
      content,
      shots,
    };
    writeFileSync(path.join(OUT, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(
      path.join(OUT, "provider-telemetry.jsonl"),
      `${runs.map((r) => JSON.stringify(r)).join("\n")}\n`,
    );
    for (const c of concepts) {
      writeFileSync(
        path.join(CONCEPTS, `concept-${(c.concept_index as number) + 1}.json`),
        `${JSON.stringify(
          {
            index: c.concept_index,
            presentation: { name: c.name, description: c.description },
            premise: artifacts.find((a) => a.concept_index === c.concept_index)?.concept_premise,
            designIntent: artifacts.find((a) => a.concept_index === c.concept_index)?.design_intent,
            capabilities: c.capabilities,
            contentProfile: c.content_profile,
            compositionRaw: c.composition_raw,
            compositionCanonical: c.composition,
            compositionHash: c.composition_hash,
          },
          null,
          2,
        )}\n`,
      );
    }
    writeFileSync(
      path.join(OUT, "identity-fixture.json"),
      `${JSON.stringify(LOCALLY_GROWN_IDENTITY, null, 2)}\n`,
    );

    // ---- the contact sheet. A viewer, not a presentation: it shows exactly what was produced,
    // side by side with the premise that asked for it, and adds nothing of its own.
    const esc = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
      );
    const blocks = shots.map((shot) => {
      const concept = concepts.find((c) => (c.concept_index as number) + 1 === shot.index);
      const premise = artifacts.find((a) => (a.concept_index as number) + 1 === shot.index)
        ?.concept_premise as { title?: string; organizingIdea?: string } | undefined;
      return `<section>
  <h2>Concept ${shot.index}</h2>
  <dl>
    <dt>Premise title</dt><dd>${esc(premise?.title)}</dd>
    <dt>Organizing idea</dt><dd>${esc(premise?.organizingIdea)}</dd>
    <dt>Presentation name</dt><dd>${esc(concept?.name)}</dd>
    <dt>Presentation description</dt><dd>${esc(concept?.description)}</dd>
  </dl>
  <div class="shots">
    <figure><figcaption>mobile · 390</figcaption><img src="${shot.mobile}" alt=""></figure>
    <figure><figcaption>desktop · 1280</figcaption><img src="${shot.desktop}" alt=""></figure>
  </div>
</section>`;
    });
    writeFileSync(
      path.join(VIS, "index.html"),
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phase 4D live smoke — locally grown</title>
<style>
  body { margin: 0; padding: 32px; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif;
         color: #1a1a1a; background: #f6f6f4; }
  header { max-width: 60rem; margin: 0 auto 40px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  .note { color: #555; max-width: 46rem; }
  section { max-width: 96rem; margin: 0 auto 64px; padding-top: 24px;
            border-top: 1px solid #ddd; }
  h2 { font-size: 1.1rem; margin: 0 0 12px; }
  dl { display: grid; grid-template-columns: 12rem 1fr; gap: 4px 16px; margin: 0 0 20px;
       max-width: 60rem; }
  dt { color: #666; } dd { margin: 0; }
  .shots { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
  figure { margin: 0; }
  figcaption { color: #666; font-size: 13px; margin-bottom: 6px; }
  img { border: 1px solid #ccc; background: #fff; display: block; max-width: 100%; height: auto; }
  figure:first-child img { width: 390px; }
  figure:last-child img { width: 1280px; }
  @media (max-width: 1800px) { figure:last-child img { width: 900px; } }
</style></head><body>
<header>
  <h1>Phase 4D live integration smoke — locally grown baby shower</h1>
  <p class="note">Diagnostic/product evidence only; not a benchmark and no generalization claim.
  One batch, one event, run once. Each image is the exact persisted <code>ResolvedDesignSpec</code>
  rendered through the production <code>EventPage</code> renderer with its final verification
  overrides — not the raw tree and not the pre-verification spec.</p>
</header>
${blocks.join("\n")}
</body></html>
`,
    );

    await client.end();

    // The smoke's own assertion is deliberately minimal: it reports, it does not grade.
    expect(outcome.state).toBe("generated");
  },
  15 * 60_000,
);
