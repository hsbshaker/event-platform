/**
 * Version-named goldens for the input assembly.
 *
 * `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` exists so that a change to the *effective* model input
 * is visible in evidence even when the prompt file and the schema have not moved. A version that
 * says `v2` while the assembly quietly produces something else is worse than no version at all:
 * every `run.json`, every identity revision and every journal line would carry a label that does
 * not describe what was sent.
 *
 * So each declared version owns a directory of expected messages, and this asserts the current
 * assembly against the directory its version names. Change the assembly's behaviour without
 * bumping the version and the goldens fail; bump the version and the old directory stays, because
 * `v1` is what every piece of Phase 4A `v5` evidence was produced under and deleting it would
 * erase the record of what those runs actually sent.
 *
 * **There is no regeneration switch.** No `UPDATE_GOLDENS`, no `--update`, no env var. A fixture
 * that can be rewritten by setting a variable is a fixture that gets rewritten when it fails,
 * which is the failure mode it exists to prevent. Writing a new version's files is a deliberate
 * act: create the directory, put the expected text in it, and have the diff reviewed.
 *
 * Acceptance criteria: N/A — provenance integrity. `spec.md §31 — Prompt, auth, and generation`;
 * `docs/phase-4b-plan.md` Part IV T9.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION } from "@/lib/ai/versions";

import {
  assembleEventIdentityUserMessage,
  type CarriedClarification,
  type PriorRevision,
} from "./event-identity-input";

const DIR = new URL("./__fixtures__/input-assembly/", import.meta.url).pathname;

interface GoldenCase {
  prompt: string;
  questions?: { question: string; options: string[] }[][];
  answers?: CarriedClarification[];
}

const CASES = (
  JSON.parse(readFileSync(path.join(DIR, "cases.json"), "utf8")) as {
    cases: Record<string, GoldenCase>;
  }
).cases;

/**
 * The revision envelopes a case's questions would have been persisted in.
 *
 * Only the `clarification` block matters to the assembly — it reads the question out of the
 * revision and nothing else — so the rest of the envelope is deliberately not built here. An
 * assembly that started needing more of it would fail loudly rather than silently widening what
 * a caller has to supply.
 */
const revisionsFor = (testCase: GoldenCase): PriorRevision[] =>
  (testCase.questions ?? []).map((questions, index) => ({
    revision: index + 1,
    result: {
      clarification: {
        needed: questions.length > 0,
        questions: questions.map((q) => ({
          kind: "creative",
          question: q.question,
          whyItMatters: "model-authored rationale that must never be sent back",
          options: q.options.map((label, i) => ({ label, isDefer: i === q.options.length - 1 })),
        })),
      },
    },
  }));

const assemble = (testCase: GoldenCase) =>
  assembleEventIdentityUserMessage({
    prompt: testCase.prompt,
    priorRevisions: revisionsFor(testCase),
    answers: testCase.answers,
  });

describe(`input assembly goldens: ${EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION}`, () => {
  const versionDir = path.join(DIR, EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION);

  it("has a fixture directory named for the declared version", () => {
    expect(readdirSync(DIR)).toContain(EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION);
  });

  it("covers every case, with no fixture left behind by a deleted one", () => {
    const files = readdirSync(versionDir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => f.replace(/\.txt$/, ""))
      .sort();
    expect(files).toEqual(Object.keys(CASES).sort());
  });

  it.each(Object.keys(CASES))("assembles %s exactly as the fixture records", (name) => {
    expect(
      assemble(CASES[name]),
      `the assembled message for "${name}" no longer matches its ` +
        `${EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION} fixture. If the change is intended, it is an ` +
        "input-assembly change: bump EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION and write a new " +
        "fixture directory. Do not edit this one — it records what a declared version sent.",
    ).toBe(readFileSync(path.join(versionDir, `${name}.txt`), "utf8"));
  });

  /**
   * The one property that spans versions.
   *
   * `v2` is `v1` plus a clarification block. A first call — nothing to carry — must therefore be
   * byte-identical to what `v1` sent, or every `v5` result gathered under `v1` would have been
   * produced by a request shape we can no longer reproduce.
   */
  it("still sends what v1 sent when there is nothing to carry", () => {
    const v1 = readFileSync(path.join(DIR, "event_identity_input_v1", "prompt-only.txt"), "utf8");
    expect(assemble({ prompt: CASES["prompt-only"].prompt })).toBe(v1);
    expect(assemble({ prompt: CASES["prompt-only"].prompt, answers: [] })).toBe(v1);
  });

  it("keeps every superseded version's fixtures", () => {
    // `v1` is what Phase 4A's evidence was produced under. Deleting it would erase the record of
    // what those runs sent, which no later version can reconstruct.
    expect(readdirSync(DIR)).toContain("event_identity_input_v1");
  });

  it("offers no way to regenerate a fixture from the code it is meant to pin", () => {
    // Code only: the prose above names the mechanisms it refuses, and matching its own
    // explanation would make this assert the opposite of what it means.
    const code = readFileSync(new URL(import.meta.url).pathname, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join("\n");
    // The needles are concatenated so they never appear contiguously in this file, which would
    // otherwise make the check match itself and fail whatever the code does.
    for (const needle of ["write" + "FileSync", "UPDATE_" + "GOLDENS", "process" + ".env"]) {
      expect(
        code,
        `${needle} would be a way to rewrite a fixture instead of reviewing it`,
      ).not.toContain(needle);
    }
  });
});
