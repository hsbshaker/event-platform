import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { connection } from "next/server";

import type { EventDraftView } from "@/app/actions/event-details";
import { CardWithMarkers } from "@/components/reveal/CardWithMarkers";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { layoutSupportsShape, zoneFor } from "@/lib/card/layouts";
import { CARD_SHAPES, proportionOf, type CardShape } from "@/lib/card/shapes";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import { missingRequiredDetails } from "@/lib/events/required-details";
import { provisionalContent } from "@/lib/events/provisional";
import { washArtwork } from "@/lib/link-preview/test-artwork";
import { generationFailure } from "@/lib/generation/failure-copy";
import { CreationFixture } from "./CreationFixture";

/**
 * Development-only fixture for Creation Mode's canvas (`docs/screen-spec.md` `creation-mode`,
 * `event-details-editor`): the card, the house-style page and the details editor from fixture data,
 * no database. 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 *
 * - `?data=full|empty|prompt` (default `full`): every fact saved; nothing saved; nothing saved but
 *   a prompt that states some facts;
 * - `&description=1` with `full`: a saved description;
 * - `&variant=guest`: the guest variant of the page (no anchors, no placeholders);
 * - `&lag=1`: a save reaches the page's data only after a few seconds (a slow refresh);
 * - `&refuse=1`: a title containing "Refuse" is refused, as the server's fit check would;
 * - `&shape=rectangle|rounded-rectangle|arch|oval|square` the card's shape at first (default
 *   rectangle); an illustration artwork fits every 5:7 shape, so `square` needs new artwork;
 * - `&published=1`: published, so only shapes an existing artwork fits are offered and there is no
 *   `Try another direction` or choosing;
 * - `&visibility=private` with any data: a private event with no access code stored (one made
 *   private before codes existed); add `&code=1` for one with its code stored;
 * - `&wait=square`: a switch to a square already painting when the page loads; `&wait=failed`: one
 *   that stopped.
 * - `&role=cohost`: signed in as a co-host (no Co-hosts sheet, toolbar item or checklist row);
 *   the owner otherwise. `&cohosts=0..2` co-hosts and `&pending=0..3` open invite links at first.
 * The shape, design, privacy and co-host actions are stubs; the generation poll is answered by the
 * test.
 */

const NOW = new Date("2026-10-05T12:00:00Z");

type Rgb = readonly [number, number, number];

function draft(data: string, withDescription: boolean): EventDraftView {
  const base = {
    title: null,
    eventDate: null as string | null,
    startTime: null as string | null,
    endTime: null as string | null,
    timezone: "America/Chicago" as string | null,
    venueName: null as string | null,
    address: null as string | null,
    hosts: null as string | null,
    babyName: null as string | null,
    visibility: null as "public" | "private" | null,
    rsvpDeadline: null as string | null,
  };
  const fields =
    data === "full"
      ? {
          ...base,
          eventDate: "2026-12-19",
          startTime: "13:00",
          endTime: "16:00",
          venueName: "Villa Rosa",
          address: "12 Rose Lane, Tucson, AZ",
          hosts: "Ana & Leo",
          babyName: "Maya Lopez",
          visibility: "public" as const,
          rsvpDeadline: "2026-12-05T17:00:00.000Z",
        }
      : base;
  return {
    ...fields,
    id: "fixture-event",
    prompt: "A garden baby shower for Maya Lopez",
    rsvpDeadlineEdited: false,
    generationRequestedAt: null,
    rowVersion: 1,
    published: false,
    accessCodeSet: false,
    description: withDescription ? "Lunch in the garden. Please park on the lane." : null,
    promptFacts:
      data === "prompt"
        ? {
            hosts: "Ana & Leo",
            honoree: "Maya Lopez",
            date: "December 19",
            time: "2pm",
            venue: "Villa Rosa",
            location: null,
          }
        : null,
    missing: missingRequiredDetails(fields),
    provisional: provisionalContent({ ...fields, venue: fields.venueName }, NOW),
  };
}

