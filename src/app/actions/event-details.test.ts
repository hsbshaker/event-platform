import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/auth/errors";
import { VENUE_CLEARED_MESSAGE } from "@/lib/events/card-text";
import { CARD_TEXT_FIT_MESSAGE } from "@/lib/events/card-text-fit.server";

/**
 * Where the details action runs the card's exact fit check (`docs/card-system.md §2.5`): after
 * the isomorphic entry check and authorization, against the venue as the card shows it, and
 * before anything is written; a check that cannot run fails the save visibly. The check itself is
 * covered in `src/lib/events/card-text-fit.server.test.ts`; the write path in `tests/db`.
 */

const EVENT = "00000000-0000-4000-8000-000000000001";
const requireEventAccess = vi.fn();
const fitCalls = vi.fn();
let fitFails = false;
/** The stored row the venue read returns. */
let stored: { venue_name: string | null; address: string | null } | null = null;
const update = vi.fn();

vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => requireEventAccess(...args),
}));

vi.mock("@/lib/events/card-text-fit.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events/card-text-fit.server")>();
  return {
    ...actual,
    cardTextFitErrors: (...args: Parameters<typeof actual.cardTextFitErrors>) => {
      fitCalls(...args);
      if (fitFails) return Promise.reject(new Error("font file missing"));
      return actual.cardTextFitErrors(...args);
    },
  };
});

/** The event row the action reads (the venue check reads two of its columns). */
function row() {
  return {
    id: EVENT,
    prompt: "A baby shower",
    title: null,
    event_date: null,
    start_time: null,
    end_time: null,
    timezone: null,
    venue_name: stored?.venue_name ?? null,
    address: stored?.address ?? null,
    hosts: null,
    baby_name: null,
    visibility: null,
    rsvp_deadline: null,
    rsvp_deadline_edited: false,
    generation_requested_at: null,
    row_version: 1,
    published_at: null,
    access_code_encrypted: null,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row(), error: null }) }),
      }),
      update: (patch: unknown) => {
        update(patch);
        // The write itself is covered in tests/db; here it only has to be reached.
        throw new Error("write reached");
      },
    }),
  }),
}));

const { updateEventDetails } = await import("./event-details");

const CAPS_TITLE = "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!";
const WIDE_LINE = "WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWW";

beforeEach(() => {
  requireEventAccess.mockReset().mockResolvedValue({ context: { published: false } });
  fitCalls.mockReset();
  update.mockReset();
  fitFails = false;
  stored = null;
  // The action logs the stubbed write's failure and a check that cannot run.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateEventDetails: the card fit check", () => {
  it("refuses a title the card cannot fit in every design, before anything is written", async () => {
    const result = await updateEventDetails(EVENT, { title: CAPS_TITLE });
    expect(result).toEqual({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { title: CARD_TEXT_FIT_MESSAGE },
    });
    expect(requireEventAccess).toHaveBeenCalledWith(EVENT, "edit_event_content");
    expect(update).not.toHaveBeenCalled();
  });

  it("measures nothing for a caller who cannot edit the event", async () => {
    requireEventAccess.mockRejectedValue(new ForbiddenError());
    expect(await updateEventDetails(EVENT, { title: CAPS_TITLE })).toEqual({
      ok: false,
      error: "You cannot edit this event.",
    });
    expect(fitCalls).not.toHaveBeenCalled();
  });

  it("lets typical content through to the write", async () => {
    await updateEventDetails(EVENT, { title: "A Little Wild One", hosts: "Hosted by Maya & Tom" });
    expect(fitCalls).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalled();
  });

  it("checks the venue as the card shows it, against the stored venue fields", async () => {
    stored = { venue_name: "The Willow House", address: `${WIDE_LINE}, Austin TX` };
    expect(await updateEventDetails(EVENT, { venueName: "" })).toEqual({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { venueName: VENUE_CLEARED_MESSAGE },
    });
    expect(fitCalls).toHaveBeenLastCalledWith(
      expect.objectContaining({ venueName: "" }),
      expect.objectContaining({
        venueName: "The Willow House",
        address: `${WIDE_LINE}, Austin TX`,
      }),
    );
    expect(update).not.toHaveBeenCalled();

    // With a venue name stored, the address is not on the card.
    stored = { venue_name: "The Willow House", address: null };
    await updateEventDetails(EVENT, { address: `${WIDE_LINE}, Austin TX` });
    expect(update).toHaveBeenCalled();
  });

  it("fails the save visibly when the check cannot run", async () => {
    fitFails = true;
    expect(await updateEventDetails(EVENT, { title: "A Little Wild One" })).toEqual({
      ok: false,
      error: "Could not save that. Try again.",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("updateEventDetails: privacy is not a routine detail", () => {
  // Visibility changes only through the privacy action, which stores the event code with it
  // (src/app/actions/privacy.ts; AGENTS.md "the privacy action"), before and after publish.
  it.each([false, true])(
    "refuses a visibility change (published: %s) before anything is read or written",
    async (published) => {
      requireEventAccess.mockResolvedValue({ context: { published } });
      for (const visibility of ["private", "public", null]) {
        const result = await updateEventDetails(EVENT, { visibility } as never);
        expect(result).toEqual({
          ok: false,
          error: "Check the highlighted fields.",
          fieldErrors: { visibility: expect.any(String) },
        });
      }
      // Refused with other fields too: nothing in the request is saved.
      expect(
        await updateEventDetails(EVENT, {
          hosts: "Hosted by Maya & Tom",
          visibility: "private",
        } as never),
      ).toMatchObject({ ok: false, fieldErrors: { visibility: expect.any(String) } });
      expect(requireEventAccess).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("still saves other details after publish (spec.md §8.1)", async () => {
    requireEventAccess.mockResolvedValue({ context: { published: true } });
    await updateEventDetails(EVENT, { hosts: "Hosted by Maya & Tom" });
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls[0][0]).not.toHaveProperty("visibility");
  });
});
