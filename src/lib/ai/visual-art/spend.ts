import "server-only";

/**
 * The spend gate. A request that cannot reserve does not happen.
 *
 * `docs/development-plan.md`, principle 4: *"Spend controls ship with the first production model
 * call, not in hardening. The proof hit an organisation spend ceiling mid-run."* Artwork is the
 * first thing in this pipeline that spends **per asset** rather than per concept — a batch is
 * three concepts, each of which may want more than one artwork slot — so the multiplier a bug
 * gets here is larger than anywhere upstream, and the failure mode is a loop that keeps paying.
 *
 * # The shape: reserve first, then spend, then settle
 *
 * A caller opens one `ArtworkBatchBudget` per batch, with an explicit ceiling. Every request must
 * first `reserve()`, which debits the **worst case** for one request against that ceiling and
 * mints an `ArtworkReservation`. `generateVisualArt` will not call a provider without one. When
 * the request ends, `settle()` replaces the estimate with what was actually spent.
 *
 * Reserving the worst case up front and releasing the difference afterwards — rather than
 * charging actuals as they arrive — is the whole point. Actuals arrive *after* the money is gone,
 * so a ledger that waits for them can only ever report an overrun it already allowed. This one
 * refuses the request that *would* have caused it.
 *
 * # Three properties that are deliberately awkward
 *
 * **A reservation cannot be forged.** Its constructor is guarded by a module-private token, so
 * the only way to hold one is to have been given it by a budget that had room. A caller that
 * could write `{ estimateUsd: 0 }` and pass it along would have a spend gate made of a type
 * annotation.
 *
 * **A reservation is single-use and belongs to its budget.** Replaying one, or handing one budget's
 * reservation to another request, is refused rather than tolerated. Double-spend here is not an
 * abstract worry: a retry loop that re-used a reservation would be unbounded by construction.
 *
 * **An unknown cost settles at the full reservation.** A provider that reports no cost, or a
 * request that threw before it could report one, is charged the estimate — never zero. An attempt
 * that timed out may well have reached provider execution and been billed;
 * `src/lib/generation/composition-cost.ts` makes the same argument about attempts that threw
 * (*"it is **not** an attempt that cost nothing"*), and this ledger errs in the same direction.
 *
 * # There is no default ceiling here, and that is the decision
 *
 * `src/lib/generation/identity-spend.ts` refuses to run in production without an explicit
 * `IDENTITY_CEILING_USD`, because *"how much this product is willing to lose in a day is a
 * financial choice with a real owner, and inheriting a number a developer picked for local
 * convenience is not that choice being made — it is that choice being skipped."* The same holds
 * here and harder, because no image model is selected, so there is no verified rate to derive an
 * estimate from at all (`spec.md §7.6a`, `docs/technology-decisions.md`).
 *
 * So this module reads **no environment variable and carries no default**. Both numbers are
 * required arguments. Nothing in this repository can open a budget by accident, and there is no
 * configuration state under which one appears — which is half of the disabled-by-default
 * guarantee `./enablement.ts` states and `./boundary.test.ts` proves.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 * Guardrails: `spec.md §32 #41` (a backend counter is never exposed to a user).
 */

/** Only this module can mint a reservation. Not exported, deliberately. */
const MINT = Symbol("artwork-reservation-mint");

export type ArtworkBudgetRefusalReason =
  /** One more request at the per-request estimate would pass the batch ceiling. */
  | "ceiling_exceeded"
  /** The budget has been closed; a closed budget mints nothing. */
  | "budget_closed";

export interface ArtworkBudgetRefusal {
  readonly ok: false;
  readonly reason: ArtworkBudgetRefusalReason;
  /** One line, safe to log. Carries the numbers, because a refusal nobody can audit is a shrug. */
  readonly detail: string;
}

export interface ArtworkBudgetGrant {
  readonly ok: true;
  readonly reservation: ArtworkReservation;
}

export type ArtworkReserveResult = ArtworkBudgetGrant | ArtworkBudgetRefusal;

/**
 * Permission to make exactly one artwork request, for a known worst-case amount.
 *
 * Held by value and checked by identity: `generateVisualArt` asks the budget to consume it, and
 * the budget is the only thing that can say whether it is live, unspent and its own.
 */
export class ArtworkReservation {
  constructor(
    mint: symbol,
    readonly budgetId: string,
    readonly id: string,
    /** The worst case debited for this request, in USD. */
    readonly estimateUsd: number,
  ) {
    if (mint !== MINT) {
      throw new TypeError(
        "An ArtworkReservation is minted by ArtworkBatchBudget.reserve() and nowhere else. " +
          "Constructing one directly would be the spend gate consenting to be bypassed.",
      );
    }
  }
}

export interface ArtworkBudgetState {
  readonly batchCeilingUsd: number;
  readonly perRequestEstimateUsd: number;
  /** Outstanding reservations plus settled spend. Never decreases except by settlement. */
  readonly committedUsd: number;
  readonly settledUsd: number;
  readonly outstanding: number;
  readonly requestsReserved: number;
  readonly closed: boolean;
}

