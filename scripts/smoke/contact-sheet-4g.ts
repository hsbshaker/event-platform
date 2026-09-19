/**
 * The Phase 4G operator contact sheet.
 *
 * One page an operator can open without a terminal, holding everything the twelve questions in
 * `§9` of the workstream brief need in order to be answerable — and answering none of them.
 *
 * The separation is the whole design. **Creative material and factual telemetry are kept apart**:
 * the concepts section shows what the system made, the telemetry section shows what it cost and
 * how long it took, and nothing on the page mixes a number into a judgement. There is no score for
 * beauty, wow, originality or personalization, no winner, no ranking, no recommendation, and no
 * model was asked to look at any of it. Those are the operator's to make, and a page that made
 * them first would be answering the questions it exists to ask.
 */

export interface ContactConcept {
  index: number;
  name?: string | null;
  description?: string | null;
  premiseTitle?: string | null;
  premiseIdea?: string | null;
  creativeDirection?: string | null;
  family?: string | null;
  density?: string | null;
  ornament?: string | null;
  typography?: string | null;
  palette: readonly string[];
  vocabulary: readonly string[];
  artwork: readonly {
    slotId: string;
    role: string;
    status: string;
    file: string | null;
    failure: string | null;
    widthPx?: number | null;
    heightPx?: number | null;
  }[];
  mobile: string;
  desktop: string;
  noArtMobile?: string | null;
  noArtDesktop?: string | null;
  geometryClean: boolean;
  mobileSize?: { width: number; height: number };
  desktopSize?: { width: number; height: number };
}

export interface ContactTelemetry {
  wallMs: number;
  identityMs: number;
  clarificationAsked: boolean;
  clarificationRounds: number;
  premiseMs: readonly number[];
  designIntentMs: readonly number[];
  compositionMs: readonly number[];
  artworkMs: readonly (number | null)[];
  textCalls: number;
  textByOperation: Record<string, number>;
  imageAttempted: number;
  imageLimit: number;
  imageDelivered: number;
  imageFailed: number;
  reprompts: Record<string, number>;
  textUsd: number;
  imageUsd: number;
  imageCeilingUsd: number;
  totalUsd: number;
  firstPreviewableMs: Record<number, number | null>;
  storeId: string;
  imageModel: string;
  textModel: string;
}

/** The twelve operator questions, verbatim and unanswered. */
const QUESTIONS = [
  "Did the system understand the original host request?",
  "Are all three concepts faithful to that same event?",
  "Are they genuinely different creative choices?",
  "Do they look designed, rather than merely generated?",
  "Does each concept feel internally coherent?",
  "Does the visual language carry across the whole page?",
  "Does anything feel like disconnected AI pieces stitched together?",
  "Is artwork used where it helps rather than because it exists?",
  "Are concepts personalized enough that the host would be excited to choose one?",
  "Does the experience feel like watching the user's idea come to life?",
  "Does the result require “rescue” before it feels usable?",
  "Would a real user plausibly think “I want one of these”?",
];

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const ms = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${(value / 1000).toFixed(1)}s`;

const list = (values: readonly (number | null)[]): string =>
  values.length === 0 ? "—" : values.map((v) => ms(v)).join(", ");

function swatches(palette: readonly string[]): string {
  if (palette.length === 0) return "<em>not resolved</em>";
  return palette
    .map(
      (hex) =>
        `<span class="sw" title="${esc(hex)}"><i style="background:${esc(hex)}"></i>${esc(hex)}</span>`,
    )
    .join("");
}

function artworkCell(concept: ContactConcept): string {
  if (concept.artwork.length === 0) {
    return `<p class="quiet">No artwork was reserved for this direction. Check <code>capabilities.artwork</code> in this concept's JSON before reading that as a refusal: true means the optionality gate allowed it and the primitive, its nesting and its limits were all in the request, so the composition declined something it was shown.</p>`;
  }
  const rows = concept.artwork
    .map(
      (slot) => `<tr><td><code>${esc(slot.slotId)}</code></td><td>${esc(slot.role)}</td>
        <td>${esc(slot.status)}</td>
        <td>${slot.widthPx ? `${esc(slot.widthPx)}×${esc(slot.heightPx)}` : "—"}</td>
        <td>${slot.failure ? esc(slot.failure) : "—"}</td></tr>`,
    )
    .join("");
  const thumbs = concept.artwork
    .filter((slot) => slot.file)
    .map(
      (slot) =>
        `<figure class="thumb"><img src="../${esc(slot.file)}" alt=""><figcaption>${esc(slot.slotId)} · ${esc(slot.role)}</figcaption></figure>`,
    )
    .join("");
  return `<table class="slots"><tr><th>slot</th><th>role</th><th>status</th><th>pixels</th><th>failure</th></tr>${rows}</table>${thumbs}`;
}

