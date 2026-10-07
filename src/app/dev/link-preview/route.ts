import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { CardTextLayoutError, generatedTextLayer } from "@/lib/card/card-text.server";
import { CARD_LAYOUT_IDS, layoutSupportsShape, zoneFor } from "@/lib/card/layouts";
import { CARD_SHAPES, proportionOf, type CardShape } from "@/lib/card/shapes";
import { UndrawableTextError } from "@/lib/card/text/glyph-outlines";
import type { CardContent } from "@/lib/card/text-box";
import { TYPOGRAPHY_KEYS, type TypographyPairingId } from "@/lib/card/typography";
import { washArtwork } from "@/lib/link-preview/test-artwork";
import { previewImage, type LinkPreview } from "@/lib/link-preview/preview-image.server";

/**
 * Development-only fixture: renders a link-preview PNG from fixture data
 * (`docs/card-system.md §6.4`). 404 unless ENABLE_DEV_FIXTURES=1, read at request time so a
 * production build never exposes it by accident.
 *
 * A route handler, because it answers with an image. (HarfBuzz loads in pages and Server Actions
 * too, with `serverExternalPackages` in `next.config.ts`: `docs/technology-decisions.md §8.2`.)
 *
 * - `?kind=card&layout=art-top&shape=arch&pairing=hc_playfair_dmsans[&panel=1]` — a public
 *   event's card, laid out by the server path (`generatedTextLayer`) over synthetic artwork; with
 *   `panel=1`, behind a legibility panel as artwork made before `card_compiler_v7` stored one (no
 *   new card gets a panel, but stored ones are drawn as stored);
 * - `?kind=envelope[&title=…]` — a private event's sealed envelope.
 *
 * Real event previews (looking up the event, its privacy and its card) are a later phase; they
 * build a `LinkPreview` from the event and call the same `previewImage`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_CONTENT: CardContent = {
  title: "A Little Wild One",
  invitationLine: "Please join us for a baby shower",
  hosts: "Hosted by Maya & Tom",
  date: "Saturday, June 6",
  time: "1:00 pm",
  venue: "The Willow House",
};
const FIXTURE_TITLE = "Maya & Jonas: Garden Supper";
const INK = "#3A2A1E";
const PANEL_COLOR = "#FBF8F3";
const MAX_TITLE_LENGTH = 200;

function badRequest(message: string): Response {
  return new Response(message, { status: 400, headers: { "content-type": "text/plain" } });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = request.nextUrl.searchParams;
  const started = performance.now();
  let preview: LinkPreview;

  if (q.get("kind") === "envelope") {
    const title = q.get("title") ?? FIXTURE_TITLE;
    if (title.length > MAX_TITLE_LENGTH) return badRequest("title too long");
    preview = { kind: "envelope", title };
  } else if (q.get("kind") === "card" || q.get("kind") === null) {
    const layout = q.get("layout") ?? "art-top";
    const shape = q.get("shape") ?? "arch";
    const pairing = q.get("pairing") ?? "hc_playfair_dmsans";
    if (!(CARD_LAYOUT_IDS as readonly string[]).includes(layout)) {
      return badRequest("unknown layout");
    }
    if (!(CARD_SHAPES as readonly string[]).includes(shape)) return badRequest("unknown shape");
    if (!(TYPOGRAPHY_KEYS as readonly string[]).includes(pairing)) {
      return badRequest("unknown pairing");
    }
    const id = layout as (typeof CARD_LAYOUT_IDS)[number];
    if (!layoutSupportsShape(id, shape as CardShape)) {
      return badRequest("layout does not support shape");
    }
    let boxes;
    try {
      boxes = await generatedTextLayer({
        layout: id,
        shape: shape as CardShape,
        pairing: pairing as TypographyPairingId,
        content: FIXTURE_CONTENT,
        ink: INK,
      });
    } catch (error) {
      if (error instanceof CardTextLayoutError) {
        return new Response(error.message, { status: 422 });
      }
      throw error;
    }
    const zone = zoneFor(id, shape as CardShape);
    // A stored `card_layouts_v3`–`v6` wash panel: the zone ± 40 × 30, feathered over 70 units.
    const storedPanel = {
      x: zone.x - 40,
      y: zone.y - 30,
      width: zone.width + 80,
      height: zone.height + 60,
      radius: 0,
      softEdge: { spread: 0, blur: 0 },
      fade: { kind: "wash" as const, feather: 70 },
      color: PANEL_COLOR,
    };
    preview = {
      kind: "card",
      card: {
        shape: shape as CardShape,
        artwork: {
          bytes: washArtwork(proportionOf(shape as CardShape), zone),
          proportion: proportionOf(shape as CardShape),
        },
        panels: q.get("panel") === "1" ? [storedPanel] : [],
        boxes,
      },
    };
  } else {
    return badRequest("kind must be card or envelope");
  }

  let png: Uint8Array;
  try {
    png = await previewImage(preview);
  } catch (error) {
    // Text the preview cannot draw exactly (an emoji in a title): the request, not the server.
    if (error instanceof UndrawableTextError) return new Response(error.message, { status: 422 });
    throw error;
  }
  const duration = performance.now() - started;
  return new Response(Buffer.from(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      "server-timing": `preview;dur=${duration.toFixed(1)}`,
    },
  });
}
