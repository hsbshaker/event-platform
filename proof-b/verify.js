// Content-fit verification against rendered DOM geometry, at both breakpoints, via headless Chromium --dump-dom.
// Loop: render → measure → demote emphasis on any text node over its line limit → re-resolve → re-render, up to 3 rounds.
const { execFileSync } = require("child_process"), fs = require("fs"), path = require("path");
const C = require("./dist/composition.js");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", HARNESS = path.resolve(__dirname, "harness.html");
function measure(specPath, mode) {
  const w = mode === "mobile" ? 390 : 1280, vh = mode === "mobile" ? 844 : 800, win = mode === "mobile" ? "600,6400" : "1400,4600";
  const url = `file://${HARNESS}?spec=${specPath}&w=${w}&vh=${vh}&measure=1`;
  const out = execFileSync(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${win}`, "--virtual-time-budget=5000", "--dump-dom", url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  const m = out.match(/<pre id="measure">([^<]*)<\/pre>/); if (!m || !m[1]) throw new Error("no measurement for " + specPath + " " + mode);
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
}
function writeSpec(spec, file) { fs.writeFileSync(file, "window.SPEC = " + JSON.stringify(spec) + ";\n"); }
function verify(spec, specPath) {
  const LIM = C.FIT_LIMITS; const fitRepairs = []; let result = {};
  for (let round = 0; round < 3; round++) {
    writeSpec(spec, specPath); let changed = false; result = {};
    for (const mode of ["desktop", "mobile"]) {
      const m = measure(specPath, mode); result[mode] = { pageOverflow: m.pageOverflow, overflowing: m.overflowing, heroHeight: m.heroHeight, textOverflow: m.texts.filter(t => t.overflow).map(t => t.id), overLimit: [] };
      for (const t of m.texts) {
        const em = (t.cls.match(/em-(\w+)/) || [])[1]; const limit = LIM[mode][em]; const over = (limit && t.lines > limit) || (t.overflow && (em === "display" || em === "primary"));
        if (!over) continue; result[mode].overLimit.push({ id: t.id, lines: t.lines, emphasis: em, overflow: t.overflow });
        // demote in the tree
        C.walk(spec.composition, ({ node }) => { if (node.id === t.id && (node.emphasis === "display" || node.emphasis === "primary")) { const next = node.emphasis === "display" ? "primary" : "secondary"; fitRepairs.push({ rule: "fit.verified", path: t.id, kind: "fit-verified", before: `${node.emphasis} (${mode}: ${t.lines} lines${t.overflow ? ", overflowing" : ""})`, after: next }); node.emphasis = next; changed = true; } });
      }
    }
    if (!changed) break;
    spec.layout = C.resolveLayout(spec.composition, spec.designIntent.density);
  }
  // last resort (structural, verified): if any overflow remains after emphasis demotion, remove the innermost box around the overflowing node and re-verify
  for (let round = 0; round < 3; round++) {
    const bad = ["desktop", "mobile"].flatMap(m => [...(result[m].overflowing || []), ...(result[m].textOverflow || [])].map(x => String(x).replace(/^(rail-clip|glyphs):/, "")));
    if (!bad.length && !result.desktop.pageOverflow && !result.mobile.pageOverflow) break;
    let changed = false;
    for (const id of bad) { let target = null; C.walk(spec.composition, ({ node, ancestors }) => { if (node.id === id || (node.id && id.startsWith(node.id + "."))) { const box = [...ancestors].reverse().find(a => a.t === "Frame" || a.t === "Surface" || a.t === "Rail"); if (box && !target) target = box; } });
      if (target) { if (target.t === "Frame") { Object.assign(target, { t: "Stack", children: [target.child], gap: "normal" }); delete target.child; delete target.rule; delete target.inset; delete target.motif; } else if (target.t === "Surface") { target.inset = "tight"; } else { target.width = target.width === "thin" ? "medium" : "wide"; } fitRepairs.push({ rule: "fit.verified.structural", path: target.id, kind: "fit-verified", before: target.t === "Stack" ? "Frame" : target.t, after: target.t === "Stack" ? "Stack" : target.t === "Surface" ? "inset tight" : "wider rail" }); changed = true; } }
    if (!changed) break;
    spec.layout = C.resolveLayout(spec.composition, spec.designIntent.density); writeSpec(spec, specPath); result = {};
    for (const mode of ["desktop", "mobile"]) { const m = measure(specPath, mode); result[mode] = { pageOverflow: m.pageOverflow, overflowing: m.overflowing, heroHeight: m.heroHeight, textOverflow: m.texts.filter(t => t.overflow).map(t => t.id), overLimit: [] }; }
  }
  spec.compilerRepairs = [...spec.compilerRepairs, ...fitRepairs]; spec.repairSummary["fit-verified"] = fitRepairs.length;
  spec.verified = { desktop: { pageOverflow: result.desktop.pageOverflow, overflowingElements: result.desktop.overflowing.length, textOverflow: result.desktop.textOverflow.length, heroHeight: result.desktop.heroHeight }, mobile: { pageOverflow: result.mobile.pageOverflow, overflowingElements: result.mobile.overflowing.length, textOverflow: result.mobile.textOverflow.length, heroHeight: result.mobile.heroHeight }, fitRounds: fitRepairs.length ? 2 : 1, fitDemotions: fitRepairs.length, clean: !result.desktop.pageOverflow && !result.mobile.pageOverflow && !result.desktop.overflowing.length && !result.mobile.overflowing.length && !result.desktop.textOverflow.length && !result.mobile.textOverflow.length, authoritative: "rendered-geometry" };
  writeSpec(spec, specPath);
  return spec;
}
module.exports = { verify, measure, writeSpec };
