import { describe, expect, it } from "vitest";
import {
  applyEventPatch,
  MAX_SAVE_ATTEMPTS,
  shouldApplyServerEvent,
  type EventPatchStore,
} from "./apply-patch";
import { computeEventPatch, type PatchableRow } from "./detail-patch";

/**
 * The concurrent-autosave race (spec.md §7.3, §7.4).
 *
 * Two autosaves are independent requests. Each reads the event, computes its patch and the
 * derived RSVP deadline from that snapshot, then writes. Before this change the write was
 * unconditional, so a save that read the row before another one committed could persist a
 * deadline derived from a timezone that is no longer the event's — wrong, authoritative for
 * every later lifecycle calculation, and invisible.
 *
 * These tests drive the real retry loop against a store that behaves like the row does: it
 * carries a version, refuses a write whose version has moved, and can be made to interleave a
 * competing writer at an exact point. The SQL half of the contract (the version filter and the
 * trigger that increments it) is proven against Postgres in tests/db/phase2-concurrency.test.ts.
 */

/**
 * The stored row as this harness models it: everything `computeEventPatch` reads, plus the
 * columns it can write. `PatchableRow` alone is only the read side.
 */
type TestRow = PatchableRow & {
  title?: string | null;
  end_time?: string | null;
  hosts?: string | null;
  baby_name?: string | null;
  visibility?: "public" | "private" | null;
};

const NOW = new Date("2027-01-10T12:00:00.000Z");

const BASE: TestRow = {
  event_date: null,
  start_time: null,
  timezone: null,
  venue_name: null,
  address: null,
  rsvp_deadline: null,
  rsvp_deadline_edited: false,
};

/** A single row with a version, plus a hook to let another writer land mid-save. */
function makeStore(initial: TestRow) {
  let row: TestRow = { ...initial };
  let version = 1;
  const writes: TestRow[] = [];
  let beforeNextWrite: (() => void) | null = null;

  const commit = (patch: Record<string, unknown>) => {
    row = { ...row, ...(patch as Partial<TestRow>) };
    version += 1;
    writes.push({ ...row });
  };

  const store: EventPatchStore<TestRow> = {
    async read() {
      return { row: { ...row }, version };
    },
    async compareAndSet(patch, atVersion) {
      // Whatever this does runs between the caller's read and its write, which is exactly
      // where a competing autosave lands in production.
      if (beforeNextWrite) {
        const hook = beforeNextWrite;
        beforeNextWrite = null;
        hook();
      }
      if (atVersion !== version) return null;
      commit(patch as Record<string, unknown>);
      return { row: { ...row }, version };
    },
  };

  return {
    store,
    writes,
    current: () => ({ ...row }),
    versionNow: () => version,
    /** Simulate another save committing just before the next conditional write. */
    interleave(patch: Partial<TestRow>) {
      beforeNextWrite = () => commit(patch as Record<string, unknown>);
    },
  };
}

describe("a save that loses the race recomputes instead of overwriting", () => {
  it("never persists a deadline derived from a stale mixed snapshot", async () => {
    // The event has a date but no timezone yet. Two saves are in flight: this one carries the
    // start time, and the mount-time timezone save lands first. Computing against the snapshot
    // this save read would derive the deadline with no zone; computing against the winner's
    // state derives it in New York, which is what the event actually is.
    const harness = makeStore({ ...BASE, event_date: "2027-03-06" });
    harness.interleave({ timezone: "America/New_York" });

    const result = await applyEventPatch(harness.store, (row) =>
      computeEventPatch(row, { startTime: "13:00" }, NOW),
    );

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.attempts).toBe(2);

    const final = harness.current();
    expect(final.timezone).toBe("America/New_York");
    expect(final.start_time).toBe("13:00");

    const expected = computeEventPatch(
      { ...BASE, event_date: "2027-03-06", timezone: "America/New_York" },
      { startTime: "13:00" },
      NOW,
    ).rsvp_deadline;
    expect(final.rsvp_deadline).toBe(expected);

    // The losing attempt must not have written anything at all.
    expect(harness.writes).toHaveLength(2);
    expect(harness.writes[0].start_time).toBeNull();
  });

  it("does not derive a deadline in UTC when the zone arrives with the other save", async () => {
    // The specific corruption: 11:59 PM in New York is 04:59 UTC the next day. A deadline
    // computed with no zone lands on a different instant entirely.
    const harness = makeStore({ ...BASE });
    harness.interleave({ timezone: "America/New_York" });

    await applyEventPatch(harness.store, (row) =>
      computeEventPatch(row, { eventDate: "2027-03-06", startTime: "13:00" }, NOW),
    );

    const utcDerived = computeEventPatch(
      { ...BASE, timezone: "UTC" },
      { eventDate: "2027-03-06", startTime: "13:00" },
      NOW,
    ).rsvp_deadline;
    expect(harness.current().rsvp_deadline).not.toBe(utcDerived);
    expect(harness.current().rsvp_deadline).toBe("2027-02-21T04:59:00.000Z");
  });

  it("leaves two concurrent saves on a valid row that carries both changes", async () => {
    const harness = makeStore({ ...BASE, timezone: "America/New_York" });
    harness.interleave({ venue_name: "The Lodge at Hanson Park" });

    const result = await applyEventPatch(harness.store, (row) =>
      computeEventPatch(row, { eventDate: "2027-03-06", startTime: "13:00" }, NOW),
    );

    expect(result.status).toBe("applied");
    const final = harness.current();
    expect(final.venue_name).toBe("The Lodge at Hanson Park");
    expect(final.event_date).toBe("2027-03-06");
    expect(final.start_time).toBe("13:00");
    expect(typeof final.rsvp_deadline).toBe("string");
  });

  it("does not clear fields the losing save never mentioned", async () => {
    const harness = makeStore({
      ...BASE,
      timezone: "America/New_York",
      venue_name: "The Lodge",
      address: "Aldie, Virginia",
    });
    harness.interleave({ address: "Middleburg, Virginia" });

    await applyEventPatch(harness.store, (row) => computeEventPatch(row, { hosts: "H & S" }, NOW));

    const final = harness.current();
    expect(final.hosts).toBe("H & S");
    expect(final.address).toBe("Middleburg, Virginia");
    expect(final.venue_name).toBe("The Lodge");
  });
});

