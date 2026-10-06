/**
 * The card as an SVG for its link-preview image (`spec.md §11.10`; `docs/card-system.md §6.4`).
 *
 * Drawn from exactly the data `InvitationCard` renders — the effective shape, the artwork for its
 * proportion, the resolved panels and the stored `TextBox[]` — validated by the same function
 * (`card-data.ts`), in the same coordinate system (card units, 1000 wide), with the same layers in
 * the same order:
 *
 * 1. the artwork, stretched to the canvas (`object-fit: fill`) — or, when it gave way to the words
 *    (`card_layouts_v4`), a plate's fill under it and the artwork at its stored rectangle, a plate
 *    clipped at its cut and by its own outline scaled to that rectangle (`artworkSvg`);
 * 2. each panel: with a fade (`card_layouts_v3`), the opaque paper and its eased fade as gradients;
 *    without (`card_layouts_v2`), its soft edge (CSS `box-shadow: 0 0 blur spread`) and the opaque
 *    rounded rectangle;
 * 3. every box with lines, in paint order (`z`, then reading order), each stored line drawn as
 *    glyph outlines (`text/glyph-outlines.ts`) at the box's position, width, alignment, rotation
 *    about its centre, size, line height, letter spacing, case and colour;
 *
 * all clipped by the shape's outline (`outline.ts`). Nothing is laid out here: no line is broken,
 * joined or measured anew — each line's width is the one it was broken at.
 *
 * Pure apart from the injected glyph outlines; no DOM, no network.
 */

import "server-only";

import {
  paintOrder,
  panelFadeAxis,
  panelFeather,
  validateCardData,
  type CardPanel,
  type CardPlacement,
  InvalidCardDataError,
} from "./card-data";
import { outlinePath } from "./outline";
import { CARD_CANVAS, type CardProportion, type CardShape } from "./shapes";
import type { TextBox } from "./text-box";
import type { GlyphOutlinesResolver } from "./text/glyph-outlines";

/** Raster formats the preview accepts for artwork (what the image model returns). */
export type ArtworkMime = "image/png" | "image/jpeg";

export interface CardPreviewArtwork {
  bytes: Uint8Array;
  proportion: CardProportion;
}

/** What a card preview is drawn from: `InvitationCard`'s props, with the artwork as bytes. */
export interface CardPreviewData {
  shape: CardShape;
  artwork: CardPreviewArtwork;
  panels?: readonly CardPanel[];
  placement?: CardPlacement;
  boxes: readonly TextBox[];
}

/**
 * The artwork layer, as `InvitationCard` draws it (`CardPlacement`): over the whole canvas with no
 * placement; at its stored rectangle for a crop; for a plate, at its stored rectangle clipped by
 * the outline scaled to that rectangle, inside a group clipped at the cut. A plate's fill is the
 * face under it, drawn first.
 */
function artworkSvg(
  shape: CardShape,
  href: string,
  canvas: { width: number; height: number },
  placement: CardPlacement | undefined,
): { defs: string; body: string } {
  const { width: w, height: h } = canvas;
  const image = (r: { x: number; y: number; width: number; height: number }, extra = "") =>
    `<image href="${href}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" ` +
    `preserveAspectRatio="none"${extra}/>`;
  if (!placement) return { defs: "", body: image({ x: 0, y: 0, width: w, height: h }) };
  const fill = placement.fill
    ? `<rect data-card-fill="" x="0" y="0" width="${w}" height="${h}" fill="${placement.fill}"/>`
    : "";
  const { art, cut } = placement;
  if (placement.kind === "crop" || !cut) {
    return { defs: "", body: fill + image(art, ` data-card-art="crop"`) };
  }
  const top = cut.keep === "above" ? 0 : cut.y;
  const bottom = cut.keep === "above" ? cut.y : h;
  const defs =
    `<clipPath id="card-art-cut"><rect x="0" y="${n(top)}" width="${w}" height="${n(bottom - top)}"/></clipPath>` +
    `<clipPath id="card-art-outline"><path d="${outlinePath(shape)}" ` +
    `transform="translate(${n(art.x)} ${n(art.y)}) scale(${n5(art.width / w)} ${n5(art.height / h)})"/></clipPath>`;
  return {
    defs,
    body:
      fill +
      `<g clip-path="url(#card-art-cut)">` +
      image(art, ` clip-path="url(#card-art-outline)" data-card-art="plate"`) +
      `</g>`,
  };
}

