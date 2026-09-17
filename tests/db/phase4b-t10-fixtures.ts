/**
 * A genuinely valid EventIdentity envelope, and its clarification variants.
 *
 * Real rather than stubbed on purpose: the orchestrator's recovery path re-validates stored
 * evidence through the **production** validator, and the database derives `is_provisional` from
 * this same JSON through its own reader. A placeholder shape would pass a test that proves
 * neither.
 */
import type { Json } from "@/lib/supabase/database.types";

const identity = {
  creativeDirection: "A restrained, tactile winter identity built on materials rather than motifs.",
  toneKeywords: ["restrained", "tactile", "warm"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ivory"],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like",
  typographyDirection: "quiet oldstyle serif",
  copyTone: "warm and unfussy",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No visual inspiration supplied.",
};

const suppliedFacts = {
  hostNames: null,
  honoreeName: null,
  honoreeDescriptionText: null,
  eventType: null,
  dateText: null,
  timeText: null,
  venueText: null,
  addressText: null,
  localityText: null,
  rsvpDeadlineText: null,
};

export const AUTHORITATIVE = {
  identity,
  suppliedFacts,
  clarification: { needed: false, questions: [] },
} as unknown as Json;

/** A boundary question: provisional, and it blocks everything downstream (`spec.md §7.6b`). */
export const boundaryResult = (question: string) =>
  ({
    identity,
    suppliedFacts,
    clarification: {
      needed: true,
      questions: [
        {
          kind: "boundary",
          question,
          whyItMatters: "This is the host's decision to make, not ours.",
          options: [
            { label: "Yes", isDefer: false },
            { label: "No", isDefer: false },
          ],
        },
      ],
    },
  }) as unknown as Json;

/** A creative question: Route A. Authoritative, answerable, and it never gates. */
export const creativeResult = (question: string) =>
  ({
    identity,
    suppliedFacts,
    clarification: {
      needed: true,
      questions: [
        {
          kind: "creative",
          question,
          whyItMatters: "It would sharpen the direction, but we can proceed without it.",
          options: [
            { label: "Warmer", isDefer: false },
            { label: "Cooler", isDefer: false },
            { label: "You choose", isDefer: true },
          ],
        },
      ],
    },
  }) as unknown as Json;
