import { crc32, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  CLEAN_MODERATION,
  fakeProvider,
  TEST_METER,
} from "../../../tests/unit/support/fake-provider";
import type { FakeScript } from "../../../tests/unit/support/fake-provider";

import {
  GenerationDeadlineError,
  GenerationDisabledError,
  ModelOutputError,
  ProviderCallError,
  ProviderRefusalError,
  SpendCeilingError,
} from "@/lib/ai/errors";
import type { CardArt } from "@/lib/ai/provider";
import { assembleArtPrompt, assembleShapeSwitchPrompt, fitsShapes } from "@/lib/card/art-prompt";
import type { CardDesign } from "@/lib/card/design";
import type { Rendering } from "@/lib/card/renderings";
import { MIN_INK_CONTRAST } from "@/lib/card/ink";
import type { CardRect } from "@/lib/card/ink";
import { panelFor, zoneFor } from "@/lib/card/layouts";
import { decodePng, pngChunkTypes } from "@/lib/card/png.server";
import { contrastRatio } from "@/lib/card/color";
import { TYPICAL } from "@/lib/card/test-content";
import { encodePng } from "@/lib/link-preview/test-artwork";

import {
  ARTWORK_LIMITS,
  generatedLineAreas,
  resolveArtworkInk,
  runArtworkStage,
  TEXT_ZONE,
} from "./artwork.server";
import type { ArtworkStageInput } from "./artwork.server";
import { ArtworkProviderRefusalError, GenerationStageError } from "./stage";

/**
 * Stage 3 (`spec.md §7.8`, §7.9; `docs/card-system.md §3`, §4.1, §4.2; `docs/model-contracts.md
 * §7.3`): validation with one regeneration, repaints before a panel within two extra images, ink
 * for every fitted shape, and untagged storage. Synthetic PNGs only.
 */

/* ------------------------------------------------------------------ synthetic artwork */

const W = 1024;
const H5x7 = 1434; // 1434 / 1024 is 0.03% off 7:5, within the 0.1% tolerance

function rgbArt(width: number, height: number, at: (x: number, y: number) => number[]) {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rgb.set(at(x, y), (y * width + x) * 3);
  }
  return encodePng(width, height, rgb);
}

const art = (bytes: Uint8Array): CardArt => ({ mimeType: "image/png", bytes });

/** Decoded pixels equal, compared as buffers (a deep equality over millions of bytes is slow). */
const samePixels = (a: Uint8Array, b: Uint8Array) =>
  Buffer.from(decodePng(a).rgba).equals(Buffer.from(decodePng(b).rgba));

/** Calm cream paper: every zone takes a dark ink without a panel. */
const CLEAN = art(rgbArt(W, H5x7, () => [238, 228, 212]));
const CLEAN_SQUARE = art(rgbArt(W, W, () => [238, 228, 212]));
/** A black-and-white checkerboard: no ink clears 4.5:1 over it, so every zone needs the panel. */
const BUSY = art(rgbArt(W, H5x7, (x, y) => ((x + y) % 2 ? [0, 0, 0] : [255, 255, 255])));
/**
 * Cream paper with a navy shape over `rect` (card units) of a 5:7 artwork. At `INTRUSION` size it
 * is under 4% of the art-top rectangle's text zone — too small a share to reach the zone's dark
 * tail — but a quarter of the area behind the title's first line (`card_compiler_v4`).
 */
function intruding(rect: CardRect): CardArt {
  const px = W / 1000;
  const [top, bottom] = [rect.y * px, (rect.y + rect.height) * px];
  const [left, right] = [rect.x * px, (rect.x + rect.width) * px];
  return art(
    rgbArt(W, H5x7, (x, y) =>
      y >= top && y < bottom && x >= left && x < right ? [27, 42, 74] : [238, 228, 212],
    ),
  );
}
const INTRUSION = { width: 100, height: 120 };

const overlaps = (a: CardRect, b: CardRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const NOT_PNG = art(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
const SQUARE_FOR_PORTRAIT = CLEAN_SQUARE;
const LOW_RESOLUTION = art(rgbArt(500, 700, () => [238, 228, 212]));

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An RGBA PNG whose top-left pixel is half transparent. */
const TRANSLUCENT = (() => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H5x7, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H5x7, 255);
  for (let y = 0; y < H5x7; y += 1) raw[y * (stride + 1)] = 0;
  raw[4] = 128; // row 0's filter byte is at 0; pixel 0's alpha at 1 + 3
  return art(
    new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", new Uint8Array(0)),
      ]),
    ),
  );
})();

