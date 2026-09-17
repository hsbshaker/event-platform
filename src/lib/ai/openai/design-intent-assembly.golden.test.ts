/**
 * Version-named goldens for the DesignIntent input assembly.
 *
 * `DESIGN_INTENT_INPUT_ASSEMBLY_VERSION` exists so that a change to the *effective* model input is
 * visible in evidence even when the prompt file and the schema have not moved. A version that says
 * `v1` while the assembly quietly produces something else is worse than no version at all: every
 * `design_intent_artifacts` row and every journal line would carry a label that does not describe
 * what was sent.
 *
 * So each declared version owns a directory of expected messages, and this asserts the current
 * assembly against the directory its version names. Change the assembly's behaviour without
 * bumping the version and the goldens fail; bump the version and the old directory stays.
 *
 * **There is no regeneration switch.** No `UPDATE_GOLDENS`, no `--update`, no env var — the same
 * rule `assembly.golden.test.ts` holds for the Event Identity assembly, and for the same reason: a
 * fixture that can be rewritten by setting a variable is a fixture that gets rewritten when it
 * fails, which is the failure mode it exists to prevent.
 *
 * Acceptance criteria: N/A — provenance integrity. `spec.md §31 — Event Identity and diversity`;
 * `docs/phase-4b-plan.md` Part IV T21.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import { DESIGN_INTENT_INPUT_ASSEMBLY_VERSION } from "@/lib/ai/versions";
import type { SiblingAssignment } from "@/lib/renderer/planner";

import {
  assembleDesignIntentUserMessage,
  DESIGN_INTENT_ASSEMBLY_TEXT,
  DesignIntentAssemblyError,
} from "./design-intent-input";

const DIR = new URL("./__fixtures__/design-intent-assembly/", import.meta.url).pathname;

interface GoldenCase {
  identity: EventIdentity;
  assignment: SiblingAssignment;
}

const CASES = (
  JSON.parse(readFileSync(path.join(DIR, "cases.json"), "utf8")) as {
    cases: Record<string, GoldenCase>;
  }
).cases;

const assemble = (testCase: GoldenCase) => assembleDesignIntentUserMessage(testCase);

describe(`design intent input assembly goldens: ${DESIGN_INTENT_INPUT_ASSEMBLY_VERSION}`, () => {
  const versionDir = path.join(DIR, DESIGN_INTENT_INPUT_ASSEMBLY_VERSION);

  it("has a fixture directory named for the declared version", () => {
    expect(readdirSync(DIR)).toContain(DESIGN_INTENT_INPUT_ASSEMBLY_VERSION);
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
        `${DESIGN_INTENT_INPUT_ASSEMBLY_VERSION} fixture. If the change is intended, it is an ` +
        "input-assembly change: bump DESIGN_INTENT_INPUT_ASSEMBLY_VERSION and write a new " +
        "fixture directory. Do not edit this one — it records what a declared version sent.",
    ).toBe(readFileSync(path.join(versionDir, `${name}.txt`), "utf8"));
  });

  it("offers no way to regenerate a fixture from the code it is meant to pin", () => {
    // Code only: the prose above names the mechanisms it refuses, and matching its own explanation
    // would make this assert the opposite of what it means.
    const code = readFileSync(new URL(import.meta.url).pathname, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join("\n");
    // The needles are concatenated so they never appear contiguously in this file.
    for (const needle of ["write" + "FileSync", "UPDATE_" + "GOLDENS", "process" + ".env"]) {
      expect(
        code,
        `${needle} would be a way to rewrite a fixture instead of reviewing it`,
      ).not.toContain(needle);
    }
  });
});

describe("what the assembled message carries, and what it cannot", () => {
  const message = assemble(CASES.constrained);

  it("carries every field of the brief, in the brief's own declaration order", () => {
    const order = Object.values(DESIGN_INTENT_ASSEMBLY_TEXT.labels);
    const positions = order.map((label) => message.indexOf(label));
    expect(
      positions.every((at) => at >= 0),
      "a brief label is missing entirely",
    ).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("labels host constraints authoritative and creative guidance advisory, where they are", () => {
    // `docs/model-contracts.md §4` makes the field *name* the carrier of authority, because the
    // failure being prevented is a downstream stage misreading it. A flat list of both would undo
    // that at the last step, so the authority is restated beside the values themselves.
    const constraintsAt = message.indexOf(DESIGN_INTENT_ASSEMBLY_TEXT.hostConstraintsHeading);
    const guidanceAt = message.indexOf(DESIGN_INTENT_ASSEMBLY_TEXT.creativeGuidanceHeading);
    expect(constraintsAt).toBeGreaterThan(-1);
    expect(guidanceAt).toBeGreaterThan(constraintsAt);
    expect(DESIGN_INTENT_ASSEMBLY_TEXT.hostConstraintsHeading).toContain("AUTHORITATIVE");
    expect(DESIGN_INTENT_ASSEMBLY_TEXT.creativeGuidanceHeading).toContain("ADVISORY");
    for (const constraint of CASES.constrained.identity.hostConstraints) {
      expect(message).toContain(`- ${constraint}`);
    }
  });

  it("carries a downstream-only host constraint unaltered, rather than dropping it", () => {
    // `docs/phase-4b-plan.md §3.2`: a constraint whose subject this stage cannot express is still
    // authoritative — it must not be contradicted, and it remains binding downstream. Withholding
    // it from the call would make contradicting it the model's default.
    expect(message).toContain("- Do not put the dress code on the page; they will be told.");
  });

  it("renders the assignment, including the hierarchy the schema does not narrow", () => {
    const { assignment } = CASES.constrained;
    expect(message).toContain(`${DESIGN_INTENT_ASSEMBLY_TEXT.assignment.family} statement`);
    expect(message).toContain(`${DESIGN_INTENT_ASSEMBLY_TEXT.assignment.tonalDirection} dark`);
    expect(message).toContain(`${DESIGN_INTENT_ASSEMBLY_TEXT.assignment.hierarchy} monumental`);
    expect(message).toContain(
      `${DESIGN_INTENT_ASSEMBLY_TEXT.assignment.typographyPairings} ${assignment.typographyPairings.join(", ")}`,
    );
  });

  it("says empty out loud rather than leaving a field out", () => {
    const unconstrained = assemble(CASES.unconstrained);
    // An absent line and an empty one are the same to a reader; "the host said nothing about this"
    // and "this was dropped" are not the same fact.
    expect(unconstrained).toContain(
      `${DESIGN_INTENT_ASSEMBLY_TEXT.labels.requiredColors} ${DESIGN_INTENT_ASSEMBLY_TEXT.none}`,
    );
    expect(unconstrained).toContain(
      `${DESIGN_INTENT_ASSEMBLY_TEXT.labels.dominanceNotes} ${DESIGN_INTENT_ASSEMBLY_TEXT.none}`,
    );
    expect(unconstrained).toContain(
      `${DESIGN_INTENT_ASSEMBLY_TEXT.hostConstraintsHeading}\n${DESIGN_INTENT_ASSEMBLY_TEXT.none}`,
    );
  });

  it("is pure: the same input yields the same bytes", () => {
    expect(assemble(CASES.constrained)).toBe(message);
    expect(assemble(CASES.unconstrained)).toBe(assemble(CASES.unconstrained));
  });

  it("fails closed on a malformed brief rather than rendering undefined into a paid request", () => {
    const broken = {
      ...CASES.constrained,
      identity: { ...CASES.constrained.identity, copyTone: undefined },
    } as unknown as GoldenCase;
    expect(() => assemble(broken)).toThrow(DesignIntentAssemblyError);
    expect(() => assemble(broken)).toThrow(/copyTone/);

    const noPairing = {
      ...CASES.constrained,
      assignment: { ...CASES.constrained.assignment, typographyPairings: [] },
    };
    // No legal answer exists, so no request is worth paying for. `narrowingFor` refuses the same
    // condition; failing here as well keeps the two from disagreeing about which one refused.
    expect(() => assemble(noPairing)).toThrow(/no legal response/);
  });
});
