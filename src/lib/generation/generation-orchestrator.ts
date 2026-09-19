import "server-only";

import { after } from "next/server";

import { requireEventAccess } from "@/lib/auth/event-access";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { artworkStageDepsForBatch } from "./artwork-enablement";
import { latestBatch } from "./batch";
import { runConceptBatch } from "./concept-batch";
import { readGenerationState } from "./generation-state";
import type { GenerationView } from "./generation-view";

/**
 * Starting concept generation, durably.
 *
 * The sibling of `identity-orchestrator.ts`'s two entry points, and built on its rule: **a start
 * may spend; a read never does.** `readGenerationState` is the poll and lives next door; this file
 * is the one thing that can begin a paid batch.
 *
 * # What makes this durable
 *
 * Nothing here holds the batch. `runConceptBatch` writes its own rows as it goes — the batch, the
 * three sibling rows, each DesignIntent artifact, each concept, each verified spec, each artwork
 * slot — so the state a reload reads is the database's, not a request's. The request that started
 * the work is not privileged: it can be closed, the tab can be shut, the serverless instance can
 * be recycled, and the next read still answers from the rows that landed.
 *
 * That is also why the work is scheduled with `after()` rather than awaited. Awaiting it would
 * make the host's start request hold open for the whole batch — measured at ~87s — and a client
 * that gave up would look, to itself, like a failure that had in fact succeeded. `spec.md §7.10`'s
 * per-concept readiness is only observable if the surface can poll while the work runs.
 *
 * **No new infrastructure.** `after()` is Next.js' own post-response hook on the locked stack
 * (`CLAUDE.md §3`): no queue, no worker service, no realtime channel, no cron doing the work.
 *
 * # What is deliberately not here
 *
 * No cap, no ceiling, no idempotency key and no claim. Those are `batch.ts`'s and Phase 4B's, they
 * are enforced inside `plan_generation_batch`'s transaction and by
 * `generation_batches_one_in_flight`, and a second opinion about whether money may be spent is how
 * it gets spent twice. The in-flight check below is a **courtesy**, not a control: it saves a
 * pointless scheduling, and if it races, the database refuses the second batch and
 * `planConceptBatchForEvent` returns `observed`.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)" and
 * "The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * fabricated progress or completion percentages (§7.10)". Guardrails: `spec.md §32 #41`.
 */

type Admin = SupabaseClient<Database>;

export interface StartConceptGenerationOptions {
  /**
   * The host pressed a button that means *do it again*, and the batch it is aimed at has settled.
   *
   * Threaded straight through to `planConceptBatchForEvent`'s `newRound`, which is the only thing
   * that makes a settled batch plannable rather than observable. Without it a start that arrives
   * after a batch has settled observes that batch and buys nothing — correct for a reload, a
   * refresh or an ordinary resume, and wrong for a host who has been shown a **Try again** button.
   *
   * **Retry after a failed batch is a new round. That is a recorded product decision, not a
   * derivation.** Canon does not settle it: `spec.md §7.9` defines `Try another direction` as a
   * new round and says nothing about retrying a batch that failed. The decision is safe because
   * `stage: "failed"` is only reached when *no* concept is previewable (`generation-state.ts`'s
   * `generationStage`), so a new round discards nothing a host could still look at. Resuming the
   * failed batch's unfinished siblings instead would be cheaper — `resumableSiblings` in
   * `batch.ts` exists for it — but nothing is wired to it, and wiring it is a larger change than
   * this defect warrants.
   *
   * A retry is a round like any other: it passes through the ceiling, the event cap, the account
   * cap and the rate limit inside `plan_generation_batch`'s transaction, and a refusal there is a
   * refusal here.
   */
  explicitRetry?: boolean;
}

/**
 * Start a concept batch for this event, or observe the one already running.
 *
 * Returns the state **as it stands at the moment of the call** — which is the only thing it can
 * honestly return. A batch that has just been scheduled has written no rows yet, and inventing a
 * stage for it would be the fabricated progress `spec.md §31` forbids. The surface polls
 * `readGenerationState`, which reports the batch the instant `plan_generation_batch` commits, and
 * bounds its own wait so a start that never took is shown rather than spun on (`spec.md §32 #45`).
 *
 * Refusals are silent by design and all look identical: no authoritative identity and a batch
 * already in flight both come back as the current state with `canStart: false`. Which control
 * declined stays server-side (`spec.md §32 #41`), and the state is a better answer than a reason —
 * it is what the surface would render anyway.
 *
 * Calling it twice is safe. Both calls schedule, both reach `plan_generation_batch`, one wins the
 * partial unique index and the other is told `in_flight` — so the second buys nothing.
 */
