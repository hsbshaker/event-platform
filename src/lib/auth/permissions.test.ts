import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, type ActorRole, type Capability } from "./permissions";

/** spec.md §25 permissions matrix, transcribed row by row. */
const MATRIX: Record<Capability, [owner: boolean, cohost: boolean, guest: boolean]> = {
  view_event: [true, true, true],
  edit_event_content: [true, true, false],
  manage_privacy: [true, true, false],
  manage_guests: [true, true, false],
  manage_rsvp_questions: [true, true, false],
  view_rsvp_responses: [true, true, false], // guest: own party only, handled by guest session (Phase 7)
  manage_registry: [true, true, false],
  manage_native_item_purchase_state: [true, true, false],
  send_messages: [true, true, false],
  use_design_controls: [true, true, false],
  add_redesign_inspiration: [true, true, false],
  enter_redesign_feedback: [true, true, false],
  generate_redesign_concepts: [true, true, false],
  browse_select_concepts: [true, true, false],
  preview: [true, true, true],
  publish: [true, true, false], // "after payment is satisfied"
  manage_billing: [true, false, false],
  manage_cohosts: [true, false, false],
  delete_event: [true, false, false],
  transfer_ownership: [false, false, false],
};

const ROLES: ActorRole[] = ["owner", "cohost", "guest"];

describe("permission matrix (spec.md §25)", () => {
  it("covers every capability", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...CAPABILITIES].sort());
  });

  for (const capability of CAPABILITIES) {
    it(`${capability} matches the table`, () => {
      const expected = MATRIX[capability];
      ROLES.forEach((role, i) => {
        expect(can(role, capability, { paymentSatisfied: true, published: false })).toBe(
          expected[i],
        );
      });
    });
  }

  it("publish requires payment to be satisfied for both owner and co-host", () => {
    expect(can("owner", "publish")).toBe(false);
    expect(can("cohost", "publish")).toBe(false);
    expect(can("owner", "publish", { paymentSatisfied: true })).toBe(true);
    expect(can("cohost", "publish", { paymentSatisfied: true })).toBe(true);
  });

  it("disables redesign and concept switching after publish (spec.md §8.2)", () => {
    for (const role of ["owner", "cohost"] as const) {
      expect(can(role, "generate_redesign_concepts", { published: true })).toBe(false);
      expect(can(role, "browse_select_concepts", { published: true })).toBe(false);
      expect(can(role, "use_design_controls", { published: true })).toBe(true);
      expect(can(role, "edit_event_content", { published: true })).toBe(true);
    }
  });
});
