/**
 * The nine layout containers.
 *
 * Each one emits a class per enum token the model chose and a numeric custom property per value
 * the compiler resolved, and nothing else: no size, no color, no CSS text
 * (`docs/event-renderer-system.md §6`, `spec.md §32` #19). Where the reference computed a string —
 * `--cols: 62fr 38fr` for a `Split`, a gradient for a `Frame`'s motif margin — the number is
 * emitted bare and `event-tokens.css` does the arithmetic in `calc()`, so the stylesheet stays
 * static and the model's token stays a number.
 *
 * None of them branches on anything but its own props, its resolved layout and its verified-fit
 * override. There is no recipe, silhouette or template identifier in scope
 * (`docs/event-renderer-system.md §7.1`).
 *
 * # The three relaxable boxes
 *
 * `Frame`, `Surface` and `Rail` are the boxes §3.1 lets rendered-geometry verification relax when
 * demoting emphasis was not enough: "the innermost `Frame`/`Surface`/`Rail` around the node is
 * relaxed (Frame → Stack, Surface inset → tight, Rail widened)". Each reads its relaxation through
 * `effectiveRelaxation` and changes only what it renders. The node keeps its type, its id and its
 * props — a relaxed `Frame` is still a `Frame` in the tree and still carries `data-id`, because the
 * §6 re-fit contract requires the canonical tree and the `compositionHash` to survive a fit
 * unchanged (`@/lib/renderer/compile/verification`).
 *
 * The relaxed values come from `SCALES`, the same table `resolveLayout` reads, so there is exactly
 * one definition of what "tight" and "one step wider" are worth in pixels.
 */

import { Fragment } from "react";

import { effectiveRelaxation, widenRail } from "@/lib/renderer/compile/verification";
import { SCALES } from "@/lib/renderer/composition/layout";

import type {
  Cell,
  Cluster,
  Frame,
  Grid,
  Overlay,
  Rail,
  Split,
  Stack,
  Surface,
} from "@/lib/renderer/composition/nodes";
import type { RailWidth } from "@/lib/renderer/composition/tokens";
import { artworkPlacement, cssNumbers, cssVars, renderableMotif, layoutOf } from "../contract";
import { primitive } from "../primitive";
import type {
  CellLayout,
  ClusterLayout,
  FrameLayout,
  GridLayout,
  OverlayLayout,
  RailLayout,
  SplitLayout,
  StackLayout,
  SurfaceLayout,
} from "../resolved-layout";
import { motifClass, motifVars } from "./motif";

export const StackPrimitive = primitive<Stack>((node, ctx) => {
  const l = layoutOf<StackLayout>(ctx, node);
  return (
    <div
      className={`ev-stack${node.align ? ` ev-al-${node.align}` : ""}`}
      data-id={node.id}
      style={cssVars({ "--ev-gap": l?.gapPx })}
    >
      {node.children.map((child, i) => (
        <Fragment key={i}>{ctx.renderNode(child)}</Fragment>
      ))}
    </div>
  );
});

export const ClusterPrimitive = primitive<Cluster>((node, ctx) => {
  const l = layoutOf<ClusterLayout>(ctx, node);
  return (
    <div
      className={`ev-cluster${node.justify ? ` ev-j-${node.justify}` : ""}`}
      data-id={node.id}
      style={cssVars({ "--ev-gap": l?.gapPx })}
    >
      {node.children.map((child, i) => (
        <Fragment key={i}>{ctx.renderNode(child)}</Fragment>
      ))}
    </div>
  );
});

export const SplitPrimitive = primitive<Split>((node, ctx) => {
  const l = layoutOf<SplitLayout>(ctx, node);
  return (
    <div
      className={`ev-split ev-m-${node.mobile} ev-sal-${node.align ?? "stretch"} ev-div-${node.divider ?? "none"}`}
      data-id={node.id}
      // The share of the first column, as a bare number. `event-tokens.css` turns it into the two
      // `fr` tracks; the reference interpolated the whole `grid-template-columns` value instead.
      style={cssNumbers({ "--ev-split-first": l?.first })}
    >
      {node.children.map((child, i) => (
        <Fragment key={i}>{ctx.renderNode(child)}</Fragment>
      ))}
    </div>
  );
});

