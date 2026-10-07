import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { generatedTextLayer } from "@/lib/card/card-text.server";
import { seedBoxes } from "@/lib/card/customization";
import { paletteFromPixels } from "@/lib/card/ink";
import { zoneFor, type CardLayoutId } from "@/lib/card/layouts";
import { decodePng, PngError } from "@/lib/card/png.server";
import { proportionOf, type CardShape } from "@/lib/card/shapes";
import type { CardContent, TextBox } from "@/lib/card/text-box";
import { cardFontMetrics } from "@/lib/card/text/card-fonts.server";
import type { TypographyPairingId } from "@/lib/card/typography";
import { generatedTextAreas, placeArtworkText } from "@/lib/generation/artwork.server";
import { washArtwork } from "@/lib/link-preview/test-artwork";

/**
 * The developer card editor's two cards (`/dev/card-editor`), and how their starting text is
 * computed: exactly as generation does it — `generatedTextAreas`, `placeArtworkText` on the decoded
 * artwork, `generatedTextLayer` with the placement's ink and shift — then seeded as the first edit
 * of a card seeds (`seedBoxes`). No database, no model call.
 */

export const DEV_CARDS = ["notorious", "boystory"] as const;
export type DevCardName = (typeof DEV_CARDS)[number];

export function isDevCardName(value: string | null | undefined): value is DevCardName {
  return (DEV_CARDS as readonly string[]).includes(value ?? "");
}

export interface DevCard {
  name: DevCardName;
  label: string;
  /** True when the wording is a stand-in, not the owner's. */
  standIn: boolean;
  layout: CardLayoutId;
  shape: CardShape;
  pairing: TypographyPairingId;
  content: CardContent;
}

const PAIRING: TypographyPairingId = "grotesk_archivo_inter";

export const DEV_CARD_DEFINITIONS: Record<DevCardName, DevCard> = {
  notorious: {
    name: "notorious",
    label: "Notorious ONE",
    standIn: false,
    layout: "art-top",
    shape: "square",
    pairing: PAIRING,
    content: {
      title: "Little Legend, Big Beats",
      invitationLine: "Come celebrate our little legend with big birthday beats.",
      date: "Saturday, January 2",
      time: "1:00 pm",
      venue: "Venue to be announced",
      rsvpBy: "RSVP by December 19",
    },
  },
  boystory: {
    name: "boystory",
    label: "A Boy Story!",
    standIn: true,
    layout: "cover-top",
    shape: "rounded-rectangle",
    pairing: PAIRING,
    content: {
      title: "A Boy Story!",
      invitationLine: "Come celebrate our little guy turning one",
      hosts: "Hosted by Maya & Tom",
      date: "Saturday, June 6",
      time: "1:00 pm",
      venue: "The Willow House",
    },
  },
};

/**
 * The artwork's exact bytes: `DEV_CARD_ARTWORK_DIR/<name>.png` when it is set and holds a PNG the
 * card pipeline reads, else a synthetic wash. Never re-encoded or resized.
 */
export async function devArtworkBytes(card: DevCard): Promise<Uint8Array> {
  const dir = process.env.DEV_CARD_ARTWORK_DIR;
  if (dir) {
    try {
      const bytes = new Uint8Array(await readFile(path.join(dir, `${card.name}.png`)));
      decodePng(bytes); // Unreadable as a PNG: the fallback below, not a broken page.
      return bytes;
    } catch (thrown) {
      if (!(thrown instanceof PngError) && (thrown as NodeJS.ErrnoException).code !== "ENOENT") {
        throw thrown;
      }
      // Not there, or not a PNG we read: the fallback below.
    }
  }
  return washArtwork(
    proportionOf(card.shape),
    zoneFor(card.layout, card.shape),
    [226, 224, 170],
    [236, 226, 200],
  );
}

export interface DevCardPlacement {
  ink: string;
  /** Vertical movement of the heading and detail groups, card units. */
  shift: { heading: number; details: number };
  /** Readable share of the ink behind the words at the shift, 0..1. */
  coverage: number;
  moved: boolean;
}

export interface DevCardStart {
  seed: TextBox[];
  placement: DevCardPlacement;
  /** Dominant artwork colours, `#RRGGBB`, for the colour swatches. */
  swatches: string[];
  sha256: string;
  artworkBytes: number;
}

export async function devCardStart(card: DevCard): Promise<DevCardStart> {
  const bytes = await devArtworkBytes(card);
  const decoded = decodePng(bytes);
  const areas = await generatedTextAreas(card.layout, [card.shape], card.pairing, card.content);
  const space = placeArtworkText(decoded, card.layout, [card.shape], areas);
  const { placement } = space.placements[0];
  const generated = await generatedTextLayer({
    layout: card.layout,
    shape: card.shape,
    pairing: card.pairing,
    content: card.content,
    ink: placement.ink,
    shift: placement.shift,
  });
  const metrics = await cardFontMetrics(generated.map((b) => b.font));
  const seed = seedBoxes(generated, card.content, metrics);
  const { heading, details } = placement.shift;
  return {
    seed,
    placement: {
      ink: placement.ink,
      shift: { heading, details },
      coverage: placement.coverage,
      moved: heading !== 0 || details !== 0,
    },
    swatches: paletteFromPixels(decoded.rgba, decoded.width, decoded.height).map((c) =>
      c.color.toUpperCase(),
    ),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    artworkBytes: bytes.byteLength,
  };
}
