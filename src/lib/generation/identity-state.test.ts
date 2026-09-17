import { describe, expect, it } from "vitest";
import { identityClarificationState } from "./identity-state";

/**
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.8`; `spec.md §7.6b`.
 */
describe("the derived clarification state", () => {
  it("is awaiting clarification when the latest revision is provisional", () => {
    const state = identityClarificationState({
      latestRevision: { id: "r2", revision: 2, is_provisional: true },
      authoritativeRevisionId: null,
    });
    expect(state.awaitingClarification).toBe(true);
    expect(state.consumableDownstream).toBe(false);
  });

  it("reports both facts independently when both are true at once", () => {
    // `spec.md §7.6b` puts no lifetime cap on boundary rounds, so a rerun after an already
    // authoritative identity may itself return a boundary question. Collapsing the two into one
    // flag is how a surface and a downstream stage come to disagree about the same event.
    const state = identityClarificationState({
      latestRevision: { id: "r3", revision: 3, is_provisional: true },
      authoritativeRevisionId: "r2",
    });
    expect(state.awaitingClarification).toBe(true);
    expect(state.consumableDownstream).toBe(true);
    expect(state.latestRevisionId).toBe("r3");
    expect(state.authoritativeRevisionId).toBe("r2");
  });

  it("is neither for an event that has never run identity", () => {
    const state = identityClarificationState({
      latestRevision: null,
      authoritativeRevisionId: null,
    });
    expect(state).toMatchObject({
      awaitingClarification: false,
      consumableDownstream: false,
      latestRevisionId: null,
      latestRevision: null,
    });
  });

  it("does not read an undecidable revision as an open question", () => {
    // Cannot happen today — `identity_questions()` raises rather than returning empty, so an
    // unreadable envelope is refused at insert. If one ever arrived, the authoritative pointer
    // stays the thing that decides usability, and `validate_authoritative_identity()` guards it.
    const state = identityClarificationState({
      latestRevision: { id: "r1", revision: 1, is_provisional: null },
      authoritativeRevisionId: null,
    });
    expect(state.awaitingClarification).toBe(false);
    expect(state.consumableDownstream).toBe(false);
  });
});
