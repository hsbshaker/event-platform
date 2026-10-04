/**
 * Phase 3 throwaway card mock: resolve ink and legibility panels deterministically from the
 * finished artwork (card-system.md §4.2), set real text over it, mask the shape, and render each
 * card in a real browser to a PNG for the owner's judgement.
 *
 *   node --experimental-strip-types scripts/phase-3/compose.mjs
 *
 * Not the product renderer: the browser wraps lines here, where Phase 4's layoutCard will own them.
 * Calls no model.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";

import { TYPOGRAPHY } from "../../src/lib/card/typography.ts";
import {
  formatHex,
  hexToOklch,
  oklchToHex,
  relativeLuminance,
  parseHex,
  rgbToOklch,
} from "../../src/lib/card/color.ts";
import { CANVAS, LAYOUTS, SHAPES, zoneFor } from "./catalog.mjs";
import { OUT_DIR, readJson, writeJson } from "./lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIN_CONTRAST = 4.5;

/** Sample details for cases whose host supplied none: shown on the mock only, labelled as such. */
const SAMPLE = { date: "Saturday, June 6", time: "1:00 pm", venue: "The Willow House" };
const REAL = {
  "CU-11": {
    date: "Saturday, December 19 2026",
    time: "1pm",
    venue: "The Lodge at Hanson Park",
    location: "Aldie, Virginia",
  },
};

function insideOutline(shape, x, y) {
  const { w, h } = CANVAS[SHAPES[shape].proportion];
  switch (shape) {
    case "arch":
      return y >= w / 2 || Math.hypot(x - w / 2, y - w / 2) <= w / 2;
    case "oval":
      return ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2 <= 1;
    case "circle":
      return Math.hypot(x - w / 2, y - h / 2) <= w / 2;
    default:
      return true;
  }
}

const lum = (r, g, b) => relativeLuminance({ r, g, b });
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function percentile(sorted, p) {
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  ];
}

/** A few dominant colours of the artwork, by population (simple k-means on a thumbnail). */
async function artPalette(file) {
  const { data, info } = await sharp(file)
    .resize(64, 64, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
  let centers = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((f) => px[Math.floor(f * (px.length - 1))]);
  let groups = [];
  for (let iter = 0; iter < 12; iter++) {
    groups = centers.map(() => []);
    for (const p of px) {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, k) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      groups[best].push(p);
    }
    centers = groups.map((g, k) =>
      g.length ? [0, 1, 2].map((ch) => g.reduce((s, p) => s + p[ch], 0) / g.length) : centers[k],
    );
  }
  return centers
    .map((c, k) => ({
      hex: formatHex({ r: c[0], g: c[1], b: c[2] }),
      share: groups[k].length / px.length,
    }))
    .filter((c) => c.share > 0.01)
    .sort((a, b) => b.share - a.share);
}

