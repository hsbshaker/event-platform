import "server-only";

import {
  ModelCallRefusedError,
  ModelOutputError,
  ProviderCallError,
  ProviderRefusalError,
} from "@/lib/ai/errors";
import type { CardArt, GenerateCardArtInput } from "@/lib/ai/provider";
import {
  assembleArtPrompt,
  assembleRevisionPrompt,
  assembleShapeSwitchPrompt,
  fitsShapes,
} from "@/lib/card/art-prompt";
import { CardTextLayoutError, generatedTextLayer } from "@/lib/card/card-text.server";
import type { CardDesign } from "@/lib/card/design";
import { paletteFromPixels } from "@/lib/card/ink";
import { pairingFaces } from "@/lib/card/layout-card";
import { zoneFor } from "@/lib/card/layouts";
import type { CardLayoutId } from "@/lib/card/layouts";
import {
  decodePng,
  isPng,
  PngError,
  readPngHeader,
  stripColorAndTextChunks,
} from "@/lib/card/png.server";
import type { DecodedPng } from "@/lib/card/png.server";
import { PEOPLE_FREE_RENDERINGS } from "@/lib/card/renderings";
import type { Rendering } from "@/lib/card/renderings";
import { CARD_CANVAS, SHAPE_PROPORTION } from "@/lib/card/shapes";
import type { CardProportion, CardShape } from "@/lib/card/shapes";
import type { CardContent } from "@/lib/card/text-box";
import { isNoShift, placeTextInAreas, textGroupAreas } from "@/lib/card/text-space";
import type { TextGroupAreas, TextPlacement, TextShift } from "@/lib/card/text-space";
import { curatedMetricsResolver } from "@/lib/card/text/curated-fonts";
import type { TypographyPairingId } from "@/lib/card/typography";

import { ArtworkProviderRefusalError, attachFailureDetails, GenerationStageError } from "./stage";
import type { StageContext } from "./stage";

/**
 * Stage 3: the artwork, its validation, and its ink (`spec.md §7.6a`, §7.8, §7.9 steps 4–5;
 * `docs/card-system.md §3`, §4.1, §4.2; `docs/model-contracts.md §7`, §9).
 *
 * The art prompt is assembled by code from the validated brief, art mode, layout and shape
 * (`assembleArtPrompt`; `assembleShapeSwitchPrompt` with the design's own earlier artwork as the
 * reference on a shape switch; `assembleRevisionPrompt` with the changed card's artwork as the
 * reference on a change to part of a card, `card_art_v5`); the provider builds the identical
 * request from the same fields, and no other input reaches the image model (`spec.md §32 #17`).
 *
 * **Validation** (`validateArtwork`), cheapest first: an allowed type (PNG); a header that reads;
 * the shape's proportion within `ARTWORK_LIMITS.proportionTolerance`; the short side at least
 * `minShortSide` and no side over `maxSide`; a full decode; opaque; `omni-moderation` not flagged;
 * the inspection finding no text, logo or brand mark, and no mockup — and, for a photographic,
 * editorial, 3D or collage rendering (`PEOPLE_FREE_RENDERINGS`), no person. An image the provider
 * returned without a usable PNG fails it too.
 *
 * **Budget** (owner decisions 2026-10-04, `spec.md §7.8`): at most `1 + ARTWORK_LIMITS.extraImages`
 * image requests per artwork. A first image that fails validation earns one regeneration; a second
 * failure is a visible failure (`artwork_invalid`). Once a valid artwork exists, if some shape it
 * fits has no workable space for the words (`text-space.ts`), it is repainted **once**, within
 * what is left of the budget, from the same prompt (and the same reference) plus one composition
 * line (`withRepaintComposition`, `card_art_v7`); whichever of the two has the higher worst
 * fitted-shape coverage is kept, the first on a tie. A workable artwork is never repainted (owner
 * decision 2026-10-07: generated cards are editable starting designs, and the artwork is kept
 * whenever it has workable space for the words). A repaint that fails validation — or whose call
 * fails — is dropped and still spends its image; a repaint never causes a visible failure.
 *
 * **Provider refusal**: a refused image request (the brand-homage case, `spec.md §7.6`) ends the
 * stage with `ArtworkProviderRefusalError` before a valid artwork exists, so the orchestration can
 * re-prompt the design (`provider-refusal`); a refused repaint is dropped like any failed repaint.
 * The re-prompted design's artwork is that refusal's regeneration (`afterRefusal`): it continues the
 * same image budget, and its own failed validation or refusal is a visible failure.
 * Any other provider failure before a valid artwork exists is a visible failure (`provider_error`).
 * A meter refusal before a valid artwork exists passes through unchanged; at the repaint it stops
 * it and the valid artwork is kept.
 *
 * **Ink and placement** (`card_compiler_v7`): for every shape the artwork fits (`fitsShapes`), the
 * generated text layer the card will show right after generation (`input.content`, in the design's
 * primary pairing) is laid out once, and `placeText` chooses where its heading and details start
 * and in which ink, by the share of the artwork behind its lines that the ink reads against
 * (`text-space.ts`). The ink and the shift are stored per shape; no new artwork gets a legibility
 * panel. **Storage**: the kept PNG loses its colour and text chunks
 * without re-encoding (`stripColorAndTextChunks`), so it is untagged sRGB
 * (`docs/technology-decisions.md §8.2`).
 *
 * Nothing is persisted here.
 */

