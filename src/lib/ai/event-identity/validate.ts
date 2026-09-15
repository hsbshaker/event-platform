/**
 * Application-side validation of the Event Identity response.
 *
 * `docs/model-contracts.md §3`: provider structured-output modes enforce JSON Schema
 * unevenly, so the application always runs the canonical validator. Strict mode gives us
 * shape and enum membership; everything the wire schema had to drop — lengths, item
 * counts, uniqueness, the one-defer-option rule, the `needed`/`questions` agreement — is
 * enforced here and only here.
 *
 * Deterministic: this is application code and calls no model (`spec.md §9.3`). Nothing
 * here repairs a response either. Event Identity's policy is "one repair retry, then fail
 * visibly" (`docs/model-contracts.md §8`); silently patching a malformed creative brief
 * would hide exactly the evidence Phase 4A exists to collect.
 */
import { z } from "zod";
import { eventIdentityResultSchema, type EventIdentityResult } from "./contract";

export type ValidationIssue = { path: string; message: string };

export type ValidationOutcome =
  { ok: true; value: EventIdentityResult } | { ok: false; issues: ValidationIssue[] };

function issuesOf(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}

/** Validate an already-parsed JSON value against the canonical contract. */
export function validateEventIdentityResult(value: unknown): ValidationOutcome {
  const parsed = eventIdentityResultSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: issuesOf(parsed.error) };
}

/**
 * Parse raw provider text, then validate. JSON that does not parse is a validation
 * failure like any other, reported at the root so the repair retry can quote it.
 */
export function parseAndValidateEventIdentityResult(raw: string): ValidationOutcome {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: "(root)", message: `response was not valid JSON: ${String(error)}` }],
    };
  }
  return validateEventIdentityResult(value);
}

/** Compact, quotable rendering of the issues, for the single repair retry. */
export function describeIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join("\n");
}
