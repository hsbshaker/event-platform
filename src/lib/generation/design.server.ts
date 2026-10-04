import "server-only";

import { ModelCallRefusedError, ModelOutputError, ProviderCallError } from "@/lib/ai/errors";
import type { EventIdentity } from "@/lib/ai/event-identity";
import type { GenerateCardDesignInput, PreviousDirection } from "@/lib/ai/provider";
import { validateCardDesign } from "@/lib/card/design";
import type { CardDesign } from "@/lib/card/design";
import type { WordingSlotId } from "@/lib/card/slots";
import { checkWording, standardWording } from "@/lib/card/wording";
import type { WordingFailure } from "@/lib/card/wording";

import { GenerationStageError } from "./stage";
import type { StageContext } from "./stage";

/**
 * Stage 2: the card design (`spec.md §7.7`, §7.9 steps 1–3; `docs/card-system.md §3`, §4.1;
 * `docs/model-contracts.md §5.2`–§5.4, §9).
 *
 * `generateCardDesign` reads the persisted identity and the facts present so far, never the raw
 * prompt. Its output then passes, in order, three deterministic checks, each of which earns at most
 * one re-prompt of its own kind (`docs/model-contracts.md §5.3`):
 *
 * 1. **Schema and catalogs** (`validateCardDesign`, with the identity's compatible typography
 *    categories). Output the provider already found schema-invalid (`ModelOutputError`) counts the
 *    same. One `schema` re-prompt with the problems; a second invalid output is a visible failure
 *    (`GenerationStageError`, stage `design`, `invalid_output`) — unless an earlier call of this
 *    stage produced a valid design, which is then accepted with its remaining issues resolved by
 *    their own fallbacks below rather than discarded.
 * 2. **Wording fact check** (`checkWording`) on model-drafted wording only: a host-supplied title
 *    (`eventFacts.title`) is used verbatim and never checked. One `wording` re-prompt naming the
 *    failing slots; if they fail again, each failing slot takes `standardWording`, recorded in
 *    `standardWordingSlots`.
 * 3. **Direction distinctness**: the same layout, art mode and primary pairing as an earlier
 *    direction earns one `repeat-direction` re-prompt naming the earlier directions; a second
 *    repeat is accepted and recorded (`repeatAccepted`).
 *
 * A provider failure (after the provider's own transient retry) is a visible failure
 * (`provider_error`), again unless a valid design is already in hand. Meter refusals pass through.
 * Nothing is persisted here.
 */

/** The re-prompt kinds this stage sends; `provider-refusal` comes from the orchestration. */
export type DesignRepromptKind = NonNullable<GenerateCardDesignInput["reprompt"]>["kind"];

export interface DesignStageInput {
  identity: EventIdentity;
  /**
   * The event facts present so far, host-supplied or host-confirmed (`docs/model-contracts.md
   * §5.2`). A non-blank `title` is the host's title: the design uses it verbatim.
   */
  eventFacts: Record<string, string>;
  /** Try another direction: every earlier direction for this event, and the host's feedback. */
  previousDirections?: PreviousDirection[];
  feedback?: string;
  /**
   * The previous design's artwork was refused by the image provider (`spec.md §7.6`): the first
   * call carries a `provider-refusal` re-prompt with this feedback.
   */
  providerRefusal?: { feedback: string };
}

export interface DesignAttempt {
  /** The re-prompt this call carried, or null for the first call. */
  reprompt: DesignRepromptKind | null;
  /** The raw response, as returned ("" when the call failed without output). */
  raw: string;
  /** Passed schema and catalog validation. */
  valid: boolean;
}

/** What the wait surface may show once the design resolves (`spec.md §7.10`). */
export interface DesignArtifacts {
  name: string;
  description: string;
  /** The art direction in words; never the palette's hex values. */
  artDirection: {
    subject: string;
    medium: string;
    mood: string;
    palette: string;
    texture: string;
  };
}

export interface DesignTelemetry {
  /** The first call's output passed schema and catalog validation (`spec.md §9.5`). */
  schemaValidFirstCall: boolean;
  /** Every re-prompt sent, in order; at most one of each kind. */
  reprompts: { kind: DesignRepromptKind; feedback: string }[];
  /** Slots that fell back to standard wording. */
  standardWordingSlots: WordingSlotId[];
  /** The accepted design repeats an earlier direction (after its one re-prompt, or a fallback). */
  repeatAccepted: boolean;
  /** A later call failed and an earlier valid design was accepted instead. */
  acceptedEarlierDesign: boolean;
  /** The host's title replaced what the model put in `title`. */
  hostTitleApplied: boolean;
}

export interface DesignStageResult {
  /** The validated design, with the host's title and any standard wording applied. */
  design: CardDesign;
  /** The accepted design's raw response, as returned (persisted as `card_designs.raw`). */
  raw: string;
  /** Every call, in order. */
  attempts: DesignAttempt[];
  telemetry: DesignTelemetry;
  artifacts: DesignArtifacts;
}

interface Candidate {
  design: CardDesign;
  raw: string;
  wordingFailures: WordingFailure[];
  repeats: PreviousDirection | null;
}

type CallOutcome =
  | { ok: true; candidate: Candidate }
  | { ok: false; invalid: true; problems: string[]; error: unknown }
  | { ok: false; invalid: false; error: unknown };

function describeDirection(d: PreviousDirection): string {
  return `"${d.name}" (layout ${d.layout}, art mode ${d.artMode}, primary pairing ${d.primary})`;
}

function wordingFeedback(failures: readonly WordingFailure[]): string {
  const slots = [...new Set(failures.map((f) => f.slot))];
  return (
    `Rewrite ${slots.join(" and ")}: ${failures.map((f) => f.reason).join("; ")}. ` +
    "Model-drafted wording never states a date, weekday, month, time, number, place or other fact."
  );
}

