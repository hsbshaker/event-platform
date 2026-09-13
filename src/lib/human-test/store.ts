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

export interface RecordedSubmission {
  readonly submissionId: string;
}

/**
 * Stores one response, idempotently on `submission_key`.
 *
 * An upsert on the unique key rather than an insert, because "one session is one reviewer" and
 * "the first payload wins" are not the same rule and only the first one is wanted. A double tap
 * writes the same answers twice and collapses to one row either way. But `review.html` keeps the
 * session key in `sessionStorage`, which survives a reload — so a reviewer who submits, spots a
 * misrating, reloads the tab and answers again arrives with the same key and different answers.
 * First-write-wins would store the mistake, return the original id, and let the page say "your
 * feedback was recorded"; in a study whose whole value is five careful responses, silently
 * discarding a correction behind a success message is the worst available outcome.
 *
 * The unique index still does the concurrency work: two writers racing the same key serialize on
 * it, both land on one row, and neither can create a sixth reviewer. `created_at` and `id` are
 * not in the payload, so a correction keeps the row's identity and its first-submission time.
 */
export async function recordSubmission(
  table: SubmissionTable,
  submissionKey: string,
  response: ReviewerResponse,
): Promise<RecordedSubmission> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .upsert(
      {
        reviewer: response.reviewer,
        response_payload: response,
        submission_key: submissionKey,
      },
      // `ignoreDuplicates: false` is the client's default, but it is spelled out because the
      // whole correction path turns on it: `ignore` would emit `DO NOTHING`, `.single()` would
      // then find no row, and every resubmission would 500 while the first one still worked.
      // `src/lib/human-test/store.test.ts` pins the request this actually produces.
      { onConflict: "submission_key", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error) throw error;
  return { submissionId: data.id };
}
