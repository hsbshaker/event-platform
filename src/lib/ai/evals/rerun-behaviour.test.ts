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
 * refuses without it. The third is the one the redesign added — that a corpus author never has to
 * predict a model's output, because the question an answer names is in the case.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.5`;
 * `docs/phase-4b-plan.md` Part IV T4.
 */
import { createHash } from "node:crypto";
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
  buildSeededRevision,
  checkRerunCase,
  cumulativeHistory,
  mechanicalPass,
  MULTI_ROUND_DIMENSION,
  RERUN_ACCEPTANCE,
  RERUN_CAPABILITY_DIMENSIONS,
  rerunRunnerUnavailable,
  seededWhyItMatters,
  validateRerunCorpusShape,
  type RerunCase,
  type RerunHistoryRound,
  type RerunObservation,
} from "./rerun-behaviour";
import { clarificationQuestionSchema, eventIdentityResultSchema } from "../event-identity/contract";
import { EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "../versions";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const RUNNER = read("tests/eval/clarification-rerun.eval.ts");
const MODULE = read("src/lib/ai/evals/rerun-behaviour.ts");
const flat = (text: string) => text.replace(/\s+/g, " ");

/** The body of the per-case loop, so ordering claims are about the case, not about the file. */
const caseBody = () => {
  const from = RUNNER.indexOf("for (const testCase of corpus.cases");
  const to = RUNNER.indexOf("// The artifact first, the report second.");
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return RUNNER.slice(from, to);
};

/* ------------------------------------------------------------------ absence and refusal */

describe("the corpus does not exist, and the slot refuses without it", () => {
  it("names the corpus, wherever it is in its life", () => {
    expect(CORPUS_FILES.rerunBehaviour).toBe("clarification-rerun-behaviour.json");
  });

  /**
   * Self-retiring, the way `prompt-leakage.test.ts`'s unscanned-corpus test already is.
   *
   * Written before the cases were authored and before anything about them was known, so that T8
   * can be a commit that adds the corpus file and changes nothing else. An absence assertion that
   * had to be edited by hand at T8 would put a source edit inside the freeze commit and make
   * "adding the corpus is the whole change" untrue — the same class of slightly-false claim the
   * runner's own freeze exception turned out to be.
   */
  it.runIf(!existsSync(`${ROOT}${corpusPath("rerunBehaviour")}`))(
    "does not exist yet, so the slot cannot run",
    () => {
      expect(existsSync(`${ROOT}${corpusPath("rerunBehaviour")}`)).toBe(false);
    },
  );

  it.runIf(existsSync(`${ROOT}${corpusPath("rerunBehaviour")}`))(
    "satisfies the contract that was frozen before it was written",
    () => {
      // The other half, armed by the same arrival. The runner checks this at module scope before
      // spending anything; asserting it here means a corpus that drifts out of contract fails the
      // ordinary suite rather than the one authorized paid run.
      const corpus = JSON.parse(read(corpusPath("rerunBehaviour")));
      expect(validateRerunCorpusShape(corpus)).toEqual([]);
    },
  );

  it("refuses at module scope, before any provider client could exist", () => {
    // Asserted from the source, never by importing it: importing the runner with an API key
    // present is what starts paying a provider.
    const absence = RUNNER.indexOf("if (!existsSync(CORPUS))");
    const describeAt = RUNNER.indexOf("describe(");
    expect(absence).toBeGreaterThan(-1);
    expect(absence).toBeLessThan(describeAt);
    expect(flat(RUNNER)).toContain("No provider call is made.");
    expect(RUNNER).not.toContain("OPENAI_API_KEY");
  });

  it("has no implementation to call even if a corpus appeared", () => {
    const request = { prompt: "x", priorRevisions: [], answers: [] };
    expect(() => rerunRunnerUnavailable(request)).toThrow(/does not exist yet/);
    expect(() => rerunRunnerUnavailable(request)).toThrow(/T9/);
    // The runner binds through the seam module, which today resolves to the refusal above. That
    // indirection is what lets the runner itself be frozen with no exception.
    expect(RUNNER).toContain('import { rerunRunner } from "@/lib/ai/evals/rerun-seam"');
    expect(RUNNER).toContain("const run = rerunRunner;");
    const seam = read("src/lib/ai/evals/rerun-seam.ts");
    expect(seam).toMatch(/export const rerunRunner: RerunCallRunner =/);
    const code = seam
      .split("\n")
      .filter(
        (line) => line.trim() && !line.trim().startsWith("*") && !line.trim().startsWith("/*"),
      );
    expect(code.length).toBeLessThanOrEqual(3);
    expect(seam).toContain("rerunRunnerUnavailable");
  });

  it("journals the paid response inside the case, not after the loop", () => {
    // A one-shot set must not lose the whole run to a failure on the last case. Asserting only
    // "append appears before checkRerunCase in the file" would pass a runner that buffered every
    // case and wrote once at the end, so the append is located inside the case body itself.
    const body = caseBody();
    const call = body.indexOf("await run(");
    const append = body.indexOf("appendJournal(");
    expect(call).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(call);
    expect(body.indexOf("responseEntry(")).toBeGreaterThan(call);
    expect(body).toContain("raw: outcome.raw");
    expect(RUNNER).toContain("JOURNAL_FILENAME");
    expect(RUNNER.indexOf("appendJournal(")).toBeLessThan(RUNNER.indexOf("checkRerunCase("));
  });

  it("journals a billed response that validation then rejected, and still fails loudly", () => {
    const body = caseBody();
    expect(body).toContain("try {");
    expect(body).toContain("} catch (error) {");
    const journalled = body.indexOf("failureEntry(");
    const rethrow = body.indexOf("throw error;");
    expect(journalled).toBeGreaterThan(-1);
    expect(rethrow).toBeGreaterThan(journalled);
    expect(body).toContain("rawResponses: failure.rawResponses ?? []");
    expect(flat(MODULE)).toMatch(/rawResponses\?:\s*\*?\s*string\[\]/);
  });

  it("rotates every previous evidence file aside, before the first call", () => {
    const rotate = RUNNER.indexOf("rotateJournal(OUT, runStartedAt)");
    expect(rotate).toBeGreaterThan(-1);
    expect(rotate).toBeLessThan(RUNNER.indexOf("for (const testCase of"));
    expect(RUNNER).toContain("kept the previous");
    expect(RUNNER).toContain('rotateAside(OUT, "mechanical-report.md", runStartedAt)');
    expect(RUNNER).toContain('rotateAside(OUT, "blind-review.md", runStartedAt)');
  });

  it("stamps the completion signal with the run it completed", () => {
    expect(RUNNER).toContain("Run started: ");
    expect(RUNNER).toContain("${runStartedAt}");
    expect(RUNNER).toContain("${corpus.version}");
  });

  it("records what was transmitted, not only what the implementation says it sent", () => {
    expect(RUNNER).toContain("requestText: outcome.requestText");
    expect(RUNNER).toContain("transmitted: outcome.requestText");
    expect(MODULE).toContain("requestText: string;");
  });

  it("records an unreadable envelope rather than losing the run to it", () => {
    expect(RUNNER).toContain("UnreadableIdentityError");
    expect(RUNNER).toContain('provisional = "unreadable"');
    expect(RUNNER).toContain("if (!(error instanceof UnreadableIdentityError)) throw error;");
  });

  it("checks the corpus shape before it would spend anything", () => {
    const shape = RUNNER.indexOf("validateRerunCorpusShape");
    expect(shape).toBeGreaterThan(-1);
    expect(shape).toBeLessThan(RUNNER.indexOf("describe("));
    expect(RUNNER).toContain("Fix the corpus, never the ");
  });

  it("sets its own timeout, rather than inheriting one sized for another set", () => {
    expect(RUNNER).toContain("45 * 60 * 1000");
    expect(Number(/(\d+) \* 60 \* 1000/.exec(RUNNER)?.[1])).toBeGreaterThan(15);
  });
});

/* ------------------------------------------------------ the setup is frozen, not generated */

describe("a corpus author never has to predict a model's output", () => {
  it("makes one live call per case, and it is the rerun", () => {
    // The defect this replaced: the corpus declared an answer naming a questionIndex and an option
    // label for a question that would not exist until a live setup call produced it. Either the
    // live call asked something else and a correct assembly failed for a reason unrelated to
    // assembly, or the harness answered a question nobody asked.
    const body = caseBody();
    expect(body.match(/await run\(/g) ?? []).toHaveLength(1);
    expect(body).toContain("buildSeededRevision(round, index + 1)");
    expect(body).toContain("cumulativeHistory(testCase)");
  });

  it("builds the prior revisions from the case, with no provider involved", () => {
    const round: RerunHistoryRound = {
      questions: [
        {
          kind: "creative",
          question: "How formal should the evening read?",
          options: [
            { label: "Black tie" },
            { label: "Relaxed" },
            { label: "You choose", isDefer: true },
          ],
        },
      ],
      answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
    };
    const envelope = buildSeededRevision(round, 1);
    // Parsed by the real schema: "valid fixture envelope" is checked, not claimed. This is what
    // lets T9 resolve a locator against the same shape `event_identity_revisions.result` holds.
    expect(() => eventIdentityResultSchema.parse(envelope)).not.toThrow();
    expect(envelope.clarification.questions[0].question).toBe(
      "How formal should the evening read?",
    );
    expect(envelope.clarification.questions[0].whyItMatters).toBe(seededWhyItMatters(1, 0));
    expect(envelope.clarification.needed).toBe(true);
  });

  it("says in the fixture's own words that no model wrote it", () => {
    const envelope = buildSeededRevision(
      {
        questions: [
          {
            kind: "boundary",
            question: "Is the pregnancy public yet?",
            options: [{ label: "Yes" }, { label: "Not yet" }],
          },
        ],
        answers: [{ questionIndex: 0, selectedOptionLabel: "Yes", freeText: null }],
      },
      1,
    );
    // A qualitative reviewer must not be able to mistake fixture state for provider output.
    expect(envelope.identity.creativeDirection).toMatch(/fixture/i);
    expect(envelope.identity.creativeDirection).toMatch(/no model produced it/i);
    expect(Object.values(envelope.suppliedFacts).every((value) => value === null)).toBe(true);
  });

  it("derives an answer's route from its question, never from the author", () => {
    const testCase = validCase({
      history: [
        {
          questions: [
            {
              kind: "boundary",
              question: "Is the pregnancy public yet?",
              options: [{ label: "Yes" }, { label: "Not yet" }],
            },
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Yes", freeText: null }],
        },
      ],
    });
    // The corpus never declares `kind` on an answer, so it cannot disagree with the question.
    expect(cumulativeHistory(testCase)[0].kind).toBe("boundary");
    // …and the author-facing answer type has no `kind` field to disagree with it.
    const block = MODULE.slice(
      MODULE.indexOf("export interface SeededAnswer {"),
      MODULE.indexOf("/** One prior revision"),
    );
    expect(block).not.toContain("kind");
  });

  it("orders the cumulative history oldest first, with a production-shaped locator", () => {
    const testCase = validCase({
      history: [
        {
          questions: [
            {
              kind: "creative",
              question: "Warm or cool in feel?",
              options: [
                { label: "Warm" },
                { label: "Cool" },
                { label: "You choose", isDefer: true },
              ],
            },
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Warm", freeText: null }],
        },
        {
          questions: [
            {
              kind: "creative",
              question: "Quiet or celebratory in voice?",
              options: [
                { label: "Quiet" },
                { label: "Celebratory" },
                { label: "You choose", isDefer: true },
              ],
            },
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Quiet", freeText: null }],
        },
      ],
    });
    expect(cumulativeHistory(testCase).map((a) => [a.revision, a.questionIndex])).toEqual([
      [1, 0],
      [2, 0],
    ]);
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

  /**
   * The freeze, enforced — with no exception to argue about.
   *
   * An earlier version of this guard promised "nothing but one line", normalising the `run`
   * binding away before hashing. That exception could not be honoured: binding `run` to T9's
   * implementation also means importing it, and the import block is inside the hash, so the hash
   * would have had to be updated at T9 — a freeze you edit when you mean to. The binding moved to
   * `rerun-seam.ts`, which is not frozen, and this hashes the runner whole.
   *
   * If this fails: something changed in a file frozen before the validation cases were authored,
   * which is the situation the whole T4–T8 ordering exists to prevent. There is no legitimate
   * reason to update this constant at T9 or T13 — the change belongs in `rerun-seam.ts`.
   */
  /**
   * …and so does the module that holds the criteria.
   *
   * The runner is plumbing; `rerun-behaviour.ts` is the pre-registration itself — the published
   * dimensions, the structural contract, every mechanical check, `RERUN_ACCEPTANCE` and the blind
   * artifact. Its own header says nothing below it may change once T5 freezes it, and until now
   * nothing enforced that: the check *logic* was pinned only by behavioural tests living in this
   * same editable file, so at T13 softening a check and adjusting its test was a green build. The
   * file bearing the pre-registration was the one without the tripwire.
   */
  it("neither does the module holding the criteria", () => {
    const digest = createHash("sha256")
      .update(read("src/lib/ai/evals/rerun-behaviour.ts"), "utf8")
      .digest("hex");
    expect(
      digest,
      "src/lib/ai/evals/rerun-behaviour.ts changed. It holds the dimensions, the corpus contract, " +
        "the mechanical checks, the acceptance criteria and the blind artifact, all frozen at T5 " +
        "before the validation cases existed. Changing a criterion after seeing the cases is the " +
        "thing this set exists not to do.",
    ).toBe("d8e0f95f415f44a8051ef284050a5b1adf4ddcc6a6a985a0dea0eb6d8fc36969");
  });

  it("does not change at all", () => {
    const digest = createHash("sha256").update(RUNNER, "utf8").digest("hex");
    expect(
      digest,
      "tests/eval/clarification-rerun.eval.ts changed. It was frozen at T5, before the validation " +
        "cases were authored, and it has no permitted edit: T9 repoints " +
        "src/lib/ai/evals/rerun-seam.ts instead. Do not update this hash to silence the failure.",
    ).toBe("06ca357358a519081044906337859f83f96a74195af505c9ca55e75e951a25b9");
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
      "the prior clarification history is frozen fixture state authored with the case; no model produced it, and only the rerun is a live call",
      "cumulative history is verified as rendering, not as selection: the harness hands the assembly the full history, so the production query that gathers every prior answer sits above this seam and is not evidenced here",
    ]);
  });

  it("carries both halves, and neither is a number chosen later", () => {
    expect(RERUN_ACCEPTANCE.mechanical).toMatch(/no check reports `fail`/);
    for (const name of [
      "promptByteIdentical",
      "questionRenderedWithAnswer",
      "menuNotResent",
      "historyDelivered",
      "answerBoundToItsQuestion",
    ]) {
      expect(RERUN_ACCEPTANCE.mechanical).toContain(name);
    }
    // And it says out loud that none of them turns on what the rerun chose to ask.
    expect(RERUN_ACCEPTANCE.mechanical).toMatch(/depends on what the rerun chose to ask/);
    expect(RERUN_ACCEPTANCE.qualitative).toMatch(/every case is Yes on all three/);
    expect(RERUN_ACCEPTANCE.advisoryNeverCounts).toMatch(/never folded into the pass count/);
  });

  it("publishes the dimensions a corpus author is given, and nothing else", () => {
    expect(RERUN_CAPABILITY_DIMENSIONS.length).toBeGreaterThanOrEqual(5);
    for (const dimension of RERUN_CAPABILITY_DIMENSIONS) {
      expect(dimension).toMatch(/^[a-z_]+: /);
    }
    expect(MULTI_ROUND_DIMENSION).toMatch(/^multi_round_provenance: /);
  });
});

/* ------------------------------------------------------------------ the corpus contract */

const question = (over: Partial<RerunHistoryRound["questions"][number]> = {}) => ({
  kind: "creative" as const,
  question: "How formal should the evening read?",
  options: [{ label: "Black tie" }, { label: "Relaxed" }, { label: "You choose", isDefer: true }],
  ...over,
});

const validCase = (over: Partial<RerunCase> = {}): RerunCase => ({
  id: "RB-01",
  prompt: "A retirement dinner for my mum",
  dimension: RERUN_CAPABILITY_DIMENSIONS[0],
  history: [
    {
      questions: [question()],
      answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
    },
  ],
  ...over,
});

const corpus = (cases: unknown[]) => ({ version: "clarification_rerun_v1", cases });

describe("the structural contract refuses a case that would waste a paid call", () => {
  it("accepts a well-formed case", () => {
    expect(validateRerunCorpusShape(corpus([validCase()]))).toEqual([]);
  });

  it.each([
    ["no version", { cases: [validCase()] }],
    ["no cases", { version: "v1", cases: [] }],
    ["a missing id", corpus([validCase({ id: "" })])],
    ["a duplicate id", corpus([validCase(), validCase()])],
    ["a padded prompt", corpus([validCase({ prompt: " A dinner " })])],
    ["an unknown dimension", corpus([validCase({ dimension: "something_else" })])],
    ["no history", corpus([validCase({ history: [] })])],
  ])("refuses %s", (_label, value) => {
    expect(validateRerunCorpusShape(value).length).toBeGreaterThan(0);
  });

  it("refuses an answer to a question that does not exist", () => {
    // The property the redesign exists for: an answer can only name a question in its own case,
    // and the contract refuses one that does not.
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 3, selectedOptionLabel: "Black tie", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/must name a question of this round/);
  });

  it("refuses an option the question did not offer", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: "White tie", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/not one of the options offered/);
  });

  it("refuses a deferred boundary answer, because Route B offers no defer", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [
                {
                  kind: "boundary",
                  question: "Is the pregnancy public yet?",
                  options: [{ label: "Yes" }, { label: "Not yet" }],
                },
              ],
              answers: [
                { questionIndex: 0, selectedOptionLabel: "Yes", freeText: null, isDefer: true },
              ],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/boundary question offers no defer/);
  });

  it("refuses a creative question without exactly one defer option", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question({ options: [{ label: "Black tie" }, { label: "Relaxed" }] })],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Relaxed", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/exactly one defer option/);
  });

  it("refuses a defer flag that does not name the question's defer option", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [
                { questionIndex: 0, selectedOptionLabel: "Relaxed", freeText: null, isDefer: true },
              ],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/must select the question's own defer option/);
  });

  it("refuses selecting the defer option without recording it as a defer", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: "You choose", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/must be recorded as `isDefer`/);
  });

  it("refuses an answer that says nothing", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: null, freeText: "   " }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/must select an option or supply text/);
  });

  it("refuses two questions with the same text in one case", () => {
    // The CA-4 check locates each question in the request by its text and requires chronological
    // order; two identical texts make that undecidable.
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
            },
            {
              questions: [question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Relaxed", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/repeats or contains another question's/);
  });

  it("refuses a multi-round case with only one round of history", () => {
    const problems = validateRerunCorpusShape(
      corpus([validCase({ dimension: MULTI_ROUND_DIMENSION })]),
    );
    expect(problems.join(" ")).toMatch(/at least two history rounds/);
  });

  it("refuses an expectedFacts key the schema does not have", () => {
    // The largest silent hazard: the author is never shown the wire schema, so `venue` for
    // `venueText` would read as null, mismatch, and fail a clean run permanently.
    const problems = validateRerunCorpusShape(
      corpus([validCase({ expectedFacts: { venue: "the garden" } })]),
    );
    expect(problems.join(" ")).toMatch(/is not a supplied-fact field/);
    expect(
      validateRerunCorpusShape(corpus([validCase({ expectedFacts: { venueText: null } })])),
    ).toEqual([]);
  });

  it("refuses a round the real schema would reject", () => {
    // `buildSeededRevision` claims to be schema-valid by construction; that has to be true of
    // everything the contract admits, not of the examples anyone happened to write. A T9 assembly
    // that parses fail-closed would otherwise throw inside the call, and the runner would journal
    // our corpus defect as a provider failure and destroy a one-shot paid run.
    const boundary = {
      kind: "boundary" as const,
      question: "Is the pregnancy public yet?",
      options: [{ label: "Yes" }, { label: "Not yet" }],
    };
    const mixed = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [boundary, question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Yes", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(mixed.join(" ")).toMatch(/only question in its round/);

    const tooMany = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [
                question({ question: "How formal should the evening read?" }),
                question({ question: "Warm or cool in feel, overall?" }),
                question({ question: "Quiet or celebratory in voice?" }),
                question({ question: "Intimate or expansive in scale?" }),
              ],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(tooMany.join(" ")).toMatch(/at most 3 questions/);
  });

  it("refuses padded question text and padded labels, as it already refuses a padded prompt", () => {
    // Zod `.trim()` is a transform, not a rejection, so an assembly that parses the envelope
    // renders the trimmed text while the checks search for the padded one.
    expect(
      validateRerunCorpusShape(
        corpus([
          validCase({
            history: [
              {
                questions: [question({ question: "  How formal should the evening read?  " })],
                answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
              },
            ],
          }),
        ]),
      ).join(" "),
    ).toMatch(/question` must not have leading or trailing whitespace/);

    expect(
      validateRerunCorpusShape(
        corpus([
          validCase({
            history: [
              {
                questions: [
                  question({
                    options: [
                      { label: " Black tie " },
                      { label: "Relaxed" },
                      { label: "You choose", isDefer: true },
                    ],
                  }),
                ],
                answers: [{ questionIndex: 0, selectedOptionLabel: " Black tie ", freeText: null }],
              },
            ],
          }),
        ]),
      ).join(" "),
    ).toMatch(/label` must not have leading or trailing whitespace/);
  });

  it("refuses a question text that contains another question's", () => {
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
            },
            {
              questions: [question({ question: "Say more: How formal should the evening read?" })],
              answers: [{ questionIndex: 0, selectedOptionLabel: "Relaxed", freeText: null }],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/repeats or contains another question's/);
  });

  it("refuses answers listed out of question order", () => {
    // Production orders by `(round, question_index)`; this array is carried in the author's order.
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question(), question({ question: "Warm or cool in feel, overall?" })],
              answers: [
                { questionIndex: 1, selectedOptionLabel: "Black tie", freeText: null },
                { questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null },
              ],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/ascending `questionIndex` order/);
  });

  it("refuses an expected fact that quotes the model instead of asserting absence", () => {
    // A quoted value asks the author to predict a trimmed verbatim span — the dependency the
    // redesign removed everywhere else.
    expect(
      validateRerunCorpusShape(
        corpus([validCase({ expectedFacts: { venueText: "the orangery" } })]),
      ).join(" "),
    ).toMatch(/must be null/);
    expect(
      validateRerunCorpusShape(corpus([validCase({ expectedFacts: { venueText: null } })])),
    ).toEqual([]);
  });

  it("mirrors the real schema's bounds, and breaks here if the schema moves", () => {
    // The ceiling is imported, but the length bounds are literals inside a sha-frozen file. If
    // `clarificationQuestionSchema` ever tightened one, the validator would admit a corpus whose
    // seeded envelope the real schema rejects — and T9's fail-closed parse would throw inside the
    // paid call. This file is not frozen, so the drift breaks the build here instead of at T13.
    const withQuestion = (text: string) =>
      validateRerunCorpusShape(
        corpus([
          validCase({
            history: [
              {
                questions: [question({ question: text })],
                answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
              },
            ],
          }),
        ]),
      );
    const at240 = "Q".repeat(239) + "?";
    const at241 = "Q".repeat(240) + "?";
    // Against the real schema, with the `whyItMatters` the builder supplies.
    const asSchema = (text: string) => ({
      kind: "creative" as const,
      question: text,
      whyItMatters: seededWhyItMatters(1, 0),
      options: [
        { label: "Black tie", isDefer: false },
        { label: "Relaxed", isDefer: false },
        { label: "You choose", isDefer: true },
      ],
    });
    expect(clarificationQuestionSchema.safeParse(asSchema(at240)).success).toBe(true);
    expect(clarificationQuestionSchema.safeParse(asSchema(at241)).success).toBe(false);
    expect(withQuestion(at240)).toEqual([]);
    expect(withQuestion(at241).join(" ")).toMatch(/at most 240 characters/);

    const label = (text: string) =>
      validateRerunCorpusShape(
        corpus([
          validCase({
            history: [
              {
                questions: [
                  question({
                    options: [
                      { label: text },
                      { label: "Relaxed" },
                      { label: "You choose", isDefer: true },
                    ],
                  }),
                ],
                answers: [{ questionIndex: 0, selectedOptionLabel: text, freeText: null }],
              },
            ],
          }),
        ]),
      );
    expect(label("L".repeat(80))).toEqual([]);
    expect(label("L".repeat(81)).join(" ")).toMatch(/at most 80 characters/);
  });

  it("refuses padded free text, so the checks and the self-report cannot contradict", () => {
    // `historyDelivered` trims; `answersAssembledAsGiven` compares with `===`. A padded corpus
    // value would make the same assembly pass one and fail the other.
    expect(
      validateRerunCorpusShape(
        corpus([
          validCase({
            history: [
              {
                questions: [question()],
                answers: [
                  { questionIndex: 0, selectedOptionLabel: null, freeText: "  black tie  " },
                ],
              },
            ],
          }),
        ]),
      ).join(" "),
    ).toMatch(/freeText` must not have leading or trailing whitespace/);
  });

  it("refuses an answer that omits a key instead of stating it null", () => {
    // An omitted key is not a null one downstream: it reaches the checks as `undefined`, where a
    // `.length` on it would throw *after* the paid call, aborting a one-shot run outside the
    // try/catch and losing every remaining case. It also renders as the literal "undefined" in the
    // blind artifact. Refused at the gate, before money is spent.
    const problems = validateRerunCorpusShape(
      corpus([
        validCase({
          history: [
            {
              questions: [question()],
              answers: [{ questionIndex: 0, freeText: "warmer, please" } as never],
            },
          ],
        }),
      ]),
    );
    expect(problems.join(" ")).toMatch(/must state both/);
  });

  it("refuses a freeText that is neither null nor real text", () => {
    // The last reachable instance of B1's class: with an option selected, nothing above this rule
    // looks at `freeText`, so a non-string reaches `answer.freeText?.trim()` — `?.` guards nullish,
    // not type — and throws from `checkRerunCase`, outside the runner's try/catch, after the call
    // is paid for. An empty string does not crash but makes a T9 that reads it as `null` fail the
    // gating self-report comparison against a correct assembly.
    for (const freeText of [0, false, [], {}, ""]) {
      const problems = validateRerunCorpusShape(
        corpus([
          validCase({
            history: [
              {
                questions: [question()],
                answers: [
                  { questionIndex: 0, selectedOptionLabel: "Black tie", freeText } as never,
                ],
              },
            ],
          }),
        ]),
      );
      expect({ freeText, problems: problems.join(" ") }).toEqual({
        freeText,
        problems: expect.stringMatching(/must be null when the host typed nothing/),
      });
    }
    // …and null, or real text, still validates.
    expect(validateRerunCorpusShape(corpus([validCase()]))).toEqual([]);
  });

  it("does not throw on junk", () => {
    for (const junk of [null, undefined, "a string", 3, [], { cases: "no" }]) {
      expect(() => validateRerunCorpusShape(junk)).not.toThrow();
      expect(validateRerunCorpusShape(junk).length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ the mechanical checks */

const PROMPT = "A retirement dinner for my mum";
const QUESTION = "How formal should the evening read?";

/** What a correct assembly transmits: description verbatim, then question, then answer. */
const requestFor = (testCase: RerunCase = validCase()) =>
  [
    PROMPT,
    ...cumulativeHistory(testCase).map((answer) => {
      const q = testCase.history[answer.revision - 1].questions[answer.questionIndex];
      return `We asked: ${q.question} The host answered: ${answer.selectedOptionLabel ?? ""} ${
        answer.freeText ?? ""
      }`;
    }),
  ].join("\n");

const observation = (over: Partial<RerunObservation> = {}): RerunObservation => ({
  caseId: "RB-01",
  promptSent: PROMPT,
  requestText: requestFor(),
  result: { suppliedFacts: {}, clarification: { needed: false, questions: [] } },
  provisional: false,
  answersAssembled: cumulativeHistory(validCase()),
  assemblyVersion: "event_identity_input_v2",
  schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
  ...over,
});

const status = (checks: ReturnType<typeof checkRerunCase>, name: string) =>
  checks.find((check) => check.name === name)?.status;

const detail = (checks: ReturnType<typeof checkRerunCase>, name: string) =>
  checks.find((check) => check.name === name)?.detail ?? "";

describe("the mechanical checks decide what they can and refuse to guess the rest", () => {
  it("passes a clean observation", () => {
    const checks = checkRerunCase(validCase(), observation());
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("fails when the original description was rewritten", () => {
    expect(
      status(
        checkRerunCase(validCase(), observation({ promptSent: "… and make it warmer" })),
        "promptByteIdentical",
      ),
    ).toBe("fail");
  });

  it("fails an implementation that echoes the prompt back without sending it", () => {
    // The self-reported half is satisfied; the transmitted text does not contain the description.
    const checks = checkRerunCase(
      validCase(),
      observation({ requestText: "a paraphrase of the description" }),
    );
    expect(status(checks, "promptByteIdentical")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  /* --- CA-4 ------------------------------------------------------------------------------- */

  it("fails an assembly that sends the answer but omits the question it answers", () => {
    // The decided CA-4 behaviour: without the question, the host's answer reaches the model as
    // host-authored content with nothing to attribute it to.
    const checks = checkRerunCase(
      validCase(),
      observation({ requestText: `${PROMPT}\nThe host answered: Black tie` }),
    );
    expect(status(checks, "questionRenderedWithAnswer")).toBe("fail");
    expect(detail(checks, "questionRenderedWithAnswer")).toMatch(/no question attached/);
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("fails an assembly that resends the unselected option menu", () => {
    const checks = checkRerunCase(
      validCase(),
      observation({ requestText: `${requestFor()}\nOther options were: Relaxed, You choose` }),
    );
    expect(status(checks, "menuNotResent")).toBe("fail");
    expect(detail(checks, "menuNotResent")).toContain("Relaxed");
  });

  it("fails an assembly that resends model-authored rationale", () => {
    const checks = checkRerunCase(
      validCase(),
      observation({ requestText: `${requestFor()}\n${seededWhyItMatters(1, 0)}` }),
    );
    expect(status(checks, "menuNotResent")).toBe("fail");
    expect(detail(checks, "menuNotResent")).toContain("whyItMatters");
  });

  it("does not fail a correct assembly when two questions share a defer label", () => {
    // `spec.md §7.6b #4` puts a defer option on every creative question, and labels are unique only
    // within a question — so two rounds both offering "You decide" is ordinary, not a corpus
    // defect. The host defers on one and picks a real option on the other; the shared label is
    // legitimately in the request, and a per-answer carve-out would flag the other question's
    // identical unselected label and fail an absolute check permanently.
    const shared = validCase({
      dimension: MULTI_ROUND_DIMENSION,
      history: [
        {
          questions: [
            question({
              options: [
                { label: "Black tie" },
                { label: "Relaxed" },
                { label: "You decide", isDefer: true },
              ],
            }),
          ],
          answers: [
            { questionIndex: 0, selectedOptionLabel: "You decide", freeText: null, isDefer: true },
          ],
        },
        {
          questions: [
            question({
              question: "Quiet or celebratory in voice?",
              options: [
                { label: "Quiet" },
                { label: "Celebratory" },
                { label: "You decide", isDefer: true },
              ],
            }),
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Quiet", freeText: null }],
        },
      ],
    });
    expect(validateRerunCorpusShape(corpus([shared]))).toEqual([]);
    const checks = checkRerunCase(
      shared,
      observation({
        requestText: requestFor(shared),
        answersAssembled: cumulativeHistory(shared),
      }),
    );
    expect(status(checks, "menuNotResent")).toBe("pass");
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("does not fail a selected label that contains an unselected one", () => {
    const overlapping = validCase({
      history: [
        {
          questions: [
            question({
              options: [
                { label: "Warm" },
                { label: "Warm and candlelit" },
                { label: "You decide", isDefer: true },
              ],
            }),
          ],
          answers: [
            { questionIndex: 0, selectedOptionLabel: "Warm and candlelit", freeText: null },
          ],
        },
      ],
    });
    const checks = checkRerunCase(
      overlapping,
      observation({
        requestText: requestFor(overlapping),
        answersAssembled: cumulativeHistory(overlapping),
      }),
    );
    expect(status(checks, "menuNotResent")).toBe("pass");
  });

  it("flags rationale resent for a question nobody answered", () => {
    // Resending an unanswered question's rationale is the same violation as resending an answered
    // one's, so the sentinel is scanned for every seeded question.
    const twoQuestions = validCase({
      history: [
        {
          questions: [question(), question({ question: "Warm or cool in feel, overall?" })],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
        },
      ],
    });
    const checks = checkRerunCase(
      twoQuestions,
      observation({
        requestText: `${requestFor(twoQuestions)}\n${seededWhyItMatters(1, 1)}`,
        answersAssembled: cumulativeHistory(twoQuestions),
      }),
    );
    expect(status(checks, "menuNotResent")).toBe("fail");
    expect(detail(checks, "menuNotResent")).toContain("r1q1 whyItMatters");
  });

  /** The natural binary taste question, whose option labels are words of its own stem. */
  const stemCase = () =>
    validCase({
      dimension: MULTI_ROUND_DIMENSION,
      history: [
        {
          questions: [
            question({
              question: "Warm or cool in feel?",
              options: [
                { label: "Warm" },
                { label: "Cool" },
                { label: "You decide", isDefer: true },
              ],
            }),
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Warm", freeText: null }],
        },
        {
          questions: [
            question({
              question: "Quiet or celebratory in voice?",
              options: [
                { label: "Quiet" },
                { label: "Celebratory" },
                { label: "You decide", isDefer: true },
              ],
            }),
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Quiet", freeText: null }],
        },
      ],
    });

  it("does not let a question's own text stand in for the answer it was asked", () => {
    // "Warm or cool in feel?" with options "Warm"/"Cool" is the most natural way to write a binary
    // taste question, and the author is given no rule against it. `questionRenderedWithAnswer`
    // requires the question verbatim, so a bare substring test would find "Warm" inside it and
    // report `pass` on an assembly that never rendered the answer at all.
    const testCase = stemCase();
    expect(validateRerunCorpusShape(corpus([testCase]))).toEqual([]);
    const questionsOnly = [
      PROMPT,
      "We asked: Warm or cool in feel?",
      "We asked: Quiet or celebratory in voice?",
    ].join("\n");
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: questionsOnly, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(status(checks, "questionRenderedWithAnswer")).toBe("pass");
    expect(status(checks, "historyDelivered")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("still detects a crossing when the labels are words of their own questions", () => {
    const testCase = stemCase();
    const crossed = [
      PROMPT,
      "We asked: Warm or cool in feel? The host answered: Quiet",
      "We asked: Quiet or celebratory in voice? The host answered: Warm",
    ].join("\n");
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: crossed, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(status(checks, "answerBoundToItsQuestion")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("passes the same corpus when each answer is rendered with its own question", () => {
    const testCase = stemCase();
    const correct = [
      PROMPT,
      "We asked: Warm or cool in feel? The host answered: Warm",
      "We asked: Quiet or celebratory in voice? The host answered: Quiet",
    ].join("\n");
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: correct, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("reports n/a, never pass, when one answer cannot cross anything", () => {
    // With a single carried answer the window is the whole request, so this check can only fail
    // where `historyDelivered` already has. Six of the seven dimensions produce one answer, so a
    // `pass` here would print "rendered with the question it answers" over most of the corpus
    // while deciding nothing.
    const checks = checkRerunCase(validCase(), observation());
    expect(status(checks, "answerBoundToItsQuestion")).toBe("n/a");
    expect(detail(checks, "answerBoundToItsQuestion")).toMatch(/not decidable/);
    const passes = checks.filter((check) => check.status === "pass").map((check) => check.name);
    expect(passes).not.toContain("answerBoundToItsQuestion");
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("fails an assembly that renders each question with the other one's answer", () => {
    // Co-presence and order are not attribution: both texts present, in order, both labels
    // present, and the self-report echoes the request. Only the window check sees the crossing.
    const testCase = twoRounds();
    const crossed = [
      PROMPT,
      `We asked: ${QUESTION} The host answered: Quiet`,
      "We asked: Quiet or celebratory in voice? The host answered: Black tie",
    ].join("\n");
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: crossed, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(status(checks, "questionRenderedWithAnswer")).toBe("pass");
    expect(status(checks, "historyDelivered")).toBe("pass");
    expect(status(checks, "answersAssembledAsGiven")).toBe("pass");
    expect(status(checks, "answerBoundToItsQuestion")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("accepts an answer rendered before the question it answers", () => {
    // The window is loose on purpose: only a genuine crossing fails.
    const testCase = twoRounds();
    const inverted = [
      PROMPT,
      `The host answered: Black tie — we had asked: ${QUESTION}`,
      "The host answered: Quiet — we had asked: Quiet or celebratory in voice?",
    ].join("\n");
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: inverted, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(status(checks, "answerBoundToItsQuestion")).toBe("pass");
  });

  it("does not count an unselected label the host or the question already used", () => {
    // "Relaxed" appears because the host typed it, not because the menu was resent.
    const typed = validCase({
      history: [
        {
          questions: [question()],
          answers: [{ questionIndex: 0, selectedOptionLabel: null, freeText: "Relaxed, please" }],
        },
      ],
    });
    const checks = checkRerunCase(
      typed,
      observation({
        requestText: `${PROMPT}\nWe asked: ${QUESTION} The host answered: Relaxed, please`,
        answersAssembled: cumulativeHistory(typed),
      }),
    );
    expect(status(checks, "menuNotResent")).toBe("pass");
  });

  /* --- CA-5 ------------------------------------------------------------------------------- */

  const twoRounds = () =>
    validCase({
      dimension: MULTI_ROUND_DIMENSION,
      history: [
        {
          questions: [question()],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Black tie", freeText: null }],
        },
        {
          questions: [
            question({
              question: "Quiet or celebratory in voice?",
              options: [
                { label: "Quiet" },
                { label: "Celebratory" },
                { label: "You decide", isDefer: true },
              ],
            }),
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Quiet", freeText: null }],
        },
      ],
    });

  it("fails an assembly that drops the earlier round's answer", () => {
    // The decided CA-5 behaviour: EventIdentity is stateless, so round 2's request carrying only
    // round 2's answer has discarded what the host settled in round 1.
    const testCase = twoRounds();
    const latestOnly = `${PROMPT}\nWe asked: Quiet or celebratory in voice? The host answered: Quiet`;
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: latestOnly, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(status(checks, "historyDelivered")).toBe("fail");
    expect(detail(checks, "historyDelivered")).toMatch(/no longer available to the model/);
    expect(status(checks, "questionRenderedWithAnswer")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("passes a cumulative assembly, oldest first", () => {
    const testCase = twoRounds();
    const checks = checkRerunCase(
      testCase,
      observation({
        requestText: requestFor(testCase),
        answersAssembled: cumulativeHistory(testCase),
      }),
    );
    expect(status(checks, "historyDelivered")).toBe("pass");
    expect(status(checks, "questionRenderedWithAnswer")).toBe("pass");
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("fails a cumulative assembly that carries the rounds out of order", () => {
    const testCase = twoRounds();
    const reversed = [
      PROMPT,
      "We asked: Quiet or celebratory in voice? The host answered: Quiet",
      `We asked: ${QUESTION} The host answered: Black tie`,
    ].join("\n");
    const checks = checkRerunCase(
      testCase,
      observation({ requestText: reversed, answersAssembled: cumulativeHistory(testCase) }),
    );
    expect(status(checks, "questionRenderedWithAnswer")).toBe("fail");
    expect(detail(checks, "questionRenderedWithAnswer")).toMatch(/chronological/);
  });

  it("fails a self-report that is not the cumulative history", () => {
    const testCase = twoRounds();
    const checks = checkRerunCase(
      testCase,
      observation({
        requestText: requestFor(testCase),
        answersAssembled: cumulativeHistory(testCase).slice(1),
      }),
    );
    expect(status(checks, "answersAssembledAsGiven")).toBe("fail");
  });

  it("accepts padded free text an assembly legitimately trims", () => {
    const padded = validCase({
      history: [
        {
          questions: [question()],
          answers: [{ questionIndex: 0, selectedOptionLabel: null, freeText: "  black tie  " }],
        },
      ],
    });
    const checks = checkRerunCase(
      padded,
      observation({
        requestText: `${PROMPT}\nWe asked: ${QUESTION} The host typed: black tie`,
        answersAssembled: cumulativeHistory(padded),
      }),
    );
    expect(status(checks, "historyDelivered")).toBe("pass");
  });

  /* --- provenance, envelope and facts ------------------------------------------------------ */

  it("fails the pre-answers assembly version", () => {
    expect(
      status(
        checkRerunCase(
          validCase(),
          observation({ assemblyVersion: ASSEMBLY_VERSION_BEFORE_ANSWERS }),
        ),
        "assemblyVersionRecorded",
      ),
    ).toBe("fail");
  });

  it("fails an unexpected schema version", () => {
    expect(
      status(
        checkRerunCase(validCase(), observation({ schemaVersion: "event_identity_schema_v4" })),
        "schemaVersionExpected",
      ),
    ).toBe("fail");
  });

  it("fails, rather than passing quietly, when the lifecycle reader refused the envelope", () => {
    // A malformed clarification block moves no other check: the schema version is fine, the fact
    // checks are n/a, and `boundaryResolves` is n/a. Without this the case reports a pass over
    // evidence holding no clarification data at all.
    const checks = checkRerunCase(validCase(), observation({ provisional: "unreadable" }));
    expect(status(checks, "envelopeReadable")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("never calls an unreadable rerun 'still provisional'", () => {
    const boundary = validCase({
      history: [
        {
          questions: [
            {
              kind: "boundary",
              question: "Is the pregnancy public yet?",
              options: [{ label: "Yes" }, { label: "Not yet" }],
            },
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Yes", freeText: null }],
        },
      ],
    });
    const checks = checkRerunCase(
      boundary,
      observation({
        provisional: "unreadable",
        requestText: requestFor(boundary),
        answersAssembled: cumulativeHistory(boundary),
      }),
    );
    expect(detail(checks, "boundaryResolves")).toContain("unknown");
    expect(status(checks, "boundaryResolves")).toBe("advisory");
  });

  it("reports advisory, never fail, when a rerun still asks after a boundary answer", () => {
    const boundary = validCase({
      history: [
        {
          questions: [
            {
              kind: "boundary",
              question: "Is the pregnancy public yet?",
              options: [{ label: "Yes" }, { label: "Not yet" }],
            },
          ],
          answers: [{ questionIndex: 0, selectedOptionLabel: "Yes", freeText: null }],
        },
      ],
    });
    const checks = checkRerunCase(
      boundary,
      observation({
        provisional: true,
        requestText: requestFor(boundary),
        answersAssembled: cumulativeHistory(boundary),
      }),
    );
    expect(status(checks, "boundaryResolves")).toBe("advisory");
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("surfaces a verbatim re-ask as advisory, because a new question is legitimate", () => {
    const checks = checkRerunCase(
      validCase(),
      observation({
        result: {
          suppliedFacts: {},
          clarification: { needed: true, questions: [{ question: QUESTION }] },
        },
      }),
    );
    expect(status(checks, "reAskedAnsweredQuestion")).toBe("advisory");
    expect(mechanicalPass(checks)).toBe(true);
  });

  it("does not fail an inference the brief is required to make", () => {
    // `spec.md §7.5` wants generous inference: a host picking a garden option should see a
    // garden-party looseness in the creative direction with `venueText` left null.
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["garden"] }),
      observation({
        result: {
          suppliedFacts: { venueText: null },
          identity: { creativeDirection: "garden-party ease" },
        },
      }),
    );
    expect(status(checks, "noInventedFacts")).toBe("pass");
  });

  it("does not fail a clean envelope over a term that is also a field name", () => {
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["venue"] }),
      observation({ result: { suppliedFacts: { venueText: null, dateText: null } } }),
    );
    expect(status(checks, "noInventedFacts")).toBe("pass");
  });

  it("still fails an answer that became a supplied fact", () => {
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["garden"] }),
      observation({ result: { suppliedFacts: { venueText: "the garden" } } }),
    );
    expect(status(checks, "noInventedFacts")).toBe("fail");
  });

  it("fails an expected fact that did not hold", () => {
    const checks = checkRerunCase(
      validCase({ expectedFacts: { venueText: "the orangery" } }),
      observation({ result: { suppliedFacts: { venueText: null } } }),
    );
    expect(status(checks, "expectedFacts")).toBe("fail");
  });

  it("reports n/a rather than passing when a case asserts nothing", () => {
    const checks = checkRerunCase(validCase(), observation());
    expect(status(checks, "expectedFacts")).toBe("n/a");
    expect(status(checks, "noInventedFacts")).toBe("n/a");
  });

  it("counts neither advisory nor n/a as a pass", () => {
    const checks = checkRerunCase(validCase(), observation());
    const passes = checks.filter((check) => check.status === "pass").map((check) => check.name);
    expect(passes).not.toContain("expectedFacts");
    expect(passes).not.toContain("boundaryResolves");
  });

  it("does not throw on an any-typed return that put undefined in the request", () => {
    // A frozen check that throws mid-run costs the whole one-shot set; one that reports `fail`
    // costs a line in the report.
    const checks = checkRerunCase(
      validCase(),
      observation({ requestText: undefined as unknown as string }),
    );
    expect(status(checks, "promptByteIdentical")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });
});

/* ------------------------------------------------------------------ the blind artifact */

describe("the blind artifact tells the reviewer what to look for, and nothing else", () => {
  const testCase = validCase();
  const artifact = buildRerunReviewArtifact(
    [{ requestText: requestFor(), result: { identity: { copyTone: "warm" } } }],
    [testCase],
  );

  it("asks the three frozen questions", () => {
    expect(flat(artifact)).toContain("current input, rather than as a rewrite");
    expect(flat(artifact)).toContain("did the rerun respect the");
    expect(flat(artifact)).toContain("avoid re-asking what had already been answered");
  });

  it("shows the reviewer the question and the answer they are being asked about", () => {
    expect(artifact).toContain(QUESTION);
    expect(artifact).toContain("Black tie");
    expect(artifact).toContain(PROMPT);
  });

  it("says on its face that the setup was not generated", () => {
    // A reviewer who mistook fixture state for provider output would be reading this run as
    // evidence about question generation, which it explicitly is not.
    expect(flat(artifact)).toContain("No model produced the setup");
    expect(artifact).toContain("Frozen setup — written by hand, not generated");
    expect(flat(artifact)).toContain(
      "Only the final interpretation in each block came from a live call",
    );
  });

  it("does not ask whether it passes, and leaks no expectation", () => {
    expect(artifact).toContain("You are not asked whether this passes.");
    expect(artifact).not.toContain("RB-01");
    expect(artifact).not.toContain("dimension");
    expect(artifact).not.toContain("expectedFacts");
    expect(artifact).not.toContain("mustNotInvent");
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

  it("scans the provider boundary, which carries model-visible text today", () => {
    // Naming a future file is not enough on its own. `userMessage()` in this file already builds
    // the delimiters, the markers, the untrusted-data instruction and the no-inspiration line, and
    // the repair retry adds more — none of it scanned until now. Without this, a T9 implementer
    // could satisfy the version guard by creating an empty `event-identity-input.ts` and writing
    // the real labels here, leaving them unscanned with the corpus frozen and the scanner frozen.
    const boundary = MODEL_VISIBLE_SURFACES["provider boundary"];
    expect(boundary).toBe("src/lib/ai/openai/event-identity.ts");
    expect(existsSync(`${ROOT}${boundary}`)).toBe(true);
    const source = read(boundary);
    expect(source).toContain("HOST_EVENT_DESCRIPTION");
    expect(source).toContain("There is no visual inspiration supplied with this request.");
    // And the scan reads the shared declaration rather than a list of its own.
    expect(read("src/lib/ai/evals/prompt-leakage.test.ts")).toContain("MODEL_VISIBLE_SURFACES");
  });

  it("describes v1 truthfully, because the bump rule depends on it", () => {
    // Phase 4A sent the prompt only and told the model no inspiration was supplied. Describing v1
    // as "prompt plus inspiration" would mean a later implementer adding that channel could
    // reasonably conclude v1 already covers it and not bump — under a rule that says adding a
    // channel bumps.
    const versions = read("src/lib/ai/versions.ts");
    expect(versions).toContain("the original prompt only");
    expect(versions).not.toContain("prompt plus inspiration");
    const boundary = read("src/lib/ai/openai/event-identity.ts");
    expect(boundary).toContain("There is no visual inspiration supplied with this request.");
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
