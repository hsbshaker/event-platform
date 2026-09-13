import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ReviewerResponse } from "./submission";

/**
 * Where a Human Test #1 submission is written
 * (`supabase/migrations/20260913050000_human_test_1_responses.sql`).
 *
 * Two tables, not one table with a flag. `scripts/human-test/score-stored.mjs` reads
 * `human_test_1_responses` and only that, so a synthetic submission is excluded structurally —
 * there is no row for a `where` clause to miss. Which table a request lands in is decided in
 * the route from a server-side secret; nothing in the request body can reach this choice.
 */
export const REAL_TABLE = "human_test_1_responses" as const;
export const SYNTHETIC_TABLE = "human_test_1_test_responses" as const;

export type SubmissionTable = typeof REAL_TABLE | typeof SYNTHETIC_TABLE;

/** Postgres unique-violation: the submission key is already stored. */
const UNIQUE_VIOLATION = "23505";

export interface RecordedSubmission {
  readonly submissionId: string;
  /** False when this exact submission key was already stored — a retry, not a sixth reviewer. */
  readonly created: boolean;
}

/**
 * Stores one response, idempotently on `submission_key`.
 *
 * The unique index does the work rather than a read-then-write: two taps that race both issue
 * an insert, one wins, the loser sees `23505` and reads back the row the winner created. Both
 * callers get the same `submissionId`, so the browser cannot tell a retry from the original and
 * neither can the scorer — which is the whole point. A read-first check would leave the window
 * between the read and the insert open, and that window is exactly a double tap wide.
 */
export async function recordSubmission(
  table: SubmissionTable,
  submissionKey: string,
  response: ReviewerResponse,
): Promise<RecordedSubmission> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .insert({
      reviewer: response.reviewer,
      response_payload: response,
      submission_key: submissionKey,
    })
    .select("id")
    .single();

  if (!error) return { submissionId: data.id, created: true };
  if (error.code !== UNIQUE_VIOLATION) throw error;

  const existing = await admin
    .from(table)
    .select("id")
    .eq("submission_key", submissionKey)
    .single();
  if (existing.error) throw existing.error;
  return { submissionId: existing.data.id, created: false };
}
