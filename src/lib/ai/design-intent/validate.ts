/**
 * Application-side validation of the DesignIntent response.
 *
 * `docs/model-contracts.md §3`: provider structured-output modes enforce JSON Schema unevenly, so
 * the application always runs the canonical validator. Strict mode gives shape and enum
 * membership; the hex pattern, the 3–5 palette count, uniqueness, the presentation bounds and
 * every cross-field rule are enforced here and only here.
 *
 * Deterministic: application code, no model call (`spec.md §9.3`). Nothing here repairs a
 * response either — it classifies (`./policy.ts`) and reports. `docs/phase-4b-plan.md §E` draws
 * the line this module stops at: **this decides whether an object is structurally and
 * semantically legal, not whether it is any good.** No subjective creative-quality heuristic
 * belongs here, and the diversity questions ("are these three genuinely different creative
 * worlds") are explicitly not deterministic — §E says so, and says no metric should pretend
 * otherwise.
 *
 * # The invariants
 *
 * From the narrowed schema (`./narrowing.ts`, `./contract.ts`):
 *  1. exactly the eight keys; no unknown key, at any depth;
 *  2. every enum value in the vocabulary, and `family` / `tonalDirection` / `typographyPairing`
 *     within the sibling's narrowing;
 *  3. `composition.hierarchy` within the family's hierarchies;
 *  4. 3–5 palette colors, each matching `^#[0-9A-F]{6}$`;
 *  5. at most three motifs, each a curated id.
 *
 * Added here, because a provider schema cannot express them honestly:
 *  6. `palette.colors` has no duplicate;
 *  7. `palette.dominant` is a member of `palette.colors` (`§5.1`, `spec.md §7.8`);
 *  8. `family` equals the assignment's;
 *  9. `tonalDirection` equals the assignment's;
 * 10. `typographyPairing` belongs to the **assigned** typography category (`§5.1`, `§E`);
 * 11. `typographyPairing` holds at the **assigned** hierarchy (`docs/event-renderer-system.md §8`);
 * 12. `typographyPairing` holds at the **returned** `composition.hierarchy` too — the model may
 *     pick a hierarchy within its family that the planner did not assign, and a monumental
 *     composition set against a pairing that does not hold there is the incompatibility
 *     `spec.md §31` has the compiler repair deterministically;
 * 13. `motifs` has no duplicate.
 *
 * 8–11 are unreachable through `validateDesignIntentResponse`, because narrowing already made
 * them impossible. They are checked anyway: the validator is the authority (`§3`), and an
 * assignment check that only runs when someone remembers to narrow is not one.
 *
 * `presentation` is parsed separately and its failures are never fatal — `spec.md §7.8` requires a
 * deterministic fallback for a missing, invalid or duplicate concept name, which a fatal parse
 * would pre-empt. Deriving that fallback is the compiler's; this module reports what was wrong.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`
 * ("Strong model returns `family`, `tonalDirection`, `palette`, `typographyPairing`, `density`,
 * `composition`, `motifs`, plus a `presentation` object … that the compiler never reads";
 * "Duplicate or invalid concept names fall back deterministically"). Plan: `§E`, T18.
 */
import { z } from "zod";

import type { SiblingAssignment } from "@/lib/renderer/planner";
import { TYPOGRAPHY } from "@/lib/renderer/vocabulary";

import {
  designIntentEnvelopeSchemaFor,
  presentationSchema,
  type DesignSemantics,
  type SemanticsNarrowing,
} from "./contract";
import { allowedHierarchies, narrowingFor, pairingHoldsAt } from "./narrowing";
import { DISPOSITION, type IssueClass, type IssueDisposition } from "./policy";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly class: IssueClass;
  readonly disposition: IssueDisposition;
}

export type Presentation = z.infer<typeof presentationSchema>;

export type PresentationOutcome =
  | { readonly ok: true; readonly value: Presentation }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export type ValidationOutcome =
  | {
      readonly ok: true;
      /** The seven design fields — and nothing else reaches the compiler (`spec.md §32 #21`). */
      readonly designIntent: DesignSemantics;
      /** Host-facing metadata, or the reasons a deterministic fallback is owed. */
      readonly presentation: PresentationOutcome;
    }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function issue(path: string, message: string, cls: IssueClass): ValidationIssue {
  return { path, message, class: cls, disposition: DISPOSITION[cls] };
}

