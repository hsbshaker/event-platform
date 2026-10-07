import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { carriedBoxesFrom, seedBoxes } from "@/lib/card/customization";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import {
  effectiveCardTitle,
  guestCardContent,
  parsePromptFacts,
  type RevealCardContent,
} from "@/lib/card/facts";
import { pairingFaces } from "@/lib/card/layout-card";
import { zoneFor } from "@/lib/card/layouts";
import { revealContentFor } from "@/lib/card/reveal-content.server";
import { CARD_SHAPES, proportionOf, type CardShape } from "@/lib/card/shapes";
import type { CardSlotId } from "@/lib/card/slots";
import { isLinkedBox, withLinkedLines, type CardContent, type TextBox } from "@/lib/card/text-box";
import type { TextShift } from "@/lib/card/text-space";
import { parseStoredBoxes } from "@/lib/card/text-box-schema";
import { cardFontMetrics } from "@/lib/card/text/card-fonts.server";
import type { FontRef } from "@/lib/card/text/metrics";
import {
  CARD_CUSTOMIZATION_STALE_SQLSTATE,
  type Database,
  type Json,
} from "@/lib/supabase/database.types";

import {
  artworkFor,
  CARD_ART_COLUMNS,
  CARD_DESIGN_COLUMNS,
  CARD_EVENT_COLUMNS,
  designOf,
  eventFactsOf,
  zoneInk,
  type ArtRow,
  type CardEventRow,
  type DesignRow,
  type ReadDesign,
} from "./card-record.server";

/**
 * The card editor's data path on the server (`spec.md §20.2`, §20.4–§20.6; `docs/card-system.md
 * §5`, §7): reading a customization for the card component, the seed of a first edit or a reset,
 * re-breaking every customization after the event's words change, and carrying the host's words
 * to a fresh layout on a design or shape switch. No model is called anywhere here (`spec.md §32
 * #20`, §31 "Card-editor edits and fact edits never mutate a design and never call a model"), and
 * no design, artwork or ink is written (`spec.md §32 #25`, #27).
 *
 * Callers authorize first (`requireEventAccess`); the clients passed in are either the signed-in
 * collaborator's (row-level security applies, and customization writes go through
 * `save_card_customization`) or the service role's, after that check, for the event checked only.
 */

export type DbClient = SupabaseClient<Database>;

/** The words a card shows, for one design of the event. */
export interface CardContents {
  /** The effective title (`effectiveCardTitle`). */
  title: string;
  /** Creation Mode's words (`revealContentFor`): saved facts, prompt-stated ones, placeholders. */
  host: RevealCardContent;
  /**
   * The saved words only (`guestCardContent`): what guests see, and what a customization's linked
   * boxes are broken from (`customization.ts`).
   */
  saved: CardContent;
}

/** The words `event` puts on a card of a design with this wording. */
export async function cardContents(
  event: CardEventRow,
  wording: { title: string; invitationLine: string },
  now: Date,
): Promise<CardContents> {
  const title = effectiveCardTitle(event.title, wording.title);
  const words = { title, invitationLine: wording.invitationLine };
  const facts = eventFactsOf(event);
  const host = await revealContentFor({
    wording: words,
    event: facts,
    promptFacts: parsePromptFacts(event.prompt_facts),
    now,
  });
  return { title, host, saved: guestCardContent({ wording: words, event: facts }) };
}

