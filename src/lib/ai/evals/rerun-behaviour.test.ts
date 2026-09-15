/**
 * The Phase 4B validation machinery, verified without running it.
 *
 * `docs/model-evals/eval-incidents.md`: *"Never execute the eval runner to verify the harness. Not
 * its paths, not its guards, not its schemas, not its reports, not its refusals."* Three accidental
 * paid runs produced that rule, the third while verifying the very guard meant to prevent the
 * second. So every property of `tests/eval/clarification-rerun.eval.ts` is asserted here from its
 * **source text** and from the pure module beside it, and this file never imports it.
 *
 * The two assertions this task exists to make are near the top: the corpus is absent, and the slot
 * refuses without it.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.5`;
 * `docs/phase-4b-plan.md` Part IV T4.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ASSEMBLY_VERSION_BEFORE_ANSWERS,
  corpusPath,
  CORPUS_FILES,
  EVAL_SETS,
  isProtectedOutput,
  MODEL_VISIBLE_SURFACES,
  RERUN_BEHAVIOUR_OUT,
} from "./corpus";
import {
  buildRerunReviewArtifact,
  checkRerunCase,
  mechanicalPass,
  RERUN_ACCEPTANCE,
  RERUN_CAPABILITY_DIMENSIONS,
  rerunRunnerUnavailable,
  validateRerunCorpusShape,
  type RerunCase,
  type RerunObservation,
} from "./rerun-behaviour";
import { EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "../versions";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const RUNNER = read("tests/eval/clarification-rerun.eval.ts");
const flat = (text: string) => text.replace(/\s+/g, " ");

/* ------------------------------------------------------------------ absence and refusal */

describe("the corpus does not exist, and the slot refuses without it", () => {
  it("names the corpus while it is still unwritten", () => {
    expect(CORPUS_FILES.rerunBehaviour).toBe("clarification-rerun-behaviour.json");
    expect(existsSync(`${ROOT}${corpusPath("rerunBehaviour")}`)).toBe(false);
  });

  it("refuses at module scope, before any provider client could exist", () => {
    // Asserted from the source, never by importing it: importing the runner with an API key
    // present is what starts paying a provider.
    const absence = RUNNER.indexOf("if (!existsSync(CORPUS))");
    const describeAt = RUNNER.indexOf("describe(");
    expect(absence).toBeGreaterThan(-1);
    expect(absence).toBeLessThan(describeAt);
    expect(flat(RUNNER)).toContain("No provider call is made.");
    // No key is read anywhere in this runner: the assembly it will call is T9's, and the refusals
    // above sit in front of it either way.
    expect(RUNNER).not.toContain("OPENAI_API_KEY");
  });

  it("has no implementation to call even if a corpus appeared", () => {
    expect(() => rerunRunnerUnavailable({ prompt: "x", answers: [] })).toThrow(
      /does not exist yet/,
    );
    expect(() => rerunRunnerUnavailable({ prompt: "x", answers: [] })).toThrow(/T9/);
    expect(RUNNER).toContain("rerunRunnerUnavailable");
  });

  it("checks the corpus shape before it would spend anything", () => {
    const shape = RUNNER.indexOf("validateRerunCorpusShape");
    expect(shape).toBeGreaterThan(-1);
    expect(shape).toBeLessThan(RUNNER.indexOf("describe("));
    expect(RUNNER).toContain("Fix the corpus, never the ");
  });
});

/* ------------------------------------------------------------------ wiring */