/** CLEAN with colour-space and text chunks inserted after IHDR. */
const TAGGED = (() => {
  const bytes = Buffer.from(CLEAN.bytes);
  const afterIhdr = 8 + 25;
  return art(
    new Uint8Array(
      Buffer.concat([
        bytes.subarray(0, afterIhdr),
        chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])),
        chunk("cHRM", Buffer.alloc(32, 1)),
        chunk("sRGB", Uint8Array.of(0)),
        chunk(
          "iCCP",
          Buffer.concat([Buffer.from("p\0\0", "latin1"), deflateSync(Buffer.alloc(8))]),
        ),
        chunk("tEXt", Buffer.from("Software\0painter", "latin1")),
        bytes.subarray(afterIhdr),
      ]),
    ),
  );
})();

/* ------------------------------------------------------------------ design and helpers */

const DESIGN: Pick<CardDesign, "artBrief" | "artMode" | "layout" | "typography"> = {
  layout: "art-top",
  artMode: "illustration",
  typography: { primary: "hc_playfair_dmsans", alternates: [] },
  artBrief: {
    subject: "a lemon branch heavy with fruit and blossom",
    rendering: "painterly",
    aesthetic: "romantic",
    medium: "soft gouache illustration",
    mood: "sunlit and calm",
    palette: { description: "lemon, olive and ivory", colors: ["#F2D35B", "#7A8450", "#FBF7EE"] },
    texture: "cream laid paper",
    avoid: ["kitsch"],
  },
};

/** The words on the card: an ordinary baby shower's (`TYPICAL`). */
const CONTENT = TYPICAL;

const INPUT: ArtworkStageInput = { design: DESIGN, shape: "rectangle", content: CONTENT };

/** A stage over `input`, with `CONTENT` unless it names its own. */
function stage(
  script: FakeScript,
  input: Omit<ArtworkStageInput, "content"> & Partial<ArtworkStageInput> = INPUT,
) {
  const fake = fakeProvider(script);
  const run = () =>
    runArtworkStage({ provider: fake.provider, meter: TEST_METER }, { content: CONTENT, ...input });
  return { fake, run };
}

const flagged = { flagged: true, categories: ["violence"] };
const inspected = (
  found: Partial<Record<"hasText" | "hasLogoOrBrandMark" | "isMockup" | "hasPerson", boolean>>,
) => ({
  hasText: false,
  textDescription: found.hasText ? "letters in the lower left" : "",
  hasLogoOrBrandMark: false,
  isMockup: false,
  hasPerson: false,
  description: "artwork",
  ...found,
});
const outputError = () =>
  new ModelOutputError("unparseable", ["no image in the response"], "{}", {});
const refusal = () =>
  new ProviderRefusalError("refused", {
    code: "provider_refusal",
    status: 400,
    billing: "unknown",
  });
const http500 = () => new ProviderCallError("HTTP 500", { code: "http_500", billing: "none" });

/* ------------------------------------------------------------------ tests */

describe("the art request", () => {
  it("paints from the code-assembled prompt for the shape, metered, with no reference", async () => {
    const { fake, run } = stage({ art: [CLEAN] });
    const result = await run();
    expect(fake.calls.art).toEqual([
      { artBrief: DESIGN.artBrief, artMode: "illustration", layout: "art-top", shape: "rectangle" },
    ]);
    expect(result.artPrompt).toBe(assembleArtPrompt({ ...DESIGN, shape: "rectangle" }));
    expect(fake.calls.meters.every((m) => m === TEST_METER)).toBe(true);
    // Moderation, then inspection, of the artwork itself.
    expect(fake.calls.moderation).toEqual([CLEAN]);
    expect(fake.calls.inspection).toEqual([CLEAN]);
  });

  it("sends the design's own artwork as the reference on a shape switch", async () => {
    const reference = CLEAN;
    const { fake, run } = stage(
      { art: [CLEAN_SQUARE] },
      { design: DESIGN, shape: "square", reference },
    );
    const result = await run();
    expect(fake.calls.art[0]).toMatchObject({ shape: "square", reference });
    expect(result.artPrompt).toBe(
      assembleShapeSwitchPrompt({ ...DESIGN, shape: "rectangle" }, "square"),
    );
    expect(result.proportion).toBe("1:1");
  });

  it("refuses a shape the layout does not support before any call", async () => {
    const { fake, run } = stage({ art: [CLEAN] }, { design: DESIGN, shape: "circle" });
    await expect(run()).rejects.toThrow(/does not support shape circle/);
    expect(fake.calls.meters).toEqual([]);
  });
});

