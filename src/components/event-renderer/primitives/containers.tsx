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
 * None of them branches on anything but its own props and resolved layout. There is no recipe,
 * silhouette or template identifier in scope (`docs/event-renderer-system.md §7.1`).
 */

import { Fragment } from "react";

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
import { cssNumbers, cssVars, renderableMotif, layoutOf } from "../contract";
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
  return (
    <div
      className={`ev-rail ev-side-${node.side} ev-w-${node.width} ev-m-${node.mobile}`}
      data-id={node.id}
      style={cssVars({ "--ev-rail-w": l?.widthPx })}
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
  return (
    <div
      className={`ev-frame${motif ? ` ${motifClass(motif)}` : ""}`}
      data-id={node.id}
      style={{ ...cssVars({ "--ev-inset": l?.insetPx }), ...motifVars(motif) }}
    >
      <div className={`ev-frame-box ev-rule-${node.rule}`}>{ctx.renderNode(node.child)}</div>
    </div>
  );
});

export const SurfacePrimitive = primitive<Surface>((node, ctx) => {
  const l = layoutOf<SurfaceLayout>(ctx, node);
  return (
    <div
      className={`ev-surface ev-surf-${node.role}`}
      data-id={node.id}
      style={cssVars({ "--ev-inset": l?.insetPx })}
    >
      {ctx.renderNode(node.child)}
    </div>
  );
});

export const OverlayPrimitive = primitive<Overlay>((node, ctx) => {
  const l = layoutOf<OverlayLayout>(ctx, node);
  return (
    <div
      // `extent` is a four-value enum whose decoration box is not a linear function of its
      // percentage, so the class carries it and no number is emitted.
      className={`ev-overlay ev-anchor-${l?.anchor ?? node.anchor} ev-ext-${node.extent} ev-m-${node.mobile}`}
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
