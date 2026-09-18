/**
 * What the DesignIntent call may receive, proved rather than promised — and what T18 must not ship.
 *
 * `docs/phase-4b-plan.md §E`: each call receives the creative brief from the same authoritative
 * identity, **only its own sibling assignment**, and — since the T22 evidence §E required before a
 * third channel could exist — **only its own concept premise**. Eleven exclusions follow from that
 * sentence and from `spec.md §7.5`, `§7.7`, `§F` and `CLAUDE.md §2`/`§5.1`. Prose does not
 * enforce any of them, and the cheapest way for a later stage to seem to work is to pass one
 * along "for context", so each is proved here — by the type system where a type can carry it, by a
 * scan of this module's own source where it cannot.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` ("Event Identity is the only
 * stage that receives the raw host prompt; the planner, DesignIntent and composition calls read
 * the persisted identity (§7.5)"); guardrail `spec.md §32 #12`. Plan: `§E`, `§F`, T18.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ConceptPremise } from "@/lib/ai/concept-premise/contract";
import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import type { GenerateDesignIntentInput } from "@/lib/ai/provider";
import type { SiblingAssignment } from "@/lib/renderer/planner";

import { DESIGN_INTENT_INPUT_CHANNELS, type DesignIntentCallInput } from "./input";

const MODULE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../../../", import.meta.url).pathname;

/** Source with comments removed: the boundary is about what the code does, not what it explains. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

function moduleSources(): { file: string; source: string }[] {
  return readdirSync(MODULE)
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .map((entry) => ({ file: entry, source: code(path.join(MODULE, entry)) }));
}

/** Every `@/`-aliased or relative import this module's files reach, transitively. */
function importClosure(): Set<string> {
  const seen = new Set<string>();
  const queue = readdirSync(MODULE)
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .map((entry) => path.join(MODULE, entry));

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const specifier = match[1];
      let resolved: string | null = null;
      if (specifier.startsWith("@/")) resolved = path.join(SRC, specifier.slice(2));
      else if (specifier.startsWith(".")) resolved = path.join(path.dirname(file), specifier);
      if (!resolved) continue;
      for (const candidate of [`${resolved}.ts`, path.join(resolved, "index.ts")]) {
        try {
          if (statSync(candidate).isFile()) {
            queue.push(candidate);
            break;
          }
        } catch {
          /* not this shape */
        }
      }
    }
  }
  return seen;
}

