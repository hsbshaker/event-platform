/**
 * Phase 4G — the whole creative system, from a raw host prompt, once.
 *
 * Every smoke before this one started downstream of interpretation: 4D and 4E both replayed a
 * frozen `EventIdentity` fixture so that the stage under test was the only variable. 4G starts
 * where a host starts. The input is `MEDITERRANEAN_SHOWER_PROMPT` and nothing else — no fixture,
 * no spent eval case, no pre-decided identity — so the interpreter, the clarification policy, the
 * planner, three premises, three intents, three compositions, the compiler, the optionality
 * decision, artwork where a direction asked for it, geometry verification and the generation read
 * model are all in the run together, for the first time.
 *
 * # What this harness will not do
 *
 * - **It runs once.** No second seed, no second batch, no rerun after looking at the output.
 * - **It forces nothing.** Clarification happens if the real policy asks for it; artwork happens
 *   if a direction chooses it. Neither is arranged, and a run where the model declines both is a
 *   result rather than a failed setup.
 * - **It scores nothing.** No beauty, wow, originality, personalization or winner. Those are the
 *   operator's questions and the contact sheet puts them next to the pictures unanswered. No model
 *   is asked to judge the output.
 *
 * # The one place a human decision is simulated, and how it is recorded
 *
 * A boundary clarification question blocks the identity from becoming authoritative
 * (`spec.md §7.6b`), and the pipeline cannot continue until a host answers it. If one is asked,
 * this harness answers it by choosing the option whose text the frozen prompt most directly
 * supports, and records the question, every option and the choice verbatim in
 * `clarification/decision.json` so the operator can see exactly what was decided on their behalf.
 * A creative question does not gate, so an unanswered one is left unanswered: watching rather than
 * answering is a legitimate host choice and the least interventionist one available.
 *
 * Spend: text is bounded by the existing per-event controls; images by a $1.50 batch ceiling and
 * an 8-attempt bound, both passed in explicitly here (`artwork-stage.ts` has no defaults).
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation`; `§31 — Event Identity and
 * diversity`; `§31 — DesignIntent, composition and compiler`; `§31 — Renderer proof`.
 * Guardrails: `spec.md §32 #4`, `#20`, `#21`, `#32`, `#41`, `#45`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import { runConceptBatch } from "@/lib/generation/concept-batch";
import { deriveEventContent } from "@/lib/generation/event-content";
import { runEventIdentity } from "@/lib/generation/identity-orchestrator";
import { readGenerationState } from "@/lib/generation/generation-state";
import type { GenerationView } from "@/lib/generation/generation-view";
import { ArtworkAttemptBudget } from "@/lib/generation/artwork-stage";
import { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";
import { createOpenAiArtworkProvider } from "@/lib/ai/openai/artwork";
import { measureArtwork } from "@/lib/ai/visual-art/metrics";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify/result";
import type { ArtworkAssets } from "@/components/event-renderer/artwork";

import { MEDITERRANEAN_SHOWER_PROMPT } from "./mediterranean-shower-prompt";
import { renderConcepts, type RenderJob } from "./render-concepts";
import { diagnosticArtworkStore } from "./diagnostic-artwork-store";
import { contactSheet4g, type ContactConcept } from "./contact-sheet-4g";
import { supabaseShim } from "../../tests/db/supabase-shim";
import { withWrites } from "./pg-supabase-writes";

/** Pinned and dated. An empirical Phase 4 choice, not a provider selection — see §12 of the plan. */
const IMAGE_MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const IMAGE_CEILING_USD = 1.5;
/**
 * Reserved per request, well above the $0.05491 the capability spike actually cost. A reservation
 * is a promise not to overspend, so it is deliberately pessimistic: six of these exhaust the
 * ceiling, which is also the most slots three concepts can reserve.
 */
const IMAGE_PER_REQUEST_USD = 0.25;
const MAX_IMAGE_ATTEMPTS = 8;

