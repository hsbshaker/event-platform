/**
 * Build the Phase 3 review page: every composed card, the host prompt it came from, its checks,
 * and "Would send / Wouldn't send" controls that save the owner's verdicts to the artifact's db.
 *
 *   node --experimental-strip-types scripts/phase-3/sheet.mjs <outDir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { TYPOGRAPHY } from "../../src/lib/card/typography.ts";
import { OUT_DIR, readJson, readLedger } from "./lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const dest = process.argv[2] ?? path.join(OUT_DIR, "review");
mkdirSync(path.join(dest, "cards"), { recursive: true });

const corpus = JSON.parse(
  readFileSync(path.join(ROOT, "docs/model-evals/creative-understanding.json"), "utf8"),
);
const OWNER = {
  "O-01":
    "Spring engagement brunch at a garden venue. Romantic and fresh with soft florals, citrus, warm cream, sage and a little terracotta. Elegant but relaxed — not rustic farmhouse, not overly formal, and definitely not generic wedding-template vibes.",
  "O-02":
    "Baby shower that's Ralph Lauren bear themed, dark navys and browns, not overly baby but still says this is for a baby shower.",
};
const promptOf = (id) => corpus.cases.find((c) => c.id === id)?.prompt ?? OWNER[id];
const compose = readJson(path.join(OUT_DIR, "compose.json"));
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SHAPE_LABEL = {
  rectangle: "Rectangle",
  "rounded-rectangle": "Rounded rectangle",
  arch: "Arch",
  oval: "Oval",
  square: "Square",
  circle: "Circle",
};

async function cardImage(id, variant) {
  const src = path.join(OUT_DIR, id, `card-${variant}.png`);
  const name = `${id}${variant === "switch" ? "-switch" : ""}.webp`;
  await sharp(src)
    .resize({ width: 760 })
    .webp({ quality: 82 })
    .toFile(path.join(dest, "cards", name));
  return `cards/${name}`;
}

function checks(art) {
  const last = art.attempts.at(-1);
  const i = last.inspection ?? {};
  return [
    { ok: !i.hasText, label: i.hasText ? "Text in artwork" : "No text in artwork" },
    {
      ok: !i.hasLogoOrBrandMark,
      label: i.hasLogoOrBrandMark ? "Logo or brand mark" : "No logo or brand mark",
    },
    {
      ok: !last.moderation?.flagged,
      label: last.moderation?.flagged ? "Flagged by safety check" : "Safety check passed",
    },
  ];
}

async function tile(id, counted) {
  const design = readJson(path.join(OUT_DIR, id, "design.json")).design;
  const art = readJson(path.join(OUT_DIR, id, "art.json"));
  const c = compose[id];
  const pairing = TYPOGRAPHY[design.typography.primary];
  if (!c) {
    const err = art.attempts.at(-1)?.error ?? "";
    const refused = /moderation_blocked|safety system/.test(err);
    return `<article class="tile failed" data-id="${id}" data-counted="${counted}">
  <div class="art-slot"><div class="no-card"><strong>${refused ? "Refused by OpenAI's safety filter" : "No card produced"}</strong><span>${refused ? "The image model blocked its own output (output-stage moderation). In the product this shows as a visible failure with Try again." : esc(err.slice(0, 160))}</span></div></div>
  <div class="meta">${head(id, design, pairing, counted)}${verdictControls(id)}</div>
</article>`;
  }
  const img = await cardImage(id, "art");
  const ms = art.attempts.reduce((s, a) => s + (a.ms ?? 0), 0);
  return `<article class="tile" data-id="${id}" data-counted="${counted}">
  <div class="art-slot"><img src="${img}" alt="Card for ${id}: ${esc(design.wording.title)}" loading="lazy" width="760"></div>
  <div class="meta">${head(id, design, pairing, counted)}
    <ul class="chips">${checks(art)
      .map((k) => `<li class="chip ${k.ok ? "ok" : "bad"}">${esc(k.label)}</li>`)
      .join(
        "",
      )}<li class="chip ${c.panel ? "warn" : "ok"}">${c.panel ? "Needed a legibility panel" : `Ink ${c.ink} · ${c.contrast}:1`}</li>${c.sampleDetails ? '<li class="chip plain">Sample date and venue</li>' : '<li class="chip plain">Host\'s own details</li>'}</ul>
    <p class="small">Artwork ${(ms / 1000).toFixed(0)} s${art.attempts.length > 1 ? ` · ${art.attempts.length} attempts` : ""}</p>
    ${verdictControls(id)}
  </div>
</article>`;
}

function head(id, design, pairing, counted) {
  return `<header class="tile-head"><span class="id">${id}</span>${counted ? "" : '<span class="tag">Your brief · not counted</span>'}</header>
    <blockquote>${esc(promptOf(id))}</blockquote>
    <p class="design"><strong>${esc(design.presentation.name)}</strong> · ${SHAPE_LABEL[design.shape]} · ${esc(design.layout)} · ${esc(design.artMode)} · ${esc(pairing.display)} + ${esc(pairing.body)}</p>`;
}

function verdictControls(id) {
  return `<div class="verdict" role="group" aria-label="Verdict for ${id}">
      <button type="button" class="v send" data-v="send" id="send-${id}">Would send</button>
      <button type="button" class="v no" data-v="no" id="no-${id}">Wouldn't send</button>
    </div>
    <label class="note-label" for="note-${id}">Note (optional)</label>
    <textarea class="note" id="note-${id}" rows="2" placeholder="What would make it sendable?"></textarea>`;
}

async function switchTile(id) {
  const sw = path.join(OUT_DIR, id, "switch.json");
  if (!existsSync(sw) || !compose[`${id}-switch`]) return "";
  const s = readJson(sw);
  const a = await cardImage(id, "art");
  const b = await cardImage(id, "switch");
  return `<figure class="pair"><div class="pair-imgs"><img src="${a}" alt="${id} original" loading="lazy" width="760"><img src="${b}" alt="${id} after switching to ${s.to}" loading="lazy" width="760"></div>
  <figcaption><strong>${id}</strong>: ${SHAPE_LABEL[s.from]} → ${SHAPE_LABEL[s.to]}, regenerated with the original artwork as a reference. Same subject?</figcaption></figure>`;
}

const counted = corpus.cases.map((c) => c.id);
const tiles = [];
for (const id of counted) tiles.push(await tile(id, true));
const ownerTiles = [];
for (const id of Object.keys(OWNER)) ownerTiles.push(await tile(id, false));
const switches = [];
for (const id of ["O-02", "CU-13", "CU-01"]) switches.push(await switchTile(id));
// Round 1 (before the in-phase fixes), shown for comparison without verdict controls.
const ROUND1 = process.env.PHASE3_ROUND1;
const round1 = [];
if (ROUND1) {
  for (const id of [...counted, ...Object.keys(OWNER)]) {
    const src = path.join(ROUND1, id, "card-art.png");
    if (!existsSync(src)) continue;
    const name = `r1-${id}.webp`;
    await sharp(src)
      .resize({ width: 380 })
      .webp({ quality: 78 })
      .toFile(path.join(dest, "cards", name));
    round1.push(
      `<figure class="r1"><img src="cards/${name}" alt="Round 1 card for ${id}" loading="lazy" width="380"><figcaption>${id}</figcaption></figure>`,
    );
  }
}
const ledger = readLedger();
const images = ledger.calls.filter((c) => c.model?.startsWith("gpt-image") && !c.error);
const imgMs = images.map((c) => c.ms).sort((a, b) => a - b);
const pct = (p) => imgMs[Math.min(imgMs.length - 1, Math.round((p / 100) * (imgMs.length - 1)))];

const html = `<title>Invitation Card Review</title>
<style>
/* Layout: one column of card tiles, each card beside its prompt and verdict; a sticky tally on top. */
:root{
  --bg:#EEF0EB;--surface:#F8F9F6;--ink:#1D2320;--muted:#5C6660;--line:#D3D8D1;
  --accent:#24557A;--send:#2D7348;--send-bg:#E2EFE5;--no:#9B3B2C;--no-bg:#F5E3DF;--warn:#8A6516;--warn-bg:#F4EBD4;
  --font-display:"Young Serif",Georgia,serif;--font-body:"Public Sans",system-ui,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#171B19;--surface:#202623;--ink:#E8ECE8;--muted:#A3ADA6;--line:#343C37;
  --accent:#8DB8DA;--send:#86CF9F;--send-bg:#1F3428;--no:#EBA092;--no-bg:#3A2420;--warn:#E3C27A;--warn-bg:#3A311C;color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#171B19;--surface:#202623;--ink:#E8ECE8;--muted:#A3ADA6;--line:#343C37;
  --accent:#8DB8DA;--send:#86CF9F;--send-bg:#1F3428;--no:#EBA092;--no-bg:#3A2420;--warn:#E3C27A;--warn-bg:#3A311C;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:15px;line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding-inline:16px;padding-block:24px 64px}
h1,h2{font-family:var(--font-display);font-weight:400;text-wrap:balance;margin:0}
h1{font-size:clamp(28px,5vw,40px);line-height:1.1}
h2{font-size:24px;margin-block:40px 8px}
.lede{max-width:65ch;color:var(--muted);margin-block:8px 0}
.tally{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding-block:12px;margin-block:20px 8px;display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;font-variant-numeric:tabular-nums}
.tally .big{font-family:var(--font-display);font-size:28px}
.tally .bar{color:var(--muted)}
.tally .status{font-weight:600}
.tally .status.pass{color:var(--send)}.tally .status.fail{color:var(--no)}
.grid{display:grid;gap:20px}
.tile{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:24px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}
@media (max-width:720px){.tile{grid-template-columns:minmax(0,1fr)}}
.art-slot{display:flex;align-items:flex-start;justify-content:center;background:linear-gradient(var(--bg),var(--bg));border-radius:10px;padding:8px}
.art-slot img{width:100%;height:auto;display:block}
.no-card{aspect-ratio:5/7;width:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:20px;border:1px dashed var(--line);border-radius:10px;color:var(--muted)}
.no-card strong{color:var(--no)}
.meta{min-width:0;display:flex;flex-direction:column;gap:10px}
.tile-head{display:flex;gap:10px;align-items:center}
.id{font-weight:700;letter-spacing:.06em;font-size:13px;color:var(--accent)}
.tag{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--warn-bg);color:var(--warn)}
blockquote{margin:0;font-family:var(--font-display);font-size:19px;line-height:1.35}
blockquote::before{content:"\\201C"}blockquote::after{content:"\\201D"}
.design{margin:0;color:var(--muted);font-size:14px}
.design strong{color:var(--ink)}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:12px;padding:3px 9px;border-radius:99px;border:1px solid var(--line)}
.chip.ok{background:var(--send-bg);color:var(--send);border-color:transparent}
.chip.bad{background:var(--no-bg);color:var(--no);border-color:transparent}
.chip.warn{background:var(--warn-bg);color:var(--warn);border-color:transparent}
.chip.plain{color:var(--muted)}
.small{margin:0;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.verdict{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.v{font:inherit;font-weight:600;padding:10px 16px;border-radius:10px;border:1.5px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
.v:hover{border-color:var(--muted)}
.v:focus-visible,.note:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.v.send[aria-pressed="true"]{background:var(--send-bg);border-color:var(--send);color:var(--send)}
.v.no[aria-pressed="true"]{background:var(--no-bg);border-color:var(--no);color:var(--no)}
.v:disabled{opacity:.5;cursor:default}
.note-label{font-size:13px;color:var(--muted)}
.note{font:inherit;width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg);color:var(--ink);resize:vertical}
.saved{font-size:12px;color:var(--muted);min-height:1em}
.pairs{display:grid;gap:20px}
.pair{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}
.pair-imgs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.pair-imgs img{width:100%;height:auto}
.pair figcaption{margin-top:10px;color:var(--muted)}
.notes{max-width:65ch;color:var(--muted)}
.r1-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.r1{margin:0}.r1 img{width:100%;height:auto}.r1 figcaption{font-size:12px;color:var(--muted);text-align:center}
.notes li{margin-block:4px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;font-variant-numeric:tabular-nums}
.stat b{display:block;font-family:var(--font-display);font-weight:400;font-size:24px}
@media (prefers-reduced-motion:no-preference){.v{transition:background .15s,border-color .15s}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=Young+Serif&display=swap">
<div class="wrap">
  <h1>Invitation Card Review</h1>
  <p class="lede">Phase 3 model validation. Each card below was designed end to end by the chosen models from the test prompt shown beside it: GPT 6.1 Sol read the prompt and designed the card, GPT Image 2.5 Sunburst painted the artwork, and code set the text, chose its colour and cut the shape. Mark each one: would you screenshot and send it as it is?</p>
  <p class="lede">This is round 2. Round 1 showed four fixable problems, so they were fixed before you saw anything: artwork drifting into the text area, the model painting its own oval behind the subject, plain frames standing in for artwork, and stock headlines like "A Lovely Gathering". Round 1 is at the bottom for comparison.</p>
  <div class="tally" aria-live="polite"><span class="big" id="sendCount">0</span><span class="bar">of 14 would send · the bar is 10</span><span id="judged" class="bar">0 of 14 judged</span><span id="status" class="status"></span></div>
  <p class="saved" id="saveState">Loading saved verdicts…</p>
  <h2>The 14 test prompts</h2>
  <p class="lede">These count toward the bar. Dates and venues are sample details unless the prompt gave real ones.</p>
  <div class="grid">${tiles.join("\n")}</div>
  <h2>Your own briefs</h2>
  <p class="lede">From your ChatGPT test, re-run through the API to compare. Not counted toward the bar.</p>
  <div class="grid">${ownerTiles.join("\n")}</div>
  ${switches.join("") ? `<h2>Shape switches</h2><p class="lede">Switching to a shape the artwork doesn't fit makes new artwork, passing the current artwork as a reference so the subject stays the same.</p><div class="pairs">${switches.join("\n")}</div>` : ""}
  ${round1.length ? `<h2>Round 1, for comparison</h2><p class="lede">The first run, before the fixes described at the top. Not for judging.</p><div class="r1-grid">${round1.join("")}</div>` : ""}
  <h2>Run figures</h2>
  <div class="stats">
    <div class="stat"><b>$${ledger.spentUsd.toFixed(2)}</b>spent of the $25 cap</div>
    <div class="stat"><b>${(pct(50) / 1000).toFixed(0)} s / ${(pct(75) / 1000).toFixed(0)} s</b>artwork time, p50 / p75</div>
    <div class="stat"><b>${images.length}</b>images generated</div>
  </div>
</div>
<script>
(async () => {
  const tiles = [...document.querySelectorAll(".tile")];
  const state = {};
  const saveState = document.getElementById("saveState");
  function render() {
    let send = 0, judged = 0;
    for (const t of tiles) {
      const id = t.dataset.id, v = state[id]?.verdict;
      t.querySelectorAll(".v").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
      const note = t.querySelector(".note");
      if (document.activeElement !== note && state[id]?.note !== undefined) note.value = state[id].note;
      if (t.dataset.counted === "true" && v) { judged++; if (v === "send") send++; }
    }
    document.getElementById("sendCount").textContent = send;
    document.getElementById("judged").textContent = judged + " of 14 judged";
    const s = document.getElementById("status");
    if (judged === 14) { s.textContent = send >= 10 ? "Passes the bar" : "Below the bar"; s.className = "status " + (send >= 10 ? "pass" : "fail"); }
    else { s.textContent = ""; s.className = "status"; }
  }
  render();
  let db = null;
  try { db = await (window.claude?.use ? window.claude.use("db") : null); } catch { db = null; }
  if (!db) {
    saveState.textContent = "Verdicts can't be saved in this view. Open the page signed in to claude.ai to record them.";
    tiles.forEach((t) => t.querySelectorAll(".v,.note").forEach((el) => (el.disabled = true)));
    return;
  }
  saveState.textContent = "Your verdicts save automatically.";
  db.collection("verdicts").onSnapshot((snap) => {
    for (const d of snap.docs) state[d.id] = d.data();
    render();
  }, () => { saveState.textContent = "Saved verdicts stopped updating. Reload the page to reconnect."; });
  async function save(id, patch) {
    const next = { verdict: state[id]?.verdict ?? null, note: state[id]?.note ?? "", ...patch, at: new Date().toISOString() };
    state[id] = next;
    render();
    try { await db.doc("verdicts/" + id).set(next); saveState.textContent = "Saved."; }
    catch (e) { saveState.textContent = e?.code === "invalid_argument" ? "Only the page's owner can record verdicts." : "Couldn't save. Try again in a moment."; }
  }
  for (const t of tiles) {
    const id = t.dataset.id;
    t.querySelectorAll(".v").forEach((b) => b.addEventListener("click", () => save(id, { verdict: state[id]?.verdict === b.dataset.v ? null : b.dataset.v })));
    const note = t.querySelector(".note");
    note.addEventListener("change", () => { if ((state[id]?.note ?? "") !== note.value) save(id, { note: note.value }); });
  }
})();
</script>
`;
writeFileSync(path.join(dest, "index.html"), html);
console.log(`wrote ${path.join(dest, "index.html")}`);
