/**
 * The Phase 4C evidence machinery and the §3.7 gate, verified without running either.
 *
 * `docs/model-evals/eval-incidents.md`: *"Never execute the eval runner to verify the harness. Not
 * its paths, not its guards, not its schemas, not its reports, not its refusals."* Three accidental
 * paid runs produced that rule, the third while verifying the very guard meant to prevent the
 * second. So every property of `tests/eval/design-intent.eval.ts` is asserted here from its
 * **source text** and from the pure modules beside it, and this file never imports it.
 *
 * Four things this file exists to hold true, in order of what they cost if they slip:
 *
 * 1. the gate's text is the plan's text, not a paraphrase that can drift from it;
 * 2. nothing frozen at T19 changes afterwards — enforced by hash, not by a comment;
 * 3. no 4C corpus exists yet, and every slot refuses without one;
 * 4. the reviewer packet carries the definitions and **none** of the arithmetic.
 *
 * Acceptance criteria: N/A — benchmark integrity and gate provenance. `spec.md §11.9` discipline;
 * `docs/model-contracts.md §4.7`; `docs/phase-4b-plan.md §3.1`–`§3.8`, Part IV T19.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CORPUS_FILES, corpusPath, EVAL_SETS, isProtectedOutput } from "./corpus";
import {
  buildDesignIntentBlindArtifact,
  buildDesignIntentMechanicalReport,
  buildDesignIntentReviewerPacket,
  buildIdentityEnvelope,
  canChooseDistinct,
  checkDesignIntentBatch,
  DESIGN_INTENT_ACCEPTANCE,
  DESIGN_INTENT_CAPABILITY_DIMENSIONS,
  designIntentRunnerUnavailable,
  GATED_DESIGN_INTENT_SET,
  hexColorsIn,
  hexDeltaE,
  MECHANICAL_FLOORS,
  measureCorpus,
  mechanicalPass,
  normalizeEventType,
  paletteDistance,
  paletteFamily,
  sameEventTypePairCount,
  validateDesignIntentCorpusShape,
  type BatchObservation,
  type DesignIntentCase,
  type DesignIntentCheck,
} from "./design-intent-evidence";
import {
  BAND_AND_WOWABLE_NOT_INTERCHANGEABLE,
  BAND_IDS,
  CORPUS_COMPOSITION_REQUIREMENT,
  decideDesignIntentGate,
  DESIGN_INTENT_BANDS,
  DISTRIBUTION_RULE,
  EVIDENCE_CLASSES,
  EXCELLENT_IS_NOT_A_DEMAND_FOR_NOVELTY,
  EXCELLENT_REQUIREMENTS,
  MINIMUM_WOWABLE_ANSWER_INSTRUCTION,
  MINIMUM_WOWABLE_CRITERIA,
  MINIMUM_WOWABLE_QUESTION,
  MINIMUM_WOWABLE_REQUIRES_ALL_FIVE,
  MINIMUM_WOWABLE_STAYS_QUALITATIVE,
  REVIEWER_PRODUCTS,
  REVIEWER_WITHHELD,
  SAME_EVENT_TYPE_PAIR_MINIMUM,
  SEALED_CORPUS_BATCHES,
  SYSTEMIC_CATEGORIES,
  SYSTEMIC_CATEGORY_IDS,
  SYSTEMIC_CLASSES,
  SYSTEMIC_EVIDENCE_REQUIREMENTS,
  SYSTEMIC_THRESHOLD_BATCHES,
  type ReviewerBatchJudgement,
  type ReviewerReturn,
  type ReviewerSystemicAssessment,
  type SystemicCategoryId,
} from "./design-intent-gate";
import { eventIdentitySchema, type EventIdentity } from "../event-identity/contract";
import { planConceptBatch } from "@/lib/generation/planner";
import { assertAuthoritative } from "@/lib/ai/event-identity/lifecycle";
import { EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const RUNNER = read("tests/eval/design-intent.eval.ts");
const GATE = read("src/lib/ai/evals/design-intent-gate.ts");
const EVIDENCE = read("src/lib/ai/evals/design-intent-evidence.ts");
const PLAN = read("docs/phase-4b-plan.md");
const flat = (text: string) => text.replace(/\s+/g, " ").trim();
/**
 * Prose wraps, and §3.7 states two of its rules as blockquotes. Dropping the `>` markers first is
 * what lets a wrapped quotation be compared as one sentence rather than as lines with a marker in
 * the middle — the same normalisation `harness-provenance.test.ts` already uses on canon.
 */
const FLAT_PLAN = flat(PLAN.replace(/^\s*>\s?/gm, ""));

const CORPORA = [
  "designIntentRegression",
  "designIntentValidation",
  "designIntentChallenge",
] as const;

/* ------------------------------------------------------------------ the text is the plan's text */

describe("the gate is the plan's own words, not a paraphrase of them", () => {
  /**
   * Two copies of a rule that can drift apart is the defect a freeze exists to prevent, and a
   * paraphrase drifts silently: nothing fails when a summary softens. So every definitional string
   * in the gate module has to be findable in `docs/phase-4b-plan.md`, whitespace aside.
   *
   * If this fails, the fix is to bring the module back to the plan — never to edit `§3.7` to match
   * the module, which is `spec.md §11.9`'s failure mode wearing a different hat.
   */
  const inPlan = (label: string, text: string) =>
    it(`carries ${label} verbatim`, () => {
      expect(FLAT_PLAN, `${label} is not §3.7's text any more`).toContain(flat(text));
    });

  DESIGN_INTENT_BANDS.forEach((band) => inPlan(`the ${band.band} band`, band.definition));
  EXCELLENT_REQUIREMENTS.forEach((requirement, index) =>
    inPlan(`Excellent requirement ${index + 1}`, requirement),
  );
  inPlan("the Excellent caveat", EXCELLENT_IS_NOT_A_DEMAND_FOR_NOVELTY);
  inPlan("the distribution rule", DISTRIBUTION_RULE);
  inPlan("the corpus composition requirement", CORPUS_COMPOSITION_REQUIREMENT);
  inPlan("the minimum-wowable question", MINIMUM_WOWABLE_QUESTION);
  inPlan("the minimum-wowable answer instruction", MINIMUM_WOWABLE_ANSWER_INSTRUCTION);
  inPlan("the all-five rule", MINIMUM_WOWABLE_REQUIRES_ALL_FIVE);
  inPlan("the stays-qualitative rule", MINIMUM_WOWABLE_STAYS_QUALITATIVE);
  inPlan("the non-interchangeability rule", BAND_AND_WOWABLE_NOT_INTERCHANGEABLE);
  MINIMUM_WOWABLE_CRITERIA.forEach((criterion) =>
    inPlan(`minimum-wowable criterion ${criterion.id}`, criterion.criterion),
  );
  SYSTEMIC_CATEGORIES.forEach((category) => inPlan(category.id, category.pattern));
  SYSTEMIC_CLASSES.forEach((klass) => inPlan(`the ${klass.id} threshold`, klass.why));
  SYSTEMIC_EVIDENCE_REQUIREMENTS.forEach((requirement, index) =>
    inPlan(`systemic condition ${index + 1}`, requirement),
  );
  REVIEWER_PRODUCTS.forEach((product, index) => inPlan(`reviewer product ${index + 1}`, product));
  REVIEWER_WITHHELD.forEach((withheld) => inPlan(`the withheld item "${withheld}"`, withheld));
  EVIDENCE_CLASSES.forEach((evidenceClass) => {
    inPlan(`the ${evidenceClass.id} class's timing`, evidenceClass.whenAuthored);
    inPlan(`the ${evidenceClass.id} class's support`, evidenceClass.supports);
  });
  DESIGN_INTENT_CAPABILITY_DIMENSIONS.forEach((dimension, index) =>
    inPlan(`capability dimension ${index + 1}`, dimension),
  );

  it("states the corpus size and the same-type requirement as §3.7 fixes them", () => {
    expect(SEALED_CORPUS_BATCHES).toBe(12);
    expect(SAME_EVENT_TYPE_PAIR_MINIMUM).toBe(2);
    expect(FLAT_PLAN).toContain("**The sealed corpus is twelve batches**");
    expect(FLAT_PLAN).toContain("at least two pairs of batches sharing an event type");
  });

  it("keeps the reviewer-facing band text a prefix of the frozen definition", () => {
    // Never a rewrite. `Good`'s row ends in the one clause §3.8 withholds, and a prefix cannot
    // invent a softer definition the way a paraphrase could.
    for (const band of DESIGN_INTENT_BANDS) {
      expect(band.definition.startsWith(band.reviewerFacing)).toBe(true);
    }
    const good = DESIGN_INTENT_BANDS.find((band) => band.band === "Good");
    expect(good?.definition).toContain("is a diagnosis, not a pass");
    expect(good?.reviewerFacing).not.toContain("not a pass");
  });
});