const OUT = path.resolve("docs/model-evals/results/phase-4g-e2e-mediterranean-shower");
const VIS = path.join(OUT, "visuals");
const CONCEPTS = path.join(OUT, "concepts");
const ART = path.join(OUT, "artwork");
const INTENTS = path.join(OUT, "artwork-intents");
const TELEMETRY = path.join(OUT, "telemetry");
const CLARIFICATION = path.join(OUT, "clarification");

const LIVE = process.env.SMOKE_LIVE === "1";

/** How often the state timeline is sampled while the batch runs. Evidence, never a control. */
const SAMPLE_MS = 750;

/* ------------------------------------------------------------------ spend arithmetic */

const GPT_5_6_SOL = {
  longContextThresholdTokens: 128_000,
  standard: { input: 1.25, cachedInput: 0.125, cacheWriteInput: 1.5625, output: 10 },
  longContext: { input: 2.5, cachedInput: 0.25, cacheWriteInput: 3.125, output: 20 },
} as const;

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

/* ------------------------------------------------------------------ clarification */

interface AskedQuestion {
  index: number;
  kind: "creative" | "boundary";
  question: string;
  options: { label: string; isDefer: boolean }[];
}

/**
 * Choose a boundary answer from the host's own words.
 *
 * Scored on how much of an option's text the frozen prompt already contains, so the answer is
 * traceable to something the host wrote rather than to this harness's taste. The score and every
 * option are recorded, so a reader can disagree with the choice and see exactly what it was.
 */
function chooseFromPrompt(options: readonly { label: string; isDefer: boolean }[]): {
  label: string;
  scores: { label: string; score: number; matched: string[] }[];
} {
  const prompt = MEDITERRANEAN_SHOWER_PROMPT.toLowerCase();
  const scores = options.map((option) => {
    const words = option.label
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3);
    const matched = words.filter((w) => prompt.includes(w));
    return { label: option.label, score: words.length === 0 ? 0 : matched.length, matched };
  });
  const best = [...scores].sort((a, b) => b.score - a.score)[0];
  return { label: best?.label ?? options[0].label, scores };
}

/* ------------------------------------------------------------------------- the smoke */

