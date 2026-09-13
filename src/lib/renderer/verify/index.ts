/**
 * Rendered-geometry verification: the stage that decides whether a spec is final.
 *
 * `docs/event-renderer-system.md §3.1` and §6. `assemblePreVerificationSpec` produces everything a
 * spec needs short of geometry; this directory renders that spec in headless Chromium at 390 and
 * 1280, fits it, and returns either an immutable `ResolvedDesignSpec` with
 * `verified.clean === true` or an explicit failure.
 *
 * ```text
 * PreVerificationDesignSpec + EventContent
 *   → html.ts     the real EventPage, the real stylesheet, the pairing's fonts inlined
 *   → browser.ts  one Chromium, one context, one page, closed in a finally
 *   → measure.ts  rendered DOM geometry at both widths
 *   → verify.ts   demote, then relax, then judge — never touching the composition
 *   → ResolvedDesignSpec | VerificationFailure
 * ```
 *
 * This is the only public surface of the directory.
 */

export {
  verifyGeometry,
  isClean,
  summarise,
  indexTree,
  orderIds,
  demotionViolations,
  applyDemotions,
  applyRelaxations,
  innermostRelaxation,
  overflowingIds,
  TOLERANCE_PX,
  MAX_DEMOTION_ROUNDS,
  MAX_RELAXATION_ROUNDS,
  type NodeIndex,
  type DemotionViolation,
  type RelaxationChoice,
  type VerifyInput,
  type VerifyOptions,
} from "./verify";

export {
  GeometryInfrastructureError,
  type BreakpointSummaries,
  type BreakpointSummary,
  type ResolvedDesignSpec,
  type VerifiedFonts,
  type VerifiedGeometry,
  type VerificationFailure,
  type VerificationFailureKind,
  type VerificationResult,
  type VerificationSuccess,
} from "./result";

export {
  BREAKPOINTS,
  LINE_LIMITS,
  VIEWPORTS,
  lineLimit,
  type Box,
  type Breakpoint,
  type MeasuredElement,
  type MeasuredText,
  type PageMeasurement,
  type Viewport,
} from "./measure";

export {
  buildMeasurableDocument,
  inlineFontFaces,
  requiredFamilies,
  DEFAULT_ASSETS,
  type AssetPaths,
  type DocumentInput,
  type MeasurableDocument,
} from "./html";

export { chromiumAvailability, type ChromiumAvailability } from "./browser";
