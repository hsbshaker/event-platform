import "server-only";

import { isCanonicalHex } from "@/lib/card/color";
import type { CardPanel } from "@/lib/card/card-data";
import type { CardFactsInput } from "@/lib/card/facts";
import { CARD_LAYOUT_IDS, type CardLayoutId, type PanelFade } from "@/lib/card/layouts";
import { CARD_SHAPES, type CardShape } from "@/lib/card/shapes";
import { maxSlide } from "@/lib/card/slide";
import { TYPOGRAPHY_KEYS, type TypographyPairingId } from "@/lib/card/typography";
import type { Json } from "@/lib/supabase/database.types";

import { TEXT_ZONE } from "./artwork.server";

/**
 * Reading a persisted card back (`docs/card-system.md §5`): the design's row, its artwork rows and
 * the event's words, as the card is drawn from them. Shared by the reveal (`reveal.server.ts`) and
 * the card editor's server side (`customization.server.ts`), so both read a card identically. A
 * stored record that cannot be read exactly as persisted throws, never renders something else.
 */

/** The `card_designs` columns a card is drawn from. */
export const CARD_DESIGN_COLUMNS =
  "id, round, name, description, shape, layout, typography, wording";

export interface DesignRow {
  id: string;
  round: number;
  name: string;
  description: string;
  shape: string;
  layout: string;
  typography: Json;
  wording: Json;
}

export interface ArtRow {
  id: string;
  storage_key: string;
  proportion: string;
  fits_shapes: string[];
  ink: Json;
  created_at: string;
}

/** The `card_art_assets` columns of `ArtRow`. */
export const CARD_ART_COLUMNS = "id, storage_key, proportion, fits_shapes, ink, created_at";

/** The event's words for the card: its title and stored facts, and the facts its prompt states. */
export interface CardEventRow {
  title: string | null;
  hosts: string | null;
  baby_name: string | null;
  venue_name: string | null;
  address: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  rsvp_deadline: string | null;
  timezone: string | null;
  prompt_facts: Json | null;
}

/** The `events` columns of `CardEventRow` (as `run.server.ts`'s `REVEAL_EVENT_COLUMNS`). */
export const CARD_EVENT_COLUMNS =
  "title, hosts, baby_name, venue_name, address, event_date, start_time, end_time, rsvp_deadline, timezone, prompt_facts";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The event's stored facts, as `cardContent` takes them. */
export function eventFactsOf(row: CardEventRow): CardFactsInput {
  return {
    babyName: row.baby_name,
    hosts: row.hosts,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    venueName: row.venue_name,
    address: row.address,
    rsvpDeadline: row.rsvp_deadline,
    timezone: row.timezone,
  };
}

/**
 * The persisted ink, panel and slide of the shape's text zone (`ArtworkInk`, `artwork.server.ts`).
 * `artOffset` is 0 when the artwork is drawn where it was painted.
 */
export function zoneInk(
  ink: Json,
  shape: CardShape,
): { ink: string; panels: CardPanel[]; artOffset: number } {
  const byShape = isObject(ink) ? ink[shape] : undefined;
  const zone = isObject(byShape) ? byShape[TEXT_ZONE] : undefined;
  if (!isObject(zone) || typeof zone.ink !== "string" || !isCanonicalHex(zone.ink)) {
    throw new Error(`The artwork has no ink for the ${shape} card.`);
  }
  if (zone.panel === undefined) {
    if (zone.artOffset !== undefined && zone.artOffset !== 0) {
      throw new Error(`The artwork's slide for the ${shape} card has no panel.`);
    }
    return { ink: zone.ink, panels: [], artOffset: 0 };
  }
  const panel = zone.panel;
  if (
    !isObject(panel) ||
    !isObject(panel.softEdge) ||
    typeof zone.panelColor !== "string" ||
    ![panel.x, panel.y, panel.width, panel.height, panel.radius].every(finite) ||
    ![panel.softEdge.spread, panel.softEdge.blur].every(finite)
  ) {
    throw new Error(`The artwork's legibility panel for the ${shape} card is malformed.`);
  }
  // A slide moves the picture away from the words, only under a panel that fades from an edge
  // (`chooseSlide`): up when the picture is above them, down when it is below, never past the limit.
  let artOffset = 0;
  if (zone.artOffset !== undefined && zone.artOffset !== 0) {
    const fade = isObject(panel.fade) ? panel.fade : undefined;
    const direction = fade?.kind === "edge" ? (fade.from === "bottom" ? -1 : 1) : 0;
    if (
      !finite(zone.artOffset) ||
      direction === 0 ||
      Math.sign(zone.artOffset as number) !== direction ||
      Math.abs(zone.artOffset as number) > maxSlide(shape)
    ) {
      throw new Error(`The artwork's slide for the ${shape} card is malformed.`);
    }
    artOffset = zone.artOffset as number;
  }
  return {
    ink: zone.ink,
    artOffset,
    panels: [
      {
        x: panel.x as number,
        y: panel.y as number,
        width: panel.width as number,
        height: panel.height as number,
        radius: panel.radius as number,
        softEdge: { spread: panel.softEdge.spread as number, blur: panel.softEdge.blur as number },
        color: zone.panelColor,
        // `card_layouts_v3` panels fade into the artwork; `validateCardData` checks the fade.
        ...(panel.fade !== undefined ? { fade: panel.fade as unknown as PanelFade } : {}),
      },
    ],
  };
}

export interface ReadDesign {
  shape: CardShape;
  layout: CardLayoutId;
  pairing: TypographyPairingId;
  wording: { title: string; invitationLine: string };
}

/** A design row's shape, layout, primary pairing and wording; throws for a malformed one. */
export function designOf(
  row: Pick<DesignRow, "shape" | "layout" | "typography" | "wording">,
): ReadDesign {
  const shape = row.shape as CardShape;
  const layout = row.layout as CardLayoutId;
  const pairing = isObject(row.typography) ? row.typography.primary : undefined;
  const wording = row.wording;
  if (
    !CARD_SHAPES.includes(shape) ||
    !CARD_LAYOUT_IDS.includes(layout) ||
    typeof pairing !== "string" ||
    !(TYPOGRAPHY_KEYS as readonly string[]).includes(pairing) ||
    !isObject(wording) ||
    typeof wording.title !== "string" ||
    typeof wording.invitationLine !== "string"
  ) {
    throw new Error("The card design is malformed.");
  }
  return {
    shape,
    layout,
    pairing: pairing as TypographyPairingId,
    wording: { title: wording.title, invitationLine: wording.invitationLine },
  };
}

/**
 * The artwork a design is drawn with in `shape`: the newest of its artworks that fits the shape
 * (the rule beside `card_art_assets` in the Phase 4 migration). `artworks` newest first.
 */
export function artworkFor(artworks: readonly ArtRow[], shape: CardShape): ArtRow | undefined {
  return artworks.find((a) => a.fits_shapes.includes(shape));
}
