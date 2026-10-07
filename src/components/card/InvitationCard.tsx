/**
 * `InvitationCard` — the one card component (`docs/card-system.md §6.1`;
 * `docs/design-system.md §10.14`). It renders a card from data alone: the effective shape, the
 * artwork for that shape's proportion, the legibility panels resolved for it, and the text layer
 * as positioned `TextBox`es — the host's customization when one exists, otherwise the generated
 * layout (`card-text.server.ts`). It never computes a layout, a line break, a colour or a font.
 *
 * Rendering contract:
 *
 * - **Uniform scaling.** The root is an inline-size container; every length inside is in card
 *   units mapped to container-query units (1000 units = 100cqw), so the card is the same design at
 *   any width — proportions, positions, sizes and line breaks scale together and nothing reflows
 *   (`docs/card-system.md §2.1`).
 * - **The outline is a mask over the whole card** — artwork, panels and text — from code-defined
 *   geometry (`outline.ts`). Outside it the page shows through.
 * - **Stored lines, exactly.** Each line is its own element with `white-space: pre`: the browser
 *   never wraps, joins or truncates card text (`spec.md §32 #23`).
 * - **Optical size pinned to card units.** `font-optical-sizing: none` and
 *   `font-variation-settings: "opsz" <size in card units>`, because line widths were measured at
 *   that optical size (`text/metrics.ts`); `auto` would follow the on-screen pixel size and glyph
 *   widths would change with the screen (`docs/technology-decisions.md §8.2`).
 * - **Live text.** Card text is real, selectable text in reading order (top to bottom, then left
 *   to right; stacking is `z`), in the shaping language. The artwork is decorative (`alt=""`).
 * - **Self-contained styling.** Inline styles only, so `react-dom/server` renders it outside
 *   Next's CSS pipeline (the layout fixtures do); `card-fonts.css` is the only stylesheet it needs.
 *   It takes no app tokens and no collaborator controls (`docs/design-system.md §15.1`, §10.19).
 *
 * Server-compatible: no hooks, no client JavaScript.
 *
 * Its props are untrusted data — a stored customization is host content — so every value that
 * reaches a style is validated, and anything malformed throws `InvalidCardDataError` rather than
 * rendering something the host never saw.
 */

import "@/styles/card-fonts.css";

import type { CSSProperties } from "react";
import { preload } from "react-dom";

import {
  InvalidCardDataError,
  panelFadeAxis,
  panelFeather,
  readingOrder,
  validateCardData,
  type CardPanel,
} from "@/lib/card/card-data";
import { outlineMaskImage } from "@/lib/card/outline";
import { CARD_CANVAS, type CardProportion, type CardShape } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { curatedFontUrl } from "@/lib/card/text/font-files";
import { SHAPING_LANGUAGE } from "@/lib/card/text/shaping-language";

// Validation and ordering are shared with the link-preview image (`card-data.ts`).
export { InvalidCardDataError, type CardPanel };

/** The artwork for the effective shape's proportion. */
export interface CardArtwork {
  src: string;
  proportion: CardProportion;
  /**
   * The slide, in card units (negative: up): the artwork drawn away from the words so its panel's
   * fade lies over its background (`slide.ts`). The strip it uncovers lies under the panel's paper.
   */
  offsetY?: number;
}

export interface InvitationCardProps {
  shape: CardShape;
  artwork: CardArtwork;
  /** One per zone that needs a panel; none when the ink cleared 4.5:1 on the artwork alone. */
  panels?: readonly CardPanel[];
  boxes: readonly TextBox[];
}

/** Card units to container-query units: the card is 1000 units = 100cqw wide. */
function cu(units: number): string {
  return `${Math.round(units * 10_000) / 100_000}cqw`;
}

