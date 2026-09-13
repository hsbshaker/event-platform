"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RateLimitedError } from "@/lib/auth/errors";
import { getCurrentUser } from "@/lib/auth/session";
import { claimDraftForUser, ensureDraft, getDraft, MAX_PROMPT_LENGTH } from "@/lib/drafts/store";
import { signInspiration, type InspirationPreview } from "@/lib/drafts/inspiration";

/**
 * Composer server actions (spec.md §7.1, §7.2).
 *
 * Saving the prompt is the only thing `Create my event` does before authentication: no model
 * is called and no event exists yet (§32 #4). A signed-in visitor who submits the composer
 * skips the sign-in step and goes straight to their new event.
 */

async function requesterIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export interface ComposerState {
  prompt: string;
  inspiration: InspirationPreview[];
  expiresAt: string | null;
}

/** The draft this browser owns, with signed thumbnails, for restoring the composer. */
export async function loadComposerState(): Promise<ComposerState> {
  const draft = await getDraft();
  if (!draft) return { prompt: "", inspiration: [], expiresAt: null };
  return {
    prompt: draft.prompt,
    inspiration: await signInspiration(draft.inspiration),
    expiresAt: draft.expiresAt,
  };
}

export type SaveDraftResult = { ok: true; hasInspiration: boolean } | { ok: false; error: string };

/** Persists the prompt as the user writes, so nothing depends on the submit click landing. */
export async function saveDraft(prompt: string): Promise<SaveDraftResult> {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return { ok: false, error: "Describe your event to continue." };
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_PROMPT_LENGTH} characters.` };
  }
  try {
    const draft = await ensureDraft({ prompt: trimmed, ip: await requesterIp() });
    return { ok: true, hasInspiration: draft.inspiration.length > 0 };
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { ok: false, error: "That is a lot of saving. Try again in a few minutes." };
    }
    throw error;
  }
}

/**
 * `Create my event ✦`. Saves the prompt, then sends the visitor to sign in, or, when they are
 * already signed in, claims the draft immediately so they never see an auth step they do not
 * need. The claim itself is idempotent (see the auth callback).
 */
export async function createEvent(prompt: string): Promise<{ ok: false; error: string } | never> {
  const saved = await saveDraft(prompt);
  if (!saved.ok) return saved;

  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const claim = await claimDraftForUser(user.id);
  if (claim.eventId) redirect(`/events/${claim.eventId}/create`);
  redirect(claim.outcome === "claimed_by_other" ? "/?restore=taken" : "/?restore=expired");
}
