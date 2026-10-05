import { beforeAll, describe, expect, it } from "vitest";

import { validateCardData } from "./card-data";
import { layoutCard, pairingFaces } from "./layout-card";
import { seedCustomization, type TextBox } from "./text-box";
import { CARD_EDITOR_LIMITS, parseEditorBoxes, parseStoredBoxes } from "./text-box-schema";
import { FACT_SLOT_IDS } from "./slots";
import type { FontMetricsResolver } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";

/**
 * The `TextBox` schema (`spec.md §20.5`; `docs/development-plan.md` 6b: stored boxes are untrusted
 * — every read parses them, and a parse failure is the generated layout with a notice) and the
 * editor's per-box limits for a save (`spec.md §20.2`).
 */

let metrics: FontMetricsResolver;
let generated: TextBox[];
beforeAll(async () => {
  metrics = await allCuratedMetrics();
  generated = seedCustomization(
    layoutCard({
      zone: { x: 120, y: 800, width: 760, height: 450 },
      proportion: "5:7",
      pairing: pairingFaces("hc_playfair_dmsans"),
      content: {
        title: "A Little Wild One",
        invitationLine: "Please join us for a baby shower",
        hosts: "Hosted by Maya & Tom",
        date: "Saturday, June 6",
      },
      ink: "#3A2A1E",
      metrics,
    }).boxes,
    FACT_SLOT_IDS,
  );
});

const custom = (over: Partial<TextBox> = {}): TextBox => ({
  id: "added-1",
  source: { kind: "custom" },
  text: "Bring a book",
  x: 100,
  y: 200,
  width: 400,
  rotation: -12.5,
  font: { family: "Fraunces", weight: 700, italic: false },
  size: 30,
  color: "#AA3300",
  align: "left",
  letterSpacing: 0.05,
  lineHeight: 1.2,
  textCase: "none",
  z: 12,
  lines: ["Bring a book"],
  ...over,
});

describe("parseStoredBoxes", () => {
  it("reads a generated layer and an added box back exactly", () => {
    const boxes = [...generated, custom()];
    const parsed = parseStoredBoxes(JSON.parse(JSON.stringify(boxes)));
    expect(parsed).toEqual({ ok: true, boxes });
    // What parses, the card component draws.
    expect(() =>
      validateCardData({ shape: "rectangle", artworkProportion: "5:7", panels: [], boxes }),
    ).not.toThrow();
  });

  it("drops keys it does not know rather than carrying them to the renderer", () => {
    const parsed = parseStoredBoxes([{ ...custom(), onclick: "alert(1)", style: "x" }]);
    expect(parsed.ok && Object.keys(parsed.boxes[0])).not.toContain("onclick");
  });

  it("refuses anything that is not an array of valid boxes, with the issues for the log", () => {
    const bad: unknown[] = [
      null,
      {},
      "[]",
      [null],
      [{ ...custom(), x: "10" }],
      [{ ...custom(), width: 0 }],
      [{ ...custom(), size: -3 }],
      [{ ...custom(), lineHeight: 0 }],
      [{ ...custom(), rotation: Number.NaN }],
      [{ ...custom(), z: 1.5 }],
      [{ ...custom(), color: "red" }],
      [{ ...custom(), color: "#aa3300" }],
      [{ ...custom(), align: "justify" }],
      [{ ...custom(), textCase: "capitalize" }],
      [{ ...custom(), lines: "Bring a book" }],
      [{ ...custom(), lines: ["Bring\na book"] }],
      [{ ...custom(), text: "Bring\u0007" }],
      [{ ...custom(), id: "" }],
      [{ ...custom(), id: "has space" }],
      [{ ...custom(), source: { kind: "fact", slot: "weather" } }],
      [{ ...custom(), source: { kind: "wording", slot: "subtitle" } }],
      [{ ...custom(), source: { kind: "image" } }],
      [{ ...custom(), font: { family: "Playfair Display", weight: 400 } }],
    ];
    for (const value of bad) {
      const parsed = parseStoredBoxes(value);
      expect(parsed.ok, JSON.stringify(value)).toBe(false);
      if (!parsed.ok) expect(parsed.issues).not.toBe("");
    }
  });

  it("refuses a face the platform cannot serve or measure", () => {
    for (const font of [
      { family: "Comic Neue", weight: 400, italic: false },
      { family: "Playfair Display", weight: 500, italic: false },
      { family: "Playfair Display", weight: 400, italic: true },
    ]) {
      expect(parseStoredBoxes([custom({ font })]).ok, font.family).toBe(false);
    }
  });

  it("holds each box's words where they live: the title and facts on the event", () => {
    const title = generated.find((b) => b.id === "title")!;
    const date = generated.find((b) => b.id === "date")!;
    const line = generated.find((b) => b.id === "invitationLine")!;
    expect(parseStoredBoxes([{ ...title, text: "Injected" }]).ok).toBe(false);
    expect(parseStoredBoxes([{ ...date, text: "Injected" }]).ok).toBe(false);
    const { text: _dropped, ...lineWithout } = line;
    void _dropped;
    expect(parseStoredBoxes([lineWithout]).ok).toBe(false);
    const { text: _none, ...customWithout } = custom();
    void _none;
    expect(parseStoredBoxes([customWithout]).ok).toBe(false);
  });

  it("refuses duplicate ids and an added box named like a card slot", () => {
    expect(parseStoredBoxes([custom(), custom()]).ok).toBe(false);
    expect(parseStoredBoxes([custom({ id: "title" })]).ok).toBe(false);
    // A second box showing a fact is allowed (a duplicated fact box), under its own id.
    const date = generated.find((b) => b.id === "date")!;
    expect(parseStoredBoxes([date, { ...date, id: "date-copy" }]).ok).toBe(true);
  });

  it("accepts an empty layer (every box deleted) and text past the outline", () => {
    expect(parseStoredBoxes([])).toEqual({ ok: true, boxes: [] });
    expect(parseStoredBoxes([custom({ x: -900, y: 2300, rotation: 720 })]).ok).toBe(true);
  });
});

