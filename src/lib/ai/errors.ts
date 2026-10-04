/**
 * Errors of the model layer (`spec.md §9`, §10; `docs/model-contracts.md §9`).
 *
 * Two families, never confused:
 * - `ModelCallRefusedError` and its subclasses: the meter refused, so **no call was made** and
 *   nothing was spent (generation switched off, the daily ceiling reached, the generation no
 *   longer running, a context without an event member).
 * - `ProviderCallError` and its subclasses: a call was made and failed (HTTP error, timeout,
 *   refusal, invalid output). The meter recorded it and booked its cost.
 */
import type { TokenUsage } from "./pricing";

export type ModelCallRefusal = "disabled" | "ceiling" | "not_running" | "invalid_context";

export class ModelCallRefusedError extends Error {
  constructor(
    readonly reason: ModelCallRefusal,
    message: string,
  ) {
    super(message);
    this.name = "ModelCallRefusedError";
  }
}

/** The kill switch is off (`GENERATION_ENABLED`). */
export class GenerationDisabledError extends ModelCallRefusedError {
  constructor() {
    super("disabled", "Generation is switched off (GENERATION_ENABLED).");
    this.name = "GenerationDisabledError";
  }
}

/** Today's spend plus calls in flight would pass the daily ceiling. */
export class SpendCeilingError extends ModelCallRefusedError {
  constructor() {
    super("ceiling", "The daily generation spend ceiling is reached.");
    this.name = "SpendCeilingError";
  }
}

/**
 * Whether the provider billed a failed call, when it reported no usage: `none` for a request it
 * rejected with an HTTP error, `unknown` when the outcome is unknown (timeout, dropped connection)
 * or the provider refused the content, in which case the meter books the full reservation.
 */
export type FailedCallBilling = "none" | "unknown";

export class ProviderCallError extends Error {
  /** Short machine code recorded as the run's `error_code` (e.g. `http_500`, `timeout`). */
  readonly code: string;
  /** Worth one ordinary retry (`docs/model-contracts.md §9`): 429, 5xx, timeout, network. */
  readonly transient: boolean;
  readonly billing: FailedCallBilling;
  /** The provider's usage, when the call got far enough to report it; then it is the cost. */
  readonly usage?: TokenUsage;
  readonly providerRequestId?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: {
      code: string;
      transient?: boolean;
      billing?: FailedCallBilling;
      usage?: TokenUsage;
      providerRequestId?: string;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderCallError";
    this.code = options.code;
    this.transient = options.transient ?? false;
    this.billing = options.billing ?? "unknown";
    this.usage = options.usage;
    this.providerRequestId = options.providerRequestId;
    this.status = options.status;
  }
}

/**
 * The provider's safety system refused the request or its output (`moderation_blocked`). For
 * artwork of a brand or character homage this is the case `spec.md §7.6` answers with a
 * `provider-refusal` re-prompt (Phase 5b).
 */
export class ProviderRefusalError extends ProviderCallError {
  constructor(message: string, options: ConstructorParameters<typeof ProviderCallError>[1]) {
    super(message, options);
    this.name = "ProviderRefusalError";
  }
}

export type ModelOutputProblem = "schema_invalid" | "unparseable" | "incomplete" | "refusal";

/**
 * The call succeeded and was billed, but its output is unusable: not valid against the canonical
 * schema, not JSON, cut off at the output ceiling, or a refusal by the model. `problems` is worded
 * as re-prompt feedback; the re-prompt policy is the pipeline's (Phase 5b).
 */
export class ModelOutputError extends ProviderCallError {
  readonly problems: string[];
  readonly raw: string;

  constructor(
    problem: ModelOutputProblem,
    problems: string[],
    raw: string,
    options: { usage?: TokenUsage; providerRequestId?: string },
  ) {
    super(`model output ${problem}: ${problems.join("; ")}`, {
      code: problem,
      transient: false,
      billing: "unknown",
      ...options,
    });
    this.name = "ModelOutputError";
    this.problems = problems;
    this.raw = raw;
  }
}

/** The call happened but its telemetry row could not be written; the call's own error is `callError`. */
export class MeterRecordError extends Error {
  constructor(
    message: string,
    readonly callError?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MeterRecordError";
  }
}
