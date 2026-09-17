import "server-only";

import {
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  PROVIDER_REQUEST_TIMEOUT_MS,
  TRANSIENT_BACKOFF_MS,
} from "@/lib/ai/openai/event-identity";
import {
  isProductionRuntime,
  isVerified,
  logicalCallMaxUsd,
  providerAttemptMaxUsd,
  requireCostProfile,
  type ModelCostProfile,
} from "./identity-cost";

/**
 * Configured backend safety limits for the EventIdentity call, and the lease that bounds a claim.
 *
 * `docs/phase-4b-plan.md §A.5`; `spec.md §10` ("Enforce configurable backend safety limits"),
 * `spec.md §6` (limits apply at both the event and acting-account level, owner or co-host alike),
 * `spec.md §32 #41` (never expose a backend counter).
 *
 * These are safety limits, not a product quota. `spec.md §10` is explicit that creative work is
 * "effectively unlimited from the user's perspective" and that no arbitrary user-facing cap is
 * imposed before testing, so nothing here is surfaced, counted down, or named in a response.
 */

const positiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const positiveNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
};

const DAY_SECONDS = 86_400;

/**
 * Development's global ceiling. **Not** a production decision.
 *
 * How much this product is willing to lose in a day is a financial choice with a real owner, and
 * inheriting a number a developer picked for local convenience is not that choice being made — it
 * is that choice being skipped. Production therefore requires `IDENTITY_CEILING_USD` to be set,
 * and refuses before a claim exists if it is missing, malformed or non-positive.
 */
export const DEV_CEILING_USD = 3_000;

function ceilingUsd(): number {
  const raw = process.env.IDENTITY_CEILING_USD;
  const configured = raw !== undefined && raw.trim() !== "";
  if (!configured) {
    if (!isProductionRuntime()) return DEV_CEILING_USD;
    throw new Error(
      "IDENTITY_CEILING_USD is not set. Production refuses to run without an explicit global " +
        "spend ceiling: the development default is a convenience, not a decision about how much " +
        "this product may lose in a day.",
    );
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("IDENTITY_CEILING_USD must be a positive number");
  }
  return parsed;
}

export interface IdentityLimits {
  /** Per-event daily generation cap. Spans the owner and every co-host (`spec.md §6`). */
  eventCap: { windowSeconds: number; max: number };
  /** Per-account daily cap, on the **acting** user rather than the owner. */
  accountCap: { windowSeconds: number; max: number };
  /** Short-window anti-abuse rate limit on the acting user. */
  accountRate: { windowSeconds: number; max: number };
  /** Window the global ceiling sums recorded spend over, and the ceiling itself. */
  ceiling: { windowSeconds: number; usd: number };
  /** Reservation held per in-flight claim: the worst a whole logical call can cost. */
  logicalCallMaxUsd: number;
  /** Fraction of the ceiling at which the warn alert fires. */
  warnFraction: number;
  leaseSeconds: number;
  /**
   * Whether the per-attempt maximum came from a verified profile for this exact model.
   *
   * Production cannot reach the provider without one (`requireCostProfile`), so outside production
   * this is the only place the looser dev fallback is visible. Carried into the alert record.
   */
  costBoundVerified: boolean;
  /** The profile's version, persisted as provenance beside the call it priced. */
  costProfileVersion: string;
  /**
   * The resolved profile.
   *
   * Carried so the cost estimate can be computed *after* the provider has been paid without
   * re-resolving anything: resolving there could throw between the response and the capture, and
   * the provider's dated snapshot id would not match a profile by exact string anyway.
   */
  costProfile: ModelCostProfile;
  /** The bound actually in force, after any environment override. */
  perAttemptMaxUsd: number;
}

/**
 * The floor under the claim lease, in seconds.
 *
 * A lease shorter than a legitimate call turns the mechanism built to stop double payment into
 * the thing that causes it: a live call is declared `expired_unknown`, the host retries, and a
 * second paid call runs beside the first. So the floor is derived from the boundary's own bounded
 * worst case rather than chosen — every permitted attempt timing out, plus every backoff — and a
 * test pins it, so raising `MAX_TRANSIENT_RETRIES` or the timeout fails until this is recomputed.
 */
export const LEASE_FLOOR_SECONDS = Math.ceil(
  (MAX_PROVIDER_ATTEMPTS_PER_CALL * PROVIDER_REQUEST_TIMEOUT_MS +
    TRANSIENT_BACKOFF_MS.reduce((a, b) => a + b, 0) * 2) /
    1000,
);

