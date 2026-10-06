import "server-only";

import { isCanonicalHex } from "@/lib/card/color";
import type { CardPanel, CardPlacement } from "@/lib/card/card-data";
import { MIN_INK_CONTRAST } from "@/lib/card/ink";
import type { CardFactsInput } from "@/lib/card/facts";
import { CARD_LAYOUT_IDS, type CardLayoutId, type PanelFade } from "@/lib/card/layouts";
import { CARD_SHAPES, type CardShape } from "@/lib/card/shapes";
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

/** The shape's text zone as it is drawn: its ink, and what keeps the words legible. */
export interface ReadZoneInk {
  ink: string;
  /** The `card_layouts_v2`/`v3` legibility panel, when one was stored; else empty. */
  panels: CardPanel[];
  /** How the artwork gives way to the words (`card_layouts_v4`), when it does. */
  placement?: CardPlacement;
  /**
   * The ink of centred words is below 4.5:1 with nothing behind it (`card_layouts_v4`): the host
   * is told, never guests (`LowContrastHint`).
   */
  lowContrast: boolean;
}

/**
 * The stored placement, copied field by field so nothing else stored beside it reaches a renderer.
 * Its values are checked by `validateCardData`, where the card is drawn.
 */
function placementOf(value: unknown, shape: CardShape): CardPlacement {
  const malformed = () => new Error(`The artwork's placement for the ${shape} card is malformed.`);
  if (!isObject(value) || !isObject(value.art)) throw malformed();
  const { kind, art, cut, fill } = value;
  if ((kind !== "crop" && kind !== "plate") || !isObject(art)) throw malformed();
  if (![art.x, art.y, art.width, art.height].every(finite)) throw malformed();
  if (cut !== undefined && (!isObject(cut) || !finite(cut.y) || typeof cut.keep !== "string")) {
    throw malformed();
  }
  if (fill !== undefined && typeof fill !== "string") throw malformed();
  return {
    kind,
    art: {
      x: art.x as number,
      y: art.y as number,
      width: art.width as number,
      height: art.height as number,
    },
    ...(isObject(cut) ? { cut: { y: cut.y as number, keep: cut.keep as "above" | "below" } } : {}),
    ...(typeof fill === "string" ? { fill } : {}),
  };
}

/** The persisted ink of the shape's text zone (`ArtworkInk`, `artwork.server.ts`). */
export function zoneInk(ink: Json, shape: CardShape): ReadZoneInk {
  const byShape = isObject(ink) ? ink[shape] : undefined;
  const zone = isObject(byShape) ? byShape[TEXT_ZONE] : undefined;
  if (!isObject(zone) || typeof zone.ink !== "string" || !isCanonicalHex(zone.ink)) {
    throw new Error(`The artwork has no ink for the ${shape} card.`);
  }
  if (zone.lowContrast !== undefined) {
    if (
      zone.lowContrast !== true ||
      !finite(zone.contrast) ||
      zone.contrast < 1 ||
      zone.contrast >= MIN_INK_CONTRAST ||
      zone.panel !== undefined ||
      zone.placement !== undefined
    ) {
      throw new Error(`The artwork's low-contrast ink for the ${shape} card is malformed.`);
    }
    return { ink: zone.ink, panels: [], lowContrast: true };
  }
  if (zone.placement !== undefined) {
    // A placement replaced the panel (`card_layouts_v4`): a zone with both was never written.
    if (zone.panel !== undefined) {
      throw new Error(`The artwork's ink for the ${shape} card has both a panel and a placement.`);
    }
    return {
      ink: zone.ink,
      panels: [],
      placement: placementOf(zone.placement, shape),
      lowContrast: false,
    };
  }
  if (zone.panel === undefined) return { ink: zone.ink, panels: [], lowContrast: false };
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
    lowContrast: false,
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
