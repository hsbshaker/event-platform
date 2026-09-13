import "server-only";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClaimOutcome } from "@/lib/supabase/database.types";
import { enforceRateLimit, type RateLimitRule } from "@/lib/auth/rate-limit";
import { clearDraftToken, readDraftToken, writeDraftToken } from "./cookie";
import { generateDraftToken, hashDraftToken } from "./token";

/**
 * Server-side lifecycle of the pre-auth draft (spec.md §7.2).
 *
 * `pre_auth_event_drafts` is a server-only table: it carries no RLS policy and no grant for
 * `anon`/`authenticated`, so every read and write here goes through the service-role client
 * after this module has resolved the caller's opaque cookie token to its stored hash. The
 * plaintext token is never stored and never leaves the cookie.
 */

/** Anonymous draft writes, per requester IP (spec.md §10 anti-abuse rate limits). */
export const DRAFT_WRITES_PER_IP: RateLimitRule = {
  bucket: "draft:write:ip",
  windowSeconds: 3600,
  max: 60,
};

export const MAX_PROMPT_LENGTH = 4000;

export interface DraftInspiration {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PreAuthDraft {
  id: string;
  prompt: string;
  composerState: Record<string, unknown> | null;
  expiresAt: string;
  inspiration: DraftInspiration[];
}

function tokenHashHex(token: string): string {
  return `\\x${hashDraftToken(token, serverEnv().APP_ENCRYPTION_KEY).toString("hex")}`;
}

/**
 * The draft this browser owns, or null when there is no cookie, the token is unknown, the
 * draft expired, or it has already been claimed. Claimed drafts are deliberately invisible
 * here so a stale cookie cannot resurrect a finished composer session.
 */
export async function getDraft(): Promise<PreAuthDraft | null> {
  const token = await readDraftToken();
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pre_auth_event_drafts")
    .select("id, prompt, composer_state, expires_at, claimed_at")
    .eq("draft_token_hash", tokenHashHex(token))
    .maybeSingle();
  if (error) throw error;
  if (!data || data.claimed_at !== null) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const { data: assets, error: assetError } = await admin
    .from("inspiration_assets")
    .select("id, storage_key, mime_type, size_bytes, created_at")
    .eq("pre_auth_draft_id", data.id)
    .order("created_at", { ascending: true });
  if (assetError) throw assetError;

  return {
    id: data.id,
    prompt: data.prompt,
    composerState: (data.composer_state as Record<string, unknown> | null) ?? null,
    expiresAt: data.expires_at,
    inspiration: (assets ?? []).map((a) => ({
      id: a.id,
      storageKey: a.storage_key,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      createdAt: a.created_at,
    })),
  };
}

export interface EnsureDraftInput {
  prompt: string;
  composerState?: Record<string, unknown> | null;
  /** Requester IP for throttling; pass null only where no address is available. */
  ip: string | null;
}

/**
 * Creates the draft on first use and updates the prompt afterwards, returning the draft the
 * browser now owns. The prompt is stored exactly as typed, trimmed only of surrounding
 * whitespace: restoring it altered would be the failure §7.2 calls critical.
 */
export async function ensureDraft(input: EnsureDraftInput): Promise<PreAuthDraft> {
  const prompt = input.prompt.trim();
  if (prompt.length === 0) throw new Error("A prompt is required to save a draft.");
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`The prompt may be at most ${MAX_PROMPT_LENGTH} characters.`);
  }
  if (input.ip) await enforceRateLimit(DRAFT_WRITES_PER_IP, input.ip);

  const admin = createAdminClient();
  const existing = await getDraft();
  const composerState = input.composerState ?? null;

  if (existing) {
    const { error } = await admin
      .from("pre_auth_event_drafts")
      .update({ prompt, composer_state: composerState })
      .eq("id", existing.id)
      .is("claimed_at", null);
    if (error) throw error;
    return { ...existing, prompt, composerState };
  }

  const token = generateDraftToken();
  const { data, error } = await admin
    .from("pre_auth_event_drafts")
    .insert({
      draft_token_hash: tokenHashHex(token),
      prompt,
      composer_state: composerState,
    })
    .select("id, expires_at")
    .single();
  if (error) throw error;
  await writeDraftToken(token);
  return {
    id: data.id,
    prompt,
    composerState,
    expiresAt: data.expires_at,
    inspiration: [],
  };
}

export interface ClaimResult {
  outcome: ClaimOutcome;
  eventId: string | null;
}

/**
 * Attaches this browser's draft to the authenticated owner (spec.md §7.2 step 5).
 *
 * All of the decision making is inside `claim_pre_auth_draft`, which takes a row lock, so
 * concurrent or retried auth callbacks with the same token converge on a single event rather
 * than racing to create two. The cookie is cleared for every terminal outcome; only a caller
 * with no cookie at all gets `not_found` without a database round trip.
 */
export async function claimDraftForUser(userId: string): Promise<ClaimResult> {
  const token = await readDraftToken();
  if (!token) return { outcome: "not_found", eventId: null };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_pre_auth_draft", {
    p_token_hash: tokenHashHex(token),
    p_user_id: userId,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : undefined;
  const outcome: ClaimOutcome = row?.outcome ?? "not_found";
  const eventId = row?.event_id ?? null;

  // The token has done its job (or can never do it): never leave it to be replayed.
  await clearDraftToken();
  return { outcome, eventId };
}
