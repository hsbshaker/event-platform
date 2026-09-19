import { defineConfig } from "vitest/config";
const root = new URL("../..", import.meta.url).pathname;
export default defineConfig({
  root,
  resolve: { alias: { "@": `${root}/src`, "server-only": `${root}/tests/stubs/server-only.ts` } },
  test: {
    environment: "node",
    include: [process.env.CONSTRAINT_CHECK ?? "scripts/smoke/constraint-check.smoke.ts"],
  },
});
