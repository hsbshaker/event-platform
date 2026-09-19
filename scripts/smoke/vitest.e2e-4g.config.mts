import { defineConfig } from "vitest/config";

/**
 * The Phase 4G end-to-end config.
 *
 * Its own file for the same reason every other smoke has one: no project's `include` may sweep a
 * file that spends money into `npm test`. `VITEST_SMOKE_OPENAI_STUB` aliases the `openai` package
 * so the whole run — interpretation, clarification, three concepts and any artwork — can be
 * rehearsed at zero cost before the one paid run.
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
    include: ["scripts/smoke/phase4g-e2e.smoke.ts"],
    testTimeout: 30 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