/** Every face `boxes` are set in, once each. */
export function fontsOf(boxes: readonly Pick<TextBox, "font">[]): FontRef[] {
  const faces = new Map<string, FontRef>();
  for (const { font } of boxes) {
    faces.set(`${font.family}|${font.weight}|${font.italic ? "i" : "n"}`, { ...font });
  }
  return [...faces.values()];
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

export interface CustomizationRow {
  card_design_id: string;
  shape: CardShape;
  revision: number;
  boxes: Json;
  updated_by: string | null;
  updated_at: string;
}

const CUSTOMIZATION_COLUMNS = "card_design_id, shape, revision, boxes, updated_by, updated_at";

/** The customization of one design and shape of the event, if the host has one. */
export async function readCustomization(
  client: DbClient,
  eventId: string,
  designId: string,
  shape: CardShape,
): Promise<CustomizationRow | null> {
  const { data, error } = await client
    .from("card_customizations")
    .select(CUSTOMIZATION_COLUMNS)
    .eq("event_id", eventId)
    .eq("card_design_id", designId)
    .eq("shape", shape)
    .maybeSingle();
  if (error) throw error;
  return (data as CustomizationRow | null) ?? null;
}

/** A customization's boxes as the card component draws them for one audience. */
export interface CustomizedText {
  boxes: TextBox[];
  /** Ids of the fact boxes showing a value that needs the host's confirmation (`spec.md §7.3`). */
  unconfirmed: string[];
}

/**
 * Stored boxes ready to draw for `content` — Creation Mode's words (`CardContents.host.content`),
 * or a guest's (`CardContents.saved`): every linked box set in lines that spell its words
 * (`withLinkedLines`), so a fact or title changed since a box was broken never shows stale, a
 * placeholder shows only in Creation Mode, and a fact the host has not saved shows nothing to
 * guests. `unconfirmedSlots` marks the fact boxes that show a value to confirm.
 */
export async function customizedText(
  stored: readonly TextBox[],
  content: CardContent,
  unconfirmedSlots: readonly CardSlotId[] = [],
): Promise<CustomizedText> {
  const metrics = await cardFontMetrics(fontsOf(stored.filter(isLinkedBox)));
  const { boxes } = withLinkedLines(stored, content, metrics);
  const marked = new Set<string>(unconfirmedSlots);
  return {
    boxes,
    unconfirmed: boxes
      .filter((b) => b.source.kind === "fact" && marked.has(b.source.slot) && b.lines.length > 0)
      .map((b) => b.id),
  };
}

// ---------------------------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------------------------

/**
 * The seed of a design and shape's customization (`docs/card-system.md §7`, "First edit of a
 * card" and `Reset card`): its generated layout as Creation Mode shows it — the zone's resolved
 * ink, the design's pairing and invitation line, the effective title and the host's words — with a
 * box for every fact slot, stored as `seedBoxes` stores it.
 */
export async function storedSeed(input: {
  design: ReadDesign;
  shape: CardShape;
  /** The zone's stored ink for the artwork the card is drawn with. */
  ink: string;
  /** Where that artwork's stored placement starts the generated words (`zoneInk`). */
  shift?: TextShift;
  contents: CardContents;
}): Promise<TextBox[]> {
  const { design, shape, ink, shift, contents } = input;
  const generated = await generatedTextLayer({
    layout: design.layout,
    shape,
    pairing: design.pairing,
    content: contents.host.content,
    ink,
    ...(shift ? { shift } : {}),
  });
  const metrics = await cardFontMetrics(fontsOf(generated));
  return seedBoxes(generated, contents.saved, metrics);
}

// ---------------------------------------------------------------------------------------------
// Re-breaking after the event's words change
// ---------------------------------------------------------------------------------------------

/** Attempts per customization before a re-break gives way to collaborators' saves. */
export const REBREAK_ATTEMPTS = 3;

function isStale(error: { code?: string } | null): boolean {
  return error?.code === CARD_CUSTOMIZATION_STALE_SQLSTATE;
}

/**
 * After the event's words change — a fact, or the title (`updateEventDetails`; a card-editor save
 * that edits the title) — re-break the linked boxes of every customization of the event whose
 * stored lines no longer spell their words (`docs/card-system.md §7`: "A fact edit … re-breaks that
 * fact's boxes in every customization of the event on save, so a card restored later never shows
 * stale lines"; the title box likewise, since it shows `Event.title`). Only those boxes change;
 * each write is a save through `save_card_customization` with the revision read, so it bumps the
 * revision (a collaborator's open editor reloads) and never overwrites a save made meanwhile: a
 * stale write reads that customization again and re-breaks it from there.
 *
 * `client` is the signed-in collaborator's. A customization that does not parse is left as it is
 * (its readers show the generated layout with a notice). Returns the count written and the count
 * that could not be; failures are logged, and readers re-break on the fly in the meantime
 * (`customizedText`), so a missed write is never a stale card.
 */
export async function rebreakEventCustomizations(
  client: DbClient,
  eventId: string,
): Promise<{ updated: number; failed: number }> {
  const { data: rows, error } = await client
    .from("card_customizations")
    .select(CUSTOMIZATION_COLUMNS)
    .eq("event_id", eventId);
  if (error) throw error;
  const customizations = (rows ?? []) as CustomizationRow[];
  if (customizations.length === 0) return { updated: 0, failed: 0 };

  const { data: event, error: eventError } = await client
    .from("events")
    .select(CARD_EVENT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) return { updated: 0, failed: 0 };
  const designIds = [...new Set(customizations.map((c) => c.card_design_id))];
  const { data: designRows, error: designError } = await client
    .from("card_designs")
    .select("id, shape, layout, typography, wording")
    .eq("event_id", eventId)
    .in("id", designIds);
  if (designError) throw designError;
  const savedByDesign = new Map<string, CardContent>();
  for (const row of (designRows ?? []) as DesignRow[]) {
    const { wording } = designOf(row);
    const title = effectiveCardTitle((event as CardEventRow).title, wording.title);
    savedByDesign.set(
      row.id,
      guestCardContent({
        wording: { title, invitationLine: wording.invitationLine },
        event: eventFactsOf(event as CardEventRow),
      }),
    );
  }

  let updated = 0;
  let failed = 0;
  for (const first of customizations) {
    const saved = savedByDesign.get(first.card_design_id);
    if (!saved) continue;
    let row: CustomizationRow | null = first;
    for (let attempt = 0; row && attempt < REBREAK_ATTEMPTS; attempt += 1) {
      const parsed = parseStoredBoxes(row.boxes);
      if (!parsed.ok) break;
      const metrics = await cardFontMetrics(fontsOf(parsed.boxes.filter(isLinkedBox)));
      const { boxes, rebroken } = withLinkedLines(parsed.boxes, saved, metrics);
      if (rebroken.length === 0) break;
      const { error: saveError } = await client.rpc("save_card_customization", {
        p_event_id: eventId,
        p_card_design_id: row.card_design_id,
        p_shape: row.shape,
        p_boxes: boxes as unknown as Json,
        p_expected_revision: row.revision,
      });
      if (!saveError) {
        updated += 1;
        break;
      }
      if (!isStale(saveError) || attempt === REBREAK_ATTEMPTS - 1) {
        failed += 1;
        console.error("[card editor] re-breaking a customization failed", {
          eventId,
          designId: row.card_design_id,
          shape: row.shape,
          code: saveError.code,
        });
        break;
      }
      // Saved meanwhile: re-break the newer version.
      row = await readCustomization(client, eventId, row.card_design_id, row.shape);
    }
  }
  return { updated, failed };
}

// ---------------------------------------------------------------------------------------------
// Carrying words to a fresh layout
// ---------------------------------------------------------------------------------------------

export interface CardRef {
  designId: string;
  shape: CardShape;
}

/**
 * The card the event shows: its active design, in its active shape (`events.active_card_shape`,
 * else the design's own). Null with no active design.
 */
export async function activeCard(client: DbClient, eventId: string): Promise<CardRef | null> {
  const { data: event, error } = await client
    .from("events")
    .select("active_card_design_id, active_card_shape")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event?.active_card_design_id) return null;
  if (event.active_card_shape) {
    return { designId: event.active_card_design_id, shape: event.active_card_shape };
  }
  const { data: design, error: designError } = await client
    .from("card_designs")
    .select("shape")
    .eq("id", event.active_card_design_id)
    .eq("event_id", eventId)
    .maybeSingle();
  if (designError) throw designError;
  if (!design || !CARD_SHAPES.includes(design.shape)) return null;
  return { designId: event.active_card_design_id, shape: design.shape };
}

