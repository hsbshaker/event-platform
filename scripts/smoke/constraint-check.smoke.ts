/**
 * Deterministic re-derivation of what the live run sent to Composition.
 *
 * The composition request text is not persisted, so this rebuilds it from the same inputs the run
 * used — the same identity fixture, the same capabilities and content profile the concept row
 * records — and checks what reaches the model. No provider call; the assembly is pure.
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { LOCALLY_GROWN_IDENTITY } from "./locally-grown-identity";
import { compositionBrief } from "@/lib/ai/composition/brief";
import { assembleCompositionUserMessage } from "@/lib/ai/openai/composition-input";
import { systemPrompt } from "@/lib/ai/openai/composition";

const OUT = "docs/model-evals/results/phase-4d-live-smoke-locally-grown";

it("host constraints reached Composition; guidance and the host's own words did not", () => {
  const summary = JSON.parse(readFileSync(`${OUT}/run-summary.json`, "utf8"));
  const concept = JSON.parse(readFileSync(`${OUT}/concepts/concept-1.json`, "utf8"));

  const brief = compositionBrief(LOCALLY_GROWN_IDENTITY);
  const message = assembleCompositionUserMessage({
    brief,
    contentProfile: concept.contentProfile,
    capabilities: concept.capabilities,
    designIntent: concept.designIntent,
    directive: {
      opening: "title",
      structure: "Stack",
      date: "inline",
      motif: "none",
      surface: "base",
      details: "own",
      rsvpIntro: "above",
      registry: "grid",
    } as never,
    forbiddenTokens: [],
    seed: 1,
  });
  const whole = `${systemPrompt()}\n${message}`;

  // 1. Every authoritative constraint arrives, verbatim and complete.
  for (const c of LOCALLY_GROWN_IDENTITY.hostConstraints) expect(message).toContain(c);
  expect(brief.hostConstraints).toEqual(LOCALLY_GROWN_IDENTITY.hostConstraints);

  // 2. They arrive marked authoritative, not as one more suggestion.
  expect(whole).toMatch(/AUTHORITATIVE/i);

  // 3. No advisory guidance is promoted into that block, or anywhere else.
  for (const g of LOCALLY_GROWN_IDENTITY.creativeGuidance) expect(message).not.toContain(g);
  expect(message).not.toContain("creativeGuidance");

  // 4. The host's own words never travel. Interpretation happened once.
  expect(message).not.toContain("Baby shower with a locally grown theme");
  expect(message).not.toContain("classy and elevated");
  expect(message).not.toContain("vibe");

  // 5. Nothing §6.1 prohibits: no guest data, RSVP data, registry contents or private code.
  for (const forbidden of ["access_code", "accessCode", "guest", "rsvpParty", "registryItems"]) {
    expect(message).not.toContain(forbidden);
  }

  // 6. The content profile is measurements, never strings to lay out. Asserted on the block
  //    rather than by substring: the phrase "A baby shower" legitimately appears inside
  //    `creativeDirection`, which is the interpretation and not the page's title.
  const profileBlock = /<<<CONTENT_PROFILE([\s\S]*?)CONTENT_PROFILE/.exec(message)?.[1] ?? message;
  expect(profileBlock).toContain(String(concept.contentProfile.titleChars));
  expect(profileBlock).not.toContain(summary.content.venue);
  expect(profileBlock).not.toContain(summary.content.date);
});