/** The artwork's type from its magic bytes; anything but PNG or JPEG is refused. */
export function artworkMime(bytes: Uint8Array): ArtworkMime {
  const at = (offset: number, ...values: number[]) =>
    values.every((v, i) => bytes[offset + i] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  throw new InvalidCardDataError("artwork is not a PNG or JPEG image");
}

/** Up to three decimals of a card unit. */
function n(value: number): string {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Up to five decimals, for an alpha (as `InvitationCard` writes it). */
function n5(value: number): string {
  return String(Math.round(value * 100_000) / 100_000);
}

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The corner radius of a spread shadow (CSS Backgrounds 3 §7.1.1): the radius grows by the spread,
 * less so for corners sharper than the spread, and a square corner stays square.
 */
function spreadRadius(radius: number, spread: number): number {
  if (radius <= 0) return 0;
  if (spread <= 0 || radius >= spread) return radius + spread;
  const r = radius / spread;
  return radius + spread * (1 + (r - 1) ** 3);
}

/** Gradient stops (`panelFadeAxis`) in a colour, alpha as `stop-opacity`. */
function fadeStops(stops: readonly { offset: number; alpha: number }[], color: string): string {
  return stops
    .map(
      (s) =>
        `<stop offset="${n(s.offset * 100)}%" stop-color="${color}"` +
        (s.alpha >= 1 ? "" : ` stop-opacity="${n5(s.alpha)}"`) +
        "/>",
    )
    .join("");
}

/**
 * A `card_layouts_v3` panel, as `InvitationCard` draws it: a rectangle over the opaque paper and
 * its fade, filled with the panel colour at the vertical fade's alpha, masked by the horizontal
 * fade where the panel fades sideways. Gradients interpolate the same stops linearly in both.
 */
function fadedPanelSvg(panel: CardPanel, index: number): { defs: string; body: string } {
  const f = panelFeather(panel);
  const x0 = panel.x - f.left;
  const y0 = panel.y - f.top;
  const w = f.left + panel.width + f.right;
  const h = f.top + panel.height + f.bottom;
  const fillId = `card-panel-fade-${index}`;
  let defs =
    `<linearGradient id="${fillId}" gradientUnits="userSpaceOnUse" ` +
    `x1="0" y1="${n(y0)}" x2="0" y2="${n(y0 + h)}">` +
    fadeStops(panelFadeAxis(f.top, panel.height, f.bottom), panel.color) +
    `</linearGradient>`;
  let mask = "";
  if (f.left > 0 || f.right > 0) {
    const sideId = `card-panel-side-${index}`;
    const maskId = `card-panel-mask-${index}`;
    defs +=
      `<linearGradient id="${sideId}" gradientUnits="userSpaceOnUse" ` +
      `x1="${n(x0)}" y1="0" x2="${n(x0 + w)}" y2="0">` +
      fadeStops(panelFadeAxis(f.left, panel.width, f.right), "#FFFFFF") +
      `</linearGradient>` +
      `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}">` +
      `<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="url(#${sideId})"/></mask>`;
    mask = ` mask="url(#${maskId})"`;
  }
  const rect = `<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="url(#${fillId})"${mask}/>`;
  return { defs, body: `<g data-card-panel="${index}">${rect}</g>` };
}

function panelSvg(panel: CardPanel, index: number): { defs: string; body: string } {
  if (panel.fade) return fadedPanelSvg(panel, index);
  const { x, y, width, height, radius, color } = panel;
  const { spread, blur } = panel.softEdge;
  const rect = `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(radius)}" fill="${color}"/>`;
  if (spread === 0 && blur === 0) {
    return { defs: "", body: `<g data-card-panel="${index}">${rect}</g>` };
  }
  // A CSS blur radius B is a Gaussian of standard deviation B/2; it reaches about 3σ.
  const sigma = blur / 2;
  const sx = x - spread;
  const sy = y - spread;
  const sw = width + spread * 2;
  const sh = height + spread * 2;
  const reach = Math.ceil(sigma * 3) + 1;
  const id = `card-panel-soft-${index}`;
  const defs =
    sigma > 0
      ? `<filter id="${id}" filterUnits="userSpaceOnUse" x="${n(sx - reach)}" y="${n(sy - reach)}" ` +
        `width="${n(sw + reach * 2)}" height="${n(sh + reach * 2)}" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur stdDeviation="${n(sigma)}"/></filter>`
      : "";
  const soft =
    `<rect x="${n(sx)}" y="${n(sy)}" width="${n(sw)}" height="${n(sh)}" ` +
    `rx="${n(spreadRadius(radius, spread))}" fill="${color}"` +
    (sigma > 0 ? ` filter="url(#${id})"` : "") +
    "/>";
  return { defs, body: `<g data-card-panel="${index}">${soft}${rect}</g>` };
}

function boxSvg(box: TextBox, outlines: GlyphOutlinesResolver): string {
  const glyphs = outlines(box.font);
  const style = { size: box.size, letterSpacingEm: box.letterSpacing, textCase: box.textCase };
  const lineBox = box.size * box.lineHeight;
  const height = lineBox * box.lines.length;
  // CSS places the baseline half the leading below the line box's top, plus the ascent.
  const { ascent, descent } = glyphs.verticalMetrics(box.size);
  const baseline = (lineBox - (ascent + descent)) / 2 + ascent;
  const lines = box.lines.map((text, index) => {
    const run = glyphs.line(text, style);
    // `text-align`, with a line wider than its box start-aligned, as CSS Text 3 §7.1 and
    // Chromium do. The width includes the letter spacing after the last character.
    const free = box.width - run.width;
    const dx = free <= 0 || box.align === "left" ? 0 : box.align === "center" ? free / 2 : free;
    const dy = index * lineBox + baseline;
    const path = run.path ? `<path d="${run.path}"/>` : "";
    return `<g data-card-line="${index}" transform="translate(${n(dx)} ${n(dy)})">${path}</g>`;
  });
  const transform =
    `translate(${n(box.x)} ${n(box.y)})` +
    (box.rotation === 0 ? "" : ` rotate(${n(box.rotation)} ${n(box.width / 2)} ${n(height / 2)})`);
  return (
    `<g data-card-box="${attr(box.id)}" transform="${transform}" fill="${box.color}">` +
    lines.join("") +
    `</g>`
  );
}

/**
 * The card as a standalone SVG document in card units (`viewBox` 0 0 1000 1400, or 1000 1000),
 * for the link-preview image. Throws `InvalidCardDataError` for malformed card data and
 * `UndrawableTextError` for a line it cannot draw exactly as a browser sets it.
 */
export function cardPreviewSvg(card: CardPreviewData, outlines: GlyphOutlinesResolver): string {
  const { shape, artwork, panels = [], placement, boxes } = card;
  const proportion = validateCardData({
    shape,
    artworkProportion: artwork?.proportion,
    panels,
    placement,
    boxes,
  });
  const mime = artworkMime(artwork.bytes);
  const canvas = CARD_CANVAS[proportion];
  const { width: w, height: h } = canvas;
  const href = `data:${mime};base64,${Buffer.from(artwork.bytes).toString("base64")}`;
  const art = artworkSvg(shape, href, canvas, placement);
  const drawnPanels = panels.map(panelSvg);
  const text = paintOrder(boxes).map((box) => boxSvg(box, outlines));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ` +
    `data-card-shape="${shape}">` +
    `<defs><clipPath id="card-outline"><path d="${outlinePath(shape)}"/></clipPath>` +
    art.defs +
    drawnPanels.map((p) => p.defs).join("") +
    `</defs>` +
    `<g clip-path="url(#card-outline)">` +
    art.body +
    drawnPanels.map((p) => p.body).join("") +
    `<g data-card-text="">${text.join("")}</g>` +
    `</g></svg>`
  );
}
