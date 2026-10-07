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
});
