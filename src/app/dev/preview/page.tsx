import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PreviewShell } from "@/app/events/[id]/preview/PreviewShell";
import { PreviewStage } from "@/app/events/[id]/preview/PreviewStage";
import { InvitationCard } from "@/components/card/InvitationCard";
import { EventPage } from "@/components/event-page/EventPage";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { guestCardContent } from "@/lib/card/facts";
import { zoneFor } from "@/lib/card/layouts";
import { proportionOf } from "@/lib/card/shapes";
import { eventPageContent } from "@/lib/events/page-content";
import { hasDetailsHiddenFromGuests, PREVIEW_HIDDEN_LINE } from "@/lib/events/preview";
import { missingRequiredDetails } from "@/lib/events/required-details";
import { washArtwork } from "@/lib/link-preview/test-artwork";

/**
 * Development-only fixture for Preview (`docs/screen-spec.md` `preview`), from fixture data, no
 * database: the real `PreviewShell`, `PreviewStage`, `InvitationCard` and `EventPage`, with the
 * card's words and the page's content derived exactly as the preview route derives them for a
 * guest (`guestCardContent`, `eventPageContent(..., "guest")`). 404 unless ENABLE_DEV_FIXTURES=1,
 * read at request time.
 *
 * - `?data=full|empty|prompt` (default `full`): every fact saved; nothing saved; nothing saved but
 *   a prompt that states some facts (which Preview never shows).
 */

const NOW = new Date("2026-10-05T12:00:00Z");
const TITLE = "Lemons & Linen";
const INVITATION_LINE = "Please join us for a garden shower";

export default async function PreviewFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const raw = Array.isArray(q.data) ? q.data[0] : q.data;
  const data = raw === "empty" || raw === "prompt" ? raw : "full";

  const full = data === "full";
  const fields = {
    title: null,
    eventDate: full ? "2026-12-19" : null,
    startTime: full ? "13:00" : null,
    endTime: full ? "16:00" : null,
    timezone: "America/Chicago",
    venueName: full ? "Villa Rosa" : null,
    address: full ? "12 Rose Lane, Tucson, AZ" : null,
    hosts: full ? "Ana & Leo" : null,
    babyName: full ? "Maya Lopez" : null,
    visibility: "public" as const,
    rsvpDeadline: full ? "2026-12-05T17:00:00.000Z" : null,
  };

  const shape = "rectangle";
  const layout = "art-top";
  const proportion = proportionOf(shape);
  const boxes = await generatedTextLayer({
    layout,
    shape,
    pairing: "oldstyle_garamond_worksans",
    content: guestCardContent({
      wording: { title: TITLE, invitationLine: INVITATION_LINE },
      event: fields,
    }),
    ink: "#3A2A1E",
  });
  const png = washArtwork(proportion, zoneFor(layout, shape), [226, 224, 170], [236, 226, 200]);

  const content = eventPageContent(
    {
      title: TITLE,
      hosts: fields.hosts,
      babyName: fields.babyName,
      eventDate: fields.eventDate,
      startTime: fields.startTime,
      endTime: fields.endTime,
      venueName: fields.venueName,
      address: fields.address,
      rsvpDeadline: fields.rsvpDeadline,
      timezone: fields.timezone,
      description: full ? "Lunch in the garden. Please park on the lane." : null,
      // A prompt's stated facts exist in the `prompt` data and are never given to a guest's view.
      stated: {},
    },
    "guest",
    NOW,
  );

  return (
    <PreviewShell
      backHref={`/dev/creation?data=${data}`}
      hiddenLine={
        hasDetailsHiddenFromGuests(missingRequiredDetails(fields)) ? PREVIEW_HIDDEN_LINE : null
      }
    >
      <PreviewStage title={TITLE} proportion={proportion}>
        <InvitationCard
          shape={shape}
          artwork={{
            src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
            proportion,
          }}
          panels={[]}
          boxes={boxes}
        />
      </PreviewStage>
      <EventPage content={content} />
    </PreviewShell>
  );
}
