/**
 * Does the image that arrived satisfy the hard requirements of the brief that asked for it?
 *
 * Two requirements are hard in the sense this module means: they are properties of the *returned
 * asset*, not of the page, and an asset that misses one cannot be used for the role it was
 * generated for.
 *
 * 1. **Transparency, when the role requires it.** `spec.md §7.6a` and
 *    `docs/product-doctrine.md §10`: for illustration-led and framed modes transparent-background
 *    artwork *"is likely a hard requirement — and alpha reliability varies by image model, so this
 *    is an input to model selection, not something a prompt adds afterwards."* So an opaque asset
 *    against `background: "transparent"` is classified and surfaced. It is never composited
 *    anyway, never auto-matted, and never re-asked for: papering over it would destroy exactly
 *    the evidence model selection is supposed to be made on.
 * 2. **No lettering.** `STANDING_PROHIBITIONS` forbids text, numerals and captions. Whether that
 *    is *detectable* depends on having a detector, and this repository has none — `textDetected`
 *    is `null`, and `text_present` is raised only on an explicit `true`. Reporting "no text found"
 *    when nothing looked would be worse than reporting nothing.
 *
 * Everything else in a `VisualArtIntent` — subject, medium, weighting, negative space, crop
 * safety, palette relationship — is a *creative* obligation. It is judged by a human in the
 * Phase 4E review, not asserted here. A boundary that tried to machine-score "is the subject
 * weighted right" would be inventing a quality gate nobody approved, and would fail assets a
 * reviewer would have accepted.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 */
import type { BackgroundTreatment, VisualArtIntent } from "./contract";
import { STANDING_PROHIBITIONS } from "./contract";
import type { ArtworkIntentViolation } from "./failure";
import type { ArtworkTransparency } from "./raster";

/** Treatments that make transparency a requirement rather than a preference. */
export function requiresTransparency(background: BackgroundTreatment): boolean {
  // `either` is a genuine "no preference": the direction said an opaque frame is acceptable here,
  // so an opaque asset is not a failure. Only `transparent` is a demand.
  return background === "transparent";
}

/**
 * The hard-requirement check. Returns every violation rather than the first, so telemetry records
 * what was actually wrong with an asset instead of what happened to be checked first.
 */
export function checkIntentCompliance(
  intent: VisualArtIntent,
  observed: { transparency: ArtworkTransparency; textDetected: boolean | null },
): readonly ArtworkIntentViolation[] {
  const violations: ArtworkIntentViolation[] = [];

  if (requiresTransparency(intent.background)) {
    if (observed.transparency === "verified_absent") violations.push("alpha_absent");
    else if (observed.transparency === "unverified") violations.push("alpha_unverified");
  }

  if (observed.textDetected === true) violations.push("text_present");

  return violations;
}

/**
 * Every standing prohibition is on this brief.
 *
 * `contract.ts` says `prohibited` is *"seeded with the standing prohibitions rather than left to
 * the caller, so a caller that forgets cannot produce a request without them"* — but the schema
 * only requires the array to be non-empty, so nothing enforced it. This does, at the last point
 * before a request is made. `spec.md §7.6a #4` makes originality a hard rule whatever the host's
 * prompt asks for, and a brief that lost the prohibitions on the way here is not that brief.
 */
export function missingStandingProhibitions(intent: VisualArtIntent): readonly string[] {
  const present = new Set(intent.prohibited.map((line) => line.trim()));
  return STANDING_PROHIBITIONS.filter((line) => !present.has(line));
}
