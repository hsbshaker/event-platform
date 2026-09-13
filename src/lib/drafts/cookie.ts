import "server-only";

import { cookies } from "next/headers";
import { DRAFT_TTL_MS, isWellFormedDraftToken } from "./token";

/**
 * The pre-auth draft token cookie (spec.md §7.2 step 3: "lightweight client state needed to
 * restore the composer").
 *
 * `sameSite: "lax"` is what carries the token back through the OAuth top-level redirect;
 * `httpOnly` keeps it out of reach of page scripts. The cookie holds the opaque token only:
 * the prompt and the inspiration references live server-side, keyed by the token's hash.
 */
export const DRAFT_COOKIE = "ep_draft";

export async function readDraftToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(DRAFT_COOKIE)?.value;
  return isWellFormedDraftToken(value) ? value : null;
}

export async function writeDraftToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(DRAFT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DRAFT_TTL_MS / 1000),
  });
}

export async function clearDraftToken(): Promise<void> {
  const store = await cookies();
  store.set(DRAFT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
