/**
 * The seven properties the Phase 4A remediation exists to guarantee.
 *
 * **What these prove, and what they cannot.** They prove the *contract and the evaluation
 * machinery* behave correctly — that a fabricated host constraint is caught, that a real one
 * cannot silently vanish, that a theme cannot become an event type. They prove nothing about
 * whether the model does the right thing; only a run against a live model and an independent
 * blind reviewer can say that. A test asserting "the model does not suppress literal imagery"
 * would be a test asserting a fixture, which is worth nothing.
 *
 * So each proof below is phrased as what it actually establishes: given a response of shape X,
 * the checks reach verdict Y. Every fixture is hand-built and none is a recorded model output.
 *
 * Acceptance criteria: N/A — test-only. Supports `spec.md §31 — Event Identity and diversity`
 * ("preserves supplied facts exactly and invents none") and `§7.6b`.
 */
import { describe, expect, it } from "vitest";

import type { EventIdentity, SuppliedEventFacts } from "@/lib/ai/event-identity/contract";
import { eventIdentityResultSchema } from "@/lib/ai/event-identity/contract";
import {
  checkClarification,
  checkExpectedFacts,
  checkHostConstraintsGrounded,
  checkHostPhraseRouting,
  type CorpusCase,
} from "./creative-understanding";

const identity = (overrides: Partial<EventIdentity> = {}): EventIdentity => ({
  creativeDirection: "A warm, particular identity built from one idea rather than a mood board.",
  toneKeywords: ["warm", "particular", "unhurried"],
  colorsExplicitlyConstrained: false,
  paletteIntent: { requiredColors: [], preferredColors: [], avoidColors: [], dominanceNotes: "" },
  tonalIntent: "Mid-toned, with real contrast where it matters.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["invitation"],
  compatibleTypographyCategories: ["soft_serif"],
  visualMotifs: [],
  textureDirection: "paper with a little tooth",
  typographyDirection: "a generous serif with a quiet companion",
  copyTone: "warm and direct",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No visual inspiration supplied.",
  ...overrides,
});

const facts = (overrides: Partial<SuppliedEventFacts> = {}): SuppliedEventFacts => ({
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
  ...overrides,
});

const testCase = (overrides: Partial<CorpusCase> = {}): CorpusCase => ({
  id: "PROOF",
  prompt: "a gathering",
  expectClarification: "no",
  ...overrides,
});

const question = (text: string) => ({
  question: text,
  whyItMatters: "the answers lead somewhere materially different",
  options: [
    { label: "One", isDefer: false },
    { label: "Two", isDefer: false },
    { label: "You decide", isDefer: true },
  ],
});

/* ------------------------------------------------------------------ proof 1 */

describe("proof 1 — inferred creative advice cannot become a host-owned constraint", () => {
  const prompt = "50th for my father, he spent his life at sea";

  it("fails a constraint the host never uttered, however sensible it is", () => {
    // The baseline's exact failure: good advice, filed where it claims client authority.
    const check = checkHostConstraintsGrounded(
      testCase({ prompt }),
      identity({ hostConstraints: ["avoid literal nautical motifs", "no navy and white stripes"] }),
    );
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("the model's own recommendation");
  });

  it("passes the identical advice when it is filed as guidance", () => {
    // Deliberately paired with a grounded constraint present, so this exercises the real
    // filter rather than the empty-array early return.
    const check = checkHostConstraintsGrounded(
      testCase({ prompt: `${prompt}, and no photographs on the walls` }),
      identity({
        hostConstraints: ["no photographs on the walls"],
        creativeGuidance: ["avoid literal nautical motifs", "no navy and white stripes"],
      }),
    );
    expect(check.status).toBe("pass");
    expect(check.detail).toContain("1 host constraint");
  });

  it("fails a platform rule claimed as a host instruction", () => {
    // spec.md §7.6 is always true and is not this host's instruction. Recording it as one
    // misrepresents the host and spends authority the platform already has.
    const check = checkHostConstraintsGrounded(
      testCase({ prompt }),
      identity({ hostConstraints: ["no logos or proprietary characters"] }),
    );
    expect(check.status).toBe("fail");
  });

  it("fails an inversion of something the host did say", () => {
    // "for a boy" became "do not rely on baby blue" in the baseline. The words are adjacent;
    // the authority is fabricated.
    const check = checkHostConstraintsGrounded(
      testCase({ prompt: "baby shower for a boy" }),
      identity({ hostConstraints: ["do not use baby blue"] }),
    );
    expect(check.status).toBe("fail");
  });
});

