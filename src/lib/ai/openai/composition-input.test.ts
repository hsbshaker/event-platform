/**
 * What the Composition request actually puts in front of the model.
 *
 * Two classes of claim are tested here, and they fail differently. A **leak** — the raw host
 * prompt, a guest name, a sibling's DesignIntent — is invisible in output and costs privacy or
 * evidence; `docs/model-contracts.md §6.1` closes with the list, and the only way to know the list
 * holds is to assemble a message and look for the values. A **gate** — a disabled capability whose
 * primitives are still offered — is visible only as a capability violation the compiler repairs on
 * every page, which reads as a model failing rather than as a request that contradicted itself.
 *
 * So the assertions below are about strings on the wire, not about the shape of an object.
 *
 * Acceptance criteria: N/A — test-only. `docs/model-contracts.md §6.1`, `§6.2`;
 * `docs/event-renderer-system.md §2.3`; `spec.md §32 #12`, `#16`, `#17`; `CLAUDE.md §5.1`.
 */
import { describe, expect, it } from "vitest";

import { compositionBrief, WITHHELD_FROM_COMPOSITION } from "@/lib/ai/composition/brief";
import type { CompositionCallInput } from "@/lib/ai/composition/contract";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { Capabilities } from "@/lib/renderer/composition/nodes";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { sample } from "@/lib/renderer/planner/directives";

import {
  ASSEMBLY_TEXT,
  BLOCK_HEADINGS,
  BRIEF_LABELS,
  CAPABILITY_LABELS,
  COMPOSITION_INPUT_ASSEMBLY_VERSION,
  assembleCompositionUserMessage,
} from "./composition-input";

/** A distinctive phrase per channel, so a leak is findable by string rather than by shape. */
const RAW_HOST_PROMPT =
  "its my sons bar mitzvah at the old synagogue on delancey, please make it feel grown up";
const GUEST_NAME = "Marguerite Okonkwo-Vance";
const PRIVATE_CODE = "TRELLIS-4417";
const REGISTRY_ITEM = "Hasami porcelain tumbler, set of four";
const RSVP_ANSWER = "Two adults, one child, no nuts";

/**
 * A brief whose withheld fields carry *sentinel* phrases rather than plausible ones.
 *
 * A withheld field holding an ordinary word cannot be tested for: `restrained` is both a tone
 * keyword and a legal `ornament` value, so looking for it in the assembled message would fail on a
 * perfectly correct request. Each withheld field below therefore holds a phrase that exists
 * nowhere else in the vocabulary, the prompt or the examples, so a hit is a leak.
 */
const IDENTITY: EventIdentity = {
  creativeDirection: "A restrained, tactile winter identity built on materials rather than motifs.",
  toneKeywords: ["sotto-voce-larkspur", "graphite-marram"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ivory"],
    avoidColors: [],
    dominanceNotes: "Ivory should carry the page; quillwort accents only.",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast, in the corvid register.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like, uncoated, nothing glossy",
  typographyDirection: "a quiet oldstyle serif with thistledown counters",
  copyTone: "warm and unfussy, never arch",
  hostConstraints: [
    "No religious imagery anywhere on the site",
    "Keep the ceremony and the reception visibly apart",
    "Do not put my mother's name on the front",
  ],
  creativeGuidance: [
    "A deckled paper edge would suit the invitation half",
    "Consider a monogram set in the same oldstyle serif",
  ],
  inspirationSummary: "No visual inspiration supplied for this bittern brief.",
} as EventIdentity;

/** The withheld fields whose values are free text, and the sentinel phrases they hold. */
const SENTINELS = {
  toneKeywords: IDENTITY.toneKeywords,
  tonalIntent: [IDENTITY.tonalIntent],
  typographyDirection: [IDENTITY.typographyDirection],
  copyTone: [IDENTITY.copyTone],
  inspirationSummary: [IDENTITY.inspirationSummary],
  creativeGuidance: IDENTITY.creativeGuidance,
  paletteIntent: [IDENTITY.paletteIntent.dominanceNotes],
} as const satisfies Partial<Record<keyof EventIdentity, readonly string[]>>;

const FREE_TEXT_WITHHELD = Object.keys(SENTINELS) as (keyof typeof SENTINELS)[];

const CAPABILITIES: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

const INTENT: DesignIntent = {
  family: "editorial",
  tonalDirection: "mid",
  palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
  typographyPairing: "oldstyle_garamond_worksans",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
  },
  motifs: ["linen"],
};

