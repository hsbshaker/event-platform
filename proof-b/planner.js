// Batch planner: three sibling candidates per batch get meaningfully different DesignIntents, different composition directives,
// and an allotment of attractive tokens (diversity controls scoped to the batch). Seeded, deterministic.
const C = require("./dist/composition.js"), D = require("./directives.js");
global.window = global; require("../proof-a1/sites.js"); const { VOCAB } = require("../proof-a1/vocab.js");
const pick = (r, a) => a[Math.floor(r() * a.length)];
const CAPS_PER_BATCH = { staggerTitle: 1, heroNumeral: 1, watermark: 1 };   // at most N of 3 siblings may use each attractive token
function intentFor(seed, avoid) {   // avoid: { families, tones, categories, hierarchies } already used by siblings
  const r = D.mulberry(seed); const not = (list, used) => { const free = list.filter(x => !used.includes(x)); return free.length ? free : list; };
  const family = pick(r, not(Object.keys(VOCAB.families), avoid.families)); const F = VOCAB.families[family];
  const hierarchy = pick(r, not(F.hierarchies, avoid.hierarchies)); const category = pick(r, not(F.categories, avoid.categories));
  let pairings = Object.keys(VOCAB.typography).filter(k => VOCAB.typography[k].category === category && (hierarchy !== "monumental" || VOCAB.typography[k].holdsAtMonumental));
  if (!pairings.length) pairings = Object.keys(VOCAB.typography).filter(k => VOCAB.typography[k].holdsAtMonumental);
  const typography = pick(r, pairings);
  return { family, tonalDirection: pick(r, not(VOCAB.tones, avoid.tones)), typography, typographyCategory: VOCAB.typography[typography].category, typographyObject: VOCAB.typography[typography], density: pick(r, VOCAB.densities),
    composition: { asymmetry: pick(r, VOCAB.composition.asymmetry), hierarchy, rhythm: pick(r, VOCAB.composition.rhythm), sectionContrast: pick(r, VOCAB.composition.sectionContrast), ornament: pick(r, F.ornaments) },
    pageSystem: { border: pick(r, F.borders), card: pick(r, F.cards), button: pick(r, F.buttons), borderWeight: pick(r, [1, 2, 3]), displayTracking: pick(r, VOCAB.mapping.hierarchy[hierarchy].displayTracking) } };
}
function directiveFor(seed, avoid) {   // siblings differ on structure and opening at least
  let d = D.sample(seed); for (let i = 1; i < 40 && (avoid.structures.includes(d.structure) || avoid.openings.includes(d.opening)); i++) d = D.sample(seed + 1000 * i);
  return d;
}
function planBatch(masterSeed, batchIndex, size = 3) {
  const seed = C.fnv(`${masterSeed}|batch|${batchIndex}`); const r = D.mulberry(parseInt(seed, 16));
  const avoid = { families: [], tones: [], categories: [], hierarchies: [], structures: [], openings: [] }; const siblings = [];
  // allot attractive tokens: each token goes to at most CAPS_PER_BATCH siblings, chosen by seed
  const allot = {}; const start = Math.floor(r() * size); Object.entries(CAPS_PER_BATCH).forEach(([id, cap], i) => { allot[id] = [...Array(cap).keys()].map(j => (start + i + j) % size); });   // spread tokens across siblings
  for (let k = 0; k < size; k++) {
    const s = parseInt(C.fnv(`${seed}|sib|${k}`), 16); const di = intentFor(s, avoid); let directive = directiveFor(s + 7, avoid);
    // a directive must not ask for a token the sibling is not allotted
    if (!allot.heroNumeral.includes(k)) for (let i = 1; i < 60 && (directive.opening === "numeral" || directive.date === "numeral"); i++) directive = directiveFor(s + 7 + 1000 * i, avoid);
    if (!allot.heroNumeral.includes(k) && (directive.opening === "numeral" || directive.date === "numeral")) { directive = { ...directive, opening: directive.opening === "numeral" ? "title" : directive.opening, date: directive.date === "numeral" ? "inline" : directive.date }; }
    avoid.families.push(di.family); avoid.tones.push(di.tonalDirection); avoid.categories.push(di.typographyCategory); avoid.hierarchies.push(di.composition.hierarchy); avoid.structures.push(directive.structure); avoid.openings.push(directive.opening);
    const allowed = Object.keys(CAPS_PER_BATCH).filter(id => allot[id].includes(k));
    siblings.push({ seed: s, designIntent: di, directive, allowedTokens: allowed, forbiddenTokens: Object.keys(CAPS_PER_BATCH).filter(id => !allot[id].includes(k)) });
  }
  return { batchSeed: seed, siblings };
}
function tokenViolations(tree, forbidden) { return C.ATTRACTIVE_TOKENS.filter(t => forbidden.includes(t.id) && t.detect(tree)).map(t => t.id); }
function neutralize(tree, forbidden) { let repairs = []; for (const t of C.ATTRACTIVE_TOKENS) if (forbidden.includes(t.id) && t.detect(tree)) repairs = repairs.concat(t.neutralize(tree)); return repairs; }
module.exports = { planBatch, intentFor, directiveFor, tokenViolations, neutralize, CAPS_PER_BATCH };
