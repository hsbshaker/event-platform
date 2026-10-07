/**
 * `EventIdentity` (`event_identity_schema_v6`, `docs/model-contracts.md §4.1`) as the application
 * validates it. The provider's structured-output mode is never trusted to have enforced the schema
 * (`docs/model-contracts.md §3`, `spec.md §32 #19`): every response is parsed here.
 *
 * Mirrors `docs/model-schemas/event-identity.schema.json`; `contracts.test.ts` holds the two
 * together (bounds, enums, required keys, strictness, uniqueness).
 */
import { z } from "zod";

import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "@/lib/card/typography";
import type { TypographyCategory } from "@/lib/card/typography";

/** The typography categories the pairing catalog uses, in catalog order. */
export const TYPOGRAPHY_CATEGORIES = [
  ...new Set(TYPOGRAPHY_KEYS.map((id) => TYPOGRAPHY[id].category)),
] as [TypographyCategory, ...TypographyCategory[]];

const text = (min: number, max: number) => z.string().min(min).max(max);

function uniqueList<T extends z.ZodType>(item: T, min: number, max: number) {
  const list = min > 0 ? z.array(item).min(min).max(max) : z.array(item).max(max);
  return list.refine((a) => new Set(a).size === a.length, { message: "items must be unique" });
}

/**
 * Whether the host gave a concept or style of their own (`event_identity_schema_v6`; owner
 * decisions, 2026-10-06): the identity's own judgement of the prompt, since it is the only reader
 * of it (`spec.md §7.5`).
 * - `open`: the host left the look to us — nothing beyond the occasion. The identity builds its
 *   theme from the theme seed, and the design is given a randomly suggested rendering.
 * - `cues`: some creative cue (a palette, a mood, a motif, a person's interests, a place's
 *   character) but no concept or style of their own. The seed is ignored; the design is still given
 *   a suggested rendering.
 * - `own`: the host named a clear concept or style of their own — a named format (album cover,
 *   poster, magazine, storybook page), an explicit list of motifs, a decade or era, a named
 *   aesthetic, or how the artwork should look. No seed and no suggested rendering.
 */
export const HOST_CONCEPTS = ["open", "cues", "own"] as const;
export type HostConcept = (typeof HOST_CONCEPTS)[number];

/** The identity as the model must return it now (`event_identity_schema_v6`). */
export const eventIdentitySchema = z.strictObject({
  hostConcept: z.enum(HOST_CONCEPTS),
  creativeDirection: text(20, 420),
  toneKeywords: uniqueList(text(2, 48), 3, 7),
  colorsExplicitlyConstrained: z.boolean(),
  paletteIntent: z.strictObject({
    requiredColors: uniqueList(text(2, 60), 0, 5),
    preferredColors: uniqueList(text(2, 60), 0, 7),
    avoidColors: uniqueList(text(2, 60), 0, 7),
    dominanceNotes: z.string().max(300),
  }),
  tonalIntent: text(5, 320),
  toneExplicitlyConstrained: z.boolean(),
  compatibleTypographyCategories: uniqueList(z.enum(TYPOGRAPHY_CATEGORIES), 1, 6),
  visualMotifs: uniqueList(text(3, 90), 0, 8),
  textureDirection: text(3, 300),
  typographyDirection: text(5, 300),
  copyTone: text(3, 260),
  designConstraints: uniqueList(text(3, 180), 0, 10),
  inspirationSummary: text(5, 700),
});

/**
 * A persisted identity as the pipeline reads it back: identities persisted before
 * `event_identity_schema_v6` have no `hostConcept`. They are immutable and never re-validated
 * against the newer schema (`docs/model-contracts.md §2`); without it the pipeline behaves as it
 * did when they were made (a suggested rendering is drawn). Every new identity is parsed with the
 * strict `eventIdentitySchema`, which requires it.
 */
export const storedEventIdentitySchema = eventIdentitySchema.extend({
  hostConcept: z.enum(HOST_CONCEPTS).optional(),
});

/** An identity the pipeline holds: a new one always has `hostConcept`; one persisted before v6 may not. */
export type EventIdentity = z.infer<typeof storedEventIdentitySchema>;
