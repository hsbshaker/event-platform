import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fact or title edit re-breaks that fact's boxes in every customization of the event, in the
 * same request (`spec.md §20.2`; `docs/card-system.md §7`, "so a card restored later never shows
 * stale lines"), after the details are saved; a failure there never undoes or fails the save. The
 * re-break itself is covered in `src/lib/generation/customization.server.test.ts`.
 */

const EVENT = "00000000-0000-4000-8000-000000000001";
const rebreak = vi.hoisted(() => vi.fn());
/** The collaborator's client: the venue check reads the stored venue through it. */
const client = vi.hoisted(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { venue_name: null, address: null }, error: null }),
      }),
    }),
  }),
}));

vi.mock("@/lib/auth/event-access", () => ({ requireEventAccess: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/events/card-text-fit.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/card-text-fit.server")>()),
  cardTextFitErrors: async () => null,
}));
vi.mock("@/lib/events/apply-patch", () => ({
  applyEventPatch: async () => ({
    status: "applied",
    attempts: 1,
    row: {
      id: EVENT,
      prompt: "A baby shower",
      title: null,
      description: null,
      event_date: "2026-06-06",
      start_time: null,
      end_time: null,
      timezone: null,
      venue_name: "The Willow House",
      address: null,
      hosts: null,
      baby_name: null,
      visibility: null,
      rsvp_deadline: null,
      rsvp_deadline_edited: false,
      generation_requested_at: null,
      row_version: 2,
      prompt_facts: null,
      published_at: null,
      access_code_encrypted: null,
    },
  }),
}));
vi.mock("@/lib/generation/customization.server", () => ({
  rebreakEventCustomizations: (...args: unknown[]) => rebreak(...args),
}));

const { updateEventDetails } = await import("./event-details");

beforeEach(() => {
  rebreak.mockReset().mockResolvedValue({ updated: 1, failed: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("updateEventDetails: re-breaking the card's customizations", () => {
  it("re-breaks every customization of the event after a fact or the title is saved", async () => {
    for (const patch of [
      { venueName: "The Willow House" },
      { eventDate: "2026-06-06" },
      { title: "Juniper's Garden Party" },
    ]) {
      rebreak.mockClear();
      expect((await updateEventDetails(EVENT, patch)).ok).toBe(true);
      expect(rebreak).toHaveBeenCalledWith(client, EVENT);
    }
  });

  it("does not for the page's description, which is never on the card", async () => {
    expect((await updateEventDetails(EVENT, { description: "Bring a hat." })).ok).toBe(true);
    expect(rebreak).not.toHaveBeenCalled();
  });

  it("keeps the save when re-breaking fails, and says so in the log", async () => {
    rebreak.mockRejectedValue(new Error("fonts unavailable"));
    expect((await updateEventDetails(EVENT, { venueName: "The Willow House" })).ok).toBe(true);
    rebreak.mockResolvedValue({ updated: 0, failed: 2 });
    expect((await updateEventDetails(EVENT, { venueName: "The Willow House" })).ok).toBe(true);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
