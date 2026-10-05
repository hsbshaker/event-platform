import "server-only";

import { requireEventAccess } from "@/lib/auth/event-access";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { InvalidCardDataError, validateCardData, type CardPanel } from "@/lib/card/card-data";
import { type PromptFactSlot } from "@/lib/card/facts";
import { CARD_SHAPES, proportionOf, type CardProportion, type CardShape } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { parseStoredBoxes } from "@/lib/card/text-box-schema";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  artworkFor,
  CARD_ART_COLUMNS,
  CARD_DESIGN_COLUMNS,
  CARD_EVENT_COLUMNS,
  designOf,
  zoneInk,
  type ArtRow,
  type CardEventRow,
  type DesignRow,
} from "./card-record.server";
import {
  cardContents,
  customizedText,
  readCustomization,
  type CustomizationRow,
} from "./customization.server";
import { CARD_ART_BUCKET } from "./run.server";

/**
 * The revealed card (`spec.md §7.3`, §7.11, §7.15; `docs/screen-spec.md` `card-reveal`,
 * `try-another-direction`; `docs/design-system.md §4.4`): a design of the event — the active one
 * by default, or the one asked for (`designId`), so a new direction is revealed before the host
 * chooses it — ready for `InvitationCard`, with its creative name and description, whether it is
 * the active design, and the text boxes whose words need the host's confirmation.
 *
 * For a signed-in owner or co-host (`view_event`; a member role is required, so never a guest). The
 * active design is drawn in its active shape (`events.active_card_shape`, else the design's own);
 * any other design in its own shape. Its artwork is the newest of the design's artworks that fits
 * that shape (the rule beside `card_art_assets` in the Phase 4 migration), served through a
 * short-lived signed URL from the private `card-art` bucket; the ink and legibility panel are the
 * ones persisted with that artwork for that shape, never re-resolved (`spec.md §32 #27`).
 *
 * The text (`docs/card-system.md §6.1`) is the host's customization of that design and shape when
 * one exists (`spec.md §20.5`): its stored boxes, each drawn in its stored lines, with every linked
 * box (the title, the facts) in lines that spell its current words (`customizedText`). Otherwise it
 * is the generated layer (`generatedTextLayer`). Either way the words are `revealContentFor`'s — the
 * design's wording with the effective title, the host's stored facts, the facts the prompt states
 * (as written) and the placeholders — and `unconfirmed` names the boxes of the last two; for a
 * guest (`audience: "guest"`, Preview) the saved words only, so a fact the host has not saved shows
 * nothing.
 *
 * Stored boxes are untrusted: a customization that does not parse (`parseStoredBoxes`) is drawn as
 * the generated layer, and `customization.unreadable` says so for the notice.
 *
 * Never returned: storage keys, the raw model output, the art brief, versions, telemetry or cost
 * (`spec.md §32 #42`). A stored design record this cannot draw exactly as persisted throws rather
 * than rendering something else (`InvalidCardDataError`, `CardTextLayoutError`, or a plain error).
 */

/** How long the artwork's signed URL works, in seconds (as the inspiration previews'). */
export const CARD_ART_SIGNED_URL_TTL_SECONDS = 300;

/** The host's customization of the card shown (`spec.md §20.5`). */
export interface ShownCustomization {
  /** What the card editor's next save is based on (`saveCardCustomization`). */
  revision: number;
  updatedAt: string;
  /**
   * The stored boxes did not parse: the card shows its generated layout instead, and the editor
   * says so (`docs/development-plan.md` 6b). A save replaces them.
   */
  unreadable: boolean;
}

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
  /**
   * The host's customization of this design and shape, or null when the card shows its generated
   * layout because the host has not edited it.
   */
  customization: ShownCustomization | null;
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

type EventRow = CardEventRow & {
  active_card_design_id: string | null;
  active_card_shape: string | null;
  status: string;
  published_at: string | null;
};

/** As `start_generation` and `choose_card_design` decide it. */
const PUBLISHED_STATUSES: ReadonlySet<string> = new Set(["PUBLISHED", "PASSED", "ARCHIVED"]);

type CustomizationLookup = (designId: string, shape: CardShape) => Promise<CustomizationRow | null>;

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
    .select(`active_card_design_id, active_card_shape, status, published_at, ${CARD_EVENT_COLUMNS}`)
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
    .select(CARD_DESIGN_COLUMNS)
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
    .select(CARD_ART_COLUMNS)
    .eq("card_design_id", designRow.id)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (artError) throw artError;
  return buildRevealedCard({
    admin,
    eventId,
    event: row,
    design: designRow,
    artworks: (artData ?? []) as ArtRow[],
    active,
    now,
    audience: options.audience ?? "host",
    customizationOf: (id, shape) => readCustomization(admin, eventId, id, shape),
  });
}

/**
 * The customized text layer of a card, or null to draw the generated one: no customization, or
 * one whose stored boxes do not parse (logged; `unreadable` set for the notice).
 */
async function customizedLayer(input: {
  eventId: string;
  stored: CustomizationRow;
  content: Parameters<typeof customizedText>[1];
  unconfirmed: Parameters<typeof customizedText>[2];
}): Promise<{ boxes: TextBox[]; unconfirmed: string[] } | null> {
  const { eventId, stored } = input;
  const parsed = parseStoredBoxes(stored.boxes);
  if (!parsed.ok) {
    console.error("[card editor] a customization could not be read; showing the generated card", {
      eventId,
      designId: stored.card_design_id,
      shape: stored.shape,
      revision: stored.revision,
      issues: parsed.issues,
    });
    return null;
  }
  return customizedText(parsed.boxes, input.content, input.unconfirmed);
}

