import { ART_MODES } from "@/lib/card/art-modes";
import type { ArtMode } from "@/lib/card/art-modes";
import type { CardDesign } from "@/lib/card/design";
import { CARD_LAYOUT_IDS } from "@/lib/card/layouts";
import type { CardLayoutId } from "@/lib/card/layouts";
import { RENDERINGS } from "@/lib/card/renderings";
import { CARD_SHAPES } from "@/lib/card/shapes";
import type { CardShape } from "@/lib/card/shapes";
import { TYPOGRAPHY_KEYS } from "@/lib/card/typography";

/** The design a shape switch paints for, read back as the artwork stage needs it. */
export interface SwitchingDesign {
  id: string;
  shape: CardShape;
  layout: CardLayoutId;
  artMode: ArtMode;
  typography: CardDesign["typography"];
  wording: { title: string; invitationLine: string };
  artBrief: CardDesign["artBrief"];
}

/** A `card_designs` row as read for a shape switch. */
export interface SwitchingDesignRow {
  id: string;
  shape: unknown;
  layout: unknown;
  art_mode: unknown;
  typography: unknown;
  wording: unknown;
  art_brief: unknown;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A design's row read as a shape switch paints from it, or null when it lacks what the art prompt
 * needs (a brief from before rendering families, a catalog id since retired). The row is the
 * server's own validated output, read structurally rather than re-validated against today's schema
 * (`docs/card-system.md §4.1`: a persisted design is never re-validated). Pure: shared by the
 * generation (`run.server.ts`) and the shape control (`shape.server.ts`), which never offers new
 * artwork for a design this cannot read.
 */
export function readSwitchingDesign(row: SwitchingDesignRow): SwitchingDesign | null {
  const typography = isRecord(row.typography) ? row.typography : {};
  const wording = isRecord(row.wording) ? row.wording : {};
  const brief = isRecord(row.art_brief) ? row.art_brief : {};
  const palette = isRecord(brief.palette) ? brief.palette : {};
  const pairing = (value: unknown) =>
    isString(value) && (TYPOGRAPHY_KEYS as readonly string[]).includes(value);
  if (
    !(CARD_SHAPES as readonly unknown[]).includes(row.shape) ||
    !(CARD_LAYOUT_IDS as readonly unknown[]).includes(row.layout) ||
    !(ART_MODES as readonly unknown[]).includes(row.art_mode) ||
    !pairing(typography.primary) ||
    !Array.isArray(typography.alternates) ||
    !typography.alternates.every(pairing) ||
    !isString(wording.title) ||
    !isString(wording.invitationLine) ||
    !(RENDERINGS as readonly unknown[]).includes(brief.rendering) ||
    ![brief.subject, brief.aesthetic, brief.medium, brief.mood, brief.texture].every(isString) ||
    !isString(palette.description) ||
    !Array.isArray(palette.colors) ||
    !palette.colors.every(isString) ||
    !Array.isArray(brief.avoid) ||
    !brief.avoid.every(isString)
  ) {
    return null;
  }
  return {
    id: row.id,
    shape: row.shape as CardShape,
    layout: row.layout as CardLayoutId,
    artMode: row.art_mode as ArtMode,
    typography: typography as unknown as CardDesign["typography"],
    wording: { title: wording.title, invitationLine: wording.invitationLine },
    artBrief: brief as unknown as CardDesign["artBrief"],
  };
}