export const RailPrimitive = primitive<Rail>((node, ctx) => {
  const l = layoutOf<RailLayout>(ctx, node);
  // `rail-widen`: one step along the approved widths. A rail already at the widest has nowhere to
  // go, so `widenRail` returns null and the authored width stands — the verifier does not choose
  // that relaxation for such a rail, and honouring it here would be a silent no-op either way.
  const widened =
    effectiveRelaxation(ctx.overrides, node.id) === "rail-widen"
      ? (widenRail(node.width) as RailWidth | null)
      : null;
  const width = widened ?? node.width;
  return (
    <div
      className={`ev-rail ev-side-${node.side} ev-w-${width} ev-m-${node.mobile}`}
      data-id={node.id}
      style={cssVars({ "--ev-rail-w": widened ? SCALES.railPx[widened] : l?.widthPx })}
    >
      <div className="ev-rail-track">{ctx.renderNode(node.rail)}</div>
      <div className="ev-rail-main">{ctx.renderNode(node.child)}</div>
    </div>
  );
});

export const GridPrimitive = primitive<Grid>((node, ctx) => {
  const l = layoutOf<GridLayout>(ctx, node);
  return (
    <div
      className={`ev-grid${l?.ruled ? " ev-ruled" : ""}`}
      data-id={node.id}
      style={{
        ...cssNumbers({ "--ev-cols": l?.columns, "--ev-mcols": l?.mobileColumns }),
        ...cssVars({ "--ev-gap": l?.gapPx }),
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={i}>{ctx.renderNode(child)}</Fragment>
      ))}
    </div>
  );
});

export const CellPrimitive = primitive<Cell>((node, ctx) => {
  const l = layoutOf<CellLayout>(ctx, node);
  return (
    <div
      className="ev-cell"
      data-id={node.id}
      // `cssVars` drops undefined, so an unspanned cell emits no property and the stylesheet's
      // own `1` default stands.
      style={cssNumbers({ "--ev-span": l?.span, "--ev-rspan": l?.rowSpan })}
    >
      {ctx.renderNode(node.child)}
    </div>
  );
});

export const FramePrimitive = primitive<Frame>((node, ctx) => {
  const l = layoutOf<FrameLayout>(ctx, node);
  const motif = renderableMotif(ctx, node);
  // `frame-as-stack`: the frame gives up its rule and its inset, which is what its box was costing
  // the content. It is not rewritten into a `Stack` — the node stays a `Frame` and keeps its id.
  const asStack = effectiveRelaxation(ctx.overrides, node.id) === "frame-as-stack";
  return (
    <div
      className={`ev-frame${motif ? ` ${motifClass(motif)}` : ""}`}
      data-id={node.id}
      style={{ ...cssVars({ "--ev-inset": asStack ? 0 : l?.insetPx }), ...motifVars(motif) }}
    >
      <div className={`ev-frame-box ev-rule-${asStack ? "none" : node.rule}`}>
        {ctx.renderNode(node.child)}
      </div>
    </div>
  );
});

export const SurfacePrimitive = primitive<Surface>((node, ctx) => {
  const l = layoutOf<SurfaceLayout>(ctx, node);
  // `surface-inset-tight`: the surface renders at the tight inset whatever it asked for.
  const tight = effectiveRelaxation(ctx.overrides, node.id) === "surface-inset-tight";
  return (
    <div
      className={`ev-surface ev-surf-${node.role}`}
      data-id={node.id}
      style={cssVars({ "--ev-inset": tight ? SCALES.insetPx.tight : l?.insetPx })}
    >
      {ctx.renderNode(node.child)}
    </div>
  );
});

export const OverlayPrimitive = primitive<Overlay>((node, ctx) => {
  const l = layoutOf<OverlayLayout>(ctx, node);
  // An overlay whose decoration is an artwork *zone* is not an overlay in the watermark sense any
  // more: the compiler resolved the artwork to sit beside the words rather than under them, so the
  // stylesheet has to give it a real side and inset the content away from it. Read from the
  // resolved spec, never from the node — the treatment is the compiler's decision
  // (`@/lib/renderer/compile/artwork`), and a decoration with no artwork keeps the old behaviour
  // exactly.
  const art = artworkPlacement(ctx, node.decoration);
  return (
    <div
      // `extent` is a four-value enum whose decoration box is not a linear function of its
      // percentage, so the class carries it and no number is emitted.
      className={`ev-overlay ev-anchor-${l?.anchor ?? node.anchor} ev-ext-${node.extent} ev-m-${node.mobile}${art ? ` ev-ov-art-${art.treatment}${art.side ? ` ev-ov-side-${art.side}` : ""}` : ""}`}
      data-id={node.id}
    >
      <div className="ev-overlay-content">{ctx.renderNode(node.content)}</div>
      {/* A decoration is a watermark: the stylesheet clips it and holds it behind the content, so
          it can never take space from text or widen the page. */}
      <div className="ev-overlay-decoration" aria-hidden="true">
        {ctx.renderNode(node.decoration)}
      </div>
    </div>
  );
});
