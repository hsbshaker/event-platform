import { notFound } from "next/navigation";
import { connection } from "next/server";

import { proportionOf } from "@/lib/card/shapes";

import { CardEditorFixture } from "./CardEditorFixture";
import { DEV_CARD_DEFINITIONS, devCardStart, isDevCardName } from "./fixture.server";

/**
 * Development-only fixture for the card editor's text background (`spec.md §20.1`; §31 Card
 * editor, "Text background"; `docs/design-system.md §4.10a`): the production `InvitationCard` over
 * one of two real cards, the `TextBackgroundControl` the Phase 6b editor will use, and a few
 * fixture controls (not the editor's gestures) to move and resize a box. Every change goes through
 * the server's own save path without the database (`actions.ts`): no database writes, no model
 * calls. 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 *
 * - `?card=notorious|boystory` (default `notorious`): Notorious ONE (`art-top`, square) or A Boy
 *   Story! (`cover-top`, rounded rectangle; its wording is a stand-in).
 * - Artwork: `DEV_CARD_ARTWORK_DIR/<card>.png` bytes exactly when present, else a synthetic wash,
 *   served unchanged by `artwork/<card>`. Its SHA-256 is on the page (`data-artwork-sha256`).
 * - Starting text: computed as generation does (`fixture.server.ts`), then seeded as a first edit.
 */
export default async function CardEditorFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string | string[] }>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();

  const { card: requested } = await searchParams;
  const name = isDevCardName(Array.isArray(requested) ? requested[0] : requested)
    ? ((Array.isArray(requested) ? requested[0] : requested) as keyof typeof DEV_CARD_DEFINITIONS)
    : "notorious";
  const card = DEV_CARD_DEFINITIONS[name];
  const start = await devCardStart(card);

  return (
    <CardEditorFixture
      card={card.name}
      label={card.label}
      standIn={card.standIn}
      shape={card.shape}
      proportion={proportionOf(card.shape)}
      layout={card.layout}
      artworkSrc={`/dev/card-editor/artwork/${card.name}`}
      artworkSha256={start.sha256}
      artworkBytes={start.artworkBytes}
      placement={start.placement}
      swatches={start.swatches}
      seed={start.seed}
    />
  );
}
