import { describe, expect, it } from "vitest";

import { CARD_CANVAS } from "@/lib/card/shapes";
import type { FactSlotId } from "@/lib/card/slots";
import type { TextBox } from "@/lib/card/text-box";
import { confirmLegend, detailName, markerGroups, MARKER_PADDING } from "./confirm-markers";

const CANVAS = CARD_CANVAS["5:7"];

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

describe("markerGroups", () => {
  it("gives a lone box its own padded outline, in percent of the canvas", () => {
    const [group] = markerGroups([box("date", 700)], ["date"], CANVAS);
    expect(group.ids).toEqual(["date"]);
    const expected = {
      left: ((100 - MARKER_PADDING) / 1000) * 100,
      top: ((700 - MARKER_PADDING) / 1400) * 100,
      width: ((800 + 2 * MARKER_PADDING) / 1000) * 100,
      height: ((50 + 2 * MARKER_PADDING) / 1400) * 100,
    };
    for (const key of ["left", "top", "width", "height"] as const) {
      expect(group.rect[key]).toBeCloseTo(expected[key], 2);
    }
    expect(group.rect.rotation).toBe(0);
  });

  it("merges adjacent and overlapping boxes into one outline around the run", () => {
    const boxes = [box("babyName", 700), box("date", 750), box("time", 810), box("venue", 880)];
    const groups = markerGroups(boxes, ["babyName", "date", "time", "venue"], CANVAS);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toEqual(["babyName", "date", "time", "venue"]);
    // From the first box's top to the last box's bottom, padded.
    expect(groups[0].rect.top).toBeCloseTo(((700 - MARKER_PADDING) / 1400) * 100, 2);
    expect(groups[0].rect.height).toBeCloseTo(
      ((880 + 50 - 700 + 2 * MARKER_PADDING) / 1400) * 100,
      2,
    );
  });

  it("keeps boxes apart when the gap is more than half a line", () => {
    // Line height 50: the first box ends at 750; half a line is 25.
    const boxes = [box("babyName", 700), box("date", 776), box("time", 1000)];
    const groups = markerGroups(boxes, ["babyName", "date", "time"], CANVAS);
    expect(groups.map((g) => g.ids)).toEqual([["babyName"], ["date"], ["time"]]);
    expect(
      markerGroups(
        boxes.slice(0, 2).map((b, i) => (i ? { ...b, y: 774 } : b)),
        ["babyName", "date"],
        CANVAS,
      ),
    ).toHaveLength(1);
  });

  it("does not bridge over a confirmed box between two unconfirmed ones", () => {
    const boxes = [box("date", 700), box("hosts", 750), box("venue", 800)];
    const groups = markerGroups(boxes, ["date", "venue"], CANVAS);
    expect(groups.map((g) => g.ids)).toEqual([["date"], ["venue"]]);
  });

  it("keeps a rotated box separate, with its rotation", () => {
    const boxes = [box("date", 700), box("time", 750, { rotation: 5 }), box("venue", 800)];
    const groups = markerGroups(boxes, ["date", "time", "venue"], CANVAS);
    expect(groups.map((g) => g.ids)).toEqual([["date"], ["time"], ["venue"]]);
    expect(groups[1].rect.rotation).toBe(5);
  });

  it("clamps an outline inside the card", () => {
    const [group] = markerGroups([box("date", 2, { x: 0, width: 1000 })], ["date"], CANVAS);
    expect(group.rect.left).toBe(0);
    expect(group.rect.top).toBe(0);
    expect(group.rect.width).toBe(100);
  });

  it("ignores boxes that are not marked or show no words", () => {
    const boxes = [box("date", 700, { lines: [] }), box("time", 760)];
    expect(markerGroups(boxes, ["date"], CANVAS)).toEqual([]);
    expect(markerGroups(boxes, [], CANVAS)).toEqual([]);
  });
});

describe("confirmLegend", () => {
  it("names the unconfirmed details in card order, lower case but for acronyms", () => {
    const boxes = [box("venue", 900), box("babyName", 700), box("date", 750), box("rsvpBy", 1000)];
    expect(confirmLegend(boxes, ["venue", "babyName", "date", "rsvpBy"])).toBe(
      "Dashed details aren't confirmed yet: baby's name, date, venue, RSVP-by date.",
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
