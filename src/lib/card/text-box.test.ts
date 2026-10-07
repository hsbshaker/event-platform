import { beforeAll, describe, expect, it } from "vitest";

import { layoutCard, pairingFaces } from "./layout-card";
import { FACT_SLOT_IDS } from "./slots";
import {
  type CardContent,
  type TextBox,
  FIT_SAFETY,
  boxText,
  carryWords,
  rebreakBox,
  rebreakFactBoxes,
  seedCustomization,
  withLinkedLines,
} from "./text-box";
import type { FontMetricsResolver, FontRef } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

const ZONE_57 = { x: 120, y: 800, width: 760, height: 450 };
const ZONE_11 = { x: 120, y: 540, width: 760, height: 300 };

const CONTENT: CardContent = {
  title: "A Little Wild One",
  invitationLine: "Please join us for a baby shower",
  hosts: "Hosted by Maya & Tom",
  date: "Saturday, June 6",
  time: "1:00 pm",
  venue: "The Willow House",
};

function generated(content: CardContent = CONTENT) {
  return layoutCard({
    zone: ZONE_57,
    proportion: "5:7",
    pairing: pairingFaces("hc_playfair_dmsans"),
    content,
    ink: "#3A2A1E",
    metrics,
  }).boxes;
}

function customBox(id: string, text: string, font: FontRef, over: Partial<TextBox> = {}): TextBox {
  return {
    id,
    source: { kind: "custom" },
    text,
    x: 100,
    y: 100,
    width: 400,
    rotation: 12,
    font,
    size: 30,
    color: "#FF0000",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    textCase: "none",
    z: 9,
    lines: [text],
    ...over,
  };
}

describe("seedCustomization", () => {
  it("keeps a box for every fact slot, empty ones included, renumbering the stack", () => {
    const boxes = generated();
    const seed = seedCustomization(boxes, FACT_SLOT_IDS);
    expect(seed.map((b) => b.id)).toEqual(boxes.map((b) => b.id));
    expect(seed.map((b) => b.z)).toEqual(boxes.map((_, i) => i));
    const baby = seed.find((b) => b.id === "babyName")!;
    expect(baby.source).toEqual({ kind: "fact", slot: "babyName" });
    expect(baby.lines).toEqual([]);
  });

  it("adds no text background: a generated box never has one", () => {
    for (const box of seedCustomization(generated(), FACT_SLOT_IDS)) {
      expect(box).not.toHaveProperty("background");
    }
  });

  it("returns copies the caller can edit without touching the generated layout", () => {
    const boxes = generated();
    const before = structuredClone(boxes);
    const seed = seedCustomization(boxes, FACT_SLOT_IDS);
    seed[0].lines.push("x");
    seed[0].font.weight = 900;
    expect(boxes).toEqual(before);
  });

  it("refuses a generated layer missing a fact slot or with duplicate ids", () => {
    const boxes = generated().filter((b) => b.id !== "rsvpBy");
    expect(() => seedCustomization(boxes, FACT_SLOT_IDS)).toThrow(/rsvpBy/);
    const dup = generated();
    expect(() => seedCustomization([...dup, dup[0]], FACT_SLOT_IDS)).toThrow(/Duplicate/);
  });
});

describe("boxText", () => {
  it("reads the title and facts from the event, the invitation line and custom text from the box", () => {
    const boxes = generated();
    const byId = (id: string) => boxes.find((b) => b.id === id)!;
    const content = { ...CONTENT, title: "New Title", venue: "Elsewhere" };
    expect(boxText(byId("title"), content)).toBe("New Title");
    expect(boxText(byId("venue"), content)).toBe("Elsewhere");
    expect(boxText({ ...byId("invitationLine"), text: "Edited line" }, content)).toBe(
      "Edited line",
    );
    expect(boxText(byId("babyName"), content)).toBe("");
  });
});

