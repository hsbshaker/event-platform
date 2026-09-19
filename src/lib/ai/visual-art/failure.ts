/**
 * How an artwork request can fail — closed, exhaustive, and retryable-by-classification.
 *
 * `src/lib/ai/visual-art/contract.ts` says what the image model is asked. This module says what
 * can come back instead of an asset, and it is deliberately a *classification* rather than a
 * table of error strings: the retry policy is read off the kind, so "is this worth paying for
 * again" is answered once, in one place, by the same fact that names the failure.
 *
 * # These are not the Composition re-prompts
 *
 * `docs/model-contracts.md §6.3` gives the **Composition** stage exactly three re-prompts —
 * schema-invalid output, a token-cap violation, a selector collision — against the text model,
 * each once. Nothing here is one of those. An artwork retry is a different action against a
 * different model for a different reason, and the naming keeps them apart on purpose:
 * `artworkAttempts` and `ARTWORK_MAX_RETRIES` here; `reprompts` and `COMPOSITION_PASSES` there.
 * A run that reported them in one counter could claim a policy violation it did not commit, or
 * hide one it did — the same argument `src/lib/ai/openai/composition.ts` makes for keeping
 * transport retries out of `reprompts`.
 *
 * # Why so few kinds are retryable
 *
 * Only failures that produced **no answer** are retried: a timeout, a rate limit, a transient
 * provider fault. Everything the provider actually returned — a refusal, an undecodable body, an
 * image that misses a hard requirement of the brief — is not retried, and the reason is
 * `docs/product-doctrine.md §10`: *"alpha reliability varies by image model, so this is an input
 * to model selection, not something a prompt adds afterwards."* A provider that hands back opaque
 * pixels for a transparent-required role is telling us something about the provider. Paying it
 * again for the same brief is the re-roll loop this project has already recorded the cost of, and
 * it spends money per asset to do it.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 * Guardrails: `spec.md §32 #21` — re-prompts exist only for schema-invalid output, a token-cap
 * violation or a selector collision, once each, plus the one bounded premise-set re-prompt. None
 * of them is what this file counts.
 */

/**
 * Every way one artwork request can end without an asset. Closed.
 *
 * Adding a ninth is a change to the retry policy and to the telemetry vocabulary at once, which
 * is why the two live beside each other below rather than in separate lists that can drift.
 */
export const ARTWORK_FAILURE_KINDS = [
  /**
   * The request was rejected **before** a provider was reached: a malformed `VisualArtIntent`, a
   * brief missing the standing prohibitions, a spent or foreign reservation, or a provider-side
   * rejection of the request itself (an unrecognised 4xx). No money was spent.
   */
  "invalid_request",
  /** The batch ceiling would have been exceeded. No request was made. See `./spend.ts`. */
  "budget_refused",
  /** The request did not complete inside this boundary's deadline. */
  "timeout",
  /** The provider rate-limited the request (429). */
  "rate_limited",
  /** A transient provider-side fault: 5xx, connection reset, DNS, an unrecognised throw. */
  "provider_error",
  /** The provider declined to generate on content-policy grounds. An answer, and a final one. */
  "content_refused",
  /** Something came back, and this boundary could not decode it as an image it can verify. */
  "malformed_output",
  /**
   * An image arrived and breaks a hard requirement of the intent — transparency the role
   * required, or text the standing prohibitions forbade. See `ARTWORK_INTENT_VIOLATIONS`.
   */
  "intent_violation",
] as const;

export type ArtworkFailureKind = (typeof ARTWORK_FAILURE_KINDS)[number];

/**
 * Which kinds are worth paying for again, stated as data.
 *
 * Exhaustive by construction: `Record<ArtworkFailureKind, boolean>` fails to compile the moment a
 * kind is added above without an answer here, which is the point of writing it this way rather
 * than as an `includes()` over a list of three.
 */
export const ARTWORK_FAILURE_RETRYABLE: Readonly<Record<ArtworkFailureKind, boolean>> = {
  invalid_request: false,
  budget_refused: false,
  timeout: true,
  rate_limited: true,
  provider_error: true,
  // Three answers, three refusals to pay twice for the same brief. See the module header.
  content_refused: false,
  malformed_output: false,
  intent_violation: false,
};

export function isRetryable(kind: ArtworkFailureKind): boolean {
  return ARTWORK_FAILURE_RETRYABLE[kind];
}

