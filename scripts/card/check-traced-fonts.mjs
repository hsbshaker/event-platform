#!/usr/bin/env node
/**
 * After `next build`: check that every server route that measures or draws card text has the font
 * files and the HarfBuzz WASM traced into its function. Vercel bundles a function from exactly
 * these `.nft.json` traces, so a file missing here is missing in production (`ENOENT` at request
 * time), while every local test still passes.
 *
 * Add a route here when it starts loading card or link-preview fonts (Phase 9's event routes).
 *
 *   npm run build && npm run check:traced-fonts
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SERVER = path.join(ROOT, ".next/server");

/** Routes that load fonts from disk, as their compiled entry under `.next/server`. */
const ROUTES = ["app/dev/link-preview/route"];

const FONT_DIRS = ["public/fonts/card", "src/lib/link-preview/fonts"];

const wanted = FONT_DIRS.flatMap((dir) =>
  readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".woff2"))
    .map((f) => path.join(ROOT, dir, f)),
);

let failures = 0;
for (const route of ROUTES) {
  const traceFile = path.join(SERVER, `${route}.js.nft.json`);
  if (!existsSync(traceFile)) {
    console.error(`${route}: no trace at ${path.relative(ROOT, traceFile)} (run next build first)`);
    failures += 1;
    continue;
  }
  const traced = new Set(
    JSON.parse(readFileSync(traceFile, "utf8")).files.map((f) =>
      path.resolve(path.dirname(traceFile), f),
    ),
  );
  const missing = wanted.filter((f) => !traced.has(f));
  const harfbuzz = [...traced].some((f) => /harfbuzz[^/]*\.wasm$/.test(f));
  for (const f of missing) console.error(`${route}: not traced: ${path.relative(ROOT, f)}`);
  if (!harfbuzz) console.error(`${route}: HarfBuzz WASM not traced`);
  failures += missing.length + (harfbuzz ? 0 : 1);
  if (missing.length === 0 && harfbuzz) {
    console.log(`${route}: ${wanted.length} font files and the HarfBuzz WASM traced`);
  }
}

if (failures > 0) process.exit(1);
