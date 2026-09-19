import { defineConfig } from "vitest/config";

/**
 * The artwork spike's own vitest config.
 *
 * Separate from every other config so no project's `include` can sweep a file that spends money
 * into `npm test`. `VITEST_SMOKE_OPENAI_STUB` aliases the `openai` package to the offline stub, so
 * the whole path can be rehearsed at zero cost before the one paid call.
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
    include: [process.env.SPIKE_INCLUDE ?? "scripts/smoke/phase4e-artwork-spike.smoke.ts"],
    testTimeout: 20 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