describe("rebreakBox", () => {
  const playfair: FontRef = { family: "Playfair Display", weight: 400, italic: false };

  it("re-breaks at the box's width after a width change, and only then", () => {
    const box = customBox("c1", "Bring a book instead of a card", playfair, {
      width: 700,
      lines: ["stale"],
    });
    const wide = rebreakBox(box, CONTENT, metrics);
    expect(wide.box.lines).toEqual(["Bring a book instead of a card"]);
    const narrow = rebreakBox({ ...box, width: 200 }, CONTENT, metrics);
    expect(narrow.box.lines.length).toBeGreaterThan(1);
    expect(narrow.box.lines.join(" ")).toBe("Bring a book instead of a card");
    const face = metrics(playfair);
    for (const line of narrow.box.lines) {
      expect(face.measure(line, { size: 30 }) * (1 + FIT_SAFETY)).toBeLessThanOrEqual(200);
    }
  });

  it("re-breaks after a size, spacing or case change", () => {
    const box = customBox("c1", "Bring a book instead of a card", playfair, { width: 420 });
    const base = rebreakBox(box, CONTENT, metrics).box.lines.length;
    expect(rebreakBox({ ...box, size: 60 }, CONTENT, metrics).box.lines.length).toBeGreaterThan(
      base,
    );
    const spaced = rebreakBox(
      { ...box, letterSpacing: 0.3, textCase: "uppercase" },
      CONTENT,
      metrics,
    );
    expect(spaced.box.lines.length).toBeGreaterThan(base);
    // Stored lines keep the source text's case; the renderer applies the transform.
    expect(spaced.box.lines.join(" ")).toBe("Bring a book instead of a card");
  });

  it("honours hard breaks and flags, never truncates, a word wider than the box", () => {
    const box = customBox("c1", "Hello\nSupercalifragilistic", playfair, { width: 120 });
    const result = rebreakBox(box, CONTENT, metrics);
    expect(result.box.lines).toEqual(["Hello", "Supercalifragilistic"]);
    expect(result.overflow).toBe(true);
  });

  it("does not mutate its input and keeps everything but the lines", () => {
    const box = customBox("c1", "Bring a book", playfair, { lines: ["stale"] });
    const copy = structuredClone(box);
    const result = rebreakBox(box, CONTENT, metrics).box;
    expect(box).toEqual(copy);
    expect({ ...result, lines: copy.lines }).toEqual(copy);
  });

  it("keeps a box's text background through a re-break, as an independent copy", () => {
    const background = { style: "box" as const, color: "#FFFFFF", opacity: 0.8, padding: 14 };
    const box = customBox("c1", "Bring a book and a blanket", playfair, {
      width: 160,
      background,
    });
    const result = rebreakBox(box, CONTENT, metrics).box;
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.background).toEqual(background);
    expect(result.background).not.toBe(background);
    // No background stays none: the field is absent, not undefined.
    expect(rebreakBox(customBox("c2", "Hi", playfair), CONTENT, metrics).box).not.toHaveProperty(
      "background",
    );
  });

  it("keeps text backgrounds through a fact's re-break and on boxes whose lines are linked", () => {
    const background = { style: "highlight" as const, color: "#1B1B1F", opacity: 0.6, padding: 6 };
    const seed = seedCustomization(generated(), FACT_SLOT_IDS).map((b) =>
      b.id === "babyName" || b.id === "title" ? { ...b, background } : b,
    );
    const content = { ...CONTENT, babyName: "Maximilian Augustin Montgomery-Whitworth" };
    const after = rebreakFactBoxes(seed, "babyName", content, metrics);
    expect(after.find((b) => b.id === "babyName")!.background).toEqual(background);
    expect(after.find((b) => b.id === "title")!.background).toEqual(background);
    const linked = withLinkedLines(seed, { ...content, title: "A Brand New Title" }, metrics);
    expect(linked.rebroken).toContain("title");
    expect(linked.boxes.find((b) => b.id === "title")!.background).toEqual(background);
    expect(linked.boxes.find((b) => b.id === "babyName")!.background).toEqual(background);
  });

  it("re-breaks every box of a fact after that fact changes, and only those", () => {
    const seed = seedCustomization(generated(), FACT_SLOT_IDS);
    const content = { ...CONTENT, babyName: "Maximilian Augustin Montgomery-Whitworth" };
    const after = rebreakFactBoxes(seed, "babyName", content, metrics);
    const baby = after.find((b) => b.id === "babyName")!;
    expect(baby.lines.join(" ")).toBe("Maximilian Augustin Montgomery-Whitworth");
    for (const box of after) {
      if (box.id !== "babyName") expect(box).toEqual(seed.find((b) => b.id === box.id));
    }
  });
});

