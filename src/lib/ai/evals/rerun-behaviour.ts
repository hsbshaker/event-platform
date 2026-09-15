/**
 * The Phase 4B rerun-behaviour validation set: everything except the cases.
 *
 * `docs/phase-4b-plan.md §3.9` and Part IV T4–T8. Introducing clarification answers changes the
 * effective model input even though `event_identity_v5`'s prompt file does not change, and `v5`
 * was evidenced with no answer ever present. A small pre-registered validation set exercises that
 * gap.
 *
 * **What makes it pre-registered is the order, and the order is why this file exists now.** The
 * machinery and every acceptance criterion are written and frozen while no case exists (T4, frozen
 * at T5). Only then does an independent author — who implements neither this file nor the
 * assembly it tests — write the cases from the published dimensions below (T6), have them reviewed
 * for fairness and leakage (T7), and freeze them at their own input SHA (T8). A harness written
 * after the cases would be a harness whose author knew what it had to grade, which is the same
 * defect as a prompt written after a corpus, one level along.
 *
 * So: **nothing below may change once T5 freezes it.** Not the paths, not the structural contract,
 * not the checks, not the criteria. If a case collides with existing model-visible text or
 * violates the contract, the corpus is fixed by its author before T8 — never the checker.
 *
 * ## The setup is frozen, and only the rerun is live
 *
 * An earlier version of this contract asked the corpus author to write an answer naming a
 * `questionIndex` and an option label — for a question that would not exist until a live model
 * call produced it, during the run those answers were supposed to drive. That is an invalid
 * dependency in the literal sense: the corpus referred forward to a stochastic output its author
 * could not observe. It had two failure modes and no good one. Either the live setup call asked no
 * question, or a different route, or a different index, or different labels — and a correct
 * assembly failed permanently for a reason that had nothing to do with assembly — or the harness
 * injected an answer to a question nobody asked, which stops exercising production's clarification
 * semantics at all. `defer_is_an_answer` made it plainest: a corpus cannot truthfully name the
 * model's single defer option before that option exists.
 *
 * So the prior clarification history is **frozen setup state, authored with the case**: the host's
 * original description, one or more prior revisions each carrying the questions that were asked,
 * and the host's answers bound to those questions by locator. `buildSeededRevision` turns that
 * narrow structure into a schema-valid identity envelope — the same shape
 * `event_identity_revisions.result` persists — so T9 resolves `(revision, questionIndex)` exactly
 * as production resolves `(identity_revision_id, question_index)`, against an immutable revision.
 * Nothing is loosened: an answer still cannot name a question that does not exist, because the
 * question exists in its own case.
 *
 * The **one** paid provider call per case is the rerun itself. What the setup is not: a claim that
 * any model produced it. The blind artifact says so on its face, and the placeholder brief text
 * says so in its own words, so a qualitative reviewer cannot mistake fixture state for output.
 *
 * Its class, stated so nobody upgrades it later: **pre-registered validation evidence for the
 * clarification-answer input shape/lifecycle — NOT fresh generalization evidence for EventIdentity
 * v5 and NOT a replacement for the spent v5 sealed challenge.** It measures how an answer is
 * represented, preserved, attributed and delivered. It measures nothing about whether EventIdentity
 * asks good questions, or asks any.
 */
