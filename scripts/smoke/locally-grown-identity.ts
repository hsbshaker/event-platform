/**
 * The fixed authoritative `EventIdentity` for the Phase 4D live integration smoke.
 *
 * **EventIdentity is not under test here and is never called.** 4B validated it separately. This
 * fixture stands in for what the real interpreter is expected to produce in the destination
 * product from one sparse host sentence, so the smoke can start where 4D starts.
 *
 * The hypothetical host said, and only said:
 *
 *   > "Baby shower with a 'locally grown' theme. Garden and vegetable vibe, but classy and
 *   > elevated — not childish or cheesy."
 *
 * That sentence is **not** forwarded anywhere: `spec.md §7.5` and `docs/product-doctrine.md §4`
 * make interpretation happen once, and this object is the interpretation.
 *
 * # The line this fixture walks
 *
 * It is written to be *interpretive but not prescriptive*. An identity that named hex values, a
 * motif inventory or a layout would pre-decide the very thing the smoke exists to observe — whether
 * `ConceptPremise`, `DesignIntent` and `Composition` can invent three worthwhile creative choices
 * from one understanding. So every field below stays at the level of creative **compatibility and
 * direction**, never renderer treatment: "produce-inspired, garden-rooted colour language" rather
 * than a palette, "organic produce and garden imagery may support this world" rather than a list of
 * vegetables.
 *
 * `hostConstraints` carries **only** what the host actually said — *not childish*, *not cheesy* —
 * because `spec.md §32 #12` and the S3 veto exist precisely to stop model taste wearing host
 * authority. Everything the interpreter itself recommends is `creativeGuidance`, which is advisory
 * and which `src/lib/ai/composition/brief.ts` deliberately withholds from Composition.
 *
 * Nothing operational is invented: no date, time, venue, honoree, host names, deadline, guest count
 * or registry. The production bounded provisional-content rules (`spec.md §7.3`) supply whatever
 * the rendered page needs.
 */
import { eventIdentitySchema, type EventIdentity } from "@/lib/ai/event-identity/contract";

/** Parsed through the production schema, so an invalid fixture fails here rather than mid-run. */
export const LOCALLY_GROWN_IDENTITY: EventIdentity = eventIdentitySchema.parse({
  creativeDirection:
    "A baby shower built around a locally grown idea: gardens and growing, vegetables and " +
    "produce, harvest and abundance, and the character of a good local market. The feeling is " +
    "warm, fresh and celebratory, charming rather than sweet, and elevated rather than rustic " +
    "pastiche. It should read unmistakably as a baby shower, with the growing idea carrying the " +
    "welcome rather than decorating it.",
  toneKeywords: ["warm", "fresh", "celebratory", "charming", "organic", "elevated"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: [],
    avoidColors: [],
    dominanceNotes:
      "A produce-inspired, garden-rooted colour language with natural warmth. Grown and edible " +
      "sources rather than nursery pastels, and enough restraint that the result reads composed " +
      "rather than busy.",
  },
  tonalIntent:
    "Bright, clean daylight of a morning market, settling into the softer warmth of late " +
    "afternoon in a garden.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["light", "mid"],
  compatibleFamilies: ["editorial", "invitation", "statement"],
  compatibleTypographyCategories: [
    "transitional",
    "oldstyle",
    "soft_serif",
    "grotesk_led",
    "high_contrast_editorial",
  ],
  visualMotifs: [
    "growing and cultivation",
    "garden and kitchen-garden character",
    "vegetables and produce",
    "harvest and abundance",
    "local market and stall culture",
    "natural, seasonal freshness",
  ],
  textureDirection:
    "Natural, tactile and organic — surfaces with a made quality rather than a manufactured one, " +
    "handled with restraint so the result stays composed.",
  typographyDirection:
    "Typography with warmth and craft rather than novelty: confident, well-set and grown-up, " +
    "carrying charm through quality rather than through decorative lettering.",
  copyTone: "Warm, welcoming and celebratory, in tasteful and unfussy language.",
  hostConstraints: ["Not childish.", "Not cheesy."],
  creativeGuidance: [
    "Let the locally grown idea organise the whole page rather than appear as applied decoration.",
    "Prefer the elevated end of the garden and market world: an editorial food and growing " +
      "register rather than a novelty one.",
    "Charm is welcome; treat sweetness and whimsy as the risks the host named.",
    "Abundance can be expressed through composition and generosity of space, not only through " +
      "imagery.",
  ],
  inspirationSummary: "No visual inspiration supplied.",
});