describe("paths and ownership are fixed before the cases are known", () => {
  it("gives the set its own corpus, output and label", () => {
    expect(EVAL_SETS.rerunBehaviour.corpus).toBe(corpusPath("rerunBehaviour"));
    expect(EVAL_SETS.rerunBehaviour.out).toBe(RERUN_BEHAVIOUR_OUT);
    expect(RERUN_BEHAVIOUR_OUT).toBe("docs/model-evals/results/clarification-rerun-behaviour-v1");
  });

  it("is the one output path an eval may still write to", () => {
    // Everything else is spent and protected. This joins them in the same change that commits its
    // evidence (T14), never as a follow-up.
    expect(isProtectedOutput(RERUN_BEHAVIOUR_OUT)).toBe(false);
    for (const set of Object.keys(EVAL_SETS)) {
      const writable = !isProtectedOutput(EVAL_SETS[set as keyof typeof EVAL_SETS].out);
      expect({ set, writable }).toEqual({ set, writable: set === "rerunBehaviour" });
    }
    expect(existsSync(`${ROOT}${RERUN_BEHAVIOUR_OUT}`)).toBe(false);
  });

  it("belongs to its own runner, and the other runner refuses it", () => {
    expect(EVAL_SETS.rerunBehaviour.runner).toBe("clarification-rerun");
    const other = read("tests/eval/creative-understanding.eval.ts");
    expect(other).toContain('!== "creative-understanding"');
    expect(RUNNER).toContain('!== "clarification-rerun"');
    // Both refusals precede any work.
    expect(other.indexOf('!== "creative-understanding"')).toBeLessThan(other.indexOf("describe("));
    expect(RUNNER.indexOf('!== "clarification-rerun"')).toBeLessThan(RUNNER.indexOf("describe("));
  });

  it("has an npm script, and it names the set explicitly", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    expect(scripts["eval:rerun-behaviour"]).toBe(
      "EVAL_SET=rerunBehaviour vitest run --project eval",
    );
    // No arming token, confirmation secret or two-key execution — that decision was made for the
    // eval process and is not reintroduced here under another name.
    expect(scripts["eval:rerun-behaviour"]).not.toMatch(/CONFIRM|ARM|TOKEN/i);
  });

  it("writes once, and says why moving the journal aside matters", () => {
    expect(RUNNER).toContain("EVAL_OVERWRITE");
    expect(RUNNER).toContain("the paid provider responses, which ");
  });
});

/* ------------------------------------------------------------------ the frozen criteria */

describe("the acceptance criteria are frozen, and say what class this evidence is", () => {
  it("states the evidence class exactly as canon requires", () => {
    expect(RERUN_ACCEPTANCE.evidenceClass).toBe(
      "pre-registered validation evidence for the clarification-answer input shape/lifecycle",
    );
    expect(RERUN_ACCEPTANCE.notes).toEqual([
      "NOT fresh generalization evidence for EventIdentity v5",
      "NOT a replacement for the spent v5 sealed challenge",
      "validates the input shape and lifecycle, not the interpreter's creative quality",
    ]);
  });

  it("carries both halves, and neither is a number chosen later", () => {
    expect(RERUN_ACCEPTANCE.mechanical).toMatch(/no check reports `fail`/);
    expect(RERUN_ACCEPTANCE.mechanical).toMatch(/promptByteIdentical/);
    expect(RERUN_ACCEPTANCE.mechanical).toMatch(/answersAssembledAsGiven/);
    expect(RERUN_ACCEPTANCE.qualitative).toMatch(/every case is Yes on all three/);
    expect(RERUN_ACCEPTANCE.advisoryNeverCounts).toMatch(/never folded into the pass count/);
  });

  it("publishes the dimensions a corpus author is given, and nothing else", () => {
    expect(RERUN_CAPABILITY_DIMENSIONS.length).toBeGreaterThanOrEqual(5);
    for (const dimension of RERUN_CAPABILITY_DIMENSIONS) {
      expect(dimension).toMatch(/^[a-z_]+: /);
    }
  });
});

/* ------------------------------------------------------------------ the corpus contract */

const validCase = (over: Partial<RerunCase> = {}): RerunCase => ({
  id: "RB-01",
  prompt: "A retirement dinner for my mum",
  dimension: RERUN_CAPABILITY_DIMENSIONS[0],
  rounds: [
    { answers: [] },
    {
      answers: [
        {
          questionIndex: 0,
          kind: "creative",
          selectedOptionLabel: "Warmer",
          freeText: null,
          isDefer: false,
        },
      ],
    },
  ],
  ...over,
});
const corpus = (cases: unknown[]) => ({ version: "clarification_rerun_v1", cases });

