import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // See tests/stubs/server-only.ts.
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    // No `include` here: each project below owns its own, so a suite never silently runs
    // another's files and every reported count means what it says.
    exclude: ["node_modules", ".next", "proof-b", "proof-a1"],
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
      {
        // Real model calls against a live provider. Never part of `npm test`: it costs
        // money and measures the creative stack rather than the compiler
        // (docs/model-contracts.md §4.5). Run it deliberately.
        extends: true,
        test: {
          name: "eval",
          include: ["tests/eval/**/*.eval.ts"],
          testTimeout: 15 * 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
