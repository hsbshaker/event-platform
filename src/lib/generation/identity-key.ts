import "server-only";

import { createHash } from "node:crypto";

import type { EventIdentityModelConfig } from "@/lib/ai/openai/event-identity";

/**
 * The deterministic identity of one EventIdentity attempt.
 *
 * `docs/phase-4b-plan.md §A.5`. The property that makes the whole claim mechanism work is that
 * **two requests that would send the same bytes to the model share a key**. A double-tap, a
 * refresh and a replayed POST all recompute the same basis and collide on the unique index, so
 * only one of them can reach the provider. A new clarification answer changes the answer id list,
 * so a genuine new round is a different key and a legitimately new paid call.
 *
 * Nothing here is random and nothing is supplied by the client.
 */

/** Everything that decides the bytes sent, beyond the prompt and the answers. */
export interface IdentityCallBasis {
  /** The host's own words, exactly as `events.prompt` holds them. That column is immutable. */
  prompt: string;
  /** Clarification answer ids in the order the assembly will render them. */
  clarificationAnswerIds: readonly string[];
  promptVersion: string;
  schemaVersion: string;
  inputAssemblyVersion: string;
  /**
   * Model configuration that changes the request without changing the three versions: the model
   * id, the reasoning effort, the service tier and whether the provider stores the response.
   *
   * Typed, not an open record: every option the request sends must be present, so a caller
   * cannot hand-roll a basis that omits the service tier and silently stop distinguishing a call
   * billed at twice the rate. Build it with `eventIdentityModelConfig()`. Its presence is why a
   * rolling deploy mid-flight produces a different key — which the one-in-flight guard, not the
   * key, is what contains (§A.5 row 7b).
   */
  modelConfig: EventIdentityModelConfig;
}

/**
 * Length-prefixed so no field can impersonate a boundary.
 *
 * A plain separator would let a prompt ending in the delimiter and an empty answer list hash the
 * same as a shorter prompt and a populated one. Cheap to avoid, and this hash decides whether
 * money is spent twice.
 */
const sha256 = (parts: readonly string[]): string => {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update(String(part.length));
    h.update(":");
    h.update(part);
  }
  return h.digest("hex");
};

/**
 * Canonical, so key stability does not depend on object key order.
 *
 * Keys and values are hashed as separate length-prefixed parts rather than joined with `=`:
 * otherwise `{a: "b=c"}` and `{"a=b": "c"}` produce the same digest, which is the same collision
 * `sha256` length-prefixes to avoid one level up. A collision here means two different model
 * configurations share an attempt key, so one of them is never paid for.
 */
export function modelConfigDigest(config: Record<string, string | number | boolean>): string {
  const parts = Object.entries(config)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // Typed so `false` and `"false"` cannot collide: a boolean option flipping must change the
    // digest, and stringifying alone would let a string-valued twin impersonate it.
    .flatMap(([k, v]) => [k, `${typeof v}:${String(v)}`]);
  return sha256(parts);
}

export function basisDigest(basis: IdentityCallBasis): string {
  return sha256([
    basis.prompt,
    // Order is part of the basis: the assembly renders answers chronologically (CA-5), so a
    // different order is a different request even with the same ids.
    basis.clarificationAnswerIds.join(","),
    basis.promptVersion,
    basis.schemaVersion,
    basis.inputAssemblyVersion,
    modelConfigDigest(basis.modelConfig),
  ]);
}

export function attemptKey(eventId: string, digest: string, attemptOrdinal: number): string {
  if (!Number.isInteger(attemptOrdinal) || attemptOrdinal < 0) {
    throw new Error(`attemptOrdinal must be a non-negative integer, got ${attemptOrdinal}`);
  }
  return sha256([eventId, "event_identity", digest, String(attemptOrdinal)]);
}
