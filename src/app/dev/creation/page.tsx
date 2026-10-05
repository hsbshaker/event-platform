import { notFound } from "next/navigation";
import { connection } from "next/server";

import type { EventDraftView } from "@/app/actions/event-details";
import { CardWithMarkers } from "@/components/reveal/CardWithMarkers";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { layoutSupportsShape, zoneFor } from "@/lib/card/layouts";
import { proportionOf, type CardShape } from "@/lib/card/shapes";
import { missingRequiredDetails } from "@/lib/events/required-details";
import { provisionalContent } from "@/lib/events/provisional";
import { washArtwork } from "@/lib/link-preview/test-artwork";
import { CreationFixture } from "./CreationFixture";

/**
 * Development-only fixture for Creation Mode's canvas (`docs/screen-spec.md` `creation-mode`,
 * `event-details-editor`): the card, the house-style page and the details editor from fixture data,
 * no database. 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 *
 * - `?data=full|empty|prompt` (default `full`): every fact saved; nothing saved; nothing saved but
 *   a prompt that states some facts;
 * - `&description=1` with `full`: a saved description;
 * - `&variant=guest`: the guest variant of the page (no anchors, no placeholders).
 */

const NOW = new Date("2026-10-05T12:00:00Z");

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

  const shape: CardShape = "rectangle";
  const layout = "art-top";
  if (!layoutSupportsShape(layout, shape)) notFound();
  const proportion = proportionOf(shape);
  const boxes = await generatedTextLayer({
    layout,
    shape,
    pairing: "oldstyle_garamond_worksans",
    content: {
      title: "Lemons & Linen",
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
  const png = washArtwork(proportion, zoneFor(layout, shape), [226, 224, 170], [236, 226, 200]);
  const card = {
    shape,
    artwork: { src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, proportion },
    panels: [],
    boxes,
  };

  return (
    <CreationFixture
      initial={draft(data, one("description") === "1")}
      variant={one("variant") === "guest" ? "guest" : "creation"}
      card={
        <div
          className="w-full"
          style={{
            maxWidth: "min(100%, calc(var(--width-narrow) * 0.86))",
            aspectRatio: "5 / 7",
          }}
        >
          <CardWithMarkers card={card} unconfirmed={[]} />
        </div>
      }
    />
  );
}