/**
 * Validation thresholds. The image model is asked for 1440 × 2016 (5:7) or 1440 × 1440 (1:1)
 * (`ART_RASTER_SIZE`, `docs/technology-decisions.md §8.1`).
 *
 * - `proportionTolerance` 0.1%: the renderers stretch the artwork over the card
 *   (`object-fit: fill`), so the tolerance is how much stretch is acceptable; and text placement
 *   (`placeText`) maps card units onto the raster and refuses an artwork more than 2 card units
 *   off its proportion, which 0.1% (1.4 units on 5:7, 1 on 1:1) stays inside.
 * - `minShortSide` 1024: at least one pixel per card unit across the card (1000 units wide) with a
 *   margin, while tolerating a provider that rounds the requested 1440 down.
 * - `maxSide` 4096: a bound on what the server decodes (the request is 2016 at most).
 * - `extraImages` 2: the owner's cap per artwork, validation regeneration and the repaint together.
 */
export const ARTWORK_LIMITS = {
  mimeTypes: ["image/png"] as readonly string[],
  proportionTolerance: 0.001,
  minShortSide: 1024,
  maxSide: 4096,
  extraImages: 2,
} as const;

/**
 * The key of a layout's text zone in the ink map. The layout set has one text zone per layout
 * and shape (`zoneFor`); the map is keyed by zone so a layout set with more zones keeps its shape.
 */
export const TEXT_ZONE = "text";

/**
 * One zone's stored ink and placement (`card_art_assets.ink`: per fitted shape, per zone), as a new
 * artwork stores it (`card_compiler_v7`). Artwork made before it may also carry a legibility
 * `panel` and its `panelColor`, which are read and drawn as stored (`card-record.server.ts`
 * `zoneInk`) and never written again.
 */
export interface ZoneInk {
  /** `#RRGGBB`: the ink the generated card starts with (`placeText`). */
  ink: string;
  /** Where the words start relative to the layout's position; omitted when both are 0. */
  shift?: TextShift;
}

/** Ink by fitted shape, then by zone. Has an entry for every shape the artwork fits. */
export type ArtworkInk = Partial<Record<CardShape, Record<string, ZoneInk>>>;

export type ArtworkFailureReason =
  /** The provider returned no usable PNG. */
  | "output"
  /** Not an allowed image type. */
  | "type"
  /** The PNG does not read, or is a kind the decoder refuses. */
  | "undecodable"
  /** A side exceeds `maxSide`. */
  | "size"
  | "proportion"
  | "resolution"
  /** Not opaque. */
  | "transparent"
  /** `omni-moderation` flagged it. */
  | "moderation"
  /** The inspection found text, a logo or brand mark, or a mockup. */
  | "text"
  | "logo"
  | "mockup"
  /** The inspection found a person in artwork whose rendering allows none (`PEOPLE_FREE_RENDERINGS`). */
  | "person"
  /** Moderation or inspection could not be completed, so the artwork is not validated. */
  | "check_failed"
  /** A repaint's image request failed or was refused (repaints only). */
  | "request_failed";

