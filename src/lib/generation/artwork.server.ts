import "server-only";

import {
  ModelCallRefusedError,
  ModelOutputError,
  ProviderCallError,
  ProviderRefusalError,
} from "@/lib/ai/errors";
import type { CardArt, GenerateCardArtInput } from "@/lib/ai/provider";
import { assembleArtPrompt, assembleShapeSwitchPrompt, fitsShapes } from "@/lib/card/art-prompt";
import type { CardDesign } from "@/lib/card/design";
import { paletteFromPixels, resolveInk, sampleZoneLuminance } from "@/lib/card/ink";
import { panelFor, zoneFor } from "@/lib/card/layouts";
import type { CardLayoutId, CardPanelShape } from "@/lib/card/layouts";
import {
  decodePng,
  isPng,
  PngError,
  readPngHeader,
  stripColorAndTextChunks,
} from "@/lib/card/png.server";
import type { DecodedPng } from "@/lib/card/png.server";
import { CARD_CANVAS, insideOutline, SHAPE_PROPORTION } from "@/lib/card/shapes";
import type { CardProportion, CardShape } from "@/lib/card/shapes";

import { ArtworkProviderRefusalError, GenerationStageError } from "./stage";
import type { StageContext } from "./stage";

/**
 * Stage 3: the artwork, its validation, and its ink (`spec.md §7.6a`, §7.8, §7.9 steps 4–5;
 * `docs/card-system.md §3`, §4.1, §4.2; `docs/model-contracts.md §7`, §9).
 *
 * The art prompt is assembled by code from the validated brief, art mode, layout and shape
 * (`assembleArtPrompt`, or `assembleShapeSwitchPrompt` with the design's own earlier artwork as
 * the reference on a shape switch); the provider builds the identical request from the same
 * fields, and no other input reaches the image model (`spec.md §32 #17`).
 *
 * **Validation** (`validateArtwork`), cheapest first: an allowed type (PNG); a header that reads;
 * the shape's proportion within `ARTWORK_LIMITS.proportionTolerance`; the short side at least
 * `minShortSide` and no side over `maxSide`; a full decode; opaque; `omni-moderation` not flagged;
 * the inspection finding no text, logo or brand mark, and no mockup. An image the provider returned
 * without a usable PNG fails it too.
 *
 * **Budget** (owner decisions 2026-10-04, `spec.md §7.8`): at most `1 + ARTWORK_LIMITS.extraImages`
 * image requests per artwork. A first image that fails validation earns one regeneration; a second
 * failure is a visible failure (`artwork_invalid`). Once a valid artwork exists, if the shape it
 * was painted for would need the legibility panel, it is repainted from the same prompt (and the
 * same reference) one image at a time, while the budget lasts: the first repaint that is valid and
 * needs no panel is kept; if none is, the first valid artwork is kept with the panel. A repaint
 * that fails validation — or whose call fails — is dropped and still spends its image; a repaint
 * never causes a visible failure.
 *
 * **Provider refusal**: a refused image request (the brand-homage case, `spec.md §7.6`) ends the
 * stage with `ArtworkProviderRefusalError` before a valid artwork exists, so the orchestration can
 * re-prompt the design (`provider-refusal`); a refused repaint is dropped like any failed repaint.
 * The re-prompted design's artwork is that refusal's regeneration (`afterRefusal`): it continues the
 * same image budget, and its own failed validation or refusal is a visible failure.
 * Any other provider failure before a valid artwork exists is a visible failure (`provider_error`).
 * A meter refusal before a valid artwork exists passes through unchanged; during repaints it stops
 * them and the valid artwork is kept.
 *
 * **Ink**: for every shape the artwork fits (`fitsShapes`), each text zone (`zoneFor`) is sampled
 * within the outline and resolved (`resolveInk`); a zone that needs the panel records the layout's
 * panel for the shape (`panelFor`) and its colour. **Storage**: the kept PNG loses its colour and
 * text chunks without re-encoding (`stripColorAndTextChunks`), so it is untagged sRGB
 * (`docs/technology-decisions.md §8.2`).
 *
 * Nothing is persisted here.
 */

