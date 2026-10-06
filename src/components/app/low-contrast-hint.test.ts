import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LOW_CONTRAST_HINT, showLowContrastHint } from "./low-contrast-hint";
import { LowContrastHint } from "./LowContrastHint";

describe("the low-contrast hint (card_layouts_v4)", () => {
  it("says it plainly, pointing to Edit card", () => {
    expect(LOW_CONTRAST_HINT).toBe(
      "Some words sit on a busy part of the picture. If they're hard to read, move them in Edit card.",
    );
  });

  it("shows only for a low-contrast card the host has not customized in this shape", () => {
    expect(showLowContrastHint({ lowContrast: true, customization: null })).toBe(true);
    expect(showLowContrastHint({ lowContrast: false, customization: null })).toBe(false);
    // Once edited, the words are the host's to place.
    const saved = { revision: 1, updatedAt: "2026-10-06T00:00:00Z", unreadable: false };
    expect(showLowContrastHint({ lowContrast: true, customization: saved })).toBe(false);
  });

  it("renders as a note in the legend's text style, with app tokens only, or nothing", () => {
    const html = renderToStaticMarkup(
      createElement(LowContrastHint, { card: { lowContrast: true, customization: null } }),
    );
    expect(html).toContain('role="note"');
    expect(html).toContain("data-low-contrast-hint");
    expect(html).toContain("text-body-sm text-app-text-secondary");
    expect(html).toContain("Some words sit on a busy part of the picture.");
    expect(html).not.toMatch(/style=|#[0-9A-Fa-f]{6}/);
    expect(
      renderToStaticMarkup(
        createElement(LowContrastHint, { card: { lowContrast: false, customization: null } }),
      ),
    ).toBe("");
  });
});