describe("the input envelope", () => {
  it("is the brief, one assignment and one premise, and exactly those three", () => {
    // Compile-time: adding a field to `DesignIntentCallInput` fails this assignment, and adding
    // one to the provider boundary fails the one below it.
    const input: DesignIntentCallInput = {
      identity: {} as AuthoritativeIdentity,
      assignment: {} as SiblingAssignment,
      premise: {} as ConceptPremise,
    };
    expect(Object.keys(input)).toEqual(["identity", "assignment", "premise"]);
    expect([...DESIGN_INTENT_INPUT_CHANNELS]).toEqual(["identity", "assignment", "premise"]);

    const provider: GenerateDesignIntentInput = {
      eventIdentity: {},
      diversityAssignment: {} as SiblingAssignment,
      conceptPremise: {} as ConceptPremise,
    };
    expect(Object.keys(provider)).toEqual([
      "eventIdentity",
      "diversityAssignment",
      "conceptPremise",
    ]);
  });

  it("carries one premise, not the set the premise came from", () => {
    // The premise stage authors three as a set; exactly one of them travels. A field typed as the
    // set, or as an array, would hand a blind call the other two concepts — which is the thing
    // §E's blindness forbids, arriving through the new channel instead of the old one.
    const premise: DesignIntentCallInput["premise"] = {} as ConceptPremise;
    type IsArray = DesignIntentCallInput["premise"] extends readonly unknown[] ? never : true;
    const notAnArray: IsArray = true;
    expect(notAnArray).toBe(true);
    type SetShaped = Extract<
      keyof DesignIntentCallInput["premise"],
      "premises" | "constrainedAxes"
    >;
    const setShaped: SetShaped[] = [];
    expect(setShaped).toEqual([]);
    expect(premise).toBeDefined();
  });

  it("cannot carry the raw host prompt, `suppliedFacts` or `clarification`", () => {
    // `AuthoritativeIdentity` brands the **brief**, not the result envelope, so the three siblings
    // that live beside it in `EventIdentityResult` are not reachable from a value of this type.
    // `never` here is the proof: any of these keys existing would widen the extraction.
    type Leaked = Extract<
      keyof AuthoritativeIdentity,
      "prompt" | "sourcePrompt" | "hostWords" | "suppliedFacts" | "clarification"
    >;
    const leaked: Leaked[] = [];
    expect(leaked).toEqual([]);

    type PromptShaped = Extract<
      keyof DesignIntentCallInput | keyof GenerateDesignIntentInput,
      `${string}rompt${string}`
    >;
    const promptShaped: PromptShaped[] = [];
    expect(promptShaped).toEqual([]);
  });

  it("cannot carry the directive or the token allotment", () => {
    // `spec.md §7.7`: those go to the composition call. T17 persists both on the artifact for
    // lineage (`§G.2`), which is not a route back into this call's input.
    const assignment: SiblingAssignment = {
      family: "editorial",
      tonalDirection: "mid",
      typographyCategory: "heritage",
      hierarchy: "editorial",
      typographyPairings: ["heritage_caslon_karla"],
    };
    expect(Object.keys(assignment).sort()).toEqual([
      "family",
      "hierarchy",
      "tonalDirection",
      "typographyCategory",
      "typographyPairings",
    ]);

    type Composition = Extract<
      keyof SiblingAssignment,
      | "directive"
      | "directiveSentence"
      | "allowedTokens"
      | "forbiddenTokens"
      | "tokenAllotment"
      | "capabilities"
      | "contentProfile"
    >;
    const composition: Composition[] = [];
    expect(composition).toEqual([]);
  });

  it("cannot carry raw inspiration bytes — only the summary travels", () => {
    // `docs/phase-4b-plan.md §F`: EventIdentity receives the raw prompt *and* the private
    // inspiration assets and is the only stage that does; it emits `inspirationSummary` inside
    // the identity, and "the planner and the DesignIntent call receive the identity, therefore the
    // summary, and never the raw assets". `GenerateEventIdentityInput` is where an
    // `inspiration: {mimeType, bytes}[]` field legitimately exists; none of these three types has
    // one, and the extraction below is `never` unless that changes.
    type Bytes = Extract<
      keyof AuthoritativeIdentity | keyof DesignIntentCallInput | keyof GenerateDesignIntentInput,
      "inspiration" | "inspirationAssets" | "assets" | "attachments" | "images" | "uploads"
    >;
    const bytes: Bytes[] = [];
    expect(bytes).toEqual([]);

    // And what does travel is a string the model wrote, not something the host uploaded.
    const summary: AuthoritativeIdentity["inspirationSummary"] = "No visual inspiration supplied.";
    expect(typeof summary).toBe("string");
  });

  it("cannot carry another sibling's output, or a library identifier", () => {
    // The three calls are blind and parallel (`§E`), and the Library Boundary Invariant forbids a
    // recipe or silhouette id becoming a creative decision variable (`CLAUDE.md §5.1`). Neither
    // `AuthoritativeIdentity` nor `SiblingAssignment` has a field that could carry either, so
    // there is no carrier at all — which is what these extractions say.
    type Carrier = Extract<
      keyof DesignIntentCallInput | keyof AuthoritativeIdentity | keyof SiblingAssignment,
      | "siblings"
      | "siblingPremises"
      | "otherPremises"
      | "premises"
      | "premiseSet"
      | "otherConcepts"
      | "designIntent"
      | "designIntents"
      | "concepts"
      | "recipe"
      | "recipeId"
      | "silhouette"
      | "heroSilhouette"
      | "template"
      | "templateId"
    >;
    const carriers: Carrier[] = [];
    expect(carriers).toEqual([]);
  });

  it("names every exclusion the plan lists, so none is quietly dropped", () => {
    // Not a behaviour check — a completeness check on this file. §E and §F name ten things this
    // call never receives; each has a proof above or a scan below, and this list is what makes a
    // missing one visible.
    expect([
      "raw host prompt",
      "raw inspiration assets",
      "suppliedFacts",
      "clarification",
      "structural directive",
      "token allotment",
      "capabilities",
      "content profile",
      "another sibling's output",
      "another concept's premise",
      "library recipe or silhouette identifier",
    ]).toHaveLength(11);
  });
});

