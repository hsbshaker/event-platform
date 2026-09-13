/**
 * Captures the reference implementation's deterministic output as golden fixtures.
 *
 * Phase 3 is a port of `proof-b/` "without behaviour change"
 * (docs/development-plan.md). That claim is only worth anything if it is measurable, so
 * before any production code exists we record exactly what the reference produces for every
 * input the regression suite uses: the library silhouettes and section recipes, the A.1 pages,
 * the adversarial fixtures, and the 72 frozen confirmation trees.
 *
 * The production engine is then held to these byte for byte. Nothing here imports production
 * code, and nothing in proof-b is modified — this only reads.
 *
 * Usage: node scripts/renderer/capture-golden.mjs [outDir]
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(new URL("../../proof-b/", import.meta.url));
const C = require("./dist/composition.js");
const L = require("./library.js");
const A = require("./fixtures/adversarial.js");
const { compile, FULL_CAPS, REDUCED_CAPS } = require("./compile.js");

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = path.resolve(ROOT, process.argv[2] ?? "tests/fixtures/renderer-golden");
const PROOF = path.join(ROOT, "proof-b");

/** Stable stringify: the oracle must not depend on key insertion order. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable(value[k])]),
    );
  }
  return value;
}

function write(name, data) {
  const file = path.join(OUT, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(stable(data), null, 1) + "\n");
  return file;
}

mkdirSync(OUT, { recursive: true });
const index = { capturedFrom: "proof-b", files: [] };

// 1. The library: every silhouette and recipe, validated and canonicalized.
const heroes = {};
for (const key of L.heroKeys) {
  const tree = {
    version: "composition_v1",
    sections: [
      { kind: "hero", surface: "base", root: L.HEROES[key]() },
      { kind: "rsvp", surface: "base", root: L.RSVPS.rsvp_typographic_stack() },
      { kind: "registry", surface: "alt", root: L.REGISTRIES.registry_tiles() },
    ],
  };
  const canon = C.canonicalize(tree);
  heroes[key] = {
    schemaOk: C.validateSchema(tree).ok,
    structureViolations: C.validateStructure(tree, FULL_CAPS),
    canonicalHash: canon.hash,
    canonical: canon.tree,
    skeletonDesktop: C.skeleton(tree, "desktop"),
    skeletonMobile: C.skeleton(tree, "mobile"),
  };
}
index.files.push(write("library-heroes.json", heroes));

// All 13 section recipes: details (4) + rsvp (5) + registry (4).
const sections = {};
for (const [group, table] of [
  ["details", L.DETAILS],
  ["rsvp", L.RSVPS],
  ["registry", L.REGISTRIES],
]) {
  for (const key of Object.keys(table)) {
    sections[`${group}:${key}`] = C.canonicalize({
      version: "composition_v1",
      sections: [
        { kind: "hero", surface: "base", root: L.HEROES[L.heroKeys[0]]() },
        { kind: group, surface: "base", root: table[key]() },
      ],
    });
  }
}
index.files.push(write("library-sections.json", sections));

// 2. The A.1 pages: canonicalization must be idempotent and the hash stable.
const pages = {};
for (const row of L.A1_SITES) {
  const tree = L.page(row[1], row[2], row[3], row[4], row[5], row[6]);
  const once = C.canonicalize(tree);
  const twice = C.canonicalize(once.tree);
  pages[row[0]] = {
    schemaOk: C.validateSchema(tree).ok,
    structureViolations: C.validateStructure(tree, FULL_CAPS),
    hash: once.hash,
    idempotent: once.hash === twice.hash,
    canonical: once.tree,
  };
}
index.files.push(write("library-pages.json", pages));

// 3. Adversarial fixtures: what each violates, and exactly how repair resolves it.
const schemaInvalid = A.schemaInvalid.map((f) => ({
  name: f.name,
  result: C.validateSchema(f.tree),
}));
index.files.push(write("adversarial-schema-invalid.json", schemaInvalid));

const structural = A.structural.map((f) => {
  const caps = f.caps || FULL_CAPS;
  const before = C.validateStructure(f.tree, caps);
  const repaired = C.repair(f.tree, caps, 7);
  return {
    name: f.name,
    violationsBefore: before,
    repairs: repaired.repairs,
    remaining: repaired.remaining,
    repairedSchemaOk: C.validateSchema(repaired.tree).ok,
    repairedTree: repaired.tree,
  };
});
index.files.push(write("adversarial-structural.json", structural));

// 4. The 72 frozen confirmation trees, compiled end to end short of geometry verification.
for (const [set, caps] of [
  ["final", FULL_CAPS],
  ["final-reduced", REDUCED_CAPS],
]) {
  const dir = path.join(PROOF, "model", set, "raw");
  const results = JSON.parse(
    readFileSync(path.join(PROOF, "model", set, "results-verified.json"), "utf8"),
  );
  const byId = new Map(results.map((r) => [String(r.id), r]));
  const compiled = {};
  for (const file of readdirSync(dir).sort()) {
    const id = file.replace(/\.txt$/, "");
    const source = readFileSync(path.join(dir, file), "utf8");
    const match = source.match(/\{[\s\S]*\}/);
    if (!match) continue;
    let raw;
    try {
      raw = JSON.parse(match[0]);
    } catch {
      compiled[id] = { unparseable: true };
      continue;
    }
    const recorded = byId.get(id) ?? byId.get(id.split("-")[0]);
    if (!recorded?.spec?.designIntent) {
      compiled[id] = { skipped: "no recorded designIntent" };
      continue;
    }
    compiled[id] = compile({
      raw,
      caps,
      designIntent: recorded.spec.designIntent,
      pageSystem: recorded.spec.pageSystem,
      seed: recorded.spec.seed ?? 1,
      id,
    });
  }
  index.files.push(write(`frozen-${set}.json`, compiled));
}

index.files = index.files.map((f) => path.relative(ROOT, f));
write("index.json", index);
console.log(`captured ${index.files.length} golden files into ${path.relative(ROOT, OUT)}`);
for (const f of index.files) console.log("  " + f);
