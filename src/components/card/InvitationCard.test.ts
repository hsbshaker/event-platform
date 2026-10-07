import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PanelFade } from "@/lib/card/layouts";
import { storedPanelShape } from "@/lib/card/test-panels";
import { outlineMaskImage } from "@/lib/card/outline";
import type { TextBox } from "@/lib/card/text-box";

import { InvalidCardDataError, InvitationCard, type InvitationCardProps } from "./InvitationCard";

const ART = { src: "/art/flat.png", proportion: "5:7" } as const;

function box(over: Partial<TextBox> = {}): TextBox {
  return {
    id: "title",
    source: { kind: "wording", slot: "title" },
    x: 120,
    y: 800,
    width: 760,
    rotation: 0,
    font: { family: "Playfair Display", weight: 400, italic: false },
    size: 104,
    color: "#3A2A1E",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.05,
    textCase: "none",
    z: 0,
    lines: ["A Little", "Wild One"],
    ...over,
  };
}

function render(props: Partial<InvitationCardProps> = {}): string {
  return renderToStaticMarkup(
    createElement(InvitationCard, { shape: "arch", artwork: ART, boxes: [box()], ...props }),
  );
}

describe("InvitationCard", () => {
  it("scales by container: an inline-size container with card units in cqw", () => {
    const html = render();
    expect(html).toContain("container-type:inline-size");
    expect(html).toContain("width:100cqw;height:140cqw");
    // x 120 → 12cqw, y 800 → 80cqw, width 760 → 76cqw, size 104 → 10.4cqw, line 104 × 1.05.
    expect(html).toContain("left:12cqw;top:80cqw;width:76cqw");
    expect(html).toContain("font-size:10.4cqw");
    expect(html).toContain("height:10.92cqw;line-height:10.92cqw");
    expect(render({ shape: "circle", artwork: { ...ART, proportion: "1:1" } })).toContain(
      "width:100cqw;height:100cqw",
    );
  });

  it("masks the whole card with the shape's outline", () => {
    const html = render();
    const mask = outlineMaskImage("arch").replaceAll('"', "&quot;");
    expect(html).toContain(`mask-image:${mask}`);
    expect(html).toContain(`-webkit-mask-image:${mask}`);
    expect(html).toContain("mask-size:100% 100%");
    // The mask is on the card face, which holds the artwork, the panels and the text.
    const face = html.indexOf("data-card-face");
    expect(face).toBeGreaterThan(-1);
    expect(html.indexOf("<img")).toBeGreaterThan(face);
    expect(html.indexOf("data-card-text")).toBeGreaterThan(face);
  });

  it("sets exactly the stored lines, one unwrapped element each, in the box's style", () => {
    const html = render({
      boxes: [
        box(),
        box({
          id: "date",
          source: { kind: "fact", slot: "date" },
          y: 1100,
          font: { family: "DM Sans", weight: 400, italic: false },
          size: 24,
          letterSpacing: 0.06,
          lineHeight: 1.45,
          textCase: "uppercase",
          z: 1,
          lines: ["Saturday, June 6"],
        }),
      ],
    });
    expect(html.match(/data-card-line=/g)).toHaveLength(3);
    expect(html).toContain(">A Little</span>");
    expect(html).toContain(">Wild One</span>");
    expect(html).toContain(">Saturday, June 6</span>");
    expect(html.match(/white-space:pre/g)!.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("font-family:&quot;Playfair Display&quot;;font-weight:400");
    expect(html).toContain("font-optical-sizing:none");
    expect(html).toContain("font-variation-settings:&quot;opsz&quot; 104");
    expect(html).toContain("font-variation-settings:&quot;opsz&quot; 24");
    expect(html).toContain("letter-spacing:0.06em");
    expect(html).toContain("text-transform:uppercase");
    expect(html).toContain("color:#3A2A1E");
    expect(html).toContain("z-index:1");
  });

  it("rotates a box about its centre", () => {
    const html = render({ boxes: [box({ rotation: -12.5 })] });
    expect(html).toContain("transform:rotate(-12.5deg);transform-origin:50% 50%");
  });

  it("is live text in the shaping language, in reading order; the artwork is decorative", () => {
    const html = render({
      boxes: [
        box({ id: "late", y: 1200, z: 0, lines: ["second"] }),
        box({ id: "early", y: 900, z: 5, lines: ["first"] }),
        box({ id: "empty", y: 100, lines: [] }),
      ],
    });
    expect(html).toContain('lang="en"');
    expect(html).toMatch(/<img [^>]*alt=""/);
    expect(html.indexOf(">first<")).toBeLessThan(html.indexOf(">second<"));
    // An empty box (a fact the host has not supplied) renders nothing.
    expect(html).not.toContain('data-card-box="empty"');
    expect(html).not.toMatch(/aria-hidden="true"[^>]*data-card-box/);
  });

  it("draws the artwork where it was painted, filling the card", () => {
    expect(render({ shape: "rectangle" })).toMatch(/<img[^>]*top:0[^>]*width:100%;height:100%/);
  });

  it("draws a faded panel: opaque paper over its rectangle, eased out toward the picture", () => {
    // art-bottom on a rectangle (card_layouts_v3): paper from the top edge to 630, fading over 180.
    const html = render({
      shape: "rectangle",
      panels: [{ ...storedPanelShape("art-bottom", "rectangle"), color: "#F6F1EA" }],
    });
    // The element covers the paper and its fade: 0–810.
    expect(html).toContain("left:0cqw;top:0cqw;width:100cqw;height:81cqw;");
    // Opaque from the top to 630/810 = 77.77778%, then the eased stops to nothing at 100%.
    expect(html).toContain(
      "background:linear-gradient(to bottom, #F6F1EA 0%, #F6F1EA 77.77778%, " +
        "rgb(246 241 234 / 0.9619) 80.55556%, rgb(246 241 234 / 0.8536) 83.33333%, " +
        "rgb(246 241 234 / 0.6913) 86.11111%, rgb(246 241 234 / 0.5) 88.88889%, " +
        "rgb(246 241 234 / 0.3087) 91.66667%, rgb(246 241 234 / 0.1464) 94.44444%, " +
        "rgb(246 241 234 / 0.0381) 97.22222%, rgb(246 241 234 / 0) 100%);opacity:1",
    );
    // An edge fade fades one way only: no sideways mask, no rounded corner, no box-shadow.
    const panel = html.slice(html.indexOf("data-card-panel"), html.indexOf("data-card-text"));
    expect(panel).not.toMatch(/mask|border-radius|box-shadow/);
    expect(html.indexOf("data-card-panel")).toBeLessThan(html.indexOf("data-card-text"));
  });

  it("feathers a wash panel on every side: vertical fade as the fill, horizontal as the mask", () => {
    const html = render({
      shape: "rectangle",
      panels: [
        {
          x: 150,
          y: 370,
          width: 700,
          height: 660,
          radius: 0,
          softEdge: { spread: 0, blur: 0 },
          fade: { kind: "wash", feather: 140 },
          color: "#F6F1EA",
        },
      ],
    });
    // 150 − 140 = 10 across, 370 − 140 = 230 down; 700 + 280 = 980 wide, 660 + 280 = 940 high.
    expect(html).toContain("left:1cqw;top:23cqw;width:98cqw;height:94cqw;");
    expect(html).toContain(
      "background:linear-gradient(to bottom, rgb(246 241 234 / 0) 0%, rgb(246 241 234 / 0.0381) 1.8617%,",
    );
    expect(html).toContain("#F6F1EA 14.89362%, #F6F1EA 85.10638%,");
    expect(html).toContain(
      "mask-image:linear-gradient(to right, rgb(0 0 0 / 0) 0%, rgb(0 0 0 / 0.0381) 1.78571%,",
    );
    expect(html).toContain("#000000 14.28571%, #000000 85.71429%,");
    expect(html).toContain("-webkit-mask-image:linear-gradient(to right,");
  });

  it("draws a card_layouts_v2 panel exactly as before: opaque rounded rectangle, soft edge", () => {
    // Backward compatibility: panels persisted with card_layouts_v2 artwork carry no fade.
    const html = render({
      panels: [
        {
          x: 80,
          y: 770,
          width: 840,
          height: 510,
          radius: 28,
          softEdge: { spread: 20, blur: 40 },
          color: "#F6F1EA",
        },
      ],
    });
    expect(html).toContain(
      "left:8cqw;top:77cqw;width:84cqw;height:51cqw;border-radius:2.8cqw;background:#F6F1EA;opacity:1;box-shadow:0 0 4cqw 2cqw #F6F1EA",
    );
    expect(html.indexOf("data-card-panel")).toBeLessThan(html.indexOf("data-card-text"));
  });

  describe("a text background", () => {
    /** The markup of box `id`'s element, from its opening tag to its closing `</p>`. */
    const boxMarkup = (html: string, id = "title") => {
      const start = html.indexOf(`<p data-card-box="${id}"`);
      expect(start).toBeGreaterThan(-1);
      return html.slice(start, html.indexOf("</p>", start) + 4);
    };
    /** The background layer within a box's markup, and the box's own visible lines after it. */
    const split = (markup: string) => {
      const firstLine = markup.indexOf("data-card-line=");
      return { layer: markup.slice(0, firstLine), lines: markup.slice(firstLine) };
    };

    it("is none by default: a generated box draws exactly as before", () => {
      const html = render();
      expect(html).not.toContain("data-card-text-background");
      expect(boxMarkup(html)).toMatch(
        /^<p data-card-box="title" style="[^"]*"><span data-card-line/,
      );
    });

    it("highlight: each line with text hugged by the fill, the layer at the opacity", () => {
      const html = render({
        boxes: [
          box({
            lines: ["A Little", " ", "Wild One"],
            background: { style: "highlight", color: "#FFFFFF", opacity: 0.85, padding: 20 },
          }),
        ],
      });
      const { layer, lines } = split(boxMarkup(html));
      // Inside the box's own element, before its lines, behind them and out of the a11y tree.
      expect(layer).toMatch(
        /<span data-card-text-background="highlight" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;display:block;z-index:-1;pointer-events:none;user-select:none;-webkit-user-select:none;opacity:0.85">/,
      );
      // One highlight per line with text; the blank line has none; text hidden in the layer.
      expect(layer.match(/data-card-text-highlight=/g)).toHaveLength(2);
      expect(layer).toContain('data-card-text-highlight="0"');
      expect(layer).toContain('data-card-text-highlight="2"');
      expect(layer).toContain(
        "background:#FFFFFF;padding:2cqw;margin-left:-2cqw;margin-right:-2cqw;box-decoration-break:clone",
      );
      expect(layer).toContain('<span style="visibility:hidden">A Little</span>');
      // Every line box of the layer is the box's own: 104 × 1.05 = 109.2.
      expect(layer.match(/height:10.92cqw;line-height:10.92cqw;white-space:pre/g)).toHaveLength(3);
      // The visible lines: unchanged, no fill, no opacity; the box keeps its text colour.
      expect(lines.match(/data-card-line=/g)).toHaveLength(3);
      expect(lines).not.toMatch(/background|opacity|visibility/);
      expect(boxMarkup(html)).toMatch(/^<p data-card-box="title" style="[^"]*color:#3A2A1E;/);
      expect(boxMarkup(html).match(/opacity/g)).toHaveLength(1);
    });

    it("box: one rounded fill around the widest line, placed by the box's alignment", () => {
      const background = { style: "box", color: "#1B1B1F", opacity: 0.8, padding: 40 } as const;
      const centred = split(boxMarkup(render({ boxes: [box({ background })] }))).layer;
      expect(centred).toContain('data-card-text-background="box"');
      expect(centred).toContain(
        "display:block;width:fit-content;position:relative;margin-left:auto;margin-right:auto",
      );
      // p = 40 → 4cqw beyond the block on every side; radius 0.5 × 40 + 0.12 × 104 = 32.48; the
      // opacity as the fill's alpha, and nowhere else.
      expect(centred).toContain(
        "position:absolute;left:-4cqw;top:-4cqw;right:-4cqw;bottom:-4cqw;background:rgb(27 27 31 / 0.8);border-radius:3.248cqw",
      );
      expect(centred).not.toContain("opacity");
      expect(centred).not.toContain("filter");
      // The hidden lines size the block exactly as the visible ones set.
      expect(centred.match(/white-space:pre;visibility:hidden/g)).toHaveLength(2);

      const right = split(boxMarkup(render({ boxes: [box({ background, align: "right" })] })));
      expect(right.layer).toContain("margin-left:auto;margin-right:0");
      const left = split(boxMarkup(render({ boxes: [box({ background, align: "left" })] })));
      expect(left.layer).toContain("margin-left:0;margin-right:0");
      // A radius past half the fill's height is held there (CSS holds it within half the width):
      // one line of 104 × 0.1 = 10.4 and no padding → 5.2, below 0.12 × 104 = 12.48.
      const flat = split(
        boxMarkup(
          render({
            boxes: [
              box({ background: { ...background, padding: 0 }, lineHeight: 0.1, lines: ["A"] }),
            ],
          }),
        ),
      ).layer;
      expect(flat).toContain("border-radius:0.52cqw");
    });

    it("backdrop: the same fill, square, blurred on its own behind the text", () => {
      const html = render({
        boxes: [
          box({ background: { style: "backdrop", color: "#FFFFFF", opacity: 0.65, padding: 50 } }),
        ],
      });
      const { layer, lines } = split(boxMarkup(html));
      expect(layer).toContain('data-card-text-background="backdrop"');
      // σ = max(4, 0.6 × 50) = 30 → 3cqw; no radius; the opacity as the fill's alpha, so no
      // `opacity` over the filter (Chromium would composite it apart).
      expect(layer).toContain(
        "left:-5cqw;top:-5cqw;right:-5cqw;bottom:-5cqw;background:rgb(255 255 255 / 0.65);filter:blur(3cqw)",
      );
      expect(layer).not.toContain("border-radius");
      expect(layer).not.toContain("opacity");
      expect(lines).not.toMatch(/filter|opacity/);
      // A small padding still feathers: σ is at least 4 units.
      const thin = render({
        boxes: [
          box({ background: { style: "backdrop", color: "#FFFFFF", opacity: 1, padding: 2 } }),
        ],
      });
      // Opacity 1 is the plain colour.
      expect(thin).toContain("background:#FFFFFF;filter:blur(0.4cqw)");
    });

    it("draws nothing for a box with no line to put it behind", () => {
      const background = { style: "box", color: "#FFFFFF", opacity: 0.8, padding: 10 } as const;
      expect(render({ boxes: [box({ lines: ["  "], background })] })).not.toContain(
        "data-card-text-background",
      );
    });

    it("refuses a malformed background instead of drawing it", () => {
      const ok = { style: "box", color: "#FFFFFF", opacity: 0.8, padding: 10 } as const;
      const bad: unknown[] = [
        { ...ok, style: "glow" },
        { ...ok, color: "red;background:url(x)" },
        { ...ok, opacity: 0 },
        { ...ok, opacity: 2 },
        { ...ok, padding: -1 },
        { ...ok, padding: 121 },
        { ...ok, padding: Number.NaN },
        { ...ok, extra: "x" },
        null,
      ];
      for (const background of bad) {
        expect(
          () => render({ boxes: [box({ background: background as TextBox["background"] })] }),
          JSON.stringify(background),
        ).toThrow(InvalidCardDataError);
      }
    });
  });

  it("carries no collaborator controls and no app styling", () => {
    const html = render();
    expect(html).not.toMatch(/<button|<a |class=/);
    expect(html).not.toContain("var(--");
  });

  it("refuses malformed data instead of rendering it", () => {
    const bad: [string, Partial<InvitationCardProps>][] = [
      ["proportion", { artwork: { ...ART, proportion: "1:1" } }],
      ["colour", { boxes: [box({ color: "red;background:url(x)" })] }],
      ["family", { boxes: [box({ font: { family: "X\n", weight: 400, italic: false } })] }],
      ["weight", { boxes: [box({ font: { family: "X", weight: 0, italic: false } })] }],
      ["size", { boxes: [box({ size: 0 })] }],
      ["position", { boxes: [box({ x: Number.NaN })] }],
      ["fractional stacking order", { boxes: [box({ z: 1.5 })] }],
      ["line break in a line", { boxes: [box({ lines: ["two\nlines"] })] }],
      ["duplicate ids", { boxes: [box(), box()] }],
      [
        "panel colour",
        {
          panels: [
            {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              radius: 0,
              softEdge: { spread: 0, blur: 0 },
              color: "white",
            },
          ],
        },
      ],
      ...(
        [
          ["unknown fade", { kind: "fog", feather: 10 }, 0],
          ["fade from the side", { kind: "edge", from: "left", length: 180 }, 0],
          ["zero fade length", { kind: "edge", from: "top", length: 0 }, 0],
          ["infinite feather", { kind: "wash", feather: Number.POSITIVE_INFINITY }, 0],
          ["fade with a radius", { kind: "wash", feather: 140 }, 28],
        ] as const
      ).map(([label, fade, radius]): [string, Partial<InvitationCardProps>] => [
        label,
        {
          panels: [
            {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              radius,
              softEdge: { spread: 0, blur: 0 },
              fade: fade as unknown as PanelFade,
              color: "#FFFFFF",
            },
          ],
        },
      ]),
      [
        "fade with a soft edge",
        {
          panels: [
            {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              radius: 0,
              softEdge: { spread: 20, blur: 40 },
              fade: { kind: "edge", from: "top", length: 180 },
              color: "#FFFFFF",
            },
          ],
        },
      ],
    ];
    for (const [label, props] of bad) {
      expect(() => render(props), label).toThrow(InvalidCardDataError);
    }
  });

  it("preloads each curated face its lines use, once, and no other font", () => {
    const html = renderToStaticMarkup(
      createElement(
        "html",
        null,
        createElement("head"),
        createElement(
          "body",
          null,
          createElement(InvitationCard, {
            shape: "arch",
            artwork: ART,
            boxes: [
              box(),
              box({ id: "again" }),
              box({ id: "body", font: { family: "DM Sans", weight: 400, italic: false } }),
              box({
                id: "empty",
                lines: [],
                font: { family: "Inter", weight: 400, italic: false },
              }),
              box({ id: "host", font: { family: "Lobster", weight: 400, italic: false } }),
            ],
          }),
        ),
      ),
    );
    const fonts = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map(
      (m) => m[1],
    );
    expect(fonts).toEqual([
      "/fonts/card/PlayfairDisplay-normal-400.woff2",
      "/fonts/card/DMSans-normal-400.woff2",
    ]);
  });

  it("escapes a family name into a CSS string", () => {
    const html = render({
      boxes: [box({ font: { family: 'Odd "Name"', weight: 400, italic: true } })],
    });
    expect(html).toContain("font-family:&quot;Odd \\&quot;Name\\&quot;&quot;");
    expect(html).toContain("font-style:italic");
  });
});