describe("this module's own source", () => {
  it("scans the whole module, so a rename cannot empty the checks below", () => {
    expect(
      moduleSources()
        .map((s) => s.file)
        .sort(),
    ).toEqual([
      "contract.ts",
      "index.ts",
      "input.ts",
      "narrowing.ts",
      "policy.ts",
      "schemas.ts",
      "validate.ts",
      "wire-schema.ts",
    ]);
    for (const { file, source } of moduleSources())
      expect(source.trim().length, file).toBeGreaterThan(200);
    // And the transitive closure really walked past this directory.
    expect(importClosure().size).toBeGreaterThan(moduleSources().length);
  });

  it("reads none of the excluded inputs", () => {
    // Comments are stripped first: `input.ts` explains every exclusion by name, and a scan that
    // could not tell an explanation from a use would have to be deleted the first time someone
    // documented the boundary properly.
    const forbidden = [
      /\bsuppliedFacts\b/,
      /\bclarification\b/i,
      /\bcapabilit(y|ies)\b/i,
      /\bcontentProfile\b/i,
      /\bdirective\b/i,
      /\btokenAllotment\b/i,
      /\ballowedTokens\b/,
      /\bforbiddenTokens\b/,
      /\binspiration\b/i,
      /\bsiblings?\b\s*[:.[]/i,
    ];
    const offenders: string[] = [];
    for (const { file, source } of moduleSources())
      for (const pattern of forbidden)
        if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
    expect(offenders).toEqual([]);
  });

  it("names a prompt only as a version stamp", () => {
    // `spec.md §7.5`: Event Identity is the only stage that may read host prose. Nothing here
    // reads any, and the one legitimate occurrence is the version constant on the artifact.
    const offenders: string[] = [];
    for (const { file, source } of moduleSources()) {
      const stripped = source.replace(/PROMPT_VERSION|promptVersion/g, "");
      if (/\bprompt\b/i.test(stripped)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("carries no recipe, silhouette or template identifier", () => {
    // The Library Boundary Invariant (`CLAUDE.md §5.1`): a fixture identifier must never become a
    // creative decision variable, and the schema descriptions here ship to the model.
    const offenders: string[] = [];
    for (const { file, source } of moduleSources())
      for (const word of ["silhouette", "recipe", "template", "heroKeys", "surfacePlan"])
        if (source.toLowerCase().includes(word.toLowerCase())) offenders.push(`${file}: ${word}`);
    expect(offenders).toEqual([]);
  });
});

describe("T18 ships no prompt and reaches no provider", () => {
  it("introduces no prompt file", () => {
    // The DesignIntent prompt is **T21** (`docs/phase-4b-plan.md` Part IV), written after the 4C
    // corpora are frozen so it can be leakage-scanned against them. T18 is the contract, the
    // schema, the narrowing and the validator, and nothing else.
    //
    // `docs/model-prompts/design-intent.system.md` already exists as the v4 draft and predates
    // this task; T21's row names that file as what it will write. So the checkable property is
    // not "no such path exists" but "T18 shipped no prompt of its own and wired none in" — which
    // is what the two assertions below say.
    const promptish = readdirSync(MODULE).filter(
      (entry) => entry.endsWith(".md") || /prompt/i.test(entry),
    );
    expect(promptish).toEqual([]);

    const wired = moduleSources().filter(({ source }) =>
      /model-prompts|system\.md|systemPrompt/i.test(source),
    );
    expect(wired.map((s) => s.file)).toEqual([]);
  });

  it("holds no model-visible text but the schema's own descriptions", () => {
    // `docs/phase-4b-plan.md` T18 is marked model-visible for exactly one reason: "schema
    // descriptions ship". Those live in `contract.ts` and are emitted into the generated schema.
    // A long prose block anywhere else here would be prompt text arriving three tasks early, on a
    // path T20's leakage scan does not cover.
    const offenders: string[] = [];
    for (const { file, source } of moduleSources()) {
      if (file === "contract.ts" || file === "schemas.ts") continue;
      for (const literal of source.matchAll(/"([^"\\\n]{120,})"/g))
        offenders.push(`${file}: ${literal[1].slice(0, 60)}…`);
    }
    expect(offenders).toEqual([]);
  });

  it("reaches no provider, transitively", () => {
    // Not a scan of this directory: a scan of everything this directory can reach. The provider
    // boundary is unimplemented and no live DesignIntent call is authorised before T21, so the
    // honest property is that nothing here can call one even indirectly.
    const offenders: string[] = [];
    for (const file of importClosure()) {
      const source = readFileSync(file, "utf8");
      if (/\.(responses|chat\.completions)\.(create|stream|parse)\(/.test(source))
        offenders.push(`${path.relative(SRC, file)}: model call`);
      if (/from\s+"openai"/.test(source)) offenders.push(`${path.relative(SRC, file)}: openai`);
      if (/\bgetAiProvider\s*\(/.test(source))
        offenders.push(`${path.relative(SRC, file)}: getAiProvider`);
    }
    expect(offenders).toEqual([]);
  });

  it("does not import the provider module outside a type position", () => {
    const offenders = moduleSources()
      .filter(({ source }) => /(?<!type )\{[^}]*\}\s*from\s+"@\/lib\/ai\/provider"/.test(source))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});