/* ------------------------------------------------------------------ the freeze */

describe("nothing frozen at T19 changes afterwards", () => {
  it("pins the values a later task would most want to move", () => {
    // The hashes below say *something* changed; these say *what*, so a failure is readable.
    expect({
      batches: SEALED_CORPUS_BATCHES,
      sameTypePairs: SAME_EVENT_TYPE_PAIR_MINIMUM,
      bands: BAND_IDS,
      excellentRequirements: EXCELLENT_REQUIREMENTS.length,
      wowableCriteria: MINIMUM_WOWABLE_CRITERIA.map((criterion) => criterion.id),
      categories: SYSTEMIC_CATEGORY_IDS,
      thresholds: SYSTEMIC_THRESHOLD_BATCHES,
      gatedSet: GATED_DESIGN_INTENT_SET,
      floors: MECHANICAL_FLOORS,
      // The roster and, for each, whether it is allowed to produce a gating verdict at all. This is
      // the scoring semantics, pinned as a value rather than left to the hash: which checks can say
      // `fail` is the difference between an evidence report that measures the model and one that
      // launders a fact about the planner or the retry policy into a verdict about it.
      scoring: checkDesignIntentBatch(corpusCase(), healthyBatch()).map((check) => ({
        name: check.name,
        gating: check.status === "pass" || check.status === "fail",
      })),
      corpora: CORPORA.map((set) => corpusPath(set)),
      outputs: CORPORA.map((set) => EVAL_SETS[set].out),
    }).toEqual({
      batches: 12,
      sameTypePairs: 2,
      bands: ["Excellent", "Good", "Borderline", "Fail"],
      excellentRequirements: 6,
      wowableCriteria: [1, 2, 3, 4, 5],
      categories: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"],
      thresholds: {
        S1: 2,
        S2: 2,
        S3: 1,
        S4: 1,
        S5: 2,
        S6: 2,
        S7: 2,
        S8: 2,
        S9: 2,
      },
      gatedSet: "designIntentChallenge",
      floors: {
        paletteSeparationDeltaE: 12,
        avoidedColourNeighbourhoodDeltaE: 10,
        compositionVectorMinDiffering: 2,
        motifOverlapCeiling: 0.5,
      },
      scoring: [
        { name: "schemaValid", gating: true },
        { name: "firstCallSchemaValid", gating: false },
        { name: "retryCounts", gating: false },
        { name: "assignmentConformance", gating: true },
        { name: "paletteSeparation", gating: true },
        { name: "typographyPairingDistinct", gating: true },
        { name: "compositionVectorDistinct", gating: true },
        { name: "motifOverlap", gating: true },
        // Never gating, in either direction, whatever the plan looks like: a DesignIntent carries
        // no attractive token. See the dedicated test below.
        { name: "tokenAllotmentRespected", gating: false },
        // `n/a` on this fixture because the brief names no colour in a decidable form; it gates
        // when one does, which its own test covers.
        { name: "hostConstraintColoursHonoured", gating: false },
        { name: "hostConstraintsForReviewer", gating: false },
        { name: "creativeGuidanceStaysAdvisory", gating: false },
        { name: "noSuppliedFactSurfaced", gating: false },
        { name: "presentationPresent", gating: true },
      ],
      corpora: [
        "docs/model-evals/design-intent-regression.json",
        "docs/model-evals/design-intent-validation.json",
        "docs/model-evals/design-intent-sealed-challenge.json",
      ],
      outputs: [
        "docs/model-evals/results/design-intent-regression-v1",
        "docs/model-evals/results/design-intent-validation-v1",
        "docs/model-evals/results/design-intent-sealed-challenge-v1",
      ],
    });
  });

  /**
   * The gate itself.
   *
   * If this fails: a threshold, a band, the minimum-wowable definition, an S-category, the corpus
   * requirement or the decision function changed after T19 froze them — before any corpus was
   * authored and before the DesignIntent prompt was written. `spec.md §11.9`: a threshold chosen
   * after the result is not a threshold. **Do not update this hash to silence the failure.**
   */
  it("does not change — the gate", () => {
    expect(
      createHash("sha256").update(GATE, "utf8").digest("hex"),
      "src/lib/ai/evals/design-intent-gate.ts changed. It holds §3.7 whole: the four bands, " +
        "Excellent's six requirements, the minimum-wowable question and its five criteria, S1–S9, " +
        "the class thresholds, the corpus size and composition, and the GO/NO-GO rule. All of it " +
        "was frozen at T19 before any case existed. Do not update this hash to silence the failure.",
    ).toBe("3b53b0f58e3970f2c18efbcfaee48c2aef50fa7fcdeb7e51fdfb2889f9c35be9");
  });

  /**
   * …and the machinery the gate is applied to.
   *
   * `design-intent-evidence.ts` is the pre-registration: the published dimensions, the corpus
   * contract, every mechanical check and its floor, the blind artifact and the reviewer packet. If
   * the check logic were pinned only by behavioural tests living in this same editable file, then
   * softening a check and adjusting its test would be a green build — which is exactly the gap
   * Phase 4B found in its own freeze at T13.
   */
  it("does not change — the evidence machinery", () => {
    expect(
      createHash("sha256").update(EVIDENCE, "utf8").digest("hex"),
      "src/lib/ai/evals/design-intent-evidence.ts changed. It holds the published dimensions, the " +
        "corpus structural contract, the mechanical checks and their frozen floors, the blind " +
        "artifact and the reviewer packet, all frozen at T19 before the cases existed. Changing a " +
        "criterion after seeing the cases is the thing this set exists not to do.",
    ).toBe("b039b804445019d477684d74dd1a3979a971572a05ce49df5ac3f0fc5ed5a78d");
  });

  it("does not change at all — the runner", () => {
    expect(
      createHash("sha256").update(RUNNER, "utf8").digest("hex"),
      "tests/eval/design-intent.eval.ts changed. It was frozen at T19, before any 4C case was " +
        "authored, and it has no permitted edit: T21 repoints " +
        "src/lib/ai/evals/design-intent-seam.ts instead. Do not update this hash to silence the " +
        "failure.",
    ).toBe("f64bf5e9b2130d2fdda33cfa82898141229427fe6bc4b0df4b115fcb7b645023");
  });

  it("keeps the seam one binding, so T21's only permitted touch stays reviewable", () => {
    const seam = read("src/lib/ai/evals/design-intent-seam.ts");
    expect(seam).toMatch(/export const designIntentRunner: DesignIntentCallRunner =/);
    // One export, one import, and no logic of its own: no function body, no branch, no call. A
    // line count alone would drift with whatever the formatter does to the import block.
    expect(seam.match(/^export /gm)).toHaveLength(1);
    expect(seam).not.toMatch(/=>|function |if \(|await /);
    const code = seam
      .split("\n")
      .filter(
        (line) => line.trim() && !line.trim().startsWith("*") && !line.trim().startsWith("/*"),
      );
    expect(code.length).toBeLessThanOrEqual(8);
    expect(seam).toContain("designIntentRunnerUnavailable");
    expect(flat(seam)).toContain("T21");
  });

  it("has a command per set, and each names its set explicitly", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    expect(scripts["eval:design-intent-regression"]).toBe(
      "EVAL_SET=designIntentRegression vitest run --project eval",
    );
    expect(scripts["eval:design-intent-validation"]).toBe(
      "EVAL_SET=designIntentValidation vitest run --project eval",
    );
    expect(scripts["eval:design-intent-challenge"]).toBe(
      "EVAL_SET=designIntentChallenge vitest run --project eval",
    );
    // No arming token, confirmation secret or two-key execution — that decision was made for the
    // eval process and is not reintroduced here under another name.
    for (const name of Object.keys(scripts).filter((key) => key.startsWith("eval:design-intent"))) {
      expect(scripts[name]).not.toMatch(/CONFIRM|ARM|TOKEN/i);
    }
  });
});

/* ------------------------------------------------------------------ absence and refusal */

