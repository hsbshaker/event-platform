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
 * Its class, stated so nobody upgrades it later: **pre-registered validation evidence for the
 * clarification-answer input shape/lifecycle — NOT fresh generalization evidence for EventIdentity
 * v5 and NOT a replacement for the spent v5 sealed challenge.**
 */
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
  "original_description_survives: the original event description is unchanged across every round",
  "answer_precedence: where an answer conflicts with the earlier description, the answer governs",
  "defer_is_an_answer: a deferred creative question is answered, and the rerun commits rather than re-asking the same thing",
  "boundary_resolution: once a boundary question is answered, the rerun may produce an authoritative identity",
  "no_fact_invention: an answer never becomes a supplied fact the host did not state",
  "multi_round_provenance: with two rounds of answers, both are in scope and neither is lost",
] as const;

/* ------------------------------------------------------------------ the structural contract */

export interface RerunAnswerInput {
  /** Which question of the previous round this answers, by its ordinal. */
  questionIndex: number;
  kind: "creative" | "boundary";
  /** The option the host picked, or null when they typed instead. */
  selectedOptionLabel: string | null;
  freeText: string | null;
  isDefer: boolean;
}

export interface RerunRound {
  /** Answers supplied to this round, in order. Round 1 carries none. */
  answers: RerunAnswerInput[];
}

export interface RerunCase {
  id: string;
  /** The host's original description. Byte-identical on every round, by construction. */
  prompt: string;
  /** Round 1 is the initial call; each later round supplies answers to the previous round. */
  rounds: RerunRound[];
  /** Which published dimension this case exercises. */
  dimension: string;
  /**
   * What `suppliedFacts` must hold after the final round: each key's value compared for equality,
   * or `null` to require the field absent. Equality, not substring — the schema's values are
   * trimmed quotations of the host, so a partial match would accept a field that says more than
   * the host did.
   */
  expectedFacts?: Record<string, string | null>;
  /** Terms an answer must not cause to be invented. */
  mustNotInvent?: string[];
  rationale?: string;
}

export interface RerunCorpus {
  version: string;
  cases: RerunCase[];
}

/**
 * The shape a case must have to be worth spending a paid call on.
 *
 * Published so an independent author can satisfy it without reading the runner, and pure so it can
 * be unit-tested without importing the module that spends money — the rule incident 2 produced
 * (`docs/model-evals/eval-incidents.md`).
 */