import {
  CLARIFICATION_CEILING,
  SUPPLIED_FACT_FIELDS,
  type EventIdentityResult,
  type SuppliedEventFacts,
} from "@/lib/ai/event-identity/contract";
import { EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";

import { ASSEMBLY_VERSION_BEFORE_ANSWERS } from "./corpus";
import type { CaseRun } from "./report";

/* ------------------------------------------------------------------ published dimensions */

/**
 * What the corpus author is told, and all they are told.
 *
 * They receive these dimensions and the structural contract below. Not this repository, not the
 * checker's source, not the assembly they will exercise, and not the `v5` prompt.
 */
export const RERUN_CAPABILITY_DIMENSIONS = [
  "answer_is_current_input: a clarification answer reaches the rerun as the host's current input, not as a rewrite of the original description",
  "original_description_survives: the original event description is unchanged, and the answers are not flattened into it",
  "answer_precedence: where an answer conflicts with the earlier description, the answer governs",
  "defer_is_an_answer: a deferred creative question is answered, and the rerun commits rather than re-asking the same thing",
  "boundary_resolution: once a boundary question is answered, the rerun may produce an authoritative identity",
  "no_fact_invention: an answer never becomes a supplied fact the host did not state",
  "multi_round_provenance: with two rounds of answers, both are carried and neither is lost",
] as const;

/** The dimension whose cases are meaningless with a single round of history. */
export const MULTI_ROUND_DIMENSION = RERUN_CAPABILITY_DIMENSIONS[6];

/* ------------------------------------------------------------------ the structural contract */

/** One option as the host would read it. Exactly the production shape, minus nothing. */
export interface SeededOption {
  label: string;
  /**
   * `spec.md §7.6b #4`: a creative question offers exactly one, a boundary question none.
   * Optional in the corpus only so an author need not write `false` nine times.
   */
  isDefer?: boolean;
}

/**
 * A question the host was asked, in a round that had already happened when the rerun begins.
 *
 * The author writes `kind`, `question` and `options` and nothing else. `whyItMatters` — which the
 * production schema requires — is synthesised by `buildSeededRevision` rather than asked for: it
 * keeps the author-facing contract to what a case is actually about, and it makes the CA-4
 * negative check sharper, because a generated sentinel appearing in the assembled request is
 * unambiguous evidence that model-authored rationale was resent.
 */
export interface SeededQuestion {
  kind: "creative" | "boundary";
  question: string;
  options: SeededOption[];
}

/** What the host said, bound to a question that exists in this case's own setup. */
export interface SeededAnswer {
  /** The ordinal in this round's `questions`. The locator, exactly as production uses it. */
  questionIndex: number;
  /** The option the host picked, or null when they typed instead. */
  selectedOptionLabel: string | null;
  freeText: string | null;
  /** True only when the selected option is the question's own defer option. */
  isDefer?: boolean;
}

/** One prior revision: what was asked, and what the host answered. */
export interface RerunHistoryRound {
  questions: SeededQuestion[];
  answers: SeededAnswer[];
}

export interface RerunCase {
  id: string;
  /** The host's original description. It is never rewritten, in setup or in the rerun. */
  prompt: string;
  /** Which published dimension this case exercises. */
  dimension: string;
  /**
   * The clarification rounds that already happened, oldest first. Frozen setup state: no model
   * produced it, and the run makes no call to obtain it.
   */
  history: RerunHistoryRound[];
  /**
   * Which `suppliedFacts` must be **absent** after the rerun: every value is `null`, meaning the
   * field was not supplied — absent or present-and-null, which the schema makes one claim since it
   * always emits the key. A quoted value is refused by the contract: the schema's values are
   * trimmed verbatim quotations, so asserting one asks the author to predict the model's exact
   * span, which is the dependency this set was redesigned to remove. Keys are validated against
   * the real schema, so a plausible-looking `venue` is refused here rather than failing a clean
   * run at T13.
   */
  expectedFacts?: Record<string, string | null>;
  /** Terms an answer must not turn into a supplied fact. Matched against fact **values**. */
  mustNotInvent?: string[];
  rationale?: string;
}

export interface RerunCorpus {
  version: string;
  cases: RerunCase[];
}

/* ------------------------------------------------------------------ the fixture builder */

/**
 * The placeholder brief carried by every seeded revision.
 *
 * Schema-valid, and deliberately not plausible creative work: a reviewer who sees it must be able
 * to tell at a glance that it is fixture state. Its content is never asserted on — only the
 * `clarification` block of a seeded revision means anything — but it has to parse, because the
 * point of building a real envelope is that T9 resolves a locator against the same shape
 * production persists rather than against a convenient subset.
 */
const SEEDED_BRIEF: EventIdentityResult["identity"] = {
  creativeDirection:
    "Frozen validation fixture. This brief is setup state authored alongside the case; no model produced it.",
  toneKeywords: ["fixture", "placeholder", "not-model-authored"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: [],
    avoidColors: [],
    dominanceNotes: "Fixture placeholder; carries no creative claim.",
  },
  tonalIntent: "Fixture placeholder; carries no creative claim.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["invitation"],
  compatibleTypographyCategories: ["transitional"],
  visualMotifs: [],
  textureDirection: "Fixture placeholder; carries no creative claim.",
  typographyDirection: "Fixture placeholder; carries no creative claim.",
  copyTone: "Fixture placeholder; carries no creative claim.",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No inspiration was supplied with this fixture.",
};

/** Every fact null: the setup asserts nothing about what the host supplied. */
const SEEDED_FACTS = Object.fromEntries(
  SUPPLIED_FACT_FIELDS.map((field) => [field, null]),
) as SuppliedEventFacts;

/**
 * The `whyItMatters` a seeded question carries.
 *
 * Model-authored rationale in production, which CA-4 says must **not** be resent to the model
 * alongside the answer. Generated here, uniquely per question, so `menuNotResent` can look for it
 * verbatim: this exact string in the assembled request can only have come from the revision
 * envelope, and only by resending rationale the decision says to leave out.
 */
export function seededWhyItMatters(revision: number, questionIndex: number): string {
  return `Fixture rationale r${revision}q${questionIndex}; not host-authored and not for resending.`;
}

/**
 * Build the identity envelope a prior revision would have persisted.
 *
 * Deterministic, total, and schema-valid — `rerun-behaviour.test.ts` parses its output with the
 * real `eventIdentityResultSchema`, so "valid fixture envelope" is checked rather than claimed.
 * `revision` is 1-based, matching `event_identity_revisions.revision`.
 */
export function buildSeededRevision(
  round: RerunHistoryRound,
  revision: number,
): EventIdentityResult {
  return {
    identity: structuredClone(SEEDED_BRIEF),
    suppliedFacts: { ...SEEDED_FACTS },
    clarification: {
      needed: round.questions.length > 0,
      questions: round.questions.map((question, questionIndex) => ({
        kind: question.kind,
        question: question.question,
        whyItMatters: seededWhyItMatters(revision, questionIndex),
        options: question.options.map((option) => ({
          label: option.label,
          isDefer: option.isDefer === true,
        })),
      })),
    },
  };
}

/**
 * The cumulative clarification history the rerun must carry, oldest first (**CA-5**).
 *
 * EventIdentity is a stateless call, so an answer absent from the request is absent from the
 * model's input. Round 3 that carries only round 3's answer has silently discarded what the host
 * settled in round 2, which is what `multi_round_provenance` exists to refuse. `kind` is read off
 * the question rather than taken from the author, so an answer's route can never disagree with the
 * question it answers.
 */
export function cumulativeHistory(testCase: RerunCase): RerunAnswerInput[] {
  return testCase.history.flatMap((round, index) =>
    round.answers.map((answer) => ({
      revision: index + 1,
      questionIndex: answer.questionIndex,
      // Throws rather than defaulting: a silent `"creative"` would mislabel a boundary answer's
      // route in the evidence. The contract refuses an out-of-range index, so this is unreachable
      // for any corpus that got this far — and unreachable by construction beats unreachable by
      // inspection.
      kind: (() => {
        const kind = round.questions[answer.questionIndex]?.kind;
        if (kind === undefined) {
          throw new Error(
            `case ${testCase.id}: revision ${index + 1} has no question at index ${answer.questionIndex}`,
          );
        }
        return kind;
      })(),
      selectedOptionLabel: answer.selectedOptionLabel,
      freeText: answer.freeText,
      isDefer: answer.isDefer === true,
    })),
  );
}

/** The seeded question an assembled answer refers to, or undefined if the locator is wrong. */
export function questionFor(
  testCase: RerunCase,
  locator: { revision: number; questionIndex: number },
): SeededQuestion | undefined {
  return testCase.history[locator.revision - 1]?.questions[locator.questionIndex];
}

/* ------------------------------------------------------------------ corpus validation */

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Every problem with the corpus, or an empty array.
 *
 * Published so an author can satisfy it without reading the runner, and pure so it can be
 * unit-tested without importing the module that spends money — the rule incident 2 produced
 * (`docs/model-evals/eval-incidents.md`). It mirrors `validate_clarification_answer()`: an answer
 * must name a question that exists, pick an option that was offered, and follow its route's defer
 * rule. The difference is only that here the question is in the same file.
 */
export function validateRerunCorpusShape(parsed: unknown): string[] {
  const problems: string[] = [];
  const corpus = (parsed ?? {}) as Partial<RerunCorpus>;

  if (!nonEmpty(corpus.version)) {
    problems.push("top-level `version` must be a non-empty string");
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    problems.push("`cases` must be a non-empty array");
    return problems;
  }

  const seen = new Set<string>();
  const dimensions = new Set<string>(RERUN_CAPABILITY_DIMENSIONS);

  corpus.cases.forEach((testCase, index) => {
    const where = nonEmpty(testCase?.id) ? testCase.id : `cases[${index}]`;

    if (!nonEmpty(testCase?.id)) {
      problems.push(`${where}: \`id\` must be a non-empty string`);
    } else if (seen.has(testCase.id)) {
      problems.push(`${where}: duplicate \`id\``);
    } else {
      seen.add(testCase.id);
    }

    if (!nonEmpty(testCase?.prompt)) {
      problems.push(`${where}: \`prompt\` must be a non-empty string`);
    } else if (testCase.prompt !== testCase.prompt.trim()) {
      // `promptByteIdentical` requires the prompt verbatim inside the request, and host-derived
      // strings are trimmed all over `contract.ts`. A padded prompt would fail an absolute check
      // the first time an assembly trimmed the description — permanently, against a correct
      // implementation. Refusing the padding costs the author nothing.
      problems.push(`${where}: \`prompt\` must not have leading or trailing whitespace`);
    }

    if (!nonEmpty(testCase?.dimension) || !dimensions.has(testCase.dimension)) {
      problems.push(`${where}: \`dimension\` must be one of the published capability dimensions`);
      return;
    }

    const history = testCase?.history;
    if (!Array.isArray(history) || history.length === 0) {
      // Without prior history there is nothing to carry into the rerun, which is the whole set.
      problems.push(`${where}: \`history\` must have at least one round`);
      return;
    }
    if (testCase.dimension === MULTI_ROUND_DIMENSION && history.length < 2) {
      problems.push(
        `${where}: a ${MULTI_ROUND_DIMENSION.split(":")[0]} case needs at least two history rounds`,
      );
    }

    const questionTexts = new Set<string>();

    history.forEach((round, roundIndex) => {
      const at = `${where} round ${roundIndex + 1}`;
      const questions = round?.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        problems.push(`${at}: \`questions\` must be a non-empty array`);
        return;
      }
      // The refinements `clarificationDecisionSchema` enforces, mirrored verbatim. Without them a
      // corpus this validator accepts builds a revision envelope the real schema rejects — and a
      // T9 assembly that parses fail-closed (as every other reader here does) throws inside the
      // call, so the runner journals our own corpus defect as a provider failure and destroys a
      // one-shot paid run at the first such case. "Schema-valid by construction" has to be true of
      // everything the contract admits, not of the examples the author happened to write.
      if (questions.length > CLARIFICATION_CEILING) {
        problems.push(`${at}: at most ${CLARIFICATION_CEILING} questions in a round`);
      }
      const boundaries = questions.filter((q) => q?.kind === "boundary").length;
      if (boundaries > 1 || (boundaries === 1 && questions.length > 1)) {
        problems.push(
          `${at}: a boundary question must be the only question in its round (spec.md §7.6b)`,
        );
      }

      questions.forEach((question, questionIndex) => {
        const qAt = `${at} q${questionIndex}`;
        if (question?.kind !== "creative" && question?.kind !== "boundary") {
          problems.push(`${qAt}: \`kind\` must be "creative" or "boundary"`);
        }
        if (!nonEmpty(question?.question) || question.question.trim().length < 8) {
          problems.push(`${qAt}: \`question\` must be a question of at least 8 characters`);
        } else if (question.question.length > 240) {
          problems.push(`${qAt}: \`question\` must be at most 240 characters`);
        } else if (question.question !== question.question.trim()) {
          // The same rule as the prompt, and for the same reason: Zod `.trim()` is a transform,
          // not a rejection, so an assembly that parses the envelope renders the trimmed text
          // while `questionRenderedWithAnswer` searches for the padded one — a permanent failure
          // against a correct implementation, over whitespace.
          problems.push(`${qAt}: \`question\` must not have leading or trailing whitespace`);
        } else if (
          [...questionTexts].some(
            (seen) => seen.includes(question.question) || question.question.includes(seen),
          )
        ) {
          // `questionRenderedWithAnswer` locates each question in the request by its text and
          // requires chronological order. Identical texts make that undecidable, and a text that
          // is a substring of another inverts it, which is worse: it fails silently and wrongly.
          problems.push(`${qAt}: question text repeats or contains another question's in the case`);
        } else {
          questionTexts.add(question.question);
        }

        const options = question?.options;
        if (!Array.isArray(options) || options.length < 2 || options.length > 5) {
          problems.push(`${qAt}: \`options\` must hold between 2 and 5 options`);
          return;
        }
        const labels = options.map((option) => option?.label);
        if (labels.some((label) => !nonEmpty(label))) {
          problems.push(`${qAt}: every option needs a non-empty \`label\``);
        }
        if (labels.some((label) => typeof label === "string" && label.length > 80)) {
          problems.push(`${qAt}: an option \`label\` must be at most 80 characters`);
        }
        if (labels.some((label) => typeof label === "string" && label !== label.trim())) {
          problems.push(`${qAt}: an option \`label\` must not have leading or trailing whitespace`);
        }
        if (new Set(labels).size !== labels.length) {
          problems.push(`${qAt}: option labels must be distinct`);
        }
        const defers = options.filter((option) => option?.isDefer === true).length;
        if (question?.kind === "creative" && defers !== 1) {
          problems.push(`${qAt}: a creative question offers exactly one defer option`);
        }
        if (question?.kind === "boundary" && defers !== 0) {
          problems.push(`${qAt}: a boundary question offers no defer option (spec.md §7.6b #4)`);
        }
      });

      const answers = round?.answers;
      if (!Array.isArray(answers) || answers.length === 0) {
        problems.push(`${at}: \`answers\` must be a non-empty array`);
        return;
      }

      const answered = new Set<number>();
      answers.forEach((answer, answerIndex) => {
        const aAt = `${at} answer ${answerIndex}`;
        const question = questions[answer?.questionIndex as number];
        if (!Number.isInteger(answer?.questionIndex) || question === undefined) {
          problems.push(`${aAt}: \`questionIndex\` must name a question of this round`);
          return;
        }
        if (answered.has(answer.questionIndex)) {
          problems.push(`${aAt}: q${answer.questionIndex} is answered twice in one round`);
        }
        // Ascending, because production orders answers by `(round, question_index)` — that is
        // literally the index built for it — while this array is carried in the order the author
        // wrote it. A round listing q1 before q0 would demand that order of the request and fail
        // two absolute checks against a correct assembly.
        if (answered.size > 0 && answer.questionIndex <= Math.max(...answered)) {
          problems.push(`${aAt}: answers must be listed in ascending \`questionIndex\` order`);
        }
        answered.add(answer.questionIndex);

        const labels = (question.options ?? []).map((option) => option?.label);
        if (answer.selectedOptionLabel !== null && answer.selectedOptionLabel !== undefined) {
          if (!labels.includes(answer.selectedOptionLabel)) {
            problems.push(`${aAt}: \`selectedOptionLabel\` is not one of the options offered`);
          }
        }
        const selected = (question.options ?? []).find(
          (option) => option?.label === answer.selectedOptionLabel,
        );
        const saysDefer = answer.isDefer === true;
        if (saysDefer && question.kind === "boundary") {
          problems.push(`${aAt}: a boundary question offers no defer option (spec.md §7.6b #4)`);
        }
        if (saysDefer && selected?.isDefer !== true) {
          problems.push(`${aAt}: a deferred answer must select the question's own defer option`);
        }
        if (!saysDefer && selected?.isDefer === true) {
          problems.push(`${aAt}: selecting the defer option must be recorded as \`isDefer\``);
        }
        if (
          (answer.selectedOptionLabel === null || answer.selectedOptionLabel === undefined) &&
          !nonEmpty(answer.freeText)
        ) {
          problems.push(`${aAt}: an answer must select an option or supply text`);
        }
      });
    });

    const facts = testCase?.expectedFacts;
    if (facts !== undefined) {
      if (typeof facts !== "object" || facts === null || Array.isArray(facts)) {
        problems.push(`${where}: \`expectedFacts\` must be an object`);
      } else {
        for (const [key, value] of Object.entries(facts)) {
          // Checked against the real schema. An author writing `venue` for `venueText` would
          // otherwise read as null, mismatch, and fail a clean run permanently — and the author is
          // deliberately never shown the wire schema, so they could not have known.
          if (!(SUPPLIED_FACT_FIELDS as string[]).includes(key)) {
            problems.push(
              `${where}: \`expectedFacts.${key}\` is not a supplied-fact field (${SUPPLIED_FACT_FIELDS.join(", ")})`,
            );
          }
          if (value !== null) {
            // Absence is assertable; a quotation is a prediction. Values are trimmed verbatim
            // quotations of the host, so `"the orangery"` loses the whole one-shot run if the
            // model quotes `"orangery"` or `"at the orangery"` — the author predicting a
            // stochastic span, which is the dependency this whole redesign removed. No published
            // dimension needs one: `no_fact_invention` is served by `mustNotInvent` plus null
            // expectations, and `answer_precedence` is qualitative.
            problems.push(
              `${where}: \`expectedFacts.${key}\` must be null — assert that a fact was NOT ` +
                "supplied. A quoted value would require predicting the model's exact wording.",
            );
          }
        }
      }
    }

    const mustNotInvent = testCase?.mustNotInvent;
    if (mustNotInvent !== undefined) {
      if (!Array.isArray(mustNotInvent) || mustNotInvent.some((term) => !nonEmpty(term))) {
        problems.push(`${where}: \`mustNotInvent\` must be an array of non-empty strings`);
      }
    }
  });

  return problems;
}

