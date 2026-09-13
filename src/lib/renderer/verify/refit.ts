/**
 * Content re-fit: a new revision of the same concept, with no model call.
 *
 * `docs/event-renderer-system.md §3` and §6:
 *
 * > "When a content edit changes the content profile, steps from page-system resolution through
 * > geometry verification run again on the same canonical tree and produce a new immutable
 * > revision (`contentVersion`, `supersedesSpecId`, same `compositionHash`). No validation,
 * > repair, planner, selector or model step runs. Re-fit is the only path by which a concept
 * > gains a new revision."
 *
 * The list of what does *not* run is the point, so it is worth being explicit about why each is
 * excluded rather than merely omitted:
 *
 * - **schema and structural repair** — the tree was already validated and repaired when the
 *   concept was generated. Re-running repair could change the tree, and a changed tree is a
 *   changed `compositionHash`, which would make this a different concept rather than a new
 *   revision of the same one;
 * - **the planner and the selector** — they assign and compare *concepts*. A content edit does not
 *   produce a new concept, so there is nothing to assign and nothing to collide with;
 * - **the DesignIntent and composition models** — a re-fit is deterministic by definition
 *   (`spec.md §31`: "A content edit re-fits into a new revision of the same concept without a
 *   model call").
 *
 * What does run: the compiler stages whose output depends on content, and then geometry.
 */

import { assemblePreVerificationSpec, type PreVerificationDesignSpec } from "../compile/spec";
import type { EventContent } from "@/components/event-renderer/contract";
import type { ResolvedDesignSpec, VerificationResult } from "./result";
import { verifyGeometry, type VerifyOptions } from "./verify";

export interface RefitInput {
  /** The revision being superseded. Its tree and hash carry over untouched. */
  readonly previous: ResolvedDesignSpec;
  /** The new content. The only thing that may differ. */
  readonly content: EventContent;
  /** Identifies the revision being superseded, for `supersedesSpecId`. */
  readonly previousSpecId: string;
  readonly options?: VerifyOptions;
}

/**
 * Re-fit a concept against new content.
 *
 * Deterministic and model-free. The returned revision carries the **same canonical tree** and the
 * **same `compositionHash`** as `previous`; only the resolved output and the geometry evidence
 * differ. `contentVersion` increments and `supersedesSpecId` points back.
 *
 * Returns a verification failure if the new content cannot be fitted within the bounded rounds —
 * it does not fall back to the previous revision's geometry, because that geometry describes
 * different content and would be a lie about the page a guest would see.
 */
export async function refitContent(input: RefitInput): Promise<VerificationResult> {
  const { previous, content, previousSpecId } = input;

  // Page system, palette, typography, motifs and layout are re-resolved from the *same* intent and
  // the *same* tree. `assemblePreVerificationSpec` canonicalizes, which is idempotent on an
  // already-canonical tree, so the hash is stable by construction rather than by assertion.
  const pre: PreVerificationDesignSpec = assemblePreVerificationSpec({
    composition: previous.composition,
    designIntent: previous.designIntent,
    capabilities: previous.capabilities,
    seed: previous.seed,
    // The repairs that produced this tree belong to the revision that ran them, not to this one.
    // A re-fit runs no repair, so it starts with none and collects only its own `fit-verified`
    // entries.
    repairs: [],
    deviations: previous.intentDeviations,
    presentation: previous.presentation,
    versions: previous.versions,
  });

  if (pre.compositionHash !== previous.compositionHash) {
    // Unreachable unless canonicalization stopped being idempotent. Fail loudly rather than
    // silently minting a revision of a different concept.
    throw new Error(
      `refitContent: re-resolving changed the composition hash (${previous.compositionHash} → ${pre.compositionHash}). ` +
        "A re-fit must preserve the canonical tree exactly.",
    );
  }

  const result = await verifyGeometry({ spec: pre, content, ...input.options });
  if (!result.ok) return result;

  return {
    ok: true,
    spec: {
      ...result.spec,
      contentVersion: (previous.contentVersion ?? 1) + 1,
      supersedesSpecId: previousSpecId,
    },
  };
}