export function contactSheet4g(
  concepts: readonly ContactConcept[],
  telemetry: ContactTelemetry,
  identity: { creativeDirection?: string | null; tone: readonly string[] },
): string {
  const conceptSections = concepts
    .map(
      (c) => `
<section class="concept">
  <h2>${esc(c.index + 1)}. ${esc(c.name ?? "(unnamed)")}</h2>
  <p class="blurb">${esc(c.description ?? "")}</p>
  <dl>
    <dt>Premise</dt><dd><strong>${esc(c.premiseTitle ?? "—")}</strong>${c.premiseIdea ? ` — ${esc(c.premiseIdea)}` : ""}</dd>
    <dt>Creative direction</dt><dd>${esc(c.creativeDirection ?? "—")}</dd>
    <dt>Design family</dt><dd>${esc(c.family ?? "—")} · density ${esc(c.density ?? "—")} · ornament ${esc(c.ornament ?? "—")}</dd>
    <dt>Typography</dt><dd>${esc(c.typography ?? "—")}</dd>
    <dt>Palette</dt><dd class="palette">${swatches(c.palette)}</dd>
    <dt>Visual vocabulary</dt><dd>${c.vocabulary.length ? esc(c.vocabulary.join(", ")) : "—"}</dd>
    <dt>Geometry</dt><dd>${c.geometryClean ? "clean at 390 and 1280" : "NOT CLEAN"}${
      c.mobileSize && c.desktopSize
        ? ` · ${c.mobileSize.width}×${c.mobileSize.height} · ${c.desktopSize.width}×${c.desktopSize.height}`
        : ""
    }</dd>
  </dl>
  <h3>Artwork</h3>
  ${artworkCell(c)}
  <div class="renders">
    <figure><img src="${esc(c.mobile)}" alt=""><figcaption>390</figcaption></figure>
    <figure><img src="${esc(c.desktop)}" alt=""><figcaption>1280</figcaption></figure>
  </div>
  ${
    c.noArtMobile && c.noArtDesktop
      ? `<details><summary>The same spec with its artwork detached</summary>
           <p class="quiet">Zero-cost diagnostic. Identical reservations, no assets — the only way to see what the generated artwork contributed, and the check that attaching it did not move the page.</p>
           <div class="renders"><figure><img src="${esc(c.noArtMobile)}" alt=""><figcaption>390, no art</figcaption></figure>
           <figure><img src="${esc(c.noArtDesktop)}" alt=""><figcaption>1280, no art</figcaption></figure></div></details>`
      : ""
  }
</section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phase 4G — Mediterranean shower, end to end</title>
<style>
  :root { color-scheme: light dark; --ink:#1b1b1a; --bg:#fbfaf7; --line:#d9d5cc; --quiet:#6b675f; }
  @media (prefers-color-scheme: dark) { :root { --ink:#eee; --bg:#151513; --line:#3a3730; --quiet:#a29c92; } }
  body { margin:0; padding:32px 16px 96px; background:var(--bg); color:var(--ink);
         font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
         max-width:1180px; margin-inline:auto; }
  h1 { font-size:1.55rem; margin:0 0 4px; } h2 { font-size:1.2rem; margin:0 0 2px; }
  h3 { font-size:.95rem; margin:24px 0 8px; text-transform:uppercase; letter-spacing:.06em; color:var(--quiet); }
  .note { border:1px solid var(--line); border-left-width:4px; padding:12px 14px; margin:14px 0; border-radius:6px; }
  .quiet { color:var(--quiet); }
  .blurb { margin:0 0 14px; color:var(--quiet); }
  .concept { border-top:1px solid var(--line); padding-top:28px; margin-top:36px; }
  dl { display:grid; grid-template-columns:max-content 1fr; gap:6px 18px; margin:0 0 8px; }
  dt { color:var(--quiet); font-size:.85rem; } dd { margin:0; }
  .palette { display:flex; flex-wrap:wrap; gap:8px; }
  .sw { display:inline-flex; align-items:center; gap:6px; font:12px ui-monospace,monospace; }
  .sw i { width:15px; height:15px; border-radius:3px; border:1px solid var(--line); display:inline-block; }
  table { border-collapse:collapse; width:100%; font-size:.88rem; }
  th, td { text-align:left; border-bottom:1px solid var(--line); padding:6px 10px; vertical-align:top; }
  .renders { display:flex; flex-wrap:wrap; gap:18px; margin-top:14px; align-items:flex-start; }
  .renders figure { margin:0; } .renders img { max-width:100%; border:1px solid var(--line); border-radius:4px; display:block; }
  .renders figcaption, .thumb figcaption { font-size:.78rem; color:var(--quiet); padding-top:5px; }
  .thumb { margin:12px 12px 0 0; display:inline-block;
    background:repeating-conic-gradient(#0000 0 25%, #8884 0 50%) 0 0/18px 18px; }
  .thumb img { max-width:200px; display:block; }
  details { margin-top:16px; } summary { cursor:pointer; color:var(--quiet); font-size:.9rem; }
  ol.q { counter-reset:q; list-style:none; padding:0; } ol.q li { padding:7px 0 7px 32px; position:relative; border-bottom:1px solid var(--line); }
  ol.q li::before { counter-increment:q; content:counter(q); position:absolute; left:0; color:var(--quiet); font-variant-numeric:tabular-nums; }
  @media (max-width:640px) { dl { grid-template-columns:1fr; } body { padding-inline:16px; } }
</style></head><body>

<h1>Phase 4G — one raw prompt, end to end</h1>
<p class="quiet">Mediterranean shower. One run, one seed, diagnostic evidence only.</p>

<div class="note"><strong>Nothing here is scored.</strong> No beauty, wow, originality,
personalization or winner; no ranking and no recommendation. No model was asked to look at any of
it. The twelve questions at the foot are the operator's, and they are left open on purpose.</div>

<div class="note"><strong>Creative material and telemetry are kept apart.</strong> What the system
made is above; what it cost and how long it took is below. A number folded into a judgement is a
judgement this page is not entitled to make.</div>

<div class="note"><strong>No Supabase Storage upload was exercised.</strong> The run used a
diagnostic local-directory store behind the <code>ArtworkAssetStore</code> port
(<code>${esc(telemetry.storeId)}</code>).</div>

<h3>The host's words</h3>
<p>See <code>raw-prompt.txt</code>. The system's own reading of them:</p>
<p><em>${esc(identity.creativeDirection ?? "—")}</em></p>
<p class="quiet">Tone: ${identity.tone.length ? esc(identity.tone.join(" · ")) : "—"}</p>

${conceptSections}

<section class="concept">
<h2>Telemetry</h2>
<table>
  <tr><th>Total wall time</th><td>${ms(telemetry.wallMs)}</td></tr>
  <tr><th>EventIdentity</th><td>${ms(telemetry.identityMs)}</td></tr>
  <tr><th>Clarification</th><td>${telemetry.clarificationAsked ? `${telemetry.clarificationRounds} round(s)` : "not asked"}</td></tr>
  <tr><th>ConceptPremise</th><td>${list(telemetry.premiseMs)}</td></tr>
  <tr><th>DesignIntent</th><td>${list(telemetry.designIntentMs)}</td></tr>
  <tr><th>Composition</th><td>${list(telemetry.compositionMs)}</td></tr>
  <tr><th>Artwork</th><td>${list(telemetry.artworkMs)}</td></tr>
  <tr><th>First previewable, per concept</th><td>${
    Object.entries(telemetry.firstPreviewableMs)
      .map(([i, at]) => `#${Number(i) + 1} ${ms(at)}`)
      .join(" · ") || "—"
  }</td></tr>
  <tr><th>Text provider calls</th><td>${telemetry.textCalls} — ${esc(
    Object.entries(telemetry.textByOperation)
      .map(([op, n]) => `${op} ${n}`)
      .join(", "),
  )}</td></tr>
  <tr><th>Re-prompts</th><td>${esc(
    Object.entries(telemetry.reprompts)
      .map(([kind, n]) => `${kind} ${n}`)
      .join(", ") || "none",
  )}</td></tr>
  <tr><th>Image attempts</th><td>${telemetry.imageAttempted} of ${telemetry.imageLimit} · delivered ${telemetry.imageDelivered} · failed ${telemetry.imageFailed}</td></tr>
  <tr><th>Text cost</th><td>$${telemetry.textUsd.toFixed(4)}</td></tr>
  <tr><th>Image cost</th><td>$${telemetry.imageUsd.toFixed(4)} of a $${telemetry.imageCeilingUsd.toFixed(2)} ceiling</td></tr>
  <tr><th>Total</th><td>$${telemetry.totalUsd.toFixed(4)}</td></tr>
  <tr><th>Geometry</th><td>${concepts.every((c) => c.geometryClean) ? "clean at 390 and 1280 on every concept" : "NOT CLEAN — see per concept"}</td></tr>
  <tr><th>Models</th><td>text ${esc(telemetry.textModel)} · image ${esc(telemetry.imageModel)}</td></tr>
</table>
</section>

<section class="concept">
<h2>For the operator</h2>
<p class="quiet">Deliberately unanswered, here and in the report.</p>
<ol class="q">${QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
</section>

</body></html>
`;
}
