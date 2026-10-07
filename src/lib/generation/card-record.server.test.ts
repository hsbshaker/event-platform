import { describe, expect, it } from "vitest";

import { panelFor } from "@/lib/card/layouts";
import type { Json } from "@/lib/supabase/database.types";

import { zoneInk } from "./card-record.server";

/** A stored ink record for one shape's text zone. */
const stored = (shape: string, zone: Record<string, unknown>) =>
  ({ [shape]: { text: zone } }) as unknown as Json;

describe("zoneInk: the stored slide (card_compiler_v6)", () => {
  const above = { ...panelFor("art-top", "rectangle") };
  const below = { ...panelFor("art-bottom", "rectangle") };

  it("reads no slide as 0, and a slide toward the words' side within 15%", () => {
    expect(zoneInk(stored("rectangle", { ink: "#222222" }), "rectangle").artOffset).toBe(0);
    expect(
      zoneInk(stored("rectangle", { ink: "#222222", artOffset: 0 }), "rectangle").artOffset,
    ).toBe(0);
    const up = stored("rectangle", {
      ink: "#222222",
      panel: above,
      panelColor: "#F6F1EA",
      artOffset: -210,
    });
    expect(zoneInk(up, "rectangle")).toMatchObject({ artOffset: -210, panels: [{ y: above.y }] });
    const down = stored("rectangle", {
      ink: "#222222",
      panel: below,
      panelColor: "#F6F1EA",
      artOffset: 70,
    });
    expect(zoneInk(down, "rectangle").artOffset).toBe(70);
  });

  it("refuses a slide with no panel, the wrong way, or past the limit", () => {
    const bad = (zone: Record<string, unknown>) =>
      expect(() => zoneInk(stored("rectangle", { ink: "#222222", ...zone }), "rectangle")).toThrow(
        /slide/,
      );
    bad({ artOffset: -70 });
    bad({ panel: above, panelColor: "#F6F1EA", artOffset: 70 });
    bad({ panel: below, panelColor: "#F6F1EA", artOffset: -70 });
    bad({ panel: above, panelColor: "#F6F1EA", artOffset: -211 });
    bad({ panel: above, panelColor: "#F6F1EA", artOffset: "far" });
  });
});