/* ------------------------------------------------------------------ what a run observes */

export type CheckStatus = "pass" | "fail" | "advisory" | "n/a";

export interface RerunCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

/**
 * What one case produced. One paid call, so one of everything.
 *
 * The setup rounds are not in here: they are frozen inputs, known from the corpus, and recording
 * them as observations would blur the line the redesign exists to draw.
 */
export interface RerunObservation {
  caseId: string;
  /** The host's original description as the implementation reports having sent it. */
  promptSent: string;
  /**
   * The assembled user message, verbatim as transmitted — and only that: no correction turn, and
   * no assistant echo of a previous response, so no text the provider produced can reach a check.
   *
   * The checks are anchored here rather than to the self-reported fields, because those are
   * satisfiable by an implementation that echoes its arguments: `promptSent: request.prompt` and
   * `answersAssembled: request.answers` would pass for every case without anything having been
   * sent. A seeded question's text cannot be echoed from the request's answers at all — it can
   * only be reached by resolving the locator against the revision envelope, which is exactly the
   * production semantics under test.
   */
  requestText: string;
  result: unknown;
  /** As the lifecycle module judged it, or `"unreadable"` when it refused the envelope. */
  provisional: boolean | "unreadable";
  /** The answers the implementation reports having assembled. */
  answersAssembled: RerunAnswerInput[];
  assemblyVersion: string;
  schemaVersion: string;
}

