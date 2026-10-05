import { notFound } from "next/navigation";
import { connection } from "next/server";

import { InvitationCard } from "@/components/card/InvitationCard";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { boxesToStore, seedBoxes } from "@/lib/card/customization";
import { zoneFor } from "@/lib/card/layouts";
import { proportionOf } from "@/lib/card/shapes";
import type { CardContent, TextBox } from "@/lib/card/text-box";
import type { EditorTextBox } from "@/lib/card/text-box-schema";
import { cardFontMetrics } from "@/lib/card/text/card-fonts.server";
import { washArtwork } from "@/lib/link-preview/test-artwork";

/**
 * Development-only fixture: a card the host has edited in the card editor (`spec.md §20`), drawn
 * by the production `InvitationCard` from boxes stored by the server's own path — the seed of the
 * generated layout (`seedBoxes`), then edits run through `boxesToStore`, which breaks every changed
 * box with the server's line breaking — so a real browser can show every stored line where the
 * component sets it, unwrapped, at 390 and 1280 (`spec.md §31` Card editor "guests see exactly the
 * lines … at every size"; Card rendering and envelope). The stored boxes are on the page as JSON
 * (`#stored-boxes`) for the test to compare. No database, no model call. 404 unless
 * ENABLE_DEV_FIXTURES=1, read at request time.
 */

const SAVED: CardContent = {
  title: "Lemons & Linen",
  invitationLine: "Please join us for a garden shower",
  babyName: "Maya Lopez",
  hosts: "Hosted by Ana & Leo",
  date: "Saturday, December 19",
  time: "1:00 pm – 4:00 pm",
  venue: "Villa Rosa",
  rsvpBy: "RSVP by December 5",
};

const FRAUNCES = { family: "Fraunces", weight: 700, italic: false };
const PLAYFAIR = { family: "Playfair Display", weight: 900, italic: false };

export default async function CustomizedCardFixturePage() {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();

  const shape = "rectangle";
  const layout = "art-top";
  const proportion = proportionOf(shape);
  const generated = await generatedTextLayer({
    layout,
    shape,
    pairing: "oldstyle_garamond_worksans",
    content: SAVED,
    ink: "#3A2A1E",
  });
  const seedMetrics = await cardFontMetrics(generated.map((b) => b.font));
  const seed = seedBoxes(generated, SAVED, seedMetrics);

  // The host's edits, as the editor sends them: no lines.
  const edit = (id: string, change: Partial<EditorTextBox>): EditorTextBox => {
    const { lines: _lines, ...box } = seed.find((b) => b.id === id)!;
    void _lines;
    return { ...box, ...change };
  };
  const incoming: EditorTextBox[] = [
    edit("title", { font: PLAYFAIR, size: 88, width: 520, x: 240, y: 760, rotation: -4 }),
    edit("invitationLine", {
      text: "Come celebrate Maya with lemonade, linen and a long table in the garden",
      font: FRAUNCES,
      width: 640,
      align: "left",
      x: 200,
      color: "#6B2D1F",
    }),
    edit("babyName", { textCase: "none", letterSpacing: 0.3, size: 30 }),
    edit("hosts", {}),
    edit("date", { width: 240, align: "right", x: 640 }),
    edit("time", {}),
    edit("venue", { rotation: 8, letterSpacing: 0.12 }),
    edit("rsvpBy", { y: 1320, size: 20 }),
    {
      ...edit("invitationLine", {}),
      id: "added-1",
      source: { kind: "custom" },
      text: "Lunch in the orchard\nBring a hat — the sun is generous",
      font: { family: "Karla", weight: 600, italic: false },
      size: 26,
      width: 380,
      x: 80,
      y: 120,
      rotation: 0,
      align: "center",
      z: 20,
    },
    {
      ...edit("invitationLine", {}),
      id: "added-2",
      source: { kind: "custom" },
      text: "Past the edge, as guests will see it",
      size: 34,
      width: 300,
      x: 860,
      y: 520,
      rotation: 90,
      z: 21,
    },
  ];
  const metrics = await cardFontMetrics([...seed, ...incoming].map((b) => b.font));
  const stored = boxesToStore({ previous: seed, incoming, saved: SAVED, metrics });
  if (!stored.ok) throw new Error(JSON.stringify(stored.fieldErrors));
  const boxes: TextBox[] = stored.boxes;

  const png = washArtwork(proportion, zoneFor(layout, shape), [226, 224, 170], [236, 226, 200]);
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-8">
      <InvitationCard
        shape={shape}
        artwork={{
          src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
          proportion,
        }}
        panels={[]}
        boxes={boxes}
      />
      <script
        id="stored-boxes"
        type="application/json"
        // Fixture data for the browser test: the stored boxes, as JSON.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(boxes).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
