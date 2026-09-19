/**
 * The composition brief — what the Composition stage is allowed to know about the event.
 *
 * `docs/model-contracts.md §6.1` names the first field of the Composition input `eventIdentity`
 * and scopes it in the same breath: *"design brief, constraints, motif/texture direction"*. This
 * module is that scoping made typed, because the difference between the field name and its
 * comment is the whole of the gap Phase 4D was asked to close.
 *
 * # The gap, stated exactly
 *
 * `src/lib/ai/provider.ts` declared the call as
 * `{ designIntent, capabilities, directive, reprompt? }`. Nothing in that shape carries a host
 * constraint. `EventIdentity` may hold up to ten of them, each *"grounded in an explicit phrase
 * from their own words and kept verbatim or near-verbatim"*, and some have a **structural**
 * subject — no religious imagery, no gifts, keep the ceremony and the reception visibly apart.
 * The stage that authors structure could not see them.
 *
 * A constraint that never arrives cannot be honoured, and cannot be found to have been broken
 * either: the S4 category in `docs/phase-4b-plan.md §3.7` judges erosion at the stage where the
 * constraint's subject is observable, so a structural constraint that stops at DesignIntent is
 * invisible to every reviewer downstream of it. That is the failure this file prevents.
 *
 * # Why all constraints travel, rather than an "applicable" subset
 *
 * The tempting design is a classifier that forwards only the constraints whose subject Composition
 * can act on. It is the wrong trade, and the asymmetry is what decides it: **carrying an
 * inapplicable constraint costs tokens, and dropping an applicable one loses the host's law with
 * no way to detect the loss.** Deciding which of *"no religious elements"*, *"step-free access
 * across the sloped lawn"* and *"keep my mother's name off the front"* bears on a `CompositionTree`
 * requires reading natural language, and a heuristic that reads it wrong fails silently and in the
 * direction that matters.
 *
 * So every `hostConstraint` travels verbatim, and the *obligation* is scoped instead of the
 * *evidence* — the prompt tells the model to honour what bears on the structure it authors and not
 * to restate what belongs to a later stage. That is the same scoping `§3.7`'s S4 already applies
 * at DesignIntent, rather than a second mechanism invented here. The list is bounded at ten
 * entries of 180 characters by `EventIdentity` itself, so "noise" is bounded at roughly 1.8 KB
 * against a request that carries a full primitive specification and three example trees.
 *
 * # What is withheld, and why absence is the enforcement
 *
 * `creativeGuidance` is **not a field here.** It is advisory by construction — *"Later design
 * stages may reconsider, override or evolve any of these"* — and `spec.md §32 #12` and the S3
 * veto category both exist because a previous revision let model taste wear host authority. The
 * strongest available guarantee that guidance is not promoted into host law at this stage is that
 * there is nowhere to put it, which is the same technique `src/lib/ai/concept-premise/contract.ts`
 * uses to guarantee a premise cannot invent a host fact.
 *
 * Guidance is not *lost* by this: DesignIntent already read it and already resolved it into the
 * seven design fields that arrive beside this brief. Composition receives the conclusion, not the
 * advice, which is what `spec.md §32 #14` means by the model owning structure while the earlier
 * stage owned the design decision.
 *
 * Also withheld, and each for its own reason:
 *
 * - **the raw host prompt** — `docs/product-doctrine.md §4`: interpretation happens once, is
 *   persisted, and everything downstream reads the interpretation. Forwarding the prompt would
 *   let this stage re-interpret the event, which is exactly what one authoritative understanding
 *   forbids;
 * - **`copyTone`, `typographyDirection`, `paletteIntent`, `compatible*`** — spent upstream. This
 *   stage authors no copy and chooses no typeface or colour; `DesignIntent` carries the resolved
 *   answers;
 * - **`honoreeName` / `honoreeDescriptionText`, and every other event detail** — those are
 *   content, and content reaches the model through `ContentProfile` as bounded measurements
 *   (`docs/event-renderer-system.md §2.3`), never as strings to be laid out;
 * - **guest data, RSVP data, registry contents, private codes, prior ResolvedDesignSpecs** —
 *   `docs/model-contracts.md §6.1` prohibits all five outright.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #12`, `#14`, `#16`, `#17`.
 */