describe("no 4C corpus exists, and the slots refuse without one", () => {
  it("names all three, wherever they are in their life", () => {
    // Unconditional: the names are fixed now so that adding a file later is the entire change.
    expect(CORPUS_FILES.designIntentRegression).toBe("design-intent-regression.json");
    expect(CORPUS_FILES.designIntentValidation).toBe("design-intent-validation.json");
    expect(CORPUS_FILES.designIntentChallenge).toBe("design-intent-sealed-challenge.json");
  });

  /**
   * Self-retiring, per corpus, the way `prompt-leakage.test.ts`'s unscanned-corpus test already is.
   *
   * Written before any case was authored and before anything about them was known, so that T20 can
   * be a commit that adds two corpus files and changes nothing else, and T22 one that adds the
   * third. An absence assertion that had to be edited by hand at T20 would put a source edit inside
   * the freeze commit and make "adding the corpus is the whole change" untrue — the same class of
   * slightly-false claim Phase 4B's own freeze exception turned out to be.
   */
  describe.each(CORPORA)("%s", (set) => {
    const file = `${ROOT}${corpusPath(set)}`;

    it.runIf(!existsSync(file))("does not exist yet, so the slot cannot run", () => {
      expect(existsSync(file)).toBe(false);
    });

    it.runIf(existsSync(file))(
      "satisfies the contract that was frozen before it was written",
      () => {
        // The other half, armed by the same arrival. The runner checks this at module scope before
        // spending anything; asserting it here means a corpus that drifts out of contract fails
        // the ordinary suite rather than the one authorized paid run.
        const corpus = JSON.parse(readFileSync(file, "utf8"));
        expect(
          validateDesignIntentCorpusShape(corpus, { gated: set === GATED_DESIGN_INTENT_SET }),
        ).toEqual([]);
      },
    );
  });

  it("refuses at module scope, before any provider client could exist", () => {
    // Asserted from the source, never by importing it: importing a runner with an API key present
    // is what starts paying a provider.
    const absence = RUNNER.indexOf("if (!existsSync(CORPUS))");
    const describeAt = RUNNER.indexOf("describe(");
    expect(absence).toBeGreaterThan(-1);
    expect(absence).toBeLessThan(describeAt);
    expect(RUNNER.indexOf("if (isProtectedOutput(")).toBeLessThan(absence);
    expect(RUNNER.indexOf('!== "design-intent"')).toBeLessThan(describeAt);
    expect(RUNNER.indexOf("validateDesignIntentCorpusShape")).toBeLessThan(describeAt);
    expect(RUNNER.indexOf("EVAL_OVERWRITE")).toBeLessThan(describeAt);
    expect(flat(RUNNER)).toContain("No provider call is made.");
    expect(RUNNER).not.toContain("OPENAI_API_KEY");
    expect(RUNNER).not.toContain("new OpenAI");
    // The protected-path refusal must not be able to consult the write-once override.
    expect(RUNNER.slice(RUNNER.indexOf("if (isProtectedOutput("), absence)).not.toContain(
      "EVAL_OVERWRITE",
    );
  });

  it("has no implementation to call even if a corpus appeared", () => {
    expect(() =>
      designIntentRunnerUnavailable({
        identity: {} as EventIdentity,
        assignment: {} as never,
        siblingIndex: 0,
      }),
    ).toThrow(/do not exist yet/);
    expect(() =>
      designIntentRunnerUnavailable({
        identity: {} as EventIdentity,
        assignment: {} as never,
        siblingIndex: 0,
      }),
    ).toThrow(/T21/);
    expect(RUNNER).toContain(
      'import { designIntentRunner } from "@/lib/ai/evals/design-intent-seam"',
    );
    expect(RUNNER).toContain("const run = designIntentRunner;");
  });

  it("journals the paid response inside the sibling loop, not after it", () => {
    // A one-shot set must not lose the whole run to a failure on the last call. Asserting only
    // "append appears before checkDesignIntentBatch in the file" would pass a runner that buffered
    // every response and wrote once at the end, so the append is located inside the loop body.
    const from = RUNNER.indexOf("for (const planned of plan.siblings)");
    const to = RUNNER.indexOf("const observation: BatchObservation");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const body = RUNNER.slice(from, to);
    const call = body.indexOf("await run(");
    expect(call).toBeGreaterThan(-1);
    expect(body.indexOf("appendJournal(")).toBeGreaterThan(call);
    expect(body.indexOf("responseEntry(")).toBeGreaterThan(call);
    expect(body).toContain("raw: outcome.raw");
    expect(RUNNER.indexOf("appendJournal(")).toBeLessThan(
      RUNNER.indexOf("checkDesignIntentBatch("),
    );
  });

  it("journals a billed response that validation then rejected, and still fails loudly", () => {
    const from = RUNNER.indexOf("for (const planned of plan.siblings)");
    const body = RUNNER.slice(from, RUNNER.indexOf("const observation: BatchObservation"));
    expect(body).toContain("try {");
    expect(body).toContain("} catch (error) {");
    const journalled = body.indexOf("failureEntry(");
    expect(journalled).toBeGreaterThan(-1);
    expect(body.indexOf("throw error;")).toBeGreaterThan(journalled);
    expect(body).toContain("rawResponses: failure.rawResponses ?? []");
    expect(flat(EVIDENCE)).toContain("rawResponses?: string[]");
  });

  it("rotates every previous evidence file aside, before the first call", () => {
    const rotate = RUNNER.indexOf("rotateJournal(OUT, runStartedAt)");
    expect(rotate).toBeGreaterThan(-1);
    expect(rotate).toBeLessThan(RUNNER.indexOf("for (const [position, testCase]"));
    expect(RUNNER).toContain("kept the previous");
    for (const file of ["mechanical-report.md", "blind-review.md", "reviewer-packet.md"]) {
      expect(RUNNER).toContain(`rotateAside(OUT, "${file}", runStartedAt)`);
    }
  });

  it("writes the artifact before the report that signals completion", () => {
    const artifact = RUNNER.indexOf('path.join(OUT, "blind-review.md")');
    const packet = RUNNER.indexOf('path.join(OUT, "reviewer-packet.md")');
    const report = RUNNER.indexOf('path.join(OUT, "mechanical-report.md")');
    expect(artifact).toBeGreaterThan(-1);
    expect(packet).toBeGreaterThan(artifact);
    expect(report).toBeGreaterThan(packet);
  });

  it("stamps the completion signal with the run it completed", () => {
    expect(RUNNER).toContain("runStartedAt,");
    expect(RUNNER).toContain("corpusVersion: corpus.version");
    expect(RUNNER).toContain("plannerVersion:");
  });

  it("plans from the frozen brief by production's own route", () => {
    // `assertAuthoritative` is the only thing that produces the branded brief the planner accepts,
    // so a harness that cast its way past it would be evidence about a path production never takes.
    expect(RUNNER).toContain("assertAuthoritative(");
    expect(RUNNER).toContain("planConceptBatch({ identity, identityRevisionId: testCase.id })");
    expect(RUNNER).not.toContain(" as AuthoritativeIdentity");
  });
});

/* ------------------------------------------------------------------ the blinding guarantee */

describe("the reviewer packet carries the definitions and none of the arithmetic", () => {
  const packet = buildDesignIntentReviewerPacket();

  it("carries the four bands, Excellent's six, the question, the five criteria and S1–S9", () => {
    for (const band of DESIGN_INTENT_BANDS) {
      expect(packet).toContain(band.reviewerFacing);
    }
    for (const requirement of EXCELLENT_REQUIREMENTS) expect(packet).toContain(requirement);
    expect(packet).toContain(MINIMUM_WOWABLE_QUESTION);
    expect(packet).toContain(MINIMUM_WOWABLE_ANSWER_INSTRUCTION);
    for (const criterion of MINIMUM_WOWABLE_CRITERIA) expect(packet).toContain(criterion.criterion);
    for (const category of SYSTEMIC_CATEGORIES) {
      expect(packet).toContain(category.id);
      expect(packet).toContain(category.pattern);
    }
  });

  it("asks for exactly the four things §3.7 says the reviewer returns", () => {
    const lower = packet.toLowerCase();
    expect(lower).toContain("one band per batch, with reasons");
    expect(lower).toContain("minimum-wowable yes or no per batch");
    expect(lower).toContain("which of the five criteria is missing");
    expect(lower).toContain("every row answered present or absent, with citations");
    expect(lower).toContain("prose");
    expect(lower).toContain("you are not asked whether this passes");
  });

  /**
   * The blinding guarantee, and it is built to be hard to fool.
   *
   * It does not look for one sentinel string. It searches the rendered packet for the arithmetic
   * three different ways: the phrases `§3.8` names, the numbers the gate is made of — read from the
   * gate module's own constants, so a later edit that changes a threshold cannot slip past a
   * hardcoded search — and the frozen arithmetic texts themselves.
   *
   * `§3.8`: the reviewer *"necessarily learns the corpus size by rating every batch; what is
   * withheld is the **rule applied to it**"*.
   */
  it("contains none of the arithmetic, searched three ways", () => {
    const found: string[] = [];

    const phrases = [
      "12 / 12",
      "12/12",
      "twelve of twelve",
      "does not pass",
      "is a diagnosis",
      "NO-GO",
      "NO GO",
      "no-go",
      "go/no-go",
      "distribution",
      "threshold",
      "veto",
      "systemic",
      "twelve batches",
      "outnumbers",
      "spec.md",
      "phase-4b-plan",
      "model-contracts",
    ];
    for (const phrase of phrases) {
      if (packet.toLowerCase().includes(phrase.toLowerCase())) found.push(`phrase: ${phrase}`);
    }

    // The numbers, read from the gate rather than written here.
    const numbers = [
      String(SEALED_CORPUS_BATCHES),
      ...new Set(Object.values(SYSTEMIC_THRESHOLD_BATCHES).map(String)),
    ];
    for (const number of numbers) {
      for (const shape of [
        `${number} batch`,
        `${number} batches`,
        `${number} of `,
        `${number} / `,
      ]) {
        if (packet.includes(shape)) found.push(`number: ${shape}`);
      }
    }
    if (new RegExp(`\\b${SEALED_CORPUS_BATCHES}\\b`).test(packet)) {
      found.push(`number: bare ${SEALED_CORPUS_BATCHES}`);
    }
    // `GO` as a word, which no definitional text contains.
    if (/\bGO\b/.test(packet)) found.push("phrase: GO");

    // And the frozen texts, whole.
    for (const text of [
      DISTRIBUTION_RULE,
      BAND_AND_WOWABLE_NOT_INTERCHANGEABLE,
      CORPUS_COMPOSITION_REQUIREMENT,
      ...SYSTEMIC_EVIDENCE_REQUIREMENTS,
      ...SYSTEMIC_CLASSES.map((klass) => klass.why),
      ...REVIEWER_WITHHELD,
    ]) {
      if (flat(packet).includes(flat(text))) found.push(`text: ${text.slice(0, 48)}…`);
    }

    expect(
      found,
      "the reviewer packet leaked part of the rule it is supposed to withhold (§3.8)",
    ).toEqual([]);
  });

  it("says nothing about what any answer would mean", () => {
    const lower = packet.toLowerCase();
    // Narrow on purpose. "pass" and "expected" both occur inside definitions §3.8 requires the
    // packet to carry — S8's row says a converged system "passes every category", and the `Good`
    // band says "more expected" — so searching for them here would forbid the definitions
    // themselves. The arithmetic is caught by the test above; this one catches steering.
    for (const tell of ["we hope", "prior review", "this project hopes", "go/no-go"]) {
      expect({ tell, present: lower.includes(tell) }).toEqual({ tell, present: false });
    }
  });
});

