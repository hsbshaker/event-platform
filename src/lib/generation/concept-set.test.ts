/**
 * The set-level review: what it repairs, what it only reports, and the line between them.
 *
 * `spec.md §7.8` has required a deterministic fallback for a missing, invalid or duplicate concept
 * name since Revision 1, and nothing implemented it — which is how one T22 batch returned the same
 * card three times and reached a blind reviewer. These tests are that rule, plus the convergence
 * signals that are reported and deliberately not acted on.
 *
 * The division under test is the important one. A card is host-facing metadata the compiler never
 * reads and canon already gives it a fallback, so a duplicate is repaired. A palette, a motif set
 * or a composition vector is the model's creative answer, so convergence in one is **evidence** and
 * rewriting it would fabricate a decision nobody made — and would optimise the metric rather than
 * the product.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` ("Duplicate or
 * invalid concept names fall back deterministically"). Guardrails: `spec.md §32 #21`.
 */
import { describe, expect, it } from "vitest";

import type { ConceptPremise } from "@/lib/ai/concept-premise/contract";
import type { DesignIntent, Presentation } from "@/lib/renderer/design-intent";

import { PREMISE_FIXTURE_IDENTITY, validPremiseSet } from "../../../tests/fixtures/concept-premise";
import {
  clampProse,
  DESCRIPTION_OVERLAP_CEILING,
  fallbackCard,
  reviewConceptSet,
  THESIS_OVERLAP_CEILING,
  type ReviewedConcept,
} from "./concept-set";

const PREMISES = validPremiseSet().premises;

function intent(overrides: Partial<DesignIntent> = {}): DesignIntent {
  return {
    family: "editorial",
    tonalDirection: "mid",
    palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
    typographyPairing: "grotesk_archivo_inter",
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: "editorial",
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "restrained",
    },
    motifs: ["linen"],
    ...overrides,
  };
}

function concept(
  index: number,
  presentation: Presentation | null,
  overrides: Partial<DesignIntent> = {},
  premise: ConceptPremise = PREMISES[index],
): ReviewedConcept {
  return { index, designIntent: intent(overrides), presentation, premise };
}

const card = (name: string, description: string): Presentation => ({ name, description });

const review = (concepts: readonly ReviewedConcept[]) =>
  reviewConceptSet({ concepts, identity: PREMISE_FIXTURE_IDENTITY });

const GOOD: readonly Presentation[] = [
  card(
    "Ordered States",
    "Read the evening along a row and see what changed between one pull and the next.",
  ),
  card("Working Floor", "Turn up while something is being pulled and get waved over to watch."),
  card("Under the Lamp", "Handle a single sheet closely and notice how the ink sits on it."),
];

describe("the cards a host actually sees", () => {
  it("keeps three good cards untouched", () => {
    const out = review([concept(0, GOOD[0]), concept(1, GOOD[1]), concept(2, GOOD[2])]);
    expect(out.cards.map((c) => c.name)).toEqual(GOOD.map((c) => c.name));
    expect(out.cards.every((c) => !c.fallback)).toBe(true);
    expect(out.deviations).toEqual([]);
  });

  it("replaces a duplicated name from the premise, and logs it", () => {
    // The observed defect, in its exact shape: two siblings returning one name. The earlier index
    // keeps it and the later one falls back, so the same batch always repairs the same concept.
    const out = review([
      concept(0, GOOD[0]),
      concept(1, card(GOOD[0].name, GOOD[1].description)),
      concept(2, GOOD[2]),
    ]);
    expect(out.cards[0].name).toBe(GOOD[0].name);
    expect(out.cards[1].name).toBe(PREMISES[1].title);
    expect(out.cards[1].fallback).toBe(true);
    expect(out.deviations).toHaveLength(1);
    expect(out.deviations[0].rule).toBe("concept-card.name");
    expect(out.deviations[0].path).toBe("concepts.1.presentation.name");
  });

  it("catches a duplicate written with the same words in a different order", () => {
    const reordered = GOOD[0].name.split(" ").reverse().join(" ");
    const out = review([
      concept(0, GOOD[0]),
      concept(1, card(reordered, GOOD[1].description)),
      concept(2, GOOD[2]),
    ]);
    expect(out.cards[1].name).toBe(PREMISES[1].title);
  });

  it("cannot itself produce a collision, because the premise titles are validated distinct", () => {
    // All three cards unusable at once — the worst case for the fallback. It still yields three
    // different names, which is the property `spec.md §7.8` needs and which a numbered fallback
    // would have bought at the cost of a name the presentation contract forbids.
    const out = review([concept(0, null), concept(1, null), concept(2, null)]);
    expect(new Set(out.cards.map((c) => c.name)).size).toBe(3);
    expect(out.cards.map((c) => c.name)).toEqual(PREMISES.map((p) => p.title));
    expect(
      out.cards.every((c) => /^[\p{L}\p{M}][\p{L}\p{M}'’ \-–]*[\p{L}\p{M}]$/u.test(c.name)),
    ).toBe(true);
  });

  it("replaces a description that restates a sibling's", () => {
    const out = review([
      concept(0, GOOD[0]),
      concept(1, card(GOOD[1].name, GOOD[0].description)),
      concept(2, GOOD[2]),
    ]);
    expect(out.cards[1].description).not.toBe(GOOD[0].description);
    expect(out.deviations.some((d) => d.rule === "concept-card.description")).toBe(true);
    expect(out.cards[1].name).toBe(GOOD[1].name);
  });

  it("replaces a description that restates the brief's own thesis", () => {
    // Blind-review pattern S7, made decidable. A card whose content words are mostly the
    // identity's `creativeDirection` has described the event the host already knows about.
    const thesis = PREMISE_FIXTURE_IDENTITY.creativeDirection;
    const out = review([
      concept(0, card(GOOD[0].name, thesis.slice(0, 138))),
      concept(1, GOOD[1]),
      concept(2, GOOD[2]),
    ]);
    expect(out.cards[0].fallback).toBe(true);
    expect(out.deviations[0].detail).toContain("creative thesis");
  });

  it("keeps a card whose overlap sits below the ceilings", () => {
    // The thresholds catch restatement, not adjacency. Three cards for one event share vocabulary,
    // and a rule tight enough to separate neighbours would replace honest cards with fallbacks.
    expect(DESCRIPTION_OVERLAP_CEILING).toBeGreaterThan(0.5);
    expect(THESIS_OVERLAP_CEILING).toBeGreaterThan(0.5);
    const out = review([concept(0, GOOD[0]), concept(1, GOOD[1]), concept(2, GOOD[2])]);
    expect(out.cards.every((c) => !c.fallback)).toBe(true);
  });

  it("derives a card that fits the contract's own bounds", () => {
    for (const premise of PREMISES) {
      const derived = fallbackCard(premise);
      expect(derived.description.length).toBeLessThanOrEqual(140);
      expect(derived.description.length).toBeGreaterThanOrEqual(20);
      expect(derived.name).toBe(premise.title);
    }
  });

  it("clamps prose at a boundary rather than mid-word", () => {
    expect(clampProse("one two three", 40)).toBe("one two three");
    expect(clampProse("First sentence here. Second one runs on and on and on.", 30)).toBe(
      "First sentence here.",
    );
    const source = "a passage with no sentence boundary in it at all anywhere";
    const clamped = clampProse(source, 24);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped.length).toBeLessThanOrEqual(24);
    // The kept part is a whole-word prefix of the source: every word survives intact or not at all.
    const kept = clamped.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length] === undefined || source[kept.length] === " ").toBe(true);
  });
});

