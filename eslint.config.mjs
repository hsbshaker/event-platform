import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Import boundaries. All three are single `no-restricted-imports` rules, so they must be
 * composed per file group rather than layered: in flat config a later `files` group replaces the
 * rule for the files it matches, it does not merge the options.
 */

/** App/event styling boundary — `docs/design-system.md §23.7`. */
const EVENT_TOKENS = {
  group: ["**/styles/event-tokens.css", "@/styles/event-tokens.css"],
  message: "Event-renderer tokens must not be imported into app chrome (design-system.md §23.7).",
};
const APP_CHROME = {
  group: [
    "@/components/app/*",
    "**/components/app/*",
    "**/styles/app-tokens.css",
    "@/styles/app-tokens.css",
  ],
  message: "App chrome must not leak into the event renderer (design-system.md §23.7).",
};

/**
 * Library Boundary Invariant — `docs/event-renderer-system.md §7.1`, `CLAUDE.md §5.1`.
 *
 * The 26 legacy hero silhouettes and 13 section recipes are fixtures, not the creative space.
 * Production compiles any valid model-authored CompositionTree and never selects, matches,
 * ranks, schedules or maps one onto a fixture. So the library is unreachable from production
 * source by default — not merely from the renderer directories — and exactly two adapters are
 * exempted, each for one documented role and nothing else:
 *
 * - `src/lib/renderer/recovery/**` — the deterministic repair macros of §3 and the terminal
 *   fallback after the documented retry is exhausted;
 * - `src/lib/renderer/few-shot/**` — the rotated library examples the composition prompt carries
 *   (§4). Normal generation consumes the CompositionTrees this adapter returns; it never learns
 *   which fixtures they came from, and the adapter exposes no recipe, silhouette or template
 *   identifier that could become a candidate-choice variable.
 *
 * Keeping these separate matters: `recovery/**` must not become the generic place a module goes
 * to reach the library, which is what would happen if few-shot retrieval lived there too.
 *
 * Tests and tooling are outside this rule on purpose — regression and expressiveness fixtures and
 * signature calibration are permitted roles under §7.1.
 *
 * This is lint rather than convention because the failure it prevents is silent: a template
 * system rebuilt one convenient import at a time would still pass every other test.
 */
const LEGACY_LIBRARY = {
  group: [
    "@/lib/renderer/library",
    "@/lib/renderer/library/*",
    "**/renderer/library",
    "**/renderer/library/*",
    "**/proof-b/library*",
    "**/proof-a1/*",
  ],
  message:
    "The legacy fixture library is not reachable from production source (event-renderer-system.md §7.1). Its two documented roles have their own adapters: repair macros and the terminal fallback in src/lib/renderer/recovery/**, rotated few-shot examples in src/lib/renderer/few-shot/**. Consume what an adapter returns; never import, enumerate, rank, match, schedule or select from the library itself.",
};

const restricted = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

const boundaryRules = [
  // The library is off-limits everywhere under src/ ...
  { files: ["src/**"], rules: restricted(LEGACY_LIBRARY) },
  {
    files: ["src/components/app/**", "src/app/**"],
    rules: restricted(LEGACY_LIBRARY, EVENT_TOKENS),
  },
  { files: ["src/components/event-renderer/**"], rules: restricted(LEGACY_LIBRARY, APP_CHROME) },
  // ... except in the two adapters, and in the tests that are a permitted role under §7.1.
  {
    files: ["src/lib/renderer/recovery/**", "src/lib/renderer/few-shot/**", "src/**/*.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaryRules,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "proof-b/**",
    "proof-a1/**",
    "docs/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
