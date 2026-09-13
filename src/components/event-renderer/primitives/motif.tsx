/**
 * Shared motif rendering: the class and the two numbers a resolved motif contributes.
 *
 * `proof-b/renderer.js` built each pattern as a `repeating-linear-gradient` string with the scale
 * and opacity interpolated into it. That is exactly the CSS-text-from-a-spec-value that
 * `docs/event-renderer-system.md §6` forbids the renderer to derive, so the gradients live in
 * `event-tokens.css` written out by hand, keyed by `.ev-motif-<id>`, and the only things that
 * arrive at runtime are `--ev-motif-opacity` and `--ev-motif-scale` — two numbers the stylesheet
 * multiplies into its own static lengths with `calc()`.
 *
 * Suppression is not handled here on purpose: every caller reaches a motif through
 * `renderableMotif`, which returns `null` for one the ornament budget suppressed (§8), so a
 * suppressed motif has no class and no custom properties to contribute and simply is not drawn.
 */

import type { CSSProperties, ReactNode } from "react";

import type { ResolvedMotif } from "@/lib/renderer/compile/motifs";
import { cssNumbers } from "../contract";

/** The per-motif pattern class. Pattern motifs paint; arrangement motifs draw glyphs instead. */
export function motifClass(motif: ResolvedMotif | null): string {
  return motif && motif.kind === "pattern" ? `ev-motif-${motif.id}` : "";
}

/** The two numbers `event-tokens.css` multiplies into its own lengths and color-mix percentages. */
export function motifVars(motif: ResolvedMotif | null): CSSProperties {
  if (!motif) return {};
  return cssNumbers({ "--ev-motif-opacity": motif.opacity, "--ev-motif-scale": motif.scale });
}

/**
 * The arrangement marks, ported from `proof-b/renderer.js`'s `GLYPH` table.
 *
 * The reference jittered the count and rotation of each mark from a running seed. Nothing in
 * `docs/event-renderer-system.md §8` asks for that, and a renderer whose output depends on a
 * counter that advances with document order cannot be diffed across revisions or re-rendered
 * identically by the geometry verifier, so the arrangement here is fixed: one mark for an accent,
 * three for a divider. Scale still varies per motif, from the resolved `scale` the compiler chose.
 */
const GLYPH_PATHS: Record<string, readonly ReactNode[]> = {
  equestrian: [
    <path key="a" d="M6 22a10 10 0 1 1 20 0v6h-4v-6a6 6 0 1 0-12 0v6H6z" />,
    <g key="b">
      <circle cx="16" cy="16" r="10" />
      <path d="M2 16h28" />
    </g>,
  ],
  botanical: [
    <path
      key="a"
      d="M16 30V4M16 12c-5 0-9-3-10-7 5 0 9 3 10 7zM16 20c5 0 9-3 10-7-5 0-9 3-10 7zM16 26c-5 0-9-3-10-7 5 0 9 3 10 7z"
    />,
  ],
  celestial: [
    <path key="a" d="M16 2l3 11 11 3-11 3-3 11-3-11-11-3 11-3z" />,
    <circle key="b" cx="16" cy="16" r="3" />,
  ],
};

function Mark({ id, variant }: { id: string; variant: number }) {
  const shapes = GLYPH_PATHS[id] ?? GLYPH_PATHS.celestial;
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {shapes[variant % shapes.length]}
    </svg>
  );
}

/**
 * A row of arrangement marks. Wrapping is the §3.1 floor's job — `.ev-glyphs` wraps and its marks
 * shrink — so a row of ornament can never be what pushes a page into horizontal overflow.
 */
export function GlyphArrangement({ motif }: { motif: ResolvedMotif }) {
  const count = motif.role === "accent" ? 1 : 3;
  return (
    <span className="ev-glyphs" style={motifVars(motif)}>
      {Array.from({ length: count }, (_, i) => (
        <Mark key={i} id={motif.id} variant={i} />
      ))}
    </span>
  );
}
