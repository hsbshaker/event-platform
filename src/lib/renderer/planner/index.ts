/**
 * The deterministic sibling planner.
 *
 * `spec.md §7.7`: before any concept model call, the planner plans three concept **assignments**.
 * Each sibling receives a distinct compatible family where possible, then a distinct tonal
 * direction where the brief allows, then a distinct typography category and hierarchy; a distinct
 * structural directive differing at least on structure and opening; and an allotment of
 * attractive tokens, each to at most one sibling in three.
 *
 * "Never the same intent with different seeds": Phase B showed identical intents produce skeleton
 * collisions the selector cannot resolve.
 *
 * # What the planner assigns, and what it does not
 *
 * The planner emits an **assignment**, not a `DesignIntent`. `spec.md §7.7` and
 * `docs/model-contracts.md §1` are explicit: the assignment is passed to `generateDesignIntent`,
 * and the strong model returns the palette, the typography pairing, density, the composition
 * object and the motifs. Nothing here decides those.
 *
 * `proof-b/planner.js`'s `intentFor()` returns a complete DesignIntent — pairing, density, all
 * five composition values, a page system — because the proof harness had no
 * `generateDesignIntent` call and stood in for it. Porting that as production would replace a
 * strong-model call with seeded sampling. The harness's job is not the planner's contract, and
 * `spec.md` outranks `proof-b/` (`CLAUDE.md §1`), so this port stops at the assignment.
 *
 * Parity is unaffected for everything the contract keeps: the assignment fields, the directive,
 * the token allotment and the per-sibling seeds are byte-identical to the frozen run, for all 72
 * concepts. See `planner.test.ts`.
 *
 * Ported from `proof-b/planner.js` (Phase 3, item 3). No legacy-library access: the planner
 * works over DesignIntent and directive dimensions, never over silhouettes or recipe ids
 * (`docs/event-renderer-system.md §7.1`).
 */

import type { CompositionTree, Repair } from "../composition/nodes";
import { ATTRACTIVE_TOKENS } from "../composition/attractive-tokens";
import { fnv } from "../composition/walk";
import { mulberry32 } from "../seeded-random";
import {
  FAMILIES,
  FAMILY_KEYS,
  TONES,
  TYPOGRAPHY,
  TYPOGRAPHY_KEYS,
  type Family,
  type Hierarchy,
  type Tone,
  type TypographyCategory,
  type TypographyPairingId,
} from "../vocabulary";
import { sample, type Directive } from "./directives";

export type AttractiveTokenId = "staggerTitle" | "heroNumeral" | "watermark";

/** §5: at most one sibling in three may use each attractive token. */
export const CAPS_PER_BATCH: Record<AttractiveTokenId, number> = {
  staggerTitle: 1,
  heroNumeral: 1,
  watermark: 1,
};

const TOKEN_IDS = Object.keys(CAPS_PER_BATCH) as AttractiveTokenId[];

/** What one sibling's `generateDesignIntent` call is constrained to. */
export interface SiblingAssignment {
  readonly family: Family;
  readonly tonalDirection: Tone;
  readonly typographyCategory: TypographyCategory;
  readonly hierarchy: Hierarchy;
  /**
   * The pairings the model may choose from: `docs/model-contracts.md §5.2`'s runtime narrowing,
   * "filtered by category and by whether they hold at the assigned hierarchy". The planner
   * narrows; the model chooses.
   */
  readonly typographyPairings: readonly TypographyPairingId[];
}

export interface PlannedSibling {
  readonly seed: number;
  readonly assignment: SiblingAssignment;
  readonly directive: Directive;
  readonly allowedTokens: AttractiveTokenId[];
  readonly forbiddenTokens: AttractiveTokenId[];
}

export interface BatchPlan {
  readonly batchSeed: string;
  readonly siblings: PlannedSibling[];
}

/** What the siblings planned so far have already taken. Mutated across a batch, as the reference does. */
export interface AvoidList {
  families: Family[];
  tones: Tone[];
  categories: TypographyCategory[];
  hierarchies: Hierarchy[];
  structures: Directive["structure"][];
  openings: Directive["opening"][];
}

export const emptyAvoidList = (): AvoidList => ({
  families: [],
  tones: [],
  categories: [],
  hierarchies: [],
  structures: [],
  openings: [],
});

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];

/** Prefer what no sibling has taken; fall back to the whole list when the brief leaves no room. */
const not = <T>(list: readonly T[], used: readonly T[]): readonly T[] => {
  const free = list.filter((x) => !used.includes(x));
  return free.length ? free : list;
};

/**
 * One sibling's assignment.
 *
 * The draw order is the reference's and is load-bearing: family, hierarchy, category, pairing,
 * tone. The fourth draw is consumed rather than emitted — see the comment at the pick.
 */