export interface ArtworkValidationFailure {
  /** 1-based image request number within this artwork. */
  image: number;
  reasons: ArtworkFailureReason[];
  /** Moderation categories, or the inspection's description of the text found. */
  detail?: string;
}

export interface ArtworkStageInput {
  design: Pick<CardDesign, "artBrief" | "artMode" | "layout" | "typography">;
  /** The shape to paint for: the design's own shape, or a shape switch's target. */
  shape: CardShape;
  /**
   * The words the generated card shows right after generation (`cardContentWithPlaceholders`):
   * the ink and placement are judged behind each of their lines, laid out for every fitted shape.
   */
  content: CardContent;
  /**
   * The event's own generated artwork, never a host upload: on a shape switch, the design's own
   * earlier artwork; with `revision`, the artwork of the card being changed.
   */
  reference?: CardArt;
  /**
   * A change to part of a card (`refinement: "part"`): the artwork is an edit of `reference`,
   * framed as a revision (`card_art_v5`); its repaint stays an edit of the same reference.
   */
  revision?: boolean;
  /**
   * The image provider refused this artwork for an earlier design, and this design is the
   * re-prompted one (`spec.md §7.6`): its artwork is that refusal's one regeneration. It continues
   * the same budget — the refused requests count — and a failed validation is a visible failure.
   */
  afterRefusal?: { imagesRequested: number };
}

export interface ArtworkTelemetry {
  /** Image requests made for this artwork, 1 to `1 + extraImages` (refused ones included). */
  imagesRequested: number;
  /** Which request produced the kept artwork (1-based). */
  keptImage: number;
  /**
   * Null, or why the artwork was regenerated (`generation_runs.art_regenerated`): the first
   * failed validation reason, `provider-refusal` when the image provider refused the first
   * design's artwork, or `no-text-space` when only the repaint was made.
   */
  artRegenerated: ArtworkFailureReason | "provider-refusal" | "no-text-space" | null;
  /** The repaint made because a fitted shape had no workable space for the words, dropped or not (0–1). */
  artRepaints: number;
  /** Every image that failed validation, in order. */
  validationFailures: ArtworkValidationFailure[];
  /** The repaint stopped because the meter refused one of its calls (the reason), else null. */
  repaintsStoppedBy: ModelCallRefusedError["reason"] | null;
  /**
   * Fitted shapes whose text could not be laid out, so their placement was judged on the whole
   * zone alone (`generatedTextAreas`). Unreachable for valid designs, which is why it is recorded.
   */
  lineAreasFallback: CardShape[];
  /** The kept artwork's text placement per fitted shape (`placeText`); coverage to 4 places. */
  textSpace: { shape: CardShape; coverage: number; workable: boolean; shift: TextShift }[];
}

export interface ArtworkStageResult {
  /** The kept artwork, with its colour and text chunks stripped. */
  bytes: Uint8Array;
  mimeType: "image/png";
  width: number;
  height: number;
  proportion: CardProportion;
  fitsShapes: CardShape[];
  ink: ArtworkInk;
  /**
   * The art prompt of the first image (for telemetry; not persisted on the asset). A repaint sends
   * it with `REPAINT_COMPOSITION` added.
   */
  artPrompt: string;
  telemetry: ArtworkTelemetry;
}

type ArtworkCheck =
  | { ok: true; decoded: DecodedPng }
  | { ok: false; reasons: ArtworkFailureReason[]; detail?: string };

function fail(reason: ArtworkFailureReason, detail?: string): ArtworkCheck {
  return { ok: false, reasons: [reason], ...(detail ? { detail } : {}) };
}

/**
 * Validate one artwork for `shape` (`docs/card-system.md §4.1`, `docs/model-contracts.md §7.3`).
 * The model checks run only on an artwork that passed every deterministic one. A person fails the
 * artwork only when its `rendering` is one that may show none (`PEOPLE_FREE_RENDERINGS`). A meter
 * refusal or a telemetry failure of a check is thrown; any other failed check fails the artwork.
 */
