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
    exclude: ["node_modules", ".next"],
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
        // Layout fixtures: every layout × shape × pairing rendered and measured in Chromium
        // (docs/card-system.md §9). A test-time check only; production runs no browser.
        extends: true,
        test: {
          name: "fixtures",
          include: ["tests/fixtures/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 900_000,
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
        // The corpus through the production pipeline, live and metered: opt-in only, through
        // scripts/corpus/run-live.mjs (the test skips itself without LIVE_CORPUS=1).
        extends: true,
        test: {
          name: "live",
          include: ["tests/live/**/*.live.test.ts"],
          testTimeout: 3_600_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
