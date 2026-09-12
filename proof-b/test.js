// Phase B unit tests: schema validity, structural validity, repair to zero remaining violations, library expressiveness (validity),
// canonicalization stability, signature sanity. Exit code 1 on any failure.
const C = require("./dist/composition.js"), L = require("./library.js"), A = require("./fixtures/adversarial.js");
const FULL = { rsvp: true, registry: true, gifts: true, externalRegistry: true, cashFund: true, hosts: true, description: true, time: true, location: true, deadline: true };
let fails = 0; const ok = (cond, msg) => { if (!cond) { fails++; console.log("  FAIL", msg); } };

console.log("library: 27 silhouettes + 13 section recipes + 16 A.1 pages are schema-valid and structure-valid");
for (const k of L.heroKeys) { const tree = { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: L.HEROES[k]() }, { kind: "rsvp", surface: "base", root: L.RSVPS.rsvp_typographic_stack() }, { kind: "registry", surface: "alt", root: L.REGISTRIES.registry_tiles() }] }; ok(C.validateSchema(tree).ok, k + " schema"); ok(C.validateStructure(tree, FULL).length === 0, k + " structure " + JSON.stringify(C.validateStructure(tree, FULL)[0])); }
for (const r of L.A1_SITES) { const tree = L.page(r[1], r[2], r[3], r[4], r[5], r[6]); ok(C.validateSchema(tree).ok, "site " + r[0]); ok(C.validateStructure(tree, FULL).length === 0, "site " + r[0] + " structure"); const c1 = C.canonicalize(tree), c2 = C.canonicalize(c1.tree); ok(c1.hash === c2.hash, "canonicalize idempotent " + r[0]); }

console.log("schema-invalid payloads are rejected (re-prompt path)");
for (const f of A.schemaInvalid) { const s = C.validateSchema(f.tree); ok(!s.ok, "should reject: " + f.name); if (!s.ok) console.log("  rejected:", f.name, "→", s.errors[0].rule, s.errors[0].path); }

console.log("structural fixtures parse, violate, and repair to zero remaining (deterministic, no model call)");
const summary = {};
for (const f of A.structural) {
  const caps = f.caps || FULL; const s = C.validateSchema(f.tree); ok(s.ok, "adversarial must be schema-valid: " + f.name + " " + JSON.stringify(s.errors[0]));
  const before = C.validateStructure(f.tree, caps); ok(before.length > 0, "should violate: " + f.name);
  const r = C.repair(f.tree, caps, 7); ok(r.remaining.length === 0, "unrepaired: " + f.name + " → " + JSON.stringify(r.remaining.slice(0, 3)));
  const after = C.validateSchema(r.tree); ok(after.ok, "repair produced schema-invalid tree: " + f.name + " " + JSON.stringify(after.errors[0]));
  const kinds = r.repairs.reduce((o, x) => { o[x.kind] = (o[x.kind] || 0) + 1; return o; }, {});
  console.log(`  ${r.remaining.length === 0 ? "ok " : "!! "} ${f.name}: ${before.length} violations → ${r.repairs.length} repairs ${JSON.stringify(kinds)}`);
  summary[f.name] = { violations: before.length, repairs: r.repairs.length, kinds, remaining: r.remaining.length };
}
console.log("specific repairs behave as specified");
{ const r = C.repair(A.structural.find(f => f.name.startsWith("Frame in Frame")).tree, FULL); const root = r.tree.sections[0].root; ok(root.t === "Frame" && root.child.t === "Stack" && !JSON.stringify(root.child).includes('"Frame"'), "frame in frame → inner Stacks"); }
{ const r = C.repair(A.structural.find(f => f.name.startsWith("RSVP on the 38")).tree, FULL); ok(r.tree.sections[1].root.ratio === "50", "component split share → 50"); }
{ const r = C.repair(A.structural.find(f => f.name.startsWith("no EventTitle")).tree, FULL); ok(JSON.stringify(r.tree.sections[0].root).includes('"EventTitle"'), "missing title → hero macro"); ok(r.repairs.some(x => x.kind === "coverage"), "logged as coverage"); }
{ const f = A.structural.find(f => f.name.startsWith("capabilities: Hosts")); const r = C.repair(f.tree, f.caps); const s = JSON.stringify(r.tree); ok(!s.includes('"Hosts"') && !s.includes('"Description"') && !s.includes('"CashFund"') && !s.includes('"Registry"'), "unavailable capabilities dropped"); ok(r.repairs.filter(x => x.kind === "capability").length >= 4, "capability repairs logged separately: " + r.repairs.filter(x => x.kind === "capability").length); }
{ const r = C.repair(A.structural.find(f => f.name.startsWith("Split keep with the RSVP")).tree, FULL); ok(r.tree.sections[1].root.mobile === "stack", "keep demoted to stack"); ok(r.repairs.some(x => x.kind === "responsive"), "logged as responsive"); }
{ const r = C.repair(A.structural.find(f => f.name.startsWith("73 nodes")).tree, FULL); ok(C.countNodes(r.tree.sections[0].root) <= 40, "node budget enforced: " + C.countNodes(r.tree.sections[0].root)); }

