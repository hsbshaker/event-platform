/**
 * The blind artifact has to actually be blind.
 *
 * This is the check that protects the only independent signal Phase 4A produces. If our
 * expectations leak into the reviewer's copy, their read stops being evidence about the
 * model and becomes evidence about our framing — and we would not find out, because the
 * answer would look reasonable either way.
 *
 * Acceptance criteria: N/A — test-only. `docs/model-contracts.md §4.5`.
 */
import { describe, expect, it } from "vitest";

import { buildBlindArtifact, buildMechanicalReport, percentile, type CaseRun } from "./report";

const run: CaseRun = {
  caseData: {
    id: "TEST-01",
    prompt: "Ralph Lauren but baby",
    class: ["taste-heavy", "genuinely-ambiguous"],
    facts: { eventType: "baby shower" },
    expectClarification: "likely",
    mustAvoid: ["Polo Bear", "any Ralph Lauren logo, wordmark or crest"],
    notes: "The canonical reference-translation case. Heritage prep, equestrian detail.",
  },
  result: {
    identity: {
      creativeDirection: "Heritage prep translated into a quiet nursery register.",
      toneKeywords: ["heritage", "tailored", "warm"],
      colorsExplicitlyConstrained: false,
      paletteIntent: {
        requiredColors: [],
        preferredColors: ["navy", "cream"],
        avoidColors: [],
        dominanceNotes: "navy recedes",
      },
      tonalIntent: "Mid-toned, warm, quiet contrast.",
      toneExplicitlyConstrained: false,
      compatibleTonalDirections: ["mid"],
      compatibleFamilies: ["editorial"],
      compatibleTypographyCategories: ["heritage"],
      visualMotifs: ["restrained windowpane check"],
      textureDirection: "brushed cotton and worn leather",
      typographyDirection: "editorial serif with a quiet sans companion",
      copyTone: "warm, unfussy",
      designConstraints: ["Avoid literal nursery graphics."],
      inspirationSummary: "No visual inspiration supplied.",
    },
    suppliedFacts: {
      hostNames: null,
      honoreeName: null,
      eventType: "baby shower",
      dateText: null,
      timeText: null,
      venueText: null,
      addressText: null,
      localityText: null,
      rsvpDeadlineText: null,
    },
    clarification: {
      needed: true,
      questions: [
        {
          question: "Should this lean heritage-equestrian or heirloom-nursery?",
          whyItMatters: "The two produce materially different identities.",
          options: [
            { label: "Heritage-equestrian", isDefer: false },
            { label: "Heirloom-nursery", isDefer: false },
            { label: "You decide", isDefer: true },
          ],
        },
      ],
    },
  },
  evaluation: {
    caseId: "TEST-01",
    checks: [{ name: "factsPreserved", status: "pass", detail: "all 1 supplied fact(s) carried" }],
    mechanicalPass: true,
  },
  telemetry: {
    model: "gpt-5.6-sol",
    promptVersion: "event_identity_v3",
    schemaVersion: "event_identity_schema_v3",
    latencyMs: 8200,
    transientRetries: 0,
    repairRetries: 0,
    schemaValidFirstCall: true,
    inputTokens: 3000,
    outputTokens: 900,
    reasoningTokens: 400,
  },
};

describe("the blind artifact", () => {
  const artifact = buildBlindArtifact([run]);

  it("carries the prompt and the response", () => {
    expect(artifact).toContain("Ralph Lauren but baby");
    expect(artifact).toContain("Heritage prep translated into a quiet nursery register.");
    expect(artifact).toContain("Should this lean heritage-equestrian or heirloom-nursery?");
    expect(artifact).toContain("You decide");
    expect(artifact).toContain("baby shower");
  });

  it("does not leak what we expected the answer to be", () => {
    expect(artifact).not.toContain("Polo Bear");
    expect(artifact).not.toContain("mustAvoid");
    expect(artifact).not.toContain("wordmark");
    expect(artifact).not.toContain("equestrian detail"); // from the corpus author's notes
  });

  it("does not leak our own verdict", () => {
    expect(artifact).not.toMatch(/mechanical/i);
    expect(artifact).not.toMatch(/\bpass\b/i);
    expect(artifact).not.toMatch(/\bfail/i);
    expect(artifact).not.toContain("expectClarification");
    expect(artifact).not.toContain("likely");
  });

  it("does not leak implementation detail or prompt internals", () => {
    expect(artifact).not.toContain("event_identity_v3");
    expect(artifact).not.toContain("whyItMatters");
    expect(artifact).not.toMatch(/taste-heavy|genuinely-ambiguous/);
    expect(artifact).not.toMatch(/schema|isDefer|suppliedFacts/);
  });

  it("does not tell the reviewer what to conclude", () => {
    // The framing may say what the system does; it may not say what good looks like.
    const framing = artifact.slice(0, artifact.indexOf("## TEST-01"));
    expect(framing).not.toMatch(/should|ought|cliché|avoid|correct|wrong|quality|better/i);
  });

  it("still names the case so a review can be matched back", () => {
    expect(artifact).toContain("TEST-01");
  });
});

describe("the mechanical report", () => {
  const report = buildMechanicalReport([run], "2026-09-14T08:00:00Z");

  it("states what it does not establish", () => {
    expect(report).toContain("necessary and never sufficient");
  });

  it("records telemetry and per-case checks", () => {
    expect(report).toContain("gpt-5.6-sol");
    expect(report).toContain("event_identity_v3");
    expect(report).toContain("factsPreserved");
    expect(report).toContain("8200 ms");
  });

  it("reports a failed call rather than omitting it", () => {
    const failed: CaseRun = {
      ...run,
      result: undefined,
      evaluation: undefined,
      error: { kind: "invalid_output", message: "failed after the repair retry" },
    };
    const withFailure = buildMechanicalReport([failed], "2026-09-14T08:00:00Z");
    expect(withFailure).toContain("CALL FAILED");
    expect(withFailure).toContain("0 / 1");
  });
});

describe("percentile", () => {
  it("uses nearest-rank rather than implying precision the sample lacks", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 95)).toBe(4);
    expect(percentile([], 50)).toBe(0);
  });
});
