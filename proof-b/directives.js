// Structural directives: diversity nudges assembled from independent dimensions, not a layout library.
// A directive is one value per dimension, sampled by seed. compliance() measures each dimension from the tree separately.
(function (root) {
  const DIMENSIONS = {
    opening:    ["title", "numeral", "monogram", "field"],            // what dominates the first screen
    structure:  ["Split", "Rail", "Grid", "Overlay", "Frame", "Stack"], // the hero's primary container
    date:       ["inline", "numeral", "column", "cell"],              // how the date is treated
    motif:      ["field", "band", "frame", "divider", "none"],        // structural motif use
    surface:    ["base", "contrast", "object"],                       // hero surface; object = a contrast plate inside
    details:    ["folded", "own"],                                    // details folded into the hero or their own section
    rsvpIntro:  ["beside", "above", "band"],                          // where the RSVP heading sits
    registry:   ["featured", "grid", "list", "split"],                // Registry.layout in primitive terms
  };
  const PHRASE = {
    opening: { title: "the title is the dominant object on the first screen", numeral: "the day numeral is the dominant object on the first screen, larger than the title", monogram: "a monogram opens the page above or behind the title", field: "a large patterned field is the dominant object on the first screen" },
    structure: { Split: "the hero is built on a Split", Rail: "the hero is built on a Rail", Grid: "the hero is built on a ruled Grid", Overlay: "the hero is built on an Overlay with a decorative object", Frame: "the hero is built on a Frame", Stack: "the hero is a plain Stack with no columns" },
    date: { inline: "the date reads inline with time and venue", numeral: "the date is shown as a large numeral", column: "the date sits in its own narrow column", cell: "the date sits in its own ruled cell" },
    motif: { field: "use a patterned MotifField", band: "use a MotifBand", frame: "the motif fills a frame margin", divider: "the only ornament is a glyph divider", none: "no motif at all" },
    surface: { base: "the hero sits on the base surface", contrast: "the hero sits on the contrast surface", object: "the hero is a contrast object (Surface) on the base surface" },
    details: { folded: "fold the event details into the hero; no separate details section", own: "give the details their own section" },
    rsvpIntro: { beside: "the RSVP heading sits beside the form", above: "the RSVP heading sits above the form", band: "the RSVP heading is an accent band" },
    registry: { featured: "Registry.layout is a Split with the gift RegistryItem (emphasis featured) on the wide side and the other items stacked on the narrow side", grid: "Registry.layout is a Grid with one RegistryItem per Cell and no featured item", list: "Registry.layout is a Stack of RegistryItems (rendered as a ruled list)", split: "Registry.layout is a Split with one RegistryItem on each side and no featured item" },
  };
  function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sample(seed) { const r = mulberry(seed); const d = {}; for (const [k, vals] of Object.entries(DIMENSIONS)) d[k] = vals[Math.floor(r() * vals.length)]; return d; }
  function describe(d) { return Object.keys(DIMENSIONS).map(k => PHRASE[k][d[k]]).join("; ") + "."; }
  const combos = Object.values(DIMENSIONS).reduce((n, v) => n * v.length, 1);

  // ---- compliance: each dimension measured independently from the (canonical) tree ----
  function find(n, pred, out = []) { if (!n || typeof n !== "object") return out; if (Array.isArray(n)) { n.forEach(x => find(x, pred, out)); return out; } if (pred(n)) out.push(n); for (const k of ["root", "children", "child", "rail", "content", "decoration", "layout"]) { const v = n[k]; if (Array.isArray(v)) v.forEach(c => find(c, pred, out)); else if (v && typeof v === "object") find(v, pred, out); } return out; }
  function compliance(tree, d) {
    const hero = tree.sections.find(s => s.kind === "hero"); const h = hero.root; const c = {};
    const numeralDisplay = find(h, n => n.t === "Date" && n.form === "numeral" && (n.emphasis === "display" || n.emphasis === undefined)).length > 0;
    const monogram = find(h, n => n.t === "Monogram").length > 0;
    const bigField = find(h, n => n.t === "MotifField" && (n.extent === "full" || n.extent === "half" || n.extent === undefined)).length > 0 || (h.t === "Overlay" && h.decoration.t === "MotifField");
    c.opening = d.opening === "numeral" ? numeralDisplay : d.opening === "monogram" ? monogram : d.opening === "field" ? bigField : !(numeralDisplay || monogram);
    const primary = h.t === "Overlay" ? h.t : h.t === "Surface" || h.t === "Frame" && d.structure !== "Frame" ? (h.child && h.child.t) || h.t : h.t;
    c.structure = h.t === d.structure || primary === d.structure || (d.structure !== "Stack" && find(h, n => n.t === d.structure).length > 0 && h.t !== "Stack") || (d.structure === "Stack" && h.t === "Stack" && !find(h, n => ["Split", "Rail", "Grid", "Overlay"].includes(n.t)).length);
    const dates = find(h, n => n.t === "Date");
    const inCluster = find(h, n => n.t === "Cluster" && n.children.some(x => x.t === "Date")).length > 0;
    const inRail = find(h, n => n.t === "Rail" && find(n.rail, x => x.t === "Date").length).length > 0 || find(h, n => n.t === "Split" && n.children.some(ch => find(ch, x => x.t === "Date").length && !find(ch, x => x.t === "EventTitle").length && Number(n.ratio) <= 50 === (ch === n.children[0]))).length > 0;
    const inCell = find(h, n => n.t === "Cell" && find(n.child, x => x.t === "Date").length).length > 0;
    c.date = d.date === "numeral" ? dates.some(x => x.form === "numeral") : d.date === "column" ? inRail : d.date === "cell" ? inCell : inCluster;
    const motifs = { field: find(h, n => n.t === "MotifField").length > 0, band: find(h, n => n.t === "MotifBand").length > 0, frame: find(h, n => n.t === "Frame" && n.motif).length > 0, divider: find(h, n => n.t === "Rule" && n.glyphs).length > 0 };
    c.motif = d.motif === "none" ? !motifs.field && !motifs.band && !motifs.frame : d.motif === "divider" ? motifs.divider && !motifs.field && !motifs.band : motifs[d.motif];
    const object = find(h, n => n.t === "Surface" && n.role === "contrast").length > 0;
    c.surface = d.surface === "object" ? object && hero.surface !== "contrast" : hero.surface === d.surface && !object;
    const hasDetails = tree.sections.some(s => s.kind === "details");
    c.details = d.details === "own" ? hasDetails : !hasDetails;
    const rs = tree.sections.find(s => s.kind === "rsvp");
    if (rs) { const r = rs.root; const band = find(r, n => n.t === "Surface" && n.role === "accent" && find(n, x => x.t === "SectionHeading").length).length > 0; const beside = r.t === "Split" || find(r, n => n.t === "Split" && n.children.some(ch => ch.t === "RSVP" || find(ch, x => x.t === "RSVP").length)).length > 0; c.rsvpIntro = d.rsvpIntro === "band" ? band : d.rsvpIntro === "beside" ? beside && !band : !beside && !band; } else c.rsvpIntro = null;
    const reg = find(tree.sections, n => n.t === "Registry")[0];
    if (reg) { const lay = reg.layout; const featured = find(reg, n => n.t === "RegistryItem" && n.emphasis === "featured").length > 0; c.registry = d.registry === "featured" ? lay.t === "Split" && featured : d.registry === "grid" ? lay.t === "Grid" && !featured : d.registry === "list" ? lay.t === "Stack" : lay.t === "Split" && !featured; } else c.registry = null;
    return c;
  }
  const Directives = { DIMENSIONS, PHRASE, combos, sample, describe, compliance, mulberry };
  root.Directives = Directives; if (typeof module !== "undefined") module.exports = Directives;
})(typeof window !== "undefined" ? window : globalThis);