/** A carried layout, computed and ready to store as the destination's customization. */
export interface CarriedWords {
  eventId: string;
  to: CardRef;
  boxes: TextBox[];
  /** Who switched: the customization's `updated_by`. */
  userId: string;
}

/**
 * The host's words carried from the card being switched from to a design or shape with no
 * customization of its own (`spec.md §20.6`; `docs/card-system.md §7`, "Carrying words to a fresh
 * layout"). Null when there is nothing to carry: the same card, a destination that already has a
 * customization (it is shown instead), a source the host never edited (the new card shows its own
 * generated layout and wording), or a destination with no artwork for the shape yet (it is carried
 * when the artwork arrives).
 *
 * The title, the invitation line and every added box keep their words and fonts (`carryWords`);
 * `layoutCard` sets them in the destination's zone, in its pairing, with its resolved ink, for
 * Creation Mode's words (so the boxes sit where the host will see them), and the linked boxes are
 * stored as a customization stores them (`customization.ts`). The title is the event's effective
 * title for the destination: `Event.title` when the host has set one, else the destination's own
 * drafted title, since a switch never changes event content (`spec.md §20.6`).
 *
 * A source that does not parse carries nothing, with a log line; its own readers show the generated
 * layout with a notice. Throws when the carried layout has characters its faces lack (unreachable
 * for words that passed the entry checks), so a caller fails before switching rather than storing
 * lines a browser would draw differently.
 */
