/**
 * The application validator is the authority, so it has to reject what strict mode cannot
 * express (`docs/model-contracts.md §3`).
 *
 * Strict structured output guarantees shape and enum membership and nothing else: no
 * lengths, no item counts, and none of the cross-field rules that make a clarification
 * usable. Everything below is a response the provider would happily return.
 *
 * Acceptance criteria: N/A — test-only. Supports `spec.md §31 — Prompt, auth, and
 * generation`: "at most three questions ever ... and offers `You decide`".
 */
import { describe, expect, it } from "vitest";

import { CLARIFICATION_CEILING } from "./contract";
import { parseAndValidateEventIdentityResult, validateEventIdentityResult } from "./validate";

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

const question = (label = "You decide") => ({
  kind: "creative",
  question: "Should this lean heritage or contemporary?",
  whyItMatters: "The two produce genuinely different identities.",
  options: [
    { label: "Heritage", isDefer: false },
    { label: "Contemporary", isDefer: false },
    { label, isDefer: true },
  ],
});

const result = (overrides: Record<string, unknown> = {}) => ({
  identity,
  suppliedFacts,
  clarification: { needed: false, questions: [] },
  ...overrides,
});

describe("event identity validation", () => {
  it("accepts a well-formed response", () => {
    expect(validateEventIdentityResult(result()).ok).toBe(true);
  });

  it("rejects an unknown field anywhere in the envelope", () => {
    const outcome = validateEventIdentityResult(result({ confidence: 0.9 }));
    expect(outcome.ok).toBe(false);
  });

  it("rejects an unknown field inside the creative brief", () => {
    const outcome = validateEventIdentityResult(
      result({ identity: { ...identity, heroSide: "left" } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects an operational field smuggled into the creative brief", () => {
    // spec.md §7.5: the brief is not an event-data dump. `additionalProperties: false`
    // is what enforces that, and this is the test that says so out loud.
    const outcome = validateEventIdentityResult(
      result({ identity: { ...identity, venue: "The Lodge at Hanson Park" } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("accepts facts that are entirely absent", () => {
    expect(validateEventIdentityResult(result()).ok).toBe(true);
  });

  it("rejects an empty string where the host said nothing", () => {
    // Absent is null, never "". An empty string would read downstream as a supplied blank.
    const outcome = validateEventIdentityResult(
      result({ suppliedFacts: { ...suppliedFacts, venueText: "" } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects more questions than the ceiling", () => {
    const outcome = validateEventIdentityResult(
      result({
        clarification: {
          needed: true,
          questions: Array.from({ length: CLARIFICATION_CEILING + 1 }, () => question()),
        },
      }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("accepts exactly the ceiling", () => {
    const outcome = validateEventIdentityResult(
      result({
        clarification: {
          needed: true,
          questions: Array.from({ length: CLARIFICATION_CEILING }, () => question()),
        },
      }),
    );
    expect(outcome.ok).toBe(true);
  });

  it("rejects a question with no defer option", () => {
    const bare = question();
    bare.options = bare.options.filter((o) => !o.isDefer);
    const outcome = validateEventIdentityResult(
      result({ clarification: { needed: true, questions: [bare] } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects a question with two defer options", () => {
    const doubled = question();
    doubled.options.push({ label: "Surprise me", isDefer: true });
    const outcome = validateEventIdentityResult(
      result({ clarification: { needed: true, questions: [doubled] } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects `needed` disagreeing with the questions returned", () => {
    expect(
      validateEventIdentityResult(result({ clarification: { needed: true, questions: [] } })).ok,
    ).toBe(false);
    expect(
      validateEventIdentityResult(
        result({ clarification: { needed: false, questions: [question()] } }),
      ).ok,
    ).toBe(false);
  });

  it("rejects an out-of-catalog enum value", () => {
    const outcome = validateEventIdentityResult(
      result({ identity: { ...identity, compatibleFamilies: ["brochure"] } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects too few tone keywords", () => {
    const outcome = validateEventIdentityResult(
      result({ identity: { ...identity, toneKeywords: ["quiet"] } }),
    );
    expect(outcome.ok).toBe(false);
  });

  it("reports non-JSON as a root validation failure rather than throwing", () => {
    const outcome = parseAndValidateEventIdentityResult("not json at all");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues[0].path).toBe("(root)");
  });

  it("names the offending path so the repair retry can quote it", () => {
    const outcome = validateEventIdentityResult(
      result({ identity: { ...identity, toneKeywords: [] } }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues.some((i) => i.path.includes("toneKeywords"))).toBe(true);
  });
});
