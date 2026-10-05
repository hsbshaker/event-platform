import "server-only";

import { requireEventAccess } from "@/lib/auth/event-access";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { isCanonicalHex } from "@/lib/card/color";
import { validateCardData, type CardPanel } from "@/lib/card/card-data";
import type { PanelFade } from "@/lib/card/layouts";
import {
  effectiveCardTitle,
  guestCardContent,
  parsePromptFacts,
  type PromptFactSlot,
  type RevealCardContent,
} from "@/lib/card/facts";
import { CARD_LAYOUT_IDS, type CardLayoutId } from "@/lib/card/layouts";
import { revealContentFor } from "@/lib/card/reveal-content.server";
import { CARD_SHAPES, proportionOf, type CardProportion, type CardShape } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { TYPOGRAPHY_KEYS, type TypographyPairingId } from "@/lib/card/typography";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { TEXT_ZONE } from "./artwork.server";
import { CARD_ART_BUCKET, REVEAL_EVENT_COLUMNS, type RevealEventRow } from "./run.server";

/**
 * The revealed card (`spec.md §7.3`, §7.11, §7.15; `docs/screen-spec.md` `card-reveal`,
 * `try-another-direction`; `docs/design-system.md §4.4`): a design of the event — the active one
 * by default, or the one asked for (`designId`), so a new direction is revealed before the host
 * chooses it — ready for `InvitationCard`, with its creative name and description, whether it is
 * the active design, and the text boxes whose words need the host's confirmation.
 *
 * For a signed-in owner or co-host (`view_event`; a member role is required, so never a guest). The
 * active design is drawn in its active shape (`events.active_card_shape`, else the design's own);
 * any other design in its own shape. Its artwork is the newest of the design's artworks that fits that shape (the
 * rule beside `card_art_assets` in the Phase 4 migration), served through a short-lived signed URL
 * from the private `card-art` bucket; the ink and legibility panel are the ones persisted with
 * that artwork for that shape, never re-resolved (`spec.md §32 #27`); the text is the generated
 * layer (`generatedTextLayer`) for the words `revealContentFor` gives — the design's wording with
 * the effective title, the host's stored facts, the facts the prompt states (as written) and the
 * placeholders — and `unconfirmed` names the boxes of the last two.
 *
 * Never returned: storage keys, the raw model output, the art brief, versions, telemetry or cost
 * (`spec.md §32 #42`). A stored record this cannot draw exactly as persisted throws rather than
 * rendering something else (`InvalidCardDataError`, `CardTextLayoutError`, or a plain error).
 *
 * Phase 5c serves the generated layer only: a host's `CardCustomization` is drawn once the card
 * editor exists (`spec.md §24`, "Effective render state").
 */

/** How long the artwork's signed URL works, in seconds (as the inspiration previews'). */
export const CARD_ART_SIGNED_URL_TTL_SECONDS = 300;

export interface RevealedCard {
  /** The design shown (`getGenerationView` names the one a generation produced). */
  designId: string;
  /** Whether it is the event's active design; a new direction is not until the host chooses it. */
  active: boolean;
  /**
   * Whether the event is published: then no new design and no switching (`spec.md §8.2`), so the
   * pages offer neither `Try another direction` nor choosing.
   */
  published: boolean;
  round: number;
  /** The card's effective title (`effectiveCardTitle`): the envelope's front, as guests' envelope shows it. */
  title: string;
  /** The design's creative name and one-line description. */
  name: string;
  description: string;
  /** `InvitationCard`'s props. */
  card: {
    shape: CardShape;
    artwork: { src: string; proportion: CardProportion };
    panels: CardPanel[];
    boxes: TextBox[];
  };
  /** Ids of the boxes in `card.boxes` showing a prompt-stated value or a placeholder. */
  unconfirmed: string[];
  /**
   * The prompt-stated values the card shows, by fact (`revealCardContent`), for the page beneath
   * the card to show the same ones.
   */
  stated: Partial<Record<PromptFactSlot, string>>;
  /** When `card.artwork.src` stops working (ISO 8601); load the card again after it. */
  artworkExpiresAt: string;
}

export interface LoadRevealedCardOptions {
  now?: () => number;
  /** A design of the event to show instead of the active one. */
  designId?: string;
  /**
   * `"guest"`: the card as guests see it (Preview) — the host's stored facts only, with no
   * placeholder and no prompt-stated value, so `unconfirmed` and `stated` are empty
   * (`guestCardContent`). Default `"host"`: Creation Mode's content.
   */
  audience?: "host" | "guest";
}

