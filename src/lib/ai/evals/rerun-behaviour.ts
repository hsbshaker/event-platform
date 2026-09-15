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
  /** Text that must appear verbatim in `suppliedFacts` after the final round, or be absent. */
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
  /** The exact prompt string sent on each round, in order. */
  promptsSent: string[];
  /** The assembly version recorded for each round. */
  assemblyVersions: string[];
  /** The validated result envelope for each round. */
  results: unknown[];
  /** Whether each round's result was provisional, as the lifecycle module judged it. */
  provisional: boolean[];
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

  const distinctPrompts = [...new Set(observed.promptsSent)];
  add(
    "promptByteIdentical",
    distinctPrompts.length === 1 && distinctPrompts[0] === testCase.prompt ? "pass" : "fail",
    distinctPrompts.length === 1
      ? distinctPrompts[0] === testCase.prompt
        ? "the original description was sent unchanged on every round"
        : "the prompt sent differs from the case's own prompt"
      : `the prompt changed between rounds (${distinctPrompts.length} distinct values)`,
  );

  const expectedRounds = testCase.rounds.length;
  add(
    "roundsCompleted",
    observed.results.length === expectedRounds ? "pass" : "fail",
    `${observed.results.length} of ${expectedRounds} rounds completed`,
  );

  const answersMatch = testCase.rounds.every((round, index) => {
    const assembled = observed.answersAssembled[index] ?? [];
    return (
      assembled.length === round.answers.length &&
      round.answers.every((answer, i) => assembled[i]?.questionIndex === answer.questionIndex)
    );
  });
  add(
    "answersAssembledAsGiven",
    answersMatch ? "pass" : "fail",
    answersMatch
      ? "each round assembled exactly the answers the case supplied, in order"
      : "a round assembled a different set or order of answers than the case supplied",
  );

  const versions = [...new Set(observed.assemblyVersions)];
  add(
    "assemblyVersionRecorded",
    versions.length === 1 && versions[0].length > 0 ? "pass" : "fail",
    `input assembly version(s) recorded: ${versions.join(", ") || "none"}`,
  );

  const schemas = [...new Set(observed.schemaVersions)];
  add(
    "schemaVersionExpected",
    schemas.length === 1 && schemas[0] === EVENT_IDENTITY_SCHEMA_VERSION ? "pass" : "fail",
    `schema version(s): ${schemas.join(", ") || "none"}`,
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
    const blob = JSON.stringify(observed.results[finalIndex] ?? {}).toLowerCase();
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
    "Every case passes mechanically: no check reports `fail`. `promptByteIdentical` and " +
    "`answersAssembledAsGiven` are absolute — a single failure of either fails the set, because " +
    "both are correctness properties of the lifecycle rather than judgements.",
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
  observations: { caseId: string; promptsSent: string[]; results: unknown[] }[],
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
    observation.promptsSent.forEach((prompt, round) => {
      lines.push(`### Round ${round + 1} — input`, "", "> " + prompt.replace(/\n/g, "\n> "), "");
      lines.push(
        `### Round ${round + 1} — interpretation`,
        "",
        "```json",
        JSON.stringify(observation.results[round] ?? null, null, 2),
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
}

/**
 * What T9's assembly must provide for this set to run.
 *
 * Declared here, at T4, so the runner below is complete before the implementation exists and the
 * implementation cannot quietly change what the runner expects. T9 supplies it; until then
 * `rerunRunnerUnavailable` is the only implementation and it says why.
 */
export type RerunCallRunner = (request: RerunRequest) => Promise<{
  result: unknown;
  promptSent: string;
  assemblyVersion: string;
  schemaVersion: string;
  answersAssembled: RerunAnswerInput[];
}>;

export const rerunRunnerUnavailable: RerunCallRunner = () => {
  throw new Error(
    "the clarification-answer input assembly does not exist yet: it is Phase 4B T9, and this " +
      "validation set runs at T13, after the T12 implementation freeze and an explicit " +
      "authorization (docs/phase-4b-plan.md Part IV)",
  );
};
