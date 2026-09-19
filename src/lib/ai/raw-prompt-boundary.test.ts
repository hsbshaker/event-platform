/**
 * Event Identity is the only stage that may read the host's raw words.
 *
 * `spec.md §7.5`: "No later stage receives the prompt text — the planner, the DesignIntent
 * call and the composition call all read this object — so an understanding this stage does
 * not reach is not recoverable downstream." `docs/product-doctrine.md §4` states the
 * consequence: a raw prompt is never forwarded into a generic website- or image-generation
 * prompt.
 *
 * That is an architectural boundary, and boundaries that exist only in prose get crossed.
 * Phase 4C and 4D will add two more model calls, and the cheapest way for either to seem to
 * work is to pass the original prompt along "for context" — which would make Event Identity
 * optional, and the whole interpreter argument moot. This test is what makes that a failing
 * build rather than a design drift nobody notices.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`: "Event Identity is the
 * only stage receiving the raw prompt." Guardrail `§32 #12`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { premiseFixture } from "../../../tests/fixtures/concept-premise";
import type { GenerateCompositionInput, GenerateDesignIntentInput } from "@/lib/ai/provider";

const SRC = new URL("../../", import.meta.url).pathname;

/** The one module allowed to put host prose into a model request. */
const INTERPRETER = path.join("lib", "ai", "openai", "event-identity.ts");

/**
 * The module that composes that request, since T9 split it out of the caller.
 *
 * The invariant below binds "reads host prose" to "calls a model", which was the whole boundary
 * while one file did both. It no longer is: the assembly holds the host's description and their
 * clarification answers and calls nothing, so a scan of model callers cannot see the place the
 * composition actually happens. Naming it keeps the boundary a boundary — and the import check
 * below keeps it a boundary of two files rather than however many come to depend on it.
 */
const COMPOSER = path.join("lib", "ai", "openai", "event-identity-input.ts");

