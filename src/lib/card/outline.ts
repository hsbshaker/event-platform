/**
 * The six shapes' outlines as geometry (`docs/card-system.md §2.1`): an SVG path in card units,
 * built from `SHAPE_GEOMETRY` and the canvas, and the mask image the card renderer applies to the
 * whole card (artwork, panels and text) so that everything outside the outline is transparent.
 *
 * The outline is code-defined geometry and part of the layout set (`card_layouts_v4`); a model
 * never draws, positions or sizes it (`spec.md §32 #28`). Pure, no DOM.
 *
 * The path agrees with `insideOutline` (`shapes.ts`) everywhere except the rounded rectangle's
 * corners, which `insideOutline` deliberately does not subtract; here they are drawn at the
 * shape's `radius` (`outline.test.ts` samples both).
 */

import { canvasOf, SHAPE_GEOMETRY, type CardShape } from "./shapes";

function num(v: number): string {
  // Card-unit geometry is whole or half units; keep the path free of float noise.
  return String(Math.round(v * 1000) / 1000);
}

/** The shape's outline as a closed SVG path in card units (origin top-left, y down). */
export function outlinePath(shape: CardShape): string {
  const { width: w, height: h } = canvasOf(shape);
  switch (shape) {
    case "rectangle":
    case "square":
      return `M0 0H${num(w)}V${num(h)}H0Z`;
    case "rounded-rectangle": {
      const r = SHAPE_GEOMETRY[shape].radius;
      if (r === undefined || !(r > 0) || r * 2 > Math.min(w, h)) {
        throw new Error(`rounded-rectangle needs a radius in (0, ${Math.min(w, h) / 2}]`);
      }
      const arc = (x: number, y: number) => `A${num(r)} ${num(r)} 0 0 1 ${num(x)} ${num(y)}`;
      return [
        `M${num(r)} 0`,
        `H${num(w - r)}`,
        arc(w, r),
        `V${num(h - r)}`,
        arc(w - r, h),
        `H${num(r)}`,
        arc(0, h - r),
        `V${num(r)}`,
        arc(r, 0),
        "Z",
      ].join("");
    }
    case "arch": {
      // Flat bottom, semicircular top: a half-circle of the card's width over a rectangle.
      const r = w / 2;
      return `M0 ${num(h)}V${num(r)}A${num(r)} ${num(r)} 0 0 1 ${num(w)} ${num(r)}V${num(h)}Z`;
    }
    case "oval":
    case "circle": {
      // An ellipse inscribed in the canvas (a circle on the square canvas), as two half arcs.
      const rx = w / 2;
      const ry = h / 2;
      const a = (x: number) => `A${num(rx)} ${num(ry)} 0 1 1 ${num(x)} ${num(ry)}`;
      return `M0 ${num(ry)}${a(w)}${a(0)}Z`;
    }
  }
}

/**
 * The outline as a standalone SVG document filling the card's canvas. `preserveAspectRatio="none"`
 * so that, sized 100% × 100% of the card, card units map exactly onto the card's box.
 */
export function outlineSvg(shape: CardShape): string {
  const { width: w, height: h } = canvasOf(shape);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `preserveAspectRatio="none"><path d="${outlinePath(shape)}" fill="#000"/></svg>`
  );
}

/**
 * The CSS `mask-image` value for the shape: the outline SVG as a data URI. Used as an alpha mask
 * (opaque inside the outline, transparent outside), sized `100% 100%`, never repeated.
 */
export function outlineMaskImage(shape: CardShape): string {
  return `url("data:image/svg+xml,${encodeURIComponent(outlineSvg(shape))}")`;
}