export async function carriedWords(
  admin: DbClient,
  input: { eventId: string; userId: string; from: CardRef; to: CardRef; now: Date },
): Promise<CarriedWords | null> {
  const { eventId, userId, from, to, now } = input;
  if (from.designId === to.designId && from.shape === to.shape) return null;
  if (await readCustomization(admin, eventId, to.designId, to.shape)) return null;
  const source = await readCustomization(admin, eventId, from.designId, from.shape);
  if (!source) return null;
  const parsed = parseStoredBoxes(source.boxes);
  if (!parsed.ok) {
    console.error("[card editor] a customization could not be read; nothing carried", {
      eventId,
      designId: from.designId,
      shape: from.shape,
      issues: parsed.issues,
    });
    return null;
  }

  const [eventResult, designResult, artResult] = await Promise.all([
    admin.from("events").select(CARD_EVENT_COLUMNS).eq("id", eventId).maybeSingle(),
    admin
      .from("card_designs")
      .select(CARD_DESIGN_COLUMNS)
      .eq("id", to.designId)
      .eq("event_id", eventId)
      .maybeSingle(),
    admin
      .from("card_art_assets")
      .select(CARD_ART_COLUMNS)
      .eq("card_design_id", to.designId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (designResult.error) throw designResult.error;
  if (artResult.error) throw artResult.error;
  if (!eventResult.data || !designResult.data) return null;
  const art = artworkFor((artResult.data ?? []) as ArtRow[], to.shape);
  if (!art) return null;

  const design = designOf(designResult.data as DesignRow);
  const { ink, shift } = zoneInk(art.ink, to.shape);
  const contents = await cardContents(eventResult.data as CardEventRow, design.wording, now);
  const pairing = pairingFaces(design.pairing);
  const metrics = await cardFontMetrics([
    pairing.display,
    pairing.body,
    ...fontsOf(parsed.boxes.filter((b) => b.source.kind !== "fact")),
  ]);
  const carried = carriedBoxesFrom({
    from: parsed.boxes,
    host: contents.host.content,
    saved: contents.saved,
    card: {
      zone: zoneFor(design.layout, to.shape),
      proportion: proportionOf(to.shape),
      pairing,
      ink,
      metrics,
    },
    placement: { shape: to.shape, shift },
  });
  if (Object.keys(carried.missingCharacters).length > 0) {
    throw new Error(
      `Carried words have characters their faces lack (${Object.keys(carried.missingCharacters).join(", ")})`,
    );
  }
  return { eventId, to, boxes: carried.boxes, userId };
}

/**
 * Store carried words as the destination's customization (`spec.md §20.6`: "the carried layout is
 * saved as the new card's customization"), at revision 1, as the signed-in collaborator who
 * switched: through `save_card_customization` creating it (expected revision 0), so the database
 * checks the member, the design and its artwork for the shape. A customization made meanwhile — by
 * a collaborator's edit or another switch — is kept, and this writes nothing. Returns whether it
 * was stored.
 */
export async function storeCarriedWords(client: DbClient, carried: CarriedWords): Promise<boolean> {
  const { error } = await client.rpc("save_card_customization", {
    p_event_id: carried.eventId,
    p_card_design_id: carried.to.designId,
    p_shape: carried.to.shape,
    p_boxes: carried.boxes as unknown as Json,
    p_expected_revision: 0,
  });
  if (!error) return true;
  if (isStale(error)) return false;
  throw error;
}

/**
 * `storeCarriedWords` once the switch it follows has committed (choosing a design, an instant shape
 * switch): a refusal other than a stale revision is logged, never thrown, so the switch still
 * reports what happened. The new card then shows its generated layout; the source customization is
 * kept, so switching back restores the words — as for new artwork (`run.server.ts`).
 */
export async function storeCarriedWordsAfterSwitch(
  client: () => Promise<DbClient>,
  carried: CarriedWords,
  context: string,
): Promise<void> {
  try {
    await storeCarriedWords(await client(), carried);
  } catch (error) {
    console.error(`[${context}] the host's words could not be carried`, {
      eventId: carried.eventId,
      designId: carried.to.designId,
      shape: carried.to.shape,
      // A database refusal is a plain object with a message, not an Error.
      error:
        error instanceof Error
          ? error.message
          : typeof (error as { message?: unknown })?.message === "string"
            ? (error as { message: string }).message
            : typeof error,
    });
  }
}

/**
 * `storeCarriedWords` for a shape switch's new artwork, which is persisted after the request that
 * began it, with no session (`run.server.ts`): with the service role, for the generation's own
 * event, design and shape and its requesting collaborator as `updated_by`. Inserts at revision 1,
 * and keeps a customization made meanwhile. Returns whether it was stored.
 */
export async function storeCarriedWordsAsServer(
  admin: DbClient,
  carried: CarriedWords,
): Promise<boolean> {
  const { data, error } = await admin
    .from("card_customizations")
    .upsert(
      {
        event_id: carried.eventId,
        card_design_id: carried.to.designId,
        shape: carried.to.shape,
        boxes: carried.boxes as unknown as Json,
        updated_by: carried.userId,
      },
      { onConflict: "event_id,card_design_id,shape", ignoreDuplicates: true },
    )
    .select("revision");
  if (error) throw error;
  return (data ?? []).length > 0;
}