export async function validateArtwork(
  ctx: StageContext,
  art: CardArt,
  shape: CardShape,
  rendering: Rendering,
): Promise<ArtworkCheck> {
  if (!ARTWORK_LIMITS.mimeTypes.includes(art.mimeType) || !isPng(art.bytes)) return fail("type");
  let header;
  try {
    header = readPngHeader(art.bytes);
  } catch (error) {
    if (error instanceof PngError) return fail("undecodable", error.message);
    throw error;
  }
  const { width, height } = header;
  if (Math.max(width, height) > ARTWORK_LIMITS.maxSide) return fail("size");
  const canvas = CARD_CANVAS[SHAPE_PROPORTION[shape]];
  const target = canvas.height / canvas.width;
  if (Math.abs(height / width / target - 1) > ARTWORK_LIMITS.proportionTolerance) {
    return fail("proportion", `${width}×${height}`);
  }
  if (Math.min(width, height) < ARTWORK_LIMITS.minShortSide) {
    return fail("resolution", `${width}×${height}`);
  }
  let decoded: DecodedPng;
  try {
    decoded = decodePng(art.bytes);
  } catch (error) {
    if (error instanceof PngError) return fail("undecodable", error.message);
    throw error;
  }
  if (decoded.hasAlpha) {
    const { rgba } = decoded;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return fail("transparent");
  }

  try {
    const moderation = await ctx.provider.moderateCardArt(ctx.meter, art);
    if (moderation.output.flagged) {
      return fail("moderation", moderation.output.categories.join(", "));
    }
    const inspection = (await ctx.provider.inspectCardArt(ctx.meter, art)).output;
    const reasons: ArtworkFailureReason[] = [];
    if (inspection.hasText) reasons.push("text");
    if (inspection.hasLogoOrBrandMark) reasons.push("logo");
    if (inspection.isMockup) reasons.push("mockup");
    if (inspection.hasPerson && PEOPLE_FREE_RENDERINGS.includes(rendering)) reasons.push("person");
    if (reasons.length) {
      return {
        ok: false,
        reasons,
        ...(inspection.textDescription ? { detail: inspection.textDescription } : {}),
      };
    }
  } catch (error) {
    if (error instanceof ProviderCallError) return fail("check_failed", error.code);
    throw error;
  }
  return { ok: true, decoded };
}

/**
 * The areas behind the generated text's lines by group, per fitted shape (`generatedTextAreas`);
 * `null` for a shape whose text did not lay out, judged on its whole zone alone.
 */
export type TextAreas = Partial<Record<CardShape, TextGroupAreas | null>>;

/** Any valid ink: `layoutCard`'s geometry does not depend on it. */
const GEOMETRY_INK = "#000000";

/**
 * Behind each line of the generated card's text, by group and fitted shape: the generated text
 * layer for `content` in the design's primary pairing (`generatedTextLayer`, the card's own
 * layout, at the layout's position; the ink does not change geometry, so any valid ink lays it
 * out), and the line areas `textGroupAreas` derives from it. The geometry does not depend on the
 * artwork, so a stage computes it once for every image it judges.
 *
 * A shape whose text does not lay out — `overflow`, or characters the faces lack — gets `null`,
 * and its placement is judged on the whole zone alone, as one heading group. This does not throw:
 * the design stage's fit check (`cardTextFitsEveryDesign`) already guarantees that valid content
 * fits, and a text layer that cannot be rendered is refused where the card is drawn
 * (`CardTextLayoutError`); the artwork stage is not where a generation fails for it.
 */
export async function generatedTextAreas(
  layout: CardLayoutId,
  shapes: readonly CardShape[],
  pairing: TypographyPairingId,
  content: CardContent,
): Promise<TextAreas> {
  const faces = pairingFaces(pairing);
  const metrics = await curatedMetricsResolver([faces.display, faces.body]);
  const areas: TextAreas = {};
  for (const shape of shapes) {
    try {
      const boxes = await generatedTextLayer({
        layout,
        shape,
        pairing,
        content,
        ink: GEOMETRY_INK,
      });
      areas[shape] = textGroupAreas(boxes, metrics, zoneFor(layout, shape));
    } catch (error) {
      if (!(error instanceof CardTextLayoutError)) throw error;
      areas[shape] = null;
    }
  }
  return areas;
}

/** An artwork's stored ink and its placement per fitted shape. */
export interface ArtworkTextSpace {
  ink: ArtworkInk;
  placements: { shape: CardShape; placement: TextPlacement }[];
  /** The lowest coverage among the fitted shapes: what decides a repaint and which artwork is kept. */
  worst: number;
  /** Every fitted shape has workable space for the words. */
  workable: boolean;
}