/** Margin over the floor, so a call that is merely slow is never mistaken for a lost one. */
export const LEASE_MARGIN_SECONDS = 120;

export const DEFAULT_LEASE_SECONDS = LEASE_FLOOR_SECONDS + LEASE_MARGIN_SECONDS;

/**
 * How long a claim that provably never reached the provider may sit before it is reclaimed.
 *
 * A **different instrument from the lease**, and the distinction is the whole point. The lease
 * bounds work that MAY have been paid for, so it is derived from the provider call's worst case and
 * has to be long. This bounds work that provably was NOT: the claim is still `claimed`, its
 * committed `provider_invoked_at` is null and no run row exists for it, so there is nothing to
 * protect and nothing to lose by reclaiming it.
 *
 * Thirty seconds, because step 4 and step 5 are consecutive database round trips on the same
 * request — a gap of thirty seconds between them means that process is gone. Making an actively
 * waiting host sit out the financial lease for a crash that cost nothing is exactly what
 * request-driven recovery exists to stop.
 *
 * It does not shorten, weaken or replace the lease; it is a second and narrower door, and a test
 * pins it below the user-facing deadline, which is itself pinned below the lease, so the three
 * cannot quietly collapse into one timer.
 *
 * The clock runs from `claimed_at`, and that column is written from `clock_timestamp()` taken
 * **after** admission — not from the transaction's `now()`. The difference is the whole horizon: a
 * request that queued forty seconds behind the global budget lock would otherwise commit a claim
 * already old enough to reclaim, and a perfectly healthy driver could lose its claim before it ever
 * reached the provider. Thirty seconds means thirty seconds from the claim existing.
 */
export const IDENTITY_PREINVOKE_RECLAIM_MS = 30_000;

export function identityLimits(model: string, now: Date = new Date()): IdentityLimits {
  // Resolved first, and it throws in production when no verified profile exists for this exact
  // model. That is the fail-closed half of the contract: a claim cannot be taken — and therefore
  // the provider cannot be reached — while the reservation would be made against a bound nobody
  // checked.
  const profile = requireCostProfile(model, now);
  const leaseSeconds = positiveInt("IDENTITY_CLAIM_LEASE_SECONDS", DEFAULT_LEASE_SECONDS);
  if (leaseSeconds < LEASE_FLOOR_SECONDS) {
    throw new Error(
      `IDENTITY_CLAIM_LEASE_SECONDS must be at least ${LEASE_FLOOR_SECONDS}s, the boundary's ` +
        "bounded worst case; a shorter lease can expire a live call and cause a second paid call.",
    );
  }
  const warnFraction = positiveNumber("IDENTITY_CEILING_WARN_FRACTION", 0.8);
  if (warnFraction >= 1) throw new Error("IDENTITY_CEILING_WARN_FRACTION must be below 1");
  // Resolved here, at claim time, rather than where it is used. `estimateIdentityCallCostUsd` runs
  // *after* the provider has been paid, so a configuration error there would throw between the
  // response and the capture — losing a paid response to a misconfiguration. Fail before the
  // money, not after it.
  const maxUsd = logicalCallMaxUsd(model, now);
  return {
    eventCap: { windowSeconds: DAY_SECONDS, max: positiveInt("IDENTITY_EVENT_DAILY_MAX", 20) },
    accountCap: { windowSeconds: DAY_SECONDS, max: positiveInt("IDENTITY_ACCOUNT_DAILY_MAX", 40) },
    accountRate: {
      windowSeconds: positiveInt("IDENTITY_ACCOUNT_RATE_WINDOW_SECONDS", 60),
      max: positiveInt("IDENTITY_ACCOUNT_RATE_MAX", 6),
    },
    ceiling: {
      windowSeconds: positiveInt("IDENTITY_CEILING_WINDOW_SECONDS", DAY_SECONDS),
      usd: ceilingUsd(),
    },
    logicalCallMaxUsd: maxUsd,
    warnFraction,
    leaseSeconds,
    costBoundVerified: isVerified(profile),
    costProfileVersion: profile.profileVersion,
    costProfile: profile,
    perAttemptMaxUsd: providerAttemptMaxUsd(model, now),
  };
}

