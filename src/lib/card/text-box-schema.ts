/**
 * The `TextBox` schema (`spec.md §20.5`; `docs/card-system.md §5`, §7) and the card editor's
 * per-box limits (`spec.md §20.2`).
 *
 * Stored boxes are untrusted: `save_card_customization` is reachable over RPC and checks only that
 * they are objects (`20261004000000_phase4_card_data.sql`). So every read parses them here
 * (`parseStoredBoxes`), and a customization that does not parse is an explicit state — the
 * generated layout with a notice — never a broken card and never a guess at what was meant. The
 * schema accepts exactly what `InvitationCard` and the link preview can draw (`card-data.ts`
 * `validateCardData`), plus the rules of the text layer: a known face (`text/card-fonts.ts`), the
 * source of each box's words, and unique ids.
 *
 * A save is held to more (`parseEditorBoxes`): the editor's limits on how many boxes a card has,
 * how much an added box says, and the range of every number, so a card stays something the editor
 * can show and the host can reach. Those are product limits, deliberately apart from the stored
 * schema: tightening one never makes a card saved before unreadable.
 *
 * Pure and isomorphic: the editor can run the same checks before it saves.
 */

import { z } from "zod";

import { isCanonicalHex } from "./color";
import { CARD_SLOT_IDS, FACT_SLOT_IDS, WORDING_LIMITS, WORDING_SLOT_IDS } from "./slots";
import type { TextBox } from "./text-box";
import { isKnownCardFont } from "./text/card-fonts";

/** Control characters and line terminators: a stored line is exactly one line. */
const LINE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** Control characters other than the line feed the host types as a hard break. */
const TEXT_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * The card editor's per-box limits (`spec.md §20.2`, "an added text box is bounded by a per-box
 * length limit set in the editor phase"; `docs/design-system.md §4.10a`). Card units: the card is
 * 1000 wide and 1400 (5:7) or 1000 (1:1) tall. Positions may run past the outline (clipped as
 * guests see it, `spec.md §20.1`), within a margin the editor can still bring back.
 */
export const CARD_EDITOR_LIMITS = {
  /** Boxes on one card: the generated slots (8) and room to add. */
  maxBoxes: 40,
  /** Characters of an added text box. */
  addedTextMax: 200,
  /** The title and invitation line keep the layout set's slot limits (`spec.md §20.2`). */
  titleMax: WORDING_LIMITS.title.max,
  invitationLineMax: WORDING_LIMITS.invitationLine.max,
  /** Top-left corner, card units. */
  position: { min: -1000, max: 2400 },
  width: { min: 20, max: 2000 },
  size: { min: 8, max: 400 },
  /** Degrees. */
  rotation: { min: -360, max: 360 },
  /** Em of the size (CSS `letter-spacing`). */
  letterSpacing: { min: -0.5, max: 2 },
  /** Multiple of the size. */
  lineHeight: { min: 0.5, max: 4 },
  z: { min: -10_000, max: 10_000 },
} as const;

/** Backstops for stored boxes: what any reader can hold, far above the editor's limits. */
const STORED = { maxBoxes: 500, maxText: 5000, maxLines: 1000, maxLine: 5000 } as const;

/** Box ids: the generated slots' names, or the editor's own (a UUID, say). */
const BOX_ID = /^[A-Za-z0-9_-]{1,64}$/;

const finiteNumber = z.number().refine(Number.isFinite, "must be a finite number");
const positiveNumber = finiteNumber.refine((v) => v > 0, "must be positive");

const fontSchema = z
  .object({
    family: z
      .string()
      .min(1)
      .max(200)
      .refine((f) => !LINE_CONTROL.test(f) && f.trim() === f),
    weight: z.number().int().min(1).max(1000),
    italic: z.boolean(),
  })
  .refine(isKnownCardFont, { message: "This font isn't available." });

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wording"), slot: z.enum(WORDING_SLOT_IDS) }),
  z.object({ kind: z.literal("fact"), slot: z.enum(FACT_SLOT_IDS) }),
  z.object({ kind: z.literal("custom") }),
]);

const textSchema = z
  .string()
  .max(STORED.maxText)
  .refine((t) => !TEXT_CONTROL.test(t), "contains a control character");

