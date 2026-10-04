import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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

  it("draws panels opaque, under the text", () => {
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
