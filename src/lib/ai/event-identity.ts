/**
 * `EventIdentity` (`event_identity_schema_v5`, `docs/model-contracts.md §4.1`) as the application
 * validates it. The provider's structured-output mode is never trusted to have enforced the schema
 * (`docs/model-contracts.md §3`, `spec.md §32 #19`): every response is parsed here.
 *
 * Mirrors `docs/model-schemas/event-identity.schema.json`; `event-identity.test.ts` holds the two
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

export const eventIdentitySchema = z.strictObject({
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

export type EventIdentity = z.infer<typeof eventIdentitySchema>;