/** Up to five decimals, for unitless and em values. */
function dec(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

/** A CSS `<string>` for a family name; validation already refused control characters. */
function cssFamily(family: string): string {
  return `"${family.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * Inherited text properties pinned at the card face, so a page's own styles (or a browser's text
 * autosizing) cannot change how card text is shaped or set.
 */
const TEXT_RESET: CSSProperties = {
  direction: "ltr",
  writingMode: "horizontal-tb",
  fontKerning: "normal",
  fontFeatureSettings: "normal",
  fontVariant: "normal",
  fontStretch: "normal",
  fontSynthesis: "none",
  wordSpacing: "normal",
  textIndent: 0,
  textShadow: "none",
  textDecoration: "none",
  // Unhinted, fractional advances: where Chromium hints small text (Linux, the headless shell),
  // hinting rounds glyph advances and lines drift from the measured widths by up to ~5% at phone
  // size. geometricPrecision sets text at the font's own metrics, as the server measures it.
  textRendering: "geometricPrecision",
  hyphens: "manual",
  WebkitTextSizeAdjust: "100%",
  textSizeAdjust: "100%",
  userSelect: "text",
  WebkitUserSelect: "text",
};

function boxStyle(box: TextBox): CSSProperties {
  return {
    position: "absolute",
    left: cu(box.x),
    top: cu(box.y),
    width: cu(box.width),
    margin: 0,
    padding: 0,
    zIndex: box.z,
    transform: box.rotation === 0 ? undefined : `rotate(${dec(box.rotation)}deg)`,
    transformOrigin: "50% 50%",
    color: box.color,
    fontFamily: cssFamily(box.font.family),
    fontWeight: box.font.weight,
    fontStyle: box.font.italic ? "italic" : "normal",
    fontSize: cu(box.size),
    fontOpticalSizing: "none",
    fontVariationSettings: `"opsz" ${dec(box.size)}`,
    letterSpacing: `${dec(box.letterSpacing)}em`,
    textAlign: box.align,
    textTransform: box.textCase,
    whiteSpace: "pre",
  };
}

/** A `card_layouts_v2` panel: an opaque rounded rectangle with a soft edge (`box-shadow`). */
function roundedPanelStyle(panel: CardPanel): CSSProperties {
  return {
    position: "absolute",
    left: cu(panel.x),
    top: cu(panel.y),
    width: cu(panel.width),
    height: cu(panel.height),
    borderRadius: cu(panel.radius),
    background: panel.color,
    opacity: 1,
    boxShadow:
      panel.softEdge.spread > 0 || panel.softEdge.blur > 0
        ? `0 0 ${cu(panel.softEdge.blur)} ${cu(panel.softEdge.spread)} ${panel.color}`
        : undefined,
  };
}

/** `#RRGGBB` at an alpha, as a CSS colour. */
function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${dec(alpha)})`;
}

/** A gradient along one axis of a faded panel (`panelFadeAxis`), in a colour. */
function fadeGradient(
  direction: "to bottom" | "to right",
  stops: readonly { offset: number; alpha: number }[],
  hex: string,
): string {
  const list = stops.map((s) => `${withAlpha(hex, s.alpha)} ${dec(s.offset * 100)}%`);
  return `linear-gradient(${direction}, ${list.join(", ")})`;
}

/**
 * A `card_layouts_v3` panel: one element over the opaque rectangle and its fade, filled with the
 * panel colour whose alpha is the vertical fade (`background`) times the horizontal fade (`mask`,
 * only where the panel fades sideways). Both are 1 across the rectangle, so it is opaque.
 */
function fadedPanelStyle(panel: CardPanel): CSSProperties {
  const f = panelFeather(panel);
  const width = f.left + panel.width + f.right;
  const height = f.top + panel.height + f.bottom;
  const mask =
    f.left > 0 || f.right > 0
      ? fadeGradient("to right", panelFadeAxis(f.left, panel.width, f.right), "#000000")
      : undefined;
  return {
    position: "absolute",
    left: cu(panel.x - f.left),
    top: cu(panel.y - f.top),
    width: cu(width),
    height: cu(height),
    background: fadeGradient(
      "to bottom",
      panelFadeAxis(f.top, panel.height, f.bottom),
      panel.color,
    ),
    opacity: 1,
    ...(mask
      ? {
          maskImage: mask,
          maskSize: "100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskImage: mask,
          WebkitMaskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
        }
      : {}),
  };
}

export function InvitationCard({ shape, artwork, panels = [], boxes }: InvitationCardProps) {
  const proportion = validateCardData({
    shape,
    artworkProportion: artwork?.proportion,
    panels,
    boxes,
    artworkOffset: artwork?.offsetY,
  });
  if (typeof artwork.src !== "string" || artwork.src === "") {
    throw new InvalidCardDataError("artwork has no src");
  }
  const canvas = CARD_CANVAS[proportion];
  const mask = outlineMaskImage(shape);

  // Fetch every face the stored lines are set in as early as possible. card-fonts.css holds card
  // text invisible until its face arrives (font-display: block), so lines measured in one face are
  // never drawn in a fallback face that would set them wider or narrower.
  const faces = new Set<string>();
  for (const box of boxes) {
    const href = box.lines.length > 0 ? curatedFontUrl(box.font) : null;
    if (href) faces.add(href);
  }
  for (const href of faces) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  return (
    <div
      data-invitation-card=""
      data-card-shape={shape}
      lang={SHAPING_LANGUAGE}
      style={{ containerType: "inline-size", width: "100%", display: "block" }}
    >
      <div
        data-card-face=""
        style={{
          ...TEXT_RESET,
          position: "relative",
          display: "block",
          width: "100cqw",
          height: cu(canvas.height),
          overflow: "hidden",
          maskImage: mask,
          maskSize: "100% 100%",
          maskRepeat: "no-repeat",
          maskPosition: "0 0",
          WebkitMaskImage: mask,
          WebkitMaskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "0 0",
        }}
      >
        {/* Decorative artwork; a plain img, because the card renders outside Next too. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artwork.src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: 0,
            top: artwork.offsetY ? cu(artwork.offsetY) : 0,
            width: "100%",
            height: "100%",
            maxWidth: "none",
            display: "block",
            objectFit: "fill",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
        {panels.map((panel, index) => (
          <div
            key={index}
            data-card-panel={index}
            aria-hidden="true"
            style={panel.fade ? fadedPanelStyle(panel) : roundedPanelStyle(panel)}
          />
        ))}
        <div
          data-card-text=""
          // Its own stacking context above the artwork and panels, so a box's `z` orders it among
          // the text only and can never sink it beneath the artwork.
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            zIndex: 0,
            isolation: "isolate",
          }}
        >
          {readingOrder(boxes)
            .filter((box) => box.lines.length > 0)
            .map((box) => {
              const lineBox = cu(box.size * box.lineHeight);
              return (
                <p key={box.id} data-card-box={box.id} style={boxStyle(box)}>
                  {box.lines.map((line, index) => (
                    <span
                      key={index}
                      data-card-line={index}
                      style={{
                        display: "block",
                        height: lineBox,
                        lineHeight: lineBox,
                        whiteSpace: "pre",
                        overflow: "visible",
                      }}
                    >
                      {line}
                    </span>
                  ))}
                </p>
              );
            })}
        </div>
      </div>
    </div>
  );
}
