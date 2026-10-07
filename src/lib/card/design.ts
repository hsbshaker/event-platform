/**
 * `CardDesign` (`docs/model-contracts.md §5.1`) and its deterministic validation
 * (`docs/card-system.md §4.1`, `docs/model-contracts.md §5.3`).
 *
 * The zod schema mirrors `docs/model-schemas/card-design.schema.json` (`card_design_schema_v3`);
 * `design.test.ts` asserts the two cannot drift. Enums are generated from the catalogs. The JSON
 * key for the font pairing choice is `typography`, as in the committed schema. v2 adds the art
 * brief's required `rendering` family (`renderings.ts`) and `aesthetic` mood. v3 adds the required
 * `refinement`: what a `Try another direction` design made — a change to `part` of the card, to
 * the `whole` look, or a new idea (`none`) — always `none` when the call carried no `changing`
 * (`docs/model-contracts.md §5.1`). Designs persisted under an earlier schema lack these fields;
 * they are immutable and never re-validated against this schema.
 *
 * Validation runs in order: (1) strict schema, (2) compatibility and refinement consistency. The
 * wording fact check (`wording.ts`) and direction distinctness are separate steps with their own
 * re-prompts.
 */

import { z } from "zod";

import { ART_MODES } from "./art-modes";
import { artModeCompatible, CARD_LAYOUT_IDS, layoutSupportsShape } from "./layouts";
import { RENDERINGS } from "./renderings";
import { CARD_SHAPES } from "./shapes";
import { WORDING_LIMITS } from "./slots";
import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "./typography";
import type { TypographyCategory, TypographyPairingId } from "./typography";

const pairingId = z.enum(
  TYPOGRAPHY_KEYS as readonly [TypographyPairingId, ...TypographyPairingId[]],
);

const text = (min: number, max: number) => z.string().min(min).max(max);

/**
 * What a design made (`card_design_schema_v3`): `part` — the card being changed with a change to
 * part of it; `whole` — the same idea with the whole look changed; `none` — a new idea (always, for
 * the first card and an empty box).
 */
export const REFINEMENTS = ["none", "part", "whole"] as const;
export type Refinement = (typeof REFINEMENTS)[number];