export function assignmentFor(seed: number, avoid: AvoidList): SiblingAssignment {
  const r = mulberry32(seed);

  const family = pick(r, not(FAMILY_KEYS, avoid.families));
  const F = FAMILIES[family];
  const hierarchy = pick(r, not(F.hierarchies, avoid.hierarchies));
  const drawnCategory = pick(r, not(F.categories, avoid.categories));

  let pairings = TYPOGRAPHY_KEYS.filter(
    (k) =>
      TYPOGRAPHY[k].category === drawnCategory &&
      (hierarchy !== "monumental" || TYPOGRAPHY[k].holdsAtMonumental),
  );
  // No pairing in the drawn category holds at this hierarchy: fall back to the ones that do. This
  // is the only path on which the assigned category differs from the drawn one, and it is
  // reachable (one family/hierarchy/category combination in the vocabulary).
  if (!pairings.length) pairings = TYPOGRAPHY_KEYS.filter((k) => TYPOGRAPHY[k].holdsAtMonumental);

  // The reference picked a pairing here, standing in for `generateDesignIntent`. Production hands
  // the narrowed list to the model instead, so the pick is consumed for two reasons only: it
  // resolves the assigned category on the fallback path exactly as the reference did, and it
  // keeps the seeded sequence intact so the tone drawn next matches the frozen run. The pairing
  // itself is deliberately not emitted — exposing it would invite Phase 4 to skip the model call.
  const resolvedCategory = TYPOGRAPHY[pick(r, pairings)].category;

  return {
    family,
    tonalDirection: pick(r, not(TONES, avoid.tones)),
    typographyCategory: resolvedCategory,
    hierarchy,
    typographyPairings: pairings,
  };
}

/** A directive differing from its siblings on structure and opening, within 40 attempts. */
export function directiveFor(seed: number, avoid: AvoidList): Directive {
  let d = sample(seed);
  for (
    let i = 1;
    i < 40 && (avoid.structures.includes(d.structure) || avoid.openings.includes(d.opening));
    i++
  )
    d = sample(seed + 1000 * i);
  return d;
}

/**
 * The plan for one batch of `size` siblings. Deterministic in `(masterSeed, batchIndex)`.
 *
 * Token allotments are spread across siblings from a seeded start offset, so no sibling collects
 * every device and each token lands on at most `CAPS_PER_BATCH[id]` of the three.
 */
export function planBatch(masterSeed: number, batchIndex: number, size = 3): BatchPlan {
  const batchSeed = fnv(`${masterSeed}|batch|${batchIndex}`);
  const r = mulberry32(parseInt(batchSeed, 16));
  const avoid = emptyAvoidList();
  const siblings: PlannedSibling[] = [];

  const allot: Record<AttractiveTokenId, number[]> = {} as Record<AttractiveTokenId, number[]>;
  const start = Math.floor(r() * size);
  TOKEN_IDS.forEach((id, i) => {
    allot[id] = [...Array(CAPS_PER_BATCH[id]).keys()].map((j) => (start + i + j) % size);
  });

  for (let k = 0; k < size; k++) {
    const s = parseInt(fnv(`${batchSeed}|sib|${k}`), 16);
    const assignment = assignmentFor(s, avoid);
    let directive = directiveFor(s + 7, avoid);

    // A directive must not ask for a device this sibling was not allotted. Resample first; if 60
    // attempts cannot avoid it, rewrite the two offending dimensions.
    if (!allot.heroNumeral.includes(k)) {
      for (
        let i = 1;
        i < 60 && (directive.opening === "numeral" || directive.date === "numeral");
        i++
      )
        directive = directiveFor(s + 7 + 1000 * i, avoid);
      if (directive.opening === "numeral" || directive.date === "numeral")
        directive = {
          ...directive,
          opening: directive.opening === "numeral" ? "title" : directive.opening,
          date: directive.date === "numeral" ? "inline" : directive.date,
        };
    }

    avoid.families.push(assignment.family);
    avoid.tones.push(assignment.tonalDirection);
    avoid.categories.push(assignment.typographyCategory);
    avoid.hierarchies.push(assignment.hierarchy);
    avoid.structures.push(directive.structure);
    avoid.openings.push(directive.opening);

    siblings.push({
      seed: s,
      assignment,
      directive,
      allowedTokens: TOKEN_IDS.filter((id) => allot[id].includes(k)),
      forbiddenTokens: TOKEN_IDS.filter((id) => !allot[id].includes(k)),
    });
  }

  return { batchSeed, siblings };
}

/** The attractive tokens a tree uses that this sibling was not allotted. */
export function tokenViolations(
  tree: CompositionTree,
  forbidden: readonly string[],
): AttractiveTokenId[] {
  return ATTRACTIVE_TOKENS.filter((t) => forbidden.includes(t.id) && t.detect(tree)).map(
    (t) => t.id as AttractiveTokenId,
  );
}

/**
 * Deterministic neutralization, after the one token-cap re-prompt §5 allows. Mutates `tree` in
 * place as the reference does; the caller owns cloning. Logged as `planner` repairs.
 */
export function neutralize(tree: CompositionTree, forbidden: readonly string[]): Repair[] {
  let repairs: Repair[] = [];
  for (const t of ATTRACTIVE_TOKENS)
    if (forbidden.includes(t.id) && t.detect(tree)) repairs = repairs.concat(t.neutralize(tree));
  return repairs;
}