describe("the structural contract refuses a case that would waste a paid call", () => {
  it("accepts a well-formed corpus", () => {
    expect(validateRerunCorpusShape(corpus([validCase()]))).toEqual([]);
  });

  it.each([
    ["no version", { cases: [validCase()] }],
    ["no cases", { version: "v", cases: [] }],
    ["a single round", corpus([validCase({ rounds: [{ answers: [] }] })])],
    [
      "answers on the first round",
      corpus([
        validCase({
          rounds: [
            {
              answers: [
                {
                  questionIndex: 0,
                  kind: "creative" as const,
                  selectedOptionLabel: "x",
                  freeText: null,
                  isDefer: false,
                },
              ],
            },
            { answers: [] },
          ],
        }),
      ]),
    ],
    ["an unknown dimension", corpus([validCase({ dimension: "something_else" })])],
    ["a duplicate id", corpus([validCase(), validCase()])],
  ])("refuses %s", (_label, value) => {
    expect(validateRerunCorpusShape(value).length).toBeGreaterThan(0);
  });

  it("refuses a deferred boundary answer, because Route B offers no defer", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          rounds: [
            { answers: [] },
            {
              answers: [
                {
                  questionIndex: 0,
                  kind: "boundary",
                  selectedOptionLabel: "Leave it out",
                  freeText: null,
                  isDefer: true,
                },
              ],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/boundary question offers no defer/);
  });

  it("refuses an empty answer and a defer that names no option", () => {
    const empty = validateRerunCorpusShape(
      corpus([
        validCase({
          rounds: [
            { answers: [] },
            {
              answers: [
                {
                  questionIndex: 0,
                  kind: "creative",
                  selectedOptionLabel: null,
                  freeText: "   ",
                  isDefer: false,
                },
              ],
            },
          ],
        }),
      ]),
    );
    expect(empty.join(" ")).toMatch(/must select an option or supply text/);
  });

  it("does not throw on junk", () => {
    for (const junk of [null, undefined, "a string", 3, [], { cases: "no" }]) {
      expect(() => validateRerunCorpusShape(junk)).not.toThrow();
      expect(validateRerunCorpusShape(junk).length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ the mechanical checks */

const observation = (over: Partial<RerunObservation> = {}): RerunObservation => ({
  caseId: "RB-01",
  promptsSent: ["A retirement dinner for my mum", "A retirement dinner for my mum"],
  assemblyVersions: ["event_identity_input_v2", "event_identity_input_v2"],
  results: [{ suppliedFacts: {} }, { suppliedFacts: {} }],
  provisional: [false, false],
  answersAssembled: [
    [],
    [
      {
        questionIndex: 0,
        kind: "creative",
        selectedOptionLabel: "Warmer",
        freeText: null,
        isDefer: false,
      },
    ],
  ],
  schemaVersions: [EVENT_IDENTITY_SCHEMA_VERSION, EVENT_IDENTITY_SCHEMA_VERSION],
  ...over,
});

const status = (checks: ReturnType<typeof checkRerunCase>, name: string) =>
  checks.find((check) => check.name === name)?.status;

describe("the mechanical checks decide what they can and refuse to guess the rest", () => {
  it("passes a clean observation", () => {
    const checks = checkRerunCase(validCase(), observation());
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("fails when the original description changed between rounds", () => {
    const checks = checkRerunCase(
      validCase(),
      observation({ promptsSent: ["A retirement dinner for my mum", "… and make it warmer"] }),
    );
    expect(status(checks, "promptByteIdentical")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("fails when a round assembled answers the case did not supply", () => {
    const checks = checkRerunCase(validCase(), observation({ answersAssembled: [[], []] }));
    expect(status(checks, "answersAssembledAsGiven")).toBe("fail");
  });

  it("fails on an invented fact", () => {
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["Tuesday"] }),
      observation({ results: [{}, { suppliedFacts: { dateText: "Tuesday" } }] }),
    );
    expect(status(checks, "noInventedFacts")).toBe("fail");
  });

  it("fails on an expected fact that did not hold", () => {
    const checks = checkRerunCase(
      validCase({ expectedFacts: { honoreeName: "Denise" } }),
      observation({ results: [{}, { suppliedFacts: { honoreeName: null } }] }),
    );
    expect(status(checks, "expectedFacts")).toBe("fail");
  });

  it("reports n/a rather than passing when a case asserts nothing", () => {
    const checks = checkRerunCase(validCase(), observation());
    expect(status(checks, "expectedFacts")).toBe("n/a");
    expect(status(checks, "noInventedFacts")).toBe("n/a");
    expect(status(checks, "boundaryResolves")).toBe("n/a");
  });

  it("reports advisory, never fail, when a rerun still asks after a boundary answer", () => {
    const boundaryCase = validCase({
      rounds: [
        { answers: [] },
        {
          answers: [
            {
              questionIndex: 0,
              kind: "boundary",
              selectedOptionLabel: "Leave it out",
              freeText: null,
              isDefer: false,
            },
          ],
        },
      ],
    });
    const checks = checkRerunCase(
      boundaryCase,
      observation({
        provisional: [true, true],
        answersAssembled: [
          [],
          [
            {
              questionIndex: 0,
              kind: "boundary",
              selectedOptionLabel: "Leave it out",
              freeText: null,
              isDefer: false,
            },
          ],
        ],
      }),
    );
    // Whether a further boundary question is warranted is a judgement, and §7.6b sets no lifetime
    // cap — so the checker records it and leaves the call to the reviewer.
    expect(status(checks, "boundaryResolves")).toBe("advisory");
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("counts neither advisory nor n/a as a pass", () => {
    const checks = checkRerunCase(validCase(), observation());
    const passes = checks.filter((check) => check.status === "pass").map((check) => check.name);
    expect(passes).not.toContain("expectedFacts");
    expect(passes).not.toContain("boundaryResolves");
  });
});

/* ------------------------------------------------------------------ the blind artifact */

describe("the blind artifact tells the reviewer what to look for, and nothing else", () => {
  const artifact = buildRerunReviewArtifact([
    {
      caseId: "RB-01",
      promptsSent: ["A retirement dinner for my mum", "A retirement dinner for my mum"],
      results: [{ identity: { copyTone: "warm" } }, { identity: { copyTone: "warmer" } }],
    },
  ]);

  it("asks the three frozen questions", () => {
    expect(flat(artifact)).toContain("current input, rather than as a rewrite");
    expect(flat(artifact)).toContain("did the later round respect the answer");
    expect(flat(artifact)).toContain("avoid re-asking what had just been answered");
  });

  it("does not ask whether it passes, and leaks no expectation", () => {
    expect(artifact).toContain("You are not asked whether this passes.");
    expect(artifact).not.toContain("RB-01");
    expect(artifact).not.toContain("dimension");
    expect(artifact).not.toContain("expectedFacts");
    expect(artifact).not.toContain("mustNotInvent");
    // "You are not asked whether this passes" legitimately contains the word, so what is banned
    // is a verdict about a case, not the letters.
    expect(artifact).not.toMatch(/\b(mechanical|criteri|threshold|acceptance)/i);
    expect(artifact).not.toMatch(/\bfail(ed|s|ure)?\b/i);
  });
});

/* ------------------------------------------------------------------ the leakage surface */

describe("T9 cannot introduce unscanned model-visible text", () => {
  it("declares the assembly surface before it exists", () => {
    expect(MODEL_VISIBLE_SURFACES["input assembly"]).toBe(
      "src/lib/ai/openai/event-identity-input.ts",
    );
    expect(existsSync(`${ROOT}${MODEL_VISIBLE_SURFACES["input assembly"]}`)).toBe(false);
  });

  it("holds the assembly version and that file inseparable", () => {
    // Today: v1, file absent, consistent. The leakage scan fails the moment the version moves off
    // v1 without the file appearing — which is the only window in which a collision could be
    // introduced, because by then the corpus is frozen and the scanner cannot change.
    expect(EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION).toBe(ASSEMBLY_VERSION_BEFORE_ANSWERS);
    const scan = read("src/lib/ai/evals/prompt-leakage.test.ts");
    expect(scan).toContain("ASSEMBLY_VERSION_BEFORE_ANSWERS");
    expect(scan).toContain("MODEL_VISIBLE_SURFACES");
    expect(flat(scan)).toContain("requires the input-assembly surface to exist once the assembly");
  });

  it("keeps the prompt and wire schema scanned unconditionally", () => {
    expect(existsSync(`${ROOT}${MODEL_VISIBLE_SURFACES.prompt}`)).toBe(true);
    expect(existsSync(`${ROOT}${MODEL_VISIBLE_SURFACES["wire schema"]}`)).toBe(true);
  });
});
