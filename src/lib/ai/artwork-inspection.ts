/**
 * The artwork inspection chosen in Phase 3 validation (`docs/technology-decisions.md §8.1`, "Text
 * and safety detection"): after the provider's own output moderation and `omni-moderation-latest`,
 * a structured GPT 6.1 Sol look at the artwork for text, a logo or brand mark, a mockup, and a
 * person (`spec.md §7.8`, §32 #16).
 *
 * v1 was ported verbatim from `scripts/phase-3/run.mjs` (`ART_CHECK_PROMPT`, `ART_CHECK_SCHEMA`),
 * the versions the Phase 3 results were measured with. v2 (owner decisions, 2026-10-04, with the
 * rendering families) narrows `isMockup` to a card, sheet or envelope shown as an object, so a
 * photograph that fills the canvas is not one, and adds `hasPerson`: photographic, editorial, 3D
 * and collage artwork may show no people. Changing a word is a
 * `CARD_ART_INSPECTION_PROMPT_VERSION` / `_SCHEMA_VERSION` bump. What a failed inspection means
 * (one regeneration, then a visible failure) is the pipeline's decision (Phase 5b), not this
 * module's.
 */
import { z } from "zod";

export const ARTWORK_INSPECTION_PROMPT = `You are a strict print-production inspector. You are shown one piece of artwork for the front of an invitation card; typeset text will be added later by software, so the artwork itself must contain none.

Report:
- hasText: true if ANY text-like marks appear anywhere — letters, words, numbers, initials, monograms, signatures, labels, captions, lettering on objects, or pseudo-text squiggles that read as writing — however small or decorative.
- textDescription: where and what, or "" if none.
- hasLogoOrBrandMark: true if any logo, crest, emblem, wordmark or recognizable brand mark appears (for example a polo player emblem), even without legible letters.
- isMockup: true only if the image shows a card, invitation, sheet of paper or envelope as an object — on a surface, held in hands, with its own shadow or a frame around it — rather than artwork filling the canvas. A photograph of a scene, interior, landscape, objects, food or materials that fills the canvas is NOT a mockup.
- hasPerson: true if any person, human face, hands or human body appears, realistic or stylised. Animals and toy animals do not count.
- description: one sentence describing the artwork.

Be strict: when in doubt about text, answer true.`;

export const ARTWORK_INSPECTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "hasText",
    "textDescription",
    "hasLogoOrBrandMark",
    "isMockup",
    "hasPerson",
    "description",
  ],
  properties: {
    hasText: { type: "boolean" },
    textDescription: { type: "string" },
    hasLogoOrBrandMark: { type: "boolean" },
    isMockup: { type: "boolean" },
    hasPerson: { type: "boolean" },
    description: { type: "string" },
  },
} as const;

export const artworkInspectionSchema = z.strictObject({
  hasText: z.boolean(),
  textDescription: z.string(),
  hasLogoOrBrandMark: z.boolean(),
  isMockup: z.boolean(),
  hasPerson: z.boolean(),
  description: z.string(),
});

export type ArtworkInspection = z.infer<typeof artworkInspectionSchema>;

/** `omni-moderation-latest`'s verdict on the artwork: flagged, and the categories that flagged it. */
export const artworkModerationSchema = z.object({
  flagged: z.boolean(),
  categories: z.record(z.string(), z.boolean().nullable()),
});

export interface ArtworkModeration {
  flagged: boolean;
  /** The categories the moderation flagged, empty when none. */
  categories: string[];
}