function repeatFeedback(repeat: PreviousDirection, all: readonly PreviousDirection[]): string {
  return (
    `This design repeats the earlier direction ${describeDirection(repeat)}: the same layout, art ` +
    `mode and primary pairing. Earlier directions: ${all.map(describeDirection).join("; ")}. ` +
    "Design a genuinely different direction."
  );
}

function hostTitleOf(eventFacts: Record<string, string>): string | null {
  const title = eventFacts.title?.trim();
  return title ? title : null;
}

export async function runDesignStage(
  ctx: StageContext,
  input: DesignStageInput,
): Promise<DesignStageResult> {
  const previous = input.previousDirections ?? [];
  const hostTitle = hostTitleOf(input.eventFacts);
  const hostSupplied: WordingSlotId[] = hostTitle ? ["title"] : [];

  const base: GenerateCardDesignInput = {
    eventIdentity: input.identity,
    eventFacts: input.eventFacts,
    ...(previous.length ? { previousDirections: previous } : {}),
    ...(input.feedback ? { feedback: input.feedback } : {}),
  };

  const attempts: DesignAttempt[] = [];
  const reprompts: DesignTelemetry["reprompts"] = [];
  const used = new Set<DesignRepromptKind>();

  async function call(reprompt: GenerateCardDesignInput["reprompt"]): Promise<CallOutcome> {
    let output: CardDesign;
    let raw: string;
    try {
      const result = await ctx.provider.generateCardDesign(ctx.meter, {
        ...base,
        ...(reprompt ? { reprompt } : {}),
      });
      output = result.output;
      raw = result.raw;
    } catch (error) {
      if (error instanceof ModelCallRefusedError) throw error;
      if (error instanceof ModelOutputError) {
        attempts.push({ reprompt: reprompt?.kind ?? null, raw: error.raw, valid: false });
        return { ok: false, invalid: true, problems: error.problems, error };
      }
      if (error instanceof ProviderCallError) {
        attempts.push({ reprompt: reprompt?.kind ?? null, raw: "", valid: false });
        return { ok: false, invalid: false, error };
      }
      throw error;
    }
    const validation = validateCardDesign(output, {
      compatibleCategories: input.identity.compatibleTypographyCategories,
    });
    attempts.push({ reprompt: reprompt?.kind ?? null, raw, valid: validation.ok });
    if (!validation.ok) {
      return { ok: false, invalid: true, problems: validation.problems, error: null };
    }
    const design = validation.design;
    const repeats =
      previous.find(
        (p) =>
          p.layout === design.layout &&
          p.artMode === design.artMode &&
          p.primary === design.typography.primary,
      ) ?? null;
    return {
      ok: true,
      candidate: {
        design,
        raw,
        wordingFailures: checkWording(design.wording, input.eventFacts, { hostSupplied }),
        repeats,
      },
    };
  }

  let reprompt: GenerateCardDesignInput["reprompt"] = input.providerRefusal
    ? { kind: "provider-refusal", feedback: input.providerRefusal.feedback }
    : undefined;
  if (reprompt) {
    used.add(reprompt.kind);
    reprompts.push(reprompt);
  }
  let schemaValidFirstCall: boolean | null = null;
  let lastValid: Candidate | null = null;

  const next = (kind: DesignRepromptKind, feedback: string) => {
    used.add(kind);
    reprompt = { kind, feedback };
    reprompts.push(reprompt);
  };

  for (;;) {
    const outcome = await call(reprompt);
    schemaValidFirstCall ??= outcome.ok;
    if (!outcome.ok) {
      if (outcome.invalid && !used.has("schema")) {
        next("schema", outcome.problems.join("; "));
        continue;
      }
      if (lastValid) return finish(lastValid, true);
      throw outcome.invalid
        ? new GenerationStageError(
            "design",
            "invalid_output",
            "Card design output was invalid twice.",
            {
              cause: outcome.error ?? undefined,
            },
          )
        : new GenerationStageError("design", "provider_error", "Card design call failed.", {
            cause: outcome.error,
          });
    }
    const candidate = outcome.candidate;
    lastValid = candidate;
    if (candidate.wordingFailures.length && !used.has("wording")) {
      next("wording", wordingFeedback(candidate.wordingFailures));
      continue;
    }
    if (candidate.repeats && !used.has("repeat-direction")) {
      next("repeat-direction", repeatFeedback(candidate.repeats, previous));
      continue;
    }
    return finish(candidate, false);
  }

  function finish(candidate: Candidate, acceptedEarlierDesign: boolean): DesignStageResult {
    const wording = { ...candidate.design.wording };
    const hostTitleApplied = hostTitle !== null && wording.title !== hostTitle;
    if (hostTitle) wording.title = hostTitle;
    const standardWordingSlots = [...new Set(candidate.wordingFailures.map((f) => f.slot))];
    if (standardWordingSlots.length) {
      const standard = standardWording(input.eventFacts.eventType ?? "");
      for (const slot of standardWordingSlots) wording[slot] = standard[slot];
    }
    const design: CardDesign = { ...candidate.design, wording };
    const brief = design.artBrief;
    return {
      design,
      raw: candidate.raw,
      attempts,
      telemetry: {
        schemaValidFirstCall: schemaValidFirstCall ?? false,
        reprompts,
        standardWordingSlots,
        repeatAccepted: candidate.repeats !== null,
        acceptedEarlierDesign,
        hostTitleApplied,
      },
      artifacts: {
        name: design.presentation.name,
        description: design.presentation.description,
        artDirection: {
          subject: brief.subject,
          medium: brief.medium,
          mood: brief.mood,
          palette: brief.palette.description,
          texture: brief.texture,
        },
      },
    };
  }
}