function issuesOf(error: z.ZodError, cls: IssueClass = "schema"): ValidationIssue[] {
  return error.issues.map((i) =>
    issue(i.path.length > 0 ? i.path.join(".") : "(root)", i.message, cls),
  );
}

/** Invariants 6–13. Separated so they can be run over an already-parsed value. */
export function semanticIssues(
  value: DesignSemantics,
  assignment: SiblingAssignment,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  const { colors, dominant } = value.palette;
  if (new Set(colors).size !== colors.length) {
    out.push(issue("palette.colors", "palette colors must be distinct", "schema"));
  }
  if (!colors.includes(dominant)) {
    out.push(
      issue(
        "palette.dominant",
        `dominant ${dominant} is not one of the palette colors (${colors.join(", ")})`,
        "compatibility",
      ),
    );
  }

  if (value.family !== assignment.family) {
    out.push(
      issue(
        "family",
        `family "${value.family}" is not the assigned "${assignment.family}"`,
        "assignment",
      ),
    );
  }
  if (value.tonalDirection !== assignment.tonalDirection) {
    out.push(
      issue(
        "tonalDirection",
        `tonalDirection "${value.tonalDirection}" is not the assigned ` +
          `"${assignment.tonalDirection}"`,
        "assignment",
      ),
    );
  }

  const pairing = TYPOGRAPHY[value.typographyPairing];
  if (pairing.category !== assignment.typographyCategory) {
    out.push(
      issue(
        "typographyPairing",
        `pairing "${value.typographyPairing}" is in category "${pairing.category}", not the ` +
          `assigned "${assignment.typographyCategory}"`,
        "assignment",
      ),
    );
  }
  if (!pairingHoldsAt(value.typographyPairing, assignment.hierarchy)) {
    out.push(
      issue(
        "typographyPairing",
        `pairing "${value.typographyPairing}" does not hold at the assigned hierarchy ` +
          `"${assignment.hierarchy}"`,
        "assignment",
      ),
    );
  }

  const hierarchies = allowedHierarchies(assignment);
  if (!hierarchies.includes(value.composition.hierarchy)) {
    out.push(
      issue(
        "composition.hierarchy",
        `hierarchy "${value.composition.hierarchy}" is not admitted by family ` +
          `"${assignment.family}" (${hierarchies.join(", ")})`,
        "schema",
      ),
    );
  } else if (!pairingHoldsAt(value.typographyPairing, value.composition.hierarchy)) {
    out.push(
      issue(
        "typographyPairing",
        `pairing "${value.typographyPairing}" does not hold at the returned hierarchy ` +
          `"${value.composition.hierarchy}"`,
        "compatibility",
      ),
    );
  }

  if (new Set(value.motifs).size !== value.motifs.length) {
    out.push(issue("motifs", "motif ids must be distinct", "schema"));
  }

  return out;
}

/** `presentation` on its own, never fatal to the design semantics beside it. */
export function validatePresentation(value: unknown): PresentationOutcome {
  const parsed = presentationSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: issuesOf(parsed.error) };
}

/**
 * Validate an already-parsed response against the sibling's narrowed contract.
 *
 * `narrowing` defaults to the assignment's own, which is what a production call sends. It is a
 * parameter so a test can validate an *unnarrowed* response and prove the semantic invariants
 * catch what narrowing would otherwise have prevented from arriving.
 */
export function validateDesignIntentResponse(
  value: unknown,
  assignment: SiblingAssignment,
  narrowing: SemanticsNarrowing = narrowingFor(assignment),
): ValidationOutcome {
  const parsed = designIntentEnvelopeSchemaFor(narrowing).safeParse(value);
  if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };

  const { presentation, ...semantics } = parsed.data;
  const issues = semanticIssues(semantics as DesignSemantics, assignment);
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    designIntent: semantics as DesignSemantics,
    presentation: validatePresentation(presentation),
  };
}

/**
 * Parse raw provider text, then validate. JSON that does not parse is a validation failure like
 * any other, reported at the root so the single repair retry can quote it.
 */
export function parseAndValidateDesignIntentResponse(
  raw: string,
  assignment: SiblingAssignment,
  narrowing?: SemanticsNarrowing,
): ValidationOutcome {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      issues: [issue("(root)", `response was not valid JSON: ${String(error)}`, "schema")],
    };
  }
  return validateDesignIntentResponse(value, assignment, narrowing);
}

/** Compact, quotable rendering of the issues, for the single repair retry. */
export function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join("\n");
}