/**
 * Validation thresholds. The image model is asked for 1440 × 2016 (5:7) or 1440 × 1440 (1:1)
 * (`ART_RASTER_SIZE`, `docs/technology-decisions.md §8.1`).
 *
 * - `proportionTolerance` 0.1%: the renderers stretch the artwork over the card
 *   (`object-fit: fill`), so the tolerance is how much stretch is acceptable; and ink sampling
 *   (`sampleZoneLuminance`) maps card units onto the raster and refuses an artwork more than 2
 *   card units off its proportion, which 0.1% (1.4 units on 5:7, 1 on 1:1) stays inside.
 * - `minShortSide` 1024: at least one pixel per card unit across the card (1000 units wide) with a
 *   margin, while tolerating a provider that rounds the requested 1440 down.
 * - `maxSide` 4096: a bound on what the server decodes (the request is 2016 at most).
 * - `extraImages` 2: the owner's cap per artwork, validation regeneration and repaints together.
 */
export const ARTWORK_LIMITS = {
  mimeTypes: ["image/png"] as readonly string[],
  proportionTolerance: 0.001,
  minShortSide: 1024,
  maxSide: 4096,
  extraImages: 2,
} as const;

/**
 * The key of a layout's text zone in the ink map. `card_layouts_v2` has one text zone per layout
 * and shape (`zoneFor`); the map is keyed by zone so a layout set with more zones keeps its shape.
 */
export const TEXT_ZONE = "text";

