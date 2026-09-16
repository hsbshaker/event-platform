"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { IdentityConfigurationError } from "@/lib/generation/identity-spend";
import {
  readEventIdentity,
  startEventIdentity,
  type IdentityOrchestrationResult,
} from "@/lib/generation/identity-orchestrator";
import type { IdentityView, IdentityViewQuestion } from "@/lib/generation/identity-view";

/**
 * T11's server boundary: start, read, answer, retry — and nothing else.
 *
 * Every one of these calls a T10 entry point. There is no orchestration here: no cap is consulted,
 * no claim is derived, no attempt ordinal is computed, and the provider is never constructed. That
 * is the whole design — a second place deciding whether money may be spent is a second opinion, and
 * the one that is wrong is the one that spends twice.
 *
 * Acceptance criteria: `spec.md §31 — Creation Mode`; `§7.6b`; guardrails `§32 #41`.
 */

/** Strips the model's own rationale and anything else a browser has no business holding. */
function toView(result: IdentityOrchestrationResult): IdentityView {
  const questions: IdentityViewQuestion[] | undefined = result.questions?.map((open) => ({
    kind: open.question.kind,
    index: open.index,
    question: open.question.question,
    options: open.question.options.map((o) => ({ label: o.label, isDefer: o.isDefer })),
  }));
  return {
    state: result.state,
    hasAuthoritativeIdentity: result.hasAuthoritativeIdentity,
    ...(result.revision !== undefined ? { revision: result.revision } : {}),
    ...(questions && questions.length > 0 ? { questions } : {}),
    ...(result.message !== undefined ? { message: result.message } : {}),
  };
}

/**
 * The one place a server fault becomes something a host can read.
 *
 * A configuration refusal is **not** `temporarily_unavailable`: that payload says "try again
 * shortly", which for an unset ceiling or an unverified model is false for ever and pages nobody.
 * The diagnosis stays server-side, where an operator can see it; the host gets a calm, generic
 * sentence and no invitation to keep hammering.
 */
async function guarded(run: () => Promise<IdentityOrchestrationResult>): Promise<IdentityView> {
  try {
    return toView(await run());
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) throw error;
    if (error instanceof IdentityConfigurationError) {
      console.error("event identity: refused by configuration", error);
      return { state: "service_error", hasAuthoritativeIdentity: false };
    }
    console.error("event identity: unexpected failure", error);
    return { state: "service_error", hasAuthoritativeIdentity: false };
  }
}

/**
 * Start or resume generation for this event.
 *
 * **Ordinary resume is not a retry.** Called without `explicitRetry`, this is what a reconnecting
 * browser sends: it observes a live call, completes a captured response, reclaims a claim that
 * provably never reached the provider, or reports a terminal failure — and in none of those cases
 * does it buy a second call. `explicitRetry` is a host pressing a button, and only then may a
 * terminal failure become a new paid attempt.
 */
export async function startEventIdentityForEvent(
  eventId: string,
  options: { explicitRetry?: boolean } = {},
): Promise<IdentityView> {
  return guarded(() =>
    startEventIdentity(createAdminClient(), eventId, { explicitRetry: options.explicitRetry }),
  );
}

/** The poll. Recovers, never spends. */
export async function readEventIdentityForEvent(eventId: string): Promise<IdentityView> {
  return guarded(() => readEventIdentity(createAdminClient(), eventId));
}

export interface ClarificationAnswerInput {
  eventId: string;
  /** The round the browser was showing. A stale tab answers nothing. */
  revision: number;
  questionIndex: number;
  selectedOptionLabel?: string | null;
  freeText?: string | null;
}

/**
 * Persist one clarification answer, then let the canonical path decide what happens next.
 *
 * **The write goes through the host's own session, never the service role.** A clarification answer
 * is host input and `answered_by` has to be a fact the database established, not a value the
 * application asserted: `clarification_answers_insert_member` requires `answered_by = auth.uid()`
 * and a membership check, and `validate_clarification_answer` re-checks both. Writing this with the
 * admin client would bypass the policy and reduce attribution to a claim we make about ourselves.
 *
 * Everything the row copies from the question — kind, text, options — is read here from the
 * persisted revision rather than accepted from the browser, so a tampered payload cannot describe a
 * question the host was never asked. The trigger checks the copy against the revision's own JSON
 * anyway; this means the honest path never trips it.
 */
export async function submitClarificationAnswer(
  input: ClarificationAnswerInput,
): Promise<IdentityView> {
  const user = await requireUser();
  const supabase = await createClient();

  // Read through the caller's session: a non-member sees no revision and gets the same answer as
  // for an event that does not exist.
  const { data: revisions, error: revisionError } = await supabase
    .from("event_identity_revisions")
    .select("id, revision, result")
    .eq("event_id", input.eventId)
    .order("revision", { ascending: false })
    .limit(1);
  if (revisionError) throw revisionError;
  const latest = (revisions ?? [])[0];
  if (!latest || latest.revision !== input.revision) {
    // The round moved on while this tab was open. Not an error to shout about — the canonical
    // state is the answer.
    return readEventIdentityForEvent(input.eventId);
  }

  const questions = (latest.result as { clarification?: { questions?: unknown[] } } | null)
    ?.clarification?.questions;
  const question = Array.isArray(questions) ? questions[input.questionIndex] : undefined;
  if (!question || typeof question !== "object") return readEventIdentityForEvent(input.eventId);
  const asked = question as {
    kind: "creative" | "boundary";
    question: string;
    options: { label: string; isDefer: boolean }[];
  };

  const selected = input.selectedOptionLabel ?? null;
  const chosen = selected === null ? null : asked.options.find((o) => o.label === selected);
  if (selected !== null && !chosen) return readEventIdentityForEvent(input.eventId);

  const { error } = await supabase.from("clarification_answers").insert({
    event_id: input.eventId,
    identity_revision_id: latest.id,
    question_index: input.questionIndex,
    round: latest.revision,
    kind: asked.kind,
    question_text: asked.question,
    options: asked.options,
    selected_option_label: selected,
    free_text: input.freeText ?? null,
    // The defer is the question's own property, not the browser's claim: a boundary question has
    // no defer option and the database refuses one, but the honest path must not offer it either.
    is_defer: chosen?.isDefer ?? false,
    answered_by: user.id,
  });

  if (error) {
    // 23505 — this question already has an answer. A double submission is a refresh, not a
    // destructive failure, and the one-answer-per-question invariant is what makes it safe.
    if (error.code !== "23505") {
      console.error("event identity: clarification answer refused", error.code);
      return readEventIdentityForEvent(input.eventId);
    }
  }

  // The answer is durable. A new answer is a new basis, so this is a legitimately new round —
  // and for a Route A answer it is equally legitimate and equally non-blocking.
  return startEventIdentityForEvent(input.eventId);
}

/**
 * Server-rendered first paint: the state as it stands, with no side effect beyond recovery.
 *
 * Authorized like every other entry point here — `readEventIdentity` checks membership before it
 * touches anything. It is exported, so "the page already checked" is not a boundary: anyone
 * signed in can call a server action with any event id.
 */
export async function loadEventIdentityView(eventId: string): Promise<IdentityView | null> {
  try {
    return toView(await readEventIdentity(createAdminClient(), eventId));
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    console.error("event identity: could not read initial state", error);
    return { state: "service_error", hasAuthoritativeIdentity: false };
  }
}
