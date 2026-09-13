/**
 * Design vocabulary: family and typography-pairing tables shared by DesignIntent generation.
 *
 * Ported from the design-vocabulary half of `proof-a1/vocab.js` only. `proof-a1/vocab.js` also
 * declares `heroRecipes`, `detailsRecipes`, `rsvpRecipes`, `registryRecipes`, `stateRecipes` and
 * `surfacePlans` — the legacy fixture library — plus `axes`, `borderLanguages`, `cardLanguages`,
 * `buttonLanguages`, `densities`, `composition`, `mapping`, `parameters`, `motifs` and
 * `signature`. None of that is ported here: the library is out of production's creative path
 * (`docs/event-renderer-system.md §7.1`, `CLAUDE.md §5.1`), and the rest is out of scope for this
 * slice (`spec.md §32` #15 — no primitive, token or prop without a proof run).
 *
 * `FAMILY_KEYS` and `TYPOGRAPHY_KEYS` preserve the reference's `Object.keys` insertion order.
 * That order is load-bearing: a seeded picker indexes into these arrays, and reordering them
 * silently changes which family or pairing a given seed assigns.
 */

export type Family = "editorial" | "invitation" | "statement";

export type Tone = "light" | "mid" | "dark";

export type TypographyCategory =
  | "heritage"
  | "high_contrast_editorial"
  | "oldstyle"
  | "transitional"
  | "soft_serif"
  | "grotesk_led";

export type Hierarchy = "restrained" | "editorial" | "dramatic" | "monumental";

export type TypographyPairingId =
  | "heritage_caslon_karla"
  | "heritage_baskerville_inter"
  | "hc_bodoni_inter"
  | "hc_playfair_dmsans"
  | "oldstyle_garamond_worksans"
  | "oldstyle_cormorant_figtree"
  | "transitional_newsreader_tight"
  | "transitional_instrument_manrope"
  | "soft_fraunces_manrope"
  | "soft_dmserif_dmsans"
  | "grotesk_archivo_inter"
  | "grotesk_space_sourcesans";

export interface FamilyVocabulary {
  categories: readonly TypographyCategory[];
  hierarchies: readonly Hierarchy[];
}

export const FAMILIES: Record<Family, FamilyVocabulary> = {
  editorial: {
    categories: [
      "heritage",
      "transitional",
      "high_contrast_editorial",
      "soft_serif",
      "oldstyle",
      "grotesk_led",
    ],
    hierarchies: ["restrained", "editorial", "dramatic", "monumental"],
  },
  invitation: {
    categories: ["high_contrast_editorial", "heritage", "oldstyle", "transitional", "soft_serif"],
    hierarchies: ["restrained", "editorial", "dramatic"],
  },
  statement: {
    categories: [
      "grotesk_led",
      "high_contrast_editorial",
      "transitional",
      "heritage",
      "soft_serif",
    ],
    hierarchies: ["dramatic", "monumental"],
  },
};

/** `Object.keys(VOCAB.families)` order — load-bearing, see module doc comment. */
export const FAMILY_KEYS: readonly Family[] = ["editorial", "invitation", "statement"];

export const TONES: readonly Tone[] = ["light", "mid", "dark"];

export interface TypographyPairing {
  category: TypographyCategory;
  display: string;
  body: string;
  holdsAtMonumental: boolean;
}

export const TYPOGRAPHY: Record<TypographyPairingId, TypographyPairing> = {
  heritage_caslon_karla: {
    category: "heritage",
    display: "Libre Caslon Text",
    body: "Karla",
    holdsAtMonumental: true,
  },
  heritage_baskerville_inter: {
    category: "heritage",
    display: "Libre Baskerville",
    body: "Inter",
    holdsAtMonumental: true,
  },
  hc_bodoni_inter: {
    category: "high_contrast_editorial",
    display: "Bodoni Moda",
    body: "Inter",
    holdsAtMonumental: true,
  },
  hc_playfair_dmsans: {
    category: "high_contrast_editorial",
    display: "Playfair Display",
    body: "DM Sans",
    holdsAtMonumental: true,
  },
  oldstyle_garamond_worksans: {
    category: "oldstyle",
    display: "EB Garamond",
    body: "Work Sans",
    holdsAtMonumental: false,
  },
  oldstyle_cormorant_figtree: {
    category: "oldstyle",
    display: "Cormorant Garamond",
    body: "Figtree",
    holdsAtMonumental: false,
  },
  transitional_newsreader_tight: {
    category: "transitional",
    display: "Newsreader",
    body: "Inter Tight",
    holdsAtMonumental: true,
  },
  transitional_instrument_manrope: {
    category: "transitional",
    display: "Instrument Serif",
    body: "Manrope",
    holdsAtMonumental: true,
  },
  soft_fraunces_manrope: {
    category: "soft_serif",
    display: "Fraunces",
    body: "Manrope",
    holdsAtMonumental: true,
  },
  soft_dmserif_dmsans: {
    category: "soft_serif",
    display: "DM Serif Display",
    body: "DM Sans",
    holdsAtMonumental: true,
  },
  grotesk_archivo_inter: {
    category: "grotesk_led",
    display: "Archivo",
    body: "Inter",
    holdsAtMonumental: true,
  },
  grotesk_space_sourcesans: {
    category: "grotesk_led",
    display: "Space Grotesk",
    body: "Source Sans 3",
    holdsAtMonumental: true,
  },
};

/** `Object.keys(VOCAB.typography)` order — load-bearing, see module doc comment. */
export const TYPOGRAPHY_KEYS: readonly TypographyPairingId[] = [
  "heritage_caslon_karla",
  "heritage_baskerville_inter",
  "hc_bodoni_inter",
  "hc_playfair_dmsans",
  "oldstyle_garamond_worksans",
  "oldstyle_cormorant_figtree",
  "transitional_newsreader_tight",
  "transitional_instrument_manrope",
  "soft_fraunces_manrope",
  "soft_dmserif_dmsans",
  "grotesk_archivo_inter",
  "grotesk_space_sourcesans",
];