/**
 * One design drawn as a `RevealedCard`: in the event's active shape when it is the active design,
 * else in its own; its artwork the newest that fits that shape, signed; its text the host's
 * customization for that shape, else the generated layer. Shared by the single card and the designs
 * list (`loadEventDesigns`), so both draw a design identically.
 */
async function buildRevealedCard({
  admin,
  eventId,
  event: row,
  design: designRow,
  artworks,
  active,
  now,
  audience = "host",
  customizationOf,
}: {
  admin: ReturnType<typeof createAdminClient>;
  eventId: string;
  event: EventRow;
  design: DesignRow;
  /** The design's artworks, newest first. */
  artworks: ArtRow[];
  active: boolean;
  now: number;
  audience?: "host" | "guest";
  customizationOf: CustomizationLookup;
}): Promise<RevealedCard> {
  const design = designOf(designRow);
  const shape = active
    ? ((row.active_card_shape as CardShape | null) ?? design.shape)
    : design.shape;
  if (!CARD_SHAPES.includes(shape)) throw new Error("The event's active card shape is malformed.");

  // The newest artwork of the design that fits the shape.
  const art = artworkFor(artworks, shape);
  if (!art) throw new Error(`The card design has no artwork for the ${shape} card.`);
  const proportion = proportionOf(shape);
  const stored = art.proportion === "portrait_5_7" ? "5:7" : "1:1";
  if (stored !== proportion) {
    throw new Error(`The ${shape} card's artwork is not ${proportion}.`);
  }
  const { ink, panels } = zoneInk(art.ink, shape);

  const contents = await cardContents(row, design.wording, new Date(now));
  // A guest's card carries the host's stored facts only: no placeholder, no prompt-stated value.
  const { content, unconfirmed, stated } =
    audience === "guest" ? { content: contents.saved, unconfirmed: [], stated: {} } : contents.host;

  const customizationRow = await customizationOf(designRow.id, shape);
  let layer: { boxes: TextBox[]; unconfirmed: string[] } | null = null;
  let unreadable = false;
  if (customizationRow) {
    layer = await customizedLayer({ eventId, stored: customizationRow, content, unconfirmed });
    unreadable = layer === null;
    if (layer) {
      try {
        validateCardData({ shape, artworkProportion: proportion, panels, boxes: layer.boxes });
      } catch (error) {
        // Unreachable for boxes that parsed (the schema holds what the component draws); kept so
        // a stored layer the component refuses is the generated card with a notice, never an error.
        if (!(error instanceof InvalidCardDataError)) throw error;
        console.error("[card editor] a customization cannot be drawn; showing the generated card", {
          eventId,
          designId: designRow.id,
          shape,
          error: error.message,
        });
        layer = null;
        unreadable = true;
      }
    }
  }
  if (!layer) {
    const boxes = await generatedTextLayer({
      layout: design.layout,
      shape,
      pairing: design.pairing,
      content,
      ink,
    });
    const marked = new Set<string>(unconfirmed);
    layer = {
      boxes,
      unconfirmed: boxes
        .filter(
          (box) =>
            box.source.kind === "fact" && marked.has(box.source.slot) && box.lines.length > 0,
        )
        .map((box) => box.id),
    };
  }

  const { data: signed, error: signError } = await admin.storage
    .from(CARD_ART_BUCKET)
    .createSignedUrl(art.storage_key, CARD_ART_SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;
  if (!signed?.signedUrl) throw new Error("The card's artwork could not be signed.");

  const card = {
    shape,
    artwork: { src: signed.signedUrl, proportion },
    panels,
    boxes: layer.boxes,
  };
  validateCardData({ shape, artworkProportion: proportion, panels, boxes: layer.boxes });

  return {
    designId: designRow.id,
    active,
    published: row.published_at !== null || PUBLISHED_STATUSES.has(row.status),
    round: designRow.round,
    title: contents.title,
    name: designRow.name,
    description: designRow.description,
    card,
    unconfirmed: layer.unconfirmed,
    stated,
    customization: customizationRow
      ? {
          revision: customizationRow.revision,
          updatedAt: customizationRow.updated_at,
          unreadable,
        }
      : null,
    artworkExpiresAt: new Date(now + CARD_ART_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Every design of the event that has artwork, each as the card it would show (`spec.md §7.14`,
 * §8.2; `docs/design-system.md §10.21`), for the designs list. Round ascending, so entries keep
 * their place when a new design arrives. The active design is drawn in the event's active shape,
 * any other in its own, each with the host's customization for that shape when there is one. For a
 * signed-in owner or co-host (`view_event`, checked once); then one read each of the event, its
 * designs, its artwork and its customizations, and every artwork signed for
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
    .select(`active_card_design_id, active_card_shape, status, published_at, ${CARD_EVENT_COLUMNS}`)
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  const row = event as EventRow | null;
  if (!row) return [];

  const { data: designData, error: designError } = await admin
    .from("card_designs")
    .select(CARD_DESIGN_COLUMNS)
    .eq("event_id", eventId)
    .order("round", { ascending: true });
  if (designError) throw designError;
  const { data: artData, error: artError } = await admin
    .from("card_art_assets")
    .select(`card_design_id, ${CARD_ART_COLUMNS}`)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (artError) throw artError;
  const { data: customizationData, error: customizationError } = await admin
    .from("card_customizations")
    .select("card_design_id, shape, revision, boxes, updated_by, updated_at")
    .eq("event_id", eventId);
  if (customizationError) throw customizationError;
  const customizations = (customizationData ?? []) as CustomizationRow[];

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
          eventId,
          event: row,
          design,
          artworks: artByDesign.get(design.id) ?? [],
          active: design.id === row.active_card_design_id,
          now,
          customizationOf: async (id, shape) =>
            customizations.find((c) => c.card_design_id === id && c.shape === shape) ?? null,
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
