import { describe, expect, it } from "vitest";

import type { Json } from "@/lib/supabase/database.types";

import { zoneInk } from "./card-record.server";

/** A stored ink record for one shape's text zone. */
const stored = (shape: string, zone: Record<string, unknown>) =>
  ({ [shape]: { text: zone } }) as unknown as Json;

/** A `card_layouts_v3` panel as persisted for an art-top rectangle. */
const PANEL = {
  x: 0,
  y: 770,
  width: 1000,
  height: 630,
  radius: 0,
  softEdge: { spread: 0, blur: 0 },
  fade: { kind: "edge", from: "bottom", length: 180 },
};

describe("zoneInk", () => {
  it("reads the ink alone, and a stored panel as stored", () => {
    expect(zoneInk(stored("rectangle", { ink: "#222222" }), "rectangle")).toEqual({
      ink: "#222222",
      panels: [],
      shift: { heading: 0, details: 0 },
    });
    const panel = PANEL;
    expect(
      zoneInk(stored("rectangle", { ink: "#222222", panel, panelColor: "#F6F1EA" }), "rectangle"),
    ).toMatchObject({ ink: "#222222", panels: [{ y: panel.y, color: "#F6F1EA" }] });
  });

  it("ignores the withdrawn slide: the artwork is drawn as painted", () => {
    const panel = PANEL;
    const read = zoneInk(
      stored("rectangle", { ink: "#222222", panel, panelColor: "#F6F1EA", artOffset: -210 }),
      "rectangle",
    );
    expect(read).not.toHaveProperty("artOffset");
    expect(
      zoneInk(stored("rectangle", { ink: "#222222", artOffset: "far" }), "rectangle").panels,
    ).toEqual([]);
  });

  it("reads a stored text shift (card_compiler_v7), with no panel", () => {
    const shift = { heading: -80, details: -40 };
    expect(zoneInk(stored("square", { ink: "#F7F2EA", shift }), "square")).toEqual({
      ink: "#F7F2EA",
      panels: [],
      shift,
    });
  });

  it("keeps a historical panel and reads no shift beside it", () => {
    const read = zoneInk(
      stored("rectangle", { ink: "#222222", panel: PANEL, panelColor: "#F6F1EA" }),
      "rectangle",
    );
    expect(read.shift).toEqual({ heading: 0, details: 0 });
    expect(read.panels[0]).toMatchObject({ x: 0, y: 770, fade: PANEL.fade });
  });

  it.each([
    ["not an object", 40],
    ["a missing group", { heading: 10 }],
    ["a non-number", { heading: "10", details: 0 }],
    ["a non-finite number", { heading: 0, details: Number.POSITIVE_INFINITY }],
    ["beyond the canvas", { heading: -1401, details: 0 }],
  ])("refuses a malformed shift: %s", (_, shift) => {
    expect(() => zoneInk(stored("rectangle", { ink: "#222222", shift }), "rectangle")).toThrow(
      /text placement for the rectangle card is malformed/,
    );
  });

  it("bounds a square card's shift by its own canvas", () => {
    expect(() =>
      zoneInk(stored("square", { ink: "#222222", shift: { heading: 0, details: 1001 } }), "square"),
    ).toThrow(/malformed/);
    expect(
      zoneInk(
        stored("rectangle", { ink: "#222222", shift: { heading: 0, details: 1001 } }),
        "rectangle",
      ).shift,
    ).toEqual({ heading: 0, details: 1001 });
  });
});