function input(overrides: Partial<CompositionCallInput> = {}): CompositionCallInput {
  return {
    brief: compositionBrief(IDENTITY),
    contentProfile: {
      titleWords: 3,
      titleChars: 22,
      hostsChars: 31,
      venueChars: 18,
      descriptionChars: 0,
      registryCounts: { gift: 4, external: 1, cashfund: 0 },
      provisionalFields: ["venueChars"],
    },
    capabilities: CAPABILITIES,
    designIntent: INTENT,
    directive: sample(11),
    forbiddenTokens: ["staggerTitle", "heroNumeral"],
    seed: 4242,
    ...overrides,
  };
}

/** The text between two block headings, so an assertion can be scoped to one block. */
function between(message: string, from: string, to: string): string {
  const after = message.split(from);
  expect(after).toHaveLength(2);
  const inner = after[1].split(to);
  expect(inner.length).toBeGreaterThan(1);
  return inner[0];
}

/** One of block 2's two lists, read off its own line rather than by regex. */
function capabilityLine(message: string, prefix: string): string {
  const line = message.split("\n").find((text) => text.startsWith(`${prefix}: `));
  expect(line).toBeDefined();
  return line!.slice(prefix.length + 2);
}

describe("the Composition user message", () => {
  it("is the twelve numbered blocks of composition_v1_p2, in the prompt file's order", () => {
    const message = assembleCompositionUserMessage(input());
    // Block 9 is absent without a collision, so eleven of the twelve appear on a first call.
    const expected = [
      BLOCK_HEADINGS.brief,
      BLOCK_HEADINGS.capabilities,
      BLOCK_HEADINGS.designIntent,
      BLOCK_HEADINGS.primitives,
      BLOCK_HEADINGS.rules,
      BLOCK_HEADINGS.directive,
      BLOCK_HEADINGS.allotment,
      BLOCK_HEADINGS.boxes,
      BLOCK_HEADINGS.quality,
      BLOCK_HEADINGS.examples,
      BLOCK_HEADINGS.output,
    ];
    const positions = expected.map((heading) => message.indexOf(heading));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("is a pure function of its input: the same input assembles the same bytes", () => {
    expect(assembleCompositionUserMessage(input())).toBe(assembleCompositionUserMessage(input()));
  });

  it("declares its own assembly version, separate from the prompt and schema versions", () => {
    expect(COMPOSITION_INPUT_ASSEMBLY_VERSION).toBe("composition_input_v2");
  });

  describe("the host's authority", () => {
    it("carries every host constraint verbatim", () => {
      const message = assembleCompositionUserMessage(input());
      for (const constraint of IDENTITY.hostConstraints) {
        expect(message).toContain(constraint);
      }
    });

    it("marks them authoritative, in the label the constraints sit under", () => {
      const message = assembleCompositionUserMessage(input());
      const label = BRIEF_LABELS.hostConstraints;
      expect(label).toContain("AUTHORITATIVE");
      expect(label).toContain("binds you");
      // Not merely present somewhere: the constraints must follow the label that makes them
      // binding, or the model reads them as one more advisory list.
      const labelAt = message.indexOf(label);
      expect(labelAt).toBeGreaterThanOrEqual(0);
      for (const constraint of IDENTITY.hostConstraints) {
        expect(message.indexOf(constraint)).toBeGreaterThan(labelAt);
      }
    });

    it("never carries creativeGuidance, in any form", () => {
      const message = assembleCompositionUserMessage(input());
      for (const guidance of IDENTITY.creativeGuidance) {
        expect(message).not.toContain(guidance);
      }
      // And it cannot: the brief has no field for it, so there is nothing to render. Absence in
      // the type is the guarantee; absence in the bytes is the evidence.
      expect(Object.keys(BRIEF_LABELS)).not.toContain("creativeGuidance");
      expect(WITHHELD_FROM_COMPOSITION).toContain("creativeGuidance");
    });

    it("never carries a withheld identity field's free text", () => {
      const message = assembleCompositionUserMessage(input());
      // Each of these is a sentinel phrase, unique to its field, so a hit is a leak and not a
      // coincidence. A bare vocabulary token would not be: `restrained` is both a tone keyword and
      // a legal `ornament` value, and a substring test on it would fail on a correct message.
      for (const key of FREE_TEXT_WITHHELD) {
        expect(WITHHELD_FROM_COMPOSITION).toContain(key);
        for (const text of SENTINELS[key]) expect(message).not.toContain(text);
      }
    });

    it("renders no label for a withheld field, including the enum-valued ones", () => {
      // `compatibleFamilies` and its two siblings hold vocabulary tokens that appear legitimately
      // elsewhere in the message, so their absence is proven by the label they would need rather
      // than by their values.
      const message = assembleCompositionUserMessage(input());
      for (const label of ["Compatible ", "Palette intent", "Tonal intent", "Copy tone"]) {
        expect(message).not.toContain(label);
      }
      expect(Object.keys(BRIEF_LABELS).sort()).toEqual([
        "creativeDirection",
        "hostConstraints",
        "textureDirection",
        "visualMotifs",
      ]);
    });
  });

  describe("what §6.1 forbids outright", () => {
    it("never carries the raw host prompt", () => {
      const message = assembleCompositionUserMessage(input());
      expect(message).not.toContain(RAW_HOST_PROMPT);
      // The whole prompt is easy to miss by luck, so check a distinctive fragment too.
      expect(message).not.toContain("delancey");
    });

    it("never carries guest data, RSVP answers, registry contents or a private code", () => {
      const message = assembleCompositionUserMessage(input());
      for (const secret of [GUEST_NAME, RSVP_ANSWER, REGISTRY_ITEM, PRIVATE_CODE]) {
        expect(message).not.toContain(secret);
      }
    });

    it("has nowhere to put them: the call input is exactly the nine contract fields", () => {
      // The strings above cannot leak because no field carries them. Pinning the field set is what
      // keeps that true after the next edit — a tenth field is a decision, not an accident.
      expect(Object.keys(input()).sort()).toEqual([
        "brief",
        "capabilities",
        "contentProfile",
        "designIntent",
        "directive",
        "forbiddenTokens",
        "seed",
      ]);
    });

    it("sends the registry as counts, never as items", () => {
      const message = assembleCompositionUserMessage(input());
      expect(message).toContain("gift 4, external 1, cashfund 0");
      expect(message).not.toContain(REGISTRY_ITEM);
    });

    it("sends content as measurements, and says so", () => {
      const message = assembleCompositionUserMessage(input());
      expect(message).toContain("Title, characters: 22");
      expect(message).toContain("Provisional measurements");
      expect(message).toContain("venueChars");
      expect(message).toContain(ASSEMBLY_TEXT.contentPreamble[0]);
    });
  });

  describe("capabilities gate the language itself", () => {
    it("offers no registry primitive and no registry rule when the registry is disabled", () => {
      const off: Capabilities = { ...CAPABILITIES, registry: false, cashFund: false };
      const message = assembleCompositionUserMessage(input({ capabilities: off }));

      expect(message).not.toContain("Registry {");
      expect(message).not.toContain("RegistryItem {");
      expect(message).not.toContain("CashFund {");
      expect(message).not.toContain("one registry section containing Registry exactly once");
      // …and it is told not to reference them, which is the other half of §6.2 block 2.
      expect(capabilityLine(message, ASSEMBLY_TEXT.capabilitiesDisabled)).toContain("registry");
    });

    it("offers them when it is enabled", () => {
      const message = assembleCompositionUserMessage(input());
      expect(message).toContain("Registry {");
      expect(message).toContain("RegistryItem {");
      expect(message).toContain("one registry section containing Registry exactly once");
    });

    it("names every capability on exactly one of the two lists", () => {
      const message = assembleCompositionUserMessage(
        input({ capabilities: { ...CAPABILITIES, hosts: false, time: false } }),
      );
      const enabled = capabilityLine(message, ASSEMBLY_TEXT.capabilitiesEnabled);
      const disabled = capabilityLine(message, ASSEMBLY_TEXT.capabilitiesDisabled);
      expect(enabled).toContain("RSVP");
      expect(disabled).toContain("host names");
      expect(disabled).toContain("time");
      expect(enabled).not.toContain("host names");
      // Every label is on exactly one side; neither a silent omission nor a double listing.
      const named = [...enabled.split(", "), ...disabled.split(", ")].sort();
      expect(named).toEqual(Object.values(CAPABILITY_LABELS).sort());
    });
  });

  describe("one sibling never sees another", () => {
    it("carries no other concept's DesignIntent, directive or allotment", () => {
      const mine = assembleCompositionUserMessage(input());
      const sibling = input({
        designIntent: {
          ...INTENT,
          family: "statement",
          tonalDirection: "dark",
          typographyPairing: "grotesk_archivo_inter",
          density: "spacious",
          composition: { ...INTENT.composition, hierarchy: "monumental", ornament: "decorative" },
          motifs: ["celestial"],
        },
        directive: sample(9_001),
        forbiddenTokens: ["watermark"],
        seed: 777,
      });
      const theirs = assembleCompositionUserMessage(sibling);
      expect(theirs).not.toBe(mine);

      // The sibling's coordinates must be absent from *my DesignIntent block*. Scoped to the
      // block on purpose: `celestial` and `monumental` are vocabulary tokens that appear
      // legitimately in the generated primitive spec, so a whole-message search would be a test of
      // the spec text rather than of what this concept was told.
      const myIntent = between(mine, BLOCK_HEADINGS.designIntent, BLOCK_HEADINGS.primitives);
      expect(myIntent).not.toContain("grotesk_archivo_inter");
      expect(myIntent).not.toContain("hierarchy monumental");
      expect(myIntent).not.toContain("celestial");
      expect(myIntent).toContain("oldstyle_garamond_worksans");

      // …nor its directive sentence, which is the planner's separation between the two.
      const theirDirective = between(
        theirs,
        BLOCK_HEADINGS.directive,
        BLOCK_HEADINGS.allotment,
      ).trim();
      expect(mine).not.toContain(theirDirective);

      // …nor its allotment: a candidate that could see which devices a sibling holds could reason
      // about the sibling's page instead of its own.
      expect(between(mine, BLOCK_HEADINGS.allotment, BLOCK_HEADINGS.boxes)).not.toContain(
        "watermark",
      );
    });

    it("carries no concept premise at all: that channel belongs to the DesignIntent call", () => {
      const message = assembleCompositionUserMessage(input());
      expect(message).not.toContain("CONCEPT_PREMISE");
      expect(message).not.toContain("premise");
    });
  });

  describe("block 9, the collision avoid list", () => {
    it("is absent on a first call", () => {
      expect(assembleCompositionUserMessage(input())).not.toContain(BLOCK_HEADINGS.avoid);
    });

    it("appears, with the colliding skeletons, only when a collision produced one", () => {
      const avoid = ["hero:Rail>Split>Overlay", "hero:Rail>Split>Grid"];
      const message = assembleCompositionUserMessage(input(), { avoid });
      expect(message).toContain(BLOCK_HEADINGS.avoid);
      for (const skeleton of avoid) expect(message).toContain(skeleton);
      // It sits between blocks 8 and 10, where the prompt file numbers it.
      expect(message.indexOf(BLOCK_HEADINGS.boxes)).toBeLessThan(
        message.indexOf(BLOCK_HEADINGS.avoid),
      );
      expect(message.indexOf(BLOCK_HEADINGS.avoid)).toBeLessThan(
        message.indexOf(BLOCK_HEADINGS.quality),
      );
    });
  });

  describe("block 11, the examples", () => {
    it("carries three trees, rotated by seed, with no fixture identifier attached", () => {
      const message = assembleCompositionUserMessage(input());
      const block = message.split(BLOCK_HEADINGS.examples)[1].split(BLOCK_HEADINGS.output)[0];
      const trees = block
        .split("\n")
        .filter((line) => line.startsWith('{"version":"composition_v1"'));
      expect(trees).toHaveLength(3);
      // §7.1: no recipe or silhouette identifier may cross into a request. The adapter returns
      // trees; a fixture id would have to have been added here, deliberately.
      expect(block).not.toMatch(/fixtureId|recipe|silhouette/i);
    });

    it("changes with the seed, and only with the seed", () => {
      const a = assembleCompositionUserMessage(input({ seed: 1 }));
      const b = assembleCompositionUserMessage(input({ seed: 2 }));
      expect(a).not.toBe(b);
      expect(assembleCompositionUserMessage(input({ seed: 1 }))).toBe(a);
    });
  });
});
