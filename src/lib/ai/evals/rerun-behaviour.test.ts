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
  checkRerunCase,
  mechanicalPass,
  RERUN_ACCEPTANCE,
  RERUN_CAPABILITY_DIMENSIONS,
  rerunRunnerUnavailable,
  validateRerunCorpusShape,
  type RerunAnswerInput,
  type RerunCase,
  type RerunObservation,
} from "./rerun-behaviour";
import { EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "../versions";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const RUNNER = read("tests/eval/clarification-rerun.eval.ts");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * The body of the per-round loop, so ordering claims are about the round rather than about where
 * two strings happen to fall in the file.
 */
const roundBody = () => {
  const from = RUNNER.indexOf("for (const round of testCase.rounds) {");
  const to = RUNNER.indexOf("const checks = checkRerunCase(");
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return RUNNER.slice(from, to);
};

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
    expect(() =>
      rerunRunnerUnavailable({ prompt: "x", answers: [], priorResults: [], priorAnswers: [] }),
    ).toThrow(/does not exist yet/);
    expect(() =>
      rerunRunnerUnavailable({ prompt: "x", answers: [], priorResults: [], priorAnswers: [] }),
    ).toThrow(/T9/);
    // The runner binds through the seam module, which today resolves to the refusal above. That
    // indirection is what lets the runner itself be frozen with no exception: see below.
    expect(RUNNER).toContain('import { rerunRunner } from "@/lib/ai/evals/rerun-seam"');
    expect(RUNNER).toContain("const run = rerunRunner;");
    // The seam is typed, not a bare re-export, and stays typed after T9 fills it. Both assertions
    // below are written to survive that: they pin the shape, not today's right-hand side.
    const seam = read("src/lib/ai/evals/rerun-seam.ts");
    expect(seam).toMatch(/export const rerunRunner: RerunCallRunner =/);
    // Small enough that what T9 changes here is reviewable at a glance.
    const code = seam
      .split("\n")
      .filter(
        (line) => line.trim() && !line.trim().startsWith("*") && !line.trim().startsWith("/*"),
      );
    expect(code.length).toBeLessThanOrEqual(3);
    // …and today it resolves to the refusal.
    expect(seam).toContain("rerunRunnerUnavailable");
  });

  it("journals each paid response inside the round, not after the loop", () => {
    // A one-shot set making two calls per case must not lose the whole run to a failure on the
    // last one. Asserting only "append appears before checkRerunCase in the file" would pass a
    // runner that buffered every round and wrote once at the end, which is the failure mode this
    // exists to exclude — so the append is located inside the round body itself.
    const body = roundBody();
    const call = body.indexOf("await run(");
    const append = body.indexOf("appendJournal(");
    const record = body.indexOf("observed.promptsSent.push");
    expect(call).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(call);
    expect(record).toBeGreaterThan(append);
    expect(body).toContain("raw: outcome.raw");
    expect(RUNNER).toContain("JOURNAL_FILENAME");
    // …and before any checking, which happens once the rounds are done.
    expect(body.indexOf("responseEntry(")).toBeGreaterThan(call);
    expect(RUNNER.indexOf("appendJournal(")).toBeLessThan(RUNNER.indexOf("checkRerunCase("));
  });

  it("journals a billed response that validation then rejected, and still fails loudly", () => {
    // `docs/model-contracts.md`: text the provider returned and our validation rejected "is a call
    // that was answered and billed, not one that produced nothing". Without this, a rejection on
    // round 2 of case 5 destroys every paid response of a one-shot set — the same loss as the
    // success path, on the branch nobody rehearses.
    const body = roundBody();
    expect(body).toContain("try {");
    expect(body).toContain("} catch (error) {");
    const journalled = body.indexOf("failureEntry(");
    const rethrow = body.indexOf("throw error;");
    expect(journalled).toBeGreaterThan(-1);
    // Journalled first, rethrown unchanged second: the run still fails, with the text kept.
    expect(rethrow).toBeGreaterThan(journalled);
    expect(body).toContain("rawResponses: failure.rawResponses ?? []");
    // The seam says what a thrower must carry, so T9 cannot discover this requirement late.
    expect(flat(read("src/lib/ai/evals/rerun-behaviour.ts"))).toContain("rawResponses?: string[]");
  });

  it("rotates every previous evidence file aside, before the first call", () => {
    // `EVAL_OVERWRITE=1` is the only way past the write-once refusal, and it does not truncate a
    // JSONL append. Without rotation two runs' rounds interleave in one file.
    const rotate = RUNNER.indexOf("rotateJournal(OUT, runStartedAt)");
    expect(rotate).toBeGreaterThan(-1);
    expect(rotate).toBeLessThan(RUNNER.indexOf("for (const testCase of"));
    expect(RUNNER).toContain("kept the previous");
    // The reports move too, and at the start. Written only after the last case, a surviving
    // previous report would sit beside an aborted run's partial journal and make the directory
    // read as a completed run — the same defect as the journal, one file along.
    expect(RUNNER).toContain('rotateAside(OUT, "mechanical-report.md", runStartedAt)');
    expect(RUNNER).toContain('rotateAside(OUT, "blind-review.md", runStartedAt)');
  });

  it("stamps the completion signal with the run it completed", () => {
    // This set writes no `run.json`, so `mechanical-report.md` — written only after the last case
    // — is its completion marker. A marker with no run identity cannot be told from another run's.
    expect(RUNNER).toContain("Run started: ");
    expect(RUNNER).toContain("${runStartedAt}");
    expect(RUNNER).toContain("${corpus.version}");
  });

  it("records what was transmitted, not only what the implementation says it sent", () => {
    // The two absolute criteria are otherwise satisfiable by an implementation that echoes its
    // arguments. `requestText` is the field an echo cannot supply without also fabricating it.
    expect(RUNNER).toContain("observed.requestTexts.push(outcome.requestText)");
    expect(RUNNER).toContain("transmitted: outcome.requestText");
    expect(read("src/lib/ai/evals/rerun-behaviour.ts")).toContain("requestText: string;");
  });

  it("accepts a cumulative envelope as well as a per-round one", () => {
    // EventIdentity is stateless, so a per-round envelope loses round 2's answer by round 3 — and
    // `multi_round_provenance` promises it is not lost. Both shapes are legitimate; the check is
    // against the corpus, so an assembly that drops a round still matches neither.
    const threeRounds = validCase({
      rounds: [
        { answers: [] },
        { answers: [answer({ selectedOptionLabel: "Warmer" })] },
        { answers: [answer({ selectedOptionLabel: "Quieter" })] },
      ],
    });
    const base = {
      promptsSent: [PROMPT, PROMPT, PROMPT],
      requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> A2`, `<<<${PROMPT}>>> A2 A3`],
      results: [{ suppliedFacts: {} }, { suppliedFacts: {} }, { suppliedFacts: {} }],
      provisional: [false, false, false],
      schemaVersions: Array(3).fill(EVENT_IDENTITY_SCHEMA_VERSION),
      assemblyVersions: Array(3).fill("event_identity_input_v2"),
    };
    const cumulative = checkRerunCase(
      threeRounds,
      observation({
        ...base,
        answersAssembled: [
          [],
          threeRounds.rounds[1].answers,
          [...threeRounds.rounds[1].answers, ...threeRounds.rounds[2].answers],
        ],
      }),
    );
    expect(status(cumulative, "answersAssembledAsGiven")).toBe("pass");

    const perRound = checkRerunCase(
      threeRounds,
      observation({
        ...base,
        answersAssembled: [[], threeRounds.rounds[1].answers, threeRounds.rounds[2].answers],
      }),
    );
    expect(status(perRound, "answersAssembledAsGiven")).toBe("pass");

    // …and an assembly that carries round 2 forward while dropping round 3 matches neither.
    const dropped = checkRerunCase(
      threeRounds,
      observation({
        ...base,
        answersAssembled: [[], threeRounds.rounds[1].answers, threeRounds.rounds[1].answers],
      }),
    );
    expect(status(dropped, "answersAssembledAsGiven")).toBe("fail");
  });

  it("does not fail a clean envelope over a term that is also a field name", () => {
    // Every `suppliedFacts` key is present on every response, so scanning the object would put
    // "venueText" in the blob and fail an author who wrote `mustNotInvent: ["venue"]`.
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["venue"] }),
      observation({
        results: [{ suppliedFacts: {} }, { suppliedFacts: { venueText: null, dateText: null } }],
      }),
    );
    expect(status(checks, "noInventedFacts")).toBe("pass");
  });

  it("hands the assembly the rounds a locator resolves against", () => {
    // Production resolves (revision, question_index) against an immutable revision. There is none
    // here, so the prior results are passed — rather than restating the question in the corpus,
    // where it could disagree with what the model actually asked.
    expect(RUNNER).toContain("priorResults: [...observed.results]");
    // …and the earlier rounds' answers, from the corpus rather than from the implementation's own
    // report, so a cumulative envelope is buildable without closing a loop the checks exist to
    // open.
    expect(RUNNER).toContain("priorAnswers: testCase.rounds.slice(0, roundNumber - 1)");
  });

  it("records an unreadable envelope rather than losing the run to it", () => {
    // `isProvisional` fails closed. Letting it throw would abort the one authorized run in exactly
    // the case `schemaVersionExpected` was frozen to report.
    expect(RUNNER).toContain("UnreadableIdentityError");
    expect(RUNNER).toContain('observed.provisional.push("unreadable")');
    expect(RUNNER).toContain("if (!(error instanceof UnreadableIdentityError)) throw error;");
  });

  it("writes real journal entries, under the journal's own filename", () => {
    // An inline literal under `raw-responses.jsonl` is not a `JournalEntry`: `readJournal` types
    // every line as one, so a recovery filtering on `status === "response"` would silently drop
    // this set's responses. Building them through the constructors is what makes the status, and
    // the required telemetry, non-optional at the call site.
    expect(RUNNER).toContain("responseEntry(");
    expect(RUNNER).toContain("failureEntry(");
    expect(RUNNER).toContain("appendJournal(");
    expect(RUNNER).not.toContain("appendFileSync(");
    expect(RUNNER).toContain("telemetry: outcome.telemetry");
    // The corpus does not determine what was sent — that is this set's whole subject — so the
    // assembled input travels on the line.
    expect(RUNNER).toContain("promptSent: outcome.promptSent");
    expect(RUNNER).toContain("answersAssembled: outcome.answersAssembled");
  });

  it("carries telemetry on the seam, so this set's evidence can say what it cost", () => {
    const source = read("src/lib/ai/evals/rerun-behaviour.ts");
    expect(source).toContain("telemetry: RerunTelemetry;");
    // One copy of the version, for the reason `journal.ts` gives.
    expect(source).not.toMatch(/^\s*schemaVersion: string;$/m);
    expect(RUNNER).toContain("outcome.telemetry.schemaVersion");
  });

  it("sets its own timeout, rather than inheriting one sized for another set", () => {
    // The eval project's 15 minutes was chosen for a twelve-call set. This one makes at least two
    // calls per case and `validateRerunCorpusShape` caps neither cases nor rounds; aborting a
    // one-shot set mid-flight forces the `EVAL_OVERWRITE=1` path.
    expect(RUNNER).toContain("45 * 60 * 1000");
    expect(Number(/(\d+) \* 60 \* 1000/.exec(RUNNER)?.[1])).toBeGreaterThan(15);
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
    ).toBe("660712a331509b1ee4366ea85be88e3f2e9a4cb31c4b2dba64e2f1689cac9d49");
  });

  it("does not change at all", () => {
    const digest = createHash("sha256").update(RUNNER, "utf8").digest("hex");
    expect(
      digest,
      "tests/eval/clarification-rerun.eval.ts changed. It was frozen at T5, before the validation " +
        "cases were authored, and it has no permitted edit: T9 repoints " +
        "src/lib/ai/evals/rerun-seam.ts instead. Do not update this hash to silence the failure.",
    ).toBe("f6f5a20053ab712d4b00fbc63b98e0498573d38f51a853ea695cc78f44f45ecd");
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
    expect(RERUN_ACCEPTANCE.mechanical).toMatch(/answersReachedTheModel/);
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

const answer = (over: Partial<RerunAnswerInput> = {}): RerunAnswerInput => ({
  questionIndex: 0,
  kind: "creative",
  selectedOptionLabel: "Warmer",
  freeText: null,
  isDefer: false,
  ...over,
});

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
    // The journal names rounds `<id>#<round>`, and a recovery joins on the part before the `#`.
    ["an id containing #", corpus([validCase({ id: "RB-01#boundary" })])],
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

const PROMPT = "A retirement dinner for my mum";

const observation = (over: Partial<RerunObservation> = {}): RerunObservation => ({
  caseId: "RB-01",
  promptsSent: [PROMPT, PROMPT],
  // Distinct per round, and each containing the description verbatim: what a real assembly
  // transmits. The default is the passing case; the tests below break it deliberately.
  requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> answer: Warmer`],
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

const detail = (checks: ReturnType<typeof checkRerunCase>, name: string) =>
  checks.find((check) => check.name === name)?.detail ?? "";

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

  it("fails an implementation that echoes its own prompt back without sending it", () => {
    // The self-reported half is satisfied — `promptsSent` is the case's prompt on both rounds —
    // but the text actually transmitted does not contain it. Without the transmitted anchor this
    // case passes tautologically, which is what makes the criterion a measurement.
    const checks = checkRerunCase(
      validCase(),
      observation({ requestTexts: ["a paraphrase of the description", "another paraphrase"] }),
    );
    expect(status(checks, "promptByteIdentical")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("fails when a round carrying answers transmitted the same text as round 1", () => {
    // Answers that changed nothing about the request did not reach the model, whatever the
    // implementation reports having assembled.
    const checks = checkRerunCase(
      validCase(),
      observation({ requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>>`] }),
    );
    expect(status(checks, "answersReachedTheModel")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("fails when the host's own words were not transmitted", () => {
    const withText = validCase({
      rounds: [
        { answers: [] },
        {
          answers: [
            {
              questionIndex: 0,
              kind: "creative",
              selectedOptionLabel: null,
              freeText: "keep it black tie",
              isDefer: false,
            },
          ],
        },
      ],
    });
    const checks = checkRerunCase(
      withText,
      observation({
        requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> the host answered something`],
        answersAssembled: [[], withText.rounds[1].answers],
      }),
    );
    expect(status(checks, "answersReachedTheModel")).toBe("fail");
  });

  it("passes when the answer text is transmitted, whatever the label rendering", () => {
    // The option *label* is deliberately not required verbatim: how a chosen option is rendered is
    // the assembly's business, and freezing a rendering would fail a legitimate implementation.
    const checks = checkRerunCase(
      validCase(),
      observation({
        requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> the host asked for a warmer register`],
      }),
    );
    expect(status(checks, "answersReachedTheModel")).toBe("pass");
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

  it("fails, and says which rounds, when the lifecycle reader refused an envelope", () => {
    // The gating check exists because one of the two causes moves nothing else: a malformed
    // clarification block leaves the schema version fine, `boundaryResolves` n/a or advisory, and
    // the fact checks n/a — a mechanical pass over evidence holding no clarification data at all.
    const checks = checkRerunCase(validCase(), observation({ provisional: [false, "unreadable"] }));
    expect(status(checks, "envelopeReadable")).toBe("fail");
    expect(detail(checks, "envelopeReadable")).toContain("round(s) 2");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("never calls an unreadable final round 'still provisional'", () => {
    const withBoundary = validCase({
      rounds: [
        { answers: [] },
        {
          answers: [
            {
              questionIndex: 0,
              kind: "boundary",
              selectedOptionLabel: "It is a surprise",
              freeText: null,
              isDefer: false,
            },
          ],
        },
      ],
    });
    const checks = checkRerunCase(
      withBoundary,
      observation({
        provisional: [false, "unreadable"],
        answersAssembled: [[], withBoundary.rounds[1].answers],
      }),
    );
    // Saying "still provisional" would assert something about the model on a round whose envelope
    // was never read — the defect the runner's own comment says it exists to prevent.
    expect(detail(checks, "boundaryResolves")).toContain("unknown");
    expect(status(checks, "boundaryResolves")).toBe("advisory");
  });

  it("does not fail an inference the brief is required to make", () => {
    // `spec.md §7.5` wants generous inference. A host picking "Garden party" should see a
    // garden-party looseness in the creative direction and `venueText` left null; scanning the
    // whole envelope would fail that correct case permanently.
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["garden"] }),
      observation({
        results: [
          { suppliedFacts: {} },
          {
            suppliedFacts: { venueText: null },
            identity: { creativeDirection: "garden-party ease" },
          },
        ],
      }),
    );
    expect(status(checks, "noInventedFacts")).toBe("pass");
  });

  it("still fails an answer that became a supplied fact", () => {
    const checks = checkRerunCase(
      validCase({ mustNotInvent: ["garden"] }),
      observation({
        results: [{ suppliedFacts: {} }, { suppliedFacts: { venueText: "the garden" } }],
      }),
    );
    expect(status(checks, "noInventedFacts")).toBe("fail");
  });

  it("fails when a later round repeats the previous round's request", () => {
    // Three rounds; the assembly carries round 2's answers forward and drops round 3's. Round 3
    // differs from round 1, so a round-1-only comparison passes it — on `multi_round_provenance`.
    const threeRounds = validCase({
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
        {
          answers: [
            {
              questionIndex: 0,
              kind: "creative",
              selectedOptionLabel: "Quieter",
              freeText: null,
              isDefer: false,
            },
          ],
        },
      ],
    });
    const checks = checkRerunCase(
      threeRounds,
      observation({
        promptsSent: [PROMPT, PROMPT, PROMPT],
        requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> A2`, `<<<${PROMPT}>>> A2`],
        results: [{ suppliedFacts: {} }, { suppliedFacts: {} }, { suppliedFacts: {} }],
        provisional: [false, false, false],
        schemaVersions: [
          EVENT_IDENTITY_SCHEMA_VERSION,
          EVENT_IDENTITY_SCHEMA_VERSION,
          EVENT_IDENTITY_SCHEMA_VERSION,
        ],
        assemblyVersions: [
          "event_identity_input_v2",
          "event_identity_input_v2",
          "event_identity_input_v2",
        ],
        answersAssembled: [[], threeRounds.rounds[1].answers, threeRounds.rounds[2].answers],
      }),
    );
    expect(status(checks, "answersReachedTheModel")).toBe("fail");
    expect(detail(checks, "answersReachedTheModel")).toContain("the previous round");
  });

  it("accepts padded free text an assembly legitimately trims", () => {
    const padded = validCase({
      rounds: [
        { answers: [] },
        {
          answers: [
            {
              questionIndex: 0,
              kind: "creative",
              selectedOptionLabel: null,
              freeText: "  black tie  ",
              isDefer: false,
            },
          ],
        },
      ],
    });
    const checks = checkRerunCase(
      padded,
      observation({
        requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> the host typed: black tie`],
        answersAssembled: [[], padded.rounds[1].answers],
      }),
    );
    expect(status(checks, "answersReachedTheModel")).toBe("pass");
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
      requestTexts: [`<<<${PROMPT}>>>`, `<<<${PROMPT}>>> the host asked for a warmer register`],
      answersAssembled: [
        [],
        [
          {
            questionIndex: 0,
            kind: "creative",
            selectedOptionLabel: "Warmer",
            freeText: "keep it black tie",
            isDefer: false,
          },
        ],
      ],
      results: [{ identity: { copyTone: "warm" } }, { identity: { copyTone: "warmer" } }],
    },
  ]);

  it("shows the reviewer the answer they are being asked about", () => {
    // Questions 1 and 2 are unanswerable without it, and `promptsSent` cannot supply it: it is
    // byte-identical on every round by construction, so an artifact built from it shows the same
    // paragraph twice and never shows the answer.
    expect(artifact).toContain("the host asked for a warmer register");
    expect(artifact).toContain("answers carried in");
    expect(artifact).toContain("q0 (creative)");
    expect(artifact).toContain("Warmer");
    expect(artifact).toContain("keep it black tie");
  });

  it("shows what was transmitted, which is the one field that is not self-reported", () => {
    expect(artifact).toContain("what was sent");
    expect(artifact).toContain(PROMPT);
  });

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
