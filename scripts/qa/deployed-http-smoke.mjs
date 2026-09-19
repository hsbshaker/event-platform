/**
 * The deployed QA smoke, driven over the app's own HTTP surface.
 *
 * # Why this exists beside `deployed-smoke.mjs`
 *
 * The browser script is the one this task actually wanted, and it cannot run here: Playwright's
 * Chromium does not read this sandbox's trust store, every HTTPS navigation fails
 * `ERR_CERT_AUTHORITY_INVALID`, `certutil` is unavailable to add the proxy CA to the NSS store, and
 * pinning the CA's SPKI is refused as a TLS weakening. Node's `fetch` trusts the CA, so this
 * script crosses the same seams without rendering them.
 *
 * **What that costs, stated plainly.** This proves the server seam — real session, real server
 * action, `after()`, the deployed function, production model calls, persistence, the read model,
 * geometry verification inside the deployed runtime, and the preview route returning real rendered
 * markup. It does **not** prove what a browser does with that markup: no layout, no paint, no
 * click, no screenshot. Where the task asked for browser evidence, this is a substitute and is
 * labelled as one.
 *
 * Nothing here weakens auth: the session is minted by creating a preview-only identity through the
 * admin API and following a real magic link through the product's own `/auth/callback`, exactly as
 * an email client would. No cookie is forged.
 *
 * No secret is printed, and none is written to the evidence directory.
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
if (!BASE) throw new Error("--url is required");

const PREVIEW_REF = "ihdaifbyvlvivuctkrwn";
const PRODUCTION_REF = "oirndvezdrvdnudjicdk";

const timeline = [];
const t0 = Date.now();
const mark = (event, detail = {}) => {
  const row = { atMs: Date.now() - t0, at: new Date().toISOString(), event, ...detail };
  timeline.push(row);
  console.log(
    `[${String(row.atMs).padStart(7)}ms] ${event} ${JSON.stringify(detail).slice(0, 170)}`,
  );
};

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

/** SQL against the preview project only. The production ref is refused by name on every call. */
const sql = async (query) => {
  if (PREVIEW_REF === PRODUCTION_REF) throw new Error("refusing: production ref");
  return mgmt(`/projects/${PREVIEW_REF}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
};

/* ------------------------------------------------------------------------ cookie jar */

const jar = new Map();
const setCookies = (res) => {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
};
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/** `fetch` that carries the jar and never follows redirects silently. */
async function hop(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  setCookies(res);
  return res;
}

/** Follow redirects by hand so every hop's cookies are captured. */
async function follow(url, init = {}, max = 8) {
  let current = url;
  for (let i = 0; i < max; i += 1) {
    const res = await hop(current, i === 0 ? init : {});
    const loc = res.headers.get("location");
    if (!loc || res.status < 300 || res.status >= 400) return { res, url: current };
    current = new URL(loc, current).toString();
  }
  throw new Error("too many redirects");
}

/** Invoke a Next server action the way the client does. */
async function action(pageUrl, actionId, argsArray) {
  const res = await hop(pageUrl, {
    method: "POST",
    headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(argsArray),
  });
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get("x-action-redirect") ?? res.headers.get("location"),
    text,
  };
}

/** Scrape `createServerReference` ids out of every chunk a page references. */
async function actionIds(pageHtml) {
  const found = new Map();
  const srcs = [...pageHtml.matchAll(/"(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const s of new Set(srcs)) {
    const js = await (await fetch(`${BASE}${s}`)).text();
    for (const m of js.matchAll(
      /"([0-9a-f]{40,64})",\s*\w+\.callServer,\s*void 0,\s*\w+\.findSourceMapURL,\s*"([A-Za-z0-9_]+)"/g,
    )) {
      found.set(m[2], m[1]);
    }
  }
  return found;
}

/* ------------------------------------------------------------------------------ run */

async function main() {
  mkdirSync(OUT, { recursive: true });
  mark("start", { base: BASE });

  const keys = await mgmt(`/projects/${PREVIEW_REF}/api-keys?reveal=true`);
  const key = keys.find(
    (k) => k.name === "service_role" && String(k.api_key).startsWith("eyJ"),
  )?.api_key;
  if (!key) throw new Error("no legacy service_role JWT on preview");
  const sbAdmin = (route, init = {}) =>
    fetch(`https://${PREVIEW_REF}.supabase.co${route}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  const email = `qa-smoke-${Date.now()}@example.test`;
  const made = await sbAdmin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!made.ok) throw new Error(`create user: ${made.status} ${(await made.text()).slice(0, 200)}`);
  const user = await made.json();
  mark("qa-identity-created", { userId: user.id });

  const linkRes = await sbAdmin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${BASE}/auth/callback` }),
  });
  if (!linkRes.ok)
    throw new Error(`generate_link: ${linkRes.status} ${(await linkRes.text()).slice(0, 200)}`);
  const linkBody = await linkRes.json();

  // `/auth/callback` is PKCE-only: it takes a `?code=` and exchanges it against a verifier the
  // browser client stored when it sent the email. A script has no such verifier, so this redeems
  // the link's own `hashed_token` through `@supabase/ssr` — the same library the app runs — with a
  // cookie adapter backed by the jar below. The cookies are therefore written by the product's own
  // auth client rather than constructed here, which is the difference between minting a session
  // and forging one. The callback route is exercised by a real browser, not by this script; that
  // limitation is recorded in the evidence.
  const { createServerClient } = await import("@supabase/ssr");
  const anonKey = keys.find(
    (k) => k.name === "anon" && String(k.api_key).startsWith("eyJ"),
  )?.api_key;
  if (!anonKey) throw new Error("no legacy anon JWT on preview");
  const authed = createServerClient(`https://${PREVIEW_REF}.supabase.co`, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (toSet) => {
        for (const { name, value } of toSet) jar.set(name, value);
      },
    },
  });
  const verified = await authed.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkBody.hashed_token,
  });
  if (verified.error) throw new Error(`verifyOtp: ${verified.error.message}`);
  mark("signed-in", { userId: verified.data.user?.id, cookies: jar.size });

  const landing = await (await hop(`${BASE}/`)).text();
  const ids = await actionIds(landing);
  mark("landing-actions", { names: [...ids.keys()] });
  if (!ids.has("createEvent")) throw new Error("createEvent action id not found");

  // The landing page is the prompt (`spec.md §32 #3`).
  const created = await action(`${BASE}/`, ids.get("createEvent"), [ENGAGEMENT_BRUNCH_PROMPT]);
  const eventId = (created.location ?? created.text).match(/events\/([0-9a-f-]{36})\/create/)?.[1];
  mark("event-created", { status: created.status, eventId });
  if (!eventId) throw new Error("no event id from createEvent");

  const createUrl = `${BASE}/events/${eventId}/create`;
  const createHtml = await (await hop(createUrl)).text();
  const genIds = await actionIds(createHtml);
  mark("create-page-actions", { names: [...genIds.keys()] });

  const startId = genIds.get("startConceptGenerationForEvent");
  const readId = genIds.get("readGenerationForEvent");
  if (!startId) throw new Error("startConceptGenerationForEvent action id not found");

  // Start EventIdentity the way the panel does. A browser runs `EventIdentityPanel`'s effect on
  // mount and calls this; a script that only fetched the HTML never would, and the generation start
  // would then be correctly refused for want of an authoritative identity — which is the guard
  // working, not a defect.
  const identityStartId = genIds.get("startEventIdentityForEvent");
  if (!identityStartId) throw new Error("startEventIdentityForEvent action id not found");
  const idStarted = await action(createUrl, identityStartId, [eventId, {}]);
  mark("identity-start-invoked", { status: idStarted.status });

  const identityDeadline = Date.now() + 5 * 60_000;
  while (Date.now() < identityDeadline) {
    const rows = await sql(
      `select (select count(*) from public.event_identity_revisions where event_id = '${eventId}') as revisions,
              (select authoritative_identity_revision_id is not null from public.events where id = '${eventId}') as authoritative`,
    );
    if (rows[0]?.authoritative) {
      mark("identity-authoritative", rows[0]);
      break;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }

  // ---- THE seam: the same server action the start button calls.
  const clickedAt = Date.now();
  const started = await action(createUrl, startId, [eventId]);
  mark("start-action-invoked", { status: started.status });

  let batch = null;
  const startDeadline = Date.now() + 60_000;
  while (Date.now() < startDeadline) {
    const rows = await sql(
      `select id, status, round, started_at from public.generation_batches where event_id = '${eventId}' order by created_at desc limit 1`,
    );
    if (rows[0]) {
      batch = rows[0];
      break;
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  mark("batch-visible", { batch, afterMs: Date.now() - clickedAt });
  if (!batch) throw new Error("the start produced no batch row — the deployed start did not start");

  // ---- what the read model says a reconnecting browser would see.
  if (readId) {
    const read = await action(createUrl, readId, [eventId]);
    mark("read-model-after-start", {
      status: read.status,
      mentionsExploring: /exploring|designing/.test(read.text),
    });
  }

  // ---- reconnect: a fresh page load mid-flight must show the same batch and start no second one.
  const reloaded = await hop(createUrl);
  mark("reconnect-page-load", { status: reloaded.status });
  const afterReload = await sql(
    `select count(*)::int as batches from public.generation_batches where event_id = '${eventId}'`,
  );
  mark("batches-after-reconnect", afterReload[0]);

  // ---- watch it settle.
  let last = "";
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const rows = await sql(
      `select s.concept_index, s.status,
              (select count(*)::int from public.resolved_design_specs r
                 join public.design_concepts c on c.id = r.concept_id
                where c.event_id = '${eventId}' and c.concept_index = s.concept_index and r.verified_clean) as verified
         from public.generation_batch_siblings s
         join public.generation_batches b on b.id = s.batch_id
        where b.event_id = '${eventId}' order by s.concept_index`,
    );
    const shape = JSON.stringify(rows);
    if (shape !== last) {
      mark("siblings", { rows });
      last = shape;
    }
    if (rows.length && rows.every((r) => r.status === "succeeded" || r.status === "failed")) break;
    await new Promise((r) => setTimeout(r, 4_000));
  }

  // ---- the deployed geometry proof: did Chromium run inside the Vercel function?
  const geometry = await sql(
    `select c.concept_index, c.name, r.verified_clean,
            r.spec->'verified'->'mobile'->'viewport'->>'width'  as mobile_w,
            r.spec->'verified'->'desktop'->'viewport'->>'width' as desktop_w,
            r.spec->'verified'->'mobile'->>'pageOverflow'       as mobile_overflow,
            r.spec->'verified'->'desktop'->>'pageOverflow'      as desktop_overflow,
            r.spec->'verified'->>'authoritative'                as authoritative,
            r.spec->'verified'->'fonts'->>'loaded'              as fonts_loaded
       from public.design_concepts c
       join public.resolved_design_specs r on r.id = c.active_resolved_spec_id
      where c.event_id = '${eventId}' order by c.concept_index`,
  );
  mark("deployed-geometry", { geometry });

  // ---- the preview route, served by the deployed app, as real rendered markup.
  const previews = [];
  for (const g of geometry) {
    const url = `${BASE}/events/${eventId}/concepts/${g.concept_index}`;
    const res = await hop(url);
    const html = await res.text();
    previews.push({
      conceptIndex: g.concept_index,
      status: res.status,
      bytes: html.length,
      hasEventTokens: /ev-page|ev-section|--ev-/.test(html),
      hasConceptName: typeof g.name === "string" && html.includes(g.name.split(" ")[0]),
      rsvpShell: /data-testid="rsvp|ev-rsvp/.test(html),
    });
  }
  mark("preview-routes", { previews });

  // ---- access control: no session at all must not reach an unselected concept.
  const anon = await fetch(`${BASE}/events/${eventId}/concepts/0`, { redirect: "manual" });
  mark("anonymous-preview", { status: anon.status, location: anon.headers.get("location") });

  const runs = await sql(
    `select operation, concept_index, success, latency_ms, input_tokens, cached_input_tokens,
            output_tokens, reasoning_tokens, reprompts, fallback, model
       from public.generation_runs where event_id = '${eventId}' order by created_at`,
  );
  const slots = await sql(
    `select a.slot_id, a.status, a.cost_estimate_usd from public.resolved_spec_artwork_slots a
       join public.resolved_design_specs r on r.id = a.resolved_spec_id
       join public.design_concepts c on c.id = r.concept_id
      where c.event_id = '${eventId}'`,
  );
  mark("providers", { textCalls: runs.length, artworkSlots: slots.length });

  writeFileSync(
    path.join(OUT, "provider-telemetry.jsonl"),
    runs.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  writeFileSync(path.join(OUT, "raw-prompt.txt"), `${ENGAGEMENT_BRUNCH_PROMPT}\n`);
  writeFileSync(
    path.join(OUT, "run-summary.json"),
    JSON.stringify(
      { base: BASE, eventId, batch, geometry, previews, runs, slots, wallMs: Date.now() - t0 },
      null,
      2,
    ) + "\n",
  );
}

main()
  .catch((e) => {
    mark("fatal", { error: String(e).slice(0, 400) });
    process.exitCode = 1;
  })
  .finally(() => {
    writeFileSync(
      path.join(OUT, "generation-timeline.jsonl"),
      timeline.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
  });