/** Why a claim was refused. Server-side only; never returned to a caller. */
export type IdentityRefusalReason =
  "ceiling" | "cap_event" | "cap_account" | "rate_limited" | "in_flight" | "duplicate_key";

/**
 * The one payload a refused caller ever sees.
 *
 * Identical for every reason on purpose. `spec.md §32 #41` forbids exposing backend
 * generation/spend counters, and a distinguishable refusal is a counter with extra steps: a
 * caller who can tell "your event is capped" from "the project ceiling is near" has learned the
 * state of both. The reason stays in the server-side record.
 */
export const IDENTITY_REFUSAL_PAYLOAD = Object.freeze({
  status: "unavailable" as const,
  message: "Generation is not available right now. Please try again shortly.",
});

export interface CeilingAlert {
  kind: "identity_spend_warn" | "identity_spend_refused";
  windowSeconds: number;
  ceilingUsd: number;
  recordedSpendUsd: number;
  reservedUsd: number;
  /** Which control refused, when one did. */
  refusedBy?: IdentityRefusalReason;
  /** False while the per-attempt maximum comes from the unverified dev fallback. */
  costBoundVerified: boolean;
  costProfileVersion: string;
  at: string;
}

/**
 * A paid response that could not become a revision, and the event it was holding.
 *
 * Routed to the same sink as the spend alerts rather than only to `console.error`, because this is
 * the outcome an operator most needs to see: the host paid, the response exists, and the only way
 * forward is for them to pay again. A count in a cron response body is not a signal anybody
 * receives.
 */
export interface RecoveryAlert {
  kind: "identity_recovery_failed" | "identity_recovery_halted";
  claimId: string;
  reason: string;
  deterministic: boolean;
  at: string;
}

/**
 * A safety limit that refused because it is not configured, rather than because it was reached.
 *
 * Separated from the refusals above because the remedy is different and the user-facing answer
 * must be too. A ceiling that has been *hit* is a busy system and "try again shortly" is true. A
 * ceiling that was never *set*, or a model with no verified cost profile, will refuse identically
 * for ever: telling that host to try again shortly is false, and folding it into the uniform
 * payload means the misconfiguration is invisible until somebody reads a log.
 */
export interface ConfigurationAlert {
  kind: "identity_configuration_refused";
  reason: string;
  at: string;
}

export type IdentityAlert = CeilingAlert | RecoveryAlert | ConfigurationAlert;

/**
 * Raised when EventIdentity is configured such that no paid attempt may be made.
 *
 * A distinct type so a caller can neither mistake it for a provider failure nor answer it with the
 * refusal payload. It is thrown **before** a claim exists and before any provider client is
 * constructed, so nothing is consumed and nothing is spent.
 */
export class IdentityConfigurationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IdentityConfigurationError";
  }
}

/**
 * Where a ceiling alert goes.
 *
 * A structured server-side record, not a new dependency: `docs/technology-decisions.md` is locked
 * and an alerting service is not in it. Delivery (email, pager) is explicit debt. Recording the
 * crossing truthfully is the part that cannot be retrofitted, because an alert nobody emitted is
 * not one anybody can route later.
 */
export type CeilingAlertSink = (alert: IdentityAlert) => void;

export const defaultIdentityAlertSink: CeilingAlertSink = (alert) => {
  console.warn(`[identity] ${alert.kind}`, JSON.stringify(alert));
};

let sink: CeilingAlertSink = defaultIdentityAlertSink;

export function setCeilingAlertSink(next: CeilingAlertSink): void {
  sink = next;
}

export function emitCeilingAlert(alert: Omit<CeilingAlert, "at">): void {
  sink({ ...alert, at: new Date().toISOString() });
}

export function emitRecoveryAlert(alert: Omit<RecoveryAlert, "at">): void {
  sink({ ...alert, at: new Date().toISOString() });
}

export function emitConfigurationAlert(alert: Omit<ConfigurationAlert, "at">): void {
  sink({ ...alert, at: new Date().toISOString() });
}

/**
 * Whether this claim attempt crossed the warn threshold.
 *
 * Measured including the reservation this call would add, so the warning fires before the spend
 * lands rather than after.
 */
export function crossesWarnThreshold(
  limits: IdentityLimits,
  recordedSpendUsd: number,
  reservedUsd: number,
): boolean {
  const projected = recordedSpendUsd + reservedUsd + limits.logicalCallMaxUsd;
  return projected >= limits.ceiling.usd * limits.warnFraction;
}
