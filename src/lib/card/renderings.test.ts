import { describe, expect, it } from "vitest";

import {
  CARD_ART_INSPECTION_PROMPT_VERSION,
  CARD_ART_INSPECTION_SCHEMA_VERSION,
  CARD_ART_PROMPT_VERSION,
  CARD_DESIGN_PROMPT_VERSION,
  CARD_DESIGN_SCHEMA_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";

import {
  PEOPLE_FREE_RENDERINGS,
  RENDERING_ART_PROMPT,
  RENDERING_DESCRIPTION,
  RENDERINGS,
  suggestRendering,
} from "./renderings";
import type { Rendering } from "./renderings";

/** The rendering families (owner decisions, 2026-10-04; `docs/card-system.md §2.4`). */
describe("rendering families", () => {
  it("are the nine families, in catalog order", () => {
    expect(RENDERINGS).toEqual([
      "photographic",
      "editorial",
      "rendered-3d",
      "vector",
      "flat-illustration",
      "painterly",
      "line-art",
      "collage",
      "design-led",
    ]);
  });

  it("describe every family to the design call and to the image model", () => {
    expect(Object.keys(RENDERING_DESCRIPTION)).toEqual([...RENDERINGS]);
    expect(Object.keys(RENDERING_ART_PROMPT)).toEqual([...RENDERINGS]);
    for (const r of RENDERINGS) {
      expect(RENDERING_DESCRIPTION[r].length, r).toBeGreaterThan(20);
      expect(RENDERING_ART_PROMPT[r].endsWith("."), r).toBe(true);
    }
    expect(RENDERING_DESCRIPTION.painterly).toBe(
      "Painterly / watercolour: organic hand-painted imagery, translucent colours, soft edges and artistic textures. One valid direction, never the default.",
    );
    expect(RENDERING_ART_PROMPT.editorial).toBe(
      "Cinematic editorial realism: photorealistic and highly art-directed, like a luxury advertising campaign or a styled magazine shoot — considered set design, controlled light and rich materials. Not an illustration. No people, faces, hands or bodies.",
    );
    expect(RENDERING_ART_PROMPT["design-led"]).toBe(
      "Design-led artwork: a repeating pattern, border, geometry or colour blocking carries the picture rather than a depicted scene; no letters, initials or monograms.",
    );
  });

  it("keep people out of photographic, editorial, 3D and collage artwork, in both texts", () => {
    expect(PEOPLE_FREE_RENDERINGS).toEqual(["photographic", "editorial", "rendered-3d", "collage"]);
    for (const r of RENDERINGS) {
      const free = PEOPLE_FREE_RENDERINGS.includes(r);
      expect(RENDERING_DESCRIPTION[r].endsWith(" Never people."), r).toBe(free);
      expect(RENDERING_ART_PROMPT[r].endsWith(" No people, faces, hands or bodies."), r).toBe(free);
    }
  });
});

describe("suggestRendering", () => {
  it("draws uniformly from all nine for an event with no earlier direction", () => {
    expect(suggestRendering(() => 0)).toBe("photographic");
    expect(suggestRendering(() => 0.5)).toBe("flat-illustration");
    expect(suggestRendering(() => 0.999999)).toBe("design-led");
    const drawn = RENDERINGS.map((_, i) => suggestRendering(() => (i + 0.5) / RENDERINGS.length));
    expect(drawn).toEqual([...RENDERINGS]);
  });

  it("excludes the renderings earlier directions used", () => {
    const used: Rendering[] = ["photographic", "painterly", "vector"];
    const pool = RENDERINGS.filter((r) => !used.includes(r));
    const drawn = pool.map((_, i) => suggestRendering(() => (i + 0.5) / pool.length, used));
    expect(drawn).toEqual(pool);
    expect(suggestRendering(() => 0, used)).toBe("editorial");
  });

  it("draws from all nine again once every one has been used", () => {
    expect(suggestRendering(() => 0, [...RENDERINGS])).toBe("photographic");
    expect(suggestRendering(() => 0.999, [...RENDERINGS])).toBe("design-led");
  });

  it("stays in range whatever the random source returns", () => {
    for (const value of [1, 7, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(RENDERINGS).toContain(suggestRendering(() => value));
    }
  });
});

describe("versions (rendering families)", () => {
  it("are bumped for the new prompts and schemas", () => {
    expect(EVENT_IDENTITY_PROMPT_VERSION).toBe("event_identity_v7");
    // The identity schema adds hostConcept (owner decisions, 2026-10-06).
    expect(EVENT_IDENTITY_SCHEMA_VERSION).toBe("event_identity_schema_v6");
    expect(CARD_DESIGN_PROMPT_VERSION).toBe("card_design_v5");
    expect(CARD_DESIGN_SCHEMA_VERSION).toBe("card_design_schema_v3");
    expect(CARD_ART_PROMPT_VERSION).toBe("card_art_v5");
    expect(CARD_ART_INSPECTION_PROMPT_VERSION).toBe("card_art_inspection_v2");
    expect(CARD_ART_INSPECTION_SCHEMA_VERSION).toBe("card_art_inspection_schema_v2");
  });
});