export async function startConceptGeneration(
  admin: Admin,
  eventId: string,
  options: StartConceptGenerationOptions = {},
): Promise<GenerationView> {
  // `generate_event_identity`, and deliberately not a new capability.
  //
  // `src/lib/auth/permissions.ts` has three candidates and all three are `PRE_PUBLISH_ONLY` and
  // open to owner and co-host alike, so they differ only in what they *mean*.
  // `generate_redesign_concepts` means `spec.md §8.2`'s redesign — a round against an already
  // selected concept — and `browse_select_concepts` is reading and choosing, not generating. This
  // is the first interpretation's own continuation: the batch is planned from the identity
  // revision, it is refused outright without an authoritative one, and it is the same act of
  // generation the host authorized when they asked for their site. Inventing a fourth capability
  // would add a permission nobody can administer separately from this one, which `spec.md §25`'s
  // table does not ask for.
  const access = await requireEventAccess(eventId, "generate_event_identity");

  // Also the recovery step: a batch whose process died is failed and settled here, before anything
  // decides whether a new one may start. Without it the one-in-flight index would refuse this
  // event for ever.
  const state = await readGenerationState(admin, eventId);

  // `canStart` is false for exactly two reasons — a batch is in flight, or there is no
  // authoritative identity to plan from — and both mean "not now". Read from the projection rather
  // than re-derived, so the answer the surface was given and the answer acted on are the same one.
  if (!state.canStart) return state;

  // Scheduled, never awaited. `after()` runs the callback once the response has been sent; the
  // batch's own rows are what the next read sees.
  // No artwork. `docs/technology-decisions.md §8` records the image-model decision as open, so
  // nothing in production authorizes a live run — and a concept whose reservations are never
  // filled renders from the same verified spec (`spec.md §7.6a #1`). Resolved through the factory
  // rather than by omitting the field, so the one place that can enable it is the one place that
  // says no.
  const artwork = artworkStageDepsForBatch(admin, { authorized: false });

  after(async () => {
    try {
      await runConceptBatch(admin, {
        eventId,
        // Caps are per acting account, not per owner (`spec.md §6`).
        userId: access.user.id,
        // Never inferred from the state. An ordinary start leaves this unset, so a refresh or a
        // reconnect observes whatever batch exists; only the host's own **Try again** sets it.
        ...(options.explicitRetry === true ? { newRound: true } : {}),
        ...(artwork ? { artwork } : {}),
      });
    } catch (error) {
      // The host is never told through this path: the request has already been answered, and the
      // next poll reports whatever rows exist. A batch that throws past `runConceptBatch`'s own
      // handling leaves its siblings non-terminal, and the stale-batch recovery on the read path
      // is what releases the event.
      console.error("generation: concept batch failed", error);
    }
  });

  return state;
}

/**
 * The poll. Recovers, never spends.
 *
 * `browse_select_concepts`, not `view_event`, although `readEventIdentity` uses the latter. The
 * difference is what the two reads return. An identity is the event's own interpretation; this
 * returns the *set of unselected concepts* — three names, three palettes, three visual
 * vocabularies, two of which the host will never choose. That is the host's material while they
 * are deciding, and `view_event` is in `GUEST_ALLOWED`.
 *
 * It is also `PRE_PUBLISH_ONLY`, which is the behaviour `spec.md §25` asks for: "after publish, AI
 * generation and concept switching are disabled for both". A surface for choosing among concepts
 * has nothing to say once the choice is made and the site is live, so it closes rather than
 * outliving its purpose. A caller that loses access after publish gets the same refusal any other
 * withdrawn capability gives, and the create page already renders that as an absent panel.
 */
export async function readConceptGeneration(
  admin: Admin,
  eventId: string,
): Promise<GenerationView> {
  await requireEventAccess(eventId, "browse_select_concepts");
  return readGenerationState(admin, eventId);
}

/**
 * The round a preview must resolve against: this event's latest batch, whatever became of it.
 *
 * Separate from `readConceptGeneration` because the concept preview does not want a view — it
 * wants the one number that says which round `[index]` means. Resolving it from `design_concepts`
 * instead (the highest round that happens to hold a row at that index) is the defect this exists
 * to remove: once a second round exists, that reading can serve a superseded round's concept as
 * the current one, and a bookmarked `/concepts/1` would show a page the host has replaced.
 *
 * `null` when the event has never had a batch, which the caller renders as `notFound()`.
 *
 * `browse_select_concepts`, matching the preview route's own check and `readConceptGeneration`'s:
 * the round of an unselected concept set is part of the same pre-publish material, and it is
 * `PRE_PUBLISH_ONLY` for the same reason.
 */
export async function latestConceptRound(admin: Admin, eventId: string): Promise<number | null> {
  await requireEventAccess(eventId, "browse_select_concepts");
  const batch = await latestBatch(admin, eventId);
  return batch?.round ?? null;
}
