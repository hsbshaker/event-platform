// Deterministic compile pipeline (no model calls): schema → structural repair → content-fit estimate → canonicalize → layout → spec.
// verify.js then checks content fit against rendered DOM geometry and applies verified demotions.
const C = require("./dist/composition.js"), L = require("./library.js");
const CONTENT = { eyebrow: "A baby shower for our little boy", title: "Baby Shaker is on the way", hosts: "Hosted with love by Haseeb & Shezia", date: "Saturday, December 19, 2026", dayNumeral: "19", monthShort: "Dec", year: "2026", weekday: "Saturday", time: "1:00–5:00 PM", venue: "The Lodge at Hanson Park", location: "Aldie, Virginia", description: "An afternoon of good food, warm company, and celebrating our little boy.", deadline: "Kindly respond by December 1", initial: "B" };
const FULL_CAPS = { rsvp: true, registry: true, gifts: true, externalRegistry: true, cashFund: true, hosts: true, description: true, time: true, location: true, deadline: true };
const REDUCED_CAPS = { rsvp: true, registry: false, gifts: false, externalRegistry: false, cashFund: false, hosts: true, description: false, time: true, location: true, deadline: true };
const FIT_METRICS = (di) => ({ desktop: { displayPx: { display: { restrained: 54, editorial: 83, dramatic: 110, monumental: 141 }[di.composition.hierarchy], primary: { restrained: 31, editorial: 41, dramatic: 51, monumental: 61 }[di.composition.hierarchy], secondary: 16, caption: 11 }, avgCharEm: di.typographyCategory === "grotesk_led" ? .56 : .5, widthPx: 1120 }, mobile: { displayPx: { display: { restrained: 32, editorial: 42, dramatic: 51, monumental: 61 }[di.composition.hierarchy], primary: { restrained: 24, editorial: 29, dramatic: 32, monumental: 35 }[di.composition.hierarchy], secondary: 16, caption: 11 }, avgCharEm: di.typographyCategory === "grotesk_led" ? .56 : .5, widthPx: 358 } });
const macros = (seed) => ({ hero: s => L.HEROES[L.heroKeys[(s + seed) % L.heroKeys.length]](), rsvpSection: s => ({ kind: "rsvp", surface: "base", root: L.RSVPS[Object.keys(L.RSVPS)[(s + seed) % 5]]() }), registrySection: (s, caps) => C.DEFAULT_MACROS.registrySection(s, caps) });

function compile({ raw, caps = FULL_CAPS, designIntent, pageSystem, seed = 1, id = "00", source = "model" }) {
  const schema = C.validateSchema(raw);
  if (!schema.ok) return { id, source, schemaValid: false, schemaErrors: schema.errors };
  const violationsBefore = C.validateStructure(raw, caps);
  const rep = C.repair(raw, caps, seed, macros(seed));
  const fit = C.estimateFit(rep.tree, CONTENT, FIT_METRICS(designIntent));
  const canon = C.canonicalize(fit.tree);
  const layout = C.resolveLayout(canon.tree, designIntent.density);
  const repairs = [...rep.repairs, ...fit.repairs];
  return {
    id, source, schemaValid: true, repairValid: rep.remaining.length === 0, violationsBefore: violationsBefore.length, remaining: rep.remaining,
    spec: { version: "resolved_v2", designIntent, pageSystem, typography: designIntent.typographyObject, composition: canon.tree, compositionHash: canon.hash, layout, content: CONTENT, seed, capabilities: caps,
      compilerRepairs: repairs, repairSummary: repairs.reduce((o, r) => { o[r.kind] = (o[r.kind] || 0) + 1; return o; }, {}), verified: null,
      versions: { primitiveSet: "composition_v1", compiler: "proof-b-0.1", compositionPrompt: "composition_v1_p1", compositionSchema: "composition_v1" } },
  };
}
module.exports = { compile, CONTENT, FULL_CAPS, REDUCED_CAPS, FIT_METRICS };