describe("validation: one regeneration, then a visible failure", () => {
  const cases: [string, FakeScript, string][] = [
    ["not an allowed type", { art: [NOT_PNG, CLEAN] }, "type"],
    [
      "the wrong mime type",
      { art: [{ mimeType: "image/webp", bytes: CLEAN.bytes }, CLEAN] },
      "type",
    ],
    ["the wrong proportion", { art: [SQUARE_FOR_PORTRAIT, CLEAN] }, "proportion"],
    ["too small", { art: [LOW_RESOLUTION, CLEAN] }, "resolution"],
    ["not opaque", { art: [TRANSLUCENT, CLEAN] }, "transparent"],
    ["no image in the response", { art: [outputError(), CLEAN] }, "output"],
    ["flagged by moderation", { art: [CLEAN, CLEAN], moderation: [flagged] }, "moderation"],
    ["text found", { art: [CLEAN, CLEAN], inspection: [inspected({ hasText: true })] }, "text"],
    [
      "a logo found",
      { art: [CLEAN, CLEAN], inspection: [inspected({ hasLogoOrBrandMark: true })] },
      "logo",
    ],
    ["a mockup", { art: [CLEAN, CLEAN], inspection: [inspected({ isMockup: true })] }, "mockup"],
    ["an inspection that fails", { art: [CLEAN, CLEAN], inspection: [http500()] }, "check_failed"],
  ];

  it.each(cases)("regenerates once when the artwork is %s", async (_, script, reason) => {
    const { fake, run } = stage(script);
    const result = await run();
    expect(fake.calls.art).toHaveLength(2);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 2,
      keptImage: 2,
      artRegenerated: reason,
      artRepaints: 0,
    });
    expect(result.telemetry.validationFailures).toEqual([
      expect.objectContaining({ image: 1, reasons: [reason] }),
    ]);
  });

  it("fails visibly when the regeneration fails validation too, with no third image", async () => {
    const { fake, run } = stage({
      art: [CLEAN, NOT_PNG, CLEAN],
      inspection: [inspected({ hasText: true })],
    });
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationStageError);
    expect(error).toMatchObject({ stage: "artwork", code: "artwork_invalid" });
    expect((error as Error).message).toContain("text, type");
    expect(fake.calls.art).toHaveLength(2);
  });

  it("skips the paid inspection when moderation flags the artwork", async () => {
    const { fake, run } = stage({ art: [CLEAN, CLEAN], moderation: [flagged] });
    const result = await run();
    expect(fake.calls.inspection).toEqual([CLEAN]);
    expect(result.telemetry.validationFailures[0].detail).toBe("violence");
  });

  it("records every inspection finding", async () => {
    const { run } = stage({
      art: [CLEAN, CLEAN],
      inspection: [inspected({ hasText: true, hasLogoOrBrandMark: true, isMockup: true })],
    });
    const result = await run();
    expect(result.telemetry.validationFailures[0]).toEqual({
      image: 1,
      reasons: ["text", "logo", "mockup"],
      detail: "letters in the lower left",
    });
  });

  describe("a person in the artwork (owner decision, 2026-10-04)", () => {
    const rendered = (rendering: Rendering): ArtworkStageInput => ({
      ...INPUT,
      design: { ...DESIGN, artBrief: { ...DESIGN.artBrief, rendering } },
    });

    it.each(["photographic", "editorial", "rendered-3d", "collage"] as const)(
      "regenerates once when %s artwork shows a person",
      async (rendering) => {
        const { fake, run } = stage(
          { art: [CLEAN, CLEAN], inspection: [inspected({ hasPerson: true })] },
          rendered(rendering),
        );
        const result = await run();
        expect(fake.calls.art).toHaveLength(2);
        expect(result.telemetry).toMatchObject({
          imagesRequested: 2,
          keptImage: 2,
          artRegenerated: "person",
        });
        expect(result.telemetry.validationFailures).toEqual([{ image: 1, reasons: ["person"] }]);
      },
    );

    it("fails visibly when the regeneration shows a person too", async () => {
      const { fake, run } = stage(
        {
          art: [CLEAN, CLEAN],
          inspection: [inspected({ hasPerson: true }), inspected({ hasPerson: true })],
        },
        rendered("photographic"),
      );
      await expect(run()).rejects.toMatchObject({ stage: "artwork", code: "artwork_invalid" });
      expect(fake.calls.art).toHaveLength(2);
    });

    it.each(["vector", "flat-illustration", "painterly", "line-art", "design-led"] as const)(
      "accepts a person in %s artwork",
      async (rendering) => {
        const { fake, run } = stage(
          { art: [CLEAN], inspection: [inspected({ hasPerson: true })] },
          rendered(rendering),
        );
        const result = await run();
        expect(fake.calls.art).toHaveLength(1);
        expect(result.telemetry).toMatchObject({ artRegenerated: null, validationFailures: [] });
      },
    );

    it("drops a repaint that shows a person in photographic artwork", async () => {
      const { run } = stage(
        {
          art: [BUSY, CLEAN, CLEAN],
          inspection: [inspected({}), inspected({ hasPerson: true }), inspected({})],
        },
        rendered("photographic"),
      );
      const result = await run();
      expect(result.telemetry).toMatchObject({ imagesRequested: 3, keptImage: 3, artRepaints: 2 });
      expect(result.telemetry.validationFailures).toEqual([{ image: 2, reasons: ["person"] }]);
    });
  });

  it("reports a provider refusal as its own error, for a provider-refusal design re-prompt", async () => {
    const { fake, run } = stage({ art: [refusal(), CLEAN] });
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArtworkProviderRefusalError);
    expect(error).toMatchObject({ code: "provider_refusal", imagesRequested: 1 });
    expect(fake.calls.art).toHaveLength(1);
  });

  it("reports a refusal of the regeneration the same way", async () => {
    const { run } = stage({ art: [NOT_PNG, refusal()] });
    await expect(run()).rejects.toMatchObject({ code: "provider_refusal", imagesRequested: 2 });
  });

  describe("after a provider refusal (spec.md §7.6): the re-prompted design's artwork", () => {
    const AFTER: ArtworkStageInput = { ...INPUT, afterRefusal: { imagesRequested: 1 } };

    it("is the refusal's regeneration, numbered after the refused image", async () => {
      const result = await stage({ art: [CLEAN] }, AFTER).run();
      expect(result.telemetry).toMatchObject({
        imagesRequested: 2,
        keptImage: 2,
        artRegenerated: "provider-refusal",
        artRepaints: 0,
      });
    });

    it("fails visibly on a failed validation, with no second regeneration", async () => {
      const { fake, run } = stage({ art: [NOT_PNG, CLEAN] }, AFTER);
      await expect(run()).rejects.toMatchObject({ stage: "artwork", code: "artwork_invalid" });
      expect(fake.calls.art).toHaveLength(1);
    });

    it("repaints within what is left of the same budget", async () => {
      const { fake, run } = stage({ art: [BUSY, BUSY, BUSY] }, AFTER);
      const result = await run();
      expect(fake.calls.art).toHaveLength(2);
      expect(result.telemetry).toMatchObject({ imagesRequested: 3, keptImage: 2, artRepaints: 1 });
    });

    it("reports a second refusal for the orchestration to fail visibly", async () => {
      await expect(stage({ art: [refusal()] }, AFTER).run()).rejects.toMatchObject({
        code: "provider_refusal",
        imagesRequested: 2,
      });
    });

    it("refuses a budget already spent, before any call", async () => {
      const { fake, run } = stage(
        { art: [CLEAN] },
        { ...INPUT, afterRefusal: { imagesRequested: 1 + ARTWORK_LIMITS.extraImages } },
      );
      await expect(run()).rejects.toThrow(/leave no budget/);
      expect(fake.calls.meters).toEqual([]);
    });
  });

  it("fails visibly on a provider failure, and passes a meter refusal through", async () => {
    await expect(stage({ art: [http500()] }).run()).rejects.toMatchObject({
      stage: "artwork",
      code: "provider_error",
    });
    await expect(stage({ art: [new SpendCeilingError()] }).run()).rejects.toBeInstanceOf(
      SpendCeilingError,
    );
    await expect(
      stage({ art: [CLEAN], moderation: [new SpendCeilingError()] }).run(),
    ).rejects.toBeInstanceOf(SpendCeilingError);
  });
});