describe("the deadline rules survive contention unchanged", () => {
  it("never recomputes a deadline the host edited, however the race resolves", async () => {
    const edited = "2027-02-20T23:59:00.000Z";
    const harness = makeStore({
      ...BASE,
      event_date: "2027-03-06",
      start_time: "13:00",
      timezone: "America/New_York",
      rsvp_deadline: edited,
      rsvp_deadline_edited: true,
    });
    harness.interleave({ event_date: "2027-04-10" });

    await applyEventPatch(harness.store, (row) =>
      computeEventPatch(row, { venueName: "Somewhere else entirely" }, NOW),
    );

    expect(harness.current().rsvp_deadline).toBe(edited);
    expect(harness.current().rsvp_deadline_edited).toBe(true);
  });

  it("still derives nothing while the event has no timezone", async () => {
    const harness = makeStore({ ...BASE });
    harness.interleave({ venue_name: "The back garden" });

    await applyEventPatch(harness.store, (row) =>
      computeEventPatch(row, { eventDate: "2027-03-06" }, NOW),
    );

    expect(harness.current().event_date).toBe("2027-03-06");
    expect(harness.current().rsvp_deadline).toBeNull();
  });
});

describe("bounds and edges", () => {
  it("gives up after a bounded number of attempts rather than spinning", async () => {
    let version = 1;
    let attempts = 0;
    const store: EventPatchStore<TestRow> = {
      async read() {
        return { row: { ...BASE, timezone: "America/New_York" }, version };
      },
      async compareAndSet() {
        attempts += 1;
        version += 1; // someone else always gets there first
        return null;
      },
    };

    const result = await applyEventPatch(store, (row) =>
      computeEventPatch(row, { eventDate: "2027-03-06" }, NOW),
    );

    expect(result.status).toBe("contended");
    expect(attempts).toBe(MAX_SAVE_ATTEMPTS);
  });

  it("writes nothing when the current row already satisfies the patch", async () => {
    const harness = makeStore({ ...BASE, timezone: "America/New_York" });
    const result = await applyEventPatch(harness.store, () => ({}));
    expect(result.status).toBe("unchanged");
    expect(harness.writes).toHaveLength(0);
    expect(harness.versionNow()).toBe(1);
  });

  it("reports a vanished event rather than retrying it", async () => {
    let reads = 0;
    const store: EventPatchStore<TestRow> = {
      async read() {
        reads += 1;
        return null;
      },
      async compareAndSet() {
        throw new Error("must not write against a missing event");
      },
    };
    expect((await applyEventPatch(store, () => ({ title: "x" }))).status).toBe("missing");
    expect(reads).toBe(1);
  });
});

describe("a save response overtaken by a newer one is not applied", () => {
  it("accepts a response no older than what is already on screen", () => {
    expect(shouldApplyServerEvent(1, 2)).toBe(true);
    expect(shouldApplyServerEvent(2, 2)).toBe(true); // a no-op save at the same version
    expect(shouldApplyServerEvent(5, 9)).toBe(true);
  });

  it("drops a response that lost its race in flight", () => {
    expect(shouldApplyServerEvent(3, 2)).toBe(false);
    expect(shouldApplyServerEvent(9, 1)).toBe(false);
  });

  it("keeps the newest state when responses arrive out of order", () => {
    // The form applies a response only through this rule, so replaying the rule over an
    // out-of-order sequence is exactly what the screen would end up showing.
    const responses = [
      { version: 3, timezone: "America/New_York" },
      { version: 2, timezone: null }, // the earlier save, overtaken and arriving late
    ];
    let applied = 1;
    let shown: string | null = null;
    for (const response of responses) {
      if (!shouldApplyServerEvent(applied, response.version)) continue;
      applied = response.version;
      if (response.timezone) shown = response.timezone;
    }
    expect(shown).toBe("America/New_York");
    expect(applied).toBe(3);

    // Without the rule the late response would have moved the applied marker backwards, and a
    // manual deadline edit made afterwards would convert against the stale zone and store the
    // wrong instant as host-edited, which nothing recomputes.
    const withoutRule = responses.reduce((acc, r) => r.version, 1);
    expect(withoutRule).toBe(2);
  });
});
