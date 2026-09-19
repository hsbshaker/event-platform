import { defineConfig } from "vitest/config";

/**
 * The Phase 4E full-smoke config.
 *
 * Separate from every other config so no project's `include` can sweep a file that spends money
 * into `npm test`. `VITEST_SMOKE_OPENAI_STUB` aliases the `openai` package to an offline stub, so
 * the whole pipeline — text stages and image stage alike — can be rehearsed at zero cost before the
 * one paid run.
 */
const root = new URL("../..", import.meta.url).pathname;
const stub = process.env.VITEST_SMOKE_OPENAI_STUB;

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": `${root}/src`,
      "server-only": `${root}/tests/stubs/server-only.ts`,
      ...(stub ? { openai: stub } : {}),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/smoke/phase4e-full-smoke.smoke.ts"],
    testTimeout: 30 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
