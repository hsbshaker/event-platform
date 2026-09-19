/**
 * The deployed QA smoke: drive the real product, on the real deployment, as a real host would.
 *
 * Every Phase-4 smoke before this one called `runConceptBatch` from a local process. That proved
 * the pipeline and proved nothing about the seam a host actually crosses — the browser, the server
 * action, `after()`, the deployed function, and whether Chromium launches inside it. This script
 * exists to cross exactly that seam and nothing else, so it clicks the same button a host clicks
 * and never imports application code.
 *
 * # What it will not do
 *
 * - **It does not weaken auth.** The session is minted by creating a preview-only identity through
 *   Supabase's admin API and then following a real magic link through the product's own
 *   `/auth/callback` route. No cookie is forged and no guard is bypassed.
 * - **It does not print secrets.** The service key is fetched into a variable, used, and never
 *   logged. No token, key or session cookie is written to the evidence directory.
 * - **It does not force anything.** The prompt is frozen; clarification happens if the real policy
 *   asks; artwork happens if a direction chooses it.
 *
 * Usage:
 *   node scripts/qa/deployed-smoke.mjs --url <deployment> --out <evidence dir> [--dry]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ENGAGEMENT_BRUNCH_PROMPT } from "./engagement-brunch-prompt.mjs";

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const BASE = (arg("url") ?? "").replace(/\/$/, "");
const OUT = arg("out") ?? "docs/model-evals/results/phase-4-qa-deployed-smoke";
const DRY = args.includes("--dry");
const PREVIEW_REF = "ihdaifbyvlvivuctkrwn";
const PRODUCTION_REF = "oirndvezdrvdnudjicdk";

if (!BASE) throw new Error("--url is required");
const SHOTS = path.join(OUT, "screenshots");

/** Every state transition this run observed, with the moment it was first seen. */
const timeline = [];
const t0 = Date.now();
const mark = (event, detail = {}) => {
  const row = { atMs: Date.now() - t0, at: new Date().toISOString(), event, ...detail };
  timeline.push(row);
  console.log(`[${String(row.atMs).padStart(6)}ms] ${event}`, JSON.stringify(detail).slice(0, 160));
  return row;
};

/* ------------------------------------------------------------------ supabase, read-only-ish */