/* ------------------------------------------------------------------ the mechanical checks */

/**
 * The generic mechanical checks, frozen before any case exists.
 *
 * Every one is decidable from the observation and the frozen case alone, without a judgement about
 * creative quality — that is the qualitative half's job. A check whose input is absent reports
 * `n/a`, and an undecidable one reports `advisory`; **neither is ever counted as a pass**, which is
 * the distinction `model-contracts.md §4.5` says a clean mechanical run must not blur.
 *
 * None of them asks whether EventIdentity chose to ask a question. That is the stochastic
 * behaviour this set was redesigned to stop depending on.
 */
export function checkRerunCase(testCase: RerunCase, observed: RerunObservation): RerunCheck[] {
  const checks: RerunCheck[] = [];
  const add = (name: string, status: CheckStatus, detail: string) =>
    checks.push({ name, status, detail });

  const request = typeof observed.requestText === "string" ? observed.requestText : "";
  const history = cumulativeHistory(testCase);

  /* --- the original description survives, intact and separate ------------------------------ */

  const reportedOk = observed.promptSent === testCase.prompt;
  const transmittedOk = request.includes(testCase.prompt);
  add(
    "promptByteIdentical",
    reportedOk && transmittedOk ? "pass" : "fail",
    !reportedOk
      ? "the description the implementation reports sending is not the case's own"
      : transmittedOk
        ? // Byte-identical inclusion is also what makes "history is not flattened into the prompt"
          // true: the host's original text appears as its own contiguous run, so anything the
          // assembly added about the answers is necessarily outside it.
          "the original description appears verbatim in the request, unrewritten"
        : "the transmitted request does not contain the original description verbatim",
  );

  /* --- CA-4: every carried answer arrives attributed to the question it answers ------------- */

  const missingQuestions: string[] = [];
  const positions: number[] = [];
  for (const answer of history) {
    const question = questionFor(testCase, answer);
    if (question === undefined) continue;
    const at = request.indexOf(question.question);
    if (at < 0) {
      missingQuestions.push(`r${answer.revision}q${answer.questionIndex}`);
    } else {
      positions.push(at);
    }
  }
  const ordered = positions.every((at, i) => i === 0 || at > positions[i - 1]);
  const questionsOk = missingQuestions.length === 0 && ordered;
  add(
    "questionRenderedWithAnswer",
    questionsOk ? "pass" : "fail",
    missingQuestions.length > 0
      ? `the question was not rendered with the answer for ${missingQuestions.join(", ")}: the ` +
          "host's answer would reach the model as host-authored content with no question attached"
      : ordered
        ? "every carried answer arrives with the exact question it answers, in chronological order"
        : "the carried questions are not in chronological order",
  );

  /* --- CA-4's other half: the question, not the whole menu the model generated -------------- */

  /**
   * A label is evidence of a resent menu only when nothing legitimate could have put it there.
   *
   * The allowlist is built once per case, not per answer. Built per answer it admitted three
   * sources — the prompt, that same question's text, that same answer's free text — and flagged
   * every other occurrence, which fails a correct assembly in at least four ordinary shapes:
   * two creative questions both labelled "You decide" (`spec.md §7.6b #4` requires a defer option
   * on every one of them, and labels are unique only within a question), a selected
   * "Warm and candlelit" that contains an unselected "Warm", a label that appears in another
   * question's text, and a label the host typed in a different round's free text. The T6 author
   * cannot avoid any of that, because they never see this checker.
   *
   * The sharp half is kept absolute: `whyItMatters` is generated per question and is never
   * legitimate in a request, so its presence is unambiguous — and it is scanned for every seeded
   * question, not only answered ones, since resending an unanswered question's rationale is the
   * same violation.
   */
  const legitimate = [
    testCase.prompt,
    ...testCase.history.flatMap((round) => [
      ...round.questions.map((question) => question.question),
      ...round.answers.flatMap((answer) => [
        answer.selectedOptionLabel ?? "",
        answer.freeText ?? "",
      ]),
    ]),
  ];
  const resent: string[] = [];
  testCase.history.forEach((round, roundIndex) => {
    round.questions.forEach((question, questionIndex) => {
      const at = `r${roundIndex + 1}q${questionIndex}`;
      if (request.includes(seededWhyItMatters(roundIndex + 1, questionIndex))) {
        resent.push(`${at} whyItMatters`);
      }
      for (const option of question.options) {
        if (legitimate.some((text) => text.includes(option.label))) continue;
        if (request.includes(option.label)) resent.push(`${at} "${option.label}"`);
      }
    });
  });
  add(
    "menuNotResent",
    resent.length === 0 ? "pass" : "fail",
    resent.length === 0
      ? "no unselected option and no model-authored rationale was sent back"
      : `resent to the model: ${resent.join(", ")}`,
  );

  /* --- CA-5: the whole history, not just the latest round ----------------------------------- */

  const lost: string[] = [];
  for (const answer of history) {
    const at = `r${answer.revision}q${answer.questionIndex}`;
    if (answer.selectedOptionLabel !== null && !request.includes(answer.selectedOptionLabel)) {
      lost.push(`${at} option`);
    }
    // Trimmed: the corpus accepts padded free text and the database stores it untrimmed, so an
    // assembly rendering `freeText.trim()` is correct and must not fail here.
    const typed = answer.freeText?.trim();
    if (typed && !request.includes(typed)) {
      lost.push(`${at} text`);
    }
  }
  add(
    "historyDelivered",
    lost.length === 0 ? "pass" : "fail",
    lost.length === 0
      ? `all ${history.length} prior answer(s) reached the model, oldest first`
      : `not transmitted: ${lost.join(", ")} — an answer the host gave is no longer available to ` +
          "the model, which is stateless",
  );

  /* --- CA-4's point: each answer travels with *its own* question, not merely alongside one --- */

  /**
   * Co-presence and order are not attribution.
   *
   * Without this, an assembly that renders question 1 with answer 2 and question 2 with answer 1
   * passes everything above: both texts are present, in order, and both labels are present. That
   * is a real CA-4 violation — the decision is *previous system question → host's current answer* —
   * sailing through every absolute check, and `answersAssembledAsGiven` cannot catch it because it
   * is a self-report of the very thing in doubt.
   *
   * The window is deliberately loose: an answer's text must occur somewhere between the *previous*
   * question and the *next* one, so "We asked X. The host said Y" and "Y — we had asked X" both
   * pass, and only a genuine crossing fails. Every occurrence is considered, not the first, so a
   * label that also appears in a summary elsewhere cannot push a correct rendering out of range.
   */
  const occurrences = (needle: string): number[] => {
    if (needle.length === 0) return [];
    const found: number[] = [];
    for (let at = request.indexOf(needle); at >= 0; at = request.indexOf(needle, at + 1)) {
      found.push(at);
    }
    return found;
  };
  const crossed: string[] = [];
  if (missingQuestions.length === 0 && ordered) {
    history.forEach((answer, i) => {
      const from = i === 0 ? -1 : positions[i - 1];
      const to = i === positions.length - 1 ? request.length : positions[i + 1];
      const said = [answer.selectedOptionLabel, answer.freeText?.trim()].filter(
        (text): text is string => typeof text === "string" && text.length > 0,
      );
      const inWindow = said.some((text) => occurrences(text).some((at) => at > from && at < to));
      if (said.length > 0 && !inWindow) {
        crossed.push(`r${answer.revision}q${answer.questionIndex}`);
      }
    });
  }
  const bound = crossed.length === 0;
  add(
    "answerBoundToItsQuestion",
    missingQuestions.length > 0 || !ordered ? "n/a" : bound ? "pass" : "fail",
    missingQuestions.length > 0 || !ordered
      ? "not decidable: the carried questions are missing or out of order"
      : bound
        ? "each answer is rendered with the question it answers, not merely in the same request"
        : `rendered away from its own question: ${crossed.join(", ")}`,
  );

  /* --- and the representation the implementation reports, matched against the frozen history - */

  const same = (a: RerunAnswerInput | undefined, b: RerunAnswerInput) =>
    a !== undefined &&
    a.revision === b.revision &&
    a.questionIndex === b.questionIndex &&
    a.kind === b.kind &&
    a.selectedOptionLabel === b.selectedOptionLabel &&
    a.freeText === b.freeText &&
    a.isDefer === b.isDefer;
  const assembled = Array.isArray(observed.answersAssembled) ? observed.answersAssembled : [];
  const assembledOk =
    assembled.length === history.length && history.every((answer, i) => same(assembled[i], answer));
  add(
    "answersAssembledAsGiven",
    assembledOk ? "pass" : "fail",
    assembledOk
      ? "the assembly carried exactly the cumulative history — locator, route, option, text and " +
          "defer flag — oldest first"
      : `expected ${history.length} cumulative answer(s), got ${assembled.length} differing in ` +
          "locator, route, option, text, defer flag, count or order",
  );

  /* --- provenance stamps -------------------------------------------------------------------- */

  const version = observed.assemblyVersion;
  const versionOk =
    typeof version === "string" &&
    version.length > 0 &&
    version !== ASSEMBLY_VERSION_BEFORE_ANSWERS;
  add(
    "assemblyVersionRecorded",
    versionOk ? "pass" : "fail",
    versionOk
      ? `input assembly version recorded: ${version}`
      : `expected a recorded version other than ${ASSEMBLY_VERSION_BEFORE_ANSWERS}, got: ${
          typeof version === "string" && version.length > 0 ? version : "none"
        }`,
  );

  add(
    "schemaVersionExpected",
    observed.schemaVersion === EVENT_IDENTITY_SCHEMA_VERSION ? "pass" : "fail",
    `schema version: ${typeof observed.schemaVersion === "string" ? observed.schemaVersion : "none"}`,
  );

  /* --- what came back ------------------------------------------------------------------------ */

  // Gating and separate from the version check, because the two causes of `"unreadable"` do not
  // both surface there: a malformed clarification block — T9 returning the brief rather than the
  // envelope, which `assertAuthoritative` returns and is an easy mistake — would otherwise move no
  // check at all, and the case would report a pass over evidence holding no clarification data.
  add(
    "envelopeReadable",
    observed.provisional === "unreadable" ? "fail" : "pass",
    observed.provisional === "unreadable"
      ? "the lifecycle reader refused the rerun's envelope"
      : "the rerun returned a readable identity envelope",
  );

  const boundaryAnswered = history.some((answer) => answer.kind === "boundary");
  if (!boundaryAnswered) {
    add("boundaryResolves", "n/a", "no boundary question was answered in this case");
  } else {
    add(
      "boundaryResolves",
      observed.provisional === false ? "pass" : "advisory",
      observed.provisional === false
        ? "the rerun is authoritative after the boundary answer"
        : observed.provisional === "unreadable"
          ? // Never "still provisional": that asserts something about the model on an envelope
            // that was never read. `envelopeReadable` is where this fails.
            "the envelope was unreadable, so provisional state is unknown"
          : "the rerun is still provisional; whether a further question is warranted is a judgement",
    );
  }

  // Advisory, never a failure: a rerun that raises a *new* question is legitimate, and whether a
  // rephrasing is the same question is a judgement. Verbatim repetition is worth surfacing.
  const reAsked = (
    ((observed.result ?? {}) as { clarification?: { questions?: { question?: string }[] } })
      .clarification?.questions ?? []
  )
    .map((question) => question?.question)
    .filter((text): text is string =>
      history.some((answer) => questionFor(testCase, answer)?.question === text),
    );
  add(
    "reAskedAnsweredQuestion",
    reAsked.length === 0 ? "pass" : "advisory",
    reAsked.length === 0
      ? "the rerun did not repeat a question the host had already answered"
      : `the rerun repeated ${reAsked.length} already-answered question(s) verbatim`,
  );

  const facts = testCase.expectedFacts ?? {};
  if (Object.keys(facts).length === 0) {
    add("expectedFacts", "n/a", "the case asserts no facts");
  } else {
    const supplied = ((observed.result ?? {}) as { suppliedFacts?: unknown }).suppliedFacts as
      Record<string, unknown> | undefined;
    const wrong = Object.entries(facts).filter(
      ([key, value]) => (supplied?.[key] ?? null) !== value,
    );
    add(
      "expectedFacts",
      wrong.length === 0 ? "pass" : "fail",
      wrong.length === 0
        ? `${Object.keys(facts).length} assertion(s) hold`
        : wrong.map(([key, value]) => `${key} expected ${JSON.stringify(value)}`).join("; "),
    );
  }

  const mustNotInvent = testCase.mustNotInvent ?? [];
  if (mustNotInvent.length === 0) {
    add("noInventedFacts", "n/a", "the case names nothing that must not be invented");
  } else {
    // Values, not keys. The schema is strict and every field is always present, so stringifying
    // the object would put `venueText` and `dateText` into the blob on every response, and an
    // author writing "venue" would get a permanent fail on a clean envelope.
    const supplied = ((observed.result ?? {}) as { suppliedFacts?: unknown }).suppliedFacts;
    const blob = JSON.stringify(
      Object.values((supplied ?? {}) as Record<string, unknown>),
    ).toLowerCase();
    const found = mustNotInvent.filter((term) => blob.includes(term.toLowerCase()));
    add(
      "noInventedFacts",
      found.length === 0 ? "pass" : "fail",
      found.length === 0 ? "no forbidden term appears" : `invented: ${found.join(", ")}`,
    );
  }

  return checks;
}

