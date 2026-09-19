/**
 * A valid `VisualArtIntent`, for tests.
 *
 * Built through `visualArtIntentSchema` rather than cast, so a fixture can never be a brief the
 * real contract would reject — and seeded with `STANDING_PROHIBITIONS`, because a fixture that
 * omitted them would test the boundary against a request it is supposed to refuse.
 *
 * Data only: no I/O, no configuration, nothing that could reach a provider. It sits inside the
 * module so `../boundary.test.ts`'s scan covers it like everything else here.
 */
import {
  STANDING_PROHIBITIONS,
  VISUAL_ART_INTENT_VERSION,
  visualArtIntentSchema,
  type VisualArtIntent,
} from "../contract";

export function artworkIntent(overrides: Partial<VisualArtIntent> = {}): VisualArtIntent {
  return visualArtIntentSchema.parse({
    version: VISUAL_ART_INTENT_VERSION,
    role: "anchor",
    subject: "a single ripe citrus branch, leaves turned toward the light",
    medium: "loose gouache on toned paper, visible brush edges",
    composition: "wide and short; the title sits across the lower half and must stay readable",
    subjectWeight: "balanced",
    negativeSpace: "bottom",
    background: "opaque",
    cropSafety: "generous",
    paletteRelationship: "harmonize",
    paletteHexes: ["#F4EFE4", "#C9A227", "#4F5D3A"],
    hostConstraints: ["no pink"],
    prohibited: [...STANDING_PROHIBITIONS],
    ...overrides,
  });
}
