import "server-only";

import { headers } from "next/headers";

/**
 * The requester's IP address for abuse limits (`spec.md §10`, §27), or null when the request
 * carries none. On Vercel the first `x-forwarded-for` entry is the client. Used only as a
 * rate-limit key, which `consumeRateLimit` hashes before storing; never logged.
 */
export async function requesterIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return h.get("x-real-ip");
}