/** Ink and panel for one zone (card-system.md §4.2). */
async function resolveInk(file, shape, zone, palette) {
  const { w, h } = CANVAS[SHAPES[shape].proportion];
  const { data, info } = await sharp(file)
    .resize(w, h, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lums = [];
  for (let y = Math.round(zone.y); y < zone.y + zone.height; y += 2) {
    for (let x = Math.round(zone.x); x < zone.x + zone.width; x += 2) {
      if (!insideOutline(shape, x, y)) continue;
      const i = (y * info.width + x) * info.channels;
      lums.push(lum(data[i], data[i + 1], data[i + 2]));
    }
  }
  lums.sort((a, b) => a - b);
  const darkTail = percentile(lums, 8);
  const lightTail = percentile(lums, 92);
  const median = percentile(lums, 50);
  const worst = (inkL) => (inkL < median ? ratio(inkL, darkTail) : ratio(inkL, lightTail));

  const hue = rgbToOklch(parseHex(palette[0].hex)).h;
  const candidates = [
    ...palette.map((p) => ({ hex: p.hex, source: "art" })),
    { hex: oklchToHex({ l: 0.24, c: 0.03, h: hue }), source: "tuned-dark" },
    { hex: oklchToHex({ l: 0.98, c: 0.012, h: hue }), source: "tuned-light" },
  ];
  for (const c of candidates) {
    const r = worst(relativeLuminance(parseHex(c.hex)));
    if (r >= MIN_CONTRAST)
      return {
        ink: c.hex,
        inkSource: c.source,
        contrast: Number(r.toFixed(2)),
        panel: null,
        background: { darkTail, median, lightTail },
      };
  }
  // Legibility panel: an art-derived paper colour, then the ink against the panel.
  const light = [...palette].sort(
    (a, b) => relativeLuminance(parseHex(b.hex)) - relativeLuminance(parseHex(a.hex)),
  )[0];
  const lo = hexToOklch(light.hex);
  const panel = oklchToHex({ l: 0.965, c: Math.min(lo.c, 0.025), h: lo.h });
  const panelL = relativeLuminance(parseHex(panel));
  const inks = [...palette.map((p) => p.hex), oklchToHex({ l: 0.24, c: 0.03, h: hue })];
  const ink =
    inks.find((x) => ratio(relativeLuminance(parseHex(x)), panelL) >= MIN_CONTRAST) ?? "#1A1A1A";
  return {
    ink,
    inkSource: "panel",
    contrast: Number(ratio(relativeLuminance(parseHex(ink)), panelL).toFixed(2)),
    panel,
    background: { darkTail, median, lightTail },
  };
}

const CLIP = {
  rectangle: "none",
  "rounded-rectangle": "inset(0 round 70px)",
  arch: "path('M0,1400 L0,500 A500,500 0 0 1 1000,500 L1000,1400 Z')",
  oval: "ellipse(50% 50% at 50% 50%)",
  square: "none",
  circle: "circle(50% at 50% 50%)",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardHtml({ artFile, shape, zone, ink, panel, design, details }) {
  const { w, h } = CANVAS[SHAPES[shape].proportion];
  const pairing = TYPOGRAPHY[design.typography.primary];
  const fonts = readFileSync(path.join(ROOT, "src/styles/card-fonts.css"), "utf8").replaceAll(
    'url("/fonts/card/',
    `url("file://${path.join(ROOT, "public/fonts/card/")}`,
  );
  const art = `file://${artFile}`;
  const lines = [`${details.date}`, `${details.time}`, details.venue, details.location].filter(
    Boolean,
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
html,body{margin:0;background:transparent}
.wrap{margin:40px;width:${w}px;height:${h}px;filter:drop-shadow(0 18px 30px rgba(40,30,20,.18)) drop-shadow(0 2px 4px rgba(40,30,20,.12))}
.card{position:relative;width:${w}px;height:${h}px;clip-path:${CLIP[shape]};background:url(${art}) center/100% 100% no-repeat}
.zone{position:absolute;left:${zone.x}px;top:${zone.y}px;width:${zone.width}px;height:${zone.height}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:${ink}}
.panel{position:absolute;left:${zone.x - 40}px;top:${zone.y - 30}px;width:${zone.width + 80}px;height:${zone.height + 60}px;background:${panel};border-radius:28px;opacity:.92;box-shadow:0 0 40px 20px ${panel}}
.title{font-family:"${pairing.display}";font-weight:400;line-height:1.05;text-wrap:balance;margin:0}
.line{font-family:"${pairing.body}";font-weight:400;line-height:1.3;text-wrap:balance;margin:0.9em 0 0;letter-spacing:.02em}
.details{font-family:"${pairing.body}";font-weight:400;line-height:1.45;margin:1.3em 0 0;letter-spacing:.06em;text-transform:uppercase}
</style></head><body><div class="wrap"><div class="card">
${panel ? '<div class="panel"></div>' : ""}
<div class="zone" id="zone"><h1 class="title" id="title">${esc(design.wording.title)}</h1><p class="line" id="line">${esc(design.wording.invitationLine)}</p><p class="details" id="details">${lines.map(esc).join("<br>")}</p></div>
</div></div>
<script>
const z=document.getElementById('zone'),t=document.getElementById('title'),l=document.getElementById('line'),d=document.getElementById('details');
let ts=${shape === "circle" || shape === "square" ? 92 : 104},ls=32,ds=24;
const lineCount=(el)=>Math.round(el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight));
function apply(){t.style.fontSize=ts+'px';l.style.fontSize=ls+'px';d.style.fontSize=ds+'px'}
const faces=[...document.fonts].filter(f=>f.family.replace(/"/g,'')===${JSON.stringify(pairing.display)}||f.family.replace(/"/g,'')===${JSON.stringify(pairing.body)});
Promise.all(faces.map(f=>f.load())).then(()=>document.fonts.ready).then(()=>{
apply();
while((z.scrollHeight>z.clientHeight+1||lineCount(t)>3||t.scrollWidth>z.clientWidth)&&ts>48){ts-=2;apply()}
while(z.scrollHeight>z.clientHeight+1&&ls>22){ls-=1;ds=Math.max(18,ds-1);apply()}
const loaded=faces.filter(f=>f.status==='loaded').length;
document.body.dataset.fit=JSON.stringify({ts,ls,ds,overflow:z.scrollHeight>z.clientHeight+1,fontsLoaded:loaded+'/'+faces.length});
});
</script></body></html>`;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("  page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("  console:", m.text()));
  const ids = process.argv.slice(2);
  const all = readJson(path.join(OUT_DIR, "summary.json")).rows.map((r) => r.id);
  const results = {};
  for (const id of ids.length ? ids : all) {
    for (const variant of ["art", "switch"]) {
      const artJson = path.join(OUT_DIR, id, `${variant}.json`);
      const artFile = path.join(OUT_DIR, id, `${variant}.png`);
      if (!existsSync(artJson) || !existsSync(artFile)) continue;
      const art = readJson(artJson);
      if (!art.ok) continue;
      const { design: base } = readJson(path.join(OUT_DIR, id, "design.json"));
      const design = variant === "switch" ? { ...base, shape: art.to, layout: art.layout } : base;
      const { shape, layout } = design;
      const proportion = SHAPES[shape].proportion;
      const zone = zoneFor(shape, LAYOUTS[layout].band[proportion], LAYOUTS[layout].maxWidth);
      const palette = await artPalette(artFile);
      const ink = await resolveInk(artFile, shape, zone, palette);
      const details = REAL[id] ?? SAMPLE;
      const { w, h } = CANVAS[proportion];
      await page.setViewportSize({ width: w + 80, height: h + 80 });
      // Load from a file:// page so the self-hosted card fonts (file:// URLs) are allowed to load.
      const htmlFile = path.join(OUT_DIR, id, `card-${variant}.html`);
      writeFileSync(
        htmlFile,
        cardHtml({ artFile, shape, zone, ink: ink.ink, panel: ink.panel, design, details }),
      );
      await page.goto(`file://${htmlFile}`, { waitUntil: "load" });
      await page.waitForFunction(() => document.body.dataset.fit, null, { timeout: 15000 });
      const fit = JSON.parse(await page.evaluate(() => document.body.dataset.fit));
      const png = await page.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: w + 80, height: h + 80 },
      });
      const cardFile = path.join(OUT_DIR, id, `card-${variant}.png`);
      writeFileSync(cardFile, png);
      results[`${id}${variant === "switch" ? "-switch" : ""}`] = {
        shape,
        layout,
        zone,
        palette: palette.map((p) => p.hex),
        ...ink,
        fit,
        sampleDetails: !REAL[id],
      };
      console.log(
        `${id} ${variant} ${shape}/${layout} ink ${ink.ink} (${ink.inkSource}, ${ink.contrast}:1)${ink.panel ? " panel " + ink.panel : ""} title ${fit.ts}px fonts ${fit.fontsLoaded}${fit.overflow ? " OVERFLOW" : ""}`,
      );
    }
  }
  await browser.close();
  writeJson(path.join(OUT_DIR, "compose.json"), results);
}

await main();
