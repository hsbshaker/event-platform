import { beforeAll, describe, expect, it } from "vitest";

import { boxesToStore, carriedBoxesFrom, missingCharacters, seedBoxes } from "./customization";
import { layoutCard, pairingFaces } from "./layout-card";
import { FACT_SLOT_IDS } from "./slots";
import { breakBoxText, type CardContent, type TextBox } from "./text-box";
import type { EditorTextBox } from "./text-box-schema";
import type { FontMetricsResolver, FontRef } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";

/**
 * The card editor's text layer between the editor and storage (`spec.md §20.2`, §20.4, §20.5;
 * `docs/card-system.md §7`): the seed of a first edit and of `Reset card`, the lines a save stores
 * (kept while nothing they depend on changed, re-broken otherwise, never the editor's), and words
 * carried to a fresh layout.
 */

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

const ZONE = { x: 120, y: 800, width: 760, height: 450 };
const PAIRING = pairingFaces("hc_playfair_dmsans");
const FRAUNCES: FontRef = { family: "Fraunces", weight: 700, italic: false };

/** The host's words in Creation Mode: a saved date, a placeholder venue, a prompt-stated host. */
const HOST: CardContent = {
  title: "A Little Wild One",
  invitationLine: "Please join us for a baby shower",
  hosts: "Maya and Tom",
  date: "Saturday, June 6",
  time: "1:00 pm",
  venue: "Venue to be announced",
};
/** The same event's saved words: the date and time only. */
const SAVED: CardContent = {
  title: "A Little Wild One",
  invitationLine: "Please join us for a baby shower",
  date: "Saturday, June 6",
  time: "1:00 pm",
  hosts: null,
  venue: null,
};

function generatedFor(content: CardContent): TextBox[] {
  return layoutCard({
    zone: ZONE,
    proportion: "5:7",
    pairing: PAIRING,
    content,
    ink: "#3A2A1E",
    metrics,
  }).boxes;
}

const strip = (box: TextBox): EditorTextBox => {
  const { lines: _lines, ...rest } = box;
  void _lines;
  if (box.source.kind === "wording" && box.source.slot === "title") {
    const { text: _text, ...noText } = rest;
    void _text;
    return noText;
  }
  return rest;
};

describe("seedBoxes", () => {
  it("is the generated layout as the host saw it, with a box for every fact slot", () => {
    const generated = generatedFor(HOST);
    const seed = seedBoxes(generated, SAVED, metrics);
    expect(seed.map((b) => b.id)).toEqual(generated.map((b) => b.id));
    for (const slot of FACT_SLOT_IDS) {
      expect(
        seed.some((b) => b.source.kind === "fact" && b.source.slot === slot),
        slot,
      ).toBe(true);
    }
    // Positions, sizes and ink exactly as Creation Mode drew them.
    const placed = (b: TextBox) => ({ ...b, lines: [], z: 0 });
    seed.forEach((box, i) => {
      expect(placed(box)).toEqual(placed(generated[i]));
    });
  });

  it("stores lines for saved words only: never a placeholder or a prompt-stated value", () => {
    const seed = seedBoxes(generatedFor(HOST), SAVED, metrics);
    const byId = (id: string) => seed.find((b) => b.id === id)!;
    // Saved: the lines the host saw.
    expect(byId("date").lines).toEqual(generatedFor(HOST).find((b) => b.id === "date")!.lines);
    expect(byId("title").lines.join(" ")).toBe("A Little Wild One");
    // Unsaved: nothing for guests, whatever Creation Mode showed.
    expect(byId("venue").lines).toEqual([]);
    expect(byId("hosts").lines).toEqual([]);
    expect(byId("babyName").lines).toEqual([]);
  });

  it("has no text background: the host adds one in the editor", () => {
    for (const box of seedBoxes(generatedFor(HOST), SAVED, metrics)) {
      expect(box).not.toHaveProperty("background");
    }
  });

  it("is deterministic, so a reset re-applies exactly the first edit's seed", () => {
    const a = seedBoxes(generatedFor(HOST), SAVED, metrics);
    const b = seedBoxes(generatedFor(HOST), SAVED, metrics);
    expect(a).toEqual(b);
  });
});

