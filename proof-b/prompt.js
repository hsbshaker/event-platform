// Composition prompt builder. The primitive spec and the rules are generated from composition.ts (single source of truth).
const C = require("./dist/composition.js"), L = require("./library.js"), D = require("./directives.js");
const BRIEF = `Event: a winter baby shower for a boy. Title: "Baby Shaker is on the way" (6 words). Hosts: Haseeb & Shezia. Date: Saturday, December 19, 2026 (day numeral 19; Dec 2026). Time: 1:00–5:00 PM. Venue: The Lodge at Hanson Park, Aldie, Virginia. Description: one sentence. RSVP deadline: December 1.
Design brief: Ralph Lauren-inspired winter lodge; navy, cream and forest green; motifs from the library only (plaid, stripe, gingham, linen patterns; equestrian, botanical, celestial glyph arrangements).`;
function capsText(caps) {
  const on = Object.entries(caps).filter(([, v]) => v).map(([k]) => k), off = Object.entries(caps).filter(([, v]) => !v).map(([k]) => k);
  return `Enabled for this event: ${on.join(", ")}.${off.length ? ` NOT available (do not reference): ${off.join(", ")}.` : ""}`;
}
function intentText(di) {
  return `DesignIntent (already chosen, honour it): family ${di.family}; tone ${di.tonalDirection}; typography ${di.typography} (${di.typographyCategory}); density ${di.density}; composition: asymmetry ${di.composition.asymmetry}, hierarchy ${di.composition.hierarchy}, rhythm ${di.composition.rhythm}, sectionContrast ${di.composition.sectionContrast}, ornament ${di.composition.ornament}.`;
}
function build({ caps, designIntent, directive, condition, seed, avoid }) {
  const system = `You are the composition author for an event website generator. You design the page's structure as a CompositionTree: a JSON tree of trusted layout primitives with semantic leaves bound to the event's content. You do not write HTML, CSS, JavaScript, copy, colors, sizes in pixels, or fonts; the compiler owns all of that. You own nesting, grouping, hierarchy (emphasis), relative size (ratio, width, extent tokens), section order and surfaces, alignment, structural motif placement, and mobile intent.
Respond with the JSON object only. No prose, no markdown fences, no comments.`;
  const parts = [BRIEF, capsText(caps), intentText(designIntent),
    `Primitives (every property value must be one of the listed tokens; unknown keys are rejected):\n${C.specText(caps)}`,
    `Rules (violations are repaired by the compiler, but a tree that needs no repair is better):\n${C.rulesText(caps)}`,
    `Design direction for this candidate (a nudge, not a template; realize it in your own structure): ${D.describe(directive)}`,
    `Aim for a composition a good designer would be proud of: one clear dominant object on the first screen, deliberate hierarchy, no clutter (a hero rarely needs more than 12 nodes), sections that read as one system.`];
  if (avoid && avoid.length) parts.push(`Do NOT reproduce these hero skeletons (already used by sibling candidates): ${avoid.map(a => `"${a}"`).join("; ")}. Make the hero structurally different.`);
  if (condition === "few") {
    const r = D.mulberry(seed + 99); const pick = [...L.A1_SITES].sort(() => r() - 0.5).slice(0, 3);
    parts.push(`Three example trees (for format only; do not copy their structure):\n` + pick.map(row => JSON.stringify(L.page(row[1], row[2], row[3], row[4], row[5], row[6]))).join("\n"));
  } else {
    parts.push(`Format example (structure is deliberately trivial; do not copy it):\n` + JSON.stringify({ version: "composition_v1", sections: [{ kind: "hero", surface: "base", fill: "screen", root: { t: "Stack", children: [{ t: "Eyebrow" }, { t: "EventTitle", emphasis: "display" }, { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] }, { t: "CTA", target: "rsvp" }] } }, { kind: "rsvp", surface: "alt", root: { t: "Stack", children: [{ t: "SectionHeading", for: "rsvp" }, { t: "RSVP" }] } }, { kind: "registry", surface: "base", root: { t: "Stack", children: [{ t: "SectionHeading", for: "registry" }, { t: "Registry", layout: { t: "Stack", children: [{ t: "RegistryItem", kind: "gift" }] } }] } }] }));
  }
  parts.push(`Output: the CompositionTree JSON only.`);
  return { system, user: parts.join("\n\n") };
}
function reprompt(errors) { return `Your previous response was rejected by the schema validator. Errors:\n${errors.slice(0, 12).map(e => `- ${e.rule} at ${e.path}: ${e.detail || ""}`).join("\n")}\nReturn the corrected CompositionTree JSON only.`; }
module.exports = { build, reprompt, BRIEF };
