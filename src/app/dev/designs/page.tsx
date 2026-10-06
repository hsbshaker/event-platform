import { notFound } from "next/navigation";
import { connection } from "next/server";

import { generatedTextLayer } from "@/lib/card/card-text.server";
import { layoutSupportsShape, zoneFor } from "@/lib/card/layouts";
import { proportionOf, type CardShape } from "@/lib/card/shapes";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import { washArtwork } from "@/lib/link-preview/test-artwork";
import { DesignsFixture } from "./DesignsFixture";

/**
 * Development-only fixture for the designs list (`docs/screen-spec.md` `try-another-direction`,
 * "Designs list"): the list from fixture data, no database. 404 unless ENABLE_DEV_FIXTURES=1, read
 * at request time.
 *
 * - `?count=1|3|5` designs (default 3), in round order, the `active`th marked (default 2);
 * - `&published=1` for the read-only list;
 * - `&choose=ok|published|not_found|fail` is what `Choose this direction` answers (default ok).
 *
 * Each card is drawn by the server path (`generatedTextLayer`) over synthetic artwork.
 */

type Rgb = readonly [number, number, number];

const DESIGNS: readonly {
  name: string;
  description: string;
  shape: CardShape;
  top: Rgb;
  bottom: Rgb;
}[] = [
  {
    name: "Lemons & Linen",
    description: "A lemon branch over soft linen.",
    shape: "rectangle",
    top: [226, 224, 170],
    bottom: [236, 226, 200],
  },
  {
    name: "Moonlit Meadow",
    description: "Pale wildflowers under a low blue moon.",
    shape: "rectangle",
    top: [182, 198, 224],
    bottom: [214, 222, 226],
  },
  {
    name: "Little Sailor",
    description: "A paper boat on a calm, wide sea.",
    shape: "square",
    top: [196, 214, 226],
    bottom: [226, 232, 230],
  },
  {
    name: "Golden Hour Picnic",
    description: "Checked cloth, peaches and long afternoon light.",
    shape: "rectangle",
    top: [238, 208, 168],
    bottom: [240, 226, 196],
  },
  {
    name: "Garden Party Rose",
    description: "Blush roses climbing a stone wall.",
    shape: "square",
    top: [232, 200, 204],
    bottom: [240, 220, 214],
  },
];

async function fixtureDesign(index: number, active: boolean, published: boolean) {
  const { name, description, shape, top, bottom } = DESIGNS[index];
  const layout = "art-top";
  if (!layoutSupportsShape(layout, shape)) notFound();
  const proportion = proportionOf(shape);
  const boxes = await generatedTextLayer({
    layout,
    shape,
    pairing: "oldstyle_garamond_worksans",
    content: {
      title: name,
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
  const design: RevealedCard = {
    designId: `fixture-design-${index + 1}`,
    active,
    published,
    round: index + 1,
    title: name,
    name,
    description,
    card: {
      shape,
      artwork: { src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, proportion },
      panels: [],
      boxes,
    },
    lowContrast: false,
    unconfirmed: [],
    stated: {},
    customization: null,
    artworkExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  };
  return design;
}

export default async function DesignsFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);

  const count = Math.min(Math.max(Number(one("count")) || 3, 1), DESIGNS.length);
  const active = Math.min(Math.max(Number(one("active")) || 2, 1), count) - 1;
  const published = one("published") === "1";
  const designs = await Promise.all(
    Array.from({ length: count }, (_, i) => fixtureDesign(i, i === active, published)),
  );

  return <DesignsFixture designs={designs} published={published} choose={one("choose") ?? "ok"} />;
}
