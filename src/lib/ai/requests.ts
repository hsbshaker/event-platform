/**
 * Request bodies for the model provider, built deterministically from validated data
 * (`docs/model-contracts.md`). Pure: no network, no secrets. Ported from the request shapes Phase 3
 * validation measured (`scripts/phase-3/lib.mjs`, `run.mjs`), with one addition: every structured
 * call carries `max_output_tokens` (`pricing.ts`), so its cost has an upper bound.
 *
 * Boundaries held here (spec.md §32):
 * - #17: the image request is built only from the validated art brief, art mode, layout and shape
 *   (`assembleArtPrompt`); it has no field that could carry the host's prompt, feedback or an
 *   inspiration image, and its only image input is the event's own generated artwork: the design's
 *   earlier artwork on a shape switch, or the changed card's on a change to part of a card.
 * - §7.5: the host's raw prompt goes only to Event Identity and fact extraction; the card-design
 *   call reads the identity and the facts.
 * - Host content is passed as delimited JSON data, never interpolated into instructions (§8).
 */
import cardDesignJsonSchema from "../../../docs/model-schemas/card-design.schema.json";
import eventIdentityJsonSchema from "../../../docs/model-schemas/event-identity.schema.json";

import {
  ART_MODE_DESCRIPTION,
  ART_RASTER_SIZE,
  assembleArtPrompt,
  assembleRevisionPrompt,
  assembleShapeSwitchPrompt,
  withRepaintComposition,
} from "@/lib/card/art-prompt";
import { CARD_LAYOUTS, CARD_LAYOUT_IDS } from "@/lib/card/layouts";
import { RENDERING_DESCRIPTION } from "@/lib/card/renderings";
import { CARD_SHAPES, SHAPE_GEOMETRY, proportionOf } from "@/lib/card/shapes";
import { WORDING_LIMITS } from "@/lib/card/slots";
import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "@/lib/card/typography";

import { ARTWORK_INSPECTION_JSON_SCHEMA, ARTWORK_INSPECTION_PROMPT } from "./artwork-inspection";
import { TYPOGRAPHY_CATEGORIES } from "./event-identity";
import type { EventIdentity } from "./event-identity";
import { FACT_EXTRACTION_JSON_SCHEMA } from "./fact-extraction";
import { IMAGE_QUALITY, MODELS } from "./models";
import { MAX_OUTPUT_TOKENS } from "./pricing";
import type {
  CardArt,
  ExtractEventFactsInput,
  GenerateCardArtInput,
  GenerateCardDesignInput,
  GenerateEventIdentityInput,
} from "./provider";

/**
 * Strip JSON Schema keywords the strict structured-output mode does not accept; the application
 * validates them itself (`event-identity.ts`, `src/lib/card/design.ts`). Ported from Phase 3.
 */
export function toStrictSchema(schema: unknown): unknown {
  const drop = new Set([
    "$schema",
    "$id",
    "$comment",
    "minLength",
    "maxLength",
    "uniqueItems",
    "title",
  ]);
  // The keys of a `properties` object are field names, not keywords: never drop them.
  const walk = (node: unknown, inProperties = false): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (!inProperties && drop.has(k)) continue;
        out[k] = walk(v, !inProperties && k === "properties");
      }
      return out;
    }
    return node;
  };
  return walk(schema);
}

export type InputContent =
  { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "high" };

/** A Responses API request with a strict JSON-schema output. */
export interface StructuredRequest {
  model: string;
  instructions: string;
  input: [{ role: "user"; content: string | InputContent[] }];
  text: { format: { type: "json_schema"; name: string; schema: unknown; strict: true } };
  reasoning?: { effort: "low" | "medium" };
  max_output_tokens: number;
}

function structuredRequest(args: {
  model: string;
  instructions: string;
  content: string | InputContent[];
  schemaName: string;
  schema: unknown;
  effort: "low" | "medium" | null;
  maxOutputTokens: number;
}): StructuredRequest {
  const body: StructuredRequest = {
    model: args.model,
    instructions: args.instructions,
    input: [{ role: "user", content: args.content }],
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        schema: toStrictSchema(args.schema),
        strict: true,
      },
    },
    max_output_tokens: args.maxOutputTokens,
  };
  if (args.effort) body.reasoning = { effort: args.effort };
  return body;
}