/**
 * The hard requirements of a `VisualArtIntent` an arrived image can break.
 *
 * `alpha_unverified` is separate from `alpha_absent` on purpose. "The asset has no transparency"
 * and "this boundary could not establish whether it has transparency" are different facts about
 * the provider, and collapsing them would let an unverifiable asset be reported as a verified
 * failure — or, worse, be quietly accepted for a role that needs alpha.
 */
export const ARTWORK_INTENT_VIOLATIONS = [
  /** The role required transparency and the asset is verifiably opaque. */
  "alpha_absent",
  /** The role required transparency and this boundary could not verify it. See `./raster.ts`. */
  "alpha_unverified",
  /** `STANDING_PROHIBITIONS` forbids lettering and a detector found some. */
  "text_present",
] as const;

export type ArtworkIntentViolation = (typeof ARTWORK_INTENT_VIOLATIONS)[number];

/** A classified failure. Returned, never thrown: see `./generate.ts` on why the call is total. */
export interface ArtworkFailure {
  readonly kind: ArtworkFailureKind;
  /** Read off `ARTWORK_FAILURE_RETRYABLE`, carried so a consumer never re-derives it. */
  readonly retryable: boolean;
  /** One line, safe to log. Never provider credentials, never the raw brief. */
  readonly detail: string;
  /** Present, and non-empty, exactly when `kind` is `intent_violation`. */
  readonly violations?: readonly ArtworkIntentViolation[];
  /** The provider's HTTP status where there was one. `null` when the request never got that far. */
  readonly providerStatus: number | null;
}

export function artworkFailure(
  kind: ArtworkFailureKind,
  detail: string,
  extra: {
    violations?: readonly ArtworkIntentViolation[];
    providerStatus?: number | null;
  } = {},
): ArtworkFailure {
  return {
    kind,
    retryable: isRetryable(kind),
    detail,
    ...(extra.violations && extra.violations.length > 0 ? { violations: extra.violations } : {}),
    providerStatus: extra.providerStatus ?? null,
  };
}

/**
 * The kinds a **provider** may declare for itself.
 *
 * A provider knows things this boundary cannot infer — that a 400 carried a content-policy code,
 * that a body was truncated. It says so by throwing `ArtworkProviderError`. What it may not
 * declare are the three kinds this boundary owns outright: `budget_refused` (the ledger's),
 * `intent_violation` (decided here, from the image, against the intent) and `invalid_request`
 * when it describes our own bookkeeping.
 */
export type ProviderDeclaredFailureKind =
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "content_refused"
  | "malformed_output"
  | "invalid_request";

/** What an `ArtworkProvider` throws when it can classify its own failure. */
export class ArtworkProviderError extends Error {
  constructor(
    readonly kind: ProviderDeclaredFailureKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ArtworkProviderError";
  }
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/**
 * Turn anything a provider threw into a classified failure.
 *
 * The status mapping is deliberately narrow. `408` and `429` name themselves; `5xx` and a throw
 * with no status at all (connection reset, DNS, an aborted socket) are transient provider faults.
 * Every **other** 4xx is our request being refused, which is `invalid_request` and therefore not
 * retryable — a boundary that retried a 400 would pay twice to be told the same thing. A provider
 * adapter that can recognise a content-policy 400 is expected to throw `ArtworkProviderError`
 * with `content_refused` rather than leave it to this function.
 */
export function classifyProviderError(error: unknown): ArtworkFailure {
  if (error instanceof ArtworkProviderError) {
    return artworkFailure(error.kind, error.message, { providerStatus: error.status });
  }

  const name = (error as { name?: unknown } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return artworkFailure("timeout", "the artwork request was aborted on this boundary's deadline");
  }

  const status = statusOf(error);
  const message = (error as Error | null)?.message ?? String(error);

  if (status === 408) return artworkFailure("timeout", message, { providerStatus: status });
  if (status === 429) return artworkFailure("rate_limited", message, { providerStatus: status });
  if (status !== null && status >= 500) {
    return artworkFailure("provider_error", message, { providerStatus: status });
  }
  if (status !== null && status >= 400) {
    return artworkFailure("invalid_request", message, { providerStatus: status });
  }
  // No status means the request did not complete. Transient, and retryable once.
  return artworkFailure("provider_error", message, { providerStatus: status });
}