const storedBoxSchema = z.object({
  id: z.string().regex(BOX_ID),
  source: sourceSchema,
  text: textSchema.optional(),
  x: finiteNumber,
  y: finiteNumber,
  width: positiveNumber,
  rotation: finiteNumber,
  font: fontSchema,
  size: positiveNumber,
  color: z.string().refine(isCanonicalHex, "must be #RRGGBB"),
  align: z.enum(["left", "center", "right"]),
  letterSpacing: finiteNumber,
  lineHeight: positiveNumber,
  textCase: z.enum(["none", "uppercase", "lowercase"]),
  // CSS `z-index` takes an integer (`card-data.ts`).
  z: z.number().int(),
  lines: z
    .array(
      z
        .string()
        .max(STORED.maxLine)
        .refine((l) => !LINE_CONTROL.test(l), "a line is not one line"),
    )
    .max(STORED.maxLines),
});

type ParsedBox = z.infer<typeof storedBoxSchema>;

/**
 * Where each box's words live (`spec.md §20.5`): the invitation line and added boxes carry their
 * text; the title's is `Event.title` and a fact's is the event's, so those carry none.
 */
function checkTextPlacement(box: ParsedBox, ctx: z.RefinementCtx, path: (string | number)[]) {
  const ownsText =
    box.source.kind === "custom" ||
    (box.source.kind === "wording" && box.source.slot === "invitationLine");
  if (ownsText && box.text === undefined) {
    ctx.addIssue({ code: "custom", path: [...path, "text"], message: "is required" });
  }
  if (!ownsText && box.text !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "text"],
      message: "lives on the event, not the box",
    });
  }
}

