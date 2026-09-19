import { defineConfig } from "vitest/config";

/**
 * The placement-hardening run's own config.
 *
 * Separate from every other config so no project's `include` sweeps a browser-driving file into
 * `npm test`. Unlike the capability spike's config this has no `openai` alias and needs none: the
 * run makes no provider call and imports no SDK.
 */
const root = new URL("../..", import.meta.url).pathname;

export default defineConfig({
  root,
  resolve: {
    alias: { "@": `${root}/src`, "server-only": `${root}/tests/stubs/server-only.ts` },
  },
  test: {
    environment: "node",
    include: ["scripts/smoke/phase4e-placement-hardening.smoke.ts"],
    testTimeout: 20 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
