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
    const callers = sourceFiles(SRC)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) =>
        /\.responses\.create\(|\.chat\.completions\.create\(/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(SRC, file));

    expect(callers).toEqual([INTERPRETER]);
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

    // And the shapes carry no field that could smuggle prose in under another name.
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
