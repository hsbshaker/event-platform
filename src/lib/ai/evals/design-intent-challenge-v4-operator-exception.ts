/**
 * The one piece of v4 identity wording that no author wrote.
 *
 * Every other string in both Stage-2 halves is the work of the half's author — the human for
 * `DIC4-P*`, Mistral for `DIC4-Q*` — including all fifteen of the other leakage replacements. This
 * module exists so that the single exception is a fact in the code rather than a sentence in a
 * commit message, because the authorship claim is the one thing this corpus is *for*, and a
 * programme that records provenance only in prose is a programme that will eventually lose it.
 *
 * **Why it exists at all.** The frozen scan gated v4 on sixteen single-word `toneKeywords`, all
 * substring false positives. The two authors supplied replacements; fifteen cleared. The
 * sixteenth, Mistral's `restrained` for `DIC4-Q01`, collided again — and not as a substring
 * accident this time: `restrained` is a literal enum token in the DesignIntent wire schema
 * (`composition.hierarchy`, `composition.ornament`) and appears three times in the EventIdentity
 * prompt. A second round to the same author could have collided a third time on a value nobody
 * could predict, so the operator terminated the loop by supplying the phrase directly.
 *
 * **What that costs, stated plainly rather than argued away.** `DIC4-Q01`'s tone vocabulary is no
 * longer wholly Mistral's. Any claim about the corpus that depends on every word being externally
 * authored has exactly one exception, and it is this one. The scope is narrow — one array element,
 * in one case, in one half — and it is a tone *keyword*, not a premise, a constraint or a creative
 * direction. It is recorded here so a later reader finds it without being told where to look.
 *
 * Canon: `provenance/…-v4/leakage/17-OPERATOR-AUTHORED-EXCEPTION.md`. Acceptance criteria:
 * N/A — evidence machinery, no product behaviour change.
 */

export interface OperatorAuthoredValue {
  readonly caseId: string;
  readonly field: "toneKeywords";
  readonly index: number;
  /** What the author had supplied, and which the frozen scan rejected. */
  readonly replacedAuthorValue: string;
  /** The operator's phrase. Not authored by the human, by Mistral, or by the lead. */
  readonly value: string;
  readonly authoredBy: "operator";
  readonly reason: string;
}

/**
 * Exhaustive. If this array ever has a second entry, the corpus's authorship claim has changed
 * materially and that is a decision to argue about, not a line to add quietly.
 */
export const V4_OPERATOR_AUTHORED_VALUES = [
  {
    caseId: "DIC4-Q01",
    field: "toneKeywords",
    index: 1,
    replacedAuthorValue: "restrained",
    value: "quietly understated",
    authoredBy: "operator",
    reason:
      "terminates the residual leakage-collision loop; `restrained` is a literal DesignIntent " +
      "composition enum token and collided on re-scan",
  },
] as const satisfies readonly OperatorAuthoredValue[];

/** Everything else in both halves retains its recorded authorship. */
export const V4_OPERATOR_AUTHORED_VALUE_COUNT = 1;