describe("repaints before a panel (spec.md §7.8): two extra images per artwork in all", () => {
  it("does not repaint an artwork that needs no panel", async () => {
    const { fake, run } = stage({ art: [CLEAN, CLEAN] });
    const result = await run();
    expect(fake.calls.art).toHaveLength(1);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 1,
      artRegenerated: null,
      artRepaints: 0,
      inkPanels: [],
    });
  });

  it("keeps the first repaint that clears", async () => {
    const { fake, run } = stage({ art: [BUSY, CLEAN, BUSY] });
    const result = await run();
    expect(fake.calls.art).toHaveLength(2);
    // Every repaint is the same request: same brief, same shape.
    expect(fake.calls.art[1]).toEqual(fake.calls.art[0]);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 2,
      keptImage: 2,
      artRegenerated: "panel-repaint",
      artRepaints: 1,
      inkPanels: [],
    });
    expect(samePixels(result.bytes, CLEAN.bytes)).toBe(true);
  });

  describe("artwork under the text, and only under the text (card_compiler_v4)", () => {
    const zone = zoneFor("art-top", "rectangle");
    const areasOf = async () =>
      (await generatedLineAreas("art-top", ["rectangle"], "hc_playfair_dmsans", CONTENT))
        .rectangle!;

    it("repaints artwork behind the first line of the title", async () => {
      const [titleLine] = await areasOf();
      // Centred on the area behind the title's first line, inside the line itself.
      const intrusion = {
        ...INTRUSION,
        x: titleLine.x + (titleLine.width - INTRUSION.width) / 2,
        y: titleLine.y + (titleLine.height - INTRUSION.height) / 2,
      };
      expect(INTRUSION.width * INTRUSION.height).toBeLessThan(0.04 * zone.width * zone.height);
      const { fake, run } = stage({ art: [intruding(intrusion), CLEAN] });
      const result = await run();
      expect(fake.calls.art).toHaveLength(2);
      expect(result.telemetry).toMatchObject({
        imagesRequested: 2,
        keptImage: 2,
        artRegenerated: "panel-repaint",
        artRepaints: 1,
        inkPanels: [],
      });
      expect(samePixels(result.bytes, CLEAN.bytes)).toBe(true);
    });

    it("does not repaint the same intrusion in a part of the zone no line covers", async () => {
      // The zone's top-left corner, beside the title.
      const intrusion = { ...INTRUSION, x: zone.x + 4, y: zone.y + 4 };
      const areas = await areasOf();
      expect(areas.some((a) => overlaps(a, intrusion))).toBe(false);
      expect(overlaps(zone, intrusion)).toBe(true);
      const { fake, run } = stage({ art: [intruding(intrusion), CLEAN] });
      const result = await run();
      expect(fake.calls.art).toHaveLength(1);
      expect(result.telemetry).toMatchObject({
        imagesRequested: 1,
        artRegenerated: null,
        artRepaints: 0,
        inkPanels: [],
      });
    });
  });

  it("keeps the original, with the panel, when no repaint clears", async () => {
    const { fake, run } = stage({ art: [BUSY, BUSY, BUSY, CLEAN] });
    const result = await run();
    expect(fake.calls.art).toHaveLength(1 + ARTWORK_LIMITS.extraImages);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 3,
      keptImage: 1,
      artRegenerated: "panel-repaint",
      artRepaints: 2,
      inkPanels: [
        { shape: "rectangle", zone: TEXT_ZONE },
        { shape: "rounded-rectangle", zone: TEXT_ZONE },
      ],
    });
    expect(samePixels(result.bytes, BUSY.bytes)).toBe(true);
    const zone = result.ink.rectangle?.[TEXT_ZONE];
    expect(zone?.panel).toEqual(panelFor("art-top", "rectangle"));
    expect(zone?.panelColor).toMatch(/^#[0-9A-F]{6}$/);
    // The ink was chosen against the panel's own colour.
    expect(contrastRatio(zone!.ink, zone!.panelColor!)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
  });

  it("drops a repaint that fails validation, which still spends its image", async () => {
    const { run } = stage({
      art: [BUSY, CLEAN, CLEAN],
      inspection: [inspected({}), inspected({ hasText: true })],
    });
    const result = await run();
    expect(result.telemetry).toMatchObject({
      imagesRequested: 3,
      keptImage: 3,
      artRepaints: 2,
      artRegenerated: "panel-repaint",
    });
    expect(result.telemetry.validationFailures).toEqual([
      expect.objectContaining({ image: 2, reasons: ["text"] }),
    ]);
  });

  it("never fails visibly on a repaint: invalid, refused or failed repaints are dropped", async () => {
    const { run } = stage({ art: [BUSY, NOT_PNG, refusal()] });
    const result = await run();
    expect(result.telemetry).toMatchObject({ imagesRequested: 3, keptImage: 1, artRepaints: 2 });
    expect(result.telemetry.validationFailures).toEqual([
      { image: 2, reasons: ["type"] },
      { image: 3, reasons: ["request_failed"], detail: "provider_refusal" },
    ]);
    expect(result.ink.rectangle?.[TEXT_ZONE].panel).toBeDefined();
  });

  it("shares the two extra images with a validation regeneration", async () => {
    const { fake, run } = stage({ art: [NOT_PNG, BUSY, BUSY, CLEAN] });
    const result = await run();
    expect(fake.calls.art).toHaveLength(3);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 3,
      keptImage: 2,
      artRegenerated: "type",
      artRepaints: 1,
    });
    expect(result.ink.rectangle?.[TEXT_ZONE].panel).toBeDefined();
  });

  it("can still clear on the last image after a validation regeneration", async () => {
    const { run } = stage({ art: [outputError(), BUSY, CLEAN] });
    const result = await run();
    expect(result.telemetry).toMatchObject({
      imagesRequested: 3,
      keptImage: 3,
      artRegenerated: "output",
      artRepaints: 1,
      inkPanels: [],
    });
  });

  it("stops repainting when the meter refuses, keeping the valid artwork", async () => {
    // Refused at the image request: no image was made, so none is counted.
    const { fake, run } = stage({ art: [BUSY, new GenerationDisabledError(), CLEAN] });
    const result = await run();
    expect(fake.calls.art).toHaveLength(2);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 1,
      keptImage: 1,
      artRegenerated: null,
      artRepaints: 0,
      repaintsStoppedBy: "disabled",
    });
    expect(result.ink.rectangle?.[TEXT_ZONE].panel).toBeDefined();

    // Refused at the repaint's moderation: the image was made and counts as a repaint.
    const later = stage({
      art: [BUSY, CLEAN, CLEAN],
      moderation: [CLEAN_MODERATION, new SpendCeilingError()],
    });
    const after = await later.run();
    expect(later.fake.calls.art).toHaveLength(2);
    expect(after.telemetry).toMatchObject({
      imagesRequested: 2,
      keptImage: 1,
      artRegenerated: "panel-repaint",
      artRepaints: 1,
      repaintsStoppedBy: "ceiling",
    });
  });

  it("stops repainting at the generation's deadline, keeping the valid artwork", async () => {
    const { fake, run } = stage({ art: [BUSY, new GenerationDeadlineError(), CLEAN] });
    const result = await run();
    expect(fake.calls.art).toHaveLength(2);
    expect(result.telemetry).toMatchObject({
      imagesRequested: 1,
      keptImage: 1,
      artRepaints: 0,
      repaintsStoppedBy: "deadline",
    });
    expect(result.ink.rectangle?.[TEXT_ZONE].panel).toBeDefined();
    // Before a valid artwork exists, the same refusal ends the stage.
    await expect(stage({ art: [new GenerationDeadlineError()] }).run()).rejects.toBeInstanceOf(
      GenerationDeadlineError,
    );
  });

  it("repaints a shape switch with the same reference", async () => {
    const BUSY_SQUARE = art(rgbArt(W, W, (x, y) => ((x + y) % 2 ? [0, 0, 0] : [255, 255, 255])));
    const { fake, run } = stage(
      { art: [BUSY_SQUARE, CLEAN_SQUARE] },
      { design: DESIGN, shape: "square", reference: CLEAN },
    );
    const result = await run();
    expect(fake.calls.art).toHaveLength(2);
    expect(fake.calls.art.every((c) => c.reference === CLEAN)).toBe(true);
    expect(result.telemetry).toMatchObject({ keptImage: 2, artRepaints: 1 });
  });
});

