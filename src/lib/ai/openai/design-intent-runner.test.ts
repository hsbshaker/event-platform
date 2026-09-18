/**
 * The seam adapter: one premise call per batch, bound to siblings by index.
 *
 * `tests/eval/design-intent.eval.ts` is hashed byte for byte and fans out **per sibling**; the
 * premise stage is a **batch** call. Reconstructing that batch boundary on this side of the seam is
 * the one piece of real work the adapter does, and getting it wrong would be invisible in the
 * evidence while destroying the property the stage exists to create — three unrelated premise sets
 * per batch, each sibling answering a premise from a set the other two never saw.
 *
 * So these tests count provider calls and check which premise reached which sibling, rather than
 * trusting that the memo works.
 *
 * Acceptance criteria: N/A — benchmark integrity. Plan: `docs/phase-4b-plan.md §E`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assignmentFor, emptyAvoidList, type SiblingAssignment } from "@/lib/renderer/planner";

import {
  PREMISE_FIXTURE_IDENTITY,
  validPremiseSet,
} from "../../../../tests/fixtures/concept-premise";

const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const ASSIGNMENT: SiblingAssignment = assignmentFor(11, emptyAvoidList());

function designIntentBody() {
  return {
    family: ASSIGNMENT.family,
    tonalDirection: ASSIGNMENT.tonalDirection,
    palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
    typographyPairing: ASSIGNMENT.typographyPairings[0],
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: ASSIGNMENT.hierarchy,
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "restrained",
    },
    motifs: ["linen"],
    presentation: { name: "Pressed Garden", description: "A considered, unfussy invitation." },
  };
}

function reply(body: unknown, id: string) {
  return {
    id,
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: JSON.stringify(body),
    usage: {
      input_tokens: 2_000,
      output_tokens: 500,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 300 },
    },
  };
}

function route(request: { text?: { format?: { name?: string } } }) {
  return request.text?.format?.name === "concept_premise_set"
    ? reply(validPremiseSet(), "resp_premise")
    : reply(designIntentBody(), "resp_intent");
}

async function load() {
  const runner = await import("./design-intent-runner");
  // The memo is module-scoped and the harness runs once per process, but a suite does not.
  runner.resetPremiseSetCache();
  return runner;
}

/** The request text each DesignIntent call actually sent, in call order. */
function designIntentMessages(): string[] {
  return create.mock.calls
    .filter(([request]) => request.text?.format?.name === "design_intent_response")
    .map(([request]) => request.input[1].content as string);
}