/**
 * Ink and placement for every shape an artwork fits (`text-space.ts`): the artwork's palette once,
 * then each shape's text placed on it (`placeTextInAreas`). Every fitted shape needs an entry in
 * `areas` (`null` for the whole zone alone): a missing one is a caller's bug, never a silent
 * zone-only measure.
 */
export function placeArtworkText(
  decoded: DecodedPng,
  layout: CardLayoutId,
  shapes: readonly CardShape[],
  areas: TextAreas,
): ArtworkTextSpace {
  const { rgba, width, height } = decoded;
  const palette = paletteFromPixels(rgba, width, height);
  const ink: ArtworkInk = {};
  const placements: ArtworkTextSpace["placements"] = [];
  for (const shape of shapes) {
    const groups = areas[shape];
    if (groups === undefined) throw new Error(`placeArtworkText: no text areas for ${shape}`);
    const placement = placeTextInAreas({
      pixels: rgba,
      width,
      height,
      shape,
      areas: groups ?? { heading: [zoneFor(layout, shape)], details: [] },
      palette,
    });
    ink[shape] = {
      [TEXT_ZONE]: {
        ink: placement.ink,
        ...(isNoShift(placement.shift) ? {} : { shift: { ...placement.shift } }),
      },
    };
    placements.push({ shape, placement });
  }
  const worst = Math.min(...placements.map((p) => p.placement.coverage));
  return {
    ink,
    placements,
    worst,
    workable: placements.every((p) => p.placement.workable),
  };
}

type Painted =
  | { kind: "valid"; image: number; art: CardArt; decoded: DecodedPng }
  | { kind: "invalid"; failure: ArtworkValidationFailure }
  | { kind: "refused"; image: number; error: ProviderRefusalError }
  | { kind: "error"; image: number; error: ProviderCallError };

