/**
 * The v4 protocol is only worth something if it was frozen before a card existed, so this pins it.
 *
 * Same two failure directions as v3's. **Drift**: a value edited after a card arrives turns a
 * precommitment into a description of whatever showed up. **Shape**: every check has to be
 * exercisable while nothing exists, or its first real run happens under pressure to loosen it.
 *
 * Fixtures here are skeletal situation cards — ids, event types and one-clause strings. They are
 * not case-like content and are not premises anyone could reuse, because authoring a v4 card is
 * precisely what the lead's quota of zero forbids.
 *
 * Acceptance criteria: N/A — test-only, evidence machinery. `docs/phase-4b-plan.md` Part IV;
 * `docs/model-contracts.md §4.7`.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CLAUDE_AUTHORED_V4_QUOTA,
  SEALED_CHALLENGE_V4_CASE_IDS,
  SEALED_CHALLENGE_V4_EXCLUDED_FAMILIES,
  SEALED_CHALLENGE_V4_HALF_B_FAMILY,
  SEALED_CHALLENGE_V4_HALVES,
  SEALED_CHALLENGE_V4_HUMAN_AUTHOR_EXCLUSIONS,
  SEALED_CHALLENGE_V4_VERSION,
  SEALED_CHALLENGE_V4_WITHHELD_FROM_AUTHORS,
  SITUATION_CARDS_PER_HALF,
  SITUATION_CARD_COMPLICATION_FLOOR,
  SITUATION_CARD_FIELDS,
  SITUATION_CARD_FORBIDDEN_FIELDS,
  checkAssembledSealedChallengeV4,
  checkSituationCards,
  checkStage2Faithfulness,
  isEligibleHalfBFamily,
  type SituationCard,
} from "./design-intent-challenge-v4-protocol";
import { CORPUS_FILES, corpusPath } from "./corpus";

const ROOT = `${process.cwd().replace(/\/+$/, "")}/`;
const PLAN = readFileSync(`${ROOT}docs/phase-4b-plan.md`, "utf8");
const V4_PROVENANCE = "docs/model-evals/provenance/design-intent-sealed-challenge-v4/";

const half = (index: 0 | 1) => SEALED_CHALLENGE_V4_HALVES[index];

/** Six skeletal cards: one shared type, four distinct, four complications. */
const lawfulCards = (index: 0 | 1): SituationCard[] =>
  half(index).caseIds.map((id, position) => ({
    id,
    eventType: position < 2 ? "type-a" : `type-${position}`,
    whoIsGathering: `people ${position}`,
    whyItMatters: `reason ${position}`,
    context: `context ${position}`,
    complication: position < SITUATION_CARD_COMPLICATION_FLOOR ? `complication ${position}` : null,
  }));