/* ------------------------------------------------------------------ proof 2 */

describe("proof 2 — explicit host constraints remain authoritative and cannot vanish", () => {
  const prompt = "engagement dinner, no white flowers please — long story";

  it("accepts the host's own words, kept as they wrote them", () => {
    const check = checkHostConstraintsGrounded(
      testCase({ prompt }),
      identity({ hostConstraints: ["no white flowers"] }),
    );
    expect(check.status).toBe("pass");
  });

  it("accepts a trimmed span, because a near-verbatim quotation is still a quotation", () => {
    const check = checkHostConstraintsGrounded(
      testCase({ prompt }),
      identity({ hostConstraints: ["white flowers"] }),
    );
    expect(check.status).toBe("pass");
  });

  it("fails when a declared host constraint is dropped instead of carried", () => {
    const check = checkHostPhraseRouting(
      testCase({ prompt, hostPhrases: [{ phrase: "no white flowers", kind: "constraint" }] }),
      identity({ creativeGuidance: ["lean toward warm-toned blooms"] }),
    );
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("was not carried");
  });

  it("accepts a near-verbatim quotation of the declared phrase", () => {
    // Grounding permits a trimmed span, so routing must too. Demanding containment in one
    // direction only failed a model for quoting exactly as near-verbatim as instructed.
    const check = checkHostPhraseRouting(
      testCase({
        prompt: "supper for my in-laws — we're Ghanaian, not Nigerian, it matters to them",
        hostPhrases: [{ phrase: "we're Ghanaian, not Nigerian", kind: "constraint" }],
      }),
      identity({ hostConstraints: ["Ghanaian, not Nigerian"] }),
    );
    expect(check.status).toBe("pass");
  });

  it("fails when it is demoted into advisory guidance", () => {
    // Demotion is the mirror of fabrication and just as damaging: a real prohibition becomes
    // something a later stage is entitled to overrule.
    const check = checkHostPhraseRouting(
      testCase({ prompt, hostPhrases: [{ phrase: "no white flowers", kind: "constraint" }] }),
      identity({ creativeGuidance: ["no white flowers"] }),
    );
    expect(check.status).toBe("fail");
  });
});

/* ------------------------------------------------------------------ proof 3 */

describe("proof 3 — literal subject matter is not automatically prohibited", () => {
  const prompt = "retirement party for my mum, she keeps bees";

  it("does not fail a brief that embraces the literal subject", () => {
    const check = checkHostConstraintsGrounded(
      testCase({ prompt: `${prompt}, nothing black-tie` }),
      identity({
        hostConstraints: ["nothing black-tie"],
        visualMotifs: ["honeycomb rule work", "a single drawn bee"],
        creativeGuidance: ["let the bees be literal and beautifully drawn rather than implied"],
      }),
    );
    expect(check.status).toBe("pass");
    expect(check.detail).toContain("1 host constraint");
  });

  it("fails a brief that suppresses it under claimed host authority", () => {
    // Suppression may be a defensible creative call. It is never something the host said.
    const check = checkHostConstraintsGrounded(
      testCase({ prompt }),
      identity({ hostConstraints: ["avoid literal bee imagery", "keep references abstract"] }),
    );
    expect(check.status).toBe("fail");
  });

  it("leaves the aesthetic judgement to the blind reviewer either way", () => {
    // Both of the above are mechanically decidable only about authority. Whether abstraction
    // was the better call is not, and the checks must not pretend otherwise.
    const abstracted = checkHostConstraintsGrounded(
      testCase({ prompt: `${prompt}, nothing black-tie` }),
      identity({
        hostConstraints: ["nothing black-tie"],
        creativeGuidance: ["keep the bees implied rather than drawn"],
      }),
    );
    expect(abstracted.status).toBe("pass");
  });
});

/* ------------------------------------------------------------------ proof 4 */

