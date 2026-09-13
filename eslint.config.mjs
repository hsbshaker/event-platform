import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * App/event boundary lint — docs/design-system.md §23.7.
 * App chrome never imports renderer styling; the renderer never imports app chrome.
 */
const boundaryRules = [
  {
    files: ["src/components/app/**", "src/app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/styles/event-tokens.css", "@/styles/event-tokens.css"],
              message:
                "Event-renderer tokens must not be imported into app chrome (design-system.md §23.7).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/event-renderer/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/components/app/*",
                "**/components/app/*",
                "**/styles/app-tokens.css",
                "@/styles/app-tokens.css",
              ],
              message: "App chrome must not leak into the event renderer (design-system.md §23.7).",
            },
          ],
        },
      ],
    },
  },
];

/**
 * Library Boundary Invariant — docs/event-renderer-system.md §7.1, CLAUDE.md §5.1.
 *
 * The 26 legacy hero silhouettes and 13 section recipes are fixtures, not the creative space.
 * Production compiles any valid model-authored CompositionTree and never selects, matches,
 * ranks, schedules or maps one onto a fixture. So the normal composition and compiler modules
 * may not reach the library at all; the few paths the renderer doc does permit — the specified
 * repair macros and the terminal fallback after the documented retry — live behind
 * `src/lib/renderer/recovery/**`, which is the one place allowed to import it.
 *
 * This is lint rather than convention because the failure it prevents is silent: a template
 * system rebuilt one convenient import at a time would still pass every other test.
 */
const libraryBoundaryRules = [
  {
    files: [
      "src/lib/renderer/composition/**",
      "src/lib/renderer/compile/**",
      "src/lib/renderer/planner/**",
      "src/components/event-renderer/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/renderer/library",
                "@/lib/renderer/library/*",
                "**/renderer/library",
                "**/renderer/library/*",
                "**/proof-b/library*",
                "**/proof-a1/*",
              ],
              message:
                "The legacy fixture library must not be reachable from the normal composition, compiler, planner or renderer path (event-renderer-system.md §7.1). Repair macros and the terminal fallback live in src/lib/renderer/recovery/**, which is the only approved boundary.",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaryRules,
  ...libraryBoundaryRules,
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
