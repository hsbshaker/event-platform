import { describe, expect, it } from "vitest";

import {
  defaultTextBackground,
  TEXT_BACKGROUND_DARK,
  TEXT_BACKGROUND_LIGHT,
  TEXT_BACKGROUND_PADDING_MAX,
  textBackgroundIssue,
  type TextBackground,
} from "./text-background";
// The editor's API is re-exported where `TextBox` lives.
import * as textBox from "./text-box";

/**
 * A box's text background (`TextBox.background`): the host's choice, never automatic; the starting
 * values the editor offers, and the one shape both renderers accept.
 */

const VALID: TextBackground = { style: "box", color: "#FFFFFF", opacity: 0.8, padding: 20 };

describe("defaultTextBackground", () => {
  it("fills light behind dark text and dark behind light text", () => {
    // Relative luminance: #3A2A1E ≈ 0.026, #767676 ≈ 0.18, #9E9E9E ≈ 0.34 (dark); #AAAAAA ≈ 0.402,
    // #F4EEE2 ≈ 0.85 (light).
    for (const color of ["#000000", "#3A2A1E", "#767676", "#9E9E9E", "#7A1F2B"]) {
      expect(defaultTextBackground("box", { color, size: 40 }).color).toBe(TEXT_BACKGROUND_LIGHT);
    }
    for (const color of ["#FFFFFF", "#F4EEE2", "#AAAAAA", "#FFD000"]) {
      expect(defaultTextBackground("box", { color, size: 40 }).color).toBe(TEXT_BACKGROUND_DARK);
    }
    expect(TEXT_BACKGROUND_LIGHT).toBe("#FFFFFF");
    expect(TEXT_BACKGROUND_DARK).toBe("#1B1B1F");
  });

  it("starts each style at its own opacity and padding, in proportion to the size", () => {
    const box = { color: "#3A2A1E", size: 104 };
    expect(defaultTextBackground("highlight", box)).toEqual({
      style: "highlight",
      color: "#FFFFFF",
      opacity: 0.85,
      padding: 19, // round(0.18 × 104 = 18.72)
    });
    expect(defaultTextBackground("box", box)).toEqual({
      style: "box",
      color: "#FFFFFF",
      opacity: 0.8,
      padding: 47, // round(0.45 × 104 = 46.8)
    });
    expect(defaultTextBackground("backdrop", box)).toEqual({
      style: "backdrop",
      color: "#FFFFFF",
      opacity: 0.65,
      padding: 62, // round(0.6 × 104 = 62.4)
    });
  });

  it("holds the padding within the limits", () => {
    expect(defaultTextBackground("backdrop", { color: "#000000", size: 400 }).padding).toBe(
      TEXT_BACKGROUND_PADDING_MAX,
    );
    expect(defaultTextBackground("highlight", { color: "#000000", size: 2 }).padding).toBe(0);
  });

  it("is always a background both renderers accept", () => {
    for (const style of ["highlight", "box", "backdrop"] as const) {
      for (const size of [8, 24, 104, 400]) {
        for (const color of ["#000000", "#FFFFFF", "#7A1F2B"]) {
          expect(textBackgroundIssue(defaultTextBackground(style, { color, size }))).toBeNull();
        }
      }
    }
  });

  it("is exported with the text box", () => {
    expect(textBox.defaultTextBackground).toBe(defaultTextBackground);
    expect(textBox.TEXT_BACKGROUND_PADDING_MAX).toBe(120);
  });
});

describe("textBackgroundIssue", () => {
  it("accepts exactly the four fields in range", () => {
    expect(textBackgroundIssue(VALID)).toBeNull();
    expect(textBackgroundIssue({ ...VALID, opacity: 1, padding: 0 })).toBeNull();
    expect(textBackgroundIssue({ ...VALID, opacity: 0.001, padding: 120 })).toBeNull();
  });

  it("refuses anything else", () => {
    const bad: unknown[] = [
      null,
      "box",
      [],
      { ...VALID, style: "none" },
      { ...VALID, style: undefined },
      { ...VALID, color: "#ffffff" },
      { ...VALID, color: "white" },
      { ...VALID, color: "#FFF" },
      { ...VALID, opacity: 0 },
      { ...VALID, opacity: -0.1 },
      { ...VALID, opacity: 1.01 },
      { ...VALID, opacity: Number.NaN },
      { ...VALID, opacity: "0.5" },
      { ...VALID, padding: -1 },
      { ...VALID, padding: 120.5 },
      { ...VALID, padding: Number.POSITIVE_INFINITY },
      { ...VALID, extra: 1 },
      { style: "box", color: "#FFFFFF", opacity: 0.8 },
    ];
    for (const value of bad)
      expect(textBackgroundIssue(value), JSON.stringify(value)).not.toBeNull();
  });
});
