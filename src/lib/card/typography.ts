/**
 * The curated font pairings card designs choose from (`docs/card-system.md`).
 *
 * `TYPOGRAPHY_KEYS` preserves the table's insertion order. Keep it stable: the card-design schema's
 * pairing enum is generated from it (`docs/model-contracts.md §2`).
 *
 * Every family named here has self-hosted faces in `src/styles/card-fonts.css`
 * (`typography.test.ts` enforces it).
 */

export type TypographyCategory =
  | "heritage"
  | "high_contrast_editorial"
  | "oldstyle"
  | "transitional"
  | "soft_serif"
  | "grotesk_led";

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

export interface TypographyPairing {
  category: TypographyCategory;
  display: string;
  body: string;
}

export const TYPOGRAPHY: Record<TypographyPairingId, TypographyPairing> = {
  heritage_caslon_karla: { category: "heritage", display: "Libre Caslon Text", body: "Karla" },
  heritage_baskerville_inter: {
    category: "heritage",
    display: "Libre Baskerville",
    body: "Inter",
  },
  hc_bodoni_inter: { category: "high_contrast_editorial", display: "Bodoni Moda", body: "Inter" },
  hc_playfair_dmsans: {
    category: "high_contrast_editorial",
    display: "Playfair Display",
    body: "DM Sans",
  },
  oldstyle_garamond_worksans: {
    category: "oldstyle",
    display: "EB Garamond",
    body: "Work Sans",
  },
  oldstyle_cormorant_figtree: {
    category: "oldstyle",
    display: "Cormorant Garamond",
    body: "Figtree",
  },
  transitional_newsreader_tight: {
    category: "transitional",
    display: "Newsreader",
    body: "Inter Tight",
  },
  transitional_instrument_manrope: {
    category: "transitional",
    display: "Instrument Serif",
    body: "Manrope",
  },
  soft_fraunces_manrope: { category: "soft_serif", display: "Fraunces", body: "Manrope" },
  soft_dmserif_dmsans: { category: "soft_serif", display: "DM Serif Display", body: "DM Sans" },
  grotesk_archivo_inter: { category: "grotesk_led", display: "Archivo", body: "Inter" },
  grotesk_space_sourcesans: {
    category: "grotesk_led",
    display: "Space Grotesk",
    body: "Source Sans 3",
  },
};

/** `Object.keys(TYPOGRAPHY)` order — load-bearing, see module doc comment. */
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
