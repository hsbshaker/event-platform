/**
 * The pinned API models and the artwork's image settings (`docs/technology-decisions.md §8.1`,
 * owner decisions 2026-10-04). Model IDs appear here and nowhere else in the application; changing
 * one is a decision recorded there first.
 */
export const MODELS = {
  /** Event Identity, Card Design and the artwork inspection. */
  text: "gpt-6.1-sol",
  /** Fact extraction (`spec.md §7.5`, §9.2). */
  facts: "gpt-6-luna",
  /** Card artwork, a pinned snapshot. */
  image: "gpt-image-2.5-sunburst-2026-09-08",
  /** Image safety. */
  moderation: "omni-moderation-latest",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** Sunburst `high`: the owner chose it over `medium` for its colour (§8.1). */
export const IMAGE_QUALITY = "high";
