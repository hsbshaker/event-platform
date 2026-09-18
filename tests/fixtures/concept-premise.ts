/**
 * A brief, and the premise set a correct stage would author from it.
 *
 * Shared by every test that needs one, so the many call sites cannot drift into disagreeing about
 * what a legal premise looks like — the same reason `novel-composition.ts` is one fixture rather
 * than two.
 *
 * # Nothing here comes from the T22 corpus
 *
 * The event is a shared printmaking studio's open evening. It is not in any 4C corpus, it is not
 * any event type the diagnostic run covered, and no palette, motif, name, phrase or premise below
 * is drawn from the thirty-six responses that run produced. That matters because the whole value of
 * this remediation rests on the fix being a **capability** rather than a patch fitted to twelve
 * known failures: a fixture lifted from the spent evidence would let the tests pass for the wrong
 * reason, and `tests/unit/premise-no-case-leakage.test.ts` holds this file to that.
 *
 * The prose is written in ordinary sentence case for a reason the fixture would otherwise make
 * mysterious: `assertedSpecifics` treats a mid-sentence capital as a proper noun, so a premise that
 * capitalized a word for emphasis would be read as asserting a name. Titles are exempt from that
 * scan and are title-cased normally.
 */
import type { ConceptPremise, ConceptPremiseSet } from "@/lib/ai/concept-premise/contract";
import { eventIdentitySchema, type EventIdentity } from "@/lib/ai/event-identity/contract";

/** A brief with a real exclusion, a real host constraint and real advisory guidance. */
export const PREMISE_FIXTURE_IDENTITY: EventIdentity = eventIdentitySchema.parse({
  creativeDirection:
    "An open evening at a shared printmaking studio, where the work pinned on the walls and the " +
    "presses themselves are the whole invitation.",
  toneKeywords: ["unpolished", "generous", "curious", "tactile"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ink black", "raw paper"],
    avoidColors: ["neon"],
    dominanceNotes: "Ink should dominate and paper should be allowed to breathe.",
  },
  tonalIntent: "Mid to dark, with paper-white relief where the eye needs to rest.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid", "dark"],
  compatibleFamilies: ["editorial", "statement"],
  compatibleTypographyCategories: ["grotesk_led", "transitional"],
  visualMotifs: ["registration marks", "proofs pinned in rows", "the grain of the paper"],
  textureDirection: "pressed paper, with ink that sits on the surface rather than soaking in",
  typographyDirection: "plain working type, set the way a proof sheet is set",
  copyTone: "direct and welcoming, the way a member explains what a press actually does",
  hostConstraints: ["Do not describe the evening as a sale; nothing is for sale"],
  creativeGuidance: ["The proofs pinned on the wall are more interesting than any ornament"],
  inspirationSummary: "No visual inspiration supplied.",
});

/**
 * Three premises that separate on all three register axes and stay inside the brief.
 *
 * Every `grounding` entry paraphrases the brief closely enough to clear the anchor test, and no
 * passage asserts a name, a number or a date — which is what the brief does not carry.
 */
export function validPremiseSet(): ConceptPremiseSet {
  return {
    premises: [
      {
        title: "Proof Sheet",
        foregrounds: "the proofs pinned on the walls, and what each one shows about a state",
        organizingIdea:
          "The evening is laid out the way a proof sheet is: every part of the studio shown as " +
          "one pulled state beside the next, so a visitor reads the progression rather than a " +
          "finished object.",
        experience:
          "A visitor should feel invited to compare, to look along a row and notice what changed " +
          "between one pull and the next.",
        distinctFrom:
          "It gives a visitor the sequence rather than the machinery or the material, which is " +
          "what someone who wants to understand the work will choose.",
        designConsequences: [
          "sections read as a sequence of states rather than as separate destinations",
          "the working type is set plainly, the way a proof sheet is set",
        ],
        grounding: [
          "the brief says the proofs pinned on the wall are more interesting than any ornament",
          "the brief lists proofs pinned in rows and registration marks among the motif ideas",
        ],
        register: { pace: "measured", presence: "poised", surfaceRichness: "considered" },
      },
      {
        title: "Press Floor",
        foregrounds: "the presses themselves, as the thing a visitor comes to stand in front of",
        organizingIdea:
          "The site is the studio floor at working height: heavy machinery first, an invitation " +
          "to turn up and watch something get pulled, with everything else arranged around that " +
          "single event.",
        experience:
          "Arriving should feel like walking in while a press is running and being waved over " +
          "instead of shown around.",
        distinctFrom:
          "It trades reflection for immediacy, which suits a visitor who would rather watch " +
          "something happen than study a progression.",
        designConsequences: [
          "one commanding opening carries the page, and later sections stay deliberately plain",
          "surfaces are left bare so the machinery has nothing competing with it",
        ],
        grounding: [
          "the creative direction names the presses themselves as part of the whole invitation",
          "the copy tone is a member explaining what a press actually does",
        ],
        register: { pace: "propulsive", presence: "commanding", surfaceRichness: "bare" },
      },
      {
        title: "Paper Grain",
        foregrounds: "the material itself, and how ink sits on a pressed surface",
        organizingIdea:
          "Everything is built from the substrate up: the grain, the bite, the weight of a sheet, " +
          "so that a visitor understands the evening as an encounter with a material before it " +
          "is an encounter with images.",
        experience:
          "It should feel hushed and close, like handling a sheet under a lamp rather than being " +
          "shown a wall of finished work.",
        distinctFrom:
          "It asks for attention to the surface rather than to a sequence or a machine, which is " +
          "the choice for a visitor who arrives through touch.",
        designConsequences: [
          "layered surfaces carry the page, and texture does the work ornament would",
          "the pacing is slow enough that a single sheet can hold a whole section",
        ],
        grounding: [
          "the texture direction is pressed paper with ink that sits on the surface",
          "the brief says ink should dominate and paper should be allowed to breathe",
        ],
        register: { pace: "lingering", presence: "understated", surfaceRichness: "layered" },
      },
    ],
    constrainedAxes: [],
  };
}

/** One premise, for a call site that needs a single legal value and not a set. */
export function premiseFixture(index = 0): ConceptPremise {
  return validPremiseSet().premises[index];
}

/** Replace one premise in the valid set, for the adversarial cases. */
export function premiseSetWith(index: number, patch: Partial<ConceptPremise>): ConceptPremiseSet {
  const set = validPremiseSet();
  const premises = set.premises.map((premise, at) =>
    at === index ? { ...premise, ...patch } : premise,
  );
  return { ...set, premises };
}