/** One zone's resolved ink (`card_art_assets.ink`: per fitted shape, per zone). */
export interface ZoneInk {
  /** `#RRGGBB`, at least 4.5:1 against the measured background, or against the panel. */
  ink: string;
  /** The legibility panel behind the zone, when no ink clears 4.5:1 without one (`panelFor`). */
  panel?: CardPanelShape;
  /** The panel's paper colour, `#RRGGBB`, drawn opaque. */
  panelColor?: string;
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
  design: Pick<CardDesign, "artBrief" | "artMode" | "layout">;
  /** The shape to paint for: the design's own shape, or a shape switch's target. */
  shape: CardShape;
  /** A shape switch only: the design's own earlier artwork (never a host upload). */
  reference?: CardArt;
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
   * design's artwork, or `panel-repaint` when only repaints were made.
   */
  artRegenerated: ArtworkFailureReason | "provider-refusal" | "panel-repaint" | null;
  /** Repaints made because the artwork would need a panel, dropped ones included (0–2). */
  artRepaints: number;
  /** Every image that failed validation, in order. */
  validationFailures: ArtworkValidationFailure[];
  /** Zones of the kept artwork that need the legibility panel, per fitted shape. */
  inkPanels: { shape: CardShape; zone: string }[];
  /** Repaints stopped early because the meter refused a call (the reason), else null. */
  repaintsStoppedBy: ModelCallRefusedError["reason"] | null;
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
  /** The art prompt the image model was given (for telemetry; not persisted on the asset). */
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
 * The model checks run only on an artwork that passed every deterministic one. A meter refusal or
 * a telemetry failure of a check is thrown; any other failed check fails the artwork.
 */
export async function validateArtwork(
  ctx: StageContext,
  art: CardArt,
  shape: CardShape,
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
 * Ink and panels for every shape an artwork fits (`docs/card-system.md §4.2`): the artwork's
 * palette once, then each shape's text zone sampled inside its outline and resolved.
 */
export function resolveArtworkInk(
  decoded: DecodedPng,
  layout: CardLayoutId,
  shapes: readonly CardShape[],
): ArtworkInk {
  const { rgba, width, height } = decoded;
  const palette = paletteFromPixels(rgba, width, height);
  const ink: ArtworkInk = {};
  for (const shape of shapes) {
    const zone = zoneFor(layout, shape);
    const luminances = sampleZoneLuminance(rgba, width, height, zone, (x, y) =>
      insideOutline(shape, x, y),
    );
    const resolved = resolveInk({ luminances, palette });
    ink[shape] = {
      [TEXT_ZONE]: resolved.panel
        ? { ink: resolved.ink, panel: panelFor(layout, shape), panelColor: resolved.panel.color }
        : { ink: resolved.ink },
    };
  }
  return ink;
}

function needsPanel(ink: ArtworkInk, shape: CardShape): boolean {
  return Object.values(ink[shape] ?? {}).some((zone) => zone.panel !== undefined);
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
  const { shape, reference } = input;
  const { artBrief, artMode, layout } = input.design;
  const promptInput = { artBrief, artMode, layout, shape };
  // Assembled before any call: a shape the layout does not support throws here, unspent.
  const artPrompt = reference
    ? assembleShapeSwitchPrompt(promptInput, shape)
    : assembleArtPrompt(promptInput);
  const fits = [...fitsShapes(artMode, layout, shape)];
  const request: GenerateCardArtInput = {
    artBrief,
    artMode,
    layout,
    shape,
    ...(reference ? { reference } : {}),
  };
  const maxImages = 1 + ARTWORK_LIMITS.extraImages;
  const prior = input.afterRefusal?.imagesRequested ?? 0;
  if (!Number.isInteger(prior) || prior < 0 || prior >= maxImages) {
    throw new Error(`runArtworkStage: ${prior} earlier images leave no budget`);
  }
  let images = prior;
  const validationFailures: ArtworkValidationFailure[] = [];

  async function paint(): Promise<Painted> {
    const image = images + 1;
    let art: CardArt;
    try {
      art = (await ctx.provider.generateCardArt(ctx.meter, request)).output;
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
    const check = await validateArtwork(ctx, art, shape);
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

  // The artwork, with its one validation regeneration (already spent after a refusal).
  let artRegenerated: ArtworkTelemetry["artRegenerated"] = prior > 0 ? "provider-refusal" : null;
  let first: Extract<Painted, { kind: "valid" }> | null = null;
  while (first === null) {
    const painted = await paint();
    if (painted.kind === "refused") {
      // After an earlier refusal this is the second: the orchestration fails visibly.
      throw new ArtworkProviderRefusalError(images, { cause: painted.error });
    }
    if (painted.kind === "error") {
      throw new GenerationStageError("artwork", "provider_error", "The artwork call failed.", {
        cause: painted.error,
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
        );
      }
      artRegenerated = painted.failure.reasons[0];
      continue;
    }
    first = painted;
  }

  // Repaints while the painted-for shape would need a panel, within the budget.
  let kept = first;
  let keptInk = resolveArtworkInk(first.decoded, layout, fits);
  let repaintsStoppedBy: ArtworkTelemetry["repaintsStoppedBy"] = null;
  while (needsPanel(keptInk, shape) && images < maxImages) {
    let painted: Painted;
    try {
      painted = await paint();
    } catch (error) {
      if (!(error instanceof ModelCallRefusedError)) throw error;
      repaintsStoppedBy = error.reason;
      break;
    }
    if (painted.kind === "invalid") {
      validationFailures.push(painted.failure);
      continue;
    }
    if (painted.kind !== "valid") {
      validationFailures.push({
        image: painted.image,
        reasons: ["request_failed"],
        detail: painted.error.code,
      });
      continue;
    }
    const ink = resolveArtworkInk(painted.decoded, layout, fits);
    if (!needsPanel(ink, shape)) {
      kept = painted;
      keptInk = ink;
    }
    // A valid repaint that still needs the panel is dropped: the first valid artwork stays.
  }
  // Every image requested after the first valid one was a repaint, kept or dropped.
  const artRepaints = images - first.image;
  if (artRepaints > 0) artRegenerated ??= "panel-repaint";

  const inkPanels = fits.flatMap((s) =>
    Object.entries(keptInk[s] ?? {})
      .filter(([, zone]) => zone.panel !== undefined)
      .map(([zone]) => ({ shape: s, zone })),
  );
  return {
    bytes: stripColorAndTextChunks(kept.art.bytes),
    mimeType: "image/png",
    width: kept.decoded.width,
    height: kept.decoded.height,
    proportion: SHAPE_PROPORTION[shape],
    fitsShapes: fits,
    ink: keptInk,
    artPrompt,
    telemetry: {
      imagesRequested: images,
      keptImage: kept.image,
      artRegenerated,
      artRepaints,
      validationFailures,
      inkPanels,
      repaintsStoppedBy,
    },
  };
}