import type { EventIdentity } from "@/lib/ai/event-identity/contract";

/**
 * The event knowledge one Composition call receives.
 *
 * Deliberately a flat, closed record rather than `Pick<EventIdentity, …>`. A `Pick` tracks the
 * source type, so widening `EventIdentity` later would widen what this stage sees without anyone
 * editing this file or its tests — and the fields above are withheld by decision, not by accident.
 * Restating them costs one line each and makes an addition a visible change.
 */
export interface CompositionBrief {
  /** The interpretation every sibling shares. Never the host's own words. */
  readonly creativeDirection: string;
  /** Natural-language motif ideas, not renderer motif ids. The tree places motifs; this suggests. */
  readonly visualMotifs: readonly string[];
  /** Tactile/visual character. Never an image asset — `spec.md §32 #32`. */
  readonly textureDirection: string;
  /**
   * Authoritative, verbatim, and complete. Not filtered, not summarized, not re-ordered.
   *
   * Complete because the alternative is a silent drop (see the header). Verbatim because a
   * paraphrase is an interpretation, and this stage is not permitted one.
   */
  readonly hostConstraints: readonly string[];
}

/**
 * What happens to every field of the creative brief at this boundary.
 *
 * Exhaustive over `keyof EventIdentity` on purpose, the same way `BRIEF_LABELS` in
 * `design-intent-input.ts` is: **adding a field to `EventIdentity` without deciding here whether
 * Composition may see it is a compile error.** A withheld field is a decision with a reason in the
 * header, and the type system is what stops the next person forwarding one by reflex — or, worse,
 * widening this stage's view of the event without anyone noticing.
 */
export const BRIEF_DISPOSITION: Record<keyof EventIdentity, "carried" | "withheld"> = {
  // Carried: `docs/model-contracts.md §6.1` — "design brief, constraints, motif/texture direction".
  creativeDirection: "carried",
  visualMotifs: "carried",
  textureDirection: "carried",
  hostConstraints: "carried",

  // Withheld: advisory taste. Absence is what guarantees it cannot become host law here (S3).
  creativeGuidance: "withheld",

  // Withheld: spent upstream. DesignIntent carries the resolved answers this stage must honour.
  paletteIntent: "withheld",
  tonalIntent: "withheld",
  toneKeywords: "withheld",
  typographyDirection: "withheld",
  compatibleFamilies: "withheld",
  compatibleTonalDirections: "withheld",
  compatibleTypographyCategories: "withheld",
  colorsExplicitlyConstrained: "withheld",
  toneExplicitlyConstrained: "withheld",

  // Withheld: this stage authors no copy. A tree is enums; free text is a schema failure (§7).
  copyTone: "withheld",

  // Withheld: evidence for an interpretation already made. Re-reading it would re-interpret.
  inspirationSummary: "withheld",
};

/** The carried keys, derived from the disposition rather than repeated beside it. */
export const CARRIED_TO_COMPOSITION = Object.keys(BRIEF_DISPOSITION).filter(
  (key) => BRIEF_DISPOSITION[key as keyof EventIdentity] === "carried",
) as readonly (keyof EventIdentity)[];

/** The withheld keys, likewise. A test asserts the two partition the contract exactly. */
export const WITHHELD_FROM_COMPOSITION = Object.keys(BRIEF_DISPOSITION).filter(
  (key) => BRIEF_DISPOSITION[key as keyof EventIdentity] === "withheld",
) as readonly (keyof EventIdentity)[];

/**
 * Narrow an authoritative identity to what Composition may see.
 *
 * Takes `EventIdentity` rather than `AuthoritativeIdentity` so the projection stays a pure
 * function of a shape; the *caller* is where the authoritative-identity requirement is enforced,
 * as it is for every other downstream stage. A provisional identity must never reach generation
 * (`spec.md §7.6b`), and the orchestrator holds that gate.
 */
export function compositionBrief(identity: EventIdentity): CompositionBrief {
  return {
    creativeDirection: identity.creativeDirection,
    visualMotifs: [...identity.visualMotifs],
    textureDirection: identity.textureDirection,
    hostConstraints: [...identity.hostConstraints],
  };
}
