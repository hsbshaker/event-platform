/**
 * One concept, from the model's raw tree to a verified `ResolvedDesignSpec`.
 *
 * This is the Phase 4D seam onto the Phase 3 compiler, and it is deliberately thin: every step
 * below is an existing production function. Nothing here re-implements validation, repair,
 * palette compilation, layout resolution or geometry verification, because a second
 * implementation for model-authored trees is exactly the fork `docs/event-renderer-system.md`
 * exists to prevent — the AI path and the fixture path must compile through the same code or the
 * regression suite stops being evidence about production.
 *
 * # The order, and the one place it departs from the written one
 *
 * `docs/model-contracts.md §6.3` lists: strict schema → structural validation and repair →
 * attractive-token caps → fit estimate, canonicalize, page system, palette, typography, layout →
 * rendered-geometry verification → selector.
 *
 * Strict schema is the *adapter's*, because a response that does not parse never becomes a tree
 * (`src/lib/ai/openai/composition.ts`). Everything from structural repair onward is here.
 *
 * **The selector runs before the browser pass rather than after it, and the outcome is
 * identical.** A signature is a pure function of the canonical tree (`signature.ts`), and
 * verification never edits the tree — it produces `overrides`, a separate map of per-node
 * demotions and relaxations, which `ResolvedDesignSpec` carries beside an unchanged
 * `composition`. So the skeleton compared after verification is byte-identical to the one
 * compared before it, and checking early only decides a doomed tree without paying for two
 * headless renders at 390 and 1280 first. Were verification ever to rewrite the tree, this
 * reordering would have to go back; the test that pins the hash across verification is what would
 * catch that.
 *
 * # Why this returns re-prompt requests instead of making them
 *
 * Two of the three re-prompts canon allows — a token-cap violation and a selector collision — are
 * discovered *here*, after the provider call has already returned. If this module called the model
 * again itself, the retry budget would live in two places and the "once each" bound would be
 * enforced by two mechanisms that have to agree. Instead this reports `state: "reprompt"` with the
 * feedback the next call needs, the orchestrator owns the single retry, and `spent` says which
 * allowances are already gone — so the *second* token-cap violation neutralizes deterministically
 * and the *second* collision falls back, exactly as `§6.3` requires, with one counter.
 *
 * Structural, coverage, capability, responsive, box, motif-kind and fit defects are never reported
 * as re-prompts at all. They are repaired deterministically and logged by kind
 * (`spec.md §32 #21`).
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, `§31 — Renderer
 * proof`. Guardrails: `spec.md §32 #14`, `#17`, `#21`, `#22`, `#23`, `#24`.
 */
import type { AttractiveTokenId } from "@/lib/renderer/planner";
import { neutralize, tokenViolations } from "@/lib/renderer/planner";
import { libraryMacros } from "@/lib/renderer/recovery";
import {
  canonicalize,
  repair,
  similarity,
  skeleton,
  validateStructure,
  type Capabilities,
  type CompositionTree,
  type Repair,
  type SigInput,
  type Violation,
} from "@/lib/renderer/composition";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import type { DesignIntent, Deviation, Presentation } from "@/lib/renderer/design-intent";
import {
  verifyGeometry,
  type ResolvedDesignSpec,
  type VerifyOptions,
} from "@/lib/renderer/verify";
import type { EventContent } from "@/components/event-renderer/contract";

/**
 * Two signatures at or above this are the same page.
 *
 * `docs/event-renderer-system.md §7` — *"threshold .70, calibrated on the library"* — and the
 * confirmation-run target is 0 sibling pairs at or above it after the selector. Compared on both
 * breakpoints, because two trees can separate on desktop and collapse onto the same mobile stack.
 */
export const COLLISION_THRESHOLD = 0.7;

/** Which of the two post-call re-prompts this sibling has already used. */
export interface RepromptsSpent {
  readonly tokenCap: boolean;
  readonly collision: boolean;
}

export const NONE_SPENT: RepromptsSpent = { tokenCap: false, collision: false };

export interface CompileConceptRequest {
  /** The model's tree, already strictly schema-valid. Never mutated. */
  readonly tree: CompositionTree;
  readonly designIntent: DesignIntent;
  readonly capabilities: Capabilities;
  /** Real values where the host has entered them, bounded provisional content elsewhere. */
  readonly content: EventContent;
  readonly seed: number;
  /** This sibling's allotment: tokens another sibling holds (`spec.md §7.7`). */
  readonly forbiddenTokens: readonly AttractiveTokenId[];
  readonly presentation?: Presentation;
  /** Deviations logged upstream, e.g. by DesignIntent narrowing. Carried, never recomputed. */
  readonly priorDeviations?: readonly Deviation[];
  /** Siblings already settled in this batch, plus the host's redesign history. */
  readonly against?: readonly SigInput[];
  /** This sibling's assignment, so the signature's category and tone terms are real. */
  readonly signatureCategory?: string;
  readonly signatureTone?: string;
  readonly spent?: RepromptsSpent;
  readonly verifyOptions?: VerifyOptions;
}

export interface CompiledConcept {
  readonly state: "verified";
  readonly spec: ResolvedDesignSpec;
  /** The tree as the model returned it, for `design_concepts.composition_raw`. */
  readonly raw: CompositionTree;
  /** After repair, caps and canonicalization, for `design_concepts.composition`. */
  readonly canonical: CompositionTree;
  readonly compositionHash: string;
  readonly repairs: readonly Repair[];
  readonly deviations: readonly Deviation[];
  /** Above the threshold against nothing, by construction; kept for telemetry. */
  readonly nearestSibling: number;
}