/** A case passes mechanically when no gating check failed. Necessary, never sufficient. */
export function mechanicalPass(checks: RerunCheck[]): boolean {
  return !checks.some((check) => check.status === "fail");
}

/* ------------------------------------------------------------------ acceptance criteria */

/**
 * Frozen at T5, before the cases exist, and applied to the run unchanged.
 *
 * `spec.md §11.9`'s discipline, one level down: a threshold chosen after the result is not a
 * threshold. Both halves are stated here so that neither can be softened by rewording it later.
 */
export const RERUN_ACCEPTANCE = {
  evidenceClass:
    "pre-registered validation evidence for the clarification-answer input shape/lifecycle",
  notes: [
    "NOT fresh generalization evidence for EventIdentity v5",
    "NOT a replacement for the spent v5 sealed challenge",
    "validates the input shape and lifecycle, not the interpreter's creative quality",
    "the prior clarification history is frozen fixture state authored with the case; no model produced it, and only the rerun is a live call",
    "cumulative history is verified as rendering, not as selection: the harness hands the assembly the full history, so the production query that gathers every prior answer sits above this seam and is not evidenced here",
  ],
  mechanical:
    "Every case passes mechanically: no check reports `fail`. `promptByteIdentical`, " +
    "`questionRenderedWithAnswer`, `menuNotResent`, `historyDelivered` and " +
    "`answerBoundToItsQuestion` are absolute — a single failure of any of them fails the set, " +
    "because all five are correctness properties of the lifecycle rather than judgements, and " +
    "each is decided against the text actually transmitted. `answersAssembledAsGiven` gates too, " +
    "but it is a self-report of what the assembly believes it carried, cross-checked by the five " +
    "rather than trusted alongside them. None of the checks depends on what the rerun chose to " +
    "ask, and none reads text the provider produced.",
  qualitative:
    "An independent reviewer, reading a blind artifact of each case, answers three questions: " +
    "did the prior answer reach the rerun as the host's current input, rather than as a rewrite " +
    "of the original description; where the answer conflicted with the original description, did " +
    "the rerun respect the answer; and did the rerun avoid re-asking what had already been " +
    "answered. The second is conditional and is Yes where no conflict arises — most dimensions " +
    "produce an answer that adds to the description rather than contradicting it, and a reviewer " +
    "with nothing to cite there is reporting agreement, not withholding a verdict. The set " +
    "passes qualitatively when every case is Yes on all three. A No on any case fails the set, " +
    "and the reviewer cites the text.",
  advisoryNeverCounts: "`advisory` and `n/a` are never folded into the pass count, in either half.",
} as const;