describe("carryWords", () => {
  const fraunces: FontRef = { family: "Fraunces", weight: 700, italic: false };
  const karla: FontRef = { family: "Karla", weight: 600, italic: false };
  const newCard = () => ({
    zone: ZONE_11,
    proportion: "1:1" as const,
    pairing: pairingFaces("grotesk_archivo_inter"),
    ink: "#F4EEE2",
    metrics,
  });

  /** The card being switched from, as the host left it. */
  function hostCard(added: TextBox[] = []): TextBox[] {
    return seedCustomization(generated(), FACT_SLOT_IDS)
      .map((box) => {
        if (box.id === "title")
          return { ...box, font: fraunces, x: 10, rotation: -8, color: "#000000" };
        if (box.id === "invitationLine")
          return { ...box, text: "Come celebrate with us", font: karla };
        return box;
      })
      .concat(added);
  }

  it("keeps the title and invitation line text and fonts; the new card sets the rest", () => {
    const layout = carryWords({ from: hostCard(), content: CONTENT, card: newCard() });
    const title = layout.boxes.find((b) => b.id === "title")!;
    const line = layout.boxes.find((b) => b.id === "invitationLine")!;
    const date = layout.boxes.find((b) => b.id === "date")!;
    expect(title.font).toEqual(fraunces);
    expect(title.lines.join(" ")).toBe(CONTENT.title);
    expect(line.font).toEqual(karla);
    expect(line.text).toBe("Come celebrate with us");
    expect(date.font).toEqual(pairingFaces("grotesk_archivo_inter").body);
    for (const box of layout.boxes) {
      expect(box.color).toBe("#F4EEE2");
      expect(box.rotation).toBe(0);
      expect(box.x).toBe(ZONE_11.x);
    }
    expect(layout.overflow).toBe(false);
    expect(layout.belowZone).toEqual([]);
  });

  it("appends added boxes in their order, as body lines in their own fonts", () => {
    const added = [
      customBox("note-1", "No gifts please", karla),
      customBox("note-2", "Parking at the back", fraunces),
    ];
    const layout = carryWords({ from: hostCard(added), content: CONTENT, card: newCard() });
    const ids = layout.boxes.map((b) => b.id);
    expect(ids.slice(-2)).toEqual(["note-1", "note-2"]);
    const note = layout.boxes.find((b) => b.id === "note-1")!;
    expect(note.source).toEqual({ kind: "custom" });
    expect(note.text).toBe("No gifts please");
    expect(note.font).toEqual(karla);
    expect(note.color).toBe("#F4EEE2");
    const venue = layout.boxes.find((b) => b.id === "venue")!;
    expect(note.y).toBeGreaterThan(venue.y);
  });

  it("stacks added boxes that cannot fit the zone below it, keeping the generated slots inside", () => {
    const added = Array.from({ length: 6 }, (_, i) =>
      customBox(`note-${i}`, `An extra note number ${i} for the guests to read`, karla),
    );
    const layout = carryWords({ from: hostCard(added), content: CONTENT, card: newCard() });
    expect(layout.overflow).toBe(false);
    expect(layout.belowZone.length).toBeGreaterThan(0);
    const bottom = ZONE_11.y + ZONE_11.height;
    for (const box of layout.boxes) {
      const end = box.y + box.lines.length * box.size * box.lineHeight;
      if (layout.belowZone.includes(box.id)) expect(box.y).toBeGreaterThanOrEqual(bottom);
      else expect(end).toBeLessThanOrEqual(bottom + 1e-3);
    }
    // The overflowing ones are the last ones, in order.
    const order = added.map((b) => b.id);
    expect(layout.belowZone).toEqual(order.slice(order.length - layout.belowZone.length));
  });

  it("keeps the text background of the title, the invitation line and added boxes, not a fact's", () => {
    const hi = { style: "highlight" as const, color: "#FFFFFF", opacity: 0.85, padding: 8 };
    const box = { style: "box" as const, color: "#1B1B1F", opacity: 0.8, padding: 20 };
    const from = hostCard([customBox("note-1", "No gifts please", karla, { background: box })]).map(
      (b) =>
        b.id === "title" || b.id === "invitationLine" || b.id === "date"
          ? { ...b, background: hi }
          : b,
    );
    const layout = carryWords({ from, content: CONTENT, card: newCard() });
    const byId = (id: string) => layout.boxes.find((b) => b.id === id)!;
    // Style, opacity and padding as chosen; the colour re-picked against the new card's light ink
    // (#F4EEE2), so a white highlight carried onto light words becomes near-black.
    expect(byId("title").background).toEqual({ ...hi, color: "#1B1B1F" });
    expect(byId("invitationLine").background).toEqual({ ...hi, color: "#1B1B1F" });
    expect(byId("note-1").background).toEqual(box);
    // Facts take the new card's own styling, as their font does.
    expect(byId("date")).not.toHaveProperty("background");
    expect(byId("venue")).not.toHaveProperty("background");
    // Copies: the carried layout never shares an object with the card it came from.
    expect(byId("title").background).not.toBe(hi);
  });

  it("keeps an invitation line the host deleted absent", () => {
    const from = hostCard().filter((b) => b.id !== "invitationLine");
    const layout = carryWords({ from, content: CONTENT, card: newCard() });
    expect(layout.boxes.find((b) => b.id === "invitationLine")).toBeUndefined();
    expect(layout.boxes.find((b) => b.id === "title")!.lines.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const from = hostCard([customBox("n", "No gifts please", karla)]);
    expect(carryWords({ from, content: CONTENT, card: newCard() })).toEqual(
      carryWords({ from, content: CONTENT, card: newCard() }),
    );
  });
});
