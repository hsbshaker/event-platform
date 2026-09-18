/**
 * The remediation is a capability, not a patch fitted to twelve known failures.
 *
 * The T22 diagnostic is spent evidence and this session has seen all of it — every failing batch,
 * every repeated concept name, every collapsed dimension. That is exactly the situation in which an
 * implementation can pass its own tests for the wrong reason: recognise `Common Ground`, special-case
 * a family farm, floor the palette distance the mechanical report measured, and the next event gets
 * nothing. `docs/phase-4b-plan.md §3.5` and the whole T19-before-T20 ordering exist because this
 * project has already paid for benchmark contamination once.
 *
 * So this file scans the remediation's own source — production modules, prompts, generated schemas
 * and fixtures — against the spent corpus and against every other corpus on disk, and fails if any
 * of them names a case, an event, a concept card, a palette or a phrase from it.
 *
 * It is deliberately **not** the leakage scan in `src/lib/ai/evals/prompt-leakage.test.ts`. That one
 * asks whether model-visible text leaked benchmark *inputs*. This one asks whether the
 * implementation encodes benchmark *answers* — including in files the model never sees, which is
 * where a case-fitted heuristic would actually live.
 *
 * Acceptance criteria: N/A — benchmark integrity. Guardrail `spec.md §32 #12`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { leakageProbes } from "@/lib/ai/evals/corpus";

const ROOT = new URL("../../", import.meta.url).pathname;

/** Everything the remediation added or rewrote, and could therefore have fitted to the cases. */
const SUBJECTS = [
  "src/lib/ai/concept-premise",
  "src/lib/ai/openai/concept-premise.ts",
  "src/lib/ai/openai/concept-premise-input.ts",
  "src/lib/ai/openai/design-intent-input.ts",
  "src/lib/ai/openai/design-intent-runner.ts",
  "src/lib/generation/concept-set.ts",
  "src/lib/generation/concept-premise-cost.ts",
  "docs/model-prompts/concept-premise.system.md",
  "docs/model-prompts/design-intent.system.md",
  "docs/model-schemas/concept-premise.schema.json",
  "docs/model-schemas/concept-premise.wire.schema.json",
  "tests/fixtures/concept-premise.ts",
];

function filesUnder(relative: string): string[] {
  const absolute = path.join(ROOT, relative);
  if (!existsSync(absolute)) return [];
  const entries = readdirSync(absolute, { withFileTypes: true });
  if (entries.length === 0) return [absolute];
  return entries.flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(relative, entry.name))
      : [path.join(absolute, entry.name)],
  );
}

const SOURCES = SUBJECTS.flatMap((subject) => {
  const absolute = path.join(ROOT, subject);
  if (!existsSync(absolute)) return [];
  const files =
    subject.endsWith(".ts") || subject.endsWith(".md") || subject.endsWith(".json")
      ? [absolute]
      : filesUnder(subject);
  return files.map((file) => ({
    file: path.relative(ROOT, file),
    text: readFileSync(file, "utf8").toLowerCase(),
  }));
});

const CORPORA = readdirSync(path.join(ROOT, "docs/model-evals"))
  .filter((entry) => entry.endsWith(".json"))
  .map((entry) => ({
    file: entry,
    parsed: JSON.parse(readFileSync(path.join(ROOT, "docs/model-evals", entry), "utf8")) as {
      cases?: { id?: string }[];
    },
  }));

describe("what the remediation was allowed to know", () => {
  it("scans something, so a path change cannot empty this file", () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(SUBJECTS.length);
    expect(CORPORA.length).toBeGreaterThan(0);
    // The spent run's corpus is the one that matters most, so its presence is asserted by name.
    expect(CORPORA.map((c) => c.file)).toContain("design-intent-sealed-challenge-v4.json");
  });

  it("names no case id from any corpus", () => {
    const offenders: string[] = [];
    for (const { file, parsed } of CORPORA) {
      for (const testCase of parsed.cases ?? []) {
        const id = testCase.id;
        if (typeof id !== "string" || id.length < 4) continue;
        for (const source of SOURCES) {
          if (source.text.includes(id.toLowerCase()))
            offenders.push(`${source.file}: ${file} ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("quotes no case content from any corpus", () => {
    // What counts as case content is `leakageProbes`, the repository's own definition, imported
    // rather than restated. That matters for the exclusions it already carries and documents: the
    // closed enums (`transitional` is a typography category every brief must name from) and the
    // no-inspiration sentinel are values the **contract forces**, so a fixture brief carrying them
    // is obeying the schema rather than quoting a case. A second list here would either miss that
    // and fail on every fixture, or drift from it silently.
    const offenders: string[] = [];
    for (const { file, parsed } of CORPORA) {
      for (const testCase of parsed.cases ?? []) {
        const probes = leakageProbes(testCase);
        for (const phrase of new Set([...probes.verbatim, ...probes.claims])) {
          if (phrase.trim().length < 12) continue;
          const needle = phrase.toLowerCase();
          for (const source of SOURCES) {
            if (source.text.includes(needle)) {
              offenders.push(`${source.file}: ${file} ${JSON.stringify(phrase.slice(0, 60))}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names no concept card, palette or design vector the spent run produced", () => {
    // The strongest form of case-fitting available here would be to encode the *answers*: the
    // concept names that repeated, the hex values that clustered, the ornament value that never
    // moved. This reads the spent run's own responses and refuses every one of them.
    const journal = path.join(ROOT, "docs/model-evals/results/design-intent-sealed-challenge-v4");
    const lines = readFileSync(path.join(journal, "raw-responses.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { payload?: { output?: Record<string, unknown> } });
    expect(lines.length).toBeGreaterThan(0);

    const answers = new Set<string>();
    for (const line of lines) {
      const output = line.payload?.output;
      if (!output) continue;
      const presentation = output.presentation as
        { name?: string; description?: string } | undefined;
      if (presentation?.name) answers.add(presentation.name);
      if (presentation?.description) answers.add(presentation.description);
      const palette = output.palette as { colors?: string[] } | undefined;
      for (const color of palette?.colors ?? []) answers.add(color);
    }
    expect(answers.size).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const answer of answers) {
      const needle = answer.toLowerCase();
      // Two-word concept names are short; require the whole string, which is what a copied answer
      // would be. A hex value is distinctive at six characters.
      for (const source of SOURCES) {
        if (source.text.includes(needle)) offenders.push(`${source.file}: ${answer}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("encodes no threshold tuned to the spent run's mechanical report", () => {
    // The mechanical floors the T22 report measured against are the eval harness's, frozen at T19.
    // The remediation must not have copied one into production and called it an objective —
    // `docs/designintent-sibling-convergence.md §6` refuses exactly that.
    const production = SOURCES.filter(
      (source) => source.file.startsWith("src/") && !source.file.endsWith(".test.ts"),
    );
    expect(production.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const source of production) {
      for (const pattern of [/deltae/i, /\bmechanical_floors\b/i, /\bfloor\s*[:=]\s*12\b/i]) {
        if (pattern.test(source.text)) offenders.push(`${source.file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
