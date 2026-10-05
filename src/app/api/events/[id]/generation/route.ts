import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import {
  generationFailure,
  generationNotice,
  type GenerationFailure,
} from "@/lib/generation/failure-copy";
import { getGenerationView, type GenerationView } from "@/lib/generation/status.server";

/**
 * The wait surface's view of the event's latest generation (`spec.md §7.10`, §7.11;
 * `docs/screen-spec.md` `generation`), polled by the client while the card is made.
 *
 * Owner and co-host only (`getGenerationView` requires `view_event` as a member). Anyone else —
 * signed out, not a member, an event that does not exist, an id that is not one — gets the same
 * plain 404, so the route never says whether an event exists (`spec.md §27`; as
 * `src/app/events/[id]/create/page.tsx` does). Never cached: every poll reads the database.
 *
 * Body: `{ generation: null }` before the first generation, else `{ generation }` with
 * `GenerationView`'s fields plus `failure` (the host-facing failure when it failed, else null) and
 * `notice` (the copyright step-back note while the step-back runs, else null). Never telemetry,
 * cost, raw model output or storage keys (`spec.md §32 #42`).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface GenerationResponseBody {
  generation:
    | (GenerationView & {
        failure: GenerationFailure | null;
        notice: string | null;
      })
    | null;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return notFound();
  // `?generation=<id>`: that generation of this event (what a surface is waiting for), else the
  // latest. An id that is not one reads as not found, like everything else here.
  const asked = request.nextUrl.searchParams.get("generation");
  if (asked !== null && !z.uuid().safeParse(asked).success) return notFound();

  let view: GenerationView | null;
  try {
    view = await getGenerationView(id, asked ? { generationId: asked } : {});
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return notFound();
    throw error;
  }

  const body: GenerationResponseBody = {
    generation: view && {
      ...view,
      failure: view.status === "failed" ? generationFailure(view.errorCode) : null,
      notice: view.status === "running" ? generationNotice(view.artifacts.notice) : null,
    },
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