export default async function CreationFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const data = one("data") ?? "full";

  const published = one("published") === "1";
  const initialShape = (CARD_SHAPES as readonly string[]).includes(one("shape") ?? "")
    ? (one("shape") as CardShape)
    : "rectangle";

  const layout = "art-top";
  const supported = CARD_SHAPES.filter((shape) => layoutSupportsShape(layout, shape));
  if (!supported.includes(initialShape)) notFound();

  async function cardData(shape: CardShape, title: string, top: Rgb, bottom: Rgb) {
    const proportion = proportionOf(shape);
    const boxes = await generatedTextLayer({
      layout,
      shape,
      pairing: "oldstyle_garamond_worksans",
      content: {
        title,
        invitationLine: "Please join us for a garden shower",
        babyName: "Maya Lopez",
        hosts: null,
        date: "December 19",
        time: "1:00 pm",
        venue: "Villa Rosa",
        rsvpBy: null,
      },
      ink: "#3A2A1E",
    });
    const png = washArtwork(proportion, zoneFor(layout, shape), top, bottom);
    return {
      shape,
      artwork: { src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, proportion },
      panels: [],
      boxes,
    };
  }

  // The active design's card in every shape its layout supports (the shape control switches
  // between them, as the page's refresh does), and one other design for the designs list.
  const cards = Object.fromEntries(
    await Promise.all(
      supported.map(async (shape) => {
        const data = await cardData(shape, "Lemons & Linen", [226, 224, 170], [236, 226, 200]);
        const proportion = data.artwork.proportion;
        return [
          shape,
          <div
            key={shape}
            data-card-shape={shape}
            className="w-full"
            style={{
              maxWidth: `min(100%, calc(var(--width-narrow) * ${proportion === "5:7" ? 0.86 : 1.05}))`,
              aspectRatio: proportion === "5:7" ? "5 / 7" : "1 / 1",
            }}
          >
            <CardWithMarkers card={data} unconfirmed={[]} />
          </div>,
        ];
      }),
    ),
  ) as Record<CardShape, ReactNode>;

  const specs: { id: string; name: string; top: Rgb; bottom: Rgb }[] = [
    {
      id: "fixture-design-1",
      name: "Lemons & Linen",
      top: [226, 224, 170],
      bottom: [236, 226, 200],
    },
    {
      id: "fixture-design-2",
      name: "Moonlit Meadow",
      top: [182, 198, 224],
      bottom: [214, 222, 226],
    },
  ];
  const designs: RevealedCard[] = await Promise.all(
    specs.map(async (d, index) => ({
      designId: d.id,
      active: index === 0,
      published,
      round: index + 1,
      title: d.name,
      name: d.name,
      description:
        index === 0 ? "A lemon branch over soft linen." : "Pale wildflowers under a low blue moon.",
      card: await cardData("rectangle", d.name, d.top, d.bottom),
      unconfirmed: [],
      stated: {},
      customization: null,
      artworkExpiresAt: "2099-01-01T00:00:00.000Z",
    })),
  );

  const fields = draft(data, one("description") === "1");
  if (one("visibility") === "private") fields.visibility = "private";
  const storedCode = fields.visibility === "private" && one("code") === "1";
  fields.accessCodeSet = storedCode;
  fields.published = published;

  return (
    <CreationFixture
      initial={fields}
      variant={one("variant") === "guest" ? "guest" : "creation"}
      lag={one("lag") === "1"}
      refuse={one("refuse") === "1"}
      cards={cards}
      shape={initialShape}
      shapeWait={
        one("wait") === "square"
          ? { kind: "running", shape: "square", generationId: "fixture-generation-1" }
          : one("wait") === "failed"
            ? {
                kind: "failed",
                shape: "square",
                generationId: "fixture-generation-1",
                failure: generationFailure("stopped"),
              }
            : null
      }
      supported={supported}
      published={published}
      designs={designs}
      previewHref={`/dev/preview?data=${encodeURIComponent(data)}`}
      storedCode={storedCode}
      role={one("role") === "cohost" ? "cohost" : "owner"}
      cohosts={Math.min(2, Math.max(0, Number(one("cohosts") ?? 0) || 0))}
      pendingInvites={Math.min(3, Math.max(0, Number(one("pending") ?? 0) || 0))}
    />
  );
}
