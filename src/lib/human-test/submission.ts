import { z } from "zod";

/**
 * The Human Test #1 reviewer submission contract.
 *
 * Online submission replaced a manual handoff — reviewers used to click "Download my results
 * (JSON)" in `docs/human-test-1/review.html` and send the file back — so the one thing this
 * module may not do is change what a response *is*. `ReviewerResponse` below is exactly the
 * object that page has always produced and exactly what `scripts/human-test/score.mjs` already
 * reads: `{ reviewer, ok, protocol, result: { groups, ratings } }`. It is stored verbatim as
 * `human_test_1_responses.response_payload`, so the frozen scorer and the frozen key keep
 * working untouched.
 *
 * Nothing here knows which screens are which. The classification lives in
 * `proof-b/human-test-key.txt`, is read only by the frozen scorer, and is never loaded by
 * server code on the request path — validation is arithmetic about screen numbers and rating
 * values, and a rejection message can therefore never leak an answer.
 *
 * # Groups arrive normalized
 *
 * The review page already resolves the protocol's "a screen with a unique layout is its own
 * group" clause before it submits: it drops single-number lines, then appends `[n]` for every
 * screen no multi-screen group claimed. So a well-formed submission partitions 1..40 exactly —
 * every screen in exactly one group. This schema requires that partition rather than
 * re-implementing the normalization, which is the stricter of the two options the brief allowed
 * and the one that cannot drift: a second normalizer here could silently disagree with the
 * page's and change what was scored.
 */

/** The protocol's screen count (`proof-b/human-test-form.md`). Not a tunable. */
export const SCREEN_COUNT = 40;
/** The protocol's rating scale: 5 = a designer clearly composed this, 1 = a broken layout. */
export const MIN_RATING = 1;
export const MAX_RATING = 5;
/** The protocol identifier the review page stamps on every response. */
export const PROTOCOL = "proof-b/human-test-form.md";

const SCREENS = Array.from({ length: SCREEN_COUNT }, (_, i) => i + 1);

const screenNumber = z.number().int().min(1).max(SCREEN_COUNT);

/**
 * Exactly 40 keys, `"1"`..`"40"`, each an integer 1-5. Spelled out as an object rather than as a
 * record with a refinement so that a missing screen, an extra key and a 2.5 are all schema
 * failures rather than after-the-fact checks — "reject unknown fields" has to include unknown
 * rating keys, or a client could smuggle data through in a `"41"`.
 */
const ratings = z.strictObject(
  Object.fromEntries(
    SCREENS.map((n) => [String(n), z.number().int().min(MIN_RATING).max(MAX_RATING)]),
  ) as Record<string, z.ZodNumber>,
);

const groups = z
  .array(z.array(screenNumber).min(1))
  .min(1)
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    for (const group of value) {
      for (const screen of group) {
        if (seen.has(screen)) {
          ctx.addIssue({
            code: "custom",
            message: `screen ${screen} appears in more than one group`,
          });
          return;
        }
        seen.add(screen);
      }
    }
    if (seen.size !== SCREEN_COUNT) {
      const missing = SCREENS.filter((n) => !seen.has(n));
      ctx.addIssue({
        code: "custom",
        message: `groups must cover every screen exactly once; missing ${missing.join(", ")}`,
      });
    }
  });

/** The reviewer response, byte-for-byte the shape `review.html` has always produced. */
export const reviewerResponseSchema = z.strictObject({
  reviewer: z.string().trim().min(1).max(120),
  ok: z.literal(true),
  protocol: z.literal(PROTOCOL),
  result: z.strictObject({ groups, ratings }),
});

export type ReviewerResponse = z.infer<typeof reviewerResponseSchema>;

/**
 * Opaque, client-generated, one per survey session; the unique key that makes submission
 * idempotent. Constrained to a URL-safe alphabet and a length band rather than to a UUID shape,
 * so the page is free to use `crypto.randomUUID()` or a random-bytes fallback on a browser
 * that lacks it, and neither spelling becomes a protocol detail.
 */
const submissionKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,200}$/, "submission key must be 16-200 URL-safe characters");

/**
 * The request body. `strictObject` all the way down is the point: a public client cannot add a
 * field, and in particular cannot add anything resembling `testMode` — which table a submission
 * lands in is decided from a server-side secret in the request *headers*, never from the body.
 */
export const submissionRequestSchema = z.strictObject({
  submissionKey,
  response: reviewerResponseSchema,
});

export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

/**
 * The largest body worth reading. A complete submission is roughly 1 KB; 16 KB leaves room for
 * a long reviewer name and a heavily split grouping while keeping a hostile request cheap to
 * refuse. Enforced on the raw bytes, before parsing.
 */
export const MAX_SUBMISSION_BYTES = 16 * 1024;

export interface ParsedSubmission {
  readonly ok: true;
  readonly value: SubmissionRequest;
}
export interface RejectedSubmission {
  readonly ok: false;
  /** Server-log detail. Never returned to the client. */
  readonly detail: string;
}

/** Parses and strictly validates a submission body. Pure: no I/O, no key, no scoring. */
export function parseSubmission(body: unknown): ParsedSubmission | RejectedSubmission {
  const parsed = submissionRequestSchema.safeParse(body);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    detail: parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; "),
  };
}