/* ------------------------------------------------------------------ the decision function */

const judgement = (over: Partial<ReviewerBatchJudgement> = {}): ReviewerBatchJudgement => ({
  batchId: "Batch 1",
  band: "Excellent",
  reasons: "three worlds, each rooted in this event",
  minimumWowable: "YES",
  decidingText: "“the long table under the walnut tree”",
  missingCriteria: [],
  ...over,
});

const twelve = (over: (index: number) => Partial<ReviewerBatchJudgement> = () => ({})) =>
  Array.from({ length: SEALED_CORPUS_BATCHES }, (_, index) =>
    judgement({ batchId: `Batch ${index + 1}`, ...over(index) }),
  );

const allAbsent = (): ReviewerSystemicAssessment[] =>
  SYSTEMIC_CATEGORY_IDS.map((category) => ({ category, verdict: "absent", citations: [] }));

const review = (over: Partial<ReviewerReturn> = {}): ReviewerReturn => ({
  batches: twelve(),
  systemic: allAbsent(),
  prose: "Notes on each batch.",
  unfiledCrossBatchPattern: null,
  ...over,
});

const present = (
  category: SystemicCategoryId,
  batchIds: string[],
  extra: Partial<ReviewerSystemicAssessment> = {},
): ReviewerSystemicAssessment[] =>
  allAbsent().map((assessment) =>
    assessment.category === category
      ? {
          category,
          verdict: "present",
          citations: batchIds.map((batchId) => ({
            batchId,
            sibling: "Concept 2",
            quotedText: "the same walnut-table idea again",
          })),
          ...extra,
        }
      : assessment,
  );

describe("the GO/NO-GO function applies §3.7 and nothing else", () => {
  it("passes only on twelve Excellent, twelve YES and nine absent", () => {
    const decision = decideDesignIntentGate(review());
    expect(decision.decision).toBe("GO");
    expect(decision.reasons).toEqual([]);
    expect(decision.bandDistribution).toEqual({ Excellent: 12, Good: 0, Borderline: 0, Fail: 0 });
    expect(decision.minimumWowableTally).toEqual({ YES: 12, NO: 0 });
    expect(decision.systemic).toHaveLength(9);
    expect(decision.systemic.every((entry) => entry.verdict === "absent")).toBe(true);
    expect(decision.reviewComplete).toBe(true);
    expect(decision.mustReturnToReviewer).toBe(false);
  });

  it("refuses eleven Excellent and one Good, and says which batch", () => {
    // The case §3.7 names outright: "If a sealed challenge returns 11 Excellent and 1 Good, that
    // is evidence the system did not meet the frozen bar."
    const decision = decideDesignIntentGate(
      review({ batches: twelve((index) => (index === 7 ? { band: "Good" } : {})) }),
    );
    expect(decision.decision).toBe("NO-GO");
    const reason = decision.reasons.find((entry) => entry.kind === "band_below_excellent");
    expect(reason?.batchIds).toEqual(["Batch 8"]);
    expect(reason?.detail).toContain("Batch 8=Good");
    expect(decision.bandDistribution).toEqual({ Excellent: 11, Good: 1, Borderline: 0, Fail: 0 });
  });

  it("refuses a single minimum-wowable NO, and names the missing criterion", () => {
    const decision = decideDesignIntentGate(
      review({
        batches: twelve((index) =>
          index === 2 ? { minimumWowable: "NO", missingCriteria: [2, 5] } : {},
        ),
      }),
    );
    expect(decision.decision).toBe("NO-GO");
    const reason = decision.reasons.find((entry) => entry.kind === "minimum_wowable_no");
    expect(reason?.batchIds).toEqual(["Batch 3"]);
    expect(reason?.criteria).toEqual([2, 5]);
    expect(decision.minimumWowableTally).toEqual({ YES: 11, NO: 1 });
  });

  it("treats Excellent + NO and Good + YES as NO-GO, and records the disagreement", () => {
    // §3.7: "both required and are not interchangeable … Where they disagree, that disagreement is
    // itself a finding the go/no-go records verbatim."
    const decision = decideDesignIntentGate(
      review({
        batches: twelve((index) => {
          if (index === 0) return { minimumWowable: "NO", missingCriteria: [3] };
          if (index === 1) return { band: "Good" };
          return {};
        }),
      }),
    );
    expect(decision.decision).toBe("NO-GO");
    expect(
      decision.disagreements.map((entry) => [entry.batchId, entry.band, entry.minimumWowable]),
    ).toEqual([
      ["Batch 1", "Excellent", "NO"],
      ["Batch 2", "Good", "YES"],
    ]);
    const reason = decision.reasons.find((entry) => entry.kind === "band_wowable_disagreement");
    expect(reason?.detail).toContain("Batch 1 (Excellent + NO)");
    expect(reason?.detail).toContain("Batch 2 (Good + YES)");
  });

  it("vetoes a correctness category on one cited batch", () => {
    for (const category of ["S3", "S4"] as const) {
      const decision = decideDesignIntentGate(review({ systemic: present(category, ["Batch 5"]) }));
      expect(decision.decision).toBe("NO-GO");
      expect(decision.reasons.some((entry) => entry.kind === "systemic_veto")).toBe(true);
      expect(decision.systemic.find((entry) => entry.category === category)?.meetsThreshold).toBe(
        true,
      );
    }
  });

  it("needs two cited batches before a taste category is a veto, and is still not a pass at one", () => {
    const one = decideDesignIntentGate(review({ systemic: present("S9", ["Batch 4"]) }));
    expect(one.decision).toBe("NO-GO");
    expect(one.reasons.map((entry) => entry.kind)).toContain("systemic_present_below_threshold");
    expect(one.reasons.map((entry) => entry.kind)).not.toContain("systemic_veto");

    const two = decideDesignIntentGate(review({ systemic: present("S9", ["Batch 4", "Batch 9"]) }));
    expect(two.decision).toBe("NO-GO");
    expect(two.reasons.map((entry) => entry.kind)).toContain("systemic_veto");
  });

  it("counts distinct batches, not citations", () => {
    const decision = decideDesignIntentGate(
      review({ systemic: present("S8", ["Batch 4", "Batch 4"]) }),
    );
    expect(decision.systemic.find((entry) => entry.category === "S8")?.citedBatches).toEqual([
      "Batch 4",
    ]);
    expect(decision.reasons.map((entry) => entry.kind)).not.toContain("systemic_veto");
  });

  it("does not let an excellent distribution override a veto", () => {
    const decision = decideDesignIntentGate(
      review({ systemic: present("S1", ["Batch 1", "Batch 2"]) }),
    );
    expect(decision.bandDistribution.Excellent).toBe(12);
    expect(decision.minimumWowableTally.YES).toBe(12);
    expect(decision.decision).toBe("NO-GO");
  });

  it("returns the review rather than deciding, when the checklist is incomplete", () => {
    const decision = decideDesignIntentGate(
      review({ systemic: allAbsent().filter((entry) => entry.category !== "S7") }),
    );
    expect(decision.decision).toBe("NO-GO");
    expect(decision.reviewComplete).toBe(false);
    expect(decision.mustReturnToReviewer).toBe(true);
    expect(decision.reasons.find((entry) => entry.kind === "review_incomplete")?.detail).toContain(
      "S7 was not assessed",
    );
  });

  it("refuses a NO with no criterion, a citation with no sibling, and an unnamed S7", () => {
    const noCriterion = decideDesignIntentGate(
      review({ batches: twelve((index) => (index === 0 ? { minimumWowable: "NO" } : {})) }),
    );
    expect(noCriterion.mustReturnToReviewer).toBe(true);
    expect(noCriterion.reasons.find((r) => r.kind === "review_incomplete")?.detail).toContain(
      "must name which of the five criteria is missing",
    );

    const noSibling = decideDesignIntentGate(
      review({
        systemic: allAbsent().map((entry) =>
          entry.category === "S5"
            ? {
                category: "S5" as const,
                verdict: "present" as const,
                citations: [{ batchId: "Batch 1", sibling: "", quotedText: "x" }],
              }
            : entry,
        ),
      }),
    );
    expect(noSibling.reasons.find((r) => r.kind === "review_incomplete")?.detail).toContain(
      "names no sibling",
    );

    const unnamedS7 = decideDesignIntentGate(
      review({ systemic: present("S7", ["Batch 1", "Batch 2"]) }),
    );
    expect(unnamedS7.reasons.find((r) => r.kind === "review_incomplete")?.detail).toContain(
      "without the reviewer naming the pattern",
    );

    const namedS7 = decideDesignIntentGate(
      review({
        systemic: present("S7", ["Batch 1", "Batch 2"], {
          name: "every hero opens on a date",
          definition: "a recurring structural tic across batches",
        }),
      }),
    );
    expect(namedS7.reviewComplete).toBe(true);
    expect(namedS7.reasons.map((r) => r.kind)).toEqual(["systemic_veto"]);
  });

  it("refuses a corpus that is not the frozen size, and a duplicated batch", () => {
    expect(
      decideDesignIntentGate(review({ batches: twelve().slice(0, 11) })).reasons.find(
        (r) => r.kind === "review_incomplete",
      )?.detail,
    ).toContain("the gate is defined over 12 batches");

    const duplicated = twelve();
    expect(
      decideDesignIntentGate(
        review({ batches: [...duplicated.slice(0, 11), judgement({ batchId: "Batch 1" })] }),
      ).reasons.find((r) => r.kind === "review_incomplete")?.detail,
    ).toContain("is judged more than once");
  });

  it("blocks a decision while the prose describes a pattern filed under none of S1–S9", () => {
    // §3.7's completeness duty, which no protocol can compute: "the review is returned for that
    // pattern to be filed or explicitly declined, before any decision is recorded".
    const decision = decideDesignIntentGate(
      review({ unfiledCrossBatchPattern: "every batch opens on the same kind of sentence" }),
    );
    expect(decision.mustReturnToReviewer).toBe(true);
    expect(decision.decision).toBe("NO-GO");

    // And an author who never answered the question has not answered it.
    const unstated = decideDesignIntentGate(
      review({ unfiledCrossBatchPattern: undefined as unknown as null }),
    );
    expect(unstated.mustReturnToReviewer).toBe(true);
  });
});

