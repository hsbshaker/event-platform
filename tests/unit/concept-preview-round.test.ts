import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which concept `/events/[id]/concepts/[index]` is.
 *
 * `[index]` is a planner index, stable *within a round* — 0, 1 and 2 exist again in every round
 * the event runs. So the index alone does not name a concept, and the route has to say which
 * round it means.
 *
 * It used to say it by taking the highest round that happened to hold a row at that index. That
 * reading agrees with the intended one only while a single round exists. Once a retry after a
 * failed batch can plan round 2 — which it now can — an index round 2 did not fill would fall
 * back to round 1's concept and render a superseded direction as the current one, silently and
 * with no error anywhere. This holds the route to the batch's round instead.
 *
 * Driven as a module rather than asserted as source: the defect is in *which rows are asked for*,
 * so the query filters are the thing worth proving. Every boundary the route crosses is mocked at
 * the module edge; no database and no renderer runs here.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)".
 * `spec.md §27` — a caller who may not see an event gets the same answer as one asking for a
 * concept that does not exist.
 */

class NotFound extends Error {}

const loadLatestConceptRound = vi.fn();
const requireEventAccess = vi.fn();

/** Every filter applied to a `design_concepts` query, in the order the route applied them. */
let conceptFilters: [string, unknown][] = [];
let orderedBy: string[] = [];
/** `round:index` → the concept row that exists there. */
let conceptRows: Record<string, { id: string; active_resolved_spec_id: string | null }> = {};

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not found");
  },
}));

vi.mock("@/app/actions/generation", () => ({
  loadLatestConceptRound: (...args: unknown[]) => loadLatestConceptRound(...args),
}));

vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => requireEventAccess(...args),
}));

vi.mock("@/components/event-renderer/page", () => ({ EventPage: () => null }));

vi.mock("@/lib/generation/artwork-assets", () => ({ renderableArtworkFor: async () => [] }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        order: (column: string) => {
          orderedBy.push(`${table}.${column}`);
          return builder;
        },
        limit: () => {
          if (table === "design_concepts") {
            conceptFilters = [...filters];
            const round = filters.find(([c]) => c === "round")?.[1];
            const index = filters.find(([c]) => c === "concept_index")?.[1];
            const row = conceptRows[`${String(round)}:${String(index)}`];
            return Promise.resolve({ data: row ? [row] : [], error: null });
          }
          if (table === "resolved_design_specs") {
            return Promise.resolve({
              data: [{ id: "spec-1", spec: { tokens: {}, overrides: {} } }],
              error: null,
            });
          }
          return Promise.resolve({ data: [EVENT_ROW], error: null });
        },
      };
      return builder;
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  }),
}));

const EVENT_ROW = {
  title: "A shower",
  description: null,
  hosts: null,
  baby_name: null,
  venue_name: null,
  address: null,
  event_date: null,
  start_time: null,
  timezone: null,
  rsvp_deadline: null,
};

const EVENT = "44444444-4444-4444-4444-444444444444";

const ConceptPreviewPage = (await import("@/app/events/[id]/concepts/[index]/page")).default;

const render = (index: string) =>
  ConceptPreviewPage({ params: Promise.resolve({ id: EVENT, index }) });

beforeEach(() => {
  conceptFilters = [];
  orderedBy = [];
  conceptRows = {};
  loadLatestConceptRound.mockReset();
  requireEventAccess.mockReset();
  requireEventAccess.mockResolvedValue({ user: { id: "user-1" }, role: "owner" });
});

describe("the preview resolves an index inside the latest batch's round", () => {
  it("asks for the concept at that index in that round, and does not rank rounds itself", async () => {
    loadLatestConceptRound.mockResolvedValue(2);
    conceptRows["2:1"] = { id: "concept-r2-1", active_resolved_spec_id: "spec-1" };
    conceptRows["1:1"] = { id: "concept-r1-1", active_resolved_spec_id: "spec-old" };

    await render("1");

    expect(conceptFilters).toContainEqual(["round", 2]);
    expect(conceptFilters).toContainEqual(["concept_index", 1]);
    // "The highest round with a row at this index" is the reading that produced the defect.
    expect(orderedBy).not.toContain("design_concepts.round");
  });

  it("does not fall back to an earlier round's concept at the same index", async () => {
    // Round 2 ran and its sibling 1 failed, so there is no concept row at 2:1. Round 1 still has
    // one. Serving it would show the host a direction they have already replaced.
    loadLatestConceptRound.mockResolvedValue(2);
    conceptRows["1:1"] = { id: "concept-r1-1", active_resolved_spec_id: "spec-old" };

    await expect(render("1")).rejects.toBeInstanceOf(NotFound);
  });

  it("renders nothing for an event that has never had a batch", async () => {
    loadLatestConceptRound.mockResolvedValue(null);

    await expect(render("0")).rejects.toBeInstanceOf(NotFound);
  });

  it("authorizes before it resolves anything", async () => {
    const { ForbiddenError } = await import("@/lib/auth/errors");
    requireEventAccess.mockRejectedValue(new ForbiddenError("nope"));

    await expect(render("0")).rejects.toBeInstanceOf(NotFound);
    expect(loadLatestConceptRound).not.toHaveBeenCalled();
  });
});
