/**
 * `CardDesign` (`docs/model-contracts.md §5.1`) and its deterministic validation
 * (`docs/card-system.md §4.1`, `docs/model-contracts.md §5.3`).
 *
 * The zod schema mirrors `docs/model-schemas/card-design.schema.json` (`card_design_schema_v1`);
 * `design.test.ts` asserts the two cannot drift. Enums are generated from the catalogs. The JSON
 * key for the font pairing choice is `typography`, as in the committed schema.
 *
 * Validation runs in order: (1) strict schema, (2) compatibility. The wording fact check
 * (`wording.ts`) and direction distinctness are separate steps with their own re-prompts.
 */

import { z } from "zod";

import { ART_MODES } from "./art-modes";
import { artModeCompatible, CARD_LAYOUT_IDS, layoutSupportsShape } from "./layouts";
import { CARD_SHAPES } from "./shapes";
import { WORDING_LIMITS } from "./slots";
import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "./typography";
import type { TypographyCategory, TypographyPairingId } from "./typography";

const pairingId = z.enum(
  TYPOGRAPHY_KEYS as readonly [TypographyPairingId, ...TypographyPairingId[]],
);

const text = (min: number, max: number) => z.string().min(min).max(max);

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
});

export type CardDesign = z.infer<typeof cardDesignSchema>;

export type CardDesignValidation =
  | { ok: true; design: CardDesign }
  | { ok: false; kind: "schema" | "compatibility"; problems: string[] };

export interface ValidateCardDesignOptions {
  /** The identity's compatible typography categories; when given, every pairing must be in it. */
  compatibleCategories?: readonly TypographyCategory[];
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
  if (problems.length) return { ok: false, kind: "compatibility", problems };
  return { ok: true, design };
}