/* ------------------------------------------------------------------ the blind artifact */

/**
 * What the reviewer sees: the frozen setup, labelled as frozen, then the live rerun.
 *
 * No case id, no dimension, no expectation, no rationale. The setup is rendered because questions
 * 1 and 2 are unanswerable without it — the reviewer has to see what the host was asked and what
 * they said — and it is labelled on its face because a reviewer who mistook fixture state for
 * model output would be reading this run as evidence about question generation, which it is not.
 */
export function buildRerunReviewArtifact(
  observations: { requestText: string; result: unknown }[],
  cases: { prompt: string; history: RerunHistoryRound[] }[],
): string {
  const lines = [
    "# Clarification rerun — blind review artifact",
    "",
    "Each block is one event. The **setup** is frozen fixture state written by hand with the case:",
    "a prior clarification round and the host's answer to it. **No model produced the setup**, and",
    "no call was made to obtain it — do not read it as evidence about how questions are generated.",
    "Only the final interpretation in each block came from a live call.",
    "",
    "For every case, answer three questions and cite the text:",
    "",
    "1. Did the prior answer reach the rerun as the host's current input, rather than as a rewrite",
    "   of what they originally wrote?",
    "2. Where the answer conflicted with the original description, did the rerun respect the",
    "   answer? (If nothing conflicts, that is a Yes.)",
    "3. Did the rerun avoid re-asking what had already been answered?",
    "",
    "You are not asked whether this passes.",
    "",
  ];
  observations.forEach((observation, index) => {
    const testCase = cases[index];
    lines.push(`## Case ${index + 1}`, "");
    lines.push("### Frozen setup — written by hand, not generated", "");
    lines.push("> " + (testCase?.prompt ?? "(not recorded)").replace(/\n/g, "\n> "), "");
    (testCase?.history ?? []).forEach((round, roundIndex) => {
      lines.push(`**Round ${roundIndex + 1}, asked of the host:**`, "");
      round.questions.forEach((question, questionIndex) => {
        const answer = round.answers.find((a) => a.questionIndex === questionIndex);
        lines.push(`- (${question.kind}) ${question.question}`);
        if (answer) {
          lines.push(
            `  - host answered: ` +
              `${answer.selectedOptionLabel === null ? "—" : `“${answer.selectedOptionLabel}”`}` +
              `${answer.freeText === null ? "" : ` · typed: “${answer.freeText}”`}` +
              `${answer.isDefer ? " · deferred to us" : ""}`,
          );
        }
      });
      lines.push("");
    });
    lines.push("### What the live rerun was sent", "");
    lines.push("> " + (observation.requestText ?? "(not recorded)").replace(/\n/g, "\n> "), "");
    lines.push(
      "### What the live rerun returned",
      "",
      "```json",
      JSON.stringify(observation.result ?? null, null, 2),
      "```",
      "",
    );
  });
  return lines.join("\n");
}

