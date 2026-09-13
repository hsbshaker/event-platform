/**
 * 8. Assembly: everything the deterministic engine knows, short of geometry.
 *
 * `docs/event-renderer-system.md §6` defines `ResolvedDesignSpec`. This module assembles every
 * field of it that does not require a browser, and deliberately stops there.
 *
 * # The spec is not final until Chromium says so
 *
 * §3.1 and §6: "A spec is final only with `verified.clean === true`", and the authority is
 * rendered geometry, not the static estimate. So this stage produces a
 * `PreVerificationDesignSpec` whose `verified` is `null` and which carries an explicit
 * `state: "pre-verification"`. It is not a `ResolvedDesignSpec` and cannot be mistaken for one by
 * the type system — nothing may persist it as a concept's active spec, and
 * `spec.md §32` #20 forbids finalizing a spec that has not passed geometry verification.
 *
 * The one thing that would make this dishonest is stamping `clean: true` here. The type makes
 * that unrepresentable.
 *
 * # Order
 *
 * ```text
 * validated DesignIntent
 *   → page system      (compiler-owned: border, card, button, type scale, spacing, alignment)
 *   → semantic palette (raw creative colors never become roles)
 *   → typography       (curated pairings; monumental compatibility enforced)
 *   → motifs           (placed by the tree, treated within the ornament budget)
 *   → resolved layout  (enum tokens → numbers, per breakpoint)
 *   → signature        (for the selector and redesign history)
 * ```
 *
 * The composition arrives already validated, repaired, capped and canonicalized — that is the
 * language core's half of the compiler, and this module does not redo it.
 */

import { canonicalize } from "../composition/canonicalize";
import type { Capabilities, CompositionTree, Repair } from "../composition/nodes";
import { resolveLayout } from "../composition/layout";
import { skeleton, type Skeleton } from "../composition/signature";
import type { DesignIntent, Deviation, Presentation } from "../design-intent";
import { resolveMotifs, type ResolvedMotif } from "./motifs";
import { compileSemanticPalette, type SemanticPalette } from "./palette";
import { resolvePageSystem, type PageSystem } from "./page-system";
import { resolveTypography, type ResolvedTypography } from "./typography";

/** `docs/model-contracts.md §2`. Every one is recorded with the spec. */
export interface SpecVersions {
  readonly primitiveSet: string;
  readonly compiler: string;
  readonly compositionPrompt: string;
  readonly compositionSchema: string;
  readonly designIntentPrompt: string;
  readonly designIntentSchema: string;
}

export const VERSIONS: SpecVersions = {
  primitiveSet: "composition_v1",
  compiler: "phase3-0.1",
  compositionPrompt: "composition_v1_p2",
  compositionSchema: "composition_schema_v1",
  designIntentPrompt: "design_intent_v4",
  designIntentSchema: "design_intent_schema_v4",
};

/** The renderer's token set: semantic palette plus the resolved type and spacing scales. */
export interface ResolvedTokens {
  readonly palette: SemanticPalette;
  readonly typography: ResolvedTypography;
  readonly spacing: PageSystem["spacing"];
}

export interface SignatureRecord {
  readonly desktop: Skeleton;
  readonly mobile: Skeleton;
}

/**
 * Everything §6 requires except `verified`, which only a headless browser can fill.
 *
 * `state` is not decoration: it is the discriminant that keeps this out of anywhere a final spec
 * belongs. Geometry verification consumes one of these and returns a `ResolvedDesignSpec`.
 */
export interface PreVerificationDesignSpec {
  readonly version: "resolved_v2";
  readonly state: "pre-verification";
  readonly designIntent: DesignIntent;
  readonly presentation?: Presentation;
  readonly composition: CompositionTree;
  readonly compositionHash: string;
  readonly capabilities: Capabilities;
  readonly pageSystem: PageSystem;
  readonly tokens: ResolvedTokens;
  readonly layout: Record<string, unknown>;
  readonly motifs: Record<string, ResolvedMotif>;
  readonly compilerRepairs: readonly Repair[];
  readonly intentDeviations: readonly Deviation[];
  readonly signature: SignatureRecord;
  readonly seed: number;
  readonly versions: SpecVersions;
  /** Always null here. Rendered geometry is authoritative and has not run (`§3.1`). */
  readonly verified: null;
}

export interface AssembleInput {
  /** Validated, repaired, capped. Canonicalized here if it is not already. */
  readonly composition: CompositionTree;
  readonly designIntent: DesignIntent;
  readonly capabilities: Capabilities;
  readonly seed: number;
  /** Everything the language core and the planner logged on the way here. */
  readonly repairs?: readonly Repair[];
  /** Deviations logged before this stage, e.g. by DesignIntent narrowing. */
  readonly deviations?: readonly Deviation[];
  readonly presentation?: Presentation;
  readonly versions?: Partial<SpecVersions>;
}

/**
 * Assemble the deterministic half of a spec.
 *
 * Deterministic in `(composition, designIntent, capabilities, seed)`: the same inputs produce a
 * byte-identical result, which is what makes a concept reproducible and a re-fit cheap.
 */
export function assemblePreVerificationSpec(input: AssembleInput): PreVerificationDesignSpec {
  const { designIntent, capabilities, seed } = input;

  // Canonicalization is idempotent, so this is safe whether or not the caller already ran it,
  // and it guarantees every node has the id the layout and motif maps are keyed by.
  const canon = canonicalize(input.composition);

  const pageSystem = resolvePageSystem(designIntent, seed);
  const { palette, deviations: paletteDeviations } = compileSemanticPalette(designIntent);
  const { typography, deviations: typographyDeviations } = resolveTypography(designIntent);
  const { motifs, deviations: motifDeviations } = resolveMotifs(canon.tree, designIntent, seed);

  return {
    version: "resolved_v2",
    state: "pre-verification",
    designIntent,
    ...(input.presentation ? { presentation: input.presentation } : {}),
    composition: canon.tree,
    compositionHash: canon.hash,
    capabilities,
    pageSystem,
    tokens: { palette, typography, spacing: pageSystem.spacing },
    layout: resolveLayout(canon.tree, designIntent.density),
    motifs,
    compilerRepairs: input.repairs ?? [],
    intentDeviations: [
      ...(input.deviations ?? []),
      ...paletteDeviations,
      ...typographyDeviations,
      ...motifDeviations,
    ],
    signature: {
      desktop: skeleton(canon.tree, "desktop"),
      mobile: skeleton(canon.tree, "mobile"),
    },
    seed,
    versions: { ...VERSIONS, ...input.versions },
    verified: null,
  };
}