const mgmt = async (route, init = {}) => {
  const res = await fetch(`https://api.supabase.com/v1${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok)
    throw new Error(`management ${route}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

/** SQL against the **preview** project. Refuses production by ref, on every call. */
const sql = async (query) => {
  if (PREVIEW_REF === PRODUCTION_REF) throw new Error("refusing: production ref");
  return mgmt(`/projects/${PREVIEW_REF}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
};

/**
 * The legacy `service_role` JWT.
 *
 * `CLAUDE.md §13.0`: the newer `sb_secret_…` key is rejected by PostgREST with 401, and a wrong
 * key does not announce itself. Picked by shape rather than by position in the list.
 */
async function serviceKey() {
  const keys = await mgmt(`/projects/${PREVIEW_REF}/api-keys?reveal=true`);
  const legacy = keys.find((k) => k.name === "service_role" && String(k.api_key).startsWith("eyJ"));
  if (!legacy) throw new Error("no legacy service_role JWT on the preview project");
  return legacy.api_key;
}

/* ------------------------------------------------------------------------- the run */

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  mark("start", { base: BASE, dry: DRY });

  const key = await serviceKey();
  const admin = (route, init = {}) =>
    fetch(`https://${PREVIEW_REF}.supabase.co${route}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  // ---- a preview-only identity, created through the admin API and confirmed, so the magic link
  // below is the host's ordinary first sign-in rather than a bypass.
  const email = `qa-smoke-${Date.now()}@example.test`;
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!created.ok)
    throw new Error(`create user: ${created.status} ${(await created.text()).slice(0, 300)}`);
  const user = await created.json();
  mark("qa-identity-created", { userId: user.id });

  const linkRes = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    // `redirect_to` is a top-level field on the admin endpoint, not nested under `options` —
    // nested, it is silently ignored and the link falls back to the project's `site_url`, which is
    // a different deployment entirely.
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${BASE}/auth/callback` }),
  });
  if (!linkRes.ok)
    throw new Error(`generate_link: ${linkRes.status} ${(await linkRes.text()).slice(0, 300)}`);
  const link = await linkRes.json();
  const actionLink = link.action_link ?? link.properties?.action_link;
  if (!actionLink) throw new Error("no action_link returned");

  // The environment's own Chromium, not `@sparticuz/chromium`. Outbound HTTPS here goes through
  // the agent proxy, which re-terminates TLS; the pre-installed browser trusts that CA and the
  // bundled serverless one does not, so the bundled one fails every navigation with
  // ERR_CERT_AUTHORITY_INVALID. Verification stays on either way — this picks the browser that
  // has the CA rather than turning the check off.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    // Pinned rather than resolved: the repo's `playwright-core` version does not match the
    // pre-installed browser's revision, so its own lookup asks for a download that this
    // environment deliberately does not do.
    executablePath: process.env.QA_CHROMIUM ?? "/opt/pw-browsers/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });

  const shoot = async (name, p = page) => {
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
    mark("screenshot", { name });
  };

  try {
    // ---- sign in through the product's own callback route.
    await page.goto(actionLink, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    mark("signed-in", { url: page.url().replace(/\?.*$/, "") });

    // ---- the landing composer is the prompt (`spec.md §32 #3`).
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const composer = page.locator("textarea").first();
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill(ENGAGEMENT_BRUNCH_PROMPT);
    mark("prompt-entered", { chars: ENGAGEMENT_BRUNCH_PROMPT.length });

    if (DRY) {
      mark("dry-run-stop", { note: "stopped before submitting; no model call was made" });
      await shoot("dry-prompt-entered");
      return;
    }

    await Promise.all([
      page.waitForURL(/\/events\/[0-9a-f-]{36}\/create/, { timeout: 120_000 }),
      composer.press("Enter").catch(() => page.locator("form button[type=submit]").first().click()),
    ]);
    const eventId = page.url().match(/\/events\/([0-9a-f-]{36})\//)?.[1];
    mark("event-created", { eventId });

    // ---- the identity resolves on its own; the generation CTA appears when it may.
    const startBtn = page.locator('[data-testid="generation-start"]');
    await startBtn.waitFor({ state: "visible", timeout: 180_000 });
    mark("start-cta-visible");
    await shoot("start");

    // ---- THE seam. Click, then watch what the surface does next.
    await startBtn.click();
    const clickedAt = Date.now();
    mark("start-clicked");
    await page.screenshot({
      path: path.join(SHOTS, "start-immediately-after-click.png"),
      fullPage: true,
    });

    // A surface that returned to a false idle would show the CTA again with nothing else changed.
    // This is the bug an independent review caught locally; here it is re-tested on the deployment.
    const progressed = await page
      .waitForFunction(
        () =>
          !!document.querySelector('[data-testid="generation-starting"]') ||
          !!document.querySelector('[data-testid="generation-stage-label"]') ||
          !!document.querySelector('[data-testid="concept-card-0"]'),
        { timeout: 60_000 },
      )
      .then(() => true)
      .catch(() => false);
    mark("start-produced-visible-progress", { progressed, afterMs: Date.now() - clickedAt });
    if (!progressed)
      throw new Error("the start produced no visible progress — the reviewed bug is back");

    // ---- the batch really exists server-side.
    const batchRows = await sql(
      `select id, status, round, started_at from public.generation_batches
        where event_id = '${eventId}' order by created_at desc limit 1`,
    );
    mark("batch-row", batchRows[0] ?? { none: true });

    await shoot("in-progress");

    // ---- refresh while it is genuinely in flight.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    mark("hard-refresh");
    await page.waitForTimeout(2_000);
    await shoot("after-refresh");
    const afterRefresh = await sql(
      `select count(*)::int as batches from public.generation_batches where event_id = '${eventId}'`,
    );
    mark("batches-after-refresh", afterRefresh[0]);

    // ---- watch the read model until it settles, recording each distinct state.
    let last = "";
    const deadline = Date.now() + 8 * 60_000;
    while (Date.now() < deadline) {
      const rows = await sql(
        `select s.concept_index, s.status,
                (select count(*) from public.resolved_design_specs r
                   join public.design_concepts c on c.id = r.concept_id
                  where c.event_id = '${eventId}' and c.concept_index = s.concept_index
                    and r.verified_clean) as verified
           from public.generation_batch_siblings s
           join public.generation_batches b on b.id = s.batch_id
          where b.event_id = '${eventId}' order by s.concept_index`,
      );
      const shape = JSON.stringify(rows);
      if (shape !== last) {
        mark("siblings", { rows });
        last = shape;
      }
      if (rows.length > 0 && rows.every((r) => r.status === "succeeded" || r.status === "failed"))
        break;
      await new Promise((r) => setTimeout(r, 3_000));
    }

    // ---- the concepts, through the real preview route, at both authoritative widths.
    const concepts = await sql(
      `select c.concept_index, c.name, c.description, r.verified_clean,
              (r.spec->'verified'->'mobile'->>'pageOverflow') as mobile_overflow,
              (r.spec->'verified'->'desktop'->>'pageOverflow') as desktop_overflow
         from public.design_concepts c
         join public.resolved_design_specs r on r.id = c.active_resolved_spec_id
        where c.event_id = '${eventId}' order by c.concept_index`,
    );
    mark("concepts", { concepts });

    for (const c of concepts) {
      const n = c.concept_index + 1;
      for (const [label, width] of [
        ["mobile", 390],
        ["desktop", 1280],
      ]) {
        const p = await ctx.newPage();
        await p.setViewportSize({ width, height: 900 });
        await p.goto(`${BASE}/events/${eventId}/concepts/${c.concept_index}`, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await p.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => {});
        await p.waitForTimeout(800);
        const box = await p.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasEventPage: !!document.querySelector(".ev-page, [class*='ev-']"),
          images: document.images.length,
        }));
        mark("concept-preview", { concept: n, label, width, ...box });
        await shoot(`concept-${n}-${label}`, p);
        await p.close();
      }
    }

    // ---- access control: a signed-out browser must not reach an unselected concept.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    const anonRes = await anonPage.goto(`${BASE}/events/${eventId}/concepts/0`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    mark("anonymous-preview-access", { status: anonRes?.status() ?? null, url: anonPage.url() });
    await anon.close();

    // ---- what it cost, and what the providers actually did.
    const runs = await sql(
      `select operation, concept_index, success, latency_ms, input_tokens, cached_input_tokens,
              output_tokens, reasoning_tokens, reprompts, fallback
         from public.generation_runs where event_id = '${eventId}' order by created_at`,
    );
    const slots = await sql(
      `select a.slot_id, a.status, a.cost_estimate_usd from public.resolved_spec_artwork_slots a
         join public.resolved_design_specs r on r.id = a.resolved_spec_id
         join public.design_concepts c on c.id = r.concept_id
        where c.event_id = '${eventId}'`,
    );
    mark("provider-runs", { count: runs.length, artworkSlots: slots.length });

    writeFileSync(
      path.join(OUT, "provider-telemetry.jsonl"),
      runs.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    writeFileSync(
      path.join(OUT, "run-summary.json"),
      JSON.stringify({ eventId, concepts, runs, slots, consoleErrors }, null, 2) + "\n",
    );
  } finally {
    writeFileSync(
      path.join(OUT, "generation-timeline.jsonl"),
      timeline.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    writeFileSync(path.join(OUT, "raw-prompt.txt"), ENGAGEMENT_BRUNCH_PROMPT + "\n");
    await browser.close();
  }
}

main().catch((e) => {
  mark("fatal", { error: String(e).slice(0, 400) });
  writeFileSync(
    path.join(OUT, "generation-timeline.jsonl"),
    timeline.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  console.error(e);
  process.exit(1);
});
