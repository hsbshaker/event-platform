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
  Artwork,
  Glyph,
  Monogram,
  MotifBand,
  MotifField,
  RuleNode,
} from "@/lib/renderer/composition/nodes";
import { cssVars, layoutOf, renderableArtwork, renderableMotif } from "../contract";
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

/**
 * Generated thematic artwork, or the space it was promised.
 *
 * The box always renders, and only the image is conditional. That is the same disposition
 * `MotifField` takes with a suppressed motif, for the same reason: the composition reserved this
 * area and the layout was designed around it, so removing it would reflow a page the model
 * composed — and, more sharply here, would reflow a page that rendered-geometry verification
 * already certified. The spec is verified before any image exists (`spec.md §7.6a`,
 * `@/lib/renderer/compile/artwork`), so an assetless render must be geometrically identical to an
 * asset-bearing one or the verification would only have covered one of the two pages this spec can
 * produce.
 *
 * The scrim is the compiler's, not this component's: a resolved alpha of the section's own surface
 * colour, over the asset and under the text, so `§7.6a #5`'s "text readability always wins" is
 * decided against a colour the compiler owns rather than against an image nobody has seen. It is
 * emitted as a numeric custom property, never as a computed colour string.
 */
export const ArtworkPrimitive = primitive<Artwork>((node, ctx) => {
  const drawable = renderableArtwork(ctx, node);
  const extent = node.extent ?? ctx.artwork[node.id ?? ""]?.extent ?? "full";
  return (
    <div
      className={`ev-art ev-art-${node.role} ev-ext-${extent}`}
      data-id={node.id}
      aria-hidden={drawable && drawable.asset.alt ? undefined : "true"}
      style={cssVars({ "--ev-art-scrim": drawable?.resolved.scrim ?? undefined })}
    >
      {drawable ? (
        /*
         * A plain `<img>`, and `next/image` would be wrong here twice over. The verifier renders
         * this exact tree through `renderToStaticMarkup` outside the Next runtime, where the
         * loader does not exist, so the measured page would stop being the served page. And
         * `next/image` supplies its own sizing and wrapper, which is the one thing this primitive
         * must not allow: the box is the geometry, fixed before any asset existed, and an element
         * that sized itself to its content would invalidate the verification the spec was frozen
         * under.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="ev-art-img"
          src={drawable.asset.src}
          alt={drawable.asset.alt}
          width={drawable.asset.width}
          height={drawable.asset.height}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      {drawable && drawable.resolved.scrim !== null ? (
        <div className="ev-art-scrim" aria-hidden="true" />
      ) : null}
    </div>
  );
});