export function validateRerunCorpusShape(parsed: unknown): string[] {
  const problems: string[] = [];
  const corpus = (parsed ?? {}) as Partial<RerunCorpus>;

  if (typeof corpus.version !== "string" || corpus.version.trim().length === 0) {
    problems.push("top-level `version` must be a non-empty string");
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    problems.push("`cases` must be a non-empty array");
    return problems;
  }

  const seen = new Set<string>();
  const dimensions = new Set<string>(RERUN_CAPABILITY_DIMENSIONS);

  corpus.cases.forEach((testCase, index) => {
    const where =
      typeof testCase?.id === "string" && testCase.id.trim().length > 0
        ? testCase.id
        : `cases[${index}]`;

    if (typeof testCase?.id !== "string" || testCase.id.trim().length === 0) {
      problems.push(`${where}: \`id\` must be a non-empty string`);
    } else if (seen.has(testCase.id)) {
      problems.push(`${where}: duplicate \`id\``);
    } else if (testCase.id.includes("#")) {
      // The journal writes one line per round as `<id>#<round>`, and a recovery joins back on the
      // part before the `#`. An id containing one would make that join name a case that does not
      // exist — and this validator and that runner freeze at the same moment, so the constraint
      // belongs here rather than in a note the author never sees.
      problems.push(`${where}: \`id\` must not contain "#" (the journal uses it to name rounds)`);
    } else {
      seen.add(testCase.id);
    }

    if (typeof testCase?.prompt !== "string" || testCase.prompt.trim().length === 0) {
      problems.push(`${where}: \`prompt\` must be a non-empty string`);
    }

    if (typeof testCase?.dimension !== "string" || !dimensions.has(testCase.dimension)) {
      problems.push(`${where}: \`dimension\` must be one of the published capability dimensions`);
    }

    const rounds = testCase?.rounds;
    if (!Array.isArray(rounds) || rounds.length < 2) {
      // One round exercises nothing this set exists for: the point is the *rerun*.
      problems.push(`${where}: \`rounds\` must have at least two entries`);
      return;
    }
    if (Array.isArray(rounds[0]?.answers) && rounds[0].answers.length > 0) {
      problems.push(`${where}: the first round cannot carry answers — there was nothing to answer`);
    }
    rounds.forEach((round, roundIndex) => {
      if (!Array.isArray(round?.answers)) {
        problems.push(`${where}: rounds[${roundIndex}].answers must be an array`);
        return;
      }
      if (roundIndex > 0 && round.answers.length === 0) {
        problems.push(`${where}: rounds[${roundIndex}] supplies no answers, so it is not a rerun`);
      }
      round.answers.forEach((answer, answerIndex) => {
        const at = `${where}: rounds[${roundIndex}].answers[${answerIndex}]`;
        if (!Number.isInteger(answer?.questionIndex) || answer.questionIndex < 0) {
          problems.push(`${at}: \`questionIndex\` must be a non-negative integer`);
        }
        if (answer?.kind !== "creative" && answer?.kind !== "boundary") {
          problems.push(`${at}: \`kind\` must be "creative" or "boundary"`);
        }
        if (typeof answer?.isDefer !== "boolean") {
          problems.push(`${at}: \`isDefer\` must be a boolean`);
        }
        if (answer?.kind === "boundary" && answer?.isDefer === true) {
          problems.push(`${at}: a boundary question offers no defer option (spec.md §7.6b #4)`);
        }
        const hasSelection =
          typeof answer?.selectedOptionLabel === "string" &&
          answer.selectedOptionLabel.trim().length > 0;
        const hasText = typeof answer?.freeText === "string" && answer.freeText.trim().length > 0;
        if (!hasSelection && !hasText) {
          problems.push(`${at}: an answer must select an option or supply text`);
        }
        if (answer?.isDefer === true && !hasSelection) {
          problems.push(`${at}: a deferred answer must name the option it deferred with`);
        }
      });
    });

    for (const [key, value] of Object.entries(testCase?.expectedFacts ?? {})) {
      if (!(typeof value === "string" || value === null)) {
        problems.push(`${where}: expectedFacts.${key} must be a string or null`);
      }
    }
  });

  return problems;
}

/* ------------------------------------------------------------------ mechanical checks */

export type CheckStatus = "pass" | "fail" | "advisory" | "n/a";

export interface RerunCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

/** What one case produced, as the runner will hand it to the checker at T13. */
export interface RerunObservation {
  caseId: string;
  /**
   * The host's original description as it went into each round's request, in order — the raw
   * description, not the assembled envelope around it. `promptByteIdentical` compares it with the
   * case's own prompt, so a T9 implementation that reported the whole envelope here would fail
   * rather than pass quietly.
   */
  promptsSent: string[];
  /**
   * The exact text transmitted to the provider on each round.
   *
   * Separate from `promptsSent` because the two absolute checks are otherwise satisfiable by an
   * implementation that echoes its own arguments: `promptSent: request.prompt` and
   * `answersAssembled: request.answers` make both pass tautologically, for every case, forever.
   * This is the one field the checker has that an echo cannot fabricate without also fabricating
   * what it claims to have sent — so the checks below are anchored to it.
   */
  requestTexts: string[];
  /** The assembly version recorded for each round. */
  assemblyVersions: string[];
  /** The validated result envelope for each round. */
  results: unknown[];
  /**
   * Whether each round's result was provisional, as the lifecycle module judged it — or
   * `"unreadable"` when the fail-closed reader refused the envelope outright.
   *
   * The third state exists so that a wrong schema version is *recorded* by
   * `schemaVersionExpected` rather than aborting the loop before any check runs. This set is
   * authorized exactly once; a deterministic throw partway through costs the whole run.
   */
  provisional: (boolean | "unreadable")[];
  /** The answers the runner reported as assembled into each round. */
  answersAssembled: RerunAnswerInput[][];
  schemaVersions: string[];
}

/**
 * The generic mechanical checks, frozen before any case exists.
 *
 * Every one is decidable from the observation alone, without a judgement about creative quality —
 * that is the qualitative half's job. A check whose input is absent reports `n/a`, and an
 * undecidable one reports `advisory`; **neither is ever counted as a pass**, which is the
 * distinction `model-contracts.md §4.5` says a clean mechanical run must not blur.
 */
