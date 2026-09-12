// Phase B library: the Phase A.1 recipes rewritten as CompositionTree fixtures.
// Jobs: expressiveness fixtures, rotated few-shot examples, repair macros, fallback, signature calibration.
(function (root) {
  const T = (t, p = {}) => ({ t, ...p });
  const stack = (children, p = {}) => ({ t: "Stack", children, ...p });
  const cluster = (children, p = {}) => ({ t: "Cluster", children, ...p });
  const split = (ratio, children, mobile = "stack", p = {}) => ({ t: "Split", ratio, mobile, children, ...p });
  const cell = (child, p = {}) => ({ t: "Cell", child, ...p });
  const field = (id, role = "field", p = {}) => ({ t: "MotifField", motif: { id, role }, ...p });
  const title = (p = {}) => ({ t: "EventTitle", emphasis: "display", ...p });
  const meta = () => cluster([T("Date", { form: "full" }), T("Time"), T("Venue")]);
  const copy = (extra = []) => stack([...extra, T("Eyebrow"), title(), T("Hosts"), meta(), T("CTA", { target: "rsvp" })]);

  // ---- 27 hero silhouettes: recipe:variant → root node (a hero Section's root) ----
  const HEROES = {
    "editorial_split:field_right": () => split("62", [copy([T("Glyph", { motif: "equestrian" })]), field("plaid")]),
    "editorial_split:field_left":  () => split("38", [field("linen"), copy([T("Glyph", { motif: "botanical" })])], "stack-reverse"),
    "editorial_masthead:rail_right": () => stack([T("Rule", { weight: "strong" }), cluster([T("Date", { form: "full" }), T("Venue"), T("Time")], { justify: "between" }), T("Rule", { weight: "hairline" }),
      T("Rail", { side: "end", width: "medium", rail: field("stripe", "band"), mobile: "bottom", child: stack([T("Eyebrow"), title(), T("Hosts")]) }), T("Rule", { weight: "hairline", glyphs: "botanical" }), cluster([T("Deadline"), T("CTA", { target: "rsvp" })], { justify: "between" })]),
    "editorial_masthead:rail_left": () => stack([T("Rule", { weight: "strong" }), cluster([T("Date", { form: "full" }), T("Venue"), T("Time")], { justify: "between" }), T("Rule", { weight: "hairline" }),
      T("Rail", { side: "start", width: "medium", rail: field("stripe", "band"), mobile: "top", child: stack([T("Eyebrow"), title(), T("Hosts")]) }), T("Rule", { weight: "hairline", glyphs: "botanical" }), cluster([T("Deadline"), T("CTA", { target: "rsvp" })], { justify: "between" })]),
    "editorial_masthead:band_top": () => stack([T("Rule", { weight: "strong" }), cluster([T("Date", { form: "full" }), T("Venue"), T("Time")], { justify: "between" }), T("Rule", { weight: "hairline" }),
      T("MotifBand", { motif: { id: "plaid", role: "band" }, height: "tall" }), stack([T("Eyebrow"), title(), T("Hosts")]), T("Rule", { weight: "hairline", glyphs: "equestrian" }), cluster([T("Deadline"), T("CTA", { target: "rsvp" })], { justify: "between" })]),
    "editorial_offset:plate_left": () => T("Overlay", { anchor: "bottom-start", extent: "half", mobile: "stack", decoration: field("gingham"),
      content: split("38", [stack([T("Date", { form: "full" }), T("Time"), T("Venue"), T("Hosts")], { gap: "tight" }), stack([T("Glyph", { motif: "equestrian" }), T("Eyebrow"), title(), T("CTA", { target: "rsvp" })])], "stack-reverse", { align: "start" }) }),
    "editorial_offset:plate_right": () => T("Overlay", { anchor: "bottom-end", extent: "half", mobile: "stack", decoration: field("gingham"),
      content: split("62", [stack([T("Glyph", { motif: "equestrian" }), T("Eyebrow"), title(), T("CTA", { target: "rsvp" })]), stack([T("Date", { form: "full" }), T("Time"), T("Venue"), T("Hosts")], { gap: "tight", align: "end" })], "stack", { align: "start" }) }),
    "editorial_daterail:rail_left": () => T("Rail", { side: "start", width: "wide", mobile: "top", rail: stack([T("Date", { form: "month-year" }), T("Date", { form: "numeral", emphasis: "display" }), T("Time"), T("Venue")]),
      child: stack([T("Glyph", { motif: "celestial" }), T("Eyebrow"), title(), T("Hosts"), T("CTA", { target: "rsvp" })]) }),
    "editorial_daterail:rail_right": () => T("Rail", { side: "end", width: "wide", mobile: "top", rail: stack([T("Date", { form: "month-year" }), T("Date", { form: "numeral", emphasis: "display" }), T("Time"), T("Venue")]),
      child: stack([T("Glyph", { motif: "celestial" }), T("Eyebrow"), title(), T("Hosts"), T("CTA", { target: "rsvp" })]) }),
    "editorial_rulegrid:cells": () => T("Grid", { columns: 3, ruled: true, mobile: 2, children: [cell(stack([T("Eyebrow"), title()]), { span: 2 }), cell(stack([T("Glyph", { motif: "equestrian" }), T("Hosts")])), cell(T("Date", { form: "full", emphasis: "primary" })), cell(T("Time", { emphasis: "primary" })), cell(stack([T("Venue", { emphasis: "primary" }), T("Location"), T("CTA", { target: "rsvp" })]))] }),
    "editorial_rulegrid:columns": () => T("Grid", { columns: 4, ruled: true, mobile: 2, children: [cell(stack([T("Eyebrow"), title()]), { span: 4 }), cell(stack([T("Glyph", { motif: "equestrian" }), T("Hosts")])), cell(T("Date", { form: "full", emphasis: "primary" })), cell(T("Time", { emphasis: "primary" })), cell(stack([T("Venue", { emphasis: "primary" }), T("Location"), T("CTA", { target: "rsvp" })]))] }),
    "framed_invitation:thin_frame": () => T("Frame", { rule: "hairline", inset: "tight", motif: { id: "linen", role: "frame" }, child: stack([T("Glyph", { motif: "equestrian" }), T("Eyebrow"), title(), T("Hosts"), cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "center" }), T("CTA", { target: "rsvp" })], { align: "center" }) }),
    "framed_invitation:deep_margin": () => T("Frame", { rule: "hairline", inset: "deep", motif: { id: "plaid", role: "frame" }, child: stack([T("Glyph", { motif: "celestial" }), T("Eyebrow"), title(), T("Hosts"), cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "center" }), T("CTA", { target: "rsvp" })], { align: "center" }) }),
    "invitation_card:floating": () => T("Overlay", { anchor: "center", extent: "full", mobile: "keep", decoration: field("linen"),
      content: T("Frame", { rule: "none", inset: "deep", child: T("Surface", { role: "contrast", inset: "deep", child: stack([T("Eyebrow"), title(), T("Rule", { weight: "hairline", glyphs: "botanical" }), cluster([T("Date", { form: "full" }), T("Time")], { justify: "center" }), cluster([T("Venue"), T("Location")], { justify: "center" }), T("Hosts"), T("CTA", { target: "rsvp" })], { align: "center" }) }) }) }),
    "invitation_card:sheet": () => stack([T("MotifBand", { motif: { id: "linen", role: "band" }, height: "tall" }), T("Surface", { role: "contrast", inset: "deep", child: stack([T("Eyebrow"), title(), T("Rule", { weight: "hairline", glyphs: "botanical" }), cluster([T("Date", { form: "full" }), T("Time")], { justify: "center" }), cluster([T("Venue"), T("Location")], { justify: "center" }), T("Hosts"), T("CTA", { target: "rsvp" })], { align: "center" }) }), T("MotifBand", { motif: { id: "linen", role: "band" }, height: "tall" })], { gap: "tight" }),
    "invitation_monogram:crest": () => stack([T("Monogram", { style: "ring" }), T("Rule", { weight: "hairline" }), T("Eyebrow"), title({ emphasis: "primary", case: "upper" }), T("Hosts"), T("Rule", { weight: "hairline", glyphs: "celestial" }), split("50", [stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")], { align: "center" }), stack([T("Venue", { emphasis: "primary" }), T("Location")], { align: "center" })]), T("CTA", { target: "rsvp" })], { align: "center" }),
    "invitation_monogram:watermark": () => T("Overlay", { anchor: "center", extent: "half", mobile: "keep", decoration: T("Monogram", { style: "watermark" }),
      content: stack([T("Eyebrow"), title({ emphasis: "primary", case: "upper" }), T("Hosts"), T("Rule", { weight: "hairline", glyphs: "celestial" }), split("50", [stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")], { align: "center" }), stack([T("Venue", { emphasis: "primary" }), T("Location")], { align: "center" })]), T("CTA", { target: "rsvp" })], { align: "center" }) }),
    "invitation_ticket:stub_right": () => T("Overlay", { anchor: "center", extent: "full", mobile: "keep", decoration: field("plaid", "frame"),
      content: T("Frame", { rule: "none", inset: "normal", child: T("Surface", { role: "contrast", inset: "normal", child: split("62", [stack([T("Eyebrow"), title({ emphasis: "primary" }), T("Rule", { weight: "hairline", glyphs: "celestial" }), T("Hosts"), T("Venue")], { align: "center" }), stack([T("Date", { form: "numeral", emphasis: "display" }), T("Date", { form: "month-year" }), T("Time"), T("CTA", { target: "rsvp" })], { align: "center" })], "stack", { divider: "dashed" }) }) }) }),
    "invitation_ticket:stub_left": () => T("Overlay", { anchor: "center", extent: "full", mobile: "keep", decoration: field("plaid", "frame"),
      content: T("Frame", { rule: "none", inset: "normal", child: T("Surface", { role: "contrast", inset: "normal", child: split("38", [stack([T("Date", { form: "numeral", emphasis: "display" }), T("Date", { form: "month-year" }), T("Time"), T("CTA", { target: "rsvp" })], { align: "center" }), stack([T("Eyebrow"), title({ emphasis: "primary" }), T("Rule", { weight: "hairline", glyphs: "celestial" }), T("Hosts"), T("Venue")], { align: "center" })], "stack-reverse", { divider: "dashed" }) }) }) }),
    "typography_first:band_below": () => stack([T("Eyebrow"), title({ case: "upper" }), T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "medium" }), cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "between" }), T("CTA", { target: "rsvp" })]),
    "typography_first:band_above": () => stack([T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "tall" }), T("Eyebrow"), title({ case: "upper" }), cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "between" }), T("CTA", { target: "rsvp" })]),
    "typography_first:band_rail": () => T("Rail", { side: "start", width: "thin", mobile: "top", rail: field("gingham", "band"), child: stack([T("Eyebrow"), title({ case: "upper" }), cluster([T("Date", { form: "full" }), T("Time"), T("Venue")], { justify: "between" }), T("CTA", { target: "rsvp" })]) }),
    "statement_stack:alternate": () => T("Rail", { side: "start", width: "thin", mobile: "top", rail: stack([T("Date", { form: "full" }), T("Venue")]), child: stack([title({ layout: "stagger" }), cluster([T("Eyebrow"), T("Hosts"), T("Time")], { justify: "between" }), cluster([T("Glyph", { motif: "celestial" }), T("CTA", { target: "rsvp" })], { justify: "end" })]) }),
    "statement_stack:cascade": () => T("Rail", { side: "start", width: "thin", mobile: "top", rail: stack([T("Date", { form: "full" }), T("Venue")]), child: stack([title({ layout: "cascade" }), cluster([T("Eyebrow"), T("Hosts"), T("Time")], { justify: "between" }), cluster([T("Glyph", { motif: "celestial" }), T("CTA", { target: "rsvp" })], { justify: "end" })]) }),
    "statement_numeral:numeral_left": () => split("38", [stack([T("Date", { form: "month-year" }), T("Date", { form: "numeral", emphasis: "display" }), T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "tall" })]), stack([T("Eyebrow"), title({ emphasis: "primary" }), T("Hosts"), cluster([T("Time"), T("Venue"), T("Location")]), T("CTA", { target: "rsvp" })])], "keep"),
    "statement_numeral:numeral_top": () => stack([split("38", [T("Date", { form: "numeral", emphasis: "display" }), T("MotifBand", { motif: { id: "stripe", role: "band" }, height: "tall" })], "keep", { align: "center" }), T("Rule", { weight: "strong" }), stack([T("Date", { form: "month-year" }), T("Eyebrow"), title({ emphasis: "primary" }), T("Hosts"), cluster([T("Time"), T("Venue"), T("Location")]), T("CTA", { target: "rsvp" })])]),
  };

  // ---- section recipes ----
  const DETAILS = {
    details_split_panel: () => split("38", [T("Surface", { role: "accent", child: stack([T("SectionHeading", { for: "details" }), T("Description")]) }), T("Frame", { rule: "hairline", inset: "normal", child: stack([stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")]), T("Rule", { weight: "hairline" }), stack([T("Venue", { emphasis: "primary" }), T("Location")])]) })]),
    details_stacked: () => stack([T("SectionHeading", { for: "details" }), T("Description"), T("Rule", { weight: "hairline" }), stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")], { align: "center" }), T("Rule", { weight: "hairline" }), stack([T("Venue", { emphasis: "primary" }), T("Location")], { align: "center" }), T("Rule", { weight: "hairline" })], { align: "center" }),
    details_grid: () => stack([T("SectionHeading", { for: "details" }), T("Description"), T("Grid", { columns: 3, ruled: true, mobile: 1, children: [cell(T("Date", { form: "full", emphasis: "primary" })), cell(T("Time", { emphasis: "primary" })), cell(stack([T("Venue", { emphasis: "primary" }), T("Location")]))] })]),
    details_sidebar_rows: () => stack([T("Rule", { weight: "hairline" }), split("38", [T("SectionHeading", { for: "details" }), T("Description")]), T("Rule", { weight: "hairline" }), split("38", [T("Date", { form: "full", emphasis: "primary" }), T("Time")]), T("Rule", { weight: "hairline" }), split("38", [T("Venue", { emphasis: "primary" }), T("Location")]), T("Rule", { weight: "hairline" })]),
  };
  const RSVPS = {
    rsvp_contrast_split:    () => split("38", [stack([T("SectionHeading", { for: "rsvp" }), T("Deadline")]), T("RSVP")]),
    rsvp_contained_card:    () => T("Frame", { rule: "hairline", inset: "normal", child: stack([T("SectionHeading", { for: "rsvp" }), T("Deadline"), T("RSVP")]) }),
    rsvp_edge_interruption: () => stack([T("SectionHeading", { for: "rsvp", emphasis: "display" }), T("RSVP")]),
    rsvp_typographic_stack: () => stack([T("SectionHeading", { for: "rsvp" }), T("Deadline"), T("RSVP")]),
    rsvp_wide_heading:      () => stack([T("Surface", { role: "accent", child: stack([T("Deadline"), T("SectionHeading", { for: "rsvp" })]) }), split("38", [T("Glyph", { motif: "botanical" }), T("RSVP")])]),
  };
  const REGISTRIES = {
    registry_featured:       () => stack([T("SectionHeading", { for: "registry" }), T("Registry", { layout: split("62", [T("RegistryItem", { kind: "gift", emphasis: "featured" }), stack([T("RegistryItem", { kind: "external" }), T("RegistryItem", { kind: "cashfund" })])]) })]),
    registry_tiles:          () => stack([T("SectionHeading", { for: "registry" }), T("Registry", { layout: T("Grid", { columns: 3, mobile: 1, children: [cell(T("RegistryItem", { kind: "gift" })), cell(T("RegistryItem", { kind: "external" })), cell(T("RegistryItem", { kind: "cashfund" }))] }) })]),
    registry_editorial_list: () => stack([T("SectionHeading", { for: "registry" }), T("Registry", { layout: stack([T("RegistryItem", { kind: "gift" }), T("RegistryItem", { kind: "external" }), T("RegistryItem", { kind: "cashfund" })]) })]),
    registry_uneven_grid:    () => stack([T("SectionHeading", { for: "registry" }), T("Registry", { layout: T("Grid", { columns: 3, mobile: 1, children: [cell(T("RegistryItem", { kind: "gift", emphasis: "featured" }), { rowSpan: 2 }), cell(T("RegistryItem", { kind: "external" })), cell(T("RegistryItem", { kind: "cashfund" }))] }) })]),
  };
  // Surface plans as section surface sequences (fallbacks and examples).
  const PLANS = {
    SP1_dark_opening:     { hero: "contrast", band: null,    details: "base", rsvp: "contrast", registry: "base",     axis: "start" },
    SP2_continuous_light: { hero: "base",     band: null,    details: "base", rsvp: "alt",      registry: "base",     axis: "start" },
    SP3_interrupted:      { hero: "base",     band: "alt",   details: "base", rsvp: "contrast", registry: "alt",      axis: "start" },
    SP4_alternating:      { hero: "contrast", band: null,    details: "alt",  rsvp: "base",     registry: "contrast", axis: "start" },
    SP5_framed_body:      { hero: "base",     band: null,    details: "base", rsvp: "base",     registry: "base",     axis: "start" },
    SP6_deepening:        { hero: "base",     band: null,    details: "alt",  rsvp: "alt",      registry: "contrast", axis: "start" },
  };
  function page(heroKey, details, rsvp, registry, plan, align = "start", bandMotif = "linen") {
    const P = PLANS[plan]; const secs = [{ kind: "hero", surface: P.hero, align, fill: "screen", root: HEROES[heroKey]() }];
    if (P.band) secs.push({ kind: "band", surface: P.band, root: { t: "MotifBand", motif: { id: bandMotif, role: "band" }, height: "tall" } });
    secs.push({ kind: "details", surface: P.details, align, root: DETAILS[details]() });
    secs.push({ kind: "rsvp", surface: P.rsvp, align, root: RSVPS[rsvp]() });
    secs.push({ kind: "registry", surface: P.registry, align, root: REGISTRIES[registry]() });
    return { version: "composition_v1", sections: secs };
  }
  // The sixteen A.1 sites as trees (hero variant, sections, plan, axis), so the library can be rendered against the A.1 shots.
  const A1_SITES = [
    ["01", "editorial_split:field_right", "details_split_panel", "rsvp_contrast_split", "registry_featured", "SP1_dark_opening", "start"],
    ["02", "framed_invitation:thin_frame", "details_stacked", "rsvp_typographic_stack", "registry_tiles", "SP5_framed_body", "center"],
    ["03", "typography_first:band_below", "details_grid", "rsvp_typographic_stack", "registry_uneven_grid", "SP3_interrupted", "start"],
    ["04", "editorial_masthead:rail_right", "details_sidebar_rows", "rsvp_edge_interruption", "registry_editorial_list", "SP2_continuous_light", "start"],
    ["05", "editorial_offset:plate_left", "details_sidebar_rows", "rsvp_contained_card", "registry_uneven_grid", "SP4_alternating", "start"],
    ["06", "invitation_card:floating", "details_grid", "rsvp_typographic_stack", "registry_tiles", "SP6_deepening", "center"],
    ["07", "invitation_monogram:crest", "details_stacked", "rsvp_edge_interruption", "registry_featured", "SP2_continuous_light", "center"],
    ["08", "statement_stack:alternate", "details_split_panel", "rsvp_edge_interruption", "registry_editorial_list", "SP4_alternating", "start"],
    ["09", "editorial_split:field_left", "details_grid", "rsvp_typographic_stack", "registry_tiles", "SP6_deepening", "start"],
    ["10", "framed_invitation:deep_margin", "details_grid", "rsvp_contained_card", "registry_editorial_list", "SP1_dark_opening", "center"],
    ["11", "typography_first:band_rail", "details_sidebar_rows", "rsvp_wide_heading", "registry_featured", "SP5_framed_body", "start"],
    ["12", "editorial_masthead:band_top", "details_split_panel", "rsvp_contrast_split", "registry_uneven_grid", "SP3_interrupted", "start"],
    ["13", "editorial_daterail:rail_left", "details_grid", "rsvp_wide_heading", "registry_uneven_grid", "SP4_alternating", "start"],
    ["14", "invitation_ticket:stub_right", "details_stacked", "rsvp_contained_card", "registry_tiles", "SP6_deepening", "center"],
    ["15", "statement_numeral:numeral_left", "details_split_panel", "rsvp_contrast_split", "registry_editorial_list", "SP1_dark_opening", "start"],
    ["16", "editorial_rulegrid:cells", "details_sidebar_rows", "rsvp_edge_interruption", "registry_featured", "SP2_continuous_light", "start"],
  ];
  const LIBRARY = { HEROES, DETAILS, RSVPS, REGISTRIES, PLANS, page, A1_SITES, heroKeys: Object.keys(HEROES) };
  root.LIBRARY = LIBRARY; if (typeof module !== "undefined") module.exports = LIBRARY;
})(typeof window !== "undefined" ? window : globalThis);
