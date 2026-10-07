import "server-only";

import { isCanonicalHex } from "@/lib/card/color";
import type { CardPanel } from "@/lib/card/card-data";
import type { CardFactsInput } from "@/lib/card/facts";
import { CARD_LAYOUT_IDS, type CardLayoutId, type PanelFade } from "@/lib/card/layouts";
import { canvasOf, CARD_SHAPES, type CardShape } from "@/lib/card/shapes";
import type { TextShift } from "@/lib/card/text-space";
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

/** The persisted ink of the shape's text zone, with its legibility panel and its text shift. */
export interface StoredZoneInk {
  ink: string;
  /** A panel persisted before `card_compiler_v7`, drawn as stored; none since. */
  panels: CardPanel[];
  /** Where the generated words start (`card_compiler_v7`); both 0 for earlier artwork. */
  shift: TextShift;
}

/**
 * The stored shift of a zone: absent (earlier artwork) is no shift; anything else must be two
 * finite numbers within the canvas height, or the record is malformed. Defence in depth: the
 * reader stays loose, and `shiftFits` (`text-space.ts`) refuses at drawing time a pair that would
 * reorder the groups or leave the text-safe area, so such a pair simply draws unshifted.
 */
function storedShift(value: unknown, shape: CardShape): TextShift {
  if (value === undefined) return { heading: 0, details: 0 };
  const limit = canvasOf(shape).height;
  const valid = (n: unknown): n is number => finite(n) && Math.abs(n) <= limit;
  if (!isObject(value) || !valid(value.heading) || !valid(value.details)) {
    throw new Error(`The artwork's text placement for the ${shape} card is malformed.`);
  }
  return { heading: value.heading, details: value.details };
}

/**
 * The persisted ink, legibility panel and text shift of the shape's text zone (`ArtworkInk`,
 * `artwork.server.ts`). A panel persisted before `card_compiler_v7` is read and drawn exactly as
 * stored (owner decision 2026-10-07); new artwork has none, and a shift instead. Keys this reader
 * does not know — those of withdrawn versions, such as the slide's `artOffset`
 * (`card_compiler_v6`) — are ignored: the artwork is always drawn as painted.
 */
export function zoneInk(ink: Json, shape: CardShape): StoredZoneInk {
  const byShape = isObject(ink) ? ink[shape] : undefined;
  const zone = isObject(byShape) ? byShape[TEXT_ZONE] : undefined;
  if (!isObject(zone) || typeof zone.ink !== "string" || !isCanonicalHex(zone.ink)) {
    throw new Error(`The artwork has no ink for the ${shape} card.`);
  }
  const shift = storedShift(zone.shift, shape);
  if (zone.panel === undefined) return { ink: zone.ink, panels: [], shift };
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
  return {
    ink: zone.ink,
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
    shift,
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
