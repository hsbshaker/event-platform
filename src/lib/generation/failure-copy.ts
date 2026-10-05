/**
 * What the host is told when a card generation fails, and the copyright step-back note
 * (`spec.md §7.6`, §7.10, §10; `docs/screen-spec.md` `generation`; `docs/design-system.md §12.2`,
 * §12.3, §13.2).
 *
 * Every code a generation can end with, or a start can be refused with, maps to plain product
 * language: an honest failure with a retry where a retry can help, never a provider or model name,
 * never a technical term, never blame on the host, never a limit or a counter (`spec.md §10`,
 * §32 #42). Unknown codes read as the generic failure. Pure and isomorphic.
 *
 * Sources of the codes:
 * - stage failures (`stage.ts` `StageFailureCode`): `invalid_output`, `provider_error`,
 *   `artwork_invalid`, `provider_refusal` (the image provider refused the step-back too);
 * - meter refusals (`src/lib/ai/errors.ts` `ModelCallRefusal`, recorded by `run.server.ts`):
 *   `disabled`, `ceiling`, `not_running`, `invalid_context`, `deadline`;
 * - the orchestration (`run.server.ts`): `internal`, `unsupported_kind`, `published`;
 * - the database: `stale` (a dead worker taken over by `start_generation`), `published`
 *   (`heartbeat_generation` after a publish);
 * - the wait surface's read (`status.server.ts`): `stopped` (a worker past its lifetime);
 * - refused starts (`start_generation` outcomes, no generation row): `event_cap`, `host_cap`.
 */

export const GENERATION_FAILURE_CODES = [
  "invalid_output",
  "provider_error",
  "artwork_invalid",
  "provider_refusal",
  "disabled",
  "ceiling",
  "not_running",
  "invalid_context",
  "deadline",
  "internal",
  "unsupported_kind",
  "published",
  "stale",
  "stopped",
  "event_cap",
  "host_cap",
] as const;

export type GenerationFailureCode = (typeof GENERATION_FAILURE_CODES)[number];

export interface GenerationFailure {
  /** The failure's kind, one of `GENERATION_FAILURE_CODES` (`internal` for an unknown code). */
  code: GenerationFailureCode;
  title: string;
  body: string;
  /** Whether to offer `Try again` now: false when trying again now cannot succeed. */
  retry: boolean;
}

type Copy = Omit<GenerationFailure, "code">;

const SOMETHING_WENT_WRONG: Copy = {
  title: "We couldn't finish your card",
  body: "Something went wrong on our side while we were making it. Your details are safe — try again and we'll make it fresh.",
  retry: true,
};

const STOPPED_PARTWAY: Copy = {
  title: "Your card stopped partway",
  body: "We lost our place while making your card. Your details are safe — try again and we'll carry on.",
  retry: true,
};

const COME_BACK_TOMORROW: Copy = {
  title: "That's a lot of designs for one day",
  body: "Your event and every card so far are saved. Come back tomorrow and we'll make another.",
  retry: false,
};

const COPY: Readonly<Record<GenerationFailureCode, Copy>> = {
  invalid_output: SOMETHING_WENT_WRONG,
  provider_error: {
    title: "We couldn't finish your card",
    body: "Something on our side didn't answer in time. Your details are safe — try again in a moment.",
    retry: true,
  },
  artwork_invalid: {
    title: "The artwork wasn't right",
    body: "The artwork we painted didn't meet our standard for your card, so we didn't show it. Try again and we'll paint a fresh one.",
    retry: true,
  },
  provider_refusal: {
    title: "We need a fresh take",
    body: "Our take kept coming out too close to a well-known character, so for copyright reasons we couldn't use it. Try again and we'll take a fresh approach to its world.",
    retry: true,
  },
  disabled: {
    title: "New designs are paused",
    body: "We've paused new card designs for a little while. Your event and details are saved — please come back soon.",
    retry: false,
  },
  ceiling: {
    title: "We're very busy right now",
    body: "We're making a lot of invitations at the moment. Your event and details are saved — please try again a little later.",
    retry: false,
  },
  not_running: STOPPED_PARTWAY,
  invalid_context: SOMETHING_WENT_WRONG,
  deadline: {
    title: "Your card took too long",
    body: "Making your card took longer than it should, so we stopped. Your details are safe — try again.",
    retry: true,
  },
  internal: SOMETHING_WENT_WRONG,
  unsupported_kind: SOMETHING_WENT_WRONG,
  published: {
    title: "Your invitation is published",
    body: "Once an invitation is published its card stays as it is, so we stopped making a new one.",
    retry: false,
  },
  stale: STOPPED_PARTWAY,
  stopped: STOPPED_PARTWAY,
  event_cap: COME_BACK_TOMORROW,
  host_cap: COME_BACK_TOMORROW,
};

function isKnown(code: string): code is GenerationFailureCode {
  return (GENERATION_FAILURE_CODES as readonly string[]).includes(code);
}

/** The host-facing failure for a generation's `error_code` (or a refused start's outcome). */
export function generationFailure(code: string | null | undefined): GenerationFailure {
  const known: GenerationFailureCode = code && isKnown(code) ? code : "internal";
  return { code: known, ...COPY[known] };
}

/**
 * The note shown while the step-back design and artwork generate, after the image provider refused
 * a brand or character homage (`docs/screen-spec.md` `generation`, "Copyright step-back").
 */
export const COPYRIGHT_STEP_BACK_NOTICE =
  "That first take came out too close to a well-known character, so for copyright reasons we're trying a fresh take on its world.";

/** The notice the orchestration records for the step-back (`run.server.ts`, `artifacts.notice`). */
export const PROVIDER_REFUSAL_NOTICE = "provider_refusal";

/** The wait surface's note for a recorded notice, or null for none (or one it does not know). */
export function generationNotice(notice: unknown): string | null {
  return notice === PROVIDER_REFUSAL_NOTICE ? COPYRIGHT_STEP_BACK_NOTICE : null;
}