describe("boxesToStore", () => {
  const previous = () => seedBoxes(generatedFor(HOST), SAVED, metrics);
  const save = (incoming: EditorTextBox[], saved: CardContent = SAVED, prev = previous()) =>
    boxesToStore({ previous: prev, incoming, saved, metrics });

  it("keeps every line of an unchanged card exactly", () => {
    const prev = previous();
    const result = save(prev.map(strip), SAVED, prev);
    expect(result).toEqual({ ok: true, boxes: prev, rebroken: [] });
  });

  it("keeps a moved, rotated, recoloured, realigned or restacked box's lines", () => {
    const prev = previous();
    const incoming = prev.map(strip).map((b) =>
      b.id === "date"
        ? {
            ...b,
            x: b.x + 40,
            y: b.y - 300,
            rotation: 15,
            color: "#FF00AA",
            align: "left" as const,
            z: 40,
            lineHeight: 2,
          }
        : b,
    );
    const result = save(incoming, SAVED, prev);
    expect(result.ok && result.rebroken).toEqual([]);
    expect(result.ok && result.boxes.find((b) => b.id === "date")!.lines).toEqual(
      prev.find((b) => b.id === "date")!.lines,
    );
  });

  it("stores a text background the host chose, keeps the lines, and removes one left out", () => {
    const prev = previous();
    const background = { style: "backdrop" as const, color: "#FFFFFF", opacity: 0.65, padding: 30 };
    const withBackground = save(
      prev.map(strip).map((b) => (b.id === "title" ? { ...b, background } : b)),
      SAVED,
      prev,
    );
    expect(withBackground.ok && withBackground.rebroken).toEqual([]);
    if (!withBackground.ok) return;
    const title = withBackground.boxes.find((b) => b.id === "title")!;
    expect(title.background).toEqual(background);
    expect(title.lines).toEqual(prev.find((b) => b.id === "title")!.lines);
    for (const box of withBackground.boxes) {
      if (box.id !== "title") expect(box).not.toHaveProperty("background");
    }

    // Changing only the background never re-breaks; sending the box without it removes it.
    const stored = withBackground.boxes;
    const changed = save(
      stored
        .map(strip)
        .map((b) =>
          b.id === "title"
            ? { ...b, background: { ...background, style: "highlight" as const } }
            : b,
        ),
      SAVED,
      stored,
    );
    expect(changed.ok && changed.rebroken).toEqual([]);
    expect(changed.ok && changed.boxes.find((b) => b.id === "title")!.background?.style).toBe(
      "highlight",
    );
    const removed = save(
      stored.map(strip).map((b) => {
        const { background: _bg, ...rest } = b;
        void _bg;
        return rest;
      }),
      SAVED,
      stored,
    );
    expect(removed).toEqual({ ok: true, boxes: prev, rebroken: [] });
  });

  it("re-breaks a box whose width, font, size, spacing or case changed, and only it", () => {
    const prev = previous();
    const changes: Partial<EditorTextBox>[] = [
      { width: 180 },
      { font: FRAUNCES },
      { size: 60 },
      { letterSpacing: 0.4 },
      { textCase: "none" },
    ];
    for (const change of changes) {
      const incoming = prev.map(strip).map((b) => (b.id === "date" ? { ...b, ...change } : b));
      const result = save(incoming, SAVED, prev);
      expect(result.ok, JSON.stringify(change)).toBe(true);
      if (!result.ok) continue;
      expect(result.rebroken, JSON.stringify(change)).toEqual(["date"]);
      const date = result.boxes.find((b) => b.id === "date")!;
      expect(date.lines).toEqual(breakBoxText("Saturday, June 6", date, metrics).lines);
    }
  });

  it("re-breaks an added box or the invitation line whose words changed", () => {
    const prev = [
      ...previous(),
      {
        ...previous()[0],
        id: "c1",
        source: { kind: "custom" as const },
        text: "Bring a book",
        lines: ["Bring a book"],
      },
    ];
    const incoming = prev
      .map(strip)
      .map((b) =>
        b.id === "c1"
          ? { ...b, text: "Bring a book instead of a card, please" }
          : b.id === "invitationLine"
            ? { ...b, text: "Come and celebrate Juniper with us" }
            : b,
      );
    const result = save(incoming, SAVED, prev);
    expect(result.ok && result.rebroken.sort()).toEqual(["c1", "invitationLine"]);
    const c1 = result.ok ? result.boxes.find((b) => b.id === "c1")! : null;
    expect(c1!.lines.join(" ")).toBe("Bring a book instead of a card, please");
  });

  it("never stores the editor's lines: a new box is broken by the server", () => {
    const added = {
      ...strip(previous()[1]),
      id: "c2",
      source: { kind: "custom" as const },
      text: "Dinner to follow\nin the garden",
      lines: ["FORGED"],
    } as EditorTextBox;
    const result = save([...previous().map(strip), added]);
    const box = result.ok ? result.boxes.find((b) => b.id === "c2")! : null;
    expect(box!.lines).toEqual(
      breakBoxText("Dinner to follow\nin the garden", box!, metrics).lines,
    );
    expect(box!.lines).not.toContain("FORGED");
  });

  it("re-breaks the title box for a new title, and stores no words on it", () => {
    const result = save(previous().map(strip), { ...SAVED, title: "Our Wild Little Garden Party" });
    const title = result.ok ? result.boxes.find((b) => b.id === "title")! : null;
    expect(result.ok && result.rebroken).toEqual(["title"]);
    expect(title!.lines.join(" ")).toBe("Our Wild Little Garden Party");
    expect(title).not.toHaveProperty("text");
  });

  it("breaks a fact box from the event's saved words, never from the box", () => {
    const incoming = previous()
      .map(strip)
      .map((b) => (b.id === "venue" ? ({ ...b, text: "My own venue words" } as EditorTextBox) : b));
    const saved = { ...SAVED, venue: "The Willow House" };
    const result = save(incoming, saved);
    const venue = result.ok ? result.boxes.find((b) => b.id === "venue")! : null;
    expect(venue!.lines.join(" ")).toBe("The Willow House");
  });

  it("does not keep lines from a box that changed source under the same id", () => {
    const prev = previous();
    const incoming = prev
      .map(strip)
      .map((b) =>
        b.id === "hosts" ? ({ ...b, source: { kind: "fact", slot: "date" } } as EditorTextBox) : b,
      );
    const result = save(incoming, SAVED, prev);
    expect(result.ok && result.rebroken).toEqual(["hosts"]);
    expect(result.ok && result.boxes.find((b) => b.id === "hosts")!.lines.join(" ")).toBe(
      "Saturday, June 6",
    );
  });

  it("keeps a deleted box deleted: only the boxes sent are stored", () => {
    const incoming = previous()
      .map(strip)
      .filter((b) => b.id !== "date");
    const result = save(incoming);
    expect(result.ok && result.boxes.map((b) => b.id)).not.toContain("date");
  });

  it("refuses words a box's face cannot draw, rather than storing lines a browser would draw differently", () => {
    const added = {
      ...strip(previous()[1]),
      id: "c3",
      source: { kind: "custom" as const },
      text: "Party \u{1F388}",
    } as EditorTextBox;
    const result = save([...previous().map(strip), added]);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { [`boxes.${previous().length}.text`]: expect.stringContaining("\u{1F388}") },
    });
    expect(
      missingCharacters({ font: PAIRING.body, textCase: "none" }, "Party \u{1F388}", metrics),
    ).toEqual(["\u{1F388}"]);
  });
});