describe("ink for every fitted shape (docs/card-system.md §4.2)", () => {
  it.each([
    ["art-top", "illustration", "rectangle"],
    ["art-top", "illustration", "arch"],
    ["atmosphere", "atmosphere", "oval"],
    ["framed", "framed", "oval"],
  ] as const)("%s / %s on %s", async (layout, artMode, shape) => {
    const { run } = stage({ art: [CLEAN] }, { design: { ...DESIGN, layout, artMode }, shape });
    const result = await run();
    const fits = fitsShapes(artMode, layout, shape);
    expect(result.fitsShapes).toEqual(fits);
    // The persisted check: ink exists for every fitted shape (`card_art_assets.ink ?& fits_shapes`).
    expect(Object.keys(result.ink).sort()).toEqual([...fits].sort());
    for (const s of fits) {
      const zone = result.ink[s]?.[TEXT_ZONE];
      expect(zone?.ink).toMatch(/^#[0-9A-F]{6}$/);
      expect(zone?.panel).toBeUndefined();
      expect(contrastRatio(zone!.ink, "#EEE4D4")).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    }
  });

  it("has all four portrait shapes for atmosphere art and both square shapes on 1:1", async () => {
    const portraitShapes = ["rectangle", "rounded-rectangle", "arch", "oval"] as const;
    const portrait = resolveArtworkInk(
      decodePng(CLEAN.bytes),
      "atmosphere",
      portraitShapes,
      await generatedLineAreas("atmosphere", portraitShapes, "hc_playfair_dmsans", CONTENT),
    );
    expect(Object.keys(portrait)).toHaveLength(4);
    const squareShapes = ["square", "circle"] as const;
    const square = resolveArtworkInk(
      decodePng(CLEAN_SQUARE.bytes),
      "atmosphere",
      squareShapes,
      await generatedLineAreas("atmosphere", squareShapes, "hc_playfair_dmsans", CONTENT),
    );
    expect(Object.keys(square)).toEqual(["square", "circle"]);
  });

  it("lays the text out for every fitted shape, behind which the ink is judged", async () => {
    const shapes = ["rectangle", "rounded-rectangle", "arch", "oval"] as const;
    const areas = await generatedLineAreas("atmosphere", shapes, "hc_playfair_dmsans", CONTENT);
    for (const shape of shapes) {
      const zone = zoneFor("atmosphere", shape);
      const rects = areas[shape];
      // Title (2 lines here or 1), invitation line, hosts, date, time, venue: one area a line.
      expect(rects?.length).toBeGreaterThanOrEqual(6);
      for (const r of rects!) expect(overlaps(zone, r)).toBe(true);
    }
  });

  it("falls back to the whole zone for a shape whose text does not lay out", async () => {
    // Characters the curated faces cannot draw: the layout is refused, never thrown from here.
    const areas = await generatedLineAreas("art-top", ["rectangle"], "hc_playfair_dmsans", {
      ...CONTENT,
      title: "\u{1F388}\u{1F388}",
    });
    expect(areas).toEqual({ rectangle: null });
    const ink = resolveArtworkInk(decodePng(CLEAN.bytes), "art-top", ["rectangle"], areas);
    expect(ink.rectangle?.[TEXT_ZONE]?.panel).toBeUndefined();
  });

  it("refuses to judge a fitted shape it was given no line areas for", () => {
    expect(() =>
      resolveArtworkInk(decodePng(CLEAN.bytes), "art-top", ["rectangle", "arch"], {
        rectangle: null,
      }),
    ).toThrow(/no line areas for arch/);
  });
});

describe("untagged sRGB storage (docs/technology-decisions.md §8.2)", () => {
  it("strips the colour and text chunks from the kept artwork, pixels unchanged", async () => {
    const { run } = stage({ art: [TAGGED] });
    const result = await run();
    expect(pngChunkTypes(TAGGED.bytes)).toEqual(
      expect.arrayContaining(["gAMA", "cHRM", "sRGB", "iCCP", "tEXt"]),
    );
    expect(pngChunkTypes(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(samePixels(result.bytes, TAGGED.bytes)).toBe(true);
    expect(result).toMatchObject({
      mimeType: "image/png",
      width: W,
      height: H5x7,
      proportion: "5:7",
    });
  });
});
