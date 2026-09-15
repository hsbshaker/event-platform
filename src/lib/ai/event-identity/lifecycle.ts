/**
 * Whether an Event Identity result may be consumed by anything downstream.
 *
 * `spec.md §7.6b`: a result carrying a `kind: "boundary"` question is **provisional** — the brief
 * beside it is a working interpretation, not an authoritative one — and it "must not be consumed
 * by the sibling planner (§7.7), DesignIntent, composition generation or any downstream creative
 * stage". `spec.md §7.7` gates the planner on the same condition: "Once Event Identity is valid
 * **and not provisional**".
 *
 * There is no field to read. The same section says so: "No output field marks this — the presence
 * of a boundary-kind question is the machine-readable signal." So the signal is derived, and a
 * derived safety signal has two failure modes worth naming:
 *
 * 1. **Fail-open.** A shape this code does not recognise must never read as "no boundary question
 *    present, therefore authoritative". Absence of a recognised path is not evidence of absence.
 *    Every function here refuses rather than guesses, and none of them returns `false` on a shape
 *    it could not read.
 * 2. **Divergence.** The database derives the same rule, because the authority rule has to hold at
 *    the persistence boundary where a buggy caller cannot talk its way past it
 *    (`public.identity_questions` / `public.identity_is_provisional`). Two implementations of one
 *    rule drift unless something holds them together, so `lifecycle.test.ts` and the db suite
 *    evaluate both over one fixture set — including every response in the four `v5` evidence
 *    journals, read-only.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`; `§7.6b`, `§7.7`.
 * Plan: `docs/phase-4b-plan.md §A.1`.
 */
import { EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";

import type { ClarificationQuestion, EventIdentity } from "./contract";

/**
 * The schema versions whose envelope shape this module knows how to read.
 *
 * Extend, never narrow. Narrowing would make previously readable rows unreadable — and in the
 * database, where the same list backs a stored generated column, it would additionally break every
 * restore and branch clone, because `pg_dump` does not dump generated data and the restore
 * recomputes it (`docs/phase-4b-plan.md`, T2).
 */
export const SUPPORTED_IDENTITY_SCHEMA_VERSIONS: readonly string[] = [
  EVENT_IDENTITY_SCHEMA_VERSION,
];

export type UnreadableIdentityReason = "unsupported_schema_version" | "malformed_clarification";

/**
 * A result this module refuses to classify.
 *
 * Thrown, never returned as a boolean, because the only honest boolean for an unreadable shape
 * would be `true` (treat as provisional, block everything) and that silently converts a bug into a
 * stuck event. A throw surfaces it.
 */
export class UnreadableIdentityError extends Error {
  readonly reason: UnreadableIdentityReason;

  constructor(reason: UnreadableIdentityReason, detail: string) {
    super(`event identity result is unreadable (${reason}): ${detail}`);
    this.name = "UnreadableIdentityError";
    this.reason = reason;
  }
}

/** A result carrying a boundary question, handed where an authoritative one was required. */
export class ProvisionalIdentityError extends Error {
  constructor() {
    super(
      "this Event Identity result is provisional: it carries a boundary question, and " +
        "spec.md §7.6b forbids consuming it downstream until the host has answered",
    );
    this.name = "ProvisionalIdentityError";
  }
}

/**
 * The questions array, or a refusal.
 *
 * The SQL twin of this function is `public.identity_questions(result, schema_version)`, and the two
 * refuse on exactly the same two conditions in the same order.
 */
export function identityQuestions(
  result: unknown,
  schemaVersion: string,
): readonly ClarificationQuestion[] {
  if (!SUPPORTED_IDENTITY_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new UnreadableIdentityError(
      "unsupported_schema_version",
      `no reader for ${JSON.stringify(schemaVersion)}`,
    );
  }
  const clarification = (result as { clarification?: unknown } | null | undefined)?.clarification;
  const questions = (clarification as { questions?: unknown } | null | undefined)?.questions;
  if (!Array.isArray(questions)) {
    throw new UnreadableIdentityError(
      "malformed_clarification",
      "clarification.questions is not an array",
    );
  }
  return questions as readonly ClarificationQuestion[];
}

/**
 * True when the result carries a boundary question.
 *
 * Deliberately reads only `kind`. The per-response rules — at most one boundary question, asked
 * alone — are the contract's job (`clarificationDecisionSchema`), and re-checking them here would
 * mean a response that violated them could be read as authoritative by this function while the
 * validator rejected it. One rule, one place.
 */
export function isProvisional(result: unknown, schemaVersion: string): boolean {
  return identityQuestions(result, schemaVersion).some(
    (question) => (question as { kind?: unknown } | null)?.kind === "boundary",
  );
}

declare const authoritative: unique symbol;

/**
 * A creative brief that has been shown to come from a non-provisional result.
 *
 * Two things about this type carry the whole downstream guarantee.
 *
 * **It is the brief, not the envelope.** `spec.md §7.7` passes the assignment to the DesignIntent
 * call and `provider.ts` types that call's input as `EventIdentity`; `suppliedFacts` and
 * `clarification` do not travel. Branding the envelope would have made it possible to hand the
 * host's verbatim names, date and venue to a creative call by accident, which `§7.5` and the
 * content-profile boundary both forbid.
 *
 * **Only `assertAuthoritative` can produce one.** The brand is a declared-but-never-assigned unique
 * symbol, so no object literal satisfies it and no cast is needed anywhere that receives one. A
 * downstream signature written as `(identity: AuthoritativeIdentity)` therefore cannot be called
 * with a provisional brief — that is a compile error, not a review comment.
 */
export type AuthoritativeIdentity = EventIdentity & { readonly [authoritative]: true };

/**
 * The brief, if this result may be consumed downstream.
 *
 * Throws `ProvisionalIdentityError` when a boundary question is present, and
 * `UnreadableIdentityError` when the shape cannot be read at all.
 */
export function assertAuthoritative(result: unknown, schemaVersion: string): AuthoritativeIdentity {
  if (isProvisional(result, schemaVersion)) {
    throw new ProvisionalIdentityError();
  }
  const identity = (result as { identity?: unknown } | null | undefined)?.identity;
  if (!identity || typeof identity !== "object") {
    throw new UnreadableIdentityError("malformed_clarification", "identity is not an object");
  }
  return identity as AuthoritativeIdentity;
}
