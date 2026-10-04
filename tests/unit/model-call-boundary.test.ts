import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * "Uncontrolled model calls must be impossible" (docs/development-plan.md, Phase 5 and principle
 * 3; spec.md §10, §32 #4). The runtime half is `src/lib/ai/openai.server.test.ts`: every provider
 * method refuses before any request when the meter does. This is the static half: there is no
 * other way to reach the provider.
 *
 * - Only `src/lib/ai/openai.server.ts` talks to the provider's host or holds its key.
 * - It exports only the provider factory, whose every method runs inside `metered(...)`; its
 *   request helpers are module-private.
 * - Only `src/lib/ai/provider.ts` (`getAiProvider`) imports it.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const PROVIDER_IMPL = "src/lib/ai/openai.server.ts";

function filesContaining(pattern: string): string[] {
  let out = "";
  try {
    out = execFileSync(
      "grep",
      [
        "-rlE",
        "--include=*.ts",
        "--include=*.tsx",
        "--include=*.mjs",
        "--include=*.js",
        pattern,
        "src",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch (error) {
    // grep exits 1 when nothing matches.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .sort();
}

describe("the model provider is reachable only through the meter", () => {
  it("only the provider implementation names the provider's API host", () => {
    expect(filesContaining("api\\.openai\\.com")).toEqual([PROVIDER_IMPL]);
  });

  it("only the provider implementation uses the API key, read only through the env schema", () => {
    expect(filesContaining("openAiApiKey")).toEqual(["src/lib/env.ts", PROVIDER_IMPL].sort());
    expect(filesContaining("OPENAI_API_KEY")).toEqual(["src/lib/env.ts", PROVIDER_IMPL].sort());
    expect(filesContaining("process\\.env\\.OPENAI|process\\.env\\[.OPENAI")).toEqual([]);
  });

  it("the implementation exports nothing that makes a request", () => {
    const source = readFileSync(path.join(ROOT, PROVIDER_IMPL), "utf8");
    const exported = [...source.matchAll(/^export\s+(?:async\s+)?(\w+)\s+(\w+)/gm)].map(
      ([, kind, name]) => `${kind} ${name}`,
    );
    expect(exported.sort()).toEqual([
      "function createOpenAiProvider",
      "interface OpenAiProviderOptions",
    ]);
    // One network call site, and every provider method goes through `metered`.
    expect(source.match(/\bfetch\(/g)).toHaveLength(1);
    const methods = source.slice(source.indexOf("return {\n    async generateEventIdentity"));
    expect(methods.match(/^ {4}async \w+\(/gm)).toHaveLength(6);
    expect(source).toMatch(/metered\(ctx, operation, RESERVATION_USD\[operation\], info, call\)/);
  });

  it("only getAiProvider imports the implementation", () => {
    expect(filesContaining("openai\\.server")).toEqual(["src/lib/ai/provider.ts"]);
  });

  it("no other module under src/lib/ai calls fetch", () => {
    expect(filesContaining("\\bfetch\\(").filter((f) => f.startsWith("src/lib/ai/"))).toEqual([
      PROVIDER_IMPL,
    ]);
  });
});
