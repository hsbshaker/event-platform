/**
 * The Library Boundary Invariant, enforced mechanically.
 *
 * `docs/event-renderer-system.md §7.1` and `CLAUDE.md §5.1`: the 26 legacy hero silhouettes and
 * 13 section recipes are fixtures, not the creative space. Production compiles any valid
 * model-authored CompositionTree and never selects, matches, ranks, schedules or maps one onto a
 * fixture. The specific regression this guards is a template system rebuilt one convenient
 * import at a time — which would pass every other test in the suite.
 *
 * This runs the real `eslint.config.mjs` over synthetic modules at representative paths, so it
 * fails if the boundary is ever narrowed, whether by editing the rule or by adding a directory
 * the rule does not cover. The paths below are deliberately mostly *future* modules: the
 * boundary has to hold for code that does not exist yet, which is when it will actually be
 * tested.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof`; `spec.md §32` guardrails #14 and #15
 * (no template gallery; no addition to the composition language without a proof run).
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/renderer/composition/canonicalize";
import { resolveLayout } from "@/lib/renderer/composition/layout";
import type { Capabilities } from "@/lib/renderer/composition/nodes";
import { repair, type Macros } from "@/lib/renderer/composition/repair";
import { validateSchema } from "@/lib/renderer/composition/validate-schema";
import { validateStructure } from "@/lib/renderer/composition/validate-structure";
import { novelTree } from "../fixtures/novel-composition";

/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const L: any = createRequire(new URL("../../proof-b/", import.meta.url))("./library.js");
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every fixture identifier the library knows, in every spelling a leak could take. */
const LIBRARY_FIXTURE_IDS: string[] = [
  ...L.heroKeys,
  ...Object.keys(L.DETAILS),
  ...Object.keys(L.RSVPS),
  ...Object.keys(L.REGISTRIES),
  ...Object.keys(L.PLANS),
];

const eslint = new ESLint({ cwd: new URL("../../", import.meta.url).pathname });

/** Every spelling of a legacy-library import we can think of, static and re-exported. */
const IMPORTS = [
  'import { HEROES } from "@/lib/renderer/library";',
  'import { heroKeys } from "@/lib/renderer/library/heroes";',
  'import { HEROES } from "../../renderer/library";',
  'import { RSVPS } from "../renderer/library/sections";',
  'export * from "@/lib/renderer/library";',
  'export { HEROES } from "@/lib/renderer/library";',
];

async function libraryImportErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath, warnIgnored: false });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
}

/**
 * Paths that must not reach the library. `generation/` and `orchestration/` are the Phase 4
 * modules that will drive a real generation run; they are the ones most likely to want a
 * "just pick a hero" shortcut, and they are not under any renderer directory, so a rule scoped
 * to the compiler would miss them entirely.
 */
const FORBIDDEN_PATHS = [
  "src/lib/generation/orchestrator.ts",
  "src/lib/generation/concepts/generate-batch.ts",
  "src/lib/orchestration/run-concept-batch.ts",
  "src/lib/renderer/composition/repair.ts",
  "src/lib/renderer/compile/palette.ts",
  "src/lib/renderer/planner/siblings.ts",
  "src/lib/renderer/verify/geometry.ts",
  "src/components/event-renderer/Hero.tsx",
  "src/app/api/concepts/route.ts",
  "src/app/actions/generate.ts",
  "src/lib/ai/provider.ts",
];

/** The two adapters, each for one documented role under §7.1. */
const ADAPTER_PATHS = [
  "src/lib/renderer/recovery/fallback.ts",
  "src/lib/renderer/recovery/macros.ts",
  "src/lib/renderer/few-shot/examples.ts",
];

