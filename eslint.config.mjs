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
    ignores: ["src/app/**/event-site/**"],
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
  ]),
]);

export default eslintConfig;
