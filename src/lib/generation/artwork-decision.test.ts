import { describe, expect, it } from "vitest";

import { decideArtwork, type ArtworkDecision } from "./artwork-decision";
import type { DesignIntent, MotifId, Ornament } from "@/lib/renderer/design-intent";
import { ORNAMENTS } from "@/lib/ai/design-intent/contract";

/** A direction is only ever varied here in the two fields the rule reads. */
function direction(ornament: Ornament, motifs: readonly MotifId[] = []): DesignIntent {
  return {
    family: "invitation",
    tonalDirection: "light",
    palette: { colors: ["#1A1A1A", "#F5F0E6", "#7A3B2E"], dominant: "#F5F0E6" },
    typographyPairing: "heritage_caslon_karla",
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: "editorial",
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament,
    },
    motifs,
  };
}

describe("artwork is optional, and the direction chooses (spec.md §7.6a #1)", () => {
  it("offers nothing to a direction that declined an ornamental layer", () => {
    const decision = decideArtwork(direction("none", ["botanical"]));
    expect(decision.allowed).toBe(false);
    expect(decision.maxArtwork).toBe(0);
    expect(decision.reason).toBe("ornament_none");
  });

  it("declines even when that direction named a rich vocabulary", () => {
    // ornament: "none" is not outweighed by motifs. The direction said no ornamental layer; a
    // generated image is the largest ornamental layer there is.
    expect(decideArtwork(direction("none", ["botanical", "stripe"])).allowed).toBe(false);
  });

  it("offers artwork to a direction that asked for the widest ornamental budget", () => {
    const decision = decideArtwork(direction("decorative", ["botanical"]));
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("decorative");
  });

  it("offers it to a decorative direction even with no motifs named", () => {
    expect(decideArtwork(direction("decorative", [])).allowed).toBe(true);
  });
});

describe("the two cases doctrine §10 names, told apart", () => {
  // "A sophisticated black-tie concept is often stronger with none; a lemon, teddy, botanical,
  // safari or storybook concept may need one." These are the same ornament budget; what separates
  // them is whether the direction named a visual world.
  const blackTie = direction("restrained", []);
  const botanical = direction("restrained", ["botanical"]);

  it("gives the black-tie concept none", () => {
    const decision = decideArtwork(blackTie);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no_visual_vocabulary");
  });

  it("gives the botanical concept one", () => {
    const decision = decideArtwork(botanical);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("restrained_with_vocabulary");
  });

  it("separates them on the vocabulary alone — every other field is identical", () => {
    expect({ ...blackTie, motifs: botanical.motifs }).toEqual(botanical);
  });
});

describe("the budget follows the direction's stated appetite", () => {
  it("is one piece for a restrained direction, not a field of them", () => {
    expect(decideArtwork(direction("restrained", ["botanical"])).maxArtwork).toBe(1);
  });

  it("is wider for a decorative one", () => {
    expect(decideArtwork(direction("decorative", ["botanical"])).maxArtwork).toBeGreaterThan(
      decideArtwork(direction("restrained", ["botanical"])).maxArtwork,
    );
  });

  it("is always zero when artwork is not allowed, so a cap can never leak past the gate", () => {
    for (const ornament of ORNAMENTS) {
      for (const motifs of [[], ["botanical"]] as readonly MotifId[][]) {
        const decision = decideArtwork(direction(ornament, motifs));
        if (!decision.allowed) expect(decision.maxArtwork).toBe(0);
        else expect(decision.maxArtwork).toBeGreaterThan(0);
      }
    }
  });
});

describe("it is a pure reading of the direction", () => {
  it("is total: every ornament value has a decision, none throws", () => {
    for (const ornament of ORNAMENTS) {
      expect(() => decideArtwork(direction(ornament))).not.toThrow();
    }
    // And the enum really is the whole domain, so this loop cannot silently shrink.
    expect([...ORNAMENTS].sort()).toEqual(["decorative", "none", "restrained"]);
  });

  it("is deterministic: the same direction decides the same way every time", () => {
    const intent = direction("restrained", ["botanical"]);
    const runs: ArtworkDecision[] = Array.from({ length: 5 }, () => decideArtwork(intent));
    for (const run of runs) expect(run).toEqual(runs[0]);
  });

  it("reads only ornament and motifs: no other field moves the answer", () => {
    const base = direction("restrained", ["botanical"]);
    const expected = decideArtwork(base);
    const variants: DesignIntent[] = [
      { ...base, family: "statement" },
      { ...base, tonalDirection: "dark" },
      { ...base, density: "compact" },
      { ...base, typographyPairing: "grotesk_archivo_inter" },
      { ...base, composition: { ...base.composition, hierarchy: "dramatic" } },
      { ...base, composition: { ...base.composition, asymmetry: "strong" } },
    ];
    for (const variant of variants) expect(decideArtwork(variant)).toEqual(expected);
  });
});

describe("a batch may legitimately disagree with itself", () => {
  it("lets one sibling be typography-led while the others carry artwork", () => {
    // spec.md §7.7a gives a batch three creative propositions. One of three declining artwork is
    // the constraint working, not an inconsistency to smooth over.
    const siblings = [
      direction("restrained", []),
      direction("decorative", ["botanical"]),
      direction("restrained", ["stripe"]),
    ];
    expect(siblings.map((s) => decideArtwork(s).allowed)).toEqual([false, true, true]);
  });
});
