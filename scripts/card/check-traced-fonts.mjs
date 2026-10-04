#!/usr/bin/env node
/**
 * After `next build`: check that every server entry that measures or draws card text has the font
 * files and the HarfBuzz WASM traced into its function. Vercel bundles a function from exactly
 * these `.nft.json` traces, so a file missing here is missing in production (`ENOENT` at request
 * time), while every local test still passes.
 *
 * Add an entry here when it starts loading card or link-preview fonts (Phase 9's event routes). A
 * page's entry also carries the Server Actions it calls.
 *
 *   npm run build && npm run check:traced-fonts
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SERVER = path.join(ROOT, ".next/server");

const CARD_FONTS = "public/fonts/card";
const PREVIEW_FONTS = "src/lib/link-preview/fonts";

/** Entries that load fonts from disk, as their compiled entry under `.next/server`. */
const ENTRIES = [
  // Link previews: card text and the envelope's title.
  { entry: "app/dev/link-preview/route", fontDirs: [CARD_FONTS, PREVIEW_FONTS] },
  // The details form's Server Action (`updateEventDetails`): the card's entry fit check.
  { entry: "app/events/[id]/create/page", fontDirs: [CARD_FONTS] },
];

/**
 * HarfBuzz's WASM as the build traces it: from the package itself when `harfbuzzjs` is a server
 * external package (`next.config.ts`), or as an asset the bundler emitted beside the chunks.
 */
const HARFBUZZ_WASM = [
  /^node_modules\/harfbuzzjs\/dist\/harfbuzz\.wasm$/,
  /^\.next\/server\/(.*\/)?harfbuzz\.[^/]+\.wasm$/,
];

let failures = 0;
for (const { entry, fontDirs } of ENTRIES) {
  const traceFile = path.join(SERVER, `${entry}.js.nft.json`);
  if (!existsSync(traceFile)) {
    console.error(`${entry}: no trace at ${path.relative(ROOT, traceFile)} (run next build first)`);
    failures += 1;
    continue;
  }
  const traced = new Set(
    JSON.parse(readFileSync(traceFile, "utf8")).files.map((f) =>
      path.resolve(path.dirname(traceFile), f),
    ),
  );
  const wanted = fontDirs.flatMap((dir) =>
    readdirSync(path.join(ROOT, dir))
      .filter((f) => f.endsWith(".woff2"))
      .map((f) => path.join(ROOT, dir, f)),
  );
  const missing = wanted.filter((f) => !traced.has(f));
  const harfbuzz = [...traced].some(
    (f) =>
      HARFBUZZ_WASM.some((pattern) =>
        pattern.test(path.relative(ROOT, f).split(path.sep).join("/")),
      ) && existsSync(f),
  );
  for (const f of missing) console.error(`${entry}: not traced: ${path.relative(ROOT, f)}`);
  if (!harfbuzz) console.error(`${entry}: HarfBuzz WASM not traced`);
  failures += missing.length + (harfbuzz ? 0 : 1);
  if (missing.length === 0 && harfbuzz) {
    console.log(`${entry}: ${wanted.length} font files and the HarfBuzz WASM traced`);
  }
}

if (failures > 0) process.exit(1);
