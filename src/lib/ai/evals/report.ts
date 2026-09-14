/**
 * The two documents a corpus run produces.
 *
 * They exist for different readers and must not contaminate each other:
 *
 * - **the mechanical report** is for us. Every check, every failure, every advisory, plus
 *   latency, retries and tokens. It states what was established and what was not.
 * - **the blind artifact** is for an independent qualitative reviewer. It carries the
 *   prompt and the response and *nothing else* — no expected verdict, no `mustAvoid` list,
 *   no mechanical result, no notes from us, no hint about what a good answer looks like.
 *
 * `docs/model-contracts.md §4.5` is the reason for the split: three of the seven identity
 * dimensions need a qualitative evaluator, and an evaluator shown our expectations is not
 * evaluating the model any more. The blinding here is the same discipline the Human Test #1
 * instrument applies to design review.
 */
import type { EventIdentityResult } from "@/lib/ai/event-identity/contract";
import type { CaseEvaluation, CorpusCase } from "./creative-understanding";

export interface CaseRun {
  caseData: CorpusCase;
  /** Absent when the call failed outright. */
  result?: EventIdentityResult;
  evaluation?: CaseEvaluation;
  error?: { kind: string; message: string; issues?: { path: string; message: string }[] };
  telemetry: {
    model: string;
    promptVersion: string;
    schemaVersion: string;
    latencyMs: number;
    transientRetries: number;
    repairRetries: number;
    schemaValidFirstCall: boolean;
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    providerRequestId?: string;
  };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank. With fourteen samples an interpolated p95 would imply a precision the
  // sample size does not have.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/* ------------------------------------------------------------------ mechanical report */

export function buildMechanicalReport(runs: CaseRun[], startedAt: string): string {
  const completed = runs.filter((r) => r.result);
  const latencies = completed.map((r) => r.telemetry.latencyMs);
  const passed = runs.filter((r) => r.evaluation?.mechanicalPass);

  const lines: string[] = [
    "# Creative-understanding run — mechanical results",
    "",
    `Corpus: \`docs/model-evals/creative-understanding.json\` (\`creative_understanding_v1\`, ${runs.length} cases)`,
    `Rubric: \`docs/model-contracts.md §4.5\``,
    `Run started: ${startedAt}`,
    `Model: \`${runs[0]?.telemetry.model ?? "—"}\``,
    `Prompt version: \`${runs[0]?.telemetry.promptVersion ?? "—"}\``,
    `Schema version: \`${runs[0]?.telemetry.schemaVersion ?? "—"}\``,
    "",
    "## What this document does and does not establish",
    "",
    "It establishes that no **outright failure** was committed: no invented fact, no dropped",
    "fact, no excluded thing proposed, no forbidden named reference, no logistics question, no",
    "question without a defer option, no breach of the ceiling.",
    "",
    "It establishes nothing about whether the interpretation is any **good**. Intent",
    "understanding, creative vocabulary and downstream usefulness are qualitative",
    "(`§4.5` dimensions 1, 2, 7) and are judged from the blind artifact by a reviewer who has",
    "not seen this file. **A clean mechanical run is necessary and never sufficient.**",
    "",
    "## Summary",
    "",
    `| | |`,
    `| --- | --- |`,
    `| Structured-output success | ${completed.length} / ${runs.length} |`,
    `| Valid on the first call | ${completed.filter((r) => r.telemetry.schemaValidFirstCall).length} / ${completed.length} |`,
    `| Repair retries consumed | ${completed.reduce((n, r) => n + r.telemetry.repairRetries, 0)} |`,
    `| Transient provider retries | ${completed.reduce((n, r) => n + r.telemetry.transientRetries, 0)} |`,
    `| Mechanical pass | ${passed.length} / ${runs.length} |`,
    `| Latency p50 | ${percentile(latencies, 50)} ms |`,
    `| Latency p95 | ${percentile(latencies, 95)} ms |`,
    `| Latency min / max | ${Math.min(...latencies, 0)} / ${Math.max(...latencies, 0)} ms |`,
    `| Total input / output tokens | ${sum(completed, "inputTokens")} / ${sum(completed, "outputTokens")} |`,
    `| Reasoning tokens | ${sum(completed, "reasoningTokens")} |`,
    "",
    "## Clarification behaviour",
    "",
    "| Case | Expected | Asked | Questions |",
    "| --- | --- | --- | --- |",
  ];

  for (const run of runs) {
    const questions = run.result?.clarification.questions ?? [];
    const asked = run.result ? String(questions.length) : "—";
    const text = questions.map((q) => q.question).join(" / ") || "—";
    lines.push(
      `| ${run.caseData.id} | ${run.caseData.expectClarification} | ${asked} | ${escapePipes(text)} |`,
    );
  }

  lines.push("", "## Per-case checks", "");

  for (const run of runs) {
    lines.push(`### ${run.caseData.id} — \`${escapePipes(run.caseData.prompt)}\``);
    lines.push("");
    lines.push(`Class: ${run.caseData.class.join(", ")}`);
    lines.push(
      `Latency ${run.telemetry.latencyMs} ms · first-call valid: ${run.telemetry.schemaValidFirstCall} · repair retries: ${run.telemetry.repairRetries} · transient retries: ${run.telemetry.transientRetries}`,
    );
    lines.push("");

    if (run.error) {
      lines.push(`**CALL FAILED (${run.error.kind}): ${run.error.message}**`);
      for (const issue of run.error.issues ?? []) lines.push(`- ${issue.path}: ${issue.message}`);
      lines.push("");
      continue;
    }

    lines.push(
      `**Mechanical: ${run.evaluation?.mechanicalPass ? "pass" : "FAIL"}**`,
      "",
      "| Check | Status | Detail |",
      "| --- | --- | --- |",
    );
    for (const check of run.evaluation?.checks ?? []) {
      lines.push(`| ${check.name} | ${check.status} | ${escapePipes(check.detail)} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function sum(runs: CaseRun[], key: "inputTokens" | "outputTokens" | "reasoningTokens"): number {
  return runs.reduce((n, r) => n + (r.telemetry[key] ?? 0), 0);
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/* ------------------------------------------------------------------ blind artifact */

/**
 * The reviewer sees the assignment and the answer. Nothing else.
 *
 * The framing below is deliberately thin: enough to know what the system was asked to do,
 * with no statement of what a good answer contains. Naming the failure modes we care about
 * would tell the reviewer where to look, and the point of an independent read is that they
 * look where they want to.
 */
export function buildBlindArtifact(runs: CaseRun[]): string {
  const lines: string[] = [
    "# Event creative-brief review",
    "",
    "A host describes the event they want in their own words — usually a sentence, often",
    "vague, sometimes just a reference to something they like. A system reads that",
    "description and produces a structured creative brief: the creative world it places the",
    "event in, the palette and typographic territory, motifs, textures, and the",
    "constraints it believes it has been given. It also records any facts the host stated,",
    "and may propose a small number of clarifying questions before design begins.",
    "",
    "Below are fourteen host descriptions and the brief the system produced for each.",
    "",
    "**The question: did the system actually understand the assignment?**",
    "",
    "Judge them however you think is right.",
    "",
    "---",
    "",
  ];

  for (const run of runs) {
    lines.push(`## ${run.caseData.id}`);
    lines.push("");
    lines.push("**The host wrote:**");
    lines.push("");
    lines.push(`> ${run.caseData.prompt}`);
    lines.push("");

    if (!run.result) {
      lines.push("*The system produced no output for this case.*", "", "---", "");
      continue;
    }

    const { identity, suppliedFacts, clarification } = run.result;
    lines.push("**The brief it produced:**");
    lines.push("");
    lines.push(`- **Creative direction** — ${identity.creativeDirection}`);
    lines.push(`- **Tone** — ${identity.toneKeywords.join(", ")}`);
    lines.push(`- **Tonal intent** — ${identity.tonalIntent}`);
    lines.push(
      `- **Palette** — required: ${list(identity.paletteIntent.requiredColors)}; preferred: ${list(identity.paletteIntent.preferredColors)}; avoid: ${list(identity.paletteIntent.avoidColors)}${identity.paletteIntent.dominanceNotes ? `; ${identity.paletteIntent.dominanceNotes}` : ""}`,
    );
    lines.push(`- **Motifs** — ${list(identity.visualMotifs)}`);
    lines.push(`- **Texture** — ${identity.textureDirection}`);
    lines.push(`- **Typography** — ${identity.typographyDirection}`);
    lines.push(`- **Copy voice** — ${identity.copyTone}`);
    lines.push(`- **Constraints it believes it was given** — ${list(identity.designConstraints)}`);
    lines.push(
      `- **Structural fit** — families: ${identity.compatibleFamilies.join(" > ")}; type: ${identity.compatibleTypographyCategories.join(" > ")}; tone: ${identity.compatibleTonalDirections.join(" > ")}`,
    );
    lines.push("");

    const facts = Object.entries(suppliedFacts).filter(([, v]) => v !== null);
    lines.push("**Facts it recorded from the description:**");
    lines.push("");
    lines.push(
      facts.length === 0
        ? "*None recorded.*"
        : facts.map(([field, value]) => `- ${field}: \`${value}\``).join("\n"),
    );
    lines.push("");

    lines.push("**Questions it would ask the host before designing:**");
    lines.push("");
    if (clarification.questions.length === 0) {
      lines.push("*None — it would proceed straight to design.*");
    } else {
      for (const question of clarification.questions) {
        lines.push(`- **${question.question}**`);
        lines.push(`  - options: ${question.options.map((o) => o.label).join(" · ")}`);
      }
    }
    lines.push("", "---", "");
  }

  return `${lines.join("\n")}\n`;
}

function list(values: string[]): string {
  return values.length === 0 ? "—" : values.join(", ");
}
