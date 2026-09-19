import "server-only";

/**
 * The batch-scoped register of sibling compositions, and the reason the selector was inert.
 *
 * The Phase 4D live smoke recorded `nearest_sibling` as null on all three composition rows.
 * `runConceptBatch` fanned the three siblings out with `Promise.all` and passed neither `against`
 * to `compileConcept` nor `collides` to the provider, so every sibling composed blind. The
 * collision machinery on both sides was complete and unit-tested; nothing ever handed it a rival
 * to compare against. A guard that is never fed does not fail loudly — it reports "no collision"
 * forever, which is exactly how a batch of three near-identical pages could have passed.
 *
 * # What this is, and what it is not
 *
 * It is a **coordination point, not a queue for model calls.** All three `generateComposition`
 * calls still start together and run in parallel; `spec.md §7.7` gives each sibling its own
 * assignment and directive precisely so they can. What is ordered is only the cheap, deterministic
 * *admission decision* that happens after a response has already arrived: sibling `k` waits for
 * siblings `0..k-1` to resolve, compares against whichever of them were admitted, and then admits
 * itself. Index order is used because it is the one total order every participant already agrees
 * on without communicating, which is what makes the outcome deterministic rather than a race.
 *
 * # Where the comparison happens, and why there
 *
 * At `docs/model-contracts.md §6.3` step 5 — inside the composition call, on the served tree,
 * where the single permitted collision re-prompt and the terminal library fallback already live.
 * Feeding the check there means the *existing* remediation path becomes reachable without adding a
 * second re-prompt owner: the adapter still spends at most one collision correction and still
 * falls back to the library on a second collision, exactly as canon says.
 *
 * `compileConcept` runs its own post-repair check afterwards, with the collision allowance marked
 * spent. That one never re-prompts; it exists to record `nearestSibling`, so a residual collision
 * introduced by deterministic repair is **visible in telemetry** even though canon does not
 * authorize paying to fix it.
 *
 * # One deliberate imprecision, stated rather than hidden
 *
 * A sibling is admitted when it clears the selector, not when its concept finally verifies. So a
 * sibling that passes the selector and then fails geometry stays in the register for the rest of
 * the batch. That is conservative in the safe direction: the register can make a later sibling
 * *more* likely to be asked to differentiate, never less. Waiting for final verification instead
 * would serialize the browser passes and delay concept-level readiness for no correctness gain.
 *
 * # Scope
 *
 * One register per batch, created by `runConceptBatch` and discarded with it. Nothing is shared
 * between batches, between events or across a module boundary: cross-batch comparison would make
 * one host's concepts depend on another's, and a module-level cache would do exactly that by
 * accident.
 */
import {
  similarity,
  skeleton,
  type CompositionTree,
  type SigInput,
} from "@/lib/renderer/composition";

/** Two signatures at or above this are the same page (`docs/event-renderer-system.md §7`). */
export const COLLISION_THRESHOLD = 0.7;

/** What a sibling contributes once it clears the selector. */
interface Admitted {
  readonly index: number;
  readonly tree: CompositionTree;
  readonly category?: string;
  readonly tone?: string;
}

export interface SiblingCandidate {
  readonly index: number;
  readonly tree: CompositionTree;
  readonly category?: string;
  readonly tone?: string;
}

export interface CollisionVerdict {
  /** Descriptions of the colliding skeletons, for the re-prompt's `avoid` block. Empty if clear. */
  readonly colliding: readonly string[];
  /** Highest similarity seen against any rival, for telemetry. 0 when there were no rivals. */
  readonly nearest: number;
}

/** One slot per planned sibling, resolved exactly once. */
interface Slot {
  readonly settled: Promise<Admitted | null>;
  resolve: (value: Admitted | null) => void;
  done: boolean;
}

function describe(rival: Admitted, mode: "desktop" | "mobile", score: number): string {
  return `${mode} hero skeleton at ${score.toFixed(2)}: ${skeleton(rival.tree, mode).hero.join(" > ")}`;
}

export class SiblingSignatures {
  private readonly slots = new Map<number, Slot>();

  constructor(indexes: readonly number[]) {
    for (const index of indexes) {
      let resolve!: (value: Admitted | null) => void;
      const settled = new Promise<Admitted | null>((r) => {
        resolve = r;
      });
      this.slots.set(index, { settled, resolve, done: false });
    }
  }

  /**
   * Resolve a sibling's slot as producing nothing.
   *
   * Called for every terminal outcome that is not an admission — a provider failure, a compile or
   * geometry failure, a library fallback, an unexpected throw. **Every slot must resolve**, or a
   * later sibling waits forever; `runConceptBatch` releases the whole register in a `finally`.
   */
  release(index: number): void {
    const slot = this.slots.get(index);
    if (!slot || slot.done) return;
    slot.done = true;
    slot.resolve(null);
  }

  /** Release every slot that has not resolved. Idempotent. */
  releaseAll(): void {
    for (const index of this.slots.keys()) this.release(index);
  }

  /**
   * The selector, for one candidate.
   *
   * Awaits every lower-indexed sibling, compares on both breakpoints — two trees can separate on
   * desktop and collapse onto the same mobile stack — and, when clear, admits the candidate so the
   * siblings after it have something to differentiate from.
   *
   * Returns the verdict rather than throwing: the caller decides whether this is the re-promptable
   * first collision or the second one that falls back.
   */
  async judge(candidate: SiblingCandidate): Promise<CollisionVerdict> {
    const rivals: Admitted[] = [];
    for (const [index, slot] of this.slots) {
      if (index >= candidate.index) continue;
      const admitted = await slot.settled;
      if (admitted) rivals.push(admitted);
    }

    const self: SigInput = {
      tree: candidate.tree,
      ...(candidate.category !== undefined
        ? { category: candidate.category, tone: candidate.tone }
        : {}),
    };

    const colliding: string[] = [];
    let nearest = 0;
    for (const rival of rivals) {
      const other: SigInput = {
        tree: rival.tree,
        ...(rival.category !== undefined ? { category: rival.category, tone: rival.tone } : {}),
      };
      for (const mode of ["desktop", "mobile"] as const) {
        const score = similarity(self, other, mode);
        if (score > nearest) nearest = score;
        if (score >= COLLISION_THRESHOLD) colliding.push(describe(rival, mode, score));
      }
    }

    if (colliding.length === 0) {
      const slot = this.slots.get(candidate.index);
      // Admitting a re-prompted candidate replaces nothing: the slot resolves once, with whichever
      // tree first cleared the selector, and a colliding first attempt never reached here.
      if (slot && !slot.done) {
        slot.done = true;
        slot.resolve({
          index: candidate.index,
          tree: candidate.tree,
          ...(candidate.category !== undefined
            ? { category: candidate.category, tone: candidate.tone }
            : {}),
        });
      }
    }

    return { colliding, nearest: Math.round(nearest * 100) / 100 };
  }
}
