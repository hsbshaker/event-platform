/**
 * Link-preview images (`spec.md §11.10`; `docs/card-system.md §6.4`; `docs/design-system.md
 * §15.7`; mechanism: `docs/technology-decisions.md §8.2`).
 *
 * A 1200 × 630 PNG:
 *
 * - **public event:** the card in its shape on the house background — `cardPreviewSvg`, drawn
 *   from the same stored data and validation as `InvitationCard`, with every stored line as glyph
 *   outlines;
 * - **private event:** the sealed envelope with the event title on its dusk field —
 *   `envelopePreviewSvg`, which takes nothing but the title.
 *
 * Each is an SVG, rasterized by `next/og`'s `ImageResponse` (satori lays out one `<img>` of it over
 * its background; resvg draws it). No browser, no new dependency, and satori never sets any
 * text itself: every glyph is already an outline, so its lack of variable-font support does not
 * matter.
 *
 * **Seam for real events (a later phase).** The caller decides the kind from the event: a private
 * event must build `{ kind: "envelope", title }` and must not load the card's design, artwork,
 * customization or ink at all; only a public event builds `{ kind: "card", card }`, from the active
 * design, the effective shape, its artwork and panels, and the text layer `InvitationCard` would
 * render (the customization's boxes, or `generatedTextLayer`).
 */

import "server-only";

import { ImageResponse } from "next/og";

import { validateCardData } from "@/lib/card/card-data";
import { artworkMime, cardPreviewSvg, type CardPreviewData } from "@/lib/card/preview-svg.server";
import { loadCuratedGlyphOutlines } from "@/lib/card/text/curated-fonts";
import { curatedFontUrl } from "@/lib/card/text/font-files";
import {
  UndrawableTextError,
  type GlyphOutlines,
  type GlyphOutlinesResolver,
} from "@/lib/card/text/glyph-outlines";
import type { FontRef } from "@/lib/card/text/metrics";

import { loadAppFont } from "./app-font.server";
import { envelopePreviewSvg } from "./envelope-svg";
import { cardPreviewBox, PREVIEW_SIZE } from "./geometry";
import { HOUSE } from "./house-style";

export type LinkPreview =
  { kind: "card"; card: CardPreviewData } | { kind: "envelope"; title: string };

export interface PreviewImageOptions {
  /**
   * Loads a card face's glyph outlines. Defaults to the curated card fonts; the font store's fonts
   * (`docs/technology-decisions.md §8.3`) plug in here when the card editor lands.
   */
  loadCardFont?: (font: FontRef) => Promise<GlyphOutlines>;
}

/**
 * The default face loader: the curated card faces. A face that is not one of them would be set by
 * a browser in a fallback face, so it is refused like any other text the preview cannot draw.
 */
function loadCuratedFace(font: FontRef): Promise<GlyphOutlines> {
  if (curatedFontUrl(font) === null) {
    const style = font.italic ? " italic" : "";
    throw new UndrawableTextError(`${font.family} ${font.weight}${style} is not a curated face`);
  }
  return loadCuratedGlyphOutlines(font);
}

const fontKey = (f: FontRef) => `${f.family}|${f.weight}|${f.italic ? "i" : "n"}`;

async function cardOutlines(
  card: CardPreviewData,
  load: (font: FontRef) => Promise<GlyphOutlines>,
): Promise<GlyphOutlinesResolver> {
  const wanted = new Map<string, FontRef>();
  for (const box of card.boxes) {
    if (box.lines.length > 0) wanted.set(fontKey(box.font), box.font);
  }
  const loaded = new Map(
    await Promise.all([...wanted].map(async ([key, font]) => [key, await load(font)] as const)),
  );
  return (font) => {
    const outlines = loaded.get(fontKey(font));
    if (!outlines) throw new Error(`Glyph outlines not loaded for ${fontKey(font)}`);
    return outlines;
  };
}

/** The preview's SVG and the size it is drawn at in the image, px (centred by the layout). */
async function previewSvg(
  preview: LinkPreview,
  options: PreviewImageOptions,
): Promise<{ svg: string; width: number; height: number; background: string }> {
  if (preview.kind === "envelope") {
    const [title, seal] = await Promise.all([
      loadAppFont(HOUSE.headingMd.weight),
      loadAppFont(HOUSE.seal.weight),
    ]);
    // The envelope draws its own dusk field over the whole image (design-system §5.3).
    return {
      svg: envelopePreviewSvg(preview.title, { title, seal }),
      ...PREVIEW_SIZE,
      background: HOUSE.dusk,
    };
  }
  const { card } = preview;
  // Validated before any font is loaded, so malformed data is always an `InvalidCardDataError`.
  validateCardData({
    shape: card.shape,
    artworkProportion: card.artwork?.proportion,
    panels: card.panels ?? [],
    boxes: card.boxes,
    artworkOffset: card.artwork?.offsetY,
  });
  artworkMime(card.artwork.bytes);
  const outlines = await cardOutlines(card, options.loadCardFont ?? loadCuratedFace);
  const svg = cardPreviewSvg(card, outlines);
  const box = cardPreviewBox(card.shape);
  return { svg, width: box.width, height: box.height, background: HOUSE.bg };
}

/**
 * The preview image as PNG bytes. Throws `InvalidCardDataError` for malformed card data and
 * `UndrawableTextError` for text it cannot draw exactly as a browser sets it; never substitutes.
 */
export async function previewImage(
  preview: LinkPreview,
  options: PreviewImageOptions = {},
): Promise<Uint8Array> {
  const { svg, width, height, background } = await previewSvg(preview, options);
  const response = new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
        width={width}
        height={height}
      />
    </div>,
    { ...PREVIEW_SIZE },
  );
  return new Uint8Array(await response.arrayBuffer());
}
