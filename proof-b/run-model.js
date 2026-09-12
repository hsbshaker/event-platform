// Phase B model run. Usage: node run-model.js <outdir> <count> <masterSeed> <condition zero|few> [--caps reduced] [--model id]
// One model call per site. Re-prompt only on schema-invalid output (once) or on a selector collision (once). Deterministic repairs never call the model.
const { execFile } = require("child_process"), fs = require("fs"), path = require("path");
const C = require("./dist/composition.js"), L = require("./library.js"), D = require("./directives.js"), P = require("./prompt.js"), { compile, FULL_CAPS, REDUCED_CAPS } = require("./compile.js");
global.window = global; require("../proof-a1/sites.js"); const { VOCAB } = require("../proof-a1/vocab.js");
const [outdir, countArg, seedArg, condArg] = process.argv.slice(2); const MASTER = Number(seedArg || 20260912), COND = condArg || "zero";
const COUNT = process.argv.includes("--batches") ? 3 * Number(process.argv[process.argv.indexOf("--batches") + 1]) : Number(countArg || 60);
const CAPS = process.argv.includes("--caps") && process.argv[process.argv.indexOf("--caps") + 1] === "reduced" ? REDUCED_CAPS : FULL_CAPS;
const MODEL = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "claude-sonnet-5";
const FIXED_DIRECTIVE = process.argv.includes("--directive-seed") ? Number(process.argv[process.argv.indexOf("--directive-seed") + 1]) : null;   // mode-collapse test: one directive, many seeds
const FIXED_INTENT = process.argv.includes("--intent-seed") ? Number(process.argv[process.argv.indexOf("--intent-seed") + 1]) : null;
const BATCHES = process.argv.includes("--batches") ? Number(process.argv[process.argv.indexOf("--batches") + 1]) : null;   // planner mode: sibling batches of three
const PL = require("./planner.js");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",").map(Number) : null;   // re-run specific indices (1-based ids) after an infrastructure failure, same seeds
const PAR = 4; fs.mkdirSync(path.join(outdir, "raw"), { recursive: true }); fs.mkdirSync(path.join(outdir, "specs"), { recursive: true });
const hash = (...p) => { let h = 2166136261; for (const ch of p.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
function intentFor(seed) {   // DesignIntent sampled from the A.1 vocabulary (the proof is about the tree, not the intent call)
  const r = D.mulberry(seed); const family = pick(r, Object.keys(VOCAB.families)); const F = VOCAB.families[family];
  const hierarchy = pick(r, F.hierarchies); const category = pick(r, F.categories);
  let pairings = Object.keys(VOCAB.typography).filter(k => VOCAB.typography[k].category === category && (hierarchy !== "monumental" || VOCAB.typography[k].holdsAtMonumental));
  if (!pairings.length) pairings = Object.keys(VOCAB.typography).filter(k => VOCAB.typography[k].holdsAtMonumental);
  const typography = pick(r, pairings);
  return { family, tonalDirection: pick(r, VOCAB.tones), typography, typographyCategory: VOCAB.typography[typography].category, typographyObject: VOCAB.typography[typography], density: pick(r, VOCAB.densities),
    composition: { asymmetry: pick(r, VOCAB.composition.asymmetry), hierarchy, rhythm: pick(r, VOCAB.composition.rhythm), sectionContrast: pick(r, VOCAB.composition.sectionContrast), ornament: pick(r, F.ornaments) },
    pageSystem: { border: pick(r, F.borders), card: pick(r, F.cards), button: pick(r, F.buttons), borderWeight: pick(r, [1, 2, 3]), displayTracking: pick(r, VOCAB.mapping.hierarchy[hierarchy].displayTracking) } };
}
function callModel(system, user) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile("claude", ["-p", user, "--system-prompt", system, "--model", MODEL, "--output-format", "json", "--no-session-persistence", "--tools", "", "--max-turns", "1"], { cwd: path.join(outdir), maxBuffer: 32 * 1024 * 1024, timeout: 240000 }, (err, stdout, stderr) => {
      let text = "", usage = null, cost = null;
      try { const j = JSON.parse(stdout); text = j.result || ""; usage = j.usage; cost = j.total_cost_usd; } catch (e) { text = stdout; }
      resolve({ text, usage, cost, ms: Date.now() - t0, error: err ? String(err).slice(0, 200) : null, stderr: (stderr || "").slice(0, 300) });
    });
  });
}
function parseJson(text) { const s = text.indexOf("{"), e = text.lastIndexOf("}"); if (s < 0 || e < 0) return null; try { return JSON.parse(text.slice(s, e + 1)); } catch (e) { return null; } }