interface DesignRow {
  id: string;
  round: number;
  name: string;
  description: string;
  shape: string;
  layout: string;
  typography: Json;
  wording: Json;
}

interface ArtRow {
  id: string;
  storage_key: string;
  proportion: string;
  fits_shapes: string[];
  ink: Json;
  created_at: string;
}

type EventRow = RevealEventRow & {
  active_card_design_id: string | null;
  active_card_shape: string | null;
  status: string;
  published_at: string | null;
};

/** As `start_generation` and `choose_card_design` decide it. */
const PUBLISHED_STATUSES: ReadonlySet<string> = new Set(["PUBLISHED", "PASSED", "ARCHIVED"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The persisted ink and panel of the shape's text zone (`ArtworkInk`, `artwork.server.ts`). */
function zoneInk(ink: Json, shape: CardShape): { ink: string; panels: CardPanel[] } {
  const byShape = isObject(ink) ? ink[shape] : undefined;
  const zone = isObject(byShape) ? byShape[TEXT_ZONE] : undefined;
  if (!isObject(zone) || typeof zone.ink !== "string" || !isCanonicalHex(zone.ink)) {
    throw new Error(`The artwork has no ink for the ${shape} card.`);
  }
  if (zone.panel === undefined) return { ink: zone.ink, panels: [] };
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
  };
}

function designOf(row: DesignRow): {
  shape: CardShape;
  layout: CardLayoutId;
  pairing: TypographyPairingId;
  wording: { title: string; invitationLine: string };
} {
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
 * The event's revealed card: the design asked for, else the active one. Null when the event has no
 * design yet, or the design asked for is not one of this event's. Throws `UnauthorizedError` /
 * `ForbiddenError` for a viewer who is not the event's owner or a co-host, before reading anything.
 */
export async function loadRevealedCard(
  eventId: string,
  options: LoadRevealedCardOptions = {},
): Promise<RevealedCard | null> {
  await requireEventAccess(eventId, "view_event");
  const now = options.now?.() ?? Date.now();
  // Read after the access check above, for this event only.
  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("events")
    .select(
      `active_card_design_id, active_card_shape, status, published_at, ${REVEAL_EVENT_COLUMNS}`,
    )
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  const row = event as EventRow | null;
  if (!row) return null;
  const designId = options.designId ?? row.active_card_design_id;
  if (!designId) return null;
  const active = designId === row.active_card_design_id;

  const { data: designData, error: designError } = await admin
    .from("card_designs")
    .select("id, round, name, description, shape, layout, typography, wording")
    .eq("id", designId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (designError) throw designError;
  if (!designData) {
    // A design asked for that is not this event's reads as absent, like an event with none.
    if (!active) return null;
    throw new Error("The event's active card design was not found.");
  }
  const designRow = designData as DesignRow;

  const { data: artData, error: artError } = await admin
    .from("card_art_assets")
    .select("id, storage_key, proportion, fits_shapes, ink, created_at")
    .eq("card_design_id", designRow.id)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (artError) throw artError;
  return buildRevealedCard({
    admin,
    event: row,
    design: designRow,
    artworks: (artData ?? []) as ArtRow[],
    active,
    now,
    audience: options.audience ?? "host",
  });
}

/**
 * One design drawn as a `RevealedCard`: in the event's active shape when it is the active design,
 * else in its own; its artwork the newest that fits that shape, signed. Shared by the single card
 * and the designs list (`loadEventDesigns`), so both draw a design identically.
 */
async function buildRevealedCard({
  admin,
  event: row,
  design: designRow,
  artworks,
  active,
  now,
  audience = "host",
}: {
  admin: ReturnType<typeof createAdminClient>;
  event: EventRow;
  design: DesignRow;
  /** The design's artworks, newest first. */
  artworks: ArtRow[];
  active: boolean;
  now: number;
  audience?: "host" | "guest";
}): Promise<RevealedCard> {
  const design = designOf(designRow);
  const shape = active
    ? ((row.active_card_shape as CardShape | null) ?? design.shape)
    : design.shape;
  if (!CARD_SHAPES.includes(shape)) throw new Error("The event's active card shape is malformed.");

  // The newest artwork of the design that fits the shape.
  const art = artworks.find((a) => a.fits_shapes.includes(shape));
  if (!art) throw new Error(`The card design has no artwork for the ${shape} card.`);
  const proportion = proportionOf(shape);
  const stored = art.proportion === "portrait_5_7" ? "5:7" : "1:1";
  if (stored !== proportion) {
    throw new Error(`The ${shape} card's artwork is not ${proportion}.`);
  }
  const { ink, panels } = zoneInk(art.ink, shape);

  const title = effectiveCardTitle(row.title, design.wording.title);
  const wording = { title, invitationLine: design.wording.invitationLine };
  const eventFacts = {
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
  // A guest's card carries the host's stored facts only: no placeholder, no prompt-stated value.
  const { content, unconfirmed, stated }: RevealCardContent =
    audience === "guest"
      ? { content: guestCardContent({ wording, event: eventFacts }), unconfirmed: [], stated: {} }
      : await revealContentFor({
          wording,
          event: eventFacts,
          promptFacts: parsePromptFacts(row.prompt_facts),
          now: new Date(now),
        });
  const boxes = await generatedTextLayer({
    layout: design.layout,
    shape,
    pairing: design.pairing,
    content,
    ink,
  });

  const { data: signed, error: signError } = await admin.storage
    .from(CARD_ART_BUCKET)
    .createSignedUrl(art.storage_key, CARD_ART_SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;
  if (!signed?.signedUrl) throw new Error("The card's artwork could not be signed.");

  const card = { shape, artwork: { src: signed.signedUrl, proportion }, panels, boxes };
  validateCardData({ shape, artworkProportion: proportion, panels, boxes });

  const marked = new Set<string>(unconfirmed);
  return {
    designId: designRow.id,
    active,
    published: row.published_at !== null || PUBLISHED_STATUSES.has(row.status),
    round: designRow.round,
    title,
    name: designRow.name,
    description: designRow.description,
    card,
    unconfirmed: boxes
      .filter(
        (box) => box.source.kind === "fact" && marked.has(box.source.slot) && box.lines.length > 0,
      )
      .map((box) => box.id),
    stated,
    artworkExpiresAt: new Date(now + CARD_ART_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Every design of the event that has artwork, each as the card it would show (`spec.md §7.14`,
 * §8.2; `docs/design-system.md §10.21`), for the designs list. Round ascending, so entries keep
 * their place when a new design arrives. The active design is drawn in the event's active shape,
 * any other in its own. For a signed-in owner or co-host (`view_event`, checked once); then one read
 * each of the event, its designs and its artwork, and every artwork signed for
 * `CARD_ART_SIGNED_URL_TTL_SECONDS`. Empty when the event has no design with artwork.
 */
export async function loadEventDesigns(
  eventId: string,
  options: { now?: () => number } = {},
): Promise<RevealedCard[]> {
  await requireEventAccess(eventId, "view_event");
  const now = options.now?.() ?? Date.now();
  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("events")
    .select(
      `active_card_design_id, active_card_shape, status, published_at, ${REVEAL_EVENT_COLUMNS}`,
    )
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  const row = event as EventRow | null;
  if (!row) return [];

  const { data: designData, error: designError } = await admin
    .from("card_designs")
    .select("id, round, name, description, shape, layout, typography, wording")
    .eq("event_id", eventId)
    .order("round", { ascending: true });
  if (designError) throw designError;
  const { data: artData, error: artError } = await admin
    .from("card_art_assets")
    .select("id, card_design_id, storage_key, proportion, fits_shapes, ink, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (artError) throw artError;

  const artByDesign = new Map<string, ArtRow[]>();
  for (const art of (artData ?? []) as (ArtRow & { card_design_id: string })[]) {
    const list = artByDesign.get(art.card_design_id) ?? [];
    list.push(art);
    artByDesign.set(art.card_design_id, list);
  }
  const designs = ((designData ?? []) as DesignRow[]).filter((d) => artByDesign.has(d.id));
  // A design the card component cannot draw (a malformed historical record) is left out of the
  // list and logged, so one old card never takes the event page down; the active card itself is
  // still read strictly by `loadRevealedCard`.
  const cards = await Promise.all(
    designs.map(async (design) => {
      try {
        return await buildRevealedCard({
          admin,
          event: row,
          design,
          artworks: artByDesign.get(design.id) ?? [],
          active: design.id === row.active_card_design_id,
          now,
        });
      } catch (error) {
        console.error("[designs] a design could not be drawn", {
          eventId,
          designId: design.id,
          error: error instanceof Error ? error.name : typeof error,
        });
        return null;
      }
    }),
  );
  return cards.filter((card): card is RevealedCard => card !== null);
}