describe("Library Boundary Invariant", () => {
  it.each(FORBIDDEN_PATHS)("%s cannot import the legacy library", async (filePath) => {
    for (const statement of IMPORTS) {
      const errors = await libraryImportErrors(filePath, `${statement}\nexport const x = 1;\n`);
      expect(
        errors.length,
        `${filePath} was allowed to "${statement}". The legacy fixture library must stay ` +
          `unreachable from production source (event-renderer-system.md §7.1).`,
      ).toBeGreaterThan(0);
    }
  });

  it.each(ADAPTER_PATHS)("%s is exempt, because §7.1 gives it a role", async (filePath) => {
    for (const statement of IMPORTS) {
      const errors = await libraryImportErrors(filePath, `${statement}\nexport const x = 1;\n`);
      expect(errors, `${filePath} should be allowed to "${statement}"`).toEqual([]);
    }
  });

  it("exempts exactly two adapter directories, so recovery/ cannot absorb few-shot retrieval", async () => {
    // A few-shot module placed under recovery/ would make recovery/ the generic place a module
    // goes to reach the library. The two roles stay in two directories, and the exemption is
    // spelled directory by directory so widening it to `src/lib/renderer/**` fails here.
    const severity = async (filePath: string) => {
      const config = (await eslint.calculateConfigForFile(filePath)) as {
        rules?: Record<string, [number, ...unknown[]]>;
      };
      return config.rules?.["no-restricted-imports"]?.[0];
    };
    expect(await severity("src/lib/renderer/recovery/fallback.ts")).toBe(0);
    expect(await severity("src/lib/renderer/few-shot/examples.ts")).toBe(0);
    expect(await severity("src/lib/renderer/compile/index.ts")).toBe(2);
    expect(await severity("src/lib/generation/orchestrator.ts")).toBe(2);

    // Read the exemption structurally rather than by resolved severity: the point is that it is
    // spelled directory by directory, so widening it to `src/lib/renderer/**` fails here.
    const config = (await import("../../eslint.config.mjs")).default as {
      files?: string[];
      rules?: Record<string, unknown>;
    }[];
    const exempt = config.filter((entry) => entry.rules?.["no-restricted-imports"] === "off");
    expect(exempt).toHaveLength(1);
    expect(exempt[0].files).toEqual([
      "src/lib/renderer/recovery/**",
      "src/lib/renderer/few-shot/**",
      // Regression, expressiveness and signature calibration are permitted roles under §7.1.
      "src/**/*.test.ts",
    ]);
  });

  it("still forbids app chrome in the renderer and event tokens in app chrome", async () => {
    // These predate the library rule and share the same single ESLint rule, so a careless
    // composition of the three silently drops one. It has happened once already.
    const inRenderer = await libraryImportErrors(
      "src/components/event-renderer/Hero.tsx",
      'import { Button } from "@/components/app/button";\nexport const x = 1;\n',
    );
    expect(inRenderer.length).toBeGreaterThan(0);

    const inApp = await libraryImportErrors(
      "src/app/page.tsx",
      'import "@/styles/event-tokens.css";\nexport const x = 1;\n',
    );
    expect(inApp.length).toBeGreaterThan(0);
  });
});

/**
 * The runtime half of the invariant: handling a valid, novel, model-authored CompositionTree —
 * one with no counterpart in the library — never reaches either adapter.
 *
 * Lint proves the normal path *cannot* import the library. This proves it does not *want* to:
 * the repair macros are the one hook by which the library can enter a compile, and a clean tree
 * never pulls it.
 */
describe("the normal path invokes neither adapter", () => {
  const FULL_CAPS: Capabilities = {
    rsvp: true,
    registry: true,
    gifts: true,
    externalRegistry: true,
    cashFund: true,
    hosts: true,
    description: true,
    time: true,
    location: true,
    deadline: true,
  };

  /** Macros that make any library entry an immediate, loud failure. */
  const forbiddenMacros: Macros = {
    hero: () => {
      throw new Error("the hero repair macro was invoked for a clean novel tree");
    },
    rsvpSection: () => {
      throw new Error("the rsvp repair macro was invoked for a clean novel tree");
    },
    registrySection: () => {
      throw new Error("the registry repair macro was invoked for a clean novel tree");
    },
  };

  it("validates, repairs, canonicalizes and resolves a novel tree without a macro call", () => {
    const tree = novelTree();
    expect(validateSchema(tree).ok).toBe(true);
    expect(validateStructure(tree, FULL_CAPS)).toEqual([]);

    const repaired = repair(tree, FULL_CAPS, 7, forbiddenMacros);
    expect(repaired.repairs).toEqual([]);
    expect(repaired.remaining).toEqual([]);

    const canon = canonicalize(repaired.tree);
    expect(Object.keys(resolveLayout(canon.tree, "balanced")).length).toBeGreaterThan(0);
  });

  it("carries no fixture identifier through the pipeline", () => {
    const canon = canonicalize(repair(novelTree(), FULL_CAPS, 7, forbiddenMacros).tree);
    const serialized = JSON.stringify(canon.tree);
    for (const id of [...LIBRARY_FIXTURE_IDS]) expect(serialized.includes(id)).toBe(false);
  });

  it("the composition core's own source never names an adapter or the library", () => {
    // The core is the normal path. Lint covers imports; this covers a lazy `await import` or a
    // string path that would slip past it.
    const dir = new URL("../../src/lib/renderer/composition/", import.meta.url).pathname;
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    )) {
      // Strip comments: the core's header prose legitimately explains what it must not depend on.
      const source = readFileSync(path.join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const forbidden of [
        "renderer/library",
        "../library",
        "./library",
        "few-shot",
        "recovery/",
      ]) {
        expect(source.includes(forbidden), `${file} names "${forbidden}"`).toBe(false);
      }
    }
  });
});
