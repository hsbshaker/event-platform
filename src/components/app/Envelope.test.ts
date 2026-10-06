import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Envelope, EnvelopeStage, type OpenableEnvelopeProps } from "./Envelope";

const CARD = "Secret card wording";

const closed = (proportion: "portrait" | "square" = "portrait") =>
  createElement(
    Envelope,
    // children go as the argument below; the props type requires them, so narrow it here.
    { title: "Garden Supper", proportion } as OpenableEnvelopeProps,
    CARD,
  );

describe("Envelope (server render)", () => {
  it("renders a closed envelope as a button with the title, and no card", () => {
    const html = renderToStaticMarkup(closed());
    expect(html).toContain("<button");
    expect(html).toContain("Garden Supper");
    expect(html).not.toContain(CARD);
    expect(html).not.toContain("data-envelope-card");
  });

  it("renders a sealed envelope with only the title and the gate slot, the gate on lit paper", () => {
    const html = renderToStaticMarkup(
      createElement(Envelope, {
        title: "Garden Supper",
        proportion: "square",
        sealed: true,
        sealedContent: createElement("p", null, "Enter the event code"),
      }),
    );
    expect(html).toContain("Garden Supper");
    expect(html).toMatch(/<div class="surface-lit[^"]*"><p>Enter the event code<\/p><\/div>/);
    expect(html).not.toContain("<button");
  });

  it("sits on the dusk stage, with the seal at the flap's point and a light pool under it", () => {
    const html = renderToStaticMarkup(closed());
    // Exactly one stage, brought by the envelope itself when no caller provides one.
    expect(html.match(/data-envelope-stage=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-envelope-stage="" class="surface-dusk /);
    expect(html).toContain("envelope-pool dusk-pool");
    // BrandSeal: decorative, amber with an ink "R".
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*bg-app-action[^"]*">R<\/span>/);
    // The title is in the button's name; the seal adds nothing to it.
    expect(html).toMatch(/<button[^>]*aria-describedby="[^"]+"/);
  });

  it("uses the caller's stage when it has one, never a second", () => {
    const html = renderToStaticMarkup(createElement(EnvelopeStage, null, closed("square")));
    expect(html.match(/data-envelope-stage=""/g)).toHaveLength(1);
  });

  it("holds the card's box from the first paint", () => {
    expect(renderToStaticMarkup(closed("portrait"))).toContain("aspect-ratio:5 / 7");
    expect(renderToStaticMarkup(closed("square"))).toContain("aspect-ratio:1 / 1");
  });
});
