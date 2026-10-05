/**
 * The `Try another direction` box (`spec.md §7.15`; `docs/screen-spec.md` `try-another-direction`):
 * what the host may type. Pure and isomorphic, so the box and the server action share one rule.
 *
 * The limit counts characters (code points), as the database checks it
 * (`generations.feedback`, 20261009000000_phase5d_another_direction.sql); a browser's `maxLength`
 * counts UTF-16 units, which is never fewer, so a box limited by it is never refused here.
 */
export const DIRECTION_FEEDBACK_MAX = 500;

export type DirectionFeedback =
  /** No feedback (an empty or blank box): a new idea. */
  { ok: true; feedback: null } | { ok: true; feedback: string } | { ok: false; reason: "too_long" };

/** The host's words, trimmed; blank is none; more than `DIRECTION_FEEDBACK_MAX` is refused. */
export function directionFeedback(value: string | null | undefined): DirectionFeedback {
  const text = (value ?? "").trim();
  if (text === "") return { ok: true, feedback: null };
  if (Array.from(text).length > DIRECTION_FEEDBACK_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, feedback: text };
}