/* ------------------------------------------------------------------ the T9 seam */

/**
 * One carried clarification, as T9 receives it.
 *
 * The locator is `(revision, questionIndex)` — production's `(identity_revision_id,
 * question_index)` with the revision named by number because the fixture has no row id. T9
 * resolves it against `priorRevisions` exactly as production resolves it against the persisted
 * revision: read the question out of the envelope, never out of the answer. The answer carries no
 * question text on purpose, so an assembly cannot render a question the host was never asked.
 */
export interface RerunAnswerInput {
  revision: number;
  questionIndex: number;
  /** Derived from the question by `cumulativeHistory`, never declared by the corpus author. */
  kind: "creative" | "boundary";
  selectedOptionLabel: string | null;
  freeText: string | null;
  isDefer: boolean;
}

export interface RerunRequest {
  /** The host's original description. Never rewritten and never merged with the history. */
  prompt: string;
  /**
   * The prior identity revisions, oldest first, each a schema-valid envelope built by
   * `buildSeededRevision`. Frozen fixture state: no model produced these, and the run makes no
   * call to obtain them. They are here so the locator resolves against the same shape production
   * persists, rather than against a convenient subset of it.
   */
  priorRevisions: { revision: number; result: unknown }[];
  /**
   * The cumulative clarification history for this rerun, oldest first (**CA-5**).
   *
   * All of it, not the latest round: EventIdentity is stateless, so an answer left out is an
   * answer the model no longer has.
   */
  answers: RerunAnswerInput[];
}

