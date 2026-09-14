/**
 * What geometry verification returns: a final spec, or an explicit failure.
 *
 * `docs/event-renderer-system.md §3.1`: "A spec is final only with `verified.clean === true`", and
 * `spec.md §32` #20 forbids finalizing or persisting a spec that has not passed. So the two
 * outcomes are different *shapes*, not the same shape with a flag:
 *
 * - success carries a `ResolvedDesignSpec`, whose `verified.clean` is the literal `true` and whose
 *   `state` is `"verified"`;
 * - failure carries no spec at all. It has no `version`, no `composition`, no `layout` — nothing a
 *   renderer or a persistence layer could mistake for something to draw or store. A caller that
 *   forgets to check `ok` gets a type error rather than an unverified page.
 *
 * There is deliberately no third outcome. A page that will not fit inside the bounded algorithm is
 * a failure: the verifier does not fall back to the static estimate, does not lower the bar, and
 * does not call a model (`spec.md §32` #21, #24).
 *
 * # Why `overrides` is a field of the spec
 *
 * `compile/verification.ts` explains the choice in full. In short: §6 requires a content re-fit to
 * produce a new revision with the *same* canonical tree and the *same* `compositionHash`, so the
 * fit cannot live in the tree. It lives here instead, beside `layout` and `motifs`, where every
 * other piece of compiler-resolved data lives. Rendering a persisted spec means passing this map
 * back to `EventPage`.
 */

import type { Repair } from "../composition/nodes";
import type { PreVerificationDesignSpec } from "../compile/spec";
import type { VerificationOverrides } from "../compile/verification";
import type { Breakpoint, Viewport } from "./measure";

/** One breakpoint's rendered geometry, reduced to the numbers §6 records with a spec. */
export interface BreakpointSummary {
  readonly viewport: Viewport;
  readonly documentWidth: number;
  readonly clientWidth: number;
  readonly documentHeight: number;
  readonly pageOverflow: boolean;
  readonly overflowingElements: number;
  readonly textOverflow: number;
  readonly textOverLimit: number;
  /**
   * The three composition defects `verify.ts` added for F1: text broken inside its own words,
   * atomic metadata past its line budget, and lines that do not share an aligned edge. All three
   * are zero in a clean run (`docs/human-test-1/qualitative-findings.md`).
   */
  readonly textWordBroken: number;
  readonly textOverMetadataLimit: number;
  readonly textEdgeIncoherent: number;
  readonly measuredTexts: number;
  readonly excludedTexts: number;
  readonly heroHeight: number;
}

export type BreakpointSummaries = Record<Breakpoint, BreakpointSummary>;

/** The families the concept's pairing asked for, and which of them the browser actually had. */
export interface VerifiedFonts {
  readonly required: readonly string[];
  readonly loaded: readonly string[];
}

/**
 * `§6`: `verified: { desktop, mobile, fitDemotions, clean: true, authoritative:
 * "rendered-geometry" }`, plus the round counts and the relaxation count, which §3.1 bounds and
 * therefore makes worth recording, and the tolerance the run was judged at.
 *
 * `clean` is the literal `true`. A summary that did not pass cannot be given this type.
 */
export interface VerifiedGeometry {
  readonly desktop: BreakpointSummary;
  readonly mobile: BreakpointSummary;
  /** Emphasis steps applied across all rounds, one per `fit.verified` repair. */
  readonly fitDemotions: number;
  /** Boxes relaxed, one per `fit.verified.structural` repair. */
  readonly fitRelaxations: number;
  readonly demotionRounds: number;
  readonly relaxationRounds: number;
  /** The sub-pixel allowance every comparison above was made with. See `verify.ts`. */
  readonly tolerancePx: number;
  readonly fonts: VerifiedFonts;
  readonly clean: true;
  readonly authoritative: "rendered-geometry";
}

/**
 * The immutable, final spec (`docs/event-renderer-system.md §6`).
 *
 * Everything `assemblePreVerificationSpec` produced, carried through unchanged — the same
 * `composition` object and the same `compositionHash` — plus the fit. `state` flips from
 * `"pre-verification"` to `"verified"`, which is what lets the type system keep an unverified spec
 * out of anywhere a final one belongs.
 */
export interface ResolvedDesignSpec extends Omit<
  PreVerificationDesignSpec,
  "state" | "verified" | "compilerRepairs"
> {
  readonly state: "verified";
  /** The pre-verification repairs plus this run's `fit-verified` entries, in that order. */
  readonly compilerRepairs: readonly Repair[];
  /** Geometry adaptation, keyed by canonical node id. Never applied to the tree. */
  readonly overrides: VerificationOverrides;
  readonly verified: VerifiedGeometry;
  /** §6 re-fit bookkeeping, passed through from the caller; this module derives neither. */
  readonly contentVersion?: number;
  readonly supersedesSpecId?: string;
}

export interface VerificationSuccess {
  readonly ok: true;
  readonly spec: ResolvedDesignSpec;
}

/**
 * - `unresolved` — the page was measured but would not come clean inside the bounded number of
 *   demotion and relaxation rounds §3.1 allows. A real answer about a real page.
 * - `infrastructure` — the measurement itself could not be trusted: Chromium would not launch, the
 *   page did not render, or a required font was not available so the geometry would have been
 *   fallback typography. Never reported as a fit result, and never as clean.
 */
export type VerificationFailureKind = "unresolved" | "infrastructure";

export interface VerificationFailure {
  readonly ok: false;
  readonly kind: VerificationFailureKind;
  readonly detail: string;
  /** How far the fit got, for telemetry and for a human reading the log. */
  readonly overrides: VerificationOverrides;
  readonly repairs: readonly Repair[];
  readonly demotionRounds: number;
  readonly relaxationRounds: number;
  /** The last geometry seen, or `null` if nothing was ever measured. */
  readonly measurements: BreakpointSummaries | null;
  /** Canonical node ids still failing when the algorithm gave up. */
  readonly outstanding: readonly string[];
}

export type VerificationResult = VerificationSuccess | VerificationFailure;

/**
 * The measurement could not be trusted. Thrown by the browser and document layers, caught by
 * `verifyGeometry` and turned into an `infrastructure` failure.
 *
 * Separate from an ordinary `Error` so that a genuine bug in the verifier is not quietly reported
 * as "the environment was unavailable".
 */
export class GeometryInfrastructureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeometryInfrastructureError";
  }
}