{ const r = C.repair(A.structural.find(f => f.name.startsWith("three nested boxes")).tree, FULL); let maxBoxes = 0; C.walk(r.tree, ({ ancestors, node }) => { if (node.t === "Frame" || node.t === "Surface") maxBoxes = Math.max(maxBoxes, ancestors.filter(a => a.t === "Frame" || a.t === "Surface").length + 1); }); ok(maxBoxes <= 2, "box depth capped at two: " + maxBoxes); ok(r.repairs.some(x => x.rule === "boxes.depth"), "box-depth repair logged"); }
console.log("attractive tokens: detectors and neutralizers");
{ const t = L.page("statement_stack:cascade", "details_grid", "rsvp_typographic_stack", "registry_tiles", "SP1_dark_opening", "start"); const PL = require("./planner.js"); ok(PL.tokenViolations(t, ["staggerTitle"]).length === 1, "stagger detected"); const reps = PL.neutralize(t, ["staggerTitle"]); ok(reps.length === 1 && reps[0].kind === "planner" && !PL.tokenViolations(t, ["staggerTitle"]).length, "stagger neutralized and logged as planner"); }
{ const t = L.page("statement_numeral:numeral_left", "details_grid", "rsvp_typographic_stack", "registry_tiles", "SP1_dark_opening", "start"); const PL = require("./planner.js"); ok(PL.tokenViolations(t, ["heroNumeral"]).length === 1, "hero numeral detected"); PL.neutralize(t, ["heroNumeral"]); ok(!PL.tokenViolations(t, ["heroNumeral"]).length && C.validateStructure(t, FULL).length === 0, "numeral neutralized to a valid tree"); }
{ const PL = require("./planner.js"); const b = PL.planBatch(20260920, 0); const s = b.siblings; ok(new Set(s.map(x => x.designIntent.family)).size === 3, "siblings: three families"); ok(new Set(s.map(x => x.designIntent.tonalDirection)).size === 3, "siblings: three tones"); ok(new Set(s.map(x => x.directive.structure)).size === 3, "siblings: three structures"); ok(s.filter(x => x.allowedTokens.includes("staggerTitle")).length === 1, "stagger allotted to exactly one sibling"); }
console.log("signature: mirror siblings collide, distinct recipes do not, library pages stay below threshold");
const heroTree = k => ({ version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: L.HEROES[k]() }] });
ok(C.heroSimilarity(heroTree("editorial_daterail:rail_left"), heroTree("editorial_daterail:rail_right")) >= 0.7, "mirror pair is near-identical");
ok(C.heroSimilarity(heroTree("editorial_split:field_right"), heroTree("invitation_ticket:stub_right")) < 0.7, "split vs ticket distinct");
ok(C.heroSimilarity(heroTree("typography_first:band_below"), heroTree("statement_numeral:numeral_left")) < 0.7, "poster vs numeral distinct");
{ global.window = global; require("../proof-a1/sites.js"); const { VOCAB } = require("../proof-a1/vocab.js");
  const pages = L.A1_SITES.map(r => { const site = SITES.find(s => s.id === r[0]); return { tree: L.page(r[1], r[2], r[3], r[4], r[5], r[6]), category: VOCAB.typography[site.typography].category, tone: site.tonalDirection }; });
  let max = 0; for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) max = Math.max(max, C.similarity(pages[i], pages[j], "desktop"), C.similarity(pages[i], pages[j], "mobile"));
  ok(max < 0.7, "A.1 pages max similarity " + max); console.log("  A.1 pages max pairwise similarity:", max); }

require("fs").writeFileSync("fixtures/adversarial-results.json", JSON.stringify(summary, null, 1));
console.log(fails ? `\n${fails} FAILURES` : "\nall tests passed"); process.exit(fails ? 1 : 0);
