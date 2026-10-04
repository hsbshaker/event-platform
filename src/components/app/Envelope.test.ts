import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Envelope, type OpenableEnvelopeProps } from "./Envelope";

const CARD = "Secret card wording";

describe("Envelope (server render)", () => {
  it("renders a closed envelope as a button with the title, and no card", () => {
    const html = renderToStaticMarkup(
      createElement(
        Envelope,
        // children go as the argument below; the props type requires them, so narrow it here.
        { title: "Garden Supper", proportion: "portrait" } as OpenableEnvelopeProps,
        CARD,
      ),
    );
    expect(html).toContain("<button");
    expect(html).toContain("Garden Supper");
    expect(html).not.toContain(CARD);
  });

  it("renders a sealed envelope with only the title and the gate slot", () => {
    const html = renderToStaticMarkup(
      createElement(Envelope, {
        title: "Garden Supper",
        proportion: "square",
        sealed: true,
        sealedContent: createElement("p", null, "Enter the event code"),
      }),
    );
    expect(html).toContain("Garden Supper");
    expect(html).toContain("Enter the event code");
    expect(html).not.toContain("<button");
  });
});