export function checkRerunCase(testCase: RerunCase, observed: RerunObservation): RerunCheck[] {
  const checks: RerunCheck[] = [];
  const add = (name: string, status: CheckStatus, detail: string) =>
    checks.push({ name, status, detail });

  // Anchored to what was actually transmitted, not only to what the implementation says it sent.
  // The self-reported half alone is satisfied by `promptSent: request.prompt`; requiring the
  // description to appear verbatim inside the real request text is not, because that text is the
  // assembled envelope T9's golden-envelope test pins.
  const distinctPrompts = [...new Set(observed.promptsSent)];
  const reportedOk = distinctPrompts.length === 1 && distinctPrompts[0] === testCase.prompt;
  const transmittedOk =
    observed.requestTexts.length === observed.results.length &&
    observed.requestTexts.every((text) => text.includes(testCase.prompt));
  add(
    "promptByteIdentical",
    reportedOk && transmittedOk ? "pass" : "fail",
    !reportedOk
      ? distinctPrompts.length === 1
        ? "the prompt sent differs from the case's own prompt"
        : `the prompt changed between rounds (${distinctPrompts.length} distinct values)`
      : transmittedOk
        ? "the original description was sent unchanged, and appears verbatim in every request"
        : "a round's transmitted request does not contain the original description verbatim",
  );

  const expectedRounds = testCase.rounds.length;
  add(
    "roundsCompleted",
    observed.results.length === expectedRounds ? "pass" : "fail",
    `${observed.results.length} of ${expectedRounds} rounds completed`,
  );

  // Every field, not just the index. This set exists to validate *how an answer is represented*,
  // so an assembly that sent the right questionIndex with the wrong option, a dropped freeText or
  // isDefer flipped is exactly the failure it is here to catch — and this is one of the two checks
  // `RERUN_ACCEPTANCE.mechanical` calls absolute.
  const sameAnswer = (a: RerunAnswerInput | undefined, b: RerunAnswerInput) =>
    a !== undefined &&
    a.questionIndex === b.questionIndex &&
    a.kind === b.kind &&
    a.selectedOptionLabel === b.selectedOptionLabel &&
    a.freeText === b.freeText &&
    a.isDefer === b.isDefer;
  const answersMatch = testCase.rounds.every((round, index) => {
    const assembled = observed.answersAssembled[index] ?? [];
    return (
      assembled.length === round.answers.length &&
      round.answers.every((answer, i) => sameAnswer(assembled[i], answer))
    );
  });
  add(
    "answersAssembledAsGiven",
    answersMatch ? "pass" : "fail",
    answersMatch
      ? "each round assembled exactly the answers the case supplied — index, route, option, text " +
          "and defer flag — in order"
      : "a round assembled an answer differing from the case's in index, route, option, text, " +
          "defer flag, count or order",
  );

  /**
   * …and the answers reached the model, rather than only the implementation's report of them.
   *
   * Two properties an echo cannot satisfy. A round that supplies answers must transmit text that
   * differs from round 1's — answers that changed nothing about the request did not reach the
   * model, which is the one thing this whole set exists to establish. And the host's own typed
   * words must appear verbatim: `freeText` is current host input, and an assembly that paraphrases
   * or drops it has lost the input rather than relabelled it. The option *label* is deliberately
   * not required verbatim — how a chosen option is rendered is the assembly's business, and the
   * qualitative half reads it — so this never fails on a rendering choice.
   */
  const answerProblems: string[] = [];
  testCase.rounds.forEach((round, index) => {
    if (round.answers.length === 0) return;
    const text = observed.requestTexts[index];
    if (text === undefined) return;
    // Against round 1 *and* against the round before. Round 1 alone is not enough: a three-round
    // assembly that carries round 2's answers forward but drops round 3's transmits the same text
    // for rounds 2 and 3, which differs from round 1 and passes — silently, and on precisely the
    // `multi_round_provenance` dimension this set is least allowed to miss. A legitimate
    // cumulative assembly always differs from its predecessor; a non-cumulative one collides only
    // when two consecutive rounds render byte-identical answers, which is suspicious either way.
    for (const [label, earlier] of [
      ["round 1", observed.requestTexts[0]],
      ["the previous round", index > 0 ? observed.requestTexts[index - 1] : undefined],
    ] as const) {
      if (earlier !== undefined && text === earlier) {
        answerProblems.push(`round ${index + 1} transmitted the same text as ${label}`);
      }
    }
    for (const answer of round.answers) {
      // Trimmed, because the corpus contract accepts padded free text and the database stores it
      // untrimmed, so an assembly that renders `freeText.trim()` is correct. Requiring the raw
      // string would fail it permanently over whitespace.
      const said = answer.freeText?.trim();
      if (said && !text.includes(said)) {
        answerProblems.push(
          `round ${index + 1} did not transmit free text for q${answer.questionIndex}`,
        );
      }
    }
  });
  const answersReached = answerProblems.length === 0;
  add(
    "answersReachedTheModel",
    answersReached ? "pass" : "fail",
    answersReached
      ? "every round carrying answers transmitted different text, with the host's own words verbatim"
      : answerProblems.join("; "),
  );

  // Recorded, consistent, and **not** the pre-answers value. A run that carried clarification
  // answers while still stamping `event_identity_input_v1` would be an assembly change under an
  // unchanged label, which is the exact failure the version exists to make visible — and the
  // check immediately below already compares against a constant, so anything weaker here would be
  // an asymmetry with no justification.
  const versions = [...new Set(observed.assemblyVersions)];
  const versionOk =
    versions.length === 1 &&
    versions[0].length > 0 &&
    versions[0] !== ASSEMBLY_VERSION_BEFORE_ANSWERS;
  add(
    "assemblyVersionRecorded",
    versionOk ? "pass" : "fail",
    versionOk
      ? `input assembly version recorded: ${versions[0]}`
      : `expected one recorded version other than ${ASSEMBLY_VERSION_BEFORE_ANSWERS}, got: ` +
          `${versions.join(", ") || "none"}`,
  );

  const schemas = [...new Set(observed.schemaVersions)];
  add(
    "schemaVersionExpected",
    schemas.length === 1 && schemas[0] === EVENT_IDENTITY_SCHEMA_VERSION ? "pass" : "fail",
    `schema version(s): ${schemas.join(", ") || "none"}`,
  );

  /**
   * The envelope was readable at all.
   *
   * Gating, and separate from `schemaVersionExpected`, because the two causes of `"unreadable"`
   * do not both surface there. An unsupported schema version fails that check; a malformed
   * `clarification` block — T9 returning the brief rather than the envelope, which
   * `assertAuthoritative` returns and is an easy mistake — moves no check at all. Without this,
   * such a case reports a mechanical pass while the committed evidence holds no clarification
   * data whatsoever.
   */
  const unreadableRounds = observed.provisional
    .map((state, index) => (state === "unreadable" ? index + 1 : 0))
    .filter((round) => round > 0);
  add(
    "envelopeReadable",
    unreadableRounds.length === 0 ? "pass" : "fail",
    unreadableRounds.length === 0
      ? "every round's result was a readable identity envelope"
      : `the lifecycle reader refused the envelope on round(s) ${unreadableRounds.join(", ")}`,
  );

  const finalIndex = observed.results.length - 1;
  const finalProvisional = observed.provisional[finalIndex];
  const boundaryAnswered = testCase.rounds
    .flatMap((round) => round.answers)
    .some((answer) => answer.kind === "boundary");
  if (boundaryAnswered) {
    add(
      "boundaryResolves",
      finalProvisional === false ? "pass" : "advisory",
      finalProvisional === false
        ? "the final round is authoritative after the boundary answer"
        : finalProvisional === "unreadable"
          ? // Never "still provisional": that would assert something about the model on a round
            // whose envelope was never read. `envelopeReadable` above is where this fails.
            "the final round's envelope was unreadable, so provisional state is unknown"
          : "the final round is still provisional; whether a further question is warranted is a judgement",
    );
  } else {
    add("boundaryResolves", "n/a", "no boundary question was answered in this case");
  }

  const facts = testCase.expectedFacts ?? {};
  if (Object.keys(facts).length === 0) {
    add("expectedFacts", "n/a", "the case asserts no facts");
  } else {
    const supplied = ((observed.results[finalIndex] ?? {}) as { suppliedFacts?: unknown })
      .suppliedFacts as Record<string, unknown> | undefined;
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
    // `suppliedFacts` only, never the whole envelope. The dimension is "an answer never becomes a
    // **supplied fact** the host did not state", and `spec.md §7.5` requires the creative brief to
    // infer generously: a host who picks the option "Garden party" should see a garden-party
    // looseness in `creativeDirection` and `venueText` left null. Scanning the brief would fail
    // that case permanently — a correct implementation, on the dimension that wanted it.
    const blob = JSON.stringify(
      ((observed.results[finalIndex] ?? {}) as { suppliedFacts?: unknown }).suppliedFacts ?? {},
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
 * threshold. The mechanical half is absolute because every check in it is a correctness property
 * of the input lifecycle rather than a matter of taste — there is no defensible reason for the
 * host's description to change between rounds in one case out of ten.
 */
export const RERUN_ACCEPTANCE = {
  evidenceClass:
    "pre-registered validation evidence for the clarification-answer input shape/lifecycle",
  notes: [
    "NOT fresh generalization evidence for EventIdentity v5",
    "NOT a replacement for the spent v5 sealed challenge",
    "validates the input shape and lifecycle, not the interpreter's creative quality",
  ],
  mechanical:
    "Every case passes mechanically: no check reports `fail`. `promptByteIdentical`, " +
    "`answersAssembledAsGiven` and `answersReachedTheModel` are absolute — a single failure of " +
    "any of them fails the set, because all three are correctness properties of the lifecycle " +
    "rather than judgements.",
  qualitative:
    "An independent reviewer, reading a blind artifact of the rounds, answers three questions " +
    "for every case: did the answer reach the rerun as current host input rather than as a " +
    "rewrite of the original description; did the later round respect the answer where it " +
    "conflicted with the earlier description; and did the rerun avoid re-asking what had just " +
    "been answered. The set passes qualitatively when every case is Yes on all three. A No on " +
    "any case fails the set, and the reviewer cites the round and the text.",
  advisoryNeverCounts: "`advisory` and `n/a` are never folded into the pass count, in either half.",
} as const;

/* ------------------------------------------------------------------ the blind artifact */

/**
 * What the reviewer sees. Rounds and outputs; no expectations, no dimension label, no case notes.
 *
 * The dimension is withheld deliberately: telling the reviewer what a case is *for* tells them
 * what to find.
 */
export function buildRerunReviewArtifact(
  observations: {
    caseId: string;
    requestTexts: string[];
    answersAssembled: RerunAnswerInput[][];
    results: unknown[];
  }[],
): string {
  const lines = [
    "# Clarification rerun — blind review artifact",
    "",
    "Each block is one host description and the successive interpretations produced as the host",
    "answered. For every case, answer three questions and cite the round and the text:",
    "",
    "1. Did the answer reach the later round as the host's current input, rather than as a rewrite",
    "   of what they originally wrote?",
    "2. Where the answer conflicted with the original description, did the later round respect the",
    "   answer?",
    "3. Did the later round avoid re-asking what had just been answered?",
    "",
    "You are not asked whether this passes.",
    "",
  ];
  observations.forEach((observation, index) => {
    lines.push(`## Case ${index + 1}`, "");
    observation.results.forEach((result, round) => {
      /**
       * What was actually transmitted, not the description the implementation said it sent.
       *
       * Questions 1 and 2 above cannot be answered without it. `promptsSent` is byte-identical on
       * every round by construction — `promptByteIdentical` requires exactly that — so an artifact
       * built from it shows the reviewer the same paragraph N times and never shows them the
       * answer they are being asked about. It is also the one field here that is not self-reported.
       */
      lines.push(
        `### Round ${round + 1} — what was sent`,
        "",
        "> " + (observation.requestTexts[round] ?? "(not recorded)").replace(/\n/g, "\n> "),
        "",
      );
      const answers = observation.answersAssembled[round] ?? [];
      if (answers.length > 0) {
        lines.push(
          `### Round ${round + 1} — answers carried in`,
          "",
          ...answers.map(
            (answer) =>
              `- q${answer.questionIndex} (${answer.kind}): ` +
              `${answer.selectedOptionLabel === null ? "—" : `“${answer.selectedOptionLabel}”`}` +
              `${answer.freeText === null ? "" : ` · typed: “${answer.freeText}”`}` +
              `${answer.isDefer ? " · deferred" : ""}`,
          ),
          "",
        );
      }
      lines.push(
        `### Round ${round + 1} — interpretation`,
        "",
        "```json",
        JSON.stringify(result ?? null, null, 2),
        "```",
        "",
      );
    });
  });
  return lines.join("\n");
}

/* ------------------------------------------------------------------ the T9 seam */

export interface RerunRequest {
  prompt: string;
  answers: RerunAnswerInput[];
  /**
   * Every earlier round's validated result, in order — the eval's stand-in for the immutable
   * identity revision that production resolves a locator against.
   *
   * `RerunAnswerInput` is a locator plus what the host said, exactly like a `clarification_answers`
   * row, and for the same reason: an answer proves which question it answers by index into a
   * revision that cannot change under it, never by restating the question. Production reads
   * `question_text` and `options` from the row, which the trigger checked against the revision's
   * own JSON; here there is no revision, so the results themselves are passed and the assembly
   * resolves `questionIndex` against the last of them.
   *
   * The alternative — putting `questionText` and `options` in the corpus — would let the corpus
   * disagree with what the model actually asked, which is precisely the drift check (4) of
   * `validate_clarification_answer` exists to refuse. Without this field a T9 adapter driven
   * through the seam could only fabricate the question or keep hidden cross-call state, and the
   * set would then exercise an envelope production never builds.
   */
  priorResults: unknown[];
}

/**
 * What a round costs and which versions produced it, in the shape `run.json` and the journal
 * already use, so what this set spent is recorded somewhere rather than nowhere. Stated with its
 * actual reach: the token and request-id fields are optional on this type, and this set's
 * `mechanical-report.md` prints no telemetry at all, so cost lives in the journal only.
 *
 * `docs/model-contracts.md` requires a journal entry to carry "the fully-built telemetry the
 * report itself records", and the rule is written as universal. Rather than admit a scoped
 * exception for this set, the seam supplies it — which is possible only while the seam is still
 * unfrozen, and impossible afterwards.
 *
 * `schemaVersion` lives here and nowhere else in the outcome, for the reason `journal.ts` gives:
 * two copies of a version are two chances to disagree.
 */
export type RerunTelemetry = CaseRun["telemetry"];

/**
 * What T9's assembly must provide for this set to run.
 *
 * Declared here, at T4, so the runner below is complete before the implementation exists and the
 * implementation cannot quietly change what the runner expects. T9 supplies it; until then
 * `rerunRunnerUnavailable` is the only implementation and it says why.
 *
 * **On failure**, an implementation throws — the run must fail loudly, not degrade — and the
 * thrown value carries what was already paid for, in `EventIdentityError`'s shape:
 * `rawResponses?: string[]` (every text the provider returned, including the repair retry's) and
 * `usage?: { latencyMs?, transientRetries?, repairRetries? }`. The runner journals that before
 * rethrowing. Text the provider returned and our validation then rejected is a call that was
 * answered and billed; an implementation that swallows it makes this set the one place where a
 * paid response can vanish.
 */
export type RerunCallRunner = (request: RerunRequest) => Promise<{
  /**
   * The provider's response text, exactly as it arrived.
   *
   * Part of the seam because the runner journals it the moment it returns, before any checking.
   * A one-shot pre-registered set makes ≥2 paid calls per case, so a failure on the last case
   * would otherwise destroy every response paid for in the run — the hazard the
   * creative-understanding runner exists to avoid and `docs/model-evals/eval-incidents.md`
   * records. Putting it in the frozen type is what makes durability possible at T13 without
   * breaking the freeze it was frozen under: an implementation supplies it, nothing here moves.
   */
  raw: string;
  result: unknown;
  /**
   * The host's original description as it went into this request — the raw description, not the
   * envelope. Self-reported, and checked against `requestText` below precisely because it is.
   */
  promptSent: string;
  /**
   * The exact text transmitted to the provider, verbatim.
   *
   * Required, and required *here*, because the checks `RERUN_ACCEPTANCE` calls absolute are
   * otherwise tautological: an implementation returning `promptSent: request.prompt` and
   * `answersAssembled: request.answers` passes them for every case without having sent anything
   * of the kind. This is the field that makes them measurements. Return what was sent — not a
   * reconstruction of what should have been.
   *
   * Three obligations on T9 follow from the checks reading it, all fixed here rather than
   * discovered at T13:
   *
   * - it is the assembled **user message**, not an encoded request body. A JSON body escapes the
   *   quotes and newlines of host text out of existence, and `answersReachedTheModel` looks for
   *   that text verbatim;
   * - the host's typed words reach it unnormalised. Trimming is fine — the check compares on a
   *   trimmed value — but paraphrasing, truncating or re-encoding them is not;
   * - on a repair retry, which sends a second and different text, return the attempt whose
   *   response you are returning. Anything else makes the evidence describe a call that did not
   *   produce the result beside it.
   */
  requestText: string;
  assemblyVersion: string;
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
