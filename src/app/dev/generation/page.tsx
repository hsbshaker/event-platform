import { notFound } from "next/navigation";
import { connection } from "next/server";

import { generatedTextLayer } from "@/lib/card/card-text.server";
import { layoutSupportsShape, zoneFor } from "@/lib/card/layouts";
import { proportionOf, type CardShape } from "@/lib/card/shapes";
import { washArtwork } from "@/lib/link-preview/test-artwork";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import { GenerationFixture, type FixtureState } from "./GenerationFixture";

/**
 * Development-only fixture for the generation surface and the reveal (`docs/screen-spec.md`
 * `generation`, `card-reveal`): every state from fixture data, with no database, selected by
 * query. 404 unless ENABLE_DEV_FIXTURES=1, read at request time so a production build never exposes
 * it by accident.
 *
 * - `?state=starting|identity|design|notice|failed|reveal` (default `starting`);
 * - `&code=<failure code>` for `failed` (default `provider_error`);
 * - `&shape=rectangle|arch|square` and `&delay=<ms>` for `reveal`: the card's shape, and how long the
 *   envelope's tap takes to load the card.
 *
 * The card is drawn by the server path (`generatedTextLayer`) over synthetic artwork; the same
 * `RevealStage`, `GenerationPanel` and `DetailsForm` as the real surface render it.
 */

const STATES: readonly FixtureState[] = [
  "starting",
  "identity",
  "design",
  "notice",
  "failed",
  "reveal",
];
const SHAPES = ["rectangle", "arch", "square"] as const;
const FACT_SLOTS_TO_CONFIRM = ["babyName", "date", "time", "venue"];

async function fixtureCard(shape: CardShape): Promise<RevealedCard> {
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
  const png = washArtwork(proportion, zoneFor(layout, shape));
  return {
    designId: "fixture-design",
    active: true,
    round: 1,
    title: "Lemons & Linen",
    name: "Lemons & Linen",
    description: "A lemon branch over soft linen.",
    card: {
      shape,
      artwork: { src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, proportion },
      panels: [],
      boxes,
    },
    unconfirmed: boxes
      .filter(
        (box) =>
          box.source.kind === "fact" &&
          FACT_SLOTS_TO_CONFIRM.includes(box.source.slot) &&
          box.lines.length > 0,
      )
      .map((box) => box.id),
    artworkExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  };
}

export default async function GenerationFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);

  const state = (STATES as readonly string[]).includes(one("state") ?? "")
    ? (one("state") as FixtureState)
    : "starting";
  const shape = (SHAPES as readonly string[]).includes(one("shape") ?? "")
    ? (one("shape") as CardShape)
    : "rectangle";
  const card = state === "reveal" ? await fixtureCard(shape) : null;

  return (
    <GenerationFixture
      state={state}
      code={one("code") ?? "provider_error"}
      card={card}
      delayMs={Math.min(Number(one("delay")) || 0, 10_000)}
    />
  );
}