/**
 * What a round costs and which versions produced it, in the shape `run.json` and the journal
 * already use, so what this set spent is recorded somewhere rather than nowhere. Stated with its
 * actual reach: the token and request-id fields are optional on this type, and this set's
 * `mechanical-report.md` prints no telemetry, so cost lives in the journal only.
 *
 * `schemaVersion` lives here and nowhere else in the outcome, for the reason `journal.ts` gives:
 * two copies of a version are two chances to disagree.
 */
export type RerunTelemetry = CaseRun["telemetry"];

/**
 * What T9's assembly must provide for this set to run.
 *
 * Declared here, at T4, so the runner is complete before the implementation exists and the
 * implementation cannot quietly change what the runner expects. T9 supplies it by repointing
 * `rerun-seam.ts`; until then `rerunRunnerUnavailable` is the only implementation and it says why.
 *
 * **On failure**, an implementation throws — the run must fail loudly, not degrade — and the thrown
 * value carries what was already paid for, in `EventIdentityError`'s shape: `rawResponses?:
 * string[]` (every text the provider returned, including the repair retry's) and `usage?: {
 * latencyMs?, transientRetries?, repairRetries? }`. The runner journals that before rethrowing.
 * Text the provider returned and our validation then rejected is a call that was answered and
 * billed; an implementation that swallows it makes this set the one place a paid response vanishes.
 */
export type RerunCallRunner = (request: RerunRequest) => Promise<{
  /**
   * The provider's response text, exactly as it arrived.
   *
   * Part of the seam because the runner journals it the moment it returns, before any checking —
   * the hazard `docs/model-evals/eval-incidents.md` records. Putting it in the frozen type is what
   * makes durability possible at T13 without breaking the freeze it was frozen under.
   */
  raw: string;
  result: unknown;
  /**
   * The host's original description as it went into this request — the raw description, not the
   * envelope. Self-reported, and cross-checked against `requestText` precisely because it is.
   */
  promptSent: string;
  /**
   * The assembled user message, verbatim as transmitted.
   *
   * Required, because the checks `RERUN_ACCEPTANCE` calls absolute are otherwise tautological: an
   * implementation returning `promptSent: request.prompt` and `answersAssembled: request.answers`
   * would pass them without having sent anything of the kind. Return what was sent — not a
   * reconstruction of what should have been.
   *
   * Three obligations follow from the checks reading it, fixed here rather than discovered at T13:
   *
   * - it is the assembled **user message**, not an encoded request body. A JSON body escapes the
   *   quotes and newlines of host text out of existence, and the checks look for that text
   *   verbatim;
   * - the host's typed words reach it unnormalised. Trimming is fine — the comparison is on a
   *   trimmed value — but paraphrasing, truncating or re-encoding them is not;
   * - it is **your assembled user message and nothing else**. Not the correction turn a repair
   *   retry appends, and — the part that matters — not the assistant echo of the model's previous,
   *   schema-invalid response that the provider boundary puts between them. That echo is raw model
   *   output containing model-invented option labels, and `menuNotResent` is a negative substring
   *   scan: a rerun whose first attempt failed validation and happened to emit a label matching a
   *   seeded unselected one would fail an absolute check with the assembly entirely correct. That
   *   is the same defect that reopened this freeze — a stochastic model output reaching a
   *   permanent verdict — and repairs are not rare: 2 of 12 calls in the v5 sealed challenge
   *   consumed one. Nothing is lost by excluding them: the boundary rebuilds the user message
   *   identically on every attempt, so one text describes both, and it still carries the
   *   description, the questions and the answers that every positive check looks for.
   */
  requestText: string;
  assemblyVersion: string;
  /** The cumulative history as assembled, oldest first — the representation under test. */
  answersAssembled: RerunAnswerInput[];
  telemetry: RerunTelemetry;
}>;

export const rerunRunnerUnavailable: RerunCallRunner = () => {
  throw new Error(
    "the clarification-answer input assembly does not exist yet: it is Phase 4B T9, and this " +
      "validation set runs at T13, after the T12 implementation freeze and an explicit " +
      "authorization (docs/phase-4b-plan.md Part IV)",
  );
};