/* ------------------------------------------------------------------ the corpus contract */

const brief = (over: Partial<EventIdentity> = {}): EventIdentity =>
  eventIdentitySchema.parse({
    creativeDirection:
      "A late-summer supper in an orchard, lit as the light goes, warm and entirely unfussy.",
    toneKeywords: ["warm", "unhurried", "orchard"],
    colorsExplicitlyConstrained: false,
    paletteIntent: {
      requiredColors: [],
      preferredColors: [],
      avoidColors: [],
      dominanceNotes: "Let one warm tone carry the page.",
    },
    tonalIntent: "Low light, warm ground, nothing stark.",
    toneExplicitlyConstrained: false,
    compatibleTonalDirections: ["mid", "dark"],
    compatibleFamilies: ["editorial", "invitation"],
    compatibleTypographyCategories: ["transitional", "oldstyle"],
    visualMotifs: ["orchard rows"],
    textureDirection: "Paper that has been handled.",
    typographyDirection: "Something with a written hand in it.",
    copyTone: "Spoken, not announced.",
    hostConstraints: [],
    creativeGuidance: [],
    inspirationSummary: "No inspiration was supplied.",
    ...over,
  });

const corpusCase = (over: Partial<DesignIntentCase> = {}): DesignIntentCase => ({
  id: "DI-01",
  eventType: "orchard supper",
  identity: brief(),
  ...over,
});

const corpusOf = (cases: DesignIntentCase[]) => ({ version: "design_intent_corpus_v1", cases });

