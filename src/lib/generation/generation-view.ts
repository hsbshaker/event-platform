/**
 * What a browser is allowed to know about concept generation.
 *
 * The sibling of `identity-view.ts`, and built on the same rule: the projection happens on the
 * server, so a field nobody renders cannot ship in the payload and sit in the DOM. Here the rule
 * has a second job, because `spec.md §31 — Prompt, auth, and generation` states it as an
 * acceptance criterion:
 *
 * > The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * > fabricated progress or completion percentages (§7.10).
 *
 * So this type is deliberately shaped to make the wrong thing hard to say:
 *
 * - **Every creative field is optional, and present only when its row exists.** There is no
 *   placeholder, no "pending" string and no default. A concept has no `name` until the DesignIntent
 *   artifact carrying its presentation is persisted, because until then the name does not exist —
 *   not in this type, not in the database, and not anywhere a truthful surface could read it.
 * - **There is no percentage, no ratio, no step counter and no estimate.** Not discouraged: absent.
 *   A number cannot be invented in a component that has nowhere to put one, and
 *   `generation-view.test.ts` holds the shape to it.
 * - **Nothing carries rationale.** `presentation` is the host-facing name and blurb the pipeline
 *   already writes for a concept card; the premise's organizing idea, its grounding and its design
 *   consequences are the model's working-out and stay server-side. `docs/product-doctrine.md §8a`:
 *   "What is shown is the *output* of a stage, not how the model got there."
 * - **No versions, models, providers, spend, claim ids, attempt ordinals or batch counters**
 *   (`spec.md §32 #41`).
 *
 * # Readiness is two facts, not one
 *
 * `spec.md §7.10 #5` makes a concept renderable "as soon as its resolved spec exists" — and the
 * spec is verified and frozen *before* any image is requested. So a concept that will receive
 * artwork is already a complete, previewable page while that artwork is still being drawn, and a
 * surface that waited for the image would be hiding a finished site.
 *
 * `previewable` and `settled` are therefore separate. `previewable` means there is a verified spec
 * to render. `settled` means nothing further is coming — every artwork slot has delivered or
 * failed, or there were none. A concept is shown the moment it is previewable and quietly gains its
 * artwork afterwards.
 *
 * Deliberately **not** `server-only`: a client component imports these types.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)" and
 * "The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * fabricated progress or completion percentages (§7.10)". Guardrails: `spec.md §32 #41`, `#45`.
 */

/**
 * Where the batch as a whole stands.
 *
 * Semantic states, never a fraction. Each one is a statement about rows that exist:
 *
 * - `not_started` — the identity is authoritative and no batch has been planned.
 * - `exploring` — a batch is in flight and no concept has produced an artifact yet. This is the
 *   one premise call, which authors all three propositions as a set (`spec.md §7.7a`), so there is
 *   genuinely nothing per-concept to show during it.
 * - `designing` — at least one concept has artifacts and at least one sibling is still in flight.
 * - `ready` — every sibling settled and every one of them succeeded.
 * - `partial` — every sibling settled, at least one succeeded and at least one did not.
 * - `failed` — the batch settled with nothing to show.
 * - `unavailable` — the read itself failed. Not a pipeline state; see `GENERATION_UNAVAILABLE`.
 */
export type GenerationStage =
  "not_started" | "exploring" | "designing" | "ready" | "partial" | "failed" | "unavailable";

/**
 * Where one concept stands, independently of its siblings.
 *
 * The progression mirrors the rows the pipeline writes, in the order it writes them, so every
 * transition is observable rather than asserted:
 *
 * - `planned` — a sibling row exists; the planner assigned it a direction.
 * - `designing` — its DesignIntent artifact is persisted, so it has a name and a creative world.
 * - `composing` — its concept row is persisted; the tree is being compiled and verified.
 * - `ready` — a verified `ResolvedDesignSpec` exists. Renderable, whatever the others are doing.
 * - `failed` — this sibling settled without one. Says nothing about the other two.
 */
export type ConceptStage = "planned" | "designing" | "composing" | "ready" | "failed";

/** What is known about one concept's optional artwork. Counts of rows, never a progress bar. */
export interface ConceptArtworkView {
  /** Reserved slots still waiting on a provider answer. */
  pending: number;
  /** Slots whose asset was generated, validated and attached. */
  delivered: number;
  /**
   * Slots that will not deliver. Not an error to show the host: `spec.md §7.6a #1` makes imagery
   * optional, so the page is finished either way and this is telemetry for the surface, not a
   * message to render as a failure.
   */
  failed: number;
}

export interface ConceptView {
  /** 0, 1 or 2 — the sibling's planner index, and its stable identity within the round. */
  index: number;
  stage: ConceptStage;
  /**
   * A verified `ResolvedDesignSpec` exists for this concept and it can be rendered now.
   *
   * True from `ready` onward and never withdrawn: generated design data is immutable
   * (`spec.md §32 #20`), so a concept that became previewable stays previewable.
   */
  previewable: boolean;
  /** Nothing further is coming for this concept — artwork has all delivered or failed, or none. */
  settled: boolean;
  /** `presentation.name` — the host-facing concept name, once its artifact is persisted. */
  name?: string;
  /** `presentation.description` — the host-facing blurb beside the name. */
  description?: string;
  /** Palette territory: the compiled semantic palette, once the spec exists. Hex, from the spec. */
  palette?: readonly string[];
  /** Visual vocabulary: the direction's own motif requests, once the DesignIntent exists. */
  vocabulary?: readonly string[];
  /** Art direction: the typography pairing this direction asked for. */
  typography?: string;
  /** Present only once at least one artwork slot has been reserved for this concept. */
  artwork?: ConceptArtworkView;
}

export interface GenerationView {
  stage: GenerationStage;
  /**
   * The interpreted vibe — `EventIdentity`'s own ranked tone keywords.
   *
   * The one artifact that is not per-concept, and `docs/product-doctrine.md §8a`'s literal example
   * of what this surface may show: *heritage · heirloom · polished · understated · restrained
   * whimsy*. It is the identity's output, not its reasoning, and it exists the moment the identity
   * is authoritative — which is before any concept does.
   */
  vibe?: readonly string[];
  /**
   * One entry per planned sibling, ordered by index. Empty before a batch is planned.
   *
   * Every concept carries its own stage and its own readiness. Nothing in this type can express
   * "the batch is N% done", and nothing in it makes one concept's availability depend on another's.
   */
  concepts: readonly ConceptView[];
  /**
   * Whether a fresh batch may be started right now.
   *
   * False while one is in flight. The surface uses it to decide whether to offer the action at all,
   * rather than discovering the refusal by making the call.
   */
  canStart: boolean;
  /** The frozen, reason-free sentence. `unavailable` only. */
  message?: string;
}

/**
 * The one payload a failed read produces.
 *
 * `concepts: []` here means *unknown*, not *none*. The surface treats it the way the identity panel
 * treats its own service error: it keeps showing what it already had rather than replacing a page
 * of real concepts with an empty one because a single poll failed.
 */
export const GENERATION_UNAVAILABLE: GenerationView = {
  stage: "unavailable",
  concepts: [],
  canStart: false,
};

/** Concepts a surface may render now, in planner order. */
export function previewableConcepts(view: GenerationView): readonly ConceptView[] {
  return view.concepts.filter((concept) => concept.previewable);
}

/**
 * Is the batch still doing work?
 *
 * Read from the stage rather than from a timer, so a surface polls while the pipeline is running
 * and stops when it is not — including when it stopped by failing.
 */
export function generationInFlight(view: GenerationView): boolean {
  return view.stage === "exploring" || view.stage === "designing";
}