export async function runArtworkStage(
  ctx: StageContext,
  input: ArtworkStageInput,
): Promise<ArtworkStageResult> {
  const { shape, reference, content } = input;
  const revision = input.revision === true;
  const { artBrief, artMode, layout, typography } = input.design;
  const promptInput = { artBrief, artMode, layout, shape };
  if (revision && !reference) throw new Error("runArtworkStage: a revision needs its reference");
  // Assembled before any call: a shape the layout does not support throws here, unspent.
  const artPrompt = !reference
    ? assembleArtPrompt(promptInput)
    : revision
      ? assembleRevisionPrompt(promptInput)
      : assembleShapeSwitchPrompt(promptInput, shape);
  const fits = [...fitsShapes(artMode, layout, shape)];
  // Where the text will sit on each fitted shape: laid out before any call, so a failure here
  // (a font that does not load) costs no image.
  const textAreas = await generatedTextAreas(layout, fits, typography.primary, content);
  const request: GenerateCardArtInput = {
    artBrief,
    artMode,
    layout,
    shape,
    ...(reference ? { reference } : {}),
    ...(revision ? { revision } : {}),
  };
  const maxImages = 1 + ARTWORK_LIMITS.extraImages;
  const prior = input.afterRefusal?.imagesRequested ?? 0;
  if (!Number.isInteger(prior) || prior < 0 || prior >= maxImages) {
    throw new Error(`runArtworkStage: ${prior} earlier images leave no budget`);
  }
  let images = prior;
  const validationFailures: ArtworkValidationFailure[] = [];

  // A repaint follows an artwork with no workable space for the words: its prompt asks for some.
  async function paint(repaint = false): Promise<Painted> {
    const image = images + 1;
    let art: CardArt;
    try {
      art = (
        await ctx.provider.generateCardArt(ctx.meter, repaint ? { ...request, repaint } : request)
      ).output;
      images = image;
    } catch (error) {
      // A meter refusal made no request, so it spends no image.
      if (error instanceof ModelCallRefusedError) throw error;
      images = image;
      if (error instanceof ProviderRefusalError) return { kind: "refused", image, error };
      if (error instanceof ModelOutputError) {
        return { kind: "invalid", failure: { image, reasons: ["output"] } };
      }
      if (error instanceof ProviderCallError) return { kind: "error", image, error };
      throw error;
    }
    const check = await validateArtwork(ctx, art, shape, artBrief.rendering);
    if (!check.ok) {
      return {
        kind: "invalid",
        failure: {
          image,
          reasons: check.reasons,
          ...(check.detail ? { detail: check.detail } : {}),
        },
      };
    }
    return { kind: "valid", image, art, decoded: check.decoded };
  }

  // The artwork, with its one validation regeneration (already spent after a refusal). Every
  // error that ends it carries what validation learned so far, for the failure telemetry.
  const failureDetails = () => ({
    imagesRequested: images,
    validationFailures: [...validationFailures],
  });
  let artRegenerated: ArtworkTelemetry["artRegenerated"] = prior > 0 ? "provider-refusal" : null;
  let first: Extract<Painted, { kind: "valid" }> | null = null;
  while (first === null) {
    let painted: Painted;
    try {
      painted = await paint();
    } catch (error) {
      // A meter refusal (or a check's telemetry failure) passes through unchanged, with details.
      if (validationFailures.length > 0) attachFailureDetails(error, failureDetails());
      throw error;
    }
    if (painted.kind === "refused") {
      // After an earlier refusal this is the second: the orchestration fails visibly.
      throw new ArtworkProviderRefusalError(images, {
        cause: painted.error,
        details: failureDetails(),
      });
    }
    if (painted.kind === "error") {
      throw new GenerationStageError("artwork", "provider_error", "The artwork call failed.", {
        cause: painted.error,
        details: failureDetails(),
      });
    }
    if (painted.kind === "invalid") {
      validationFailures.push(painted.failure);
      if (artRegenerated !== null) {
        throw new GenerationStageError(
          "artwork",
          "artwork_invalid",
          prior > 0
            ? `The artwork after a provider refusal failed validation (${painted.failure.reasons.join("+")}).`
            : `The artwork failed validation twice (${validationFailures
                .map((f) => f.reasons.join("+"))
                .join(", ")}).`,
          { details: failureDetails() },
        );
      }
      artRegenerated = painted.failure.reasons[0];
      continue;
    }
    first = painted;
  }

  // One repaint when some fitted shape has no workable space for the words, within the budget.
  let kept = first;
  let keptSpace = placeArtworkText(first.decoded, layout, fits, textAreas);
  let repaintsStoppedBy: ArtworkTelemetry["repaintsStoppedBy"] = null;
  if (!keptSpace.workable && images < maxImages) {
    let painted: Painted | null = null;
    try {
      painted = await paint(true);
    } catch (error) {
      if (!(error instanceof ModelCallRefusedError)) throw error;
      repaintsStoppedBy = error.reason;
    }
    if (painted?.kind === "invalid") {
      validationFailures.push(painted.failure);
    } else if (painted?.kind === "refused" || painted?.kind === "error") {
      validationFailures.push({
        image: painted.image,
        reasons: ["request_failed"],
        detail: painted.error.code,
      });
    } else if (painted?.kind === "valid") {
      const space = placeArtworkText(painted.decoded, layout, fits, textAreas);
      // The repaint is kept only if its worst shape reads better; on a tie the first stays.
      if (space.worst > keptSpace.worst) {
        kept = painted;
        keptSpace = space;
      }
    }
  }
  // Every image requested after the first valid one was the repaint, kept or dropped.
  const artRepaints = images - first.image;
  if (artRepaints > 0) artRegenerated ??= "no-text-space";

  return {
    bytes: stripColorAndTextChunks(kept.art.bytes),
    mimeType: "image/png",
    width: kept.decoded.width,
    height: kept.decoded.height,
    proportion: SHAPE_PROPORTION[shape],
    fitsShapes: fits,
    ink: keptSpace.ink,
    artPrompt,
    telemetry: {
      imagesRequested: images,
      keptImage: kept.image,
      artRegenerated,
      artRepaints,
      validationFailures,
      repaintsStoppedBy,
      lineAreasFallback: fits.filter((shape) => textAreas[shape] === null),
      textSpace: keptSpace.placements.map(({ shape: s, placement }) => ({
        shape: s,
        coverage: Math.round(placement.coverage * 1e4) / 1e4,
        workable: placement.workable,
        shift: { ...placement.shift },
      })),
    },
  };
}
