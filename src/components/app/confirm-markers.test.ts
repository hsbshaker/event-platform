import { describe, expect, it } from "vitest";

import { CARD_CANVAS } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { detailName, markerLabel, markerRect } from "./confirm-markers";

function box(partial: Partial<TextBox>): TextBox {
  return {
    id: "date",
    source: { kind: "fact", slot: "date" },
    x: 100,
    y: 700,
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
    lines: ["Saturday, December 19"],
    ...partial,
  } as TextBox;
}

describe("markerRect", () => {
  it("places the marker from the box's stored geometry, in percent of the canvas", () => {
    expect(markerRect(box({}), CARD_CANVAS["5:7"])).toEqual({
      left: 10,
      top: 50,
      width: 80,
      height: 3.571,
      rotation: 0,
    });
  });

  it("is as tall as the stored lines, and uses the square canvas for a 1:1 card", () => {
    const two = markerRect(box({ lines: ["a", "b"], y: 500 }), CARD_CANVAS["1:1"]);
    expect(two.top).toBe(50);
    expect(two.height).toBe(10);
  });
});

describe("markerLabel", () => {
  it("names the detail the box shows", () => {
    expect(markerLabel(box({}))).toBe("Date needs confirming");
    expect(detailName(box({ source: { kind: "fact", slot: "babyName" } }))).toBe("Baby's name");
    expect(markerLabel(box({ source: { kind: "fact", slot: "venue" } }))).toBe(
      "Venue needs confirming",
    );
    expect(markerLabel(box({ source: { kind: "fact", slot: "rsvpBy" } }))).toBe(
      "RSVP-by date needs confirming",
    );
  });
});
