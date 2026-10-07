"use client";

import { useState } from "react";

import { InvitationCard } from "@/components/card/InvitationCard";
import type { RevealedCard } from "@/lib/generation/reveal.server";

/** A signed URL without its token: the same artwork object whatever the signature. */
const objectOf = (src: string) => src.split("?")[0];

/**
 * The Creation Mode card, steady across the page's refreshes. Every autosave refreshes the server
 * data, which signs the artwork's URL again; a new signature for the same artwork would make the
 * browser download it again. So while the artwork object is the same, the URL the card was first
 * drawn with is kept — an image already shown is never fetched again, and a remount (a new visit)
 * starts from the fresh URL. Everything else (words, layout, shape) follows the server.
 */
export function SteadyCard({ card }: { card: RevealedCard["card"] }) {
  const [shown, setShown] = useState(card.artwork.src);
  let src = card.artwork.src;
  if (objectOf(shown) === objectOf(src)) src = shown;
  else setShown(src);
  return (
    <InvitationCard
      shape={card.shape}
      artwork={{ ...card.artwork, src }}
      panels={card.panels}
      boxes={card.boxes}
    />
  );
}
