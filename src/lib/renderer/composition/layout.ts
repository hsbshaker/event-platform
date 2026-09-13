/**
 * 7. Layout resolution (tokens → values; the renderer reads only this).
 *
 * The renderer consumes numeric custom properties and classes, never CSS text derived from model
 * output (`docs/event-renderer-system.md §6`, `spec.md §32` #19). Every entry is keyed by the
 * canonical node id, so `resolveLayout` must run on a canonicalized tree.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type {
  Cluster,
  CompositionTree,
  Cell,
  Frame,
  Grid,
  MotifBand,
  MotifField,
  Overlay,
  Rail,
  Split,
  Stack,
  Surface,
} from "./nodes";
import type { BandHeight, Emphasis, Extent, Gap, Inset, RailWidth } from "./tokens";
import { walk } from "./walk";

export const SCALES = {
  railPx: { thin: 48, medium: 96, wide: 192 },
  bandPx: { thin: 24, medium: 48, tall: 96 },
  insetPx: { tight: 14, normal: 36, deep: 64 },
  gapPx: {
    compact: { tight: 8, normal: 16, loose: 24 },
    balanced: { tight: 10, normal: 22, loose: 34 },
    spacious: { tight: 14, normal: 30, loose: 44 },
  },
  extentPct: { quarter: 25, third: 33, half: 50, full: 100 },
};

export function resolveLayout(
  tree: CompositionTree,
  density: "compact" | "balanced" | "spacious",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  walk(tree, ({ node }) => {
    const id = node.id!;
    switch (node.t) {
      case "Split": {
        const a = node as Split;
        out[id] = { first: Number(a.ratio), mobile: a.mobile, align: a.align };
        break;
      }
      case "Rail": {
        const a = node as Rail;
        out[id] = { side: a.side, widthPx: SCALES.railPx[a.width as RailWidth], mobile: a.mobile };
        break;
      }
      case "Grid": {
        const a = node as Grid;
        out[id] = {
          columns: a.columns,
          mobileColumns: a.mobile,
          ruled: !!a.ruled,
          gapPx: SCALES.gapPx[density][a.gap as Gap],
        };
        break;
      }
      case "Cell": {
        const a = node as Cell;
        out[id] = { span: a.span, rowSpan: a.rowSpan };
        break;
      }
      case "Frame": {
        const a = node as Frame;
        out[id] = {
          rule: a.rule,
          insetPx: SCALES.insetPx[a.inset as Inset],
          motif: a.motif || null,
        };
        break;
      }
      case "Surface": {
        const a = node as Surface;
        out[id] = { role: a.role, insetPx: SCALES.insetPx[a.inset as Inset] };
        break;
      }
      case "Overlay": {
        const a = node as Overlay;
        out[id] = {
          anchor: a.anchor,
          extentPct: SCALES.extentPct[a.extent as Extent],
          mobile: a.mobile,
        };
        break;
      }
      case "Stack": {
        const a = node as Stack;
        out[id] = { gapPx: SCALES.gapPx[density][a.gap as Gap], align: a.align || null };
        break;
      }
      case "Cluster": {
        const a = node as Cluster;
        out[id] = { gapPx: SCALES.gapPx[density][a.gap as Gap], justify: a.justify };
        break;
      }
      case "MotifField": {
        const a = node as MotifField;
        out[id] = { motif: a.motif, extentPct: SCALES.extentPct[a.extent as Extent] };
        break;
      }
      case "MotifBand": {
        const a = node as MotifBand;
        out[id] = {
          heightPx: SCALES.bandPx[a.height as BandHeight],
          motif: a.motif || null,
          fill: a.fill,
        };
        break;
      }
      default:
        out[id] = { emphasis: (node as { emphasis?: Emphasis }).emphasis || null };
    }
  });
  return out;
}
