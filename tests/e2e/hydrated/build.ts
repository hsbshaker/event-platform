import { writeFileSync } from "node:fs";
import path from "node:path";
import { build, type Rollup } from "vite";

/**
 * Bundles the harness with Vite — already a dependency, since vitest is built on it.
 *
 * Nothing here is shipped and nothing is downloaded. The one alias that matters is the server-action
 * module: the real one is `"use server"` and reaches a database, a session and T10, none of which a
 * browser test should have. Everything else — the panel, `ChoiceGroup`, `AppButton`, `InlineStatus`,
 * React itself — is the production code, bundled as it is written.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");

export async function buildHarness(): Promise<string> {
  const result = (await build({
    root: ROOT,
    // Explicit, because the caller's `NODE_ENV` decides it otherwise. Spawned from a vitest worker
    // that sets `NODE_ENV=test`, Vite picks the **development** JSX runtime, the bundle calls
    // `jsxDEV`, React's production build does not export it, and nothing mounts — silently.
    mode: "production",
    logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"' },
    resolve: {
      alias: [
        // The seam. Bundle time only, and only for this harness.
        {
          find: /^@\/app\/actions\/event-identity$/,
          replacement: path.join(ROOT, "tests/e2e/hydrated/actions-stub.ts"),
        },
        { find: /^@\//, replacement: path.join(ROOT, "src") + "/" },
      ],
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(ROOT, "tests/e2e/hydrated/entry.tsx"),
        formats: ["iife"],
        name: "IdentityHarness",
        fileName: () => "harness.js",
      },
    },
  })) as Rollup.RollupOutput[];

  const chunk = result[0].output.find((out) => out.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("harness bundle produced no chunk");
  return chunk.code;
}

/**
 * Built in a child process, not inside the test worker.
 *
 * Vitest is itself a Vite server, and calling `build()` from inside one of its workers deadlocks —
 * the run simply never finishes. A one-line CLI keeps the bundling in its own process where it
 * behaves like the ordinary build it is.
 */
if (process.argv[1] && process.argv[1].endsWith("build.ts")) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: build.ts <output file>");
  writeFileSync(out, await buildHarness(), "utf8");
}
