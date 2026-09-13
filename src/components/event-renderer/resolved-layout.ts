/**
 * The shapes `resolveLayout` puts in `spec.layout`, typed at the point of consumption.
 *
 * `composition/layout.ts` returns `Record<string, unknown>` — one map holding a different shape per
 * node type — so the renderer states which shape it expects per primitive rather than asserting a
 * union at every call site. These are read-only views of that module's output: if it ever emits a
 * different field, the mismatch surfaces here instead of as a silently `undefined` custom property.
 *
 * Every value is a number or an enum token, never CSS text (`docs/event-renderer-system.md §6`).
 */

import type { MotifRef } from "@/lib/renderer/composition/tokens";

export interface SplitLayout {
  /** The first column's share, 38 | 50 | 62. The stylesheet turns it into `fr` units. */
  readonly first: number;
  readonly mobile: "stack" | "stack-reverse" | "keep";
  readonly align?: "start" | "center" | "stretch";
}

export interface RailLayout {
  readonly side: "start" | "end";
  readonly widthPx: number;
  readonly mobile: "top" | "bottom" | "hide";
}

export interface GridLayout {
  readonly columns: number;
  readonly mobileColumns: number;
  readonly ruled: boolean;
  readonly gapPx: number;
}

export interface CellLayout {
  readonly span?: number;
  readonly rowSpan?: number;
}

export interface FrameLayout {
  readonly rule: string;
  readonly insetPx: number;
  readonly motif: MotifRef | null;
}

export interface SurfaceLayout {
  readonly role: string;
  readonly insetPx: number;
}

export interface OverlayLayout {
  readonly anchor: string;
  readonly extentPct: number;
  readonly mobile: "stack" | "keep";
}

export interface StackLayout {
  readonly gapPx: number;
  readonly align: string | null;
}

export interface ClusterLayout {
  readonly gapPx: number;
  readonly justify?: string;
}

export interface MotifFieldLayout {
  readonly motif: MotifRef;
  readonly extentPct: number;
}

export interface MotifBandLayout {
  readonly heightPx: number;
  readonly motif: MotifRef | null;
  readonly fill?: "pattern" | "accent";
}
