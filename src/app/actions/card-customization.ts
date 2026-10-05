"use server";

import { z } from "zod";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess } from "@/lib/auth/event-access";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { boxesToStore } from "@/lib/card/customization";
import { validateWordingText } from "@/lib/card/entry";
import { cardTextFitsEveryDesign } from "@/lib/card/entry-fit.server";
import { CARD_SHAPES, type CardShape } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { parseEditorBoxes, parseStoredBoxes } from "@/lib/card/text-box-schema";
import { cardFontMetrics } from "@/lib/card/text/card-fonts.server";
import { cardTextFieldErrors } from "@/lib/events/card-text";
import { CARD_TEXT_FIT_MESSAGE, cardTextFitErrors } from "@/lib/events/card-text-fit.server";
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
  type ReadDesign,
} from "@/lib/generation/card-record.server";
import {
  cardContents,
  customizedText,
  fontsOf,
  readCustomization,
  rebreakEventCustomizations,
  storedSeed,
  type CardContents,
  type CustomizationRow,
  type DbClient,
} from "@/lib/generation/customization.server";
import { CARD_CUSTOMIZATION_STALE_SQLSTATE, type Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * The card editor's saves (`spec.md §20`; `docs/card-system.md §7`; `docs/screen-spec.md`
 * `card-editor`): `saveCardCustomization` for every edit and `resetCardCustomization` for `Reset
 * card`. For the event's owner or a co-host, before and after publish (`spec.md §8.1`, §25: the
 * card editor's edits update the live card). No model is called and no design, artwork or ink is
 * written (`spec.md §31` "Card-editor edits and fact edits never mutate a design and never call a
 * model").
 *
 * Every save carries the revision the editor read (0 before the first edit). A save based on any
 * other revision — a collaborator saved meanwhile — is refused as `conflict` with the latest
 * customization, and the editor reloads it with a notice (`spec.md §20.5`). The database decides
 * that under its own check (`save_card_customization`, PT409), whatever this read.
 *
 * Lines are the server's (`spec.md §20.4`): the editor's are ignored, and each box's lines are kept
 * from the version it replaces while its words, width, font, size, spacing and case are unchanged,
 * and broken afresh otherwise (`boxesToStore`). The title box writes `Event.title` with the save, in
 * one transaction (`save_card_customization_with_title`), after the title's entry and fit checks, as
 * the details form checks it; then every other customization's title box is re-broken. Fact boxes
 * stay linked: their words are the event's, never the box's.
 */

const MAX_REVISION = 2_147_483_647;

const saveSchema = z.object({
  eventId: z.uuid(),
  designId: z.uuid(),
  shape: z.enum(CARD_SHAPES),
  /** The revision the editor's boxes are based on; 0 when the card had no customization. */
  revision: z.number().int().min(0).max(MAX_REVISION),
  boxes: z.unknown(),
});

const resetSchema = saveSchema.omit({ boxes: true });

export type SaveCardCustomizationInput = z.input<typeof saveSchema>;
export type ResetCardCustomizationInput = z.input<typeof resetSchema>;

/** A customization as the editor shows it: Creation Mode's words in its stored boxes. */
export interface EditorCustomization {
  revision: number;
  updatedAt: string;
  /**
   * The user who saved it last, for the conflict notice ("<Name> just made changes"): the editor
   * names them from the event's collaborators.
   */
  updatedBy: string | null;
  /**
   * The boxes to draw (`InvitationCard`): stored lines, with linked boxes showing Creation Mode's
   * words (`customizedText`).
   */
  boxes: TextBox[];
  /** Ids of the fact boxes showing a value that needs the host's confirmation. */
  unconfirmed: string[];
  /** The effective title after the save. */
  title: string;
  /**
   * The stored boxes did not parse (written outside the editor): `boxes` are the generated layout,
   * and the next save replaces them.
   */
  unreadable: boolean;
}

export type SaveCardCustomizationResult =
  | { ok: true; customization: EditorCustomization }
  /** Someone saved first; `latest` is what is stored now (null: no customization any more). */
  | { ok: false; reason: "conflict"; latest: EditorCustomization | null }
  | { ok: false; reason: "invalid"; error: string; fieldErrors: Record<string, string> }
  /**
   * Not the event's owner or a co-host, no such event, or not a design and shape of it that has
   * artwork: one answer for all, so this never says whether an event exists (`spec.md §27`).
   */
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "failed"; error: string };