export function dataUrl(image: { mimeType: string; bytes: Uint8Array }): string {
  return `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
}

/** Phase 3's wording for the one repair retry (model-contracts §9). */
function withRepair(text: string, repairFeedback: string | undefined): string {
  return repairFeedback
    ? `${text}\n\nYour previous output failed validation: ${repairFeedback}. Return a corrected object.`
    : text;
}

/** Event Identity (`event_identity_v7`, GPT 6.1 Sol, `medium` effort): the only reader of the raw prompt. */
export function eventIdentityRequest(
  instructions: string,
  input: GenerateEventIdentityInput,
): StructuredRequest {
  const inspiration = input.inspiration ?? [];
  const data = {
    eventPrompt: input.prompt,
    redesignFeedback: input.redesignFeedback ?? null,
    ...(input.previousIdentity ? { previousIdentity: input.previousIdentity } : {}),
    themeSeed: input.themeSeed ?? null,
    inspiration: inspiration.map((image, i) => ({ image: i + 1, mimeType: image.mimeType })),
    runtimeCatalog: { typographyCategories: TYPOGRAPHY_CATEGORIES },
  };
  const text = withRepair(JSON.stringify(data), input.repairFeedback);
  const content: string | InputContent[] = inspiration.length
    ? [
        { type: "input_text", text },
        ...inspiration.map((image): InputContent => ({
          type: "input_image",
          image_url: dataUrl(image),
          detail: "high",
        })),
      ]
    : text;
  return structuredRequest({
    model: MODELS.text,
    instructions,
    content,
    schemaName: "EventIdentity",
    schema: eventIdentityJsonSchema,
    effort: "medium",
    maxOutputTokens: MAX_OUTPUT_TOKENS.event_identity,
  });
}

/** Fact extraction (`fact_extraction_v2`, GPT 6 Luna, no reasoning effort): the prompt as plain text. */
export function factExtractionRequest(
  instructions: string,
  input: ExtractEventFactsInput,
): StructuredRequest {
  return structuredRequest({
    model: MODELS.facts,
    instructions,
    content: input.prompt,
    schemaName: "EventFacts",
    schema: FACT_EXTRACTION_JSON_SCHEMA,
    effort: null,
    maxOutputTokens: MAX_OUTPUT_TOKENS.structured_extraction,
  });
}

/**
 * The catalogs the card-design prompt refers to (`docs/model-prompts/card-design.system.md`),
 * from the production catalogs, in the shape Phase 3 validated: shapes with their proportion and
 * outline, layouts with their purpose, shapes and art modes, the art modes, the rendering families
 * (`card_design_v2`), the pairings narrowed to the identity's compatible categories, and the
 * wording limits.
 */
export function cardDesignRuntimeCatalog(identity: EventIdentity) {
  const allowed = new Set<string>(identity.compatibleTypographyCategories);
  return {
    shapes: Object.fromEntries(
      CARD_SHAPES.map((s) => [s, `${proportionOf(s)}, ${SHAPE_GEOMETRY[s].outline}`]),
    ),
    layouts: Object.fromEntries(
      CARD_LAYOUT_IDS.map((id) => [
        id,
        {
          purpose: CARD_LAYOUTS[id].purpose,
          supportedShapes: CARD_LAYOUTS[id].shapes,
          compatibleArtModes: CARD_LAYOUTS[id].artModes,
        },
      ]),
    ),
    artModes: ART_MODE_DESCRIPTION,
    renderings: RENDERING_DESCRIPTION,
    typographyPairings: Object.fromEntries(
      TYPOGRAPHY_KEYS.filter((id) => allowed.has(TYPOGRAPHY[id].category)).map((id) => {
        const p = TYPOGRAPHY[id];
        return [id, `${p.category}: ${p.display} (display) + ${p.body} (body)`];
      }),
    ),
    wordingLimits: WORDING_LIMITS,
  };
}

/**
 * Card Design (`card_design_v6`, GPT 6.1 Sol, `medium` effort). Never sees the raw prompt. On
 * `Try another direction` it carries the host's feedback and, with it, the card being changed
 * (`changing`), both as data.
 */
export function cardDesignRequest(
  instructions: string,
  input: GenerateCardDesignInput,
): StructuredRequest {
  const data = {
    eventIdentity: input.eventIdentity,
    eventFacts: input.eventFacts,
    runtimeCatalog: cardDesignRuntimeCatalog(input.eventIdentity),
    ...(input.suggestedRendering ? { suggestedRendering: input.suggestedRendering } : {}),
    ...(input.previousDirections?.length ? { previousDirections: input.previousDirections } : {}),
    ...(input.feedback ? { feedback: input.feedback } : {}),
    ...(input.changing ? { changing: input.changing } : {}),
    ...(input.reprompt ? { reprompt: input.reprompt } : {}),
  };
  return structuredRequest({
    model: MODELS.text,
    instructions,
    content: JSON.stringify(data),
    schemaName: "CardDesign",
    schema: cardDesignJsonSchema,
    effort: "medium",
    maxOutputTokens: MAX_OUTPUT_TOKENS.card_design,
  });
}

/** The artwork inspection (GPT 6.1 Sol, `low` effort). */
export function artworkInspectionRequest(art: CardArt): StructuredRequest {
  return structuredRequest({
    model: MODELS.text,
    instructions: ARTWORK_INSPECTION_PROMPT,
    content: [
      { type: "input_text", text: "Inspect this artwork." },
      { type: "input_image", image_url: dataUrl(art), detail: "high" },
    ],
    schemaName: "ArtworkInspection",
    schema: ARTWORK_INSPECTION_JSON_SCHEMA,
    effort: "low",
    maxOutputTokens: MAX_OUTPUT_TOKENS.card_art_inspection,
  });
}

/**
 * An image request: generations for a new artwork; edits with the reference on a shape switch or a
 * change to part of a card.
 */
export interface ArtRequest {
  endpoint: "images/generations" | "images/edits";
  model: string;
  prompt: string;
  size: string;
  quality: string;
  output_format: "png";
  background: "opaque";
  /** The event's own generated artwork (`GenerateCardArtInput.reference`); on `images/edits` only. */
  reference?: CardArt;
}

/**
 * `card_art_v7` at the shape's proportion (1440 × 2016 for 5:7, 1440 × 1440 for 1:1), PNG, opaque
 * full bleed, Sunburst `high` (`docs/technology-decisions.md §8.1`). The prompt is assembled by
 * code (`src/lib/card/art-prompt.ts`); with a reference it is the revision prompt when `revision`
 * is set (a change to part of a card), else the shape-switch prompt. A repaint keeps the reference
 * and the framing, and adds the composition line.
 */
export function cardArtRequest(input: GenerateCardArtInput): ArtRequest {
  const design = {
    artBrief: input.artBrief,
    artMode: input.artMode,
    layout: input.layout,
    shape: input.shape,
  };
  const base = {
    model: MODELS.image,
    size: ART_RASTER_SIZE[proportionOf(input.shape)],
    quality: IMAGE_QUALITY,
    output_format: "png" as const,
    background: "opaque" as const,
  };
  const repaint = (prompt: string) => (input.repaint ? withRepaintComposition(prompt) : prompt);
  if (input.reference) {
    return {
      endpoint: "images/edits",
      ...base,
      prompt: repaint(
        input.revision
          ? assembleRevisionPrompt(design)
          : assembleShapeSwitchPrompt(design, input.shape),
      ),
      reference: input.reference,
    };
  }
  // A revision without its reference would be a fresh painting under the wrong name.
  if (input.revision) throw new Error("cardArtRequest: a revision needs its reference artwork");
  return { endpoint: "images/generations", ...base, prompt: repaint(assembleArtPrompt(design)) };
}

/** `omni-moderation-latest` on the artwork alone. */
export function artworkModerationRequest(art: CardArt) {
  return {
    model: MODELS.moderation,
    input: [{ type: "image_url" as const, image_url: { url: dataUrl(art) } }],
  };
}
