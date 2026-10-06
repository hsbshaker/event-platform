/**
 * Export chosen showcase cards for the landing (docs/design-system.md §4.1): each card PNG a live
 * run drew from stored data (`run-live.mjs --file scripts/showcase/sample-events.json
 * --transparent`) becomes a static WebP with its transparency, in `public/showcase/`.
 *
 *   node scripts/showcase/export.mjs <run-dir> <caseId>:<slug> [<caseId>:<slug> …]
 *
 * Prints one line per card (slug, width, height, design name) for `src/components/app/showcase.ts`.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [runDir, ...picks] = process.argv.slice(2);
if (!runDir || picks.length === 0) {
  console.error("usage: export.mjs <run-dir> <caseId>:<slug> …");
  process.exit(2);
}
const summary = JSON.parse(readFileSync(path.join(runDir, "summary.json"), "utf8"));
const out = path.resolve("public/showcase");
mkdirSync(out, { recursive: true });

/** Wide enough for the largest place a showcase card is drawn (the 3rd step, ~300px) at 2×. */
const WIDTH = 720;

for (const pick of picks) {
  const [id, slug] = pick.split(":");
  const row = summary.find((r) => r.id === id);
  if (!row?.png) throw new Error(`${id}: no card in ${runDir}`);
  const file = path.join(out, `${slug}.webp`);
  const info = await sharp(path.join(runDir, row.png))
    .resize({ width: WIDTH })
    .webp({ quality: 84, alphaQuality: 100 })
    .toFile(file);
  console.log(
    JSON.stringify({
      id,
      slug,
      width: info.width,
      height: info.height,
      bytes: info.size,
      name: row.design.name,
      description: row.design.description,
      prompt: row.prompt,
      title: row.design.title,
      invitationLine: row.design.invitationLine,
      shape: row.design.shape,
    }),
  );
}
