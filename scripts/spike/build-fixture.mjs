/**
 * Builds the Phase 0 geometry-runtime spike fixture: one self-contained HTML document
 * that renders a hand-authored library page (proof-a1 site rewritten as a CompositionTree)
 * through the proof-b primitive renderer, with the harness stylesheet and the renderer's
 * self-hosted fonts inlined as data URIs. Output: src/spike/fixture.generated.html.
 *
 * The function under test (src/app/api/spike/geometry/route.ts) loads this document with
 * `page.setContent`, so the measurement never depends on deployment protection, CDN
 * routing or a network font path. Nothing here is product code (docs/development-plan.md,
 * Phase 0 spike; not the Phase 3 port).
 *
 * Usage: node scripts/spike/build-fixture.mjs [siteId]   (default "01")
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const A1 = path.join(ROOT, "proof-a1");
const B = path.join(ROOT, "proof-b");
const siteId = process.argv[2] ?? "01";

const read = (p) => readFileSync(p, "utf8");
const harness = read(path.join(B, "harness.html"));
const css = harness.match(/<style>([\s\S]*?)<\/style>/)[1];

// Fonts used by the chosen site, resolved through the same vocabulary the renderer uses.
// vocab.js / sites.js are browser globals scripts; evaluate them in a sandbox.
const sandbox = { window: {}, module: { exports: {} } };
sandbox.self = sandbox.window;
vm.createContext(sandbox);
for (const f of ["vocab.js", "sites.js"])
  vm.runInContext(read(path.join(A1, f)), sandbox, { filename: f });
const VOCAB = sandbox.window.VOCAB ?? sandbox.module.exports;
const site = sandbox.window.SITES.find((s) => s.id === siteId);
if (!site) throw new Error(`site ${siteId} not found`);
const ty = VOCAB.typography[site.typography];
const families = [ty.display, ty.body];

const fontsCss = read(path.join(A1, "fonts.css"));
const faces = [...fontsCss.matchAll(/@font-face\s*{[\s\S]*?}/g)].map((m) => m[0]);
const inlined = faces
  .filter((f) => families.some((fam) => f.includes(`font-family: '${fam}'`)))
  .map((f) =>
    f.replace(/url\(([^)]+)\)/, (_, rel) => {
      const buf = readFileSync(path.join(A1, rel.replace(/['"]/g, "")));
      return `url(data:font/woff2;base64,${buf.toString("base64")})`;
    }),
  );
if (inlined.length === 0) throw new Error(`no font faces for ${families.join(", ")}`);

const scripts = [
  "../proof-a1/vocab.js",
  "../proof-a1/sites.js",
  "dist/composition.js",
  "library.js",
  "renderer.js",
]
  .map((rel) => read(path.join(B, rel)))
  .join("\n;\n");

const boot = `
window.onerror = (m, src, line, col) => { window.__SPIKE_ERROR = m + " @" + line + ":" + col; };
(function () {
  const w = window.__SPIKE_WIDTH || 390, vh = w <= 700 ? 844 : 800, mode = w <= 700 ? "mobile" : "desktop";
  const DATA = window.DATA; DATA.initial = "B"; DATA.weekday = "Saturday";
  const site = window.SITES.find(s => s.id === ${JSON.stringify(siteId)});
  const row = LIBRARY.A1_SITES.find(r => r[0] === ${JSON.stringify(siteId)});
  const tree = LIBRARY.page(row[1], row[2], row[3], row[4], row[5], row[6]);
  const designIntent = { family: site.family, tonalDirection: site.tonalDirection, typography: site.typography, density: site.density, composition: site.composition };
  const pageSystem = { border: site.pageSystem.border, card: site.pageSystem.card, button: site.pageSystem.button, borderWeight: site.parameters.borderWeight, displayTracking: site.parameters.displayTracking };
  const { tree: canon } = Composition.canonicalize(tree);
  const spec = { composition: canon, layout: Composition.resolveLayout(canon, designIntent.density), designIntent, pageSystem, typography: VOCAB.typography[designIntent.typography], content: DATA, seed: parseInt(${JSON.stringify(siteId)}, 10) };
  document.body.style.background = "#fff";
  const vp = document.createElement("div"); vp.className = "vp"; vp.style.width = w + "px"; vp.innerHTML = Renderer.render(spec, { w, vh }); document.body.appendChild(vp);
  document.fonts.ready.then(() => {
    const fonts = ${JSON.stringify(families)}.map(f => ({ family: f, loaded: document.fonts.check("16px '" + f + "'") }));
    const m = Renderer.measure(w, mode);
    window.__SPIKE_RESULT = { width: w, mode, fonts, fontFaces: document.fonts.size, docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, measure: m };
  });
})();
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phase 0 geometry spike fixture · site ${siteId}</title>
<style>${inlined.join("\n")}</style>
<style>${css}</style>
</head><body>
<script>${scripts}</script>
<script>${boot}</script>
</body></html>
`;

mkdirSync(path.join(ROOT, "src/spike"), { recursive: true });
const out = path.join(ROOT, "src/spike/fixture.generated.html");
writeFileSync(out, html);
console.log(
  `wrote ${path.relative(ROOT, out)}: ${(html.length / 1024).toFixed(0)} KB, site ${siteId}, fonts ${families.join(" + ")} (${inlined.length} faces)`,
);