describe("proof 4 — creative delegation yields a bet, not a question", () => {
  const delegated = testCase({
    prompt: "leaving do for a colleague. no idea what I want, you pick",
    expectClarification: "no",
  });

  it("fails asking the host to supply the taste they delegated", () => {
    const checks = checkClarification(
      delegated,
      [question("Should this feel formal or casual?")],
      true,
    );
    expect(checks.find((c) => c.name === "clarificationExpectation")?.status).toBe("fail");
  });

  it("passes committing without a question", () => {
    const checks = checkClarification(delegated, [], false);
    expect(checks.every((c) => c.status !== "fail")).toBe(true);
  });

  it("holds the contract to a defer option whenever a question is asked at all", () => {
    // §7.6b #4 is structural, so a host with no design vocabulary always has a way through.
    const bare = question("Warm or cool?");
    bare.options = bare.options.filter((o) => !o.isDefer);
    const parsed = eventIdentityResultSchema.safeParse({
      identity: identity(),
      suppliedFacts: facts(),
      clarification: { needed: true, questions: [bare] },
    });
    expect(parsed.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ proof 5 */

describe("proof 5 — materially consequential ambiguity can produce a clarification", () => {
  const ambiguous = testCase({
    prompt: "anniversary party, we want it baroque",
    expectClarification: "expected",
  });

  it("does not penalise one well-formed question on a genuinely ambiguous prompt", () => {
    const checks = checkClarification(
      ambiguous,
      [question("Should this lean opulent-maximal or severe and architectural?")],
      true,
    );
    expect(checks.every((c) => c.status !== "fail")).toBe(true);
  });

  it("still refuses a logistics question dressed as a creative one", () => {
    const checks = checkClarification(
      ambiguous,
      [question("Where is the event being held?")],
      true,
    );
    expect(checks.find((c) => c.name === "clarificationNotLogistics")?.status).toBe("fail");
  });

  it("still enforces the ceiling", () => {
    const checks = checkClarification(
      ambiguous,
      [question("A?"), question("B?"), question("C?"), question("D?")],
      true,
    );
    expect(checks.find((c) => c.name === "clarificationCeiling")?.status).toBe("fail");
  });
});

/* ------------------------------------------------------------------ proof 6 */

describe("proof 6 — a theme is not silently promoted to an event type", () => {
  const themeOnly = testCase({
    prompt: "an evening in the orangery",
    expectedFacts: { eventType: null },
  });

  it("fails the promotion even though the theme is quotable from the prompt", () => {
    // This is the whole reason expectedFacts exists: a grounding check passes this, because
    // the words really are the host's. Only an explicit assertion catches it.
    const grounded = checkHostConstraintsGrounded(themeOnly, identity());
    expect(grounded.status).toBe("pass");

    const check = checkExpectedFacts(themeOnly, facts({ eventType: "an evening in the orangery" }));
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("must be absent");
  });

  it("passes when the theme is left out of the facts entirely", () => {
    expect(checkExpectedFacts(themeOnly, facts()).status).toBe("pass");
  });

  it("accepts a real event type the host actually named", () => {
    const named = testCase({
      prompt: "a christening lunch in the orangery",
      expectedFacts: { eventType: "christening lunch" },
    });
    expect(checkExpectedFacts(named, facts({ eventType: "christening lunch" })).status).toBe(
      "pass",
    );
  });
});

/* ------------------------------------------------------------------ proof 7 */

describe("proof 7 — honoree name and description coexist and survive verbatim", () => {
  const named = testCase({
    prompt: "confirmation lunch for our son Theo",
    expectedFacts: { honoreeName: "Theo", honoreeDescriptionText: "our son" },
  });

  it("passes when both are carried", () => {
    const check = checkExpectedFacts(
      named,
      facts({ honoreeName: "Theo", honoreeDescriptionText: "our son" }),
    );
    expect(check.status).toBe("pass");
  });

  it("fails when the relationship is dropped — the baseline's silent loss", () => {
    const check = checkExpectedFacts(named, facts({ honoreeName: "Theo" }));
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("honoreeDescriptionText");
  });

  it("fails when the relationship is filed as the name", () => {
    // Equality on honoreeName is what makes this decidable: a relationship is not a name.
    const check = checkExpectedFacts(
      named,
      facts({ honoreeName: "our son Theo", honoreeDescriptionText: "our son" }),
    );
    expect(check.status).toBe("fail");
  });

  it("fails a normalized value, and passes the host's own wording", () => {
    const dated = testCase({
      prompt: "supper club on Weds Feb 4 at The Long Room",
      expectedFacts: { dateText: "Weds Feb 4", venueText: "The Long Room" },
    });
    expect(
      checkExpectedFacts(
        dated,
        facts({ dateText: "Wednesday, February 4", venueText: "The Long Room" }),
      ).status,
    ).toBe("fail");
    expect(
      checkExpectedFacts(dated, facts({ dateText: "Weds Feb 4", venueText: "The Long Room" }))
        .status,
    ).toBe("pass");
  });
});
