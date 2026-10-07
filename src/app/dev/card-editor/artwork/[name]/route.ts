import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { DEV_CARD_DEFINITIONS, devArtworkBytes, isDevCardName } from "../../fixture.server";

/**
 * Development-only: a fixture card's artwork, the file's bytes unchanged (`image/png`, no
 * re-encoding, no resizing). 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ name: string }> }) {
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const { name } = await context.params;
  if (!isDevCardName(name)) notFound();
  const bytes = await devArtworkBytes(DEV_CARD_DEFINITIONS[name]);
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