describe("the v4 sealed-challenge protocol, frozen before any situation card exists", () => {
  describe("the precommitted values", () => {
    it("splits twelve cases across a human and a model family, and gives the lead none", () => {
      expect(SEALED_CHALLENGE_V4_HALVES.map((entry) => [entry.slot, entry.sourceClass])).toEqual([
        ["A", "human"],
        ["B", "model-family"],
      ]);
      expect(CLAUDE_AUTHORED_V4_QUOTA).toBe(0);
      expect(SEALED_CHALLENGE_V4_VERSION).toBe("design_intent_sealed_challenge_v4");
      expect(SEALED_CHALLENGE_V4_CASE_IDS).toEqual([
        "DIC4-P01",
        "DIC4-P02",
        "DIC4-P03",
        "DIC4-P04",
        "DIC4-P05",
        "DIC4-P06",
        "DIC4-Q01",
        "DIC4-Q02",
        "DIC4-Q03",
        "DIC4-Q04",
        "DIC4-Q05",
        "DIC4-Q06",
      ]);
    });

    it("uses namespaces that tell no reviewer which half a human wrote", () => {
      // Case ids never reach the blind reviewer, but they do reach the semantic and fairness
      // reviewers, and a reviewer who knows which half is human-authored is not reading the cases.
      for (const entry of SEALED_CHALLENGE_V4_HALVES) {
        expect(entry.prefix).toMatch(/^DIC4-[A-Z]$/);
        expect(entry.prefix.toLowerCase()).not.toContain("h");
        expect(JSON.stringify(entry.caseIds)).not.toMatch(/human|model|gpt|gemini|claude/i);
      }
    });

    it("collides with no namespace any corpus already uses", () => {
      const prefixes = new Set<string>();
      for (const name of Object.values(CORPUS_FILES)) {
        const file = `${ROOT}docs/model-evals/${name}`;
        if (!existsSync(file)) continue;
        for (const testCase of (
          JSON.parse(readFileSync(file, "utf8")) as { cases?: { id?: unknown }[] }
        ).cases ?? []) {
          if (typeof testCase?.id === "string") prefixes.add(testCase.id.replace(/[-_]?\d+$/, ""));
        }
      }
      for (const entry of SEALED_CHALLENGE_V4_HALVES) {
        for (const prefix of prefixes) {
          if (SEALED_CHALLENGE_V4_HALVES.some((declared) => declared.prefix === prefix)) continue;
          expect(
            prefix.startsWith(entry.prefix) || entry.prefix.startsWith(prefix),
            `${entry.prefix} collides with ${prefix}`,
          ).toBe(false);
        }
      }
    });

    it("excludes every family already represented in this programme's corpora", () => {
      expect([...SEALED_CHALLENGE_V4_EXCLUDED_FAMILIES]).toEqual(["OpenAI", "Anthropic", "Google"]);
      for (const ineligible of ["OpenAI", "openai", "Anthropic", "Google DeepMind", "google", ""]) {
        expect(isEligibleHalfBFamily(ineligible), ineligible).toBe(false);
      }
      for (const eligible of ["Mistral", "Meta", "Cohere", "xAI", "DeepSeek", "AI21"]) {
        expect(isEligibleHalfBFamily(eligible), eligible).toBe(true);
      }
    });

    /**
     * The half-B family is unchosen at the freeze, and that is a state rather than a gap: it is
     * recorded before commissioning or half B is not commissioned. Written to pass either way, so
     * filling it in does not mean editing a test — the assertion is that whatever is there is
     * *eligible*, which is the property that matters.
     */
    it("has either no chosen half-B family yet, or an eligible one", () => {
      if (SEALED_CHALLENGE_V4_HALF_B_FAMILY === null) return;
      expect(isEligibleHalfBFamily(SEALED_CHALLENGE_V4_HALF_B_FAMILY)).toBe(true);
    });

    it("names every route by which the challenge would stop being sealed", () => {
      expect(SEALED_CHALLENGE_V4_WITHHELD_FROM_AUTHORS).toHaveLength(16);
      for (const item of [
        "any v3 artifact, case or review",
        "any subject, genre or device to avoid",
        "the other author's situation cards or cases",
      ]) {
        expect(SEALED_CHALLENGE_V4_WITHHELD_FROM_AUTHORS).toContain(item);
      }
      expect(SEALED_CHALLENGE_V4_HUMAN_AUTHOR_EXCLUSIONS).toHaveLength(6);
    });

    it("keeps the design vocabulary out of stage 1 entirely", () => {
      expect([...SITUATION_CARD_FIELDS]).toEqual([
        "id",
        "eventType",
        "whoIsGathering",
        "whyItMatters",
        "context",
        "complication",
      ]);
      expect(SITUATION_CARD_FORBIDDEN_FIELDS).toHaveLength(13);
      for (const banned of [
        "palette or colours",
        "typography or fonts",
        "any proposed visual solution",
      ]) {
        expect(SITUATION_CARD_FORBIDDEN_FIELDS).toContain(banned);
      }
    });
  });

  describe("the situation-card check", () => {
    it("accepts a lawful half", () => {
      expect(checkSituationCards(half(0), lawfulCards(0))).toEqual({ problems: [], advisory: [] });
      expect(checkSituationCards(half(1), lawfulCards(1))).toEqual({ problems: [], advisory: [] });
    });

    it("rejects the wrong number of cards", () => {
      expect(checkSituationCards(half(0), lawfulCards(0).slice(0, 5)).problems.join(" ")).toContain(
        `expected exactly ${SITUATION_CARDS_PER_HALF} situation cards`,
      );
    });

    it("rejects an id outside the namespace, and reports the missing one", () => {
      const swapped = lawfulCards(0).map((card, index) =>
        index === 0 ? { ...card, id: "DIC4-Q01" } : card,
      );
      const problems = checkSituationCards(half(0), swapped).problems.join(" ");
      expect(problems).toContain("outside the precommitted namespace");
      expect(problems).toContain("missing precommitted `id` DIC4-P01");
    });

    it("rejects a field that is not a situation-card field", () => {
      const smuggled = lawfulCards(0).map((card, index) =>
        index === 0 ? { ...card, paletteIntent: "sage and brass" } : card,
      );
      expect(checkSituationCards(half(0), smuggled).problems.join(" ")).toContain(
        "`paletteIntent` is not a situation-card field",
      );
    });

    it("rejects design vocabulary smuggled into the prose", () => {
      for (const smuggledText of [
        "the room should be #2D4030 throughout",
        "a serif that feels like the family",
        "an oldstyle mood board of the venue",
      ]) {
        const cards = lawfulCards(0).map((card, index) =>
          index === 0 ? { ...card, context: smuggledText } : card,
        );
        expect(checkSituationCards(half(0), cards).problems.join(" "), smuggledText).toContain(
          "carries design vocabulary",
        );
      }
    });

    /**
     * The half of this check that matters most, because it is where a mechanical screen would
     * otherwise punish a good card: a host who works in a paint factory is exactly the concrete
     * human specificity the premise floor asks for.
     */
    it("reports vaguer design language as advisory and never as a failure", () => {
      const cards = lawfulCards(0).map((card, index) =>
        index === 0
          ? { ...card, context: "her father ran a colour lab and the family still has his samples" }
          : card,
      );
      const result = checkSituationCards(half(0), cards);
      expect(result.problems).toEqual([]);
      expect(result.advisory.join(" ")).toContain('"colour"');
    });

    it("enforces the composition rule as a multiset", () => {
      const noPair = lawfulCards(0).map((card, index) => ({ ...card, eventType: `type-${index}` }));
      expect(checkSituationCards(half(0), noPair).problems.join(" ")).toContain(
        "found 0 pair(s) across 6 distinct types",
      );
      const triple = lawfulCards(0).map((card, index) => ({
        ...card,
        eventType: index < 3 ? "type-a" : `type-${index}`,
      }));
      expect(checkSituationCards(half(0), triple).problems.join(" ")).toContain("appears 3 times");
    });

    it("enforces the complication floor, and says whose judgement the rest is", () => {
      const thin = lawfulCards(0).map((card, index) =>
        index < 3 ? card : { ...card, complication: null },
      );
      const problems = checkSituationCards(half(0), thin).problems.join(" ");
      expect(problems).toContain(
        `3 of 6 cards declare a complication; the floor is ${SITUATION_CARD_COMPLICATION_FLOOR}`,
      );
      expect(problems).toContain("Whether each one is genuine is the reviewer's");
    });

    it("requires a complication to be a string or an explicit null, never absent", () => {
      const missing = lawfulCards(0).map((card, index) => {
        if (index !== 0) return card;
        const { complication: _complication, ...rest } = card;
        return rest as SituationCard;
      });
      expect(checkSituationCards(half(0), missing).problems.join(" ")).toContain(
        "`complication` must be a non-empty string or null",
      );
    });
  });

  describe("the stage-2 faithfulness check", () => {
    const cards = lawfulCards(0);

    it("accepts cases that keep every card's id and event type", () => {
      expect(
        checkStage2Faithfulness(
          cards,
          cards.map((card) => ({ id: card.id, eventType: card.eventType })),
        ),
      ).toEqual([]);
    });

    it("catches an event type that moved between stages", () => {
      const drifted = cards.map((card, index) => ({
        id: card.id,
        eventType: index === 0 ? "something else" : card.eventType,
      }));
      expect(checkStage2Faithfulness(cards, drifted).join(" ")).toContain(
        "`eventType` moved between stages",
      );
    });

    it("catches a card with no case, and a case with no card", () => {
      const short = cards.slice(1).map((card) => ({ id: card.id, eventType: card.eventType }));
      expect(checkStage2Faithfulness(cards, short).join(" ")).toContain(
        "frozen situation card has no case",
      );
      const extra = [
        ...cards.map((card) => ({ id: card.id, eventType: card.eventType })),
        { id: "DIC4-P99", eventType: "type-a" },
      ];
      expect(checkStage2Faithfulness(cards, extra).join(" ")).toContain(
        "DIC4-P99: case has no frozen situation card",
      );
    });
  });

  describe("the assembled corpus", () => {
    it("accepts the precommitted order and rejects a reordering", () => {
      const corpus = {
        version: SEALED_CHALLENGE_V4_VERSION,
        cases: SEALED_CHALLENGE_V4_CASE_IDS.map((id) => ({ id })),
      };
      expect(checkAssembledSealedChallengeV4(corpus)).toEqual([]);
      expect(
        checkAssembledSealedChallengeV4({ ...corpus, cases: [...corpus.cases].reverse() }).join(
          " ",
        ),
      ).toContain("in the declared assembly order");
      expect(
        checkAssembledSealedChallengeV4({
          ...corpus,
          version: "design_intent_sealed_challenge_v3",
        }).join(" "),
      ).toContain("top-level `version` must be `design_intent_sealed_challenge_v4`");
    });

    /**
     * Tolerant of absence, deliberately. T19B had to undo a hard `existsSync === false`, because it
     * makes adding the corpus require editing a test.
     */
    it("conforms to what was precommitted here, or does not exist yet", () => {
      const file = `${ROOT}${corpusPath("designIntentChallenge")}`;
      if (!existsSync(file)) return;
      expect(checkAssembledSealedChallengeV4(JSON.parse(readFileSync(file, "utf8")))).toEqual([]);
    });

    it("has no v4 case or card on disk at the protocol freeze, or conforms once it does", () => {
      // Written to pass in both worlds for the same reason as above. What it refuses is the state
      // that would mean the protocol was not frozen first: cards present under a namespace this
      // file does not declare.
      const cardsDir = `${ROOT}${V4_PROVENANCE}`;
      if (!existsSync(cardsDir)) return;
      expect(SEALED_CHALLENGE_V4_CASE_IDS).toHaveLength(12);
    });
  });

  describe("the canon it transcribes", () => {
    it("still says premise first, and says why", () => {
      expect(PLAN).toContain("**v4 changes the method, not just the author.**");
      expect(PLAN).toContain("**before the design vocabulary is shown at all**");
    });

    it("still forbids carrying a v3 lesson into the new packet", () => {
      expect(PLAN).toContain("**No lesson from v3 travels into either packet.**");
    });

    it("still says neither v3 half may be carried forward, and why that is not waste", () => {
      expect(PLAN).toContain("would make the corpus adaptive to review outcomes");
      expect(PLAN).toContain("Neither v3 half enters v4");
    });

    it("still records what v3's failure is and is not evidence about", () => {
      expect(PLAN).toContain("It is evidence about **benchmark authoring distributions**");
      expect(PLAN).toContain("**zero paid model evidence**");
    });
  });
});
