/**
 * The composition brief's job is to be *narrow*, so these tests are mostly about absence.
 *
 * A test that only checks the four carried fields arrive would pass just as happily if the
 * projection also forwarded the host's raw words, so each case below asserts a property that
 * fails when the boundary widens.
 */
import { describe, expect, it } from "vitest";

import {
  BRIEF_DISPOSITION,
  CARRIED_TO_COMPOSITION,
  WITHHELD_FROM_COMPOSITION,
  compositionBrief,
} from "./brief";
import { eventIdentitySchema, type EventIdentity } from "@/lib/ai/event-identity/contract";
import { PREMISE_FIXTURE_IDENTITY } from "../../../../tests/fixtures/concept-premise";

const identity: EventIdentity = PREMISE_FIXTURE_IDENTITY;

describe("the disposition map partitions the creative brief", () => {
  it("decides every field of EventIdentity, with nothing left over", () => {
    // `eventIdentitySchema` is strict, so its key set is the contract's key set exactly.
    const contractKeys = Object.keys(eventIdentitySchema.shape).sort();
    const decided = Object.keys(BRIEF_DISPOSITION).sort();
    expect(decided).toEqual(contractKeys);
  });

  it("carries and withholds disjointly, and together covers the contract", () => {
    const carried = new Set(CARRIED_TO_COMPOSITION);
    const withheld = new Set(WITHHELD_FROM_COMPOSITION);
    for (const key of carried) expect(withheld.has(key)).toBe(false);
    expect(carried.size + withheld.size).toBe(Object.keys(BRIEF_DISPOSITION).length);
  });

  it("carries exactly what model-contracts §6.1 scopes: brief, constraints, motif/texture", () => {
    expect([...CARRIED_TO_COMPOSITION].sort()).toEqual([
      "creativeDirection",
      "hostConstraints",
      "textureDirection",
      "visualMotifs",
    ]);
  });
});

describe("host constraints reach the stage that authors structure", () => {
  it("carries every constraint, in order and verbatim", () => {
    const withConstraints = {
      ...identity,
      hostConstraints: [
        "No religious elements of any kind.",
        "The ceremony and the reception must read as separate parts of the day.",
        "Do not put my mother's name on the front.",
      ],
    };
    const brief = compositionBrief(withConstraints);
    // Verbatim and complete: a paraphrase is an interpretation this stage may not make, and a
    // dropped constraint is the failure this whole module exists to prevent.
    expect(brief.hostConstraints).toEqual(withConstraints.hostConstraints);
  });

  it("does not filter constraints by whether they look structural", () => {
    // "Step-free access" has no CompositionTree subject, and is carried anyway. Deciding
    // applicability from the text is the classifier this design deliberately refuses to build:
    // the cost of carrying one too many is tokens, the cost of dropping one is the host's law.
    const brief = compositionBrief({
      ...identity,
      hostConstraints: ["The eldest uncle uses a heavy motorized wheelchair; step-free access."],
    });
    expect(brief.hostConstraints).toHaveLength(1);
  });

  it("carries an empty list as an empty list, never as absent", () => {
    const brief = compositionBrief({ ...identity, hostConstraints: [] });
    expect(brief.hostConstraints).toEqual([]);
  });

  it("copies rather than aliasing, so a later mutation cannot reach the identity", () => {
    const source = { ...identity, hostConstraints: ["No live animals."] };
    const brief = compositionBrief(source);
    expect(brief.hostConstraints).not.toBe(source.hostConstraints);
    expect(brief.visualMotifs).not.toBe(source.visualMotifs);
  });
});

describe("advisory guidance cannot become host law at this stage", () => {
  it("has no field for creativeGuidance at all", () => {
    const brief = compositionBrief({
      ...identity,
      creativeGuidance: ["Consider a monogram on the invitation."],
    });
    expect(Object.keys(brief)).not.toContain("creativeGuidance");
    expect(BRIEF_DISPOSITION.creativeGuidance).toBe("withheld");
  });

  it("does not smuggle guidance into any carried field", () => {
    const marker = "GUIDANCE_MARKER_SHOULD_NOT_APPEAR";
    const brief = compositionBrief({ ...identity, creativeGuidance: [marker] });
    expect(JSON.stringify(brief)).not.toContain(marker);
  });
});

describe("the raw host prompt never arrives", () => {
  it("exposes no field capable of carrying it", () => {
    // Interpretation happens once and is persisted (`product-doctrine.md §4`). The identity
    // contract itself holds no prompt field, and the projection adds none: the brief's key set is
    // closed, so there is nowhere for the host's own words to travel.
    const brief = compositionBrief(identity);
    expect(Object.keys(brief).sort()).toEqual([
      "creativeDirection",
      "hostConstraints",
      "textureDirection",
      "visualMotifs",
    ]);
  });

  it("carries no event content, guest data, registry contents or private code", () => {
    // `model-contracts.md §6.1` prohibits all of these outright. None is a field of the creative
    // brief in the first place, and this pins that the projection did not acquire one.
    const brief = compositionBrief(identity);
    const forbidden = ["guest", "rsvpParty", "accessCode", "registryItems", "honoreeName"];
    for (const key of forbidden) expect(brief).not.toHaveProperty(key);
  });
});

describe("what upstream already resolved is not re-litigated here", () => {
  it("withholds palette, typography and tone, which DesignIntent carries as decisions", () => {
    for (const key of [
      "paletteIntent",
      "tonalIntent",
      "toneKeywords",
      "typographyDirection",
      "compatibleFamilies",
    ] as const) {
      expect(BRIEF_DISPOSITION[key]).toBe("withheld");
    }
    expect(compositionBrief(identity)).not.toHaveProperty("paletteIntent");
  });

  it("withholds copyTone, because a tree is enums and free text is a schema failure", () => {
    expect(BRIEF_DISPOSITION.copyTone).toBe("withheld");
  });
});
