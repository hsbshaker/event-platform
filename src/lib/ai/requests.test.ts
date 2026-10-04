import { describe, expect, it } from "vitest";

import cardDesignJson from "../../../docs/model-schemas/card-design.schema.json";

import { CARD_LAYOUT_IDS } from "@/lib/card/layouts";
import { CARD_SHAPES } from "@/lib/card/shapes";
import { TYPOGRAPHY } from "@/lib/card/typography";

import type { EventIdentity } from "./event-identity";
import {
  cardArtRequest,
  cardDesignRequest,
  cardDesignRuntimeCatalog,
  toStrictSchema,
} from "./requests";

/** Request construction (`docs/model-contracts.md §5.2`, §7; ported from Phase 3 validation). */

const IDENTITY = {
  compatibleTypographyCategories: ["oldstyle", "soft_serif"],
} as unknown as EventIdentity;

describe("strict structured-output schemas", () => {
  it("drops the keywords strict mode rejects but keeps field names that look like keywords", () => {
    const schema = {
      $schema: "x",
      $id: "y",
      title: "Doc",
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 5, title: "drop me" },
        tags: { type: "array", uniqueItems: true, items: { type: "string", maxLength: 3 } },
      },
    };
    expect(toStrictSchema(schema)).toEqual({
      type: "object",
      properties: { title: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
    });
  });

  it("sends the committed card-design schema, enums and patterns intact", () => {
    const sent = cardDesignRequest("system", { eventIdentity: IDENTITY, eventFacts: {} }).text
      .format.schema as { properties: Record<string, { enum?: string[] }> };
    expect(sent.properties.layout.enum).toEqual(cardDesignJson.properties.layout.enum);
    expect(sent.properties.shape.enum).toEqual(cardDesignJson.properties.shape.enum);
    expect(JSON.stringify(sent)).toContain("^#[0-9A-Fa-f]{6}$");
    expect(JSON.stringify(sent)).not.toMatch(/maxLength|minLength|uniqueItems|\$schema/);
  });
});

describe("the card-design runtime catalog", () => {
  const catalog = cardDesignRuntimeCatalog(IDENTITY);

  it("lists every shape with its proportion and outline, and every layout with what it supports", () => {
    expect(Object.keys(catalog.shapes)).toEqual([...CARD_SHAPES]);
    expect(catalog.shapes.arch).toBe("5:7, flat bottom, semicircular top");
    expect(catalog.shapes.circle).toBe("1:1, circle inscribed in the canvas");
    expect(Object.keys(catalog.layouts)).toEqual([...CARD_LAYOUT_IDS]);
    expect(catalog.layouts.corners).toEqual({
      purpose: expect.any(String),
      supportedShapes: ["rectangle", "rounded-rectangle", "square"],
      compatibleArtModes: ["illustration", "framed"],
    });
    expect(Object.keys(catalog.artModes)).toEqual([
      "illustration",
      "framed",
      "atmosphere",
      "minimal",
    ]);
    expect(catalog.wordingLimits).toEqual({
      title: { min: 2, max: 40 },
      invitationLine: { min: 8, max: 72 },
    });
  });

  it("offers only the pairings of the identity's compatible categories", () => {
    const ids = Object.keys(catalog.typographyPairings);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(["oldstyle", "soft_serif"]).toContain(
        TYPOGRAPHY[id as keyof typeof TYPOGRAPHY].category,
      );
    }
    expect(catalog.typographyPairings.oldstyle_garamond_worksans).toBe(
      "oldstyle: EB Garamond (display) + Work Sans (body)",
    );
  });

  it("omits the optional inputs when they are absent", () => {
    const data = JSON.parse(
      cardDesignRequest("system", {
        eventIdentity: IDENTITY,
        eventFacts: {},
        previousDirections: [],
      }).input[0].content as string,
    );
    expect(Object.keys(data)).toEqual(["eventIdentity", "eventFacts", "runtimeCatalog"]);
  });
});

describe("artwork requests", () => {
  const brief = {
    subject: "a lemon branch",
    medium: "gouache",
    mood: "calm",
    palette: { description: "lemon", colors: ["#F2D35B", "#7A8450", "#FBF7EE"] },
    texture: "laid paper",
    avoid: [],
  };

  it.each([
    ["rectangle", "1440x2016"],
    ["rounded-rectangle", "1440x2016"],
    ["arch", "1440x2016"],
    ["oval", "1440x2016"],
    ["square", "1440x1440"],
    ["circle", "1440x1440"],
  ] as const)("paints a %s card at %s", (shape, size) => {
    const request = cardArtRequest({
      artBrief: brief,
      artMode: "atmosphere",
      layout: "atmosphere",
      shape,
    });
    expect(request.size).toBe(size);
    expect(request.endpoint).toBe("images/generations");
    expect(request.reference).toBeUndefined();
  });

  it("uses edits, the switch prompt and the reference only on a shape switch", () => {
    const reference = { mimeType: "image/png", bytes: new Uint8Array([1]) };
    const request = cardArtRequest({
      artBrief: brief,
      artMode: "illustration",
      layout: "art-top",
      shape: "oval",
      reference,
    });
    expect(request.endpoint).toBe("images/edits");
    expect(request.reference).toBe(reference);
    expect(request.prompt).toContain("Keep the same subject");
    expect(request.prompt).toContain("the same lemon branch");
  });
});
