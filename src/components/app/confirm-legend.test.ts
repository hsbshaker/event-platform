import { describe, expect, it } from "vitest";

import type { FactSlotId } from "@/lib/card/slots";
import type { TextBox } from "@/lib/card/text-box";
import { confirmLegend, detailName } from "./confirm-legend";

function box(slot: FactSlotId, y: number, partial: Partial<TextBox> = {}): TextBox {
  return {
    id: slot,
    source: { kind: "fact", slot },
    x: 100,
    y,
    width: 800,
    rotation: 0,
    font: { family: "Fraunces", weight: 400, italic: false },
    size: 40,
    color: "#222222",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.25,
    textCase: "none",
    z: 0,
    lines: ["words"],
    ...partial,
  } as TextBox;
}

describe("confirmLegend", () => {
  it("names the unconfirmed details in card order, lower case but for acronyms", () => {
    const boxes = [box("venue", 900), box("babyName", 700), box("date", 750), box("rsvpBy", 1000)];
    expect(confirmLegend(boxes, ["venue", "babyName", "date", "rsvpBy"])).toBe(
      "Not confirmed yet: baby's name, date, venue, RSVP-by date.",
    );
  });

  it("is null when nothing needs confirming", () => {
    expect(confirmLegend([box("date", 700)], [])).toBeNull();
  });

  it("names a custom box plainly", () => {
    const custom = box("date", 700, { id: "c1", source: { kind: "custom" } });
    expect(detailName(custom)).toBe("Text");
  });
});
