/**
 * The five decorative leaves.
 *
 * All four motif-bearing ones reach their motif through `renderableMotif`, which is what makes the
 * ornament budget binding: a motif the compiler resolved with `render: false` returns `null` here
 * and is not drawn, while its entry stays in the spec as evidence
 * (`docs/event-renderer-system.md §8`, `docs/design-system.md §15.7`, `spec.md §32` #25). None of
 * them reads `ctx.motifs` directly.
 *
 * What a suppressed motif leaves behind differs by primitive, and the difference is deliberate. A
 * `MotifField` and a `MotifBand` are areas the composition reserved, so the box stays and only the
 * pattern goes — removing it would reflow a layout the model designed around. A `Glyph` *is* its
 * mark, so a suppressed one renders nothing at all; likewise a `Rule`'s glyph divider falls back
 * to the plain rule it decorates.
 */

import type {
  Glyph,
  Monogram,
  MotifBand,
  MotifField,
  RuleNode,
} from "@/lib/renderer/composition/nodes";
import { cssVars, layoutOf, renderableMotif } from "../contract";
import { primitive } from "../primitive";
import type { MotifBandLayout } from "../resolved-layout";
import { GlyphArrangement, motifClass, motifVars } from "./motif";

export const MotifFieldPrimitive = primitive<MotifField>((node, ctx) => {
  const motif = renderableMotif(ctx, node);
  return (
    <div
      // As with `Overlay`, `extent` stays an enum class: the reserved area is a fraction of the
      // hero, not of the field's own box, so its percentage is not the number to emit.
      className={`ev-field ev-ext-${node.extent ?? "full"}${motif ? ` ${motifClass(motif)}` : ""}`}
      data-id={node.id}
      aria-hidden="true"
      style={motifVars(motif)}
    />
  );
});

export const MotifBandPrimitive = primitive<MotifBand>((node, ctx) => {
  const l = layoutOf<MotifBandLayout>(ctx, node);
  // An accent band is a filled strip, not a patterned one: it takes its color from the surface's
  // accent role and never carries a motif class.
  const accent = node.fill === "accent";
  const motif = accent ? null : renderableMotif(ctx, node);
  return (
    <div
      className={`ev-band${accent ? " ev-band-accent" : ""}${motif ? ` ${motifClass(motif)}` : ""}`}
      data-id={node.id}
      aria-hidden="true"
      style={{ ...cssVars({ "--ev-band-h": l?.heightPx }), ...motifVars(motif) }}
    />
  );
});

export const RulePrimitive = primitive<RuleNode>((node, ctx) => {
  const motif = renderableMotif(ctx, node);
  if (node.orientation === "v") {
    return <div className={`ev-rule ev-rule-v ev-w-${node.weight}`} data-id={node.id} />;
  }
  if (!motif) return <div className={`ev-rule ev-w-${node.weight}`} data-id={node.id} />;
  return (
    <div className={`ev-divider ev-w-${node.weight}`} data-id={node.id} aria-hidden="true">
      <GlyphArrangement motif={motif} />
    </div>
  );
});

export const GlyphPrimitive = primitive<Glyph>((node, ctx) => {
  const motif = renderableMotif(ctx, node);
  if (!motif) return null;
  return (
    <div className="ev-glyph" data-id={node.id} aria-hidden="true">
      <GlyphArrangement motif={motif} />
    </div>
  );
});

export const MonogramPrimitive = primitive<Monogram>((node, ctx) => {
  // The initial is event content, not ornament, so it is never suppressed by the ornament budget.
  // It is still decorative in the accessibility sense: the event title carries the same name.
  if (!ctx.content.initial) return null;
  return (
    <div className={`ev-monogram ev-mono-${node.style}`} data-id={node.id} aria-hidden="true">
      <span>{ctx.content.initial}</span>
    </div>
  );
});
