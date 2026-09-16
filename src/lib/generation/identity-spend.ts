import "server-only";

import {
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  PROVIDER_REQUEST_TIMEOUT_MS,
  TRANSIENT_BACKOFF_MS,
} from "@/lib/ai/openai/event-identity";
import { logicalCallMaxUsd, PROVIDER_ATTEMPT_MAX_IS_VERIFIED, tokenPrices } from "./identity-cost";

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
   * Whether the per-attempt maximum has been set from provider documentation.
   *
   * False means every call is costed at that maximum: a real ceiling, just a blunt one. Carried
   * here so it reaches the alert record rather than being a constant nothing reads.
   */
  costBoundVerified: boolean;
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

export function identityLimits(): IdentityLimits {
  const leaseSeconds = positiveInt("IDENTITY_CLAIM_LEASE_SECONDS", DEFAULT_LEASE_SECONDS);
  if (leaseSeconds < LEASE_FLOOR_SECONDS) {
    throw new Error(
      `IDENTITY_CLAIM_LEASE_SECONDS must be at least ${LEASE_FLOOR_SECONDS}s, the boundary's ` +
        "bounded worst case; a shorter lease can expire a live call and cause a second paid call.",
    );
  }
  const warnFraction = positiveNumber("IDENTITY_CEILING_WARN_FRACTION", 0.8);
  if (warnFraction >= 1) throw new Error("IDENTITY_CEILING_WARN_FRACTION must be below 1");
  // Parsed here, at claim time, rather than where it is used. `estimateIdentityCallCostUsd` runs
  // *after* the provider has been paid, so a typo in the price configuration would throw between
  // the response and the capture — losing a paid response to a misconfiguration. Fail before the
  // money, not after it.
  tokenPrices();
  return {
    eventCap: { windowSeconds: DAY_SECONDS, max: positiveInt("IDENTITY_EVENT_DAILY_MAX", 20) },
    accountCap: { windowSeconds: DAY_SECONDS, max: positiveInt("IDENTITY_ACCOUNT_DAILY_MAX", 40) },
    accountRate: {
      windowSeconds: positiveInt("IDENTITY_ACCOUNT_RATE_WINDOW_SECONDS", 60),
      max: positiveInt("IDENTITY_ACCOUNT_RATE_MAX", 6),
    },
    ceiling: {
      windowSeconds: positiveInt("IDENTITY_CEILING_WINDOW_SECONDS", DAY_SECONDS),
      // Coherent with the placeholder per-attempt maximum: with prices unconfigured every call is
      // reserved and recorded at `logicalCallMaxUsd()`, so a ceiling tuned for priced calls would
      // refuse after a handful and present to operators as "generation is broken" — every refusal
      // being indistinguishable by design. Setting real prices makes the accounting far less blunt
      // and this number correspondingly less important.
      usd: positiveNumber("IDENTITY_CEILING_USD", 3_000),
    },
    logicalCallMaxUsd: logicalCallMaxUsd(),
    warnFraction,
    leaseSeconds,
    costBoundVerified: PROVIDER_ATTEMPT_MAX_IS_VERIFIED,
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
  /** False while the per-attempt maximum is still the unverified placeholder. */
  costBoundVerified: boolean;
  at: string;
}

/**
 * Where a ceiling alert goes.
 *
 * A structured server-side record, not a new dependency: `docs/technology-decisions.md` is locked
 * and an alerting service is not in it. Delivery (email, pager) is explicit debt. Recording the
 * crossing truthfully is the part that cannot be retrofitted, because an alert nobody emitted is
 * not one anybody can route later.
 */
export type CeilingAlertSink = (alert: CeilingAlert) => void;

let sink: CeilingAlertSink = (alert) => {
  console.warn(`[spend] ${alert.kind}`, JSON.stringify(alert));
};

export function setCeilingAlertSink(next: CeilingAlertSink): void {
  sink = next;
}

export function emitCeilingAlert(alert: Omit<CeilingAlert, "at">): void {
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
