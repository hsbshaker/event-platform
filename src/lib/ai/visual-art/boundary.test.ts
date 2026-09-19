/**
 * The disabled-by-default guarantee, proved rather than promised.
 *
 * > There is **no configuration, environment-variable state or default value** under which calling
 * > the artwork path in this repository reaches a network.
 *
 * `./enablement.ts` states it and names four structural reasons; this file is the evidence for
 * each, because prose does not enforce any of them and the failure it prevents is silent — the
 * only way to find out that a flag flipped is a bill. The scans below deliberately cover **every**
 * file under `src/lib/ai/visual-art/`, including fixtures and the stub, and the import closure
 * beyond it.
 *
 * It also pins the two things about `contract.ts` that nothing else checks: that no
 * placement-shaped field has crept into the intent, and that the standing prohibitions are what
 * `spec.md §7.6a #4` says they are.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 * Guardrails: `spec.md §32 #13`, `#32`, `#41`; `CLAUDE.md §3`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FORBIDDEN_INTENT_FIELDS,
  STANDING_PROHIBITIONS,
  VISUAL_ART_INTENT_FIELDS,
  VISUAL_ART_INTENT_VERSION,
} from "./contract";
import { ARTWORK_GENERATION_AUTHORIZED, getArtworkProvider } from "./enablement";
import { generateVisualArt } from "./generate";
import { ArtworkBatchBudget } from "./spend";
import { STUB_ARTWORK_PROVIDER } from "./stub/provider";
import { artworkIntent } from "./__fixtures__/intent";

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

/** Every non-test `.ts` file under this module, recursively. Nothing is excluded. */
function moduleFiles(dir: string = MODULE): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...moduleFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

/** Every `@/`-aliased or relative import this module's files reach, transitively. */
function importClosure(): Set<string> {
  const seen = new Set<string>();
  const queue = moduleFiles();
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

describe("the scans themselves", () => {
  it("actually cover this module and everything it reaches", () => {
    // A scan over an empty file list passes every assertion below it. This is the guard against a
    // refactor that moves the module and turns the whole file into a very confident no-op.
    const files = moduleFiles().map((file) => path.relative(MODULE, file));
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files).toContain("contract.ts");
    expect(files).toContain("generate.ts");
    expect(files).toContain("stub/provider.ts");
    expect(importClosure().size).toBeGreaterThanOrEqual(files.length);
  });
});

describe("nothing here reads configuration", () => {
  it("never touches process.env", () => {
    // The strongest form of "no environment variable can enable this": there is no environment
    // input at all, so there is no configuration state to get wrong. A ceiling arrives as an
    // argument (`./spend.ts`), and a provider arrives by injection.
    const offenders = moduleFiles()
      .filter((file) => /\bprocess\.env\b/.test(code(file)))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("declares live generation unauthorized, as a constant rather than a lookup", () => {
    expect(ARTWORK_GENERATION_AUTHORIZED).toBe(false);
  });
});

describe("nothing here can reach a network", () => {
  it("imports no transport and calls no fetch, transitively", () => {
    const offenders: string[] = [];
    for (const file of importClosure()) {
      const source = code(file);
      const name = path.relative(SRC, file);
      if (/\bfetch\s*\(/.test(source)) offenders.push(`${name}: fetch`);
      if (/\bXMLHttpRequest\b/.test(source)) offenders.push(`${name}: XMLHttpRequest`);
      if (/\bnew\s+WebSocket\b/.test(source)) offenders.push(`${name}: WebSocket`);
      if (
        /from\s+"(openai|undici|axios|got|node-fetch|node:https?|node:net|node:tls)"/.test(source)
      )
        offenders.push(`${name}: transport import`);
      if (/https?:\/\//.test(source)) offenders.push(`${name}: url literal`);
      if (/\bgetAiProvider\s*\(/.test(source)) offenders.push(`${name}: getAiProvider`);
    }
    expect(offenders).toEqual([]);
  });

  it("makes no request when the whole boundary is driven with the stub", async () => {
    // The static scans above cover the source; this covers the run. If a future edit reached a
    // network by any route the regexes miss, this fails loudly instead of billing quietly.
    const fetchSpy = vi.fn(() => {
      throw new Error("the artwork boundary must not make a network request");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const budget = ArtworkBatchBudget.open({
      id: "boundary-test",
      batchCeilingUsd: 1,
      perRequestEstimateUsd: 0.25,
    });
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation: grant.reservation,
      provider: STUB_ARTWORK_PROVIDER,
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe("the production resolver", () => {
  const ENV_KEYS = [
    "ARTWORK_ENABLED",
    "ARTWORK_PROVIDER",
    "ARTWORK_MODEL",
    "ARTWORK_CEILING_USD",
    "VISUAL_ART_ENABLED",
    "NODE_ENV",
  ] as const;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws under every environment a deployment could plausibly set", () => {
    // The point is not that these names mean anything — it is that no name does. `getArtworkProvider`
    // has no branch, so the matrix can only ever produce the same refusal.
    for (const value of ["1", "true", "openai", "production", "yes", "100"]) {
      for (const key of ENV_KEYS) {
        vi.stubEnv(key, value);
        expect(() => getArtworkProvider()).toThrow(/No image provider is configured/);
      }
    }
  });

  it("explains that selecting a model is a locked-stack decision, not a setting", () => {
    expect(() => getArtworkProvider()).toThrow(/locked-stack decision/);
  });
});

describe("the intent contract, which this task did not edit", () => {
  it("has acquired no placement-shaped field", () => {
    // `contract.ts` declares the list; nothing was asserting it. The failure mode it describes is
    // gradual and looks reasonable each time — one aspect ratio "just so it fits".
    const fields = new Set<string>(VISUAL_ART_INTENT_FIELDS as readonly string[]);
    const trespass = FORBIDDEN_INTENT_FIELDS.filter((name) => fields.has(name));
    expect(trespass).toEqual([]);
  });

  it("still carries the five standing prohibitions", () => {
    expect(STANDING_PROHIBITIONS).toHaveLength(5);
    expect(STANDING_PROHIBITIONS.join(" ")).toMatch(/No text, lettering, numerals or captions/);
    expect(VISUAL_ART_INTENT_VERSION).toBe("visual_art_intent_v2");
  });
});
