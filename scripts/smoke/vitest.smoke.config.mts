import { defineConfig } from "vitest/config";

/**
 * The smoke's own vitest config.
 *
 * Separate from `vitest.config.mts` so no project's `include` can sweep a file that spends money
 * into `npm test`. Mirrors the repo config's aliases and nothing else.
 *
 * `VITEST_SMOKE_OPENAI_STUB`, when set, aliases the `openai` package to a local transport stub, so
 * the whole path below the provider — every adapter, the compiler, geometry verification,
 * persistence and the screenshot pass — can be rehearsed at zero cost before the one paid run.
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
    include: ["scripts/smoke/phase4d-live-smoke.smoke.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
