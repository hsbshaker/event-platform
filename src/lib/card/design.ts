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
  if (design.refinement !== "none" && options.changing !== true) {
    problems.push(
      `refinement must be "none": there is no card being changed, so this design is a new idea`,
    );
  }
  if (problems.length) return { ok: false, kind: "compatibility", problems };
  return { ok: true, design };
}
