// Phase A.1 vocabulary. Shared by the browser harness and the node generator.
// Every recipe declares what it requires, what it excludes, its structural variants, its motif slots,
// and its content fit. The generator and the harness both read only this file for rules.
(function (root) {
  const VOCAB = {
    families: {
      editorial:  { axes: ["left", "alternating"],           borders: ["hairline", "accented", "double"], cards: ["outlined", "flat", "plate", "tinted"], buttons: ["solid_rounded", "solid_square", "underline"], categories: ["heritage", "transitional", "high_contrast_editorial", "soft_serif", "oldstyle", "grotesk_led"], hierarchies: ["restrained", "editorial", "dramatic", "monumental"], ornaments: ["none", "restrained", "decorative"] },
      invitation: { axes: ["center"],                         borders: ["double", "hairline"],             cards: ["outlined", "plate", "tinted"],          buttons: ["outline_square", "solid_square"],            categories: ["high_contrast_editorial", "heritage", "oldstyle", "transitional", "soft_serif"], hierarchies: ["restrained", "editorial", "dramatic"], ornaments: ["restrained", "decorative"] },
      statement:  { axes: ["left", "alternating", "center"], borders: ["accented", "none", "double"],     cards: ["tinted", "flat", "outlined"],           buttons: ["solid_square", "underline"],                 categories: ["grotesk_led", "high_contrast_editorial", "transitional", "heritage", "soft_serif"], hierarchies: ["dramatic", "monumental"], ornaments: ["none", "restrained"] },
    },

    // Hero recipes. `variants` is the structural parameter (admission rule: extremes change the grayscale silhouette).
    heroRecipes: {
      editorial_split:     { family: "editorial",  name: "Split",      slots: ["field", "accent"],  variants: ["field_right", "field_left"],          requires: { axes: ["left", "alternating"], asymmetry: ["gentle", "strong"] },                                                        contentFit: { titleWords: [2, 9] } },
      editorial_masthead:  { family: "editorial",  name: "Masthead",   slots: ["band", "divider"],  variants: ["rail_right", "rail_left", "band_top"], requires: { axes: ["left", "alternating"], asymmetry: ["gentle"], hierarchy: ["restrained", "editorial"] },                          contentFit: { titleWords: [2, 7] } },
      editorial_offset:    { family: "editorial",  name: "Offset",     slots: ["field", "accent"],  variants: ["plate_left", "plate_right"],           requires: { axes: ["left"], asymmetry: ["strong"], hierarchy: ["editorial", "dramatic"] },                                            contentFit: { titleWords: [3, 8] } },
      editorial_daterail:  { family: "editorial",  name: "Date rail",  slots: ["divider", "accent"], variants: ["rail_left", "rail_right"],            requires: { axes: ["left", "alternating"], asymmetry: ["gentle", "strong"], hierarchy: ["editorial", "dramatic"] },                   contentFit: { titleWords: [3, 8] } },
      editorial_rulegrid:  { family: "editorial",  name: "Rule grid",  slots: ["divider", "accent"], variants: ["cells", "columns"],                   requires: { axes: ["left", "alternating"], asymmetry: ["gentle"], hierarchy: ["restrained", "editorial", "dramatic"] },              contentFit: { titleWords: [2, 8] } },
      framed_invitation:   { family: "invitation", name: "Framed",     slots: ["frame", "accent"],  variants: ["thin_frame", "deep_margin"],           requires: { axes: ["center"], asymmetry: ["symmetric"], hierarchy: ["restrained", "editorial", "dramatic"], ornament: ["restrained", "decorative"] }, contentFit: { titleWords: [2, 9] } },
      invitation_card:     { family: "invitation", name: "Card",       slots: ["field", "divider"], variants: ["floating", "sheet"],                   requires: { axes: ["center"], asymmetry: ["symmetric"], hierarchy: ["restrained", "editorial"], sectionContrast: ["moderate", "high"], ornament: ["restrained", "decorative"] }, contentFit: { titleWords: [2, 8] } },
      invitation_monogram: { family: "invitation", name: "Monogram",   slots: ["accent", "divider"], variants: ["crest", "watermark"],                 requires: { axes: ["center"], asymmetry: ["symmetric"], hierarchy: ["restrained", "editorial"], ornament: ["restrained", "decorative"] }, contentFit: { titleWords: [2, 10] } },
      invitation_ticket:   { family: "invitation", name: "Ticket",     slots: ["frame", "divider"], variants: ["stub_right", "stub_left"],             requires: { axes: ["center"], asymmetry: ["symmetric"], hierarchy: ["restrained", "editorial"], ornament: ["restrained", "decorative"] }, contentFit: { titleWords: [2, 8] } },
      typography_first:    { family: "statement",  name: "Poster",     slots: ["band"],             variants: ["band_below", "band_above", "band_rail"], requires: { axes: ["left", "center"], asymmetry: ["gentle", "symmetric"], hierarchy: ["monumental", "dramatic"], ornament: ["none", "restrained"] }, contentFit: { titleWords: [2, 6] } },
      statement_stack:     { family: "statement",  name: "Stack",      slots: ["accent"],           variants: ["alternate", "cascade"],                requires: { axes: ["left", "alternating"], asymmetry: ["strong"], hierarchy: ["monumental"], ornament: ["none", "restrained"] },        contentFit: { titleWords: [4, 8] } },
      statement_numeral:   { family: "statement",  name: "Numeral",    slots: ["band", "accent"],   variants: ["numeral_left", "numeral_top"],         requires: { axes: ["left", "alternating"], asymmetry: ["gentle", "strong"], hierarchy: ["dramatic", "monumental"], ornament: ["none", "restrained"] }, contentFit: { titleWords: [2, 8] } },
    },

    detailsRecipes: {
      details_split_panel:  { requires: { axes: ["left", "alternating"] } },
      details_stacked:      { requires: { axes: ["center"] } },
      details_grid:         { requires: {} },
      details_sidebar_rows: { requires: { axes: ["left", "alternating"] } },
    },
    rsvpRecipes: {
      rsvp_contrast_split:     { requires: { axes: ["left", "alternating"] } },
      rsvp_contained_card:     { requires: {}, excludes: { surfaces: ["framed"] } },   // no frame within a frame
      rsvp_edge_interruption:  { requires: {} },
      rsvp_typographic_stack:  { requires: {} },
      rsvp_wide_heading:       { requires: { axes: ["left", "alternating"] } },
    },
    registryRecipes: {
      registry_featured:       { requires: {} },
      registry_tiles:          { requires: {} },
      registry_editorial_list: { requires: {} },
      registry_uneven_grid:    { requires: { axes: ["left", "alternating"] } },
    },
    stateRecipes: { state_quiet: { requires: {} } },

    // Surface plans tagged with the rhythm and contrast they express.
    surfacePlans: {
      SP1_dark_opening:     { rhythm: "alternating", contrast: "high",     hero: "contrast", band: null,    details: "base",   rsvp: "contrast", registry: "base",     state: "base" },
      SP2_continuous_light: { rhythm: "continuous",  contrast: "low",      hero: "base",     band: null,    details: "base",   rsvp: "framed",   registry: "base",     state: "alt" },
      SP3_interrupted:      { rhythm: "punctuated",  contrast: "moderate", hero: "base",     band: "field", details: "base",   rsvp: "contrast", registry: "alt",      state: "base" },
      SP4_alternating:      { rhythm: "alternating", contrast: "high",     hero: "contrast", band: null,    details: "alt",    rsvp: "base",     registry: "contrast", state: "alt" },
      SP5_framed_body:      { rhythm: "continuous",  contrast: "low",      hero: "framed",   band: null,    details: "framed", rsvp: "framed",   registry: "framed",   state: "framed" },
      SP6_deepening:        { rhythm: "alternating", contrast: "moderate", hero: "base",     band: null,    details: "alt",    rsvp: "alt",      registry: "contrast", state: "contrast" },
    },

    axes: ["left", "center", "alternating"],
    borderLanguages: ["none", "hairline", "double", "accented"],
    cardLanguages: ["flat", "outlined", "tinted", "plate"],
    buttonLanguages: ["solid_square", "solid_rounded", "outline_square", "underline"],
    tones: ["light", "mid", "dark"],
    densities: ["compact", "balanced", "spacious"],

    composition: {
      asymmetry:       ["symmetric", "gentle", "strong"],
      hierarchy:       ["restrained", "editorial", "dramatic", "monumental"],
      rhythm:          ["continuous", "alternating", "punctuated"],
      sectionContrast: ["low", "moderate", "high"],
      ornament:        ["none", "restrained", "decorative"],
    },
    // Composition → parameter bounds (the mapping tables at proof depth).
    mapping: {
      asymmetry: { symmetric: { heroSplit: [0.50], alignOffset: [0] }, gentle: { heroSplit: [0.38, 0.50, 0.62], alignOffset: [0, 1] }, strong: { heroSplit: [0.62], alignOffset: [2, 3] } },
      rhythm:    { continuous: { bandHeight: ["thin"] }, alternating: { bandHeight: ["thin", "medium", "tall"] }, punctuated: { bandHeight: ["medium", "tall"] } },
      ornament:  { none: { max: 1, arrangement: false, opacity: 0.22 }, restrained: { max: 2, arrangement: true, opacity: 0.22 }, decorative: { max: 3, arrangement: true, opacity: 0.35 } },
      hierarchy: { monumental: { displayTracking: [-0.05, -0.02] }, dramatic: { displayTracking: [-0.05, -0.02, 0] }, editorial: { displayTracking: [-0.02, 0, 0.06] }, restrained: { displayTracking: [0, 0.06, 0.14] } },
    },

    // Parameters, classified. Structural parameters count toward diversity; cosmetic parameters never do.
    parameters: {
      structural: { heroVariant: "per-recipe", heroSplit: [0.38, 0.50, 0.62] },
      cosmetic:   { heroHeight: ["compact", "standard", "full"], alignOffset: [0, 1, 2, 3], measure: ["narrow", "standard", "wide"], bandHeight: ["thin", "medium", "tall"], motifScale: [0.75, 1, 1.5, 2.25], motifOpacity: [0.08, 0.14, 0.22, 0.35], borderWeight: [1, 2, 3], displayTracking: [-0.05, -0.02, 0, 0.06, 0.14] },
    },

    typography: {
      heritage_caslon_karla:          { category: "heritage",                display: "Libre Caslon Text",  body: "Karla",         holdsAtMonumental: true },
      heritage_baskerville_inter:     { category: "heritage",                display: "Libre Baskerville",  body: "Inter",         holdsAtMonumental: true },
      hc_bodoni_inter:                { category: "high_contrast_editorial", display: "Bodoni Moda",        body: "Inter",         holdsAtMonumental: true },
      hc_playfair_dmsans:             { category: "high_contrast_editorial", display: "Playfair Display",   body: "DM Sans",       holdsAtMonumental: true },
      oldstyle_garamond_worksans:     { category: "oldstyle",                display: "EB Garamond",        body: "Work Sans",     holdsAtMonumental: false },
      oldstyle_cormorant_figtree:     { category: "oldstyle",                display: "Cormorant Garamond", body: "Figtree",       holdsAtMonumental: false },
      transitional_newsreader_tight:  { category: "transitional",            display: "Newsreader",         body: "Inter Tight",   holdsAtMonumental: true },
      transitional_instrument_manrope:{ category: "transitional",            display: "Instrument Serif",   body: "Manrope",       holdsAtMonumental: true },
      soft_fraunces_manrope:          { category: "soft_serif",              display: "Fraunces",           body: "Manrope",       holdsAtMonumental: true },
      soft_dmserif_dmsans:            { category: "soft_serif",              display: "DM Serif Display",   body: "DM Sans",       holdsAtMonumental: true },
      grotesk_archivo_inter:          { category: "grotesk_led",             display: "Archivo",            body: "Inter",         holdsAtMonumental: true },
      grotesk_space_sourcesans:       { category: "grotesk_led",             display: "Space Grotesk",      body: "Source Sans 3", holdsAtMonumental: true },
    },

    motifs: {
      plaid:      { kind: "pattern",     roles: ["field", "band", "frame"] },
      stripe:     { kind: "pattern",     roles: ["band", "field", "divider"] },
      gingham:    { kind: "pattern",     roles: ["field", "band"] },
      linen:      { kind: "pattern",     roles: ["field", "frame"] },
      equestrian: { kind: "arrangement", roles: ["accent", "divider", "frame"] },
      botanical:  { kind: "arrangement", roles: ["accent", "divider", "frame"] },
      celestial:  { kind: "arrangement", roles: ["accent", "divider"] },
    },

    // Structural signature weights. Same hero AND same variant adds the variant term.
    signature: {
      desktop: { hero: 0.25, variant: 0.10, plan: 0.15, axis: 0.10, rsvp: 0.10, registry: 0.10, category: 0.10, hierarchy: 0.05, tone: 0.05 },
      mobile:  { hero: 0.30, variant: 0.10, plan: 0.20, axis: 0.05, rsvp: 0.05, registry: 0.10, category: 0.10, hierarchy: 0.05, tone: 0.05 },
      threshold: 0.70,
    },
  };

  // Content used by every site. Content profile is derived, never hand-set.
  const DATA = {
    eyebrow: "A baby shower for our little boy",
    title: "Baby Shaker is on the way",
    hosts: "Hosted with love by Haseeb & Shezia",
    date: "Saturday, December 19, 2026", dayNumeral: "19", monthShort: "Dec", year: "2026",
    time: "1:00–5:00 PM",
    venue: "The Lodge at Hanson Park",
    location: "Aldie, Virginia",
    description: "An afternoon of good food, warm company, and celebrating our little boy.",
    deadline: "December 1",
  };
  DATA.contentProfile = {
    titleWords: DATA.title.trim().split(/\s+/).length,
    titleLength: DATA.title.length <= 18 ? "short" : DATA.title.length <= 32 ? "medium" : "long",
    hostCount: (DATA.hosts.match(/&|,| and /g) || []).length + 1,
    venueComplexity: DATA.venue.length > 28 ? "complex" : "simple",
    registryItems: 1, externalRegistries: 1, cashFund: true,
  };

  function fits(recipe, profile) {
    const cf = recipe.contentFit; if (!cf) return true;
    if (cf.titleWords && (profile.titleWords < cf.titleWords[0] || profile.titleWords > cf.titleWords[1])) return false;
    return true;
  }
  function signature(site) {
    return { hero: site.heroRecipe, variant: site.heroRecipe + ":" + site.heroVariant, plan: site.pageSystem.surfacePlan, axis: site.pageSystem.axis, rsvp: site.rsvpRecipe, registry: site.registryRecipe, category: VOCAB.typography[site.typography].category, hierarchy: site.composition.hierarchy, tone: site.tonalDirection };
  }
  function similarity(a, b, mode) {
    const w = VOCAB.signature[mode], sa = signature(a), sb = signature(b); let s = 0;
    for (const k in w) if (sa[k] === sb[k]) s += w[k];
    return Math.round(s * 100) / 100;
  }

  root.VOCAB = VOCAB; root.DATA = DATA; root.VOCAB_FN = { fits, signature, similarity };
  if (typeof module !== "undefined") module.exports = { VOCAB, DATA, fits, signature, similarity };
})(typeof window !== "undefined" ? window : globalThis);