function requirePositiveUsd(name: string, value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number of USD`);
  }
}

/**
 * One batch's artwork spend ledger.
 *
 * "Batch" is `spec.md §7.7`'s batch — the three sibling concepts generated for one event from one
 * identity revision. The ceiling is per batch rather than per request because a per-request cap
 * bounds nothing: the runaway case is many requests, each individually reasonable.
 */
export class ArtworkBatchBudget {
  private committed = 0;
  private settled = 0;
  private reserved = 0;
  private closedFlag = false;
  private readonly live = new Map<string, { held: number; consumed: boolean }>();
  private sequence = 0;

  private constructor(
    readonly id: string,
    readonly batchCeilingUsd: number,
    readonly perRequestEstimateUsd: number,
  ) {}

  /**
   * Open a budget. Both numbers are required and neither has a default; see the module header.
   *
   * `perRequestEstimateUsd` is the **worst case for one logical request**, retries included — it
   * is what `reserve()` debits, so an estimate that describes only the happy path would let the
   * ceiling be passed by exactly the attempts a failure adds.
   */
  static open(policy: {
    id: string;
    batchCeilingUsd: number;
    perRequestEstimateUsd: number;
  }): ArtworkBatchBudget {
    if (typeof policy.id !== "string" || policy.id.trim() === "") {
      throw new TypeError("an artwork budget needs a non-empty id, so its spend is attributable");
    }
    requirePositiveUsd("batchCeilingUsd", policy.batchCeilingUsd);
    requirePositiveUsd("perRequestEstimateUsd", policy.perRequestEstimateUsd);
    if (policy.perRequestEstimateUsd > policy.batchCeilingUsd) {
      throw new TypeError(
        "perRequestEstimateUsd exceeds batchCeilingUsd: this budget could never grant a single " +
          "request, which is a configuration error rather than a very strict ceiling.",
      );
    }
    return new ArtworkBatchBudget(policy.id, policy.batchCeilingUsd, policy.perRequestEstimateUsd);
  }

  state(): ArtworkBudgetState {
    return {
      batchCeilingUsd: this.batchCeilingUsd,
      perRequestEstimateUsd: this.perRequestEstimateUsd,
      committedUsd: this.committed,
      settledUsd: this.settled,
      outstanding: this.live.size,
      requestsReserved: this.reserved,
      closed: this.closedFlag,
    };
  }

  /** Room for one more request at the per-request estimate. */
  canReserve(): boolean {
    return !this.closedFlag && this.committed + this.perRequestEstimateUsd <= this.batchCeilingUsd;
  }

  reserve(): ArtworkReserveResult {
    if (this.closedFlag) {
      return {
        ok: false,
        reason: "budget_closed",
        detail: `artwork budget ${this.id} is closed and grants no further requests`,
      };
    }
    const next = this.committed + this.perRequestEstimateUsd;
    if (next > this.batchCeilingUsd) {
      return {
        ok: false,
        reason: "ceiling_exceeded",
        detail:
          `artwork budget ${this.id} would commit $${next.toFixed(4)} against a ceiling of ` +
          `$${this.batchCeilingUsd.toFixed(4)}; the request was not made`,
      };
    }
    this.sequence += 1;
    this.reserved += 1;
    const reservation = new ArtworkReservation(
      MINT,
      this.id,
      `${this.id}#${this.sequence}`,
      this.perRequestEstimateUsd,
    );
    this.committed = next;
    this.live.set(reservation.id, { held: reservation.estimateUsd, consumed: false });
    return { ok: true, reservation };
  }

  /**
   * Take a reservation out of circulation, once.
   *
   * Called by `generateVisualArt` before the provider is reached. A reservation that is not this
   * budget's, or has already been consumed, is refused — the call then fails as
   * `invalid_request` without spending anything.
   */
  consume(reservation: ArtworkReservation): boolean {
    if (reservation.budgetId !== this.id) return false;
    const held = this.live.get(reservation.id);
    if (held === undefined || held.consumed) return false;
    held.consumed = true;
    return true;
  }

  /**
   * Replace a reservation's estimate with what the request actually cost.
   *
   * `actualUsd === null` means unknown, and unknown settles at the full estimate. An actual above
   * the estimate is recorded at its real value rather than clamped: a ledger that clamped would
   * report a ceiling being respected while it was being passed, and the next `reserve()` must see
   * the true committed total.
   */
  settle(reservation: ArtworkReservation, actualUsd: number | null): void {
    const entry = this.live.get(reservation.id);
    if (entry === undefined || reservation.budgetId !== this.id) {
      throw new TypeError(
        `artwork reservation ${reservation.id} is not outstanding on budget ${this.id}; ` +
          "settling it twice would release money that was never held",
      );
    }
    this.live.delete(reservation.id);
    const held = entry.held;
    const charged =
      actualUsd === null || !Number.isFinite(actualUsd) || actualUsd < 0 ? held : actualUsd;
    this.committed = this.committed - held + charged;
    this.settled += charged;
  }

  /** No further reservations. Outstanding ones may still settle. */
  close(): void {
    this.closedFlag = true;
  }
}
