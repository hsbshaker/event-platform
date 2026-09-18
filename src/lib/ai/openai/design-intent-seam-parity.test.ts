/**
 * The eval seam sends the *exact* production request, proved rather than asserted.
 *
 * `docs/phase-4b-plan.md`, on why T21 owns the production DesignIntent call at all:
 * *"A sealed challenge is generalization evidence **about an implementation**; evidence about a
 * request shape that ships nowhere is evidence about nothing."* And `rerun-runner.ts`, quoted
 * there: *"A second assembly written for the harness would let the set pass while production sent
 * something else, which is the one outcome that makes the whole exercise worthless."*
 *
 * The property that makes that true is not "the seam imports production" — an adapter can import
 * production and still decide a request option, a message order or a schema of its own. It is that
 * the arguments reaching the provider are **identical**. So this mocks the SDK and nothing else,
 * drives one request down each path, and compares the whole argument object by deep equality: the
 * model, the reasoning effort, the tier, the store flag, the output ceiling, the narrowed schema
 * and every message, byte for byte.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.7`
 * ("The seam exists so the eval goes through the **same production assembly** the real generation
 * path uses"); `docs/phase-4b-plan.md` Part IV, T21.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PREMISE_FIXTURE_IDENTITY,
  premiseFixture,
  validPremiseSet,
} from "../../../../tests/fixtures/concept-premise";
import { assignmentFor, emptyAvoidList, type SiblingAssignment } from "@/lib/renderer/planner";

const create = vi.fn();

/** The **only** thing mocked. Everything below it is the code that ships. */
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const ASSIGNMENT: SiblingAssignment = assignmentFor(11, emptyAvoidList());

/**
 * The shared fixture brief, and the premise set a correct stage authors from it.
 *
 * Shared rather than local now that the seam makes two calls: the premise stage really validates
 * its response against this brief, so a brief and a premise set that were written independently
 * would fail the grounding check and this file would be testing the fixture instead of the seam.
 */
const IDENTITY = PREMISE_FIXTURE_IDENTITY;

/**
 * The premise response, returned for the premise call and only for it.
 *
 * One mock serves two calls now, so it routes on the schema name the request carries — which is
 * also the cheapest proof that the two requests really are two different requests.
 */
function premiseOk() {
  return {
    id: "resp_premise",
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: JSON.stringify(validPremiseSet()),
    usage: {
      input_tokens: 3_000,
      output_tokens: 1_200,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 900 },
    },
  };
}

/** Route by the structured-output schema name the boundary sends. */
function route(request: { text?: { format?: { name?: string } } }) {
  return request.text?.format?.name === "concept_premise_set" ? premiseOk() : ok();
}

function ok() {
  return {
    id: "resp_parity",
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: JSON.stringify({
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
      presentation: { name: "Pressed Garden", description: "A quiet, unhurried invitation." },
    }),
    usage: {
      input_tokens: 4_000,
      output_tokens: 900,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 600 },
    },
  };
}

describe("the 4C seam and production send the same request", () => {
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

  it("produces provider arguments that are deeply equal", async () => {
    const { generateDesignIntent } = await import("./design-intent");
    // The seam call below asks for sibling 1, so production has to be given sibling 1's premise:
    // the request text now depends on it, and comparing two different concepts' requests would
    // prove nothing. Which premise reaches which sibling is `design-intent-runner.ts`'s, and the
    // assertion after the two calls is what holds it to binding by index.
    await generateDesignIntent({
      identity: IDENTITY as never,
      assignment: ASSIGNMENT,
      premise: premiseFixture(1),
    });
    expect(create).toHaveBeenCalledTimes(1);
    const production = create.mock.calls[0][0];

    create.mockClear();

    // Through the frozen harness's own binding, exactly as `tests/eval/design-intent.eval.ts`
    // reaches it — not through the adapter directly, so the seam itself is part of what is proved.
    const { designIntentRunner } = await import("@/lib/ai/evals/design-intent-seam");
    await designIntentRunner({
      identity: IDENTITY as never,
      assignment: ASSIGNMENT,
      siblingIndex: 1,
    });
    // Two calls through the seam: the batch's premise set, then this sibling's DesignIntent. The
    // premise call is the stage the T22 remediation added, and the parity claim is about the
    // DesignIntent request — which must still be byte-identical to production's.
    expect(create).toHaveBeenCalledTimes(2);
    const premiseRequest = create.mock.calls[0][0];
    const seam = create.mock.calls[1][0];
    expect(premiseRequest.text.format.name).toBe("concept_premise_set");
    expect(seam.text.format.name).toBe("design_intent_response");

    expect(seam).toEqual(production);
    // Spelled out as well, so a future change that made both sides wrong in the same way would
    // still have to move a named expectation rather than a single equality.
    expect(seam.input).toEqual(production.input);
    expect(seam.text.format.schema).toEqual(production.text.format.schema);
    expect({
      model: seam.model,
      reasoning: seam.reasoning,
      service_tier: seam.service_tier,
      store: seam.store,
      max_output_tokens: seam.max_output_tokens,
    }).toEqual({
      model: production.model,
      reasoning: production.reasoning,
      service_tier: production.service_tier,
      store: production.store,
      max_output_tokens: production.max_output_tokens,
    });
  });

  it("reports the text production actually sent, not a reconstruction", async () => {
    const { designIntentRunner } = await import("@/lib/ai/evals/design-intent-seam");
    const outcome = await designIntentRunner({
      identity: IDENTITY as never,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    });
    // Call 0 is the premise set; call 1 is this sibling's DesignIntent.
    const sent = create.mock.calls[1][0].input;
    expect(outcome.requestText).toBe(sent[1].content);
    // And it is the user message alone: not the instruction file beside it, and not a correction
    // turn. The frozen seam contract is explicit that a permanent verdict must never turn on a
    // stochastic string.
    expect(outcome.requestText).not.toContain(sent[0].content);
    expect(outcome.telemetry.promptVersion).toBe("design_intent_v6");
    expect(outcome.telemetry.schemaVersion).toBe("design_intent_schema_v6");
    expect(outcome.telemetry.providerRequestId).toBe("resp_parity");
  });

  it("hands the harness the post-repair object, and the raw response untouched", async () => {
    // The harness grades what the rest of the system would receive. `raw` still carries the
    // response exactly as it arrived, so a deterministic repair loses no evidence.
    create.mockImplementation((request: { text?: { format?: { name?: string } } }) =>
      Promise.resolve(
        request.text?.format?.name === "concept_premise_set"
          ? premiseOk()
          : {
              ...ok(),
              output_text: JSON.stringify({
                ...JSON.parse(ok().output_text),
                palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#B04A3A" },
              }),
            },
      ),
    );
    const { designIntentRunner } = await import("@/lib/ai/evals/design-intent-seam");
    const outcome = await designIntentRunner({
      identity: IDENTITY as never,
      assignment: ASSIGNMENT,
      siblingIndex: 2,
    });
    // The premise set, then the one DesignIntent call. The deterministic palette repair opens no
    // further pass, which is the property being checked: two calls, not three.
    expect(create).toHaveBeenCalledTimes(2);
    expect((outcome.response as { palette: { colors: string[] } }).palette.colors).toHaveLength(4);
    expect(JSON.parse(outcome.raw).palette.colors).toHaveLength(3);
  });
});
