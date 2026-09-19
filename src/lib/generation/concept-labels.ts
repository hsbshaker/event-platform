import { TYPOGRAPHY, type TypographyPairingId } from "@/lib/renderer/vocabulary";
import type { MotifId } from "@/lib/renderer/composition/tokens";

/**
 * Host-facing words for the two enum-valued fields a concept card shows.
 *
 * `spec.md §26` — "never expose implementation complexity". `oldstyle_garamond_worksans` and
 * `botanical` are the compiler's identifiers: they name a row in a curated table and a node in
 * the composition language, and a host reading a concept card is being told what their site looks
 * like, not which constant produced it.
 *
 * Deliberately **not** a second vocabulary. The typography label is derived from
 * `@/lib/renderer/vocabulary`'s own `TYPOGRAPHY` table — the pairing's real display and body
 * typefaces, which is what a host is actually looking at — so a pairing can never be labelled as
 * something it is not, and adding one to the table needs no edit here. Only the motifs need a
 * table of their own, because the composition language carries no host-facing name for them; the
 * `Record<MotifId, string>` below is exhaustive by construction, so adding a motif id is a
 * compile error rather than a raw token quietly reaching a card.
 *
 * Not `server-only`: the generation surface is a client component and this is presentation.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "The generation surface
 * shows only artifacts the pipeline produced — no model reasoning, no fabricated progress or
 * completion percentages (§7.10)". These are the artifacts, said in English; nothing is added.
 */

/**
 * The seven curated motifs, in host-facing words.
 *
 * Four are surface patterns and three are arrangements (`src/lib/ai/design-intent/contract.ts`).
 * The words stay literal — this is a description of the direction's ornament, not a sales line.
 */
const MOTIF_LABELS: Record<MotifId, string> = {
  plaid: "Plaid",
  stripe: "Stripes",
  gingham: "Gingham",
  linen: "Linen",
  equestrian: "Equestrian",
  botanical: "Botanical",
  celestial: "Celestial",
};

/** True for a motif id the label table knows. A persisted value is `unknown` until narrowed. */
function isMotifId(value: string): value is MotifId {
  return Object.prototype.hasOwnProperty.call(MOTIF_LABELS, value);
}

function isTypographyPairingId(value: string): value is TypographyPairingId {
  return Object.prototype.hasOwnProperty.call(TYPOGRAPHY, value);
}

/**
 * The visual vocabulary of a direction, as words a host reads.
 *
 * An id with no label is **dropped**, never passed through: a raw token on a concept card is the
 * defect this exists to remove, and the surface already renders every creative field only when it
 * exists (`generation-view.ts`). `undefined` when nothing survives, so the caller renders nothing
 * rather than an empty line.
 */
export function vocabularyLabel(ids: readonly string[] | undefined): string | undefined {
  if (!ids || ids.length === 0) return undefined;
  const labels = ids.filter(isMotifId).map((id) => MOTIF_LABELS[id]);
  return labels.length > 0 ? labels.join(" · ") : undefined;
}

/**
 * A typography pairing, as the two typefaces it actually is — "EB Garamond · Work Sans".
 *
 * `undefined` for a pairing this build does not know, for the same reason as above: a host must
 * not be shown `oldstyle_garamond_worksans`.
 */
export function typographyLabel(id: string | undefined): string | undefined {
  if (!id || !isTypographyPairingId(id)) return undefined;
  const pairing = TYPOGRAPHY[id];
  return `${pairing.display} · ${pairing.body}`;
}