/** Every module that reaches a model, by any shape the SDK offers. */
function modelCallers(): string[] {
  return sourceFiles(SRC)
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .filter((file) =>
      // `stream` and `parse` reach the same model with the same payload as `create`.
      /\.(responses|chat\.completions)\.(create|stream|parse)\(/.test(readFileSync(file, "utf8")),
    )
    .map((file) => path.relative(SRC, file));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith(".ts") || entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("the raw-prompt boundary", () => {
  it("lets no model caller but the interpreter name a prompt", () => {
    // The invariant is *who may read host prose*, not who may call a model: Phase 4C and 4D
    // each add a legitimate call site, so a bare inventory would fail on correct work and the
    // cheapest way to green it would gut the test.
    //
    // This binds "reads host prose" to "calls a model", which is the actual boundary. Scanning for
    // the type name would pass on a naming coincidence — a 4C module wanting host prose would
    // not call its parameter `GenerateEventIdentityInput`, it would read the draft store's
    // prompt column or take `{ hostWords: string }`. And scanning every file for `prompt`
    // catches Phase 2's draft store, which reads `input.prompt` and must: storing what the
    // host typed is not the same act as feeding it to a model.
    //
    // So: among the files that call a model, only the interpreter may name a prompt at all.
    const offenders = modelCallers()
      .filter((file) => file !== INTERPRETER)
      .filter((file) => {
        const source = readFileSync(path.join(SRC, file), "utf8")
          // Not host prose: our own system prompt, the retry kind, the version stamp.
          .replace(/systemPrompt|PROMPT_PATH|reprompt|promptVersion|PROMPT_VERSION/g, "");
        return /\bprompt\b/i.test(source);
      });

    expect(offenders).toEqual([]);
  });

  it("keeps the composer reachable from the interpreter and nowhere else", () => {
    // Host prose reaches a model through exactly two files, and only one of them may pull in the
    // other. A 4C or 4D module importing the assembly would be putting itself on the path host
    // words travel, which is the thing this file exists to make impossible to do quietly.
    expect(existsSync(path.join(SRC, COMPOSER))).toBe(true);
    const importers = sourceFiles(SRC)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) =>
        /from "\.\/event-identity-input"|event-identity-input"/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(SRC, file))
      .filter((file) => file !== COMPOSER)
      .sort();
    // `provider.ts` imports the two answer *types* to avoid re-declaring them; that is a type-only
    // import and composes nothing, which is why it is named here rather than silently allowed.
    expect(importers).toEqual([INTERPRETER, path.join("lib", "ai", "provider.ts")].sort());
  });

  it("has four model call sites today, and says what adding another costs", () => {
    // Kept as a separate, extensible inventory rather than folded into the invariant above.
    // Adding a module here is allowed — 4C and 4D will — but it is the moment to re-prove
    // that the new call site reads the persisted identity and not the words behind it.
    //
    // Phase 4C T21 added the second. It is re-proved rather than waved through: the invariant
    // above already shows it names no prompt and reads no raw inspiration, and
    // `src/lib/ai/design-intent/boundary.test.ts` proves the envelope it is handed is the brief,
    // one assignment and one premise. What it sends is assembled in
    // `openai/design-intent-input.ts`, from those three values and nothing else.
    //
    // The T22 remediation added the third, and it is the cheapest of the three to re-prove: the
    // premise stage's envelope is **one** channel, the authoritative brief
    // (`src/lib/ai/concept-premise/input.ts`), so there is nothing else it could be reading. It
    // receives no raw prompt, no raw inspiration and — load-bearing rather than tidy — no
    // `suppliedFacts`, because its validator refuses a premise asserting a specific the brief does
    // not carry, and a stage that could see the host's literal names would turn that check into a
    // test of whether the model copied a field.
    //
    // Phase 4D added the fourth, the composition call, and it is re-proved the same way. Its
    // envelope is `CompositionCallInput` in `src/lib/ai/composition/contract.ts`: a closed record
    // of the design brief, the content profile, capabilities, this concept's DesignIntent, its
    // directive, its token allotment and its planner seed. The host's words reach it only as
    // `CompositionBrief`, which `src/lib/ai/composition/brief.ts` projects from the persisted
    // identity — and the event's own copy does not reach it at all: `ContentProfile` carries
    // character counts, so there is no field on that type a prompt, a title or a guest name could
    // travel in. The invariant above additionally shows the module names no prompt.
    expect(modelCallers().sort()).toEqual(
      [
        INTERPRETER,
        path.join("lib", "ai", "openai", "design-intent.ts"),
        path.join("lib", "ai", "openai", "concept-premise.ts"),
        path.join("lib", "ai", "openai", "composition.ts"),
      ].sort(),
    );
  });

  it("keeps the downstream call inputs free of prompt text", () => {
    // Compile-time, not a string scan: if someone adds `prompt` to either input, the
    // assignment below stops type-checking and this file fails to build.
    const designIntent: GenerateDesignIntentInput = {
      eventIdentity: {},
      // Phase 4C T18 tightened this from `Record<string, unknown>` to the planner's own
      // assignment type. A bag would have let the directive and the token allotment arrive
      // without anything noticing; five named fields cannot.
      diversityAssignment: {
        family: "editorial",
        tonalDirection: "mid",
        typographyCategory: "heritage",
        hierarchy: "editorial",
        typographyPairings: ["heritage_caslon_karla"],
      },
      // T22's remediation added the third channel. It is the premise contract's own type for the
      // same reason the assignment is the planner's: a bag would let the other two concepts'
      // premises arrive without anything noticing.
      conceptPremise: premiseFixture(),
    };

    expect(Object.keys(designIntent)).toEqual([
      "eventIdentity",
      "diversityAssignment",
      "conceptPremise",
    ]);

    // Phase 4D closed the composition half of this boundary. `GenerateCompositionInput` is now an
    // alias of `CompositionCallInput`, a closed record whose event knowledge is a
    // `CompositionBrief` of four named fields — so the host's own words have nowhere to travel, and
    // the assertion below is checked by the compiler rather than by a key list.
    //
    // The previous shape was `{designIntent, capabilities, directive}` over
    // `Record<string, unknown>`, which is what made this note necessary: it could not stop prose
    // arriving as `eventIdentity.sourcePrompt`, and it carried no host constraints at all.
    type CompositionKeys = keyof GenerateCompositionInput;
    const compositionEnvelope: CompositionKeys[] = [
      "brief",
      "contentProfile",
      "capabilities",
      "designIntent",
      "directive",
      "forbiddenTokens",
      "seed",
      "collides",
    ];
    expect(compositionEnvelope).toHaveLength(8);

    // `eventIdentity` on the DesignIntent input is still `Record<string, unknown>`, so the type
    // system cannot stop prose arriving there as `eventIdentity.sourcePrompt`. Say so rather
    // than let the assertion above imply a guarantee it does not give.
    type HasPrompt<T> = Extract<keyof T, `${string}rompt${string}` | `${string}Text`>;
    const designIntentPromptFields: HasPrompt<GenerateDesignIntentInput>[] = [];
    const compositionPromptFields: HasPrompt<GenerateCompositionInput>[] = [];
    expect(designIntentPromptFields).toEqual([]);
    expect(compositionPromptFields).toEqual([]);
  });

  it("refuses the DesignIntent call site raw inspiration bytes as well", () => {
    // `docs/phase-4b-plan.md §F`, the one additive guard it names: "extend
    // `raw-prompt-boundary.test.ts` so the DesignIntent call site is refused raw inspiration
    // bytes as well as raw prompt text — the same boundary, the other input."
    //
    // §F settles the rule from canon: EventIdentity receives the raw prompt *and* the private
    // inspiration assets and is the only stage that does (`spec.md §7.5`, `§9.4`); it emits
    // `inspirationSummary` inside the identity, and the planner and the DesignIntent call receive
    // the identity, therefore the summary, and never the raw assets. `§9.4`: "Do not re-send
    // original raw inspiration for routine redesign after its summary is available."
    //
    // Compile-time first: any inspiration-shaped field on either downstream input widens the
    // extraction below off `never` and this file stops building.
    type Bytes<T> = Extract<
      keyof T,
      "inspiration" | "inspirationAssets" | "assets" | "attachments" | "images" | "uploads"
    >;
    const designIntentBytes: Bytes<GenerateDesignIntentInput>[] = [];
    const compositionBytes: Bytes<GenerateCompositionInput>[] = [];
    expect(designIntentBytes).toEqual([]);
    expect(compositionBytes).toEqual([]);

    // And field-level at the provider boundary, the same way the prompt field is checked below:
    // `inspiration` may be declared on the interpreter's input and nowhere else.
    const source = readFileSync(path.join(SRC, "lib", "ai", "provider.ts"), "utf8");
    const withInspirationField: string[] = [];
    for (const match of source.matchAll(
      /export interface (\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g,
    )) {
      const [, name, body] = match;
      if (/(^|\s)inspiration\??\s*:/m.test(body)) withInspirationField.push(name);
    }
    expect(withInspirationField).toEqual(["GenerateEventIdentityInput"]);

    // And no module that reaches a model may read inspiration bytes but the interpreter — the
    // same shape as the prompt invariant above, because it is the same boundary.
    const offenders = modelCallers()
      .filter((file) => file !== INTERPRETER)
      .filter((file) =>
        /\binspiration\b/i.test(
          readFileSync(path.join(SRC, file), "utf8").replace(/inspirationSummary/g, ""),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("declares a prompt field on the interpreter's input and nowhere else", () => {
    // Field-level rather than a blunt search for "prompt": the composition input legitimately
    // carries a `reprompt` describing the single allowed schema retry, which is not host prose.
    const source = readFileSync(path.join(SRC, "lib", "ai", "provider.ts"), "utf8");
    const withPromptField: string[] = [];

    for (const match of source.matchAll(
      /export interface (\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g,
    )) {
      const [, name, body] = match;
      if (/(^|\s)prompt\??\s*:/m.test(body)) withPromptField.push(name);
    }

    expect(withPromptField).toEqual(["GenerateEventIdentityInput"]);
  });
});
