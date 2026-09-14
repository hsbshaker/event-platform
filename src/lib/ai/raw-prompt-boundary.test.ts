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
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { GenerateCompositionInput, GenerateDesignIntentInput } from "@/lib/ai/provider";

const SRC = new URL("../../", import.meta.url).pathname;

/** The one module allowed to put host prose into a model request. */
const INTERPRETER = path.join("lib", "ai", "openai", "event-identity.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith(".ts") || entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("the raw-prompt boundary", () => {
  it("is crossed by exactly one module", () => {
    // The invariant is *who may read host prose*, not who may call a model. Phase 4C and 4D
    // each add a legitimate second and third call site, so an inventory of call sites would
    // fail by construction on correct work — and the cheapest way to green it is to append
    // the new module, after which the test constrains nothing at all.
    //
    // Scoped to the model-call input type, not to any code touching a `prompt`. Phase 2's
    // draft store reads `input.prompt` and must: storing what the host typed is not the same
    // act as feeding it to a model, and the boundary this protects is the second one.
    const readers = sourceFiles(SRC)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => /GenerateEventIdentityInput/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file))
      // provider.ts declares the type; declaring is not reading.
      .filter((file) => file !== path.join("lib", "ai", "provider.ts"));

    expect(readers).toEqual([INTERPRETER]);
  });

  it("has exactly one model call site today, and says what adding another costs", () => {
    // Kept as a separate, extensible inventory rather than folded into the invariant above.
    // Adding a module here is allowed — 4C and 4D will — but it is the moment to re-prove
    // that the new call site reads the persisted identity and not the words behind it.
    const allowed = [INTERPRETER];
    const callers = sourceFiles(SRC)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) =>
        // Every shape the SDK offers, not just the two this call happens to use: `stream`
        // and `parse` reach the same model with the same payload.
        /\.(responses|chat\.completions)\.(create|stream|parse)\(/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(SRC, file));

    expect(callers).toEqual(allowed);
  });

  it("keeps the downstream call inputs free of prompt text", () => {
    // Compile-time, not a string scan: if someone adds `prompt` to either input, the
    // assignment below stops type-checking and this file fails to build.
    const designIntent: GenerateDesignIntentInput = {
      eventIdentity: {},
      diversityAssignment: {},
    };
    const composition: GenerateCompositionInput = {
      designIntent: {},
      capabilities: {},
      directive: {},
    };

    expect(Object.keys(designIntent)).toEqual(["eventIdentity", "diversityAssignment"]);
    expect(Object.keys(composition)).toEqual(["designIntent", "capabilities", "directive"]);

    // `eventIdentity` is `Record<string, unknown>` until Phase 4C types it, so the type
    // system cannot yet stop prose arriving as `eventIdentity.sourcePrompt`. Say so rather
    // than let the assertion above imply a guarantee it does not give.
    type HasPrompt<T> = Extract<keyof T, `${string}rompt${string}` | `${string}Text`>;
    const designIntentPromptFields: HasPrompt<GenerateDesignIntentInput>[] = [];
    const compositionPromptFields: HasPrompt<GenerateCompositionInput>[] = [];
    expect(designIntentPromptFields).toEqual([]);
    expect(compositionPromptFields).toEqual([]);
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
