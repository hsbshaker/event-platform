// Gate 2 generator: seeded selection over the Phase A.1 vocabulary with a structural-signature check.
// No manual curation. Every choice is constrained by vocab.js rules and derived from the seed.
// Usage: node generate.js [count] [masterSeed] [--no-reject] [--no-cap]
const { VOCAB, DATA, fits, signature, similarity } = require("./vocab.js");
const fs = require("fs");

const COUNT = Number(process.argv[2] || 60), MASTER = Number(process.argv[3] || 20260912);
const REJECT = !process.argv.includes("--no-reject");
const THRESH = VOCAB.signature.threshold, MAX_TRIES = 60;
// Batch planner rule (Phase A critique #5): a hero silhouette (hero:variant) may not repeat more than
// ceil(count / silhouettes) + 1 times in one batch. Disable with --no-cap.
const SILHOUETTES = Object.values(VOCAB.heroRecipes).reduce((n, h) => n + h.variants.length, 0);
const VARIANT_CAP = process.argv.includes("--no-cap") ? Infinity : Math.ceil(COUNT / SILHOUETTES) + 1;

// deterministic PRNG (mulberry32) with namespaced sub-seeds
function hash(...parts) { let h = 2166136261; for (const p of parts.join("|")) { h ^= p.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const inter = (a, b) => b ? a.filter(x => b.includes(x)) : a;

function genSite(index, attempt) {
  const seed = hash(MASTER, index, attempt), r = rng(seed), repairs = [];
  const profile = DATA.contentProfile;
  const family = pick(r, Object.keys(VOCAB.families)); const F = VOCAB.families[family];
  const heroIds = Object.keys(VOCAB.heroRecipes).filter(id => VOCAB.heroRecipes[id].family === family && fits(VOCAB.heroRecipes[id], profile));
  const heroRecipe = pick(r, heroIds); const H = VOCAB.heroRecipes[heroRecipe]; const req = H.requires || {};
  const heroVariant = pick(r, H.variants);
  const composition = {
    asymmetry:       pick(r, inter(VOCAB.composition.asymmetry, req.asymmetry)),
    hierarchy:       pick(r, inter(inter(VOCAB.composition.hierarchy, F.hierarchies), req.hierarchy)),
    rhythm:          pick(r, inter(VOCAB.composition.rhythm, req.rhythm)),
    sectionContrast: pick(r, inter(VOCAB.composition.sectionContrast, req.sectionContrast)),
    ornament:        pick(r, inter(inter(VOCAB.composition.ornament, F.ornaments), req.ornament)),
  };
  const tonalDirection = pick(r, VOCAB.tones);
  const axis = pick(r, inter(F.axes, req.axes));
  // surface plan: rhythm must match; contrast preferred, relaxed with a logged repair
  let plans = Object.keys(VOCAB.surfacePlans).filter(k => VOCAB.surfacePlans[k].rhythm === composition.rhythm && VOCAB.surfacePlans[k].contrast === composition.sectionContrast);
  if (!plans.length) { plans = Object.keys(VOCAB.surfacePlans).filter(k => VOCAB.surfacePlans[k].rhythm === composition.rhythm); repairs.push("plan: contrast relaxed"); }
  const surfacePlan = pick(r, plans); const plan = VOCAB.surfacePlans[surfacePlan];
  const pageSystem = { axis, surfacePlan, border: pick(r, F.borders), card: pick(r, F.cards), button: pick(r, F.buttons) };
  const okAxis = (rec) => !rec.requires?.axes || rec.requires.axes.includes(axis);
  const detailsRecipe = pick(r, Object.keys(VOCAB.detailsRecipes).filter(k => okAxis(VOCAB.detailsRecipes[k])));
  const rsvpRecipe = pick(r, Object.keys(VOCAB.rsvpRecipes).filter(k => okAxis(VOCAB.rsvpRecipes[k]) && !(VOCAB.rsvpRecipes[k].excludes?.surfaces || []).includes(plan.rsvp)));
  const registryRecipe = pick(r, Object.keys(VOCAB.registryRecipes).filter(k => okAxis(VOCAB.registryRecipes[k])));
  // typography: family category, monumental needs a face that holds
  let category = pick(r, F.categories);
  let pairings = Object.keys(VOCAB.typography).filter(k => VOCAB.typography[k].category === category && (composition.hierarchy !== "monumental" || VOCAB.typography[k].holdsAtMonumental));
  if (!pairings.length) { const cats = F.categories.filter(c => Object.values(VOCAB.typography).some(t => t.category === c && t.holdsAtMonumental)); category = pick(r, cats); pairings = Object.keys(VOCAB.typography).filter(k => VOCAB.typography[k].category === category); repairs.push("typography: category repaired for monumental"); }
  const typography = pick(r, pairings);
  const density = pick(r, VOCAB.densities);
  const M = VOCAB.mapping, C = VOCAB.parameters.cosmetic;
  let heroSplit = pick(r, M.asymmetry[composition.asymmetry].heroSplit); if (heroRecipe === "editorial_offset") heroSplit = 0.62;
  const parameters = {
    heroSplit, heroHeight: pick(r, C.heroHeight), alignOffset: pick(r, M.asymmetry[composition.asymmetry].alignOffset), measure: pick(r, C.measure),
    bandHeight: pick(r, M.rhythm[composition.rhythm].bandHeight), motifScale: pick(r, C.motifScale),
    motifOpacity: pick(r, C.motifOpacity.filter(o => o <= M.ornament[composition.ornament].opacity)), borderWeight: pick(r, C.borderWeight),
    displayTracking: pick(r, ["invitation_monogram", "invitation_ticket"].includes(heroRecipe) ? [0.06, 0.14] : M.hierarchy[composition.hierarchy].displayTracking),
  };
  // motifs: fill hero slots with role-compatible motifs under the ornament budget
  const cap = M.ornament[composition.ornament]; const motifs = []; const used = new Set();
  const slots = [...H.slots].sort(() => r() - 0.5);
  for (const slot of slots) {
    if (motifs.length >= cap.max) break;
    const options = Object.keys(VOCAB.motifs).filter(id => VOCAB.motifs[id].roles.includes(slot) && !used.has(id) && (cap.arrangement || VOCAB.motifs[id].kind === "pattern"));
    if (!options.length) continue; const id = pick(r, options); used.add(id); motifs.push({ id, slot });
  }
  const label = { light: "Airy", mid: "Warm", dark: "Deep" }[tonalDirection] + " " + H.name;
  return { id: String(index + 1).padStart(2, "0"), name: label, family, tonalDirection, heroRecipe, heroVariant, detailsRecipe, rsvpRecipe, registryRecipe, stateRecipe: "state_quiet", pageSystem, composition, typography, density, parameters, motifs, seed, attempt, repairs };
}

const accepted = [], log = [];
for (let i = 0; i < COUNT; i++) {
  let best = null, bestScore = Infinity, tries = 0;
  for (let attempt = 0; attempt < (REJECT ? MAX_TRIES : 1); attempt++) {
    tries++; const cand = genSite(i, attempt);
    let worst = accepted.reduce((m, s) => Math.max(m, similarity(cand, s, "desktop"), similarity(cand, s, "mobile")), 0);
    const silhouetteCount = accepted.filter(s => s.heroRecipe === cand.heroRecipe && s.heroVariant === cand.heroVariant).length;
    if (REJECT && silhouetteCount >= VARIANT_CAP) worst = Math.max(worst, 1);   // over the silhouette cap counts as a full collision
    if (worst < bestScore) { best = cand; bestScore = worst; }
    if (!REJECT || worst < THRESH) break;
  }
  best.rerolls = tries - 1; best.nearestAtAccept = bestScore; if (REJECT && bestScore >= THRESH) best.repairs.push("signature: accepted best-of after max tries");
  accepted.push(best); log.push({ id: best.id, rerolls: best.rerolls, nearestAtAccept: bestScore });
}

// stats
const pairs = []; for (let i = 0; i < accepted.length; i++) for (let j = i + 1; j < accepted.length; j++) pairs.push({ a: accepted[i].id, b: accepted[j].id, d: similarity(accepted[i], accepted[j], "desktop"), m: similarity(accepted[i], accepted[j], "mobile") });
const count = (arr, f) => arr.reduce((n, x) => n + (f(x) ? 1 : 0), 0);
const nn = mode => accepted.map(s => Math.max(...pairs.filter(p => p.a === s.id || p.b === s.id).map(p => p[mode]))).sort((a, b) => a - b);
const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
const tally = f => accepted.reduce((o, s) => { const k = f(s); o[k] = (o[k] || 0) + 1; return o; }, {});
const classKey = s => [s.heroRecipe, s.heroVariant, s.pageSystem.surfacePlan, VOCAB.typography[s.typography].category].join("+");
const classes = tally(classKey);
const stats = {
  count: COUNT, masterSeed: MASTER, rejection: REJECT, threshold: THRESH, silhouettes: SILHOUETTES, variantCap: isFinite(VARIANT_CAP) ? VARIANT_CAP : null,
  silhouetteUsage: { max: Math.max(...Object.values(tally(s => s.heroRecipe + ":" + s.heroVariant))), distinct: Object.keys(tally(s => s.heroRecipe + ":" + s.heroVariant)).length },
  pairsTotal: pairs.length,
  pairsAtOrAboveThreshold: { desktop: count(pairs, p => p.d >= THRESH), mobile: count(pairs, p => p.m >= THRESH) },
  pairsAtOrAbove060: { desktop: count(pairs, p => p.d >= 0.60), mobile: count(pairs, p => p.m >= 0.60) },
  nearestNeighbour: { desktop: { p50: pct(nn("d"), .5), p90: pct(nn("d"), .9), max: pct(nn("d"), 1) }, mobile: { p50: pct(nn("m"), .5), p90: pct(nn("m"), .9), max: pct(nn("m"), 1) } },
  rerolls: { total: log.reduce((n, l) => n + l.rerolls, 0), max: Math.max(...log.map(l => l.rerolls)), sitesNeedingReroll: count(log, l => l.rerolls > 0), forcedAccepts: count(accepted, s => s.repairs.includes("signature: accepted best-of after max tries")) },
  heroUsage: tally(s => s.heroRecipe), variantUsage: tally(s => s.heroRecipe + ":" + s.heroVariant), familyUsage: tally(s => s.family), planUsage: tally(s => s.pageSystem.surfacePlan), axisUsage: tally(s => s.pageSystem.axis), categoryUsage: tally(s => VOCAB.typography[s.typography].category),
  skeletonClasses: { distinct: Object.keys(classes).length, largest: Math.max(...Object.values(classes)), sizes: Object.values(classes).sort((a, b) => b - a).slice(0, 10) },
  compilerRepairs: accepted.flatMap(s => s.repairs.map(r => ({ id: s.id, r }))),
};
const out = process.argv.includes("--no-reject") ? "gate2-raw" : process.argv.includes("--no-cap") ? "gate2-nocap" : "gate2";
fs.writeFileSync(`${out}-sites.js`, "window.GENERATED = " + JSON.stringify(accepted, null, 1) + ";\n");
fs.writeFileSync(`${out}-stats.json`, JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