export type ResetCardCustomizationResult =
  /** `customization` null: the card had none, so it already shows its generated layout. */
  | { ok: true; customization: EditorCustomization | null }
  | { ok: false; reason: "conflict"; latest: EditorCustomization | null }
  | { ok: false; reason: "invalid"; error: string; fieldErrors: Record<string, string> }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "failed"; error: string };

const CHECK_FIELDS = "Check the highlighted fields.";
const TRY_AGAIN = "Couldn't save. Try again.";

/** A request that is not a save at all (a malformed id, shape or revision). Nothing is read. */
function invalidRequest(error: z.ZodError): {
  ok: false;
  reason: "invalid";
  error: string;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues)
    fieldErrors[issue.path.join(".") || "request"] ??= issue.message;
  return { ok: false, reason: "invalid", error: CHECK_FIELDS, fieldErrors };
}

/** One design and shape of the event, as the editor edits it. */
interface EditedCard {
  event: CardEventRow;
  design: ReadDesign;
  ink: string;
  contents: CardContents;
  stored: CustomizationRow | null;
}

async function loadEditedCard(
  client: DbClient,
  eventId: string,
  designId: string,
  shape: CardShape,
  now: Date,
): Promise<EditedCard | null> {
  const [eventResult, designResult, artResult, stored] = await Promise.all([
    client.from("events").select(CARD_EVENT_COLUMNS).eq("id", eventId).maybeSingle(),
    client
      .from("card_designs")
      .select(CARD_DESIGN_COLUMNS)
      .eq("id", designId)
      .eq("event_id", eventId)
      .maybeSingle(),
    client
      .from("card_art_assets")
      .select(CARD_ART_COLUMNS)
      .eq("card_design_id", designId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    readCustomization(client, eventId, designId, shape),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (designResult.error) throw designResult.error;
  if (artResult.error) throw artResult.error;
  if (!eventResult.data || !designResult.data) return null;
  // A shape is edited only once an artwork of the design fits it (`save_card_customization`).
  const art = artworkFor((artResult.data ?? []) as ArtRow[], shape);
  if (!art) return null;
  const event = eventResult.data as CardEventRow;
  const design = designOf(designResult.data as DesignRow);
  return {
    event,
    design,
    ink: zoneInk(art.ink, shape).ink,
    contents: await cardContents(event, design.wording, now),
    stored,
  };
}

async function editorView(
  card: { design: ReadDesign; ink: string; contents: CardContents },
  shape: CardShape,
  row: CustomizationRow,
): Promise<EditorCustomization> {
  const { host } = card.contents;
  const parsed = parseStoredBoxes(row.boxes);
  let boxes: TextBox[];
  let unconfirmed: string[];
  if (parsed.ok) {
    ({ boxes, unconfirmed } = await customizedText(parsed.boxes, host.content, host.unconfirmed));
  } else {
    boxes = await generatedTextLayer({
      layout: card.design.layout,
      shape,
      pairing: card.design.pairing,
      content: host.content,
      ink: card.ink,
    });
    const marked = new Set<string>(host.unconfirmed);
    unconfirmed = boxes
      .filter((b) => b.source.kind === "fact" && marked.has(b.source.slot) && b.lines.length > 0)
      .map((b) => b.id);
  }
  return {
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    boxes,
    unconfirmed,
    title: card.contents.title,
    unreadable: !parsed.ok,
  };
}

/** The latest stored customization of the card, as the editor shows it after a conflict. */
async function latestView(
  client: DbClient,
  eventId: string,
  designId: string,
  shape: CardShape,
): Promise<EditorCustomization | null> {
  const card = await loadEditedCard(client, eventId, designId, shape, new Date());
  if (!card?.stored) return null;
  return editorView(card, shape, card.stored);
}

type WriteOutcome =
  { ok: true } | { ok: false; reason: "conflict" | "not_found" | "too_large" | "failed" };

/** What a refused write of `save_card_customization` means for the editor. */
function writeOutcome(error: { code?: string; message?: string } | null): WriteOutcome {
  if (!error) return { ok: true };
  switch (error.code) {
    case CARD_CUSTOMIZATION_STALE_SQLSTATE:
      return { ok: false, reason: "conflict" };
    case "42501":
    case "22023":
      // Not a member, or a design and shape this event cannot edit: checked before writing, so
      // only a change meanwhile (membership removed, design gone) reaches here.
      return { ok: false, reason: "not_found" };
    case "23514":
      return { ok: false, reason: "too_large" };
    default:
      return { ok: false, reason: "failed" };
  }
}

async function authorize(eventId: string): Promise<boolean> {
  try {
    await requireEventAccess(eventId, "edit_event_content");
    return true;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return false;
    throw error;
  }
}

/**
 * Checks for the words the host typed that a fresh layout must always fit (`spec.md §20.2`): a
 * changed title — the details form's entry and fit checks — and a changed invitation line — the
 * wording slot's limit and fit, so carried words always fit (`docs/card-system.md §7`). Field
 * errors keyed `boxes.<index>.text`.
 */
async function wordingErrors(
  boxes: readonly { source: TextBox["source"]; id: string; text?: string }[],
  previous: readonly TextBox[],
  title: string | null,
): Promise<Record<string, string> | null> {
  const errors: Record<string, string> = {};
  const titleIndex = boxes.findIndex(
    (b) => b.source.kind === "wording" && b.source.slot === "title",
  );
  if (title !== null) {
    const entry = cardTextFieldErrors({ title });
    const fit = entry ? null : await cardTextFitErrors({ title });
    const message = (entry ?? fit)?.title;
    if (message) errors[`boxes.${Math.max(titleIndex, 0)}.text`] = message;
  }
  const before = new Map(previous.map((b) => [b.id, b]));
  for (const [i, box] of boxes.entries()) {
    if (box.source.kind !== "wording" || box.source.slot !== "invitationLine") continue;
    const text = box.text ?? "";
    if (before.get(box.id)?.text === text) continue;
    const entry = validateWordingText("invitationLine", text);
    if (!entry.ok) {
      errors[`boxes.${i}.text`] = entry.message;
    } else if (!(await cardTextFitsEveryDesign("invitationLine", text))) {
      errors[`boxes.${i}.text`] = CARD_TEXT_FIT_MESSAGE;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Save the card editor's boxes for one design and shape of the event (see the module comment).
 * Never throws for a refusal: invalid input, a stale revision and a caller who may not edit are
 * outcomes; an unexpected failure is `failed`, logged.
 */
export async function saveCardCustomization(
  input: SaveCardCustomizationInput,
): Promise<SaveCardCustomizationResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(parsed.error);
  const { eventId, designId, shape, revision } = parsed.data;
  const incoming = parseEditorBoxes(parsed.data.boxes);
  if (!incoming.ok) {
    return { ok: false, reason: "invalid", error: CHECK_FIELDS, fieldErrors: incoming.fieldErrors };
  }
  if (!(await authorize(eventId))) return { ok: false, reason: "not_found" };

  try {
    // As the collaborator: row-level security scopes every read and write to their events.
    const supabase = await createClient();
    const card = await loadEditedCard(supabase, eventId, designId, shape, new Date());
    if (!card) return { ok: false, reason: "not_found" };
    if ((card.stored?.revision ?? 0) !== revision) {
      return {
        ok: false,
        reason: "conflict",
        latest: card.stored ? await editorView(card, shape, card.stored) : null,
      };
    }

    // What this save replaces: the stored boxes at that revision, or the seed of a first edit.
    let previous: TextBox[];
    if (card.stored) {
      const stored = parseStoredBoxes(card.stored.boxes);
      previous = stored.ok ? stored.boxes : [];
    } else {
      previous = await storedSeed({
        design: card.design,
        shape,
        ink: card.ink,
        contents: card.contents,
      });
    }

    const newTitle =
      incoming.title !== null && incoming.title !== card.contents.title ? incoming.title : null;
    const wording = await wordingErrors(incoming.boxes, previous, newTitle);
    if (wording) return { ok: false, reason: "invalid", error: CHECK_FIELDS, fieldErrors: wording };

    const saved =
      newTitle === null ? card.contents.saved : { ...card.contents.saved, title: newTitle };
    const metrics = await cardFontMetrics(fontsOf(incoming.boxes));
    const toStore = boxesToStore({ previous, incoming: incoming.boxes, saved, metrics });
    if (!toStore.ok) {
      return {
        ok: false,
        reason: "invalid",
        error: CHECK_FIELDS,
        fieldErrors: toStore.fieldErrors,
      };
    }

    const args = {
      p_event_id: eventId,
      p_card_design_id: designId,
      p_shape: shape,
      p_boxes: toStore.boxes as unknown as Json,
      p_expected_revision: revision,
    };
    const { error } =
      newTitle === null
        ? await supabase.rpc("save_card_customization", args)
        : await supabase.rpc("save_card_customization_with_title", { ...args, p_title: newTitle });
    const outcome = writeOutcome(error);
    if (!outcome.ok) {
      switch (outcome.reason) {
        case "conflict":
          return {
            ok: false,
            reason: "conflict",
            latest: await latestView(supabase, eventId, designId, shape),
          };
        case "not_found":
          return { ok: false, reason: "not_found" };
        case "too_large":
          return {
            ok: false,
            reason: "invalid",
            error: "This card has more text than it can hold — please remove some.",
            fieldErrors: {},
          };
        case "failed":
          console.error("saveCardCustomization: the save failed", { eventId, code: error?.code });
          return { ok: false, reason: "failed", error: TRY_AGAIN };
      }
    }

    if (newTitle !== null) {
      // The title box of every other customization shows the new title too.
      try {
        await rebreakEventCustomizations(supabase, eventId);
      } catch (rebreakError) {
        console.error("saveCardCustomization: re-breaking the title elsewhere failed", {
          eventId,
          error: rebreakError,
        });
      }
    }

    const after = await loadEditedCard(supabase, eventId, designId, shape, new Date());
    if (!after?.stored) return { ok: false, reason: "not_found" };
    return { ok: true, customization: await editorView(after, shape, after.stored) };
  } catch (error) {
    console.error("saveCardCustomization: the save failed", { eventId, error });
    return { ok: false, reason: "failed", error: TRY_AGAIN };
  }
}

/**
 * `Reset card` (`spec.md §20.5`; `docs/card-system.md §7`): a new revision of this design and
 * shape's customization with the seed re-applied — the generated layout, fonts, colours and
 * invitation line, with a box for every fact slot — never a delete, so a collaborator's stale save
 * is still refused after it. `Event.title` and the event's details are not reverted; other shapes'
 * and designs' customizations are kept. A card with no customization already shows its generated
 * layout: nothing is written.
 */
export async function resetCardCustomization(
  input: ResetCardCustomizationInput,
): Promise<ResetCardCustomizationResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return invalidRequest(parsed.error);
  const { eventId, designId, shape, revision } = parsed.data;
  if (!(await authorize(eventId))) return { ok: false, reason: "not_found" };

  try {
    const supabase = await createClient();
    const card = await loadEditedCard(supabase, eventId, designId, shape, new Date());
    if (!card) return { ok: false, reason: "not_found" };
    if ((card.stored?.revision ?? 0) !== revision) {
      return {
        ok: false,
        reason: "conflict",
        latest: card.stored ? await editorView(card, shape, card.stored) : null,
      };
    }
    if (!card.stored) return { ok: true, customization: null };

    const seed = await storedSeed({
      design: card.design,
      shape,
      ink: card.ink,
      contents: card.contents,
    });
    const { error } = await supabase.rpc("save_card_customization", {
      p_event_id: eventId,
      p_card_design_id: designId,
      p_shape: shape,
      p_boxes: seed as unknown as Json,
      p_expected_revision: revision,
    });
    const outcome = writeOutcome(error);
    if (!outcome.ok) {
      if (outcome.reason === "conflict") {
        return {
          ok: false,
          reason: "conflict",
          latest: await latestView(supabase, eventId, designId, shape),
        };
      }
      if (outcome.reason === "not_found") return { ok: false, reason: "not_found" };
      console.error("resetCardCustomization: the reset failed", { eventId, code: error?.code });
      return { ok: false, reason: "failed", error: TRY_AGAIN };
    }

    const after = await loadEditedCard(supabase, eventId, designId, shape, new Date());
    if (!after?.stored) return { ok: false, reason: "not_found" };
    return { ok: true, customization: await editorView(after, shape, after.stored) };
  } catch (error) {
    console.error("resetCardCustomization: the reset failed", { eventId, error });
    return { ok: false, reason: "failed", error: TRY_AGAIN };
  }
}
