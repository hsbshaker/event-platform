import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether an event is waiting on a clarification answer — **derived**, never stored.
 *
 * `docs/phase-4b-plan.md §A.8`. `awaiting_clarification` is not an `event_status` value and does
 * not appear in `spec.md`; it was this plan's own shorthand. Storing it would create a second
 * place the provisional answer can be written, and §A.3 exists to guarantee there is exactly one
 * and that the caller cannot lie about it. A stored status would be precisely the stale flag that
 * invariant's tamper test refuses.
 *
 * Two facts, not one, because they are independent and collapsing them is how a surface and a
 * downstream stage come to disagree. `spec.md §7.6b` puts no lifetime cap on boundary rounds, so
 * a rerun after an already-authoritative identity may itself return a boundary question: the
 * pointer still names the earlier authoritative revision while the latest revision is provisional,
 * and both facts are true at once.
 */
export interface IdentityClarificationState {
  /** The latest revision is provisional. What a surface reads to decide whether to ask. */
  awaitingClarification: boolean;
  /** The event has an authoritative identity. What the planner and every creative stage read. */
  consumableDownstream: boolean;
  latestRevisionId: string | null;
  latestRevision: number | null;
  authoritativeRevisionId: string | null;
}

export interface IdentityStateInput {
  /**
   * `is_provisional` is nullable in the contract, so it is nullable here.
   *
   * In practice it is always a boolean: it is `GENERATED ALWAYS` from the persisted envelope, and
   * `identity_questions()` raises rather than returning empty for an envelope it cannot read, so
   * an undecidable revision is refused at insert rather than stored with a null. If one ever did
   * arrive, `awaitingClarification` stays false and nothing claims the identity is usable — the
   * authoritative pointer is a separate fact, and `validate_authoritative_identity()` is the guard
   * that actually decides it.
   */
  latestRevision: { id: string; revision: number; is_provisional: boolean | null } | null;
  authoritativeRevisionId: string | null;
}

/** Pure, so the rule can be tested over constructed shapes rather than only through a database. */
export function identityClarificationState(input: IdentityStateInput): IdentityClarificationState {
  return {
    awaitingClarification: input.latestRevision?.is_provisional === true,
    consumableDownstream: input.authoritativeRevisionId !== null,
    latestRevisionId: input.latestRevision?.id ?? null,
    latestRevision: input.latestRevision?.revision ?? null,
    authoritativeRevisionId: input.authoritativeRevisionId,
  };
}

/**
 * Reads the same signal the database computes.
 *
 * `is_provisional` is a generated column derived from the persisted envelope (§A.3), so this
 * cannot disagree with the authority trigger: there is one source and it is not writable.
 */
export async function loadIdentityClarificationState(
  admin: SupabaseClient<Database>,
  eventId: string,
): Promise<IdentityClarificationState> {
  const [{ data: revisions, error: revisionError }, { data: events, error: eventError }] =
    await Promise.all([
      admin
        .from("event_identity_revisions")
        .select("id, revision, is_provisional")
        .eq("event_id", eventId)
        .order("revision", { ascending: false })
        .limit(1),
      admin.from("events").select("authoritative_identity_revision_id").eq("id", eventId).limit(1),
    ]);
  if (revisionError) throw revisionError;
  if (eventError) throw eventError;

  return identityClarificationState({
    latestRevision: (revisions ?? [])[0] ?? null,
    authoritativeRevisionId: (events ?? [])[0]?.authoritative_identity_revision_id ?? null,
  });
}