describe("parseEditorBoxes", () => {
  it("drops the editor's lines and a fact box's words, and returns the typed title apart", () => {
    const title = generated.find((b) => b.id === "title")!;
    const date = generated.find((b) => b.id === "date")!;
    const parsed = parseEditorBoxes([
      { ...title, text: "  Our Little Garden  ", lines: ["forged"] },
      { ...date, text: "Every day!", lines: ["forged"] },
      { ...custom(), lines: ["forged", "lines"] },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.title).toBe("Our Little Garden");
    for (const box of parsed.boxes) expect(box).not.toHaveProperty("lines");
    expect(parsed.boxes[0]).not.toHaveProperty("text");
    expect(parsed.boxes[1]).not.toHaveProperty("text");
    expect(parsed.boxes[2].text).toBe("Bring a book");
  });

  it("reads no title when no title box carries text", () => {
    const parsed = parseEditorBoxes(generated.map(({ lines: _l, ...b }) => (void _l, b)));
    expect(parsed).toMatchObject({ ok: true, title: null });
  });

  it("turns typed CRLF into line feeds", () => {
    const parsed = parseEditorBoxes([custom({ text: "Dinner\r\nDancing\rLate" })]);
    expect(parsed.ok && parsed.boxes[0].text).toBe("Dinner\nDancing\nLate");
  });

  it("turns a pasted tab into a space rather than refusing the text", () => {
    const parsed = parseEditorBoxes([custom({ text: "Dinner\tDancing" })]);
    expect(parsed.ok && parsed.boxes[0].text).toBe("Dinner Dancing");
  });

  it("stores a lower-case hex colour in canonical form", () => {
    const parsed = parseEditorBoxes([custom({ color: "#aa3300" })]);
    expect(parsed.ok && parsed.boxes[0].color).toBe("#AA3300");
    expect(parseEditorBoxes([custom({ color: "#aa33" })]).ok).toBe(false);
  });

  it("holds every number to the editor's range, with a field error for each", () => {
    const L = CARD_EDITOR_LIMITS;
    const cases: [Partial<TextBox>, string][] = [
      [{ x: L.position.max + 1 }, "x"],
      [{ y: L.position.min - 1 }, "y"],
      [{ width: L.width.min - 1 }, "width"],
      [{ width: L.width.max + 1 }, "width"],
      [{ size: L.size.max + 1 }, "size"],
      [{ size: L.size.min - 1 }, "size"],
      [{ rotation: 400 }, "rotation"],
      [{ letterSpacing: L.letterSpacing.max + 0.1 }, "letterSpacing"],
      [{ lineHeight: L.lineHeight.min - 0.1 }, "lineHeight"],
      [{ z: L.z.max + 1 }, "z"],
      [{ color: "#abc" }, "color"],
    ];
    for (const [over, field] of cases) {
      const parsed = parseEditorBoxes([custom(over)]);
      expect(parsed.ok, field).toBe(false);
      if (!parsed.ok) expect(Object.keys(parsed.fieldErrors)).toContain(`boxes.0.${field}`);
    }
  });

  it("holds an added box and the invitation line to their length limits, never truncating", () => {
    const long = "x".repeat(CARD_EDITOR_LIMITS.addedTextMax + 1);
    const parsed = parseEditorBoxes([custom({ text: long })]);
    expect(parsed).toMatchObject({
      ok: false,
      fieldErrors: { "boxes.0.text": expect.any(String) },
    });
    expect(
      parseEditorBoxes([custom({ text: "x".repeat(CARD_EDITOR_LIMITS.addedTextMax) })]).ok,
    ).toBe(true);
    const line = generated.find((b) => b.id === "invitationLine")!;
    const tooLong = "y".repeat(CARD_EDITOR_LIMITS.invitationLineMax + 1);
    expect(parseEditorBoxes([{ ...line, text: tooLong }]).ok).toBe(false);
  });

  it("refuses more boxes than a card holds", () => {
    const many = Array.from({ length: CARD_EDITOR_LIMITS.maxBoxes + 1 }, (_, i) =>
      custom({ id: `added-${i}` }),
    );
    expect(parseEditorBoxes(many).ok).toBe(false);
  });

  it("refuses an added box without words, a blank title, and title boxes that disagree", () => {
    const { text: _t, ...noText } = custom();
    void _t;
    expect(parseEditorBoxes([noText]).ok).toBe(false);
    const title = generated.find((b) => b.id === "title")!;
    expect(parseEditorBoxes([{ ...title, text: "   " }]).ok).toBe(false);
    expect(
      parseEditorBoxes([
        { ...title, text: "One" },
        { ...title, id: "title-copy", text: "Two" },
      ]).ok,
    ).toBe(false);
  });

  it("refuses an unknown face, a control character and a forged source", () => {
    expect(
      parseEditorBoxes([custom({ font: { family: "Papyrus", weight: 400, italic: false } })]),
    ).toMatchObject({ ok: false, fieldErrors: { "boxes.0.font": "This font isn't available." } });
    expect(parseEditorBoxes([custom({ text: "Bell\u0007" })]).ok).toBe(false);
    expect(parseEditorBoxes([{ ...custom(), source: { kind: "artwork" } }]).ok).toBe(false);
  });
});
