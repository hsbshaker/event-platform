/**
 * The four art modes a card design declares, and which shapes the resulting artwork fits
 * (`docs/card-system.md §2.4`).
 *
 * The art prompt's crop rule depends on the mode, so the mode travels with every artwork request:
 * `illustration` and `atmosphere` art is composed safe for every shape of its proportion the
 * layout supports; `framed` and `minimal` art follows its outline and fits only the shape it was
 * generated for.
 */

export const ART_MODES = ["illustration", "framed", "atmosphere", "minimal"] as const;

export type ArtMode = (typeof ART_MODES)[number];

/** `"proportion"`: fits every supported shape of its proportion. `"own-shape"`: only its own. */
export type ArtFit = "proportion" | "own-shape";

export const ART_MODE_FIT: Readonly<Record<ArtMode, ArtFit>> = {
  illustration: "proportion",
  atmosphere: "proportion",
  framed: "own-shape",
  minimal: "own-shape",
};