export const cardDesignSchema = z.strictObject({
  presentation: z.strictObject({
    name: text(2, 40),
    description: text(10, 140),
  }),
  shape: z.enum(CARD_SHAPES),
  layout: z.enum(CARD_LAYOUT_IDS),
  artMode: z.enum(ART_MODES),
  typography: z.strictObject({
    primary: pairingId,
    alternates: z
      .array(pairingId)
      .max(2)
      .refine((a) => new Set(a).size === a.length, { message: "alternates must be unique" }),
  }),
  wording: z.strictObject({
    title: text(WORDING_LIMITS.title.min, WORDING_LIMITS.title.max),
    invitationLine: text(WORDING_LIMITS.invitationLine.min, WORDING_LIMITS.invitationLine.max),
  }),
  artBrief: z.strictObject({
    subject: text(8, 300),
    rendering: z.enum(RENDERINGS),
    aesthetic: text(3, 40),
    medium: text(4, 160),
    mood: text(3, 160),
    palette: z.strictObject({
      description: text(3, 200),
      colors: z
        .array(z.string().regex(/^#[0-9A-Fa-f]{6}$/))
        .min(3)
        .max(5),
    }),
    texture: text(3, 160),
    avoid: z.array(text(2, 120)).max(8),
  }),
  refinement: z.enum(REFINEMENTS),
});

export type CardDesign = z.infer<typeof cardDesignSchema>;

export type CardDesignValidation =
  | { ok: true; design: CardDesign }
  | { ok: false; kind: "schema" | "compatibility"; problems: string[] };

export interface ValidateCardDesignOptions {
  /** The identity's compatible typography categories; when given, every pairing must be in it. */
  compatibleCategories?: readonly TypographyCategory[];
  /**
   * The call carried `changing` (the card the host is changing), so `refinement` may be `part` or
   * `whole`. Without it, anything but `none` is a catalog error (`docs/model-contracts.md §5.3`
   * step 5), re-prompted like any other.
   */
  changing?: boolean;
  /**
   * The host's title (`eventFacts.title`), when there is one. It is host content for the card's
   * words, and must never reach the image model (`spec.md §7.6`): a brief that repeats it is
   * re-prompted like any other problem.
   */
  hostTitle?: string | null;
}

/**
 * Printed formats that come back lettered when named to the image model (`card_design_v5`,
 * `spec.md §31`): the brief describes their look and never names them. The words of a format may
 * be joined by spaces or hyphens ("album-cover aesthetic"); poster paint is a medium, not a format.
 */
const FORMAT_WORDS =
  /\b(?:album|book|magazine)[\s\-\u2010\u2011]+covers?\b|\brecord[\s\-\u2010\u2011]+sleeves?\b|\bposters?\b(?![\s\-\u2010\u2011]+(?:paints?|colou?rs?)\b)/i;

/** A letter, a digit or a combining mark: a title is not found inside a longer word. */
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;

/** Every string in the art brief, which is what reaches the image model of the design. */
function briefStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(briefStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(briefStrings);
  return [];
}

/** Lower-cased, with curly quotes and apostrophes straightened, for a verbatim comparison. */
function comparable(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .toLowerCase();
}

/**
 * Whether `text` contains `phrase` as a whole span: neither edge continues a word, so a title
 * "Eli" is not found in "delicate".
 */
function containsSpan(text: string, phrase: string): boolean {
  const first = String.fromCodePoint(phrase.codePointAt(0) ?? 0);
  const last = Array.from(phrase).at(-1) ?? "";
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    const before = Array.from(text.slice(0, at)).at(-1) ?? "";
    const after = String.fromCodePoint(text.codePointAt(at + phrase.length) ?? 0);
    const startsClean = !WORD_CHARACTER.test(first) || !WORD_CHARACTER.test(before);
    const endsClean = !WORD_CHARACTER.test(last) || !WORD_CHARACTER.test(after);
    if (startsClean && endsClean) return true;
  }
  return false;
}

function pathLabel(path: PropertyKey[]): string {
  return path.length ? path.map(String).join(".") : "(root)";
}

/**
 * Validate a raw model output. Problems are worded as re-prompt feedback for the card-design
 * model; nothing here calls a model.
 */
export function validateCardDesign(
  raw: unknown,
  options: ValidateCardDesignOptions = {},
): CardDesignValidation {
  const parsed = cardDesignSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      if (issue.code === "unrecognized_keys") {
        return `${pathLabel(issue.path)}: unknown field(s) ${issue.keys.map((k) => `"${k}"`).join(", ")} — remove them`;
      }
      return `${pathLabel(issue.path)}: ${issue.message}`;
    });
    return { ok: false, kind: "schema", problems };
  }

  const design = parsed.data;
  const problems: string[] = [];
  if (!layoutSupportsShape(design.layout, design.shape)) {
    problems.push(`layout ${design.layout} does not support shape ${design.shape}`);
  }
  if (!artModeCompatible(design.layout, design.artMode)) {
    problems.push(`art mode ${design.artMode} is not compatible with layout ${design.layout}`);
  }
  if (design.typography.alternates.includes(design.typography.primary)) {
    problems.push("an alternate repeats the primary pairing");
  }
  if (options.compatibleCategories) {
    const allowed = new Set<TypographyCategory>(options.compatibleCategories);
    for (const id of [design.typography.primary, ...design.typography.alternates]) {
      const category = TYPOGRAPHY[id].category;
      if (!allowed.has(category)) {
        problems.push(
          `pairing ${id} (${category}) is outside the identity's compatible categories`,
        );
      }
    }
  }
  const brief = briefStrings(design.artBrief);
  // A title of one word ("One", "Sunshine") is too often an ordinary word of an honest brief; the
  // artwork's own text check still refuses it lettered.
  const hostTitle = options.hostTitle?.trim();
  if (
    hostTitle &&
    /\s/.test(hostTitle) &&
    brief.some((text) => containsSpan(comparable(text), comparable(hostTitle)))
  ) {
    problems.push(
      "the art brief repeats the card's title: describe the picture only; the title is set as text and never reaches the artwork",
    );
  }
  // The things to avoid may name a format to keep it out ("no poster-style lettering").
  const { avoid: _avoid, ...described } = design.artBrief;
  void _avoid;
  const format = briefStrings(described)
    .map((text) => FORMAT_WORDS.exec(text)?.[0])
    .find(Boolean);
  if (format) {
    problems.push(
      `the art brief names a printed format ("${format}"): describe its look, never the format, which the image model would letter`,
    );
  }
  if (design.refinement !== "none" && options.changing !== true) {
    problems.push(
      `refinement must be "none": there is no card being changed, so this design is a new idea`,
    );
  }
  if (problems.length) return { ok: false, kind: "compatibility", problems };
  return { ok: true, design };
}