async function one(i) {
  const id = String(i + 1).padStart(2, "0");
  let seed, di, directive, batch = null, forbiddenTokens = [];
  if (BATCHES !== null) { const b = Math.floor(i / 3), k = i % 3; const plan = PL.planBatch(MASTER, b); const sib = plan.siblings[k]; seed = sib.seed; di = sib.designIntent; directive = sib.directive; forbiddenTokens = sib.forbiddenTokens; batch = { index: b, sibling: k, batchSeed: plan.batchSeed, allowedTokens: sib.allowedTokens, forbiddenTokens }; }
  else { seed = hash(MASTER, COND, i); di = intentFor(FIXED_INTENT !== null ? FIXED_INTENT : seed); directive = D.sample(FIXED_DIRECTIVE !== null ? FIXED_DIRECTIVE : seed + 1); }
  const rec = { id, seed, condition: COND, model: MODEL, batch, designIntent: { family: di.family, tonalDirection: di.tonalDirection, typography: di.typography, density: di.density, composition: di.composition }, directive, calls: [] };
  const prompt = P.build({ caps: CAPS, designIntent: di, directive, condition: COND, seed, forbiddenTokens });
  let res = await callModel(prompt.system, prompt.user); rec.calls.push({ kind: "initial", ms: res.ms, usage: res.usage, cost: res.cost, error: res.error });
  fs.writeFileSync(path.join(outdir, "raw", `${id}-1.txt`), res.text);
  let raw = parseJson(res.text); let schema = raw ? C.validateSchema(raw) : { ok: false, errors: [{ rule: "schema.parse", path: "", detail: "not JSON" }] };
  rec.schemaValidFirst = schema.ok; rec.schemaErrorsFirst = schema.ok ? [] : schema.errors.slice(0, 10);
  if (!schema.ok) {   // the one permitted re-prompt for schema-invalid output
    res = await callModel(prompt.system, prompt.user + "\n\n" + P.reprompt(schema.errors)); rec.calls.push({ kind: "reprompt-schema", ms: res.ms, usage: res.usage, cost: res.cost, error: res.error });
    fs.writeFileSync(path.join(outdir, "raw", `${id}-2.txt`), res.text); raw = parseJson(res.text); schema = raw ? C.validateSchema(raw) : { ok: false, errors: [{ rule: "schema.parse", path: "" }] };
  }
  rec.schemaValid = schema.ok; rec.schemaErrors = schema.ok ? [] : schema.errors.slice(0, 10);
  if (!schema.ok) { rec.fallback = "library"; const row = L.A1_SITES[seed % L.A1_SITES.length]; raw = L.page(row[1], row[2], row[3], row[4], row[5], row[6]); }
  if (batch && schema.ok) { const viol = PL.tokenViolations(raw, forbiddenTokens); rec.tokenViolationsFirst = viol;
    if (viol.length) { const res2 = await callModel(prompt.system, prompt.user + `\n\nYour previous response used ${viol.join(", ")}, which this candidate may not use. Return the corrected CompositionTree JSON only.`); rec.calls.push({ kind: "reprompt-token", ms: res2.ms, usage: res2.usage, cost: res2.cost, error: res2.error });
      fs.writeFileSync(path.join(outdir, "raw", `${id}-token.txt`), res2.text); const raw2 = parseJson(res2.text); const s2 = raw2 ? C.validateSchema(raw2) : { ok: false };
      if (s2.ok) { raw = raw2; rec.tokenViolationsAfterReprompt = PL.tokenViolations(raw, forbiddenTokens); } else rec.tokenViolationsAfterReprompt = viol; } }
  rec.rawTree = raw;
  const c = compile({ raw, caps: CAPS, designIntent: di, pageSystem: di.pageSystem, seed, id, source: rec.fallback || "model", forbiddenTokens });
  rec.repairValid = c.repairValid; rec.violationsBefore = c.violationsBefore; rec.remaining = c.remaining; rec.spec = c.spec; rec.title = `${id} · ${di.family} · ${di.tonalDirection} · ${COND}`;
  rec.prompt = prompt; return rec;
}
(async () => {
  if (BATCHES !== null && !ONLY) { /* COUNT follows from batches */ }
  const prior = ONLY && fs.existsSync(path.join(outdir, "results.json")) ? JSON.parse(fs.readFileSync(path.join(outdir, "results.json"), "utf8")) : null;
  const todo = ONLY ? ONLY.map(x => x - 1) : Array.from({ length: COUNT }, (_, i) => i);
  const results = prior ? prior.map(p => ({ ...p })) : []; let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < todo.length) { const i = todo[next++]; const r = await one(i); if (prior) r.rerunAfterInfraFailure = true; results[i] = r; console.log(`${r.id} schema:${r.schemaValid ? "ok" : "FAIL"}${r.schemaValidFirst ? "" : " (reprompted)"} repair:${r.repairValid ? "ok" : "FAIL"} violations:${r.violationsBefore} repairs:${JSON.stringify(r.spec.repairSummary)} ${r.fallback ? "FALLBACK" : ""}`); } }));
  // selector: reject collisions against already-accepted candidates; one re-prompt per collision, then library fallback
  const accepted = [];
  for (const r of results) {
    const sig = { tree: r.spec.composition, category: r.spec.designIntent.typographyCategory, tone: r.spec.designIntent.tonalDirection };
    const worst = accepted.reduce((m, a) => Math.max(m, C.similarity(sig, { tree: a.spec.composition, category: a.spec.designIntent.typographyCategory, tone: a.spec.designIntent.tonalDirection }, "desktop"), C.similarity(sig, { tree: a.spec.composition, category: a.spec.designIntent.typographyCategory, tone: a.spec.designIntent.tonalDirection }, "mobile")), 0);
    r.nearestAtAccept = worst; r.collision = worst >= C.SIG_WEIGHTS.threshold || worst >= 0.7;
    if (r.collision && !r.fallback) {
      const near = accepted.filter(a => Math.max(C.similarity(sig, { tree: a.spec.composition, category: a.spec.designIntent.typographyCategory, tone: a.spec.designIntent.tonalDirection }, "desktop")) >= 0.7).map(a => C.skeleton(a.spec.composition, "desktop").heroString).slice(0, 3);
      const di = intentFor(FIXED_INTENT !== null ? FIXED_INTENT : r.seed); const prompt = P.build({ caps: CAPS, designIntent: di, directive: r.directive, condition: COND, seed: r.seed, avoid: near });
      const res = await callModel(prompt.system, prompt.user); r.calls.push({ kind: "reprompt-collision", ms: res.ms, usage: res.usage, cost: res.cost, error: res.error });
      fs.writeFileSync(path.join(outdir, "raw", `${r.id}-collision.txt`), res.text); const raw = parseJson(res.text); const schema = raw ? C.validateSchema(raw) : { ok: false };
      if (schema.ok) { const c = compile({ raw, caps: CAPS, designIntent: di, pageSystem: di.pageSystem, seed: r.seed, id: r.id, source: "model-recollision" }); const sig2 = { tree: c.spec.composition, category: di.typographyCategory, tone: di.tonalDirection };
        const worst2 = accepted.reduce((m, a) => Math.max(m, C.similarity(sig2, { tree: a.spec.composition, category: a.spec.designIntent.typographyCategory, tone: a.spec.designIntent.tonalDirection }, "desktop"), C.similarity(sig2, { tree: a.spec.composition, category: a.spec.designIntent.typographyCategory, tone: a.spec.designIntent.tonalDirection }, "mobile")), 0);
        r.collisionRetry = { schemaValid: true, nearest: worst2, resolved: worst2 < 0.7 }; if (worst2 < 0.7) { r.firstTree = r.spec.composition; r.spec = c.spec; r.repairValid = c.repairValid; r.nearestAtAccept = worst2; } }
      else r.collisionRetry = { schemaValid: false, resolved: false };
      if (!r.collisionRetry.resolved) r.selectorFallback = "kept-with-collision";   // no curation: keep the model's tree and report the collision; production would fall back to the library
    }
    accepted.push(r);
  }
  fs.writeFileSync(path.join(outdir, "results.json"), JSON.stringify(results.map(r => ({ ...r, prompt: undefined })), null, 1));
  if (results[0].prompt) fs.writeFileSync(path.join(outdir, "prompt-sample.txt"), results[0].prompt.system + "\n\n=====\n\n" + results[0].prompt.user);
  console.log("done", results.length);
})();