/** The caller may call the model once more, with this feedback, for this reason. */
export interface CompileConceptReprompt {
  readonly state: "reprompt";
  readonly kind: "token_cap" | "collision";
  /** Exactly what the next request must carry: offending tokens, or colliding skeletons. */
  readonly feedback: readonly string[];
  readonly repairs: readonly Repair[];
}

/** No further model call is allowed or would help. The caller falls back or fails the sibling. */
export interface CompileConceptFailure {
  readonly state: "failed";
  readonly kind: "structure" | "geometry" | "infrastructure";
  readonly detail: string;
  readonly repairs: readonly Repair[];
  /** Node ids geometry could not resolve, when `kind` is `geometry`. */
  readonly outstanding: readonly string[];
  readonly remaining: readonly Violation[];
}

export type CompileConceptOutcome =
  | CompiledConcept
  | CompileConceptReprompt
  | CompileConceptFailure;

/** The colliding skeletons, rendered for the re-prompt's `avoid` block. */
function describeCollision(a: SigInput, mode: "desktop" | "mobile", score: number): string {
  return `${mode} hero skeleton at ${score.toFixed(2)}: ${skeleton(a.tree, mode).hero.join(" > ")}`;
}

/**
 * Compile one model-authored tree into a verified spec, or say precisely why not.
 *
 * Async only because rendered-geometry verification drives a headless browser; every other step
 * is deterministic and synchronous.
 */
export async function compileConcept(
  request: CompileConceptRequest,
): Promise<CompileConceptOutcome> {
  const spent = request.spent ?? NONE_SPENT;
  const caps = request.capabilities;

  // 1. Structural validation and deterministic repair. Never re-prompted (`§32 #21`). The
  //    library macros are the repair vocabulary the renderer doc specifies for an unfixable
  //    coverage defect — a permitted library use under `CLAUDE.md §5.1`, and the only one here.
  const repaired = repair(request.tree, caps, request.seed, libraryMacros(request.seed));
  const repairs: Repair[] = [...repaired.repairs];

  if (repaired.remaining.length > 0) {
    // Repair ran to fixpoint and violations survive. Re-prompting is forbidden for this class,
    // so the sibling fails and the violations are reported rather than rendered.
    return {
      state: "failed",
      kind: "structure",
      detail: `${repaired.remaining.length} structural violation(s) survived deterministic repair`,
      repairs,
      outstanding: [],
      remaining: repaired.remaining,
    };
  }

  // 2. Attractive-token caps. One re-prompt, then deterministic neutralization logged as
  //    `planner` (`docs/model-contracts.md §6.3` step 3).
  let tree = repaired.tree;
  const offending = tokenViolations(tree, [...request.forbiddenTokens]);
  if (offending.length > 0) {
    if (!spent.tokenCap) {
      return {
        state: "reprompt",
        kind: "token_cap",
        feedback: offending.map((token) => `this candidate may not use ${token}`),
        repairs,
      };
    }
    repairs.push(...neutralize(tree, [...request.forbiddenTokens]));
    // `neutralize` edits in place and returns its log, so the tree is already clean here.
  }

  // 3. Canonicalize: defaults, ids, hash. Idempotent, and `assemblePreVerificationSpec` runs it
  //    again internally — we need the hash and the canonical tree now, for the selector.
  const canon = canonicalize(tree);
  tree = canon.tree;

  // 4. The selector, moved ahead of the browser pass for the reason in the header.
  const self: SigInput = {
    tree,
    ...(request.signatureCategory !== undefined
      ? { category: request.signatureCategory, tone: request.signatureTone }
      : {}),
  };
  let nearest = 0;
  const collisions: string[] = [];
  for (const other of request.against ?? []) {
    for (const mode of ["desktop", "mobile"] as const) {
      const score = similarity(self, other, mode);
      nearest = Math.max(nearest, score);
      if (score >= COLLISION_THRESHOLD) collisions.push(describeCollision(other, mode, score));
    }
  }
  if (collisions.length > 0 && !spent.collision) {
    return { state: "reprompt", kind: "collision", feedback: collisions, repairs };
  }
  // A second collision is the caller's to resolve with the library fallback (`§6.3` step 5); it
  // is not this module's to paper over, so the tree continues and the caller reads
  // `nearestSibling`.

  // 5. Assemble: page system, semantic palette, typography, motifs, layout, signature. All
  //    deterministic, all existing Phase 3 code.
  const preVerification = assemblePreVerificationSpec({
    composition: tree,
    designIntent: request.designIntent,
    capabilities: caps,
    seed: request.seed,
    repairs,
    ...(request.priorDeviations ? { deviations: request.priorDeviations } : {}),
    ...(request.presentation ? { presentation: request.presentation } : {}),
  });

  // 6. Rendered-geometry verification at 390 and 1280. Authoritative: a spec is final only with
  //    `verified.clean === true` (`spec.md §32 #24`). The static fit estimate never finalizes.
  const verified = await verifyGeometry(
    { spec: preVerification, content: request.content },
    request.verifyOptions ?? {},
  );

  if (!verified.ok) {
    return {
      state: "failed",
      kind: verified.kind === "infrastructure" ? "infrastructure" : "geometry",
      detail: verified.detail,
      repairs: [...repairs, ...verified.repairs],
      outstanding: verified.outstanding,
      remaining: [],
    };
  }

  return {
    state: "verified",
    spec: verified.spec,
    raw: request.tree,
    canonical: tree,
    compositionHash: canon.hash,
    repairs: verified.spec.compilerRepairs,
    deviations: verified.spec.intentDeviations,
    nearestSibling: nearest,
  };
}