describe("convergence is reported, never repaired", () => {
  it("reports two siblings that chose an identical design vector", () => {
    const out = review([concept(0, GOOD[0]), concept(1, GOOD[1]), concept(2, GOOD[2])]);
    const identical = out.signals.filter((s) => s.signal === "identical-design-vector");
    expect(identical).toHaveLength(3);
    expect(identical[0].severity).toBe("reported");
    // And nothing was rewritten to make them differ.
    expect(out.deviations.filter((d) => d.rule.startsWith("designIntent"))).toEqual([]);
  });

  it("reports motif overlap and a shared dominant colour without touching either", () => {
    const out = review([
      concept(0, GOOD[0], { motifs: ["linen", "stripe"] }),
      concept(1, GOOD[1], { motifs: ["linen", "stripe"] }),
      concept(2, GOOD[2], {
        motifs: ["botanical"],
        palette: { colors: ["#111111", "#222222", "#333333"], dominant: "#111111" },
      }),
    ]);
    expect(out.signals.some((s) => s.signal === "motif-overlap")).toBe(true);
    expect(out.signals.some((s) => s.signal === "palette-proximity")).toBe(true);
    expect(out.deviations.every((d) => d.rule.startsWith("concept-card."))).toBe(true);
  });

  it("stays silent when the three designs really do differ", () => {
    const out = review([
      concept(0, GOOD[0], { motifs: ["stripe"], density: "spacious" }),
      concept(1, GOOD[1], {
        motifs: [],
        density: "compact",
        composition: { ...intent().composition, ornament: "none", asymmetry: "strong" },
        palette: { colors: ["#101010", "#202020", "#303030"], dominant: "#202020" },
      }),
      concept(2, GOOD[2], {
        motifs: ["botanical", "linen"],
        composition: { ...intent().composition, ornament: "decorative", rhythm: "punctuated" },
        palette: { colors: ["#901010", "#A02020", "#B03030"], dominant: "#901010" },
      }),
    ]);
    expect(out.signals.filter((s) => s.severity === "reported")).toEqual([]);
  });

  it("flags a premise the design plainly argues against, as advisory only", () => {
    // `surfaceRichness: bare` answered with ornament and two motifs. Advisory because the
    // DesignIntent owns the translation and there is no single correct mapping to check against —
    // it is a reading for a human, never something the system acts on.
    const bare = PREMISES.find((p) => p.register.surfaceRichness === "bare")!;
    const out = review([
      concept(0, GOOD[0], { motifs: ["linen", "stripe"] }, bare),
      concept(1, GOOD[1]),
      concept(2, GOOD[2]),
    ]);
    const signal = out.signals.find((s) => s.signal === "premise-not-expressed");
    expect(signal?.severity).toBe("advisory");
    expect(signal?.concepts).toEqual([0]);
  });
});

describe("the review is a pure function of the batch", () => {
  it("produces the same cards, deviations and signals every time", () => {
    const build = () => [
      concept(0, null),
      concept(1, card(GOOD[0].name, GOOD[1].description)),
      concept(2, GOOD[2]),
    ];
    expect(JSON.stringify(review(build()))).toBe(JSON.stringify(review(build())));
  });

  it("does not depend on the order the concepts are handed over", () => {
    const concepts = [concept(0, GOOD[0]), concept(1, GOOD[1]), concept(2, GOOD[2])];
    expect(JSON.stringify(review([...concepts].reverse()).cards)).toBe(
      JSON.stringify(review(concepts).cards),
    );
  });
});