it(
  "turns one raw host prompt into three verified concept sites",
  async () => {
    const startedAt = new Date();
    for (const dir of [VIS, CONCEPTS, ART, INTENTS, TELEMETRY, CLARIFICATION]) {
      mkdirSync(dir, { recursive: true });
    }

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    const admin = withWrites(client, supabaseShim(client)) as SupabaseClient<Database>;

    // ---- seed: an owner and an event carrying the frozen prompt, and nothing else. No identity,
    // no supplied facts, no details. Everything downstream has to come from those words.
    const who = `smoke4g-owner-${startedAt.getTime()}@example.test`;
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
      [ownerId, MEDITERRANEAN_SHOWER_PROMPT],
    );
    const eventId = events[0].id as string;

    writeFileSync(path.join(OUT, "raw-prompt.txt"), `${MEDITERRANEAN_SHOWER_PROMPT}\n`);

    /* ---------------------------------------------------------- stage 1: interpretation */

    const identityStartedAt = Date.now();
    let identity = await runEventIdentity(admin, { eventId, userId: ownerId });
    const identityMs = Date.now() - identityStartedAt;

    const clarificationRounds: Record<string, unknown>[] = [];
    // `spec.md §7.6b`: a boundary question blocks; a creative one never does. So the loop condition
    // is the authoritative flag, not the presence of questions — and a run whose only questions are
    // creative leaves them unanswered and proceeds, which is what a host who keeps watching does.
    let guard = 0;
    while (!identity.hasAuthoritativeIdentity && guard < 4) {
      guard += 1;
      const open = (identity.questions ?? []).map((q) => ({
        index: q.index,
        kind: q.question.kind,
        question: q.question.question,
        options: q.question.options.map((o) => ({ label: o.label, isDefer: o.isDefer })),
      })) as AskedQuestion[];
      if (open.length === 0) break;

      const answers = open.map((q) => {
        const chosen = chooseFromPrompt(q.options);
        return { question: q, chosen };
      });
      clarificationRounds.push({
        round: identity.revision,
        state: identity.state,
        asked: open,
        answered: answers.map((a) => ({
          index: a.question.index,
          chose: a.chosen.label,
          scoredAgainstPrompt: a.chosen.scores,
        })),
        note:
          "Answered by the harness, not by a host. Each choice is the option whose words the " +
          "frozen prompt most directly supports; every option and its score is recorded so the " +
          "decision is auditable rather than hidden.",
      });

      const { rows: revisions } = await client.query(
        `select id, revision from public.event_identity_revisions
          where event_id = $1 order by revision desc limit 1`,
        [eventId],
      );
      const latest = revisions[0];
      await client.query(
        `insert into public.clarification_answers
           (event_id, identity_revision_id, question_index, round, kind, question_text, options,
            selected_option_label, free_text, is_defer, answered_by)
         select $1, $2, x.idx, $3, x.kind, x.q, x.opts, x.sel, null, false, $4
           from jsonb_to_recordset($5::jsonb)
             as x(idx int, kind text, q text, opts jsonb, sel text)`,
        [
          eventId,
          latest.id,
          latest.revision,
          ownerId,
          JSON.stringify(
            answers.map((a) => ({
              idx: a.question.index,
              kind: a.question.kind,
              q: a.question.question,
              opts: a.question.options,
              sel: a.chosen.label,
            })),
          ),
        ],
      );
      identity = await runEventIdentity(admin, { eventId, userId: ownerId });
    }

    const { rows: identityRows } = await client.query(
      `select id, revision, result, prompt_version, schema_version, input_assembly_version,
              provider, model, created_at
         from public.event_identity_revisions where event_id = $1 order by revision`,
      [eventId],
    );
    const authoritative = identityRows[identityRows.length - 1];
    writeFileSync(
      path.join(OUT, "event-identity.json"),
      `${JSON.stringify(
        {
          revisions: identityRows.length,
          state: identity.state,
          hasAuthoritativeIdentity: identity.hasAuthoritativeIdentity,
          latencyMs: identityMs,
          promptVersion: authoritative?.prompt_version,
          schemaVersion: authoritative?.schema_version,
          inputAssemblyVersion: authoritative?.input_assembly_version,
          result: authoritative?.result,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      path.join(CLARIFICATION, "decision.json"),
      `${JSON.stringify(
        {
          askedAtAll: clarificationRounds.length > 0,
          rounds: clarificationRounds,
          finalState: identity.state,
          hasAuthoritativeIdentity: identity.hasAuthoritativeIdentity,
          note:
            clarificationRounds.length === 0
              ? "The real policy asked nothing. No clarification was forced."
              : "Boundary questions block generation, so they were answered; see each round.",
        },
        null,
        2,
      )}\n`,
    );

    if (!identity.hasAuthoritativeIdentity) {
      // Nothing downstream may consume a provisional identity (`spec.md §7.7`). Recording the
      // state and stopping is the honest end of the run, not a failure to work around.
      writeFileSync(
        path.join(OUT, "run-summary.json"),
        `${JSON.stringify(
          {
            label: "Phase 4G end-to-end — stopped at interpretation.",
            live: LIVE,
            startedAt: startedAt.toISOString(),
            identity: { state: identity.state, hasAuthoritativeIdentity: false },
          },
          null,
          2,
        )}\n`,
      );
      await client.end();
      return;
    }

    /* ---------------------------------------------- stage 2: three concepts, with a timeline */

    const budget = ArtworkBatchBudget.open({
      id: `phase4g-${startedAt.getTime()}`,
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

    // The 4F read model, sampled on a timer while the batch runs. This is the evidence for the one
    // property a finished run cannot show: that concepts became available one at a time rather than
    // all at the end (`spec.md §31` — "no concept waits on its siblings").
    const timeline: { atMs: number; view: GenerationView }[] = [];
    let sampling = true;
    const t0 = Date.now();
    const sampler = (async () => {
      while (sampling) {
        try {
          timeline.push({ atMs: Date.now() - t0, view: await readGenerationState(admin, eventId) });
        } catch {
          // A sample that fails is a missing observation, never a reason to disturb the run.
        }
        await new Promise((r) => setTimeout(r, SAMPLE_MS));
      }
    })();

    const outcome = await runConceptBatch(admin, {
      eventId,
      userId: ownerId,
      artwork: { provider, budget, attempts, store },
    });
    sampling = false;
    await sampler;
    const wallMs = Date.now() - t0;
    timeline.push({ atMs: wallMs, view: await readGenerationState(admin, eventId) });

    /* ------------------------------------------------------------------ read everything back */

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
              primitive_set_version, compiler_version
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

    // The same narrow column list `concept-batch.ts` reads, for the same reason: a widening select
    // would hand the derivation the prompt, the access code and the spend counters, and
    // `docs/model-contracts.md §6.1` is cheapest to honour by not loading them.
    const { rows: eventRows } = await client.query(
      `select title, description, hosts, baby_name, venue_name, address, event_date, start_time,
              timezone, rsvp_deadline
         from public.events where id = $1`,
      [eventId],
    );
    // The same clock the batch compiled against, so a provisional date rendered here is the one the
    // spec was fitted to rather than one that drifted while the run was in flight.
    const content = deriveEventContent(eventRows[0] as never, startedAt);

    /* -------------------------------------------------------------------- artwork evidence */

    const assetsBySpec = new Map<string, Record<string, ArtworkAssets[string]>>();
    const artworkEvidence: Record<string, unknown>[] = [];
    for (const row of slotRows) {
      const index = (row.concept_index as number) + 1;
      const slotSafe = String(row.slot_id)
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      writeFileSync(
        path.join(INTENTS, `concept-${index}-slot-${slotSafe}.json`),
        `${JSON.stringify(row.visual_art_intent, null, 2)}\n`,
      );
      let metrics = null;
      if (row.status === "delivered" && row.storage_path) {
        const { readFileSync, copyFileSync } = await import("node:fs");
        const file = path.join(ART, String(row.storage_path));
        const bytes = new Uint8Array(readFileSync(file));
        const intent = row.visual_art_intent as { paletteHexes?: string[] };
        metrics = measureArtwork(bytes, intent.paletteHexes ?? []);
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
        latencyMs: row.latency_ms,
        costEstimateUsd: row.cost_estimate_usd,
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

    /* ------------------------------------------------------------------------- the renders */

    const jobs: RenderJob[] = [];
    for (const row of specs) {
      const spec = row.spec as ResolvedDesignSpec;
      const n = (row.concept_index as number) + 1;
      const assets = (assetsBySpec.get(String(row.id)) ?? {}) as ArtworkAssets;
      jobs.push({ name: `concept-${n}`, spec, content, assets });
      if (Object.keys(assets).length > 0) {
        // Same spec, same reservations, assets detached: the only way to isolate what generated
        // artwork contributed, and the check that attaching one did not move the page.
        jobs.push({ name: `concept-${n}-no-art`, spec, content, assets: {} });
      }
    }
    const pageSizes = await renderConcepts(jobs, VIS);

    /* ---------------------------------------------------------------------------- evidence */

    const write = (file: string, value: unknown) =>
      writeFileSync(path.join(OUT, file), `${JSON.stringify(value, null, 2)}\n`);

    write(
      "concept-premises.json",
      artifacts.map((a) => ({ index: a.concept_index, premise: a.concept_premise })),
    );
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
      path.join(TELEMETRY, "text-provider.jsonl"),
      `${runs.map((r) => JSON.stringify(r)).join("\n")}\n`,
    );
    writeFileSync(
      path.join(TELEMETRY, "artwork-provider.jsonl"),
      artworkEvidence.length === 0
        ? ""
        : `${artworkEvidence.map((a) => JSON.stringify(a)).join("\n")}\n`,
    );
    writeFileSync(
      path.join(TELEMETRY, "generation-state.jsonl"),
      `${timeline.map((t) => JSON.stringify(t)).join("\n")}\n`,
    );

    const textCost = runs.reduce((sum, r) => sum + priceRun(r as never), 0);
    const imageCost = slotRows.reduce((sum, r) => sum + Number(r.cost_estimate_usd ?? 0), 0);
    const latencyOf = (op: string) =>
      runs.filter((r) => r.operation === op).map((r) => r.latency_ms as number);

    // When each concept first became previewable, read off the sampled timeline. The whole point
    // of `spec.md §7.10 #5` is that these differ.
    const firstPreviewableMs: Record<number, number | null> = {};
    for (const spec of specs) {
      const index = spec.concept_index as number;
      const hit = timeline.find((t) =>
        t.view.concepts.some((c) => c.index === index && c.previewable),
      );
      firstPreviewableMs[index] = hit ? hit.atMs : null;
    }

    write("run-summary.json", {
      label:
        "Phase 4G end-to-end creative smoke — Mediterranean shower, from the raw host prompt. " +
        "Diagnostic/product evidence only. Not a benchmark, not scored, one run.",
      live: LIVE,
      startedAt: startedAt.toISOString(),
      wallMs,
      outcomeState: outcome.state,
      prompt: { file: "raw-prompt.txt", chars: MEDITERRANEAN_SHOWER_PROMPT.length },
      identity: {
        state: identity.state,
        revisions: identityRows.length,
        latencyMs: identityMs,
        clarificationAsked: clarificationRounds.length > 0,
        clarificationRounds: clarificationRounds.length,
      },
      providerCalls: {
        text: runs.length,
        byOperation: runs.reduce<Record<string, number>>((acc, r) => {
          acc[String(r.operation)] = (acc[String(r.operation)] ?? 0) + 1;
          return acc;
        }, {}),
        image: {
          attempted: attempts.spent,
          limit: MAX_IMAGE_ATTEMPTS,
          delivered: slotRows.filter((r) => r.status === "delivered").length,
          failed: slotRows.filter((r) => r.status === "failed").length,
        },
      },
      latencyMs: {
        eventIdentity: identityMs,
        conceptPremise: latencyOf("concept_premise"),
        designIntent: latencyOf("design_intent"),
        composition: latencyOf("composition"),
        artwork: slotRows.map((r) => r.latency_ms),
        firstPreviewableMs,
      },
      spend: {
        textUsd: Number(textCost.toFixed(6)),
        imageUsd: Number(imageCost.toFixed(6)),
        totalUsd: Number((textCost + imageCost).toFixed(6)),
        imageCeilingUsd: IMAGE_CEILING_USD,
        imagePerRequestReservationUsd: IMAGE_PER_REQUEST_USD,
        budget: budget.state(),
      },
      artworkStore: { id: store.id, supabaseUploadExercised: false },
      imageProvider: { provider: "openai-images", model: IMAGE_MODEL },
      concepts: concepts.map((row) => ({
        index: row.concept_index,
        name: row.name,
        description: row.description,
        compositionHash: row.composition_hash,
        fallback: row.fallback,
        specId: row.active_resolved_spec_id,
      })),
      resolvedSpecs: specs.map((row) => ({
        conceptIndex: row.concept_index,
        id: row.id,
        revision: row.revision,
        verifiedClean: row.verified_clean,
        verified: (row.spec as ResolvedDesignSpec).verified,
      })),
      pageSizes,
      content: content as unknown as Json,
    });

    /* ----------------------------------------------------------------- the contact sheet */

    const identityResult = (authoritative?.result ?? {}) as {
      identity?: { creativeDirection?: string; toneKeywords?: string[] };
    };
    const contactConcepts: ContactConcept[] = concepts.map((row) => {
      const index = row.concept_index as number;
      const n = index + 1;
      const artifact = artifacts.find((a) => a.concept_index === index);
      const presentation = (artifact?.presentation ?? {}) as {
        name?: string;
        description?: string;
      };
      const premise = (artifact?.concept_premise ?? {}) as {
        title?: string;
        organizingIdea?: string;
      };
      const intent = (artifact?.design_intent ?? {}) as {
        family?: string;
        density?: string;
        motifs?: string[];
        typographyPairing?: string;
        composition?: { ornament?: string };
      };
      const spec = specs.find((s2) => s2.concept_index === index);
      const resolved = spec?.spec as ResolvedDesignSpec | undefined;
      // The compiled semantic palette, flattened to the hexes it actually resolved to. Read off
      // the spec rather than off the DesignIntent, because the creative palette is a request and
      // the semantic one is what the page is (`spec.md §32 #26`).
      const palette = resolved
        ? [
            ...new Set(
              Object.values(resolved.tokens.palette as unknown as Record<string, unknown>).filter(
                (v): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v),
              ),
            ),
          ]
        : [];
      const mine = artworkEvidence.filter((a) => a.conceptIndex === index);
      const hasArt = mine.some((a) => a.status === "delivered");
      return {
        index,
        name: row.name as string,
        description: row.description as string,
        premiseTitle: premise.title ?? null,
        premiseIdea: premise.organizingIdea ?? null,
        creativeDirection: identityResult.identity?.creativeDirection ?? null,
        family: intent.family ?? null,
        density: intent.density ?? null,
        ornament: intent.composition?.ornament ?? null,
        typography: intent.typographyPairing ?? null,
        palette,
        vocabulary: intent.motifs ?? [],
        artwork: mine.map((a) => ({
          slotId: String(a.slotId),
          role: String(a.role),
          status: String(a.status),
          file: (a.evidenceFile as string | null) ?? null,
          failure: a.failure ? String((a.failure as { kind: string }).kind) : null,
          widthPx: (a.recorded as { widthPx?: number | null }).widthPx ?? null,
          heightPx: (a.recorded as { heightPx?: number | null }).heightPx ?? null,
        })),
        mobile: `concept-${n}-mobile.png`,
        desktop: `concept-${n}-desktop.png`,
        noArtMobile: hasArt ? `concept-${n}-no-art-mobile.png` : null,
        noArtDesktop: hasArt ? `concept-${n}-no-art-desktop.png` : null,
        geometryClean: spec?.verified_clean === true,
        mobileSize: pageSizes[`concept-${n}-mobile`],
        desktopSize: pageSizes[`concept-${n}-desktop`],
      };
    });

    const reprompts = runs.reduce<Record<string, number>>((acc, r) => {
      const spent = (r.reprompts ?? {}) as Record<string, number>;
      for (const [kind, n] of Object.entries(spent)) {
        if (typeof n === "number" && n > 0) acc[kind] = (acc[kind] ?? 0) + n;
      }
      return acc;
    }, {});

    writeFileSync(
      path.join(VIS, "index.html"),
      contactSheet4g(
        contactConcepts,
        {
          wallMs,
          identityMs,
          clarificationAsked: clarificationRounds.length > 0,
          clarificationRounds: clarificationRounds.length,
          premiseMs: latencyOf("concept_premise"),
          designIntentMs: latencyOf("design_intent"),
          compositionMs: latencyOf("composition"),
          artworkMs: slotRows.map((r) => (r.latency_ms as number | null) ?? null),
          textCalls: runs.length,
          textByOperation: runs.reduce<Record<string, number>>((acc, r) => {
            acc[String(r.operation)] = (acc[String(r.operation)] ?? 0) + 1;
            return acc;
          }, {}),
          imageAttempted: attempts.spent,
          imageLimit: MAX_IMAGE_ATTEMPTS,
          imageDelivered: slotRows.filter((r) => r.status === "delivered").length,
          imageFailed: slotRows.filter((r) => r.status === "failed").length,
          reprompts,
          textUsd: textCost,
          imageUsd: imageCost,
          imageCeilingUsd: IMAGE_CEILING_USD,
          totalUsd: textCost + imageCost,
          firstPreviewableMs,
          storeId: store.id,
          imageModel: IMAGE_MODEL,
          textModel: String(runs[0]?.model ?? "unknown"),
        },
        {
          creativeDirection: identityResult.identity?.creativeDirection ?? null,
          tone: identityResult.identity?.toneKeywords ?? [],
        },
      ),
    );

    await client.end();
  },
  30 * 60_000,
);
