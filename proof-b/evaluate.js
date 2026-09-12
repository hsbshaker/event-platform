// Phase B metrics. Usage: node evaluate.js <runName> [<runName>...]  → model/<run>/metrics.json and a console table.
// Schema validity, deterministic-repair validity, and design quality (human test) are reported as separate metrics.
const fs = require("fs"), path = require("path");
const C = require("./dist/composition.js"), L = require("./library.js"), D = require("./directives.js");
const libTrees = L.heroKeys.map(k => ({ key: k, tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: L.HEROES[k]() }] } }));
const libSkeletons = new Set(libTrees.map(x => C.skeleton(x.tree, "desktop").heroString));
const pct = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null; };
const entropy = counts => { const n = Object.values(counts).reduce((a, b) => a + b, 0); return -Object.values(counts).reduce((s, c) => s + (c / n) * Math.log2(c / n), 0); };
function heroTypeCounts(trees) { const counts = {}; for (const t of trees) C.walk({ version: "composition_v1", sections: [t.sections.find(s => s.kind === "hero")] }, ({ node }) => { if (!["Cell"].includes(node.t)) counts[node.t] = (counts[node.t] || 0) + 1; }); return counts; }
function evaluate(run) {
  const dir = path.join("model", run); const file = fs.existsSync(path.join(dir, "results-verified.json")) ? "results-verified.json" : "results.json";
  const R = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); const n = R.length;
  const modelTrees = R.filter(r => !r.fallback);
  // 1. schema validity (raw model output, before any repair)
  const schema = { firstCallValid: R.filter(r => r.schemaValidFirst).length, afterRepromptValid: R.filter(r => r.schemaValid).length, fallbacks: R.filter(r => r.fallback).length, errorKinds: {} };
  for (const r of R) for (const e of (r.schemaErrorsFirst || [])) schema.errorKinds[e.rule] = (schema.errorKinds[e.rule] || 0) + 1;
  // 2. deterministic repair validity
  const repair = { repairValid: R.filter(r => r.repairValid).length, zeroViolations: R.filter(r => r.violationsBefore === 0).length, violationsBefore: { p50: pct(R.map(r => r.violationsBefore), .5), p90: pct(R.map(r => r.violationsBefore), .9), max: Math.max(...R.map(r => r.violationsBefore)) }, repairsByKind: {}, treesWithNoRepairs: 0, rulesHit: {} };
  for (const r of R) { const reps = r.spec.compilerRepairs || []; if (!reps.length) repair.treesWithNoRepairs++; for (const x of reps) { repair.repairsByKind[x.kind] = (repair.repairsByKind[x.kind] || 0) + 1; repair.rulesHit[x.rule] = (repair.rulesHit[x.rule] || 0) + 1; } }
  // 3. geometry verification
  const verified = R.filter(r => r.verified); const geometry = verified.length ? { verified: verified.length, overflowDesktop: verified.filter(r => r.verified.desktop.pageOverflow || r.verified.desktop.overflowingElements > 0 || r.verified.desktop.textOverflow > 0).length, overflowMobile: verified.filter(r => r.verified.mobile.pageOverflow || r.verified.mobile.overflowingElements > 0 || r.verified.mobile.textOverflow > 0).length, fitDemotionsTotal: verified.reduce((a, r) => a + r.verified.fitDemotions, 0), treesNeedingFit: verified.filter(r => r.verified.fitDemotions > 0).length, estimateVsVerified: { estimated: R.reduce((a, r) => a + (r.spec.repairSummary["fit-estimate"] || 0), 0), verified: verified.reduce((a, r) => a + r.verified.fitDemotions, 0) } } : null;
  // 4. novelty and invention
  const skel = R.map(r => ({ id: r.id, s: C.skeleton(r.spec.composition, "desktop").heroString, tree: r.spec.composition, model: !r.fallback }));
  const nearestLib = skel.map(x => Math.max(...libTrees.map(l => C.heroSimilarity(x.tree, l.tree))));
  const novel = skel.map((x, i) => nearestLib[i] < 0.7);
  const distinctAt = k => new Set(skel.slice(0, k).map(x => x.s)).size;
  const rarefaction = [10, 20, 30, 40, 50, 60].filter(k => k <= n).map(k => [k, distinctAt(k)]);
  const modelOnly = skel.filter(x => x.model);
  const invention = { novelHeroes: novel.filter(Boolean).length, novelRate: Math.round(100 * novel.filter(Boolean).length / n) / 100, nearestLibrary: { p50: pct(nearestLib, .5), p90: pct(nearestLib, .9), max: Math.max(...nearestLib), min: Math.min(...nearestLib) }, exactLibraryMatches: skel.filter(x => libSkeletons.has(x.s)).length, distinctHeroSkeletons: new Set(skel.map(x => x.s)).size, distinctModelHeroSkeletons: new Set(modelOnly.map(x => x.s)).size, rarefaction, largestSkeletonClass: Math.max(...Object.values(skel.reduce((o, x) => { o[x.s] = (o[x.s] || 0) + 1; return o; }, {}))) };
  const usage = heroTypeCounts(skel.map(x => x.tree)); const libUsage = heroTypeCounts(libTrees.map(x => x.tree));
  invention.heroPrimitiveUsage = usage; invention.heroPrimitiveEntropy = Math.round(entropy(usage) * 100) / 100; invention.libraryPrimitiveEntropy = Math.round(entropy(libUsage) * 100) / 100;
  invention.rootTypes = skel.reduce((o, x) => { const t = x.tree.sections[0].root.t; o[t] = (o[t] || 0) + 1; return o; }, {});
  // 5. directive compliance per dimension
  const compliance = {}; for (const dim of Object.keys(D.DIMENSIONS)) compliance[dim] = { met: 0, of: 0 };
  for (const r of R) { if (r.fallback) continue; const c = D.compliance(r.spec.composition, r.directive); for (const dim of Object.keys(c)) if (c[dim] !== null) { compliance[dim].of++; if (c[dim]) compliance[dim].met++; } }
  const complianceRate = Object.fromEntries(Object.entries(compliance).map(([k, v]) => [k, v.of ? Math.round(100 * v.met / v.of) / 100 : null]));
  // directives as hidden recipes? same directive dimension value → how many distinct hero skeletons
  const byStructure = {}; for (const r of R) { if (r.fallback) continue; const k = r.directive.structure; (byStructure[k] ||= new Set()).add(C.skeleton(r.spec.composition, "desktop").heroString); }
  const distinctPerStructureDirective = Object.fromEntries(Object.entries(byStructure).map(([k, s]) => [k, s.size]));
  // 6. selector and pairwise signature
  const sig = R.map(r => ({ tree: r.spec.composition, category: r.spec.designIntent.typographyCategory, tone: r.spec.designIntent.tonalDirection }));
  const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push({ d: C.similarity(sig[i], sig[j], "desktop"), m: C.similarity(sig[i], sig[j], "mobile") });
  const nn = mode => R.map((_, i) => Math.max(...pairs.filter((p, k) => { const a = Math.floor(k); return true; }).map(() => 0)));
  const nnOf = (i, mode) => { let m = 0; for (let j = 0; j < n; j++) if (j !== i) m = Math.max(m, C.similarity(sig[i], sig[j], mode)); return m; };
  const nnD = R.map((_, i) => nnOf(i, "desktop")), nnM = R.map((_, i) => nnOf(i, "mobile"));
  const selector = { pairsTotal: pairs.length, pairsAtOrAbove070: { desktop: pairs.filter(p => p.d >= .7).length, mobile: pairs.filter(p => p.m >= .7).length }, pairsAtOrAbove060: { desktop: pairs.filter(p => p.d >= .6).length, mobile: pairs.filter(p => p.m >= .6).length }, nearestNeighbour: { desktop: { p50: pct(nnD, .5), p90: pct(nnD, .9), max: Math.max(...nnD) }, mobile: { p50: pct(nnM, .5), p90: pct(nnM, .9), max: Math.max(...nnM) } }, collisionsAtAccept: R.filter(r => r.collision).length, resolvedByReprompt: R.filter(r => r.collisionRetry && r.collisionRetry.resolved).length, keptWithCollision: R.filter(r => r.selectorFallback).length };
  // 7. calls and cost
  const calls = R.flatMap(r => r.calls); const cost = { calls: calls.length, reprompts: calls.filter(c => c.kind !== "initial").length, totalUsd: Math.round(calls.reduce((a, c) => a + (c.cost || 0), 0) * 100) / 100, meanMs: Math.round(calls.reduce((a, c) => a + c.ms, 0) / calls.length), errors: calls.filter(c => c.error).length };
  const heroNodes = R.map(r => C.countNodes(r.spec.composition.sections[0].root)); const size = { heroNodes: { p50: pct(heroNodes, .5), max: Math.max(...heroNodes) }, sections: R.reduce((o, r) => { const k = r.spec.composition.sections.length; o[k] = (o[k] || 0) + 1; return o; }, {}), pageNodes: { p50: pct(R.map(r => r.spec.composition.sections.reduce((a, s) => a + C.countNodes(s.root), 0)), .5) } };
  const metrics = { run, count: n, model: R[0].model, condition: R[0].condition, schema, repair, geometry, invention, directives: { complianceRate, distinctPerStructureDirective, combos: D.combos }, selector, cost, size };
  fs.writeFileSync(path.join(dir, "metrics.json"), JSON.stringify(metrics, null, 2));
  return metrics;
}
const runs = process.argv.slice(2); const all = runs.map(evaluate);
for (const m of all) { console.log(`\n== ${m.run} (${m.count}, ${m.condition}, ${m.model})`); console.log(" schema:", JSON.stringify(m.schema)); console.log(" repair:", JSON.stringify({ repairValid: m.repair.repairValid, zeroViolations: m.repair.zeroViolations, noRepairs: m.repair.treesWithNoRepairs, byKind: m.repair.repairsByKind, violations: m.repair.violationsBefore })); console.log(" geometry:", JSON.stringify(m.geometry)); console.log(" invention:", JSON.stringify({ novel: m.invention.novelHeroes, rate: m.invention.novelRate, distinct: m.invention.distinctHeroSkeletons, largestClass: m.invention.largestSkeletonClass, exactLib: m.invention.exactLibraryMatches, nearestLib: m.invention.nearestLibrary, rarefaction: m.invention.rarefaction, entropy: [m.invention.heroPrimitiveEntropy, m.invention.libraryPrimitiveEntropy], roots: m.invention.rootTypes })); console.log(" directives:", JSON.stringify(m.directives)); console.log(" selector:", JSON.stringify(m.selector)); console.log(" cost:", JSON.stringify(m.cost), "size:", JSON.stringify(m.size)); }
