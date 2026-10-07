import { describe, expect, it } from "vitest";

import { textBackgroundIssue, type TextBackground } from "@/lib/card/text-background";
import {
  choiceOf,
  chooseStyle,
  normalizeHex,
  opacityPercent,
  setColor,
  setOpacity,
  setPadding,
} from "./text-background-control";

const DARK_TEXT = { color: "#1B1B1F", size: 100 };

describe("chooseStyle", () => {
  it("starts a style from None with its defaults, and None removes the background", () => {
    const box = chooseStyle(undefined, "box", DARK_TEXT)!;
    expect(box).toEqual({ style: "box", color: "#FFFFFF", opacity: 0.8, padding: 45 });
    expect(textBackgroundIssue(box)).toBeNull();
    expect(chooseStyle(box, "none", DARK_TEXT)).toBeUndefined();
    expect(chooseStyle(undefined, "none", DARK_TEXT)).toBeUndefined();
  });

  it("keeps the chosen colour but takes the new style's opacity and padding on a switch", () => {
    const custom: TextBackground = { style: "highlight", color: "#AA3311", opacity: 0.3, padding: 7 };
    expect(chooseStyle(custom, "backdrop", DARK_TEXT)).toEqual({
      style: "backdrop",
      color: "#AA3311",
      opacity: 0.65,
      padding: 60,
    });
  });

  it("changes nothing when the chosen style is chosen again", () => {
    const custom: TextBackground = { style: "box", color: "#AA3311", opacity: 0.3, padding: 7 };
    expect(chooseStyle(custom, "box", DARK_TEXT)).toBe(custom);
  });

  it("reports the selected choice", () => {
    expect(choiceOf(undefined)).toBe("none");
    expect(choiceOf(chooseStyle(undefined, "highlight", DARK_TEXT))).toBe("highlight");
  });
});

describe("colour", () => {
  const base: TextBackground = { style: "box", color: "#FFFFFF", opacity: 0.8, padding: 40 };

  it("accepts hex with or without # in either case, stored as #RRGGBB", () => {
    for (const input of ["#aabbcc", "AABBCC", " #AaBbCc ", "aabbcc"]) {
      expect(normalizeHex(input)).toBe("#AABBCC");
      expect(setColor(base, input)).toEqual({ ok: true, value: { ...base, color: "#AABBCC" } });
    }
  });

  it("refuses anything else", () => {
    for (const input of ["", "#fff", "#12345", "#1234567", "red", "#GGGGGG", "rgb(0,0,0)"]) {
      expect(setColor(base, input).ok, input).toBe(false);
    }
  });
});

describe("opacity and padding", () => {
  const base: TextBackground = { style: "box", color: "#FFFFFF", opacity: 0.8, padding: 40 };

  it("sets opacity from whole percent, clamped to 5-100, touching nothing else", () => {
    expect(setOpacity(base, 50)).toEqual({ ...base, opacity: 0.5 });
    expect(setOpacity(base, 0).opacity).toBe(0.05);
    expect(setOpacity(base, 250).opacity).toBe(1);
    expect(setOpacity(base, 33.4).opacity).toBe(0.33);
    expect(setOpacity(base, Number.NaN)).toBe(base);
    expect(opacityPercent(setOpacity(base, 29))).toBe(29);
    expect(textBackgroundIssue(setOpacity(base, 5))).toBeNull();
  });

  it("sets padding in whole card units within the limits", () => {
    expect(setPadding(base, 0).padding).toBe(0);
    expect(setPadding(base, -5).padding).toBe(0);
    expect(setPadding(base, 500).padding).toBe(120);
    expect(setPadding(base, 12.6).padding).toBe(13);
    expect(setPadding(base, Number.NaN)).toBe(base);
  });
});
