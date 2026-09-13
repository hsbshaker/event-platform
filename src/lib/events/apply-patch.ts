import type { EventUpdate } from "./detail-patch";

/**
 * Compare-and-set around an event detail save (spec.md §7.3, §7.4).
 *
 * The patch and the derived RSVP deadline are computed from a snapshot of the row, so the
 * write is only correct if that snapshot is still current. Two autosaves are independent
 * requests: a date save that read the row before the mount-time timezone save committed would
 * otherwise persist a deadline derived from a timezone that is no longer the event's, and
 * nothing afterwards is obliged to recompute it.
 *
 * So the write is conditional on the version the snapshot was read at. Losing the race is not
 * an error: it means someone else's newer state is authoritative, and the right response is to
 * read that state and compute again against it, never to overwrite it. Retries are bounded —
 * a save that keeps losing is reported rather than spun on.
 */

/**
 * Whether a save response should be applied to what the browser is showing.
 *
 * Saves are independent requests, so their responses can arrive out of order: an earlier save
 * finishing after a later one would otherwise roll the displayed timezone and deadline back to
 * a snapshot that has already lost. That is not cosmetic. A manual RSVP deadline edit converts
 * the host's wall-clock choice using the displayed timezone and stores the result as
 * host-edited, which nothing ever recomputes (spec.md §7.3), so one stale response can bake in
 * a deadline for the wrong instant permanently.
 *
 * Versions are monotonic, so "not older than what is already applied" is the whole rule. It
 * cannot be solved by re-reading before responding: the overtaking save can commit after the
 * response is on the wire.
 */
export function shouldApplyServerEvent(appliedVersion: number, incomingVersion: number): boolean {
  return incomingVersion >= appliedVersion;
}

/** Attempts in total, including the first. Small: contention here is two autosaves, not a herd. */
export const MAX_SAVE_ATTEMPTS = 4;

export interface VersionedRow<TRow> {
  row: TRow;
  version: number;
}

export interface EventPatchStore<TRow> {
  /** The current row and its version, or null when the event is gone. */
  read(): Promise<VersionedRow<TRow> | null>;
  /**
   * Applies `patch` only while the row is still at `version`. Returns the stored row on
   * success, or null when another writer got there first. Must not partially apply.
   */
  compareAndSet(patch: EventUpdate, version: number): Promise<VersionedRow<TRow> | null>;
}

export type ApplyPatchResult<TRow> =
  | { status: "applied"; row: TRow; attempts: number }
  | { status: "unchanged"; row: TRow; attempts: number }
  | { status: "missing" }
  | { status: "contended"; attempts: number };

/**
 * Reads, computes and writes until the write lands on the state it was computed from.
 *
 * `computePatch` is called afresh on every attempt, against the row just read, so a retry
 * derives from the winner's state rather than replaying the losing snapshot. An empty patch
 * writes nothing: the save had nothing to change once the current row was taken into account.
 */
export async function applyEventPatch<TRow>(
  store: EventPatchStore<TRow>,
  computePatch: (row: TRow) => EventUpdate,
  maxAttempts: number = MAX_SAVE_ATTEMPTS,
): Promise<ApplyPatchResult<TRow>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await store.read();
    if (!current) return { status: "missing" };

    const patch = computePatch(current.row);
    if (Object.keys(patch).length === 0) {
      return { status: "unchanged", row: current.row, attempts: attempt };
    }

    const written = await store.compareAndSet(patch, current.version);
    if (written) return { status: "applied", row: written.row, attempts: attempt };
  }
  return { status: "contended", attempts: maxAttempts };
}