describe("the corpus contract, published before any case existed", () => {
  it("accepts a well-formed ungated corpus", () => {
    expect(validateDesignIntentCorpusShape(corpusOf([corpusCase()]), { gated: false })).toEqual([]);
  });

  it("refuses a missing version, a duplicate id and an empty event type", () => {
    expect(validateDesignIntentCorpusShape({ cases: [corpusCase()] }, { gated: false })).toEqual([
      "top-level `version` must be a non-empty string",
    ]);
    expect(
      validateDesignIntentCorpusShape(corpusOf([corpusCase(), corpusCase()]), { gated: false }),
    ).toContain("DI-01: duplicate `id`");
    expect(
      validateDesignIntentCorpusShape(corpusOf([corpusCase({ eventType: "  " })]), {
        gated: false,
      }),
    ).toContain("DI-01: `eventType` must be a non-empty string");
  });

  it("refuses a brief the real identity schema would reject", () => {
    const problems = validateDesignIntentCorpusShape(
      corpusOf([corpusCase({ identity: { creativeDirection: "too short" } as never })]),
      { gated: false },
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.startsWith("DI-01: "))).toBe(true);
  });

  it("refuses a supplied fact that is not a supplied-fact field", () => {
    expect(
      validateDesignIntentCorpusShape(
        corpusOf([corpusCase({ suppliedFacts: { venue: "the orangery" } })]),
        { gated: false },
      ).join(" "),
    ).toContain("is not a supplied-fact field");
  });

  it("holds the gated corpus to twelve batches and two same-type pairs", () => {
    const twelveDistinct = Array.from({ length: 12 }, (_, index) =>
      corpusCase({ id: `DI-${index + 1}`, eventType: `type-${index + 1}` }),
    );
    const problems = validateDesignIntentCorpusShape(corpusOf(twelveDistinct), { gated: true });
    expect(problems.join(" ")).toContain("at least 2 pairs of batches sharing an event type");

    const withPairs = twelveDistinct.map((testCase, index) =>
      index < 4 ? { ...testCase, eventType: index < 2 ? "christening" : "quinceañera" } : testCase,
    );
    expect(validateDesignIntentCorpusShape(corpusOf(withPairs), { gated: true })).toEqual([]);

    expect(
      validateDesignIntentCorpusShape(corpusOf(withPairs.slice(0, 11)), { gated: true }).join(" "),
    ).toContain("the gated corpus is 12 batches");

    // And none of that applies to the sets the gate does not govern.
    expect(
      validateDesignIntentCorpusShape(corpusOf(twelveDistinct.slice(0, 3)), { gated: false }),
    ).toEqual([]);
  });

  it("counts same-type pairs the way §3.7 means them", () => {
    expect(sameEventTypePairCount([{ eventType: "a" }, { eventType: "b" }])).toBe(0);
    expect(sameEventTypePairCount([{ eventType: "a" }, { eventType: " A " }])).toBe(1);
    // Three of a kind is three pairs, which is what "at least two pairs" admits.
    expect(
      sameEventTypePairCount([{ eventType: "a" }, { eventType: "a" }, { eventType: "a" }]),
    ).toBe(3);
    expect(normalizeEventType("  60th   Birthday ")).toBe("60th birthday");
  });

  it("builds an authoritative envelope that carries no supplied fact from the case", () => {
    // The one way this harness could hand a creative call the host's verbatim names, date and
    // venue, closed by construction rather than by review.
    const envelope = buildIdentityEnvelope(
      corpusCase({ suppliedFacts: { venueText: "the orangery" } }),
    );
    expect(JSON.stringify(envelope.suppliedFacts)).not.toContain("orangery");
    expect(Object.values(envelope.suppliedFacts).every((value) => value === null)).toBe(true);
    expect(() => assertAuthoritative(envelope, EVENT_IDENTITY_SCHEMA_VERSION)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ the mechanical checks */

const identityFor = (testCase: DesignIntentCase) =>
  assertAuthoritative(buildIdentityEnvelope(testCase), EVENT_IDENTITY_SCHEMA_VERSION);

const PALETTES = [
  { colors: ["#2B1B12", "#B8622A", "#E8D8C3"], dominant: "#2B1B12" },
  { colors: ["#0B1F3A", "#3E6E8E", "#D7E3EC"], dominant: "#0B1F3A" },
  { colors: ["#1E3B1C", "#7FA05A", "#EFEAD8"], dominant: "#1E3B1C" },
];

const COMPOSITIONS = [
  { asymmetry: "symmetric", rhythm: "continuous", sectionContrast: "low", ornament: "none" },
  {
    asymmetry: "gentle",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
  },
  { asymmetry: "strong", rhythm: "punctuated", sectionContrast: "high", ornament: "decorative" },
] as const;

const MOTIFS = [["botanical"], ["stripe"], []];

/** A batch the checks should be entirely happy with, built from a real plan. */
function healthyBatch(testCase: DesignIntentCase = corpusCase()): BatchObservation {
  const plan = planConceptBatch({
    identity: identityFor(testCase),
    identityRevisionId: testCase.id,
  });
  // Two siblings can be assigned the same typography category when the identity offers fewer than
  // three, so "the first pairing in my pool" is not automatically three distinct pairings. The
  // model is the one that chooses; a healthy fixture chooses as a healthy model would.
  const takenPairings = new Set<string>();
  const pairingFor = (pool: readonly string[]) => {
    const choice = pool.find((pairing) => !takenPairings.has(pairing)) ?? pool[0];
    takenPairings.add(choice);
    return choice;
  };
  return {
    caseId: testCase.id,
    plan,
    siblings: plan.siblings.map((planned) => ({
      index: planned.index,
      raw: "{}",
      requestText: "the assembled user message",
      telemetry: {
        model: "test",
        promptVersion: "design_intent_v4",
        schemaVersion: "design_intent_schema_v4",
        latencyMs: 1,
        transientRetries: 0,
        repairRetries: 0,
        schemaValidFirstCall: true,
      },
      response: {
        family: planned.assignment.family,
        tonalDirection: planned.assignment.tonalDirection,
        palette: PALETTES[planned.index],
        typographyPairing: pairingFor(planned.assignment.typographyPairings),
        density: (["compact", "balanced", "spacious"] as const)[planned.index],
        composition: {
          ...COMPOSITIONS[planned.index],
          hierarchy: planned.assignment.hierarchy,
        },
        motifs: MOTIFS[planned.index],
        presentation: {
          name: ["Orchard Hour", "Blue Vespers", "Green Table"][planned.index],
          description: [
            "A supper that begins as the light goes, under trees that have been there longer.",
            "Evening as the colour drains, cool and quiet, with the table the only warm thing.",
            "Everything grown, cut and carried the same morning, laid out without ceremony.",
          ][planned.index],
        },
      },
    })),
  };
}

const status = (checks: DesignIntentCheck[], name: string) =>
  checks.find((check) => check.name === name)?.status;

/** Replace one sibling's response fields, keeping everything else the batch had. */
function withResponse(
  batch: BatchObservation,
  index: number,
  patch: Record<string, unknown>,
): BatchObservation {
  return {
    ...batch,
    siblings: batch.siblings.map((sibling) =>
      sibling.index === index
        ? { ...sibling, response: { ...(sibling.response as object), ...patch } }
        : sibling,
    ),
  };
}

describe("the within-batch mechanical block", () => {
  it("passes a batch that conforms, separates and invents nothing", () => {
    const testCase = corpusCase();
    const checks = checkDesignIntentBatch(testCase, healthyBatch(testCase));
    expect(checks.filter((check) => check.status === "fail")).toEqual([]);
    expect(mechanicalPass(checks)).toBe(true);
    expect(status(checks, "schemaValid")).toBe("pass");
    expect(status(checks, "assignmentConformance")).toBe("pass");
    expect(status(checks, "paletteSeparation")).toBe("pass");
    expect(status(checks, "compositionVectorDistinct")).toBe("pass");
    expect(status(checks, "presentationPresent")).toBe("pass");
  });

  it("never counts an advisory or an n/a as a pass", () => {
    // The 4B rule, and `model-contracts.md §4.5`'s: a clean mechanical run must not blur these.
    const testCase = corpusCase();
    const checks = checkDesignIntentBatch(testCase, healthyBatch(testCase));
    expect(status(checks, "hostConstraintColoursHonoured")).toBe("n/a");
    expect(status(checks, "creativeGuidanceStaysAdvisory")).toBe("n/a");
    expect(status(checks, "noSuppliedFactSurfaced")).toBe("n/a");
    expect(status(checks, "firstCallSchemaValid")).toBe("advisory");
    expect(status(checks, "retryCounts")).toBe("advisory");
    expect(DESIGN_INTENT_ACCEPTANCE.advisoryNeverCounts).toMatch(
      /never folded into the pass count/,
    );
    expect(DESIGN_INTENT_ACCEPTANCE.necessaryNeverSufficient).toMatch(/never sufficient/);
  });

  /**
   * The check that measures the planner, and must never claim to measure the model.
   *
   * A DesignIntent carries no attractive token: the allotment constrains the composition call
   * (`spec.md §7.7`), and 4C runs none. A `pass` here would read, in a go/no-go listing the gating
   * checks, as a statement about model output on a property the model never had the chance to
   * violate. The planner facts themselves are decided over thousands of seeded plans in
   * `planner.test.ts`; here they are detail, not a verdict.
   */
  it("reports the token allotment as n/a, with the planner facts as detail and not a verdict", () => {
    const testCase = corpusCase();
    const checks = checkDesignIntentBatch(testCase, healthyBatch(testCase));
    const allotment = checks.find((check) => check.name === "tokenAllotmentRespected");
    expect(allotment?.status).toBe("n/a");
    expect(allotment?.detail).toContain("not decidable at this layer");
    expect(allotment?.detail).toContain("spec.md §7.7");
    expect(allotment?.detail).toContain("4C runs no composition call");
    expect(allotment?.detail).toContain("src/lib/generation/planner.test.ts");
    expect(allotment?.detail).toContain("it holds");
    // It cannot produce a verdict in either direction, whatever the plan looks like.
    const broken = {
      ...healthyBatch(testCase),
      plan: {
        ...healthyBatch(testCase).plan,
        siblings: healthyBatch(testCase).plan.siblings.map((sibling) => ({
          ...sibling,
          allowedTokens: ["staggerTitle", "heroNumeral", "watermark"],
        })),
      },
    } as BatchObservation;
    const brokenChecks = checkDesignIntentBatch(testCase, broken);
    expect(status(brokenChecks, "tokenAllotmentRespected")).toBe("n/a");
    expect(
      brokenChecks.find((check) => check.name === "tokenAllotmentRespected")?.detail,
    ).toContain("That is a planner defect, not a model one");
    expect(mechanicalPass(brokenChecks)).toBe(true);
    // And it is named among the checks that never gate, rather than among the ones that do.
    expect(DESIGN_INTENT_ACCEPTANCE.mechanical).toContain("`tokenAllotmentRespected` never gate");
    expect(DESIGN_INTENT_ACCEPTANCE.mechanical).not.toMatch(
      /`tokenAllotmentRespected`,[^.]*gate\./,
    );
  });

  it("fails a sibling that ignored its assignment", () => {
    const testCase = corpusCase();
    const batch = healthyBatch(testCase);
    const other = (["editorial", "invitation", "statement"] as const).find(
      (family) => family !== batch.plan.siblings[0].assignment.family,
    )!;
    const checks = checkDesignIntentBatch(testCase, withResponse(batch, 0, { family: other }));
    expect(status(checks, "assignmentConformance")).toBe("fail");
    expect(mechanicalPass(checks)).toBe(false);
  });

  it("fails a recoloured palette, and does it perceptually rather than by hex equality", () => {
    const testCase = corpusCase();
    const batch = healthyBatch(testCase);
    // Not one hex is shared, and every colour is within a whisker of sibling 0's.
    const nearly = { colors: ["#2C1C13", "#B9632B", "#E9D9C4"], dominant: "#2C1C13" };
    const checks = checkDesignIntentBatch(testCase, withResponse(batch, 1, { palette: nearly }));
    expect(status(checks, "paletteSeparation")).toBe("fail");
    expect(new Set(nearly.colors).size).toBe(3);
    expect(nearly.colors.some((colour) => PALETTES[0].colors.includes(colour))).toBe(false);
  });

  it("fails two siblings whose composition vectors differ on one dimension", () => {
    const testCase = corpusCase();
    const batch = healthyBatch(testCase);
    const first = batch.plan.siblings[0];
    const checks = checkDesignIntentBatch(
      testCase,
      withResponse(batch, 1, {
        composition: {
          ...COMPOSITIONS[0],
          ornament: "restrained",
          hierarchy: batch.plan.siblings[1].assignment.hierarchy,
        },
      }),
    );
    const differing =
      batch.plan.siblings[1].assignment.hierarchy === first.assignment.hierarchy ? "fail" : "pass";
    expect(status(checks, "compositionVectorDistinct")).toBe(differing);
  });

  it("fails an overlapping motif set and reports n/a when nobody asked for a motif", () => {
    const testCase = corpusCase();
    const batch = healthyBatch(testCase);
    expect(
      status(
        checkDesignIntentBatch(
          testCase,
          withResponse(withResponse(batch, 0, { motifs: ["botanical", "linen"] }), 1, {
            motifs: ["botanical", "linen"],
          }),
        ),
        "motifOverlap",
      ),
    ).toBe("fail");

    const bare = [0, 1, 2].reduce((acc, index) => withResponse(acc, index, { motifs: [] }), batch);
    expect(status(checkDesignIntentBatch(testCase, bare), "motifOverlap")).toBe("n/a");
  });

  it("decides the half of host-constraint tracing that is decidable, and defers the rest", () => {
    const constrained = corpusCase({
      identity: brief({
        colorsExplicitlyConstrained: true,
        hostConstraints: ["The school colour #2B1B12 has to be in it"],
        paletteIntent: {
          requiredColors: ["#2B1B12"],
          preferredColors: [],
          avoidColors: ["#0B1F3A"],
          dominanceNotes: "The school colour leads.",
        },
      }),
    });
    const checks = checkDesignIntentBatch(constrained, healthyBatch(constrained));
    // Sibling 0 carries the required colour, the others do not; sibling 1 is the excluded one.
    expect(status(checks, "hostConstraintColoursHonoured")).toBe("fail");
    expect(
      checks.find((check) => check.name === "hostConstraintColoursHonoured")?.detail,
    ).toContain("omits required #2B1B12");

    const prose = corpusCase({
      identity: brief({ hostConstraints: ["No photographs of the honoree anywhere"] }),
    });
    const proseChecks = checkDesignIntentBatch(prose, healthyBatch(prose));
    expect(status(proseChecks, "hostConstraintColoursHonoured")).toBe("n/a");
    expect(status(proseChecks, "hostConstraintsForReviewer")).toBe("advisory");
    expect(
      proseChecks.find((check) => check.name === "hostConstraintsForReviewer")?.detail,
    ).toContain("No photographs of the honoree");
  });

  it("never fails a sibling for following creative guidance", () => {
    // §3.1 dimension 4: guidance stays advisory, and a sibling may depart from it without penalty.
    // Unanimity is evidence for S3, which is the reviewer's, and never a mechanical failure.
    const guided = corpusCase({
      identity: brief({ creativeGuidance: ["I would reach for #2B1B12 as the ground"] }),
    });
    const batch = healthyBatch(guided);
    const everyone = [0, 1, 2].reduce(
      (acc, index) =>
        withResponse(acc, index, {
          palette: { colors: ["#2B1B12", ...PALETTES[index].colors.slice(1)], dominant: "#2B1B12" },
        }),
      batch,
    );
    const checks = checkDesignIntentBatch(guided, everyone);
    expect(status(checks, "creativeGuidanceStaysAdvisory")).toBe("advisory");
    expect(checks.find((c) => c.name === "creativeGuidanceStaysAdvisory")?.detail).toContain(
      "all three siblings adopted",
    );
  });

  it("fails a supplied fact that surfaced in a presentation", () => {
    const withFacts = corpusCase({ suppliedFacts: { venueText: "the Orangery at Kew" } });
    const batch = healthyBatch(withFacts);
    expect(status(checkDesignIntentBatch(withFacts, batch), "noSuppliedFactSurfaced")).toBe("pass");
    const leaked = withResponse(batch, 2, {
      presentation: {
        name: "Green Table",
        description: "An evening at the Orangery at Kew, laid out without ceremony at all.",
      },
    });
    expect(status(checkDesignIntentBatch(withFacts, leaked), "noSuppliedFactSurfaced")).toBe(
      "fail",
    );
  });

  it("fails a batch with no presentation, because criterion 4 cannot be answered without one", () => {
    const testCase = corpusCase();
    const batch = withResponse(healthyBatch(testCase), 1, { presentation: undefined });
    expect(status(checkDesignIntentBatch(testCase, batch), "presentationPresent")).toBe("fail");
  });

  it("fails invalid output through production's own validator", () => {
    const testCase = corpusCase();
    const batch = withResponse(healthyBatch(testCase), 0, {
      palette: { colors: ["#2B1B12", "#B8622A"], dominant: "#FFFFFF" },
    });
    expect(status(checkDesignIntentBatch(testCase, batch), "schemaValid")).toBe("fail");
  });
});

describe("distinctness is only demanded where the assignment could have delivered it", () => {
  it("decides a system of distinct representatives exactly, not by union size", () => {
    expect(
      canChooseDistinct([
        ["a", "b"],
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe(true);
    expect(
      canChooseDistinct([
        ["a", "b"],
        ["a", "b"],
        ["a", "b"],
      ]),
    ).toBe(false);
    // The shape a union-size heuristic gets wrong: three values across the pools, no distinct draw.
    expect(canChooseDistinct([["a"], ["a"], ["b", "c"]])).toBe(false);
    expect(canChooseDistinct([["a"], ["b"], ["c"]])).toBe(true);
  });

  it("reports advisory, never fail, when the pools could not have differed", () => {
    const testCase = corpusCase();
    const batch = healthyBatch(testCase);
    const locked = {
      ...batch,
      plan: {
        ...batch.plan,
        siblings: batch.plan.siblings.map((sibling) => ({
          ...sibling,
          assignment: {
            ...sibling.assignment,
            typographyPairings: ["transitional_newsreader_tight"],
          },
        })),
      },
    } as BatchObservation;
    const repeated = [0, 1, 2].reduce(
      (acc, index) =>
        withResponse(acc, index, { typographyPairing: "transitional_newsreader_tight" }),
      locked,
    );
    const checks = checkDesignIntentBatch(testCase, repeated);
    expect(status(checks, "typographyPairingDistinct")).toBe("advisory");
    // And an advisory is never a pass, so it cannot quietly rescue the batch either.
    expect(checks.find((check) => check.name === "typographyPairingDistinct")?.detail).toContain(
      "not decidable",
    );
  });
});

describe("a corpus that returns the same world every time is visible in the measurements", () => {
  it("names the recurring signature and the batches it recurs in", () => {
    // The Library Boundary Invariant's failure mode, one level up: three vivid distinct worlds per
    // batch, and approximately the same three for every event. Every within-batch check passes.
    const cases = [
      corpusCase({ id: "DI-01", eventType: "christening" }),
      corpusCase({ id: "DI-02", eventType: "quinceañera" }),
    ];
    const first = healthyBatch(cases[0]);
    const cloned: BatchObservation = {
      ...healthyBatch(cases[1]),
      siblings: first.siblings.map((sibling) => ({ ...sibling })),
    };
    const measurements = measureCorpus(cases, [first, cloned]);
    expect(measurements.signaturesAcrossEventTypes.length).toBeGreaterThan(0);
    expect(measurements.signaturesAcrossEventTypes[0].batches).toEqual(["Batch 1", "Batch 2"]);
    expect(measurements.signaturesAcrossEventTypes[0].eventTypes).toEqual([
      "christening",
      "quinceañera",
    ]);
    // Same-index distance across batches is zero where within-batch distance is not — the exact
    // comparison the corpus-wide block asks for, reported rather than scored.
    expect(measurements.crossBatchSummary.crossBatchMin).toBe(0);
    expect(measurements.crossBatchSummary.withinBatchMean).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ perceptual helpers */

describe("the colour maths does what the checks claim it does", () => {
  it("scores a recolour near zero and two different palettes far apart", () => {
    expect(paletteDistance(PALETTES[0].colors, PALETTES[0].colors)).toBe(0);
    expect(paletteDistance(PALETTES[0].colors, ["#2C1C13", "#B9632B", "#E9D9C4"])).toBeLessThan(
      MECHANICAL_FLOORS.paletteSeparationDeltaE,
    );
    expect(paletteDistance(PALETTES[0].colors, PALETTES[1].colors)).toBeGreaterThan(
      MECHANICAL_FLOORS.paletteSeparationDeltaE,
    );
    // Order is not distance.
    expect(paletteDistance(PALETTES[0].colors, [...PALETTES[0].colors].reverse())).toBe(0);
  });

  it("puts black, white and a mid grey where CIELAB puts them", () => {
    expect(Math.round(hexDeltaE("#000000", "#FFFFFF"))).toBe(100);
    expect(hexDeltaE("#2B1B12", "#2B1B12")).toBe(0);
    expect(paletteFamily("#808080")).toContain("neutral");
    expect(paletteFamily("#B8622A")).toMatch(/^hue \d+–\d+ · (dark|mid|light)$/);
  });

  it("reads hex colours out of host-authored text and normalises them", () => {
    expect(hexColorsIn("must be #2b1b12 or nothing")).toEqual(["#2B1B12"]);
    expect(hexColorsIn("#abc and #ABCDEF")).toEqual(["#AABBCC", "#ABCDEF"]);
    expect(hexColorsIn("no colours here")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ the corpus-wide block */

describe("the corpus-wide measurements give the reviewer S8 and S9 evidence", () => {
  const cases = [
    corpusCase({ id: "DI-01", eventType: "christening" }),
    corpusCase({ id: "DI-02", eventType: "christening" }),
    corpusCase({ id: "DI-03", eventType: "quinceañera" }),
  ];
  const observations = cases.map((testCase) => healthyBatch(testCase));
  const measurements = measureCorpus(cases, observations);

  it("labels batches positionally and compares same-index siblings across batches", () => {
    expect(measurements.batchCount).toBe(3);
    expect(measurements.batchLabels).toEqual({
      "DI-01": "Batch 1",
      "DI-02": "Batch 2",
      "DI-03": "Batch 3",
    });
    expect(measurements.crossBatchSameIndex.length).toBe(9);
    expect(measurements.crossBatchSummary.withinBatchMean).toBeGreaterThan(0);
  });

  it("surfaces the same-event-type pairs, which is the measurement S8 turns on", () => {
    expect(measurements.sameEventTypePairs.map((pair) => [pair.a, pair.b])).toEqual([
      ["Batch 1", "Batch 2"],
    ]);
    // Identical briefs plan identically only if their ids match; these differ, so the comparison
    // is real rather than trivially zero — and either way it is reported, never scored.
    expect(measurements.sameEventTypePairs[0].perIndex).toHaveLength(3);
  });

  it("keeps the label-to-case mapping in our report and out of the reviewer's artifact", () => {
    // The join the whole review-to-decision path depends on: the reviewer cites "Batch 3", and the
    // go/no-go author has to know which case that was without the artifact ever having said.
    const report = buildDesignIntentMechanicalReport({
      runStartedAt: "2026-01-01T00:00:00.000Z",
      evalSet: "designIntentRegression",
      label: EVAL_SETS.designIntentRegression.label,
      corpusVersion: "design_intent_corpus_v1",
      plannerVersion: observations[0].plan.plannerVersion,
      rows: cases.map((testCase, index) => ({
        caseId: testCase.id,
        label: `Batch ${index + 1}`,
        checks: checkDesignIntentBatch(testCase, observations[index]),
      })),
      measurements,
    });
    expect(report).toContain("| Batch 1 | DI-01 |");
    expect(report).toContain("### Batch 3 — `DI-03`");
    expect(report).toContain(EVAL_SETS.designIntentRegression.label);
    expect(report).toContain("design_intent_corpus_v1");
    // And the same corpus-wide block the reviewer sees, so the two cannot describe different runs.
    expect(report).toContain("## Corpus-wide measurements");
  });

  it("counts recurring finishing language and recurring design signatures", () => {
    // Every batch here carries the same three presentations, which is the shape S8 exists to see.
    expect(measurements.recurringPresentationSpans.length).toBeGreaterThan(0);
    expect(measurements.recurringPresentationSpans[0].batches.length).toBeGreaterThan(1);
    expect(measurements.paletteFamilyFrequency[0].count).toBeGreaterThan(1);
    expect(measurements.typographyPairingFrequency.length).toBeGreaterThan(0);
    expect(measurements.motifSetFrequency.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ the blind artifact */

describe("the blind artifact carries the brief and the three concepts, and nothing else", () => {
  const testCase = corpusCase({ notes: "AUTHOR NOTE: this case probes the creative leap" });
  const observations = [healthyBatch(testCase)];
  const artifact = buildDesignIntentBlindArtifact(
    [testCase],
    observations,
    measureCorpus([testCase], observations),
  );

  it("carries the identity, because S5, S6 and systemic condition 4 need it", () => {
    expect(artifact).toContain(testCase.identity.creativeDirection);
    expect(artifact).toContain(testCase.identity.copyTone);
    expect(artifact).toContain("Host constraints (AUTHORITATIVE)");
    expect(artifact).toContain("Creative guidance (ADVISORY)");
  });

  it("carries each concept's presentation, which the Good band and criterion 4 read", () => {
    expect(artifact).toContain("Orchard Hour");
    expect(artifact).toContain("Blue Vespers");
    expect(artifact).toContain("Green Table");
    expect(artifact).toContain("Batch 1 · Concept 1");
  });

  it("carries no case metadata, no expectation and no prior evidence", () => {
    expect(artifact).not.toContain("AUTHOR NOTE");
    expect(artifact).not.toContain(testCase.id);
    expect(artifact).not.toContain("DI-0");
    expect(artifact).not.toContain("Excellent");
    expect(artifact).not.toContain("minimum-wowable");
    expect(artifact).not.toMatch(/\bS[1-9]\b/);
    expect(artifact).toContain("Cite batches and siblings by the");
  });

  it("carries the corpus-wide measurements once, labelled as measurements", () => {
    expect(artifact.split("## Corpus-wide measurements")).toHaveLength(2);
    expect(artifact).toContain("Measurements, not verdicts.");
    expect(artifact).toContain("Batches that are instances of the same kind of event");
  });
});

/* ------------------------------------------------------------------ the wiring */

describe("the three sets are wired while their cases are unknown", () => {
  it("gives each its own corpus, output directory and runner", () => {
    for (const set of CORPORA) {
      expect(EVAL_SETS[set].runner).toBe("design-intent");
      expect(EVAL_SETS[set].corpus).toBe(corpusPath(set));
      expect(isProtectedOutput(EVAL_SETS[set].out)).toBe(false);
    }
    const outs = CORPORA.map((set) => EVAL_SETS[set].out);
    expect(new Set(outs).size).toBe(outs.length);
  });

  it("labels each with an evidence class that cannot be mistaken for another", () => {
    expect(EVAL_SETS.designIntentRegression.label).toMatch(
      /^REGRESSION CORPUS \(4C DesignIntent\)/,
    );
    expect(EVAL_SETS.designIntentValidation.label).toMatch(
      /^PRE-REGISTERED VALIDATION SET \(4C DesignIntent\)/,
    );
    expect(EVAL_SETS.designIntentChallenge.label).toMatch(/^SEALED CHALLENGE \(4C DesignIntent\)/);
    // Only the sealed challenge claims generalization, and the other two say so in the negative.
    expect(EVAL_SETS.designIntentRegression.label).toContain("NOT generalization evidence");
    expect(EVAL_SETS.designIntentValidation.label).toContain("NOT generalization evidence");
    expect(EVAL_SETS.designIntentChallenge.label).toContain("One run, then spent");
    // None of the three may read as the `v5` fresh-challenge claim, which is a different set's.
    for (const set of CORPORA)
      expect(EVAL_SETS[set].label).not.toMatch(/generalization evidence for v5/);
    expect(new Set(CORPORA.map((set) => EVAL_SETS[set].label)).size).toBe(3);
  });

  it("scans all three for leakage the moment they land", () => {
    const scan = read("src/lib/ai/evals/prompt-leakage.test.ts");
    expect(scan).toContain("CORPUS_FILES");
    expect(scan).toContain("leakageProbes");
    expect(scan).toContain("CORPUS_FILES.designIntentRegression");
    expect(scan).toContain("CORPUS_FILES.designIntentValidation");
    expect(scan).toContain("CORPUS_FILES.designIntentChallenge");
  });

  it("declares the DesignIntent prompt and wire schema as scanned surfaces", () => {
    // Declared at T19, before the 4C corpora are authored and before T21 writes the prompt, so the
    // scanner cannot be widened after someone has seen the cases. Both files exist today — the
    // prompt as a pre-provider draft no model has been sent — so neither is skipped.
    const contracts = read("src/lib/ai/evals/corpus.ts");
    expect(contracts).toContain(
      '"design intent prompt": "docs/model-prompts/design-intent.system.md"',
    );
    expect(contracts).toContain(
      '"design intent wire schema": "docs/model-schemas/design-intent.wire.schema.json"',
    );
    expect(existsSync(`${ROOT}docs/model-prompts/design-intent.system.md`)).toBe(true);
    expect(existsSync(`${ROOT}docs/model-schemas/design-intent.wire.schema.json`)).toBe(true);
  });

  it("publishes the contract in canon, where an independent author will read it", () => {
    const contracts = read("docs/model-contracts.md");
    expect(contracts).toContain("## 4.7 DesignIntent evaluation contract");
    for (const set of CORPORA) {
      expect(contracts).toContain(CORPUS_FILES[set]);
      expect(contracts).toContain(EVAL_SETS[set].out);
    }
    expect(contracts).toContain("`docs/phase-4b-plan.md §3.7`");
    // One normative copy of the gate's numbers, and it is the plan's. Canon points at it.
    expect(contracts).not.toContain("12 / 12 `Excellent`");
  });
});