describe("carriedBoxesFrom", () => {
  const card = () => ({
    zone: { x: 120, y: 540, width: 760, height: 300 },
    proportion: "1:1" as const,
    pairing: pairingFaces("grotesk_archivo_inter"),
    ink: "#F4EEE2",
    metrics,
  });

  /** The card being switched from, as the host left it. */
  function from(): TextBox[] {
    return seedBoxes(generatedFor(HOST), SAVED, metrics)
      .map((box) => {
        if (box.id === "title")
          return { ...box, font: FRAUNCES, x: 10, rotation: -8, color: "#000000" };
        if (box.id === "invitationLine")
          return { ...box, text: "Come celebrate with us", font: FRAUNCES };
        return box;
      })
      .concat({
        ...seedBoxes(generatedFor(HOST), SAVED, metrics)[1],
        id: "c1",
        source: { kind: "custom" },
        text: "Bring a book",
        font: FRAUNCES,
      });
  }

  it("keeps the host's words and fonts and takes positions, rotation and colour from the new card", () => {
    const carried = carriedBoxesFrom({ from: from(), host: HOST, saved: SAVED, card: card() });
    const byId = (id: string) => carried.boxes.find((b) => b.id === id)!;
    expect(byId("title").font).toEqual(FRAUNCES);
    expect(byId("title").rotation).toBe(0);
    expect(byId("title").color).toBe("#F4EEE2");
    expect(byId("invitationLine").text).toBe("Come celebrate with us");
    expect(byId("c1")).toMatchObject({ text: "Bring a book", font: FRAUNCES, color: "#F4EEE2" });
    expect(byId("date").font).toEqual(pairingFaces("grotesk_archivo_inter").body);
  });

  it("keeps the text background the host chose on the words it carries", () => {
    const background = { style: "box" as const, color: "#FFFFFF", opacity: 0.8, padding: 20 };
    const source = from().map((b) =>
      b.id === "title" || b.id === "c1" || b.id === "date" ? { ...b, background } : b,
    );
    const carried = carriedBoxesFrom({ from: source, host: HOST, saved: SAVED, card: card() });
    const byId = (id: string) => carried.boxes.find((b) => b.id === id)!;
    // Its colour comes from the new card: white behind the new light ink would hide the words.
    expect(byId("title").background).toEqual({ ...background, color: "#1B1B1F" });
    expect(byId("c1").background).toEqual({ ...background, color: "#1B1B1F" });
    expect(byId("date")).not.toHaveProperty("background");
  });

  it("stores the linked boxes as a seed does: saved words only", () => {
    const carried = carriedBoxesFrom({ from: from(), host: HOST, saved: SAVED, card: card() });
    const byId = (id: string) => carried.boxes.find((b) => b.id === id)!;
    expect(byId("venue").lines).toEqual([]);
    expect(byId("hosts").lines).toEqual([]);
    expect(byId("date").lines.join(" ")).toBe("Saturday, June 6");
    // Every fact slot still has its box, for the fact to appear where the host leaves it.
    for (const slot of FACT_SLOT_IDS) {
      expect(carried.boxes.some((b) => b.source.kind === "fact" && b.source.slot === slot)).toBe(
        true,
      );
    }
  });

  it("is deterministic", () => {
    const a = carriedBoxesFrom({ from: from(), host: HOST, saved: SAVED, card: card() });
    const b = carriedBoxesFrom({ from: from(), host: HOST, saved: SAVED, card: card() });
    expect(a).toEqual(b);
  });

  it("starts the carried words where the new artwork's stored shift puts them (card_compiler_v7)", () => {
    const plain = carriedBoxesFrom({ from: from(), host: HOST, saved: SAVED, card: card() });
    const shift = { heading: -40, details: 20 };
    const placed = carriedBoxesFrom({
      from: from(),
      host: HOST,
      saved: SAVED,
      card: card(),
      placement: { shape: "square", shift },
    });
    expect(placed.boxes).toHaveLength(plain.boxes.length);
    for (const [i, box] of plain.boxes.entries()) {
      // The heading is the title and the invitation line; facts and added text are the details.
      const dy = box.id === "title" || box.id === "invitationLine" ? -40 : 20;
      expect(placed.boxes[i], box.id).toEqual({
        ...box,
        y: Math.round((box.y + dy) * 1000) / 1000,
      });
    }
  });

  it("keeps the carried words at the layout's position when the shift would take them out of the text-safe area", () => {
    const plain = carriedBoxesFrom({ from: from(), host: HOST, saved: SAVED, card: card() });
    // The square's text-safe area ends 70 units from its bottom: 400 down leaves it.
    const placed = carriedBoxesFrom({
      from: from(),
      host: HOST,
      saved: SAVED,
      card: card(),
      placement: { shape: "square", shift: { heading: 0, details: 400 } },
    });
    expect(placed).toEqual(plain);
  });
});