/** Unique ids, and no added box wearing a generated slot's name (`layoutCard` keys by them). */
function checkIds(boxes: readonly ParsedBox[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  boxes.forEach((box, i) => {
    if (seen.has(box.id)) {
      ctx.addIssue({ code: "custom", path: [i, "id"], message: "is not unique" });
    }
    seen.add(box.id);
    if (box.source.kind === "custom" && (CARD_SLOT_IDS as readonly string[]).includes(box.id)) {
      ctx.addIssue({ code: "custom", path: [i, "id"], message: "is a card slot's name" });
    }
  });
}

const storedBoxesSchema = z
  .array(storedBoxSchema)
  .max(STORED.maxBoxes)
  .superRefine((boxes, ctx) => {
    boxes.forEach((box, i) => checkTextPlacement(box, ctx, [i]));
    checkIds(boxes, ctx);
  });

function issuesOf(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "boxes"}: ${issue.message}`)
    .join("; ");
}

export type ParsedStoredBoxes = { ok: true; boxes: TextBox[] } | { ok: false; issues: string };

/**
 * A stored customization's boxes (`card_customizations.boxes`), parsed. Never throws: a value that
 * is not a valid text layer is `{ ok: false }`, with the first issues for the log, and the caller
 * shows the generated layout with a notice.
 */
export function parseStoredBoxes(value: unknown): ParsedStoredBoxes {
  const parsed = storedBoxesSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };
  return { ok: true, boxes: parsed.data.map(toTextBox) };
}

function toTextBox(box: ParsedBox): TextBox {
  return {
    id: box.id,
    source: { ...box.source },
    ...(box.text !== undefined ? { text: box.text } : {}),
    x: box.x,
    y: box.y,
    width: box.width,
    rotation: box.rotation,
    font: { family: box.font.family, weight: box.font.weight, italic: box.font.italic },
    size: box.size,
    color: box.color,
    align: box.align,
    letterSpacing: box.letterSpacing,
    lineHeight: box.lineHeight,
    textCase: box.textCase,
    z: box.z,
    lines: [...box.lines],
  };
}

// ---------------------------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------------------------

const L = CARD_EDITOR_LIMITS;
const between = (min: number, max: number) =>
  finiteNumber.refine((v) => v >= min && v <= max, `must be between ${min} and ${max}`);

/** The host's text: CRLF and CR become the line feed the card's line breaking reads. */
const editorText = z
  .string()
  .transform((t) => t.replace(/\r\n?/g, "\n"))
  .refine((t) => !TEXT_CONTROL.test(t), "contains a character the card can't show");

const editorBoxSchema = z.object({
  id: z.string().regex(BOX_ID),
  source: sourceSchema,
  /**
   * The invitation line's and an added box's words; for the title box, the title the host typed
   * (it is written to `Event.title`, never stored on the box); ignored on a fact box, whose words
   * are the event's.
   */
  text: editorText.optional(),
  x: between(L.position.min, L.position.max),
  y: between(L.position.min, L.position.max),
  width: between(L.width.min, L.width.max),
  rotation: between(L.rotation.min, L.rotation.max),
  font: fontSchema,
  size: between(L.size.min, L.size.max),
  color: z.string().refine(isCanonicalHex, "must be #RRGGBB"),
  align: z.enum(["left", "center", "right"]),
  letterSpacing: between(L.letterSpacing.min, L.letterSpacing.max),
  lineHeight: between(L.lineHeight.min, L.lineHeight.max),
  textCase: z.enum(["none", "uppercase", "lowercase"]),
  z: z.number().int().min(L.z.min).max(L.z.max),
  /** Never trusted: the server breaks every line itself (`spec.md §20.4`). */
  lines: z.unknown().optional(),
});

type EditorBox = z.infer<typeof editorBoxSchema>;

const editorBoxesSchema = z
  .array(editorBoxSchema)
  .max(L.maxBoxes, `A card can have at most ${L.maxBoxes} text boxes.`)
  .superRefine((boxes, ctx) => {
    boxes.forEach((box, i) => {
      const slot = box.source.kind === "custom" ? null : box.source.slot;
      const text = box.text;
      if (box.source.kind === "custom" || slot === "invitationLine") {
        if (text === undefined) {
          ctx.addIssue({ code: "custom", path: [i, "text"], message: "Add some text." });
          return;
        }
        const max = slot === "invitationLine" ? L.invitationLineMax : L.addedTextMax;
        if (text.trim().length > max) {
          ctx.addIssue({
            code: "custom",
            path: [i, "text"],
            message: `The card has room for ${max} characters here — please shorten this to fit.`,
          });
        }
      }
      if (slot === "title" && text !== undefined && text.trim() === "") {
        ctx.addIssue({ code: "custom", path: [i, "text"], message: "Add a title." });
      }
    });
    checkIds(boxes as unknown as ParsedBox[], ctx);
  });

/** A box as the editor sends it: the stored fields, the words where they belong, no lines yet. */
export type EditorTextBox = Omit<TextBox, "lines">;

export type ParsedEditorBoxes =
  | {
      ok: true;
      /** Without lines; the title box without text. */
      boxes: EditorTextBox[];
      /** The title the host typed in a title box, trimmed, if one carries text. */
      title: string | null;
    }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * The boxes of a save, held to the stored schema and the editor's limits. Returns field errors
 * keyed `boxes.<index>.<field>`. Lines the editor sends are ignored. A title box's text is the title
 * the host typed (every title box must agree), returned apart; a fact box's text is dropped.
 */
export function parseEditorBoxes(value: unknown): ParsedEditorBoxes {
  const parsed = editorBoxesSchema.safeParse(value);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = ["boxes", ...issue.path].join(".");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  let title: string | null = null;
  const fieldErrors: Record<string, string> = {};
  const boxes = parsed.data.map((box: EditorBox, i): EditorTextBox => {
    const isTitle = box.source.kind === "wording" && box.source.slot === "title";
    if (isTitle && box.text !== undefined) {
      const typed = box.text.trim();
      if (title !== null && typed !== title) {
        fieldErrors[`boxes.${i}.text`] = "Every title box shows the same title.";
      }
      title = typed;
    }
    // Checked above: the invitation line and an added box always carry text.
    const ownsText =
      box.source.kind === "custom" ||
      (box.source.kind === "wording" && box.source.slot === "invitationLine");
    return {
      id: box.id,
      source: { ...box.source },
      ...(ownsText ? { text: box.text ?? "" } : {}),
      x: box.x,
      y: box.y,
      width: box.width,
      rotation: box.rotation,
      font: { family: box.font.family, weight: box.font.weight, italic: box.font.italic },
      size: box.size,
      color: box.color,
      align: box.align,
      letterSpacing: box.letterSpacing,
      lineHeight: box.lineHeight,
      textCase: box.textCase,
      z: box.z,
    };
  });
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, boxes, title };
}
