import { describe, expect, it } from "vitest";

import { outlineMaskImage, outlinePath, outlineSvg } from "./outline";
import { CARD_SHAPES, canvasOf, insideOutline, SHAPE_GEOMETRY, type CardShape } from "./shapes";

type Pt = [number, number];

/**
 * Flatten an SVG path of absolute M/L/H/V/A/Z commands into polygons. Arcs use the endpoint to
 * centre conversion of SVG 1.1 Appendix F.6.5 and are cut into 360 segments each, so the polygon
 * is within a hundredth of a card unit of the true outline.
 */
function flatten(d: string): Pt[][] {
  const tokens = d.match(/[MLHVAZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polys: Pt[][] = [];
  let poly: Pt[] = [];
  let cur: Pt = [0, 0];
  let i = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case "M":
        if (poly.length) polys.push(poly);
        cur = [n(), n()];
        poly = [cur];
        break;
      case "L":
        cur = [n(), n()];
        poly.push(cur);
        break;
      case "H":
        cur = [n(), cur[1]];
        poly.push(cur);
        break;
      case "V":
        cur = [cur[0], n()];
        poly.push(cur);
        break;
      case "A": {
        let rx = n();
        let ry = n();
        n(); // x-axis rotation: always 0 in card outlines
        const large = n() === 1;
        const sweep = n() === 1;
        const [x1, y1] = cur;
        const [x2, y2] = [n(), n()];
        const dx = (x1 - x2) / 2;
        const dy = (y1 - y2) / 2;
        const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (lambda > 1) {
          rx *= Math.sqrt(lambda);
          ry *= Math.sqrt(lambda);
        }
        const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx;
        const den = rx * rx * dy * dy + ry * ry * dx * dx;
        const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
        const cx = k * ((rx * dy) / ry) + (x1 + x2) / 2;
        const cy = k * (-(ry * dx) / rx) + (y1 + y2) / 2;
        const t1 = Math.atan2((y1 - cy) / ry, (x1 - cx) / rx);
        let dt = Math.atan2((y2 - cy) / ry, (x2 - cx) / rx) - t1;
        if (sweep && dt < 0) dt += 2 * Math.PI;
        if (!sweep && dt > 0) dt -= 2 * Math.PI;
        const steps = 360;
        for (let s = 1; s <= steps; s += 1) {
          const t = t1 + (dt * s) / steps;
          poly.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
        }
        cur = [x2, y2];
        break;
      }
      case "Z":
        break;
      default:
        throw new Error(`unexpected path token ${cmd}`);
    }
  }
  if (poly.length) polys.push(poly);
  return polys;
}

/** Even-odd point in polygon. */
function inside(polys: Pt[][], x: number, y: number): boolean {
  let hit = false;
  for (const poly of polys) {
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a];
      const [xb, yb] = poly[b];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) hit = !hit;
    }
  }
  return hit;
}

/** `insideOutline`, with the rounded rectangle's corners subtracted at the shape's radius. */
function expected(shape: CardShape, x: number, y: number): boolean {
  const { width: w, height: h } = canvasOf(shape);
  if (x < 0 || y < 0 || x > w || y > h) return false;
  if (!insideOutline(shape, x, y)) return false;
  if (shape === "rounded-rectangle") {
    const r = SHAPE_GEOMETRY[shape].radius!;
    const cx = x < r ? r : x > w - r ? w - r : x;
    const cy = y < r ? r : y > h - r ? h - r : y;
    return Math.hypot(x - cx, y - cy) <= r;
  }
  return true;
}

describe("card outlines", () => {
  it.each(CARD_SHAPES)("%s: the path matches the outline geometry by sampling", (shape) => {
    const polys = flatten(outlinePath(shape));
    const { width: w, height: h } = canvasOf(shape);
    let compared = 0;
    let insideCount = 0;
    const mismatches: string[] = [];
    const EPS = 0.5;
    for (let y = -20; y <= h + 20; y += 7) {
      for (let x = -20; x <= w + 20; x += 7) {
        const want = expected(shape, x, y);
        // Points within EPS of the boundary are ambiguous at any sampling precision; skip them.
        const stable = [
          [EPS, 0],
          [-EPS, 0],
          [0, EPS],
          [0, -EPS],
        ].every(([dx, dy]) => expected(shape, x + dx, y + dy) === want);
        if (!stable) continue;
        if (inside(polys, x, y) !== want) mismatches.push(`${x},${y}`);
        compared += 1;
        if (want) insideCount += 1;
      }
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(20_000);
    expect(insideCount).toBeGreaterThan(compared / 2);
  });

  it("cuts the corners of every shape but the rectangle and the square", () => {
    for (const shape of CARD_SHAPES) {
      const polys = flatten(outlinePath(shape));
      const { width: w, height: h } = canvasOf(shape);
      const cornersCut = !["rectangle", "square"].includes(shape);
      expect(inside(polys, 2, 2), shape).toBe(!cornersCut);
      expect(inside(polys, w / 2, h / 2), shape).toBe(true);
      // The arch keeps its flat bottom corners.
      expect(inside(polys, 2, h - 2), shape).toBe(!cornersCut || shape === "arch");
    }
  });

  it("builds an SVG mask that stretches to the card's box", () => {
    for (const shape of CARD_SHAPES) {
      const { width: w, height: h } = canvasOf(shape);
      const svg = outlineSvg(shape);
      expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
      expect(svg).toContain('preserveAspectRatio="none"');
      expect(svg).toContain(outlinePath(shape));
      const mask = outlineMaskImage(shape);
      expect(mask.startsWith('url("data:image/svg+xml,')).toBe(true);
      expect(decodeURIComponent(mask.slice(24, -2))).toBe(svg);
      // Nothing in the data URI can close the CSS string early.
      expect(mask.slice(5, -2)).not.toMatch(/["\\\n]/);
    }
  });
});