describe("the adapter reconstructs the batch the frozen harness cannot", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    create.mockImplementation((request: { text?: { format?: { name?: string } } }) =>
      Promise.resolve(route(request)),
    );
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("makes one premise call for a whole batch, not one per sibling", async () => {
    const { designIntentRunner } = await load();
    for (const siblingIndex of [0, 1, 2]) {
      await designIntentRunner({
        identity: PREMISE_FIXTURE_IDENTITY as never,
        assignment: ASSIGNMENT,
        siblingIndex,
      });
    }
    const premiseCalls = create.mock.calls.filter(
      ([request]) => request.text?.format?.name === "concept_premise_set",
    );
    expect(premiseCalls).toHaveLength(1);
    expect(designIntentMessages()).toHaveLength(3);
  });

  it("gives each sibling its own premise, and neither of the other two", async () => {
    const { designIntentRunner } = await load();
    for (const siblingIndex of [0, 1, 2]) {
      await designIntentRunner({
        identity: PREMISE_FIXTURE_IDENTITY as never,
        assignment: ASSIGNMENT,
        siblingIndex,
      });
    }
    const premises = validPremiseSet().premises;
    const messages = designIntentMessages();
    messages.forEach((message, at) => {
      expect(message).toContain(premises[at].title);
      expect(message).toContain(premises[at].organizingIdea);
      for (const other of premises.filter((_, i) => i !== at)) {
        expect(message).not.toContain(other.title);
        expect(message).not.toContain(other.organizingIdea);
      }
    });
  });

  it("withholds `distinctFrom`, which describes the other two concepts", async () => {
    const { designIntentRunner } = await load();
    await designIntentRunner({
      identity: PREMISE_FIXTURE_IDENTITY as never,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    });
    expect(designIntentMessages()[0]).not.toContain(validPremiseSet().premises[0].distinctFrom);
  });

  it("makes a second premise call for a different brief", async () => {
    const { designIntentRunner } = await load();
    // One field changed, and deliberately a field no grounding entry quotes — so the second brief
    // is a different brief while the same premise set stays legal against it.
    const other = {
      ...PREMISE_FIXTURE_IDENTITY,
      tonalIntent: `${PREMISE_FIXTURE_IDENTITY.tonalIntent} Darker overall than the first brief.`,
    };
    await designIntentRunner({
      identity: PREMISE_FIXTURE_IDENTITY as never,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    });
    await designIntentRunner({
      identity: other as never,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    });
    expect(
      create.mock.calls.filter(([r]) => r.text?.format?.name === "concept_premise_set"),
    ).toHaveLength(2);
  });

  it("keys the batch on the brief's content, not on its field order", async () => {
    const { designIntentRunner } = await load();
    const reordered = Object.fromEntries(
      Object.entries(PREMISE_FIXTURE_IDENTITY).reverse(),
    ) as typeof PREMISE_FIXTURE_IDENTITY;
    await designIntentRunner({
      identity: PREMISE_FIXTURE_IDENTITY as never,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    });
    await designIntentRunner({
      identity: reordered as never,
      assignment: ASSIGNMENT,
      siblingIndex: 1,
    });
    // A brief rebuilt in a different field order is the same brief; hashing it differently would
    // buy a second premise call, and three siblings could end up answering two different sets.
    expect(
      create.mock.calls.filter(([r]) => r.text?.format?.name === "concept_premise_set"),
    ).toHaveLength(1);
  });

  it("fails every sibling of a batch whose premise set is unusable, and pays once", async () => {
    const collapsedSet = validPremiseSet();
    create.mockImplementation((request: { text?: { format?: { name?: string } } }) =>
      Promise.resolve(
        request.text?.format?.name === "concept_premise_set"
          ? reply(
              {
                ...collapsedSet,
                premises: collapsedSet.premises.map((premise) => ({
                  ...premise,
                  register: {
                    pace: "measured",
                    presence: "poised",
                    surfaceRichness: "considered",
                  },
                })),
              },
              "resp_premise",
            )
          : reply(designIntentBody(), "resp_intent"),
      ),
    );
    const { designIntentRunner } = await load();
    const failures: ({ name: string; message: string; rawResponses?: string[] } | null)[] = [];
    for (const siblingIndex of [0, 1, 2]) {
      failures.push(
        await designIntentRunner({
          identity: PREMISE_FIXTURE_IDENTITY as never,
          assignment: ASSIGNMENT,
          siblingIndex,
        }).then(
          () => null,
          (error: unknown) => error as { name: string; message: string; rawResponses?: string[] },
        ),
      );
    }
    expect(failures.every((failure) => failure?.name === "ConceptPremiseError")).toBe(true);
    // One premise call plus its single repair pass, for the whole batch. Not three of each.
    expect(create).toHaveBeenCalledTimes(2);
    expect(designIntentMessages()).toEqual([]);

    // The paid responses are journaled against the first sibling only: an evidence file that
    // triple-counted one paid call would be worse than one that omitted it.
    expect(failures[0]!.rawResponses).toHaveLength(2);
    expect(failures[1]!.rawResponses).toEqual([]);
    expect(failures[2]!.rawResponses).toEqual([]);
    expect(failures[1]!.message).toContain("recorded against the first sibling");
  });
});
