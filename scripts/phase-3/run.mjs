/**
 * Phase 3 model validation runner (docs/development-plan.md, Phase 3; docs/model-evals/phase-3-validation.md).
 *
 *   node --experimental-strip-types scripts/phase-3/run.mjs <stage> [caseId...]
 *
 * Stages: identity · design · art · switch · summary. Each stage reads the previous stage's
 * outputs from PHASE3_OUT (default .phase-3-out/) and skips cases already done, so a stage can be
 * re-run after a failure without paying twice.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import sharp from "sharp";

import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "../../src/lib/card/typography.ts";
import {
  structured,
  generateImage,
  moderateImage,
  readJson,
  writeJson,
  pool,
  readLedger,
  MODELS,
  OUT_DIR,
} from "./lib.mjs";
import {
  LAYOUTS,
  SHAPES,
  ART_MODES,
  RASTER,
  assembleArtPrompt,
  fitsShapes,
  cropShapeFor,
} from "./catalog.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const doc = (p) => readFileSync(path.join(ROOT, p), "utf8");

const corpus = JSON.parse(doc("docs/model-evals/creative-understanding.json"));

/** The owner's own briefs from the first ChatGPT test (CHANGELOG-v7.md), outside the 14-case bar. */
const OWNER_CASES = [
  {
    id: "O-01",
    prompt:
      "Spring engagement brunch at a garden venue. Romantic and fresh with soft florals, citrus, warm cream, sage and a little terracotta. Elegant but relaxed — not rustic farmhouse, not overly formal, and definitely not generic wedding-template vibes.",
    facts: { eventType: "engagement brunch" },
    mustAvoid: ["rustic farmhouse", "generic wedding-template"],
  },
  {
    id: "O-02",
    prompt:
      "Baby shower that's Ralph Lauren bear themed, dark navys and browns, not overly baby but still says this is for a baby shower.",
    facts: { eventType: "baby shower" },
    mustAvoid: [
      "any Ralph Lauren logo, wordmark or crest",
      "the brand name in the brief or artwork",
    ],
  },
];

const CASES = [...corpus.cases, ...OWNER_CASES];
const BRAND_TERMS = [
  "ralph lauren",
  "polo",
  "lauren",
  "winnie",
  "pooh",
  "disney",
  "hundred acre",
  "eeyore",
  "piglet",
  "tigger",
];
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// ajv 6 (already installed via eslint) speaks draft-07; these schemas use only draft-07 keywords.
const ajv = new Ajv({ allErrors: true });
const compile = (schema) => {
  const rest = { ...schema };
  delete rest.$schema;
  delete rest.$id;
  return ajv.compile(rest);
};

const caseDir = (id) => path.join(OUT_DIR, id);
const out = (id, file) => path.join(caseDir(id), file);
const has = (id, file) => existsSync(out(id, file));

function selected(args) {
  return args.length ? CASES.filter((c) => args.includes(c.id)) : CASES;
}

function brandHits(text) {
  const t = text.toLowerCase();
  return BRAND_TERMS.filter((b) => new RegExp(`\\b${b}\\b`).test(t));
}

// ---------------------------------------------------------------------------------------------
// Stage 1: Event Identity (gpt-6.1-sol) ∥ fact extraction (gpt-6-luna)

const identitySchema = JSON.parse(doc("docs/model-schemas/event-identity.schema.json"));
const identityPrompt = doc("docs/model-prompts/event-identity.system.md");
const validateIdentity = compile(identitySchema);
const CATEGORIES = [...new Set(Object.values(TYPOGRAPHY).map((p) => p.category))];

const FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "eventType",
    "title",
    "hosts",
    "honoree",
    "date",
    "time",
    "venue",
    "location",
    "partial",
  ],
  properties: {
    eventType: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    hosts: { type: ["string", "null"] },
    honoree: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    time: { type: ["string", "null"] },
    venue: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    partial: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "text"],
        properties: { field: { type: "string" }, text: { type: "string" } },
      },
    },
  },
};

function checkFacts(c, facts) {
  const problems = [];
  const values = Object.entries(facts)
    .filter(([k, v]) => k !== "partial" && v !== null)
    .map(([k, v]) => [k, v]);
  for (const p of facts.partial) values.push([`partial.${p.field}`, p.text]);
  for (const [k, v] of values) {
    if (!c.prompt.includes(v)) problems.push(`${k} "${v}" is not verbatim in the prompt`);
  }
  const all = values.map(([, v]) => v);
  for (const [k, v] of Object.entries(c.facts)) {
    if (!all.includes(v)) problems.push(`expected fact ${k} "${v}" not extracted verbatim`);
  }
  if (c.id === "CU-12" && facts.date) problems.push(`invented a date "${facts.date}" from a month`);
  return problems;
}

function checkIdentity(c, identity) {
  const problems = [];
  const motifs = identity.visualMotifs.join(" | ");
  const hits = brandHits(motifs);
  if (hits.length) problems.push(`brand/character name in visualMotifs: ${hits.join(", ")}`);
  if (c.id === "CU-05") {
    const warm = [
      ...identity.paletteIntent.requiredColors,
      ...identity.paletteIntent.preferredColors,
      ...identity.visualMotifs,
    ]
      .join(" ")
      .toLowerCase();
    for (const w of ["pink", "blush", "rose", "fuchsia", "magenta"])
      if (warm.includes(w)) problems.push(`"${w}" outside avoidColors`);
  }
  const text = JSON.stringify(identity);
  const factStrings = Object.entries(c.facts)
    .filter(([k]) => !["eventType", "monthHint"].includes(k))
    .map(([, v]) => v);
  for (const f of factStrings)
    if (text.includes(f)) problems.push(`identity repeats the fact "${f}"`);
  if (c.id === "CU-03")
    for (const p of ["Positano", "Amalfi", "Sorrento", "Capri"])
      if (text.includes(p)) problems.push(`inferred place "${p}"`);
  return problems;
}

async function stageIdentity(args) {
  await pool(selected(args), 6, async (c) => {
    if (has(c.id, "identity.json") && has(c.id, "facts.json")) return;
    const content = JSON.stringify({
      eventPrompt: c.prompt,
      redesignFeedback: null,
      inspiration: [],
      runtimeCatalog: { typographyCategories: CATEGORIES },
    });
    const [identity, facts] = await Promise.all([
      (async () => {
        let attempt = await structured({
          model: MODELS.text,
          instructions: identityPrompt,
          content,
          schemaName: "EventIdentity",
          schema: identitySchema,
          label: `${c.id} identity`,
        });
        let valid = attempt.value && validateIdentity(attempt.value);
        let reprompted = false;
        if (attempt.value && !valid) {
          reprompted = true;
          attempt = await structured({
            model: MODELS.text,
            instructions: identityPrompt,
            content: `${content}\n\nYour previous output failed validation: ${ajv.errorsText(validateIdentity.errors)}. Return a corrected object.`,
            schemaName: "EventIdentity",
            schema: identitySchema,
            label: `${c.id} identity re-prompt`,
          });
          valid = attempt.value && validateIdentity(attempt.value);
        }
        return {
          ...attempt,
          valid,
          reprompted,
          errors: valid ? null : ajv.errorsText(validateIdentity.errors),
        };
      })(),
      structured({
        model: MODELS.facts,
        instructions: doc("docs/model-prompts/fact-extraction.system.md"),
        content: c.prompt,
        schemaName: "EventFacts",
        schema: FACTS_SCHEMA,
        label: `${c.id} facts`,
        effort: null,
      }),
    ]);
    writeJson(out(c.id, "identity.json"), {
      identity: identity.value,
      valid: identity.valid,
      reprompted: identity.reprompted,
      errors: identity.errors,
      refusal: identity.refusal ?? null,
      ms: identity.ms,
      costUsd: identity.costUsd,
      checks: identity.value ? checkIdentity(c, identity.value) : ["no identity"],
    });
    writeJson(out(c.id, "facts.json"), {
      facts: facts.value,
      ms: facts.ms,
      costUsd: facts.costUsd,
      checks: facts.value ? checkFacts(c, facts.value) : ["no facts"],
    });
    console.log(
      `${c.id} identity ${identity.ms}ms  facts ${facts.ms}ms  spent $${readLedger().spentUsd.toFixed(3)}`,
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Stage 2: Card Design (gpt-6.1-sol)

const TITLE = { min: 2, max: 40 };
const LINE = { min: 8, max: 72 };

export function cardDesignSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://event-platform.local/schemas/card-design.schema.json",
    title: "CardDesign",
    description:
      "card_design_schema_v1 (model-contracts.md §5). Enums are generated from the card catalogs: the draft card_layouts_v1 (scripts/phase-3/catalog.mjs until Phase 4 makes it product code) and src/lib/card/typography.ts.",
    type: "object",
    additionalProperties: false,
    required: ["presentation", "shape", "layout", "artMode", "typography", "wording", "artBrief"],
    properties: {
      presentation: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 40 },
          description: { type: "string", minLength: 10, maxLength: 140 },
        },
      },
      shape: { type: "string", enum: Object.keys(SHAPES) },
      layout: { type: "string", enum: Object.keys(LAYOUTS) },
      artMode: { type: "string", enum: Object.keys(ART_MODES) },
      typography: {
        type: "object",
        additionalProperties: false,
        required: ["primary", "alternates"],
        properties: {
          primary: { type: "string", enum: [...TYPOGRAPHY_KEYS] },
          alternates: {
            type: "array",
            maxItems: 2,
            uniqueItems: true,
            items: { type: "string", enum: [...TYPOGRAPHY_KEYS] },
          },
        },
      },
      wording: {
        type: "object",
        additionalProperties: false,
        required: ["title", "invitationLine"],
        properties: {
          title: { type: "string", minLength: TITLE.min, maxLength: TITLE.max },
          invitationLine: { type: "string", minLength: LINE.min, maxLength: LINE.max },
        },
      },
      artBrief: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "medium", "mood", "palette", "texture", "avoid"],
        properties: {
          subject: { type: "string", minLength: 8, maxLength: 300 },
          medium: { type: "string", minLength: 4, maxLength: 160 },
          mood: { type: "string", minLength: 3, maxLength: 160 },
          palette: {
            type: "object",
            additionalProperties: false,
            required: ["description", "colors"],
            properties: {
              description: { type: "string", minLength: 3, maxLength: 200 },
              colors: {
                type: "array",
                minItems: 3,
                maxItems: 5,
                items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              },
            },
          },
          texture: { type: "string", minLength: 3, maxLength: 160 },
          avoid: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 2, maxLength: 120 },
          },
        },
      },
    },
  };
}

const designSchema = cardDesignSchema();
const validateDesign = compile(designSchema);
const designPrompt = doc("docs/model-prompts/card-design.system.md");

function runtimeCatalog(identity) {
  const allowed = new Set(identity.compatibleTypographyCategories);
  return {
    shapes: Object.fromEntries(
      Object.entries(SHAPES).map(([k, s]) => [k, `${s.proportion}, ${s.outline}`]),
    ),
    layouts: Object.fromEntries(
      Object.entries(LAYOUTS).map(([k, l]) => [
        k,
        { purpose: l.purpose, supportedShapes: l.shapes, compatibleArtModes: l.artModes },
      ]),
    ),
    artModes: ART_MODES,
    typographyPairings: Object.fromEntries(
      Object.entries(TYPOGRAPHY)
        .filter(([, p]) => allowed.has(p.category))
        .map(([k, p]) => [k, `${p.category}: ${p.display} (display) + ${p.body} (body)`]),
    ),
    wordingLimits: { title: TITLE, invitationLine: LINE },
  };
}

/** Deterministic checks after the schema (card-system.md §4.1). Returns { kind, problems }. */
function checkDesign(c, design, identity) {
  const problems = [];
  const L = LAYOUTS[design.layout];
  if (!L.shapes.includes(design.shape))
    problems.push(`layout ${design.layout} does not support shape ${design.shape}`);
  if (!L.artModes.includes(design.artMode))
    problems.push(`art mode ${design.artMode} is not compatible with layout ${design.layout}`);
  if (design.typography.alternates.includes(design.typography.primary))
    problems.push("an alternate repeats the primary pairing");
  const allowed = new Set(identity.compatibleTypographyCategories);
  for (const p of [design.typography.primary, ...design.typography.alternates]) {
    if (!allowed.has(TYPOGRAPHY[p].category))
      problems.push(`pairing ${p} is outside the identity's categories`);
  }
  if (problems.length) return { kind: "schema", problems };

  const wording = [];
  for (const slot of ["title", "invitationLine"]) {
    const v = design.wording[slot];
    const lower = v.toLowerCase();
    if (/\d/.test(v)) wording.push(`${slot} contains a digit`);
    // "may" is left out: as a word it is far more often a verb, and a May date needs a digit anyway.
    for (const m of MONTHS.filter((x) => x !== "may"))
      if (new RegExp(`\\b${m}\\b`).test(lower)) wording.push(`${slot} names a month (${m})`);
    for (const d of WEEKDAYS) if (lower.includes(d)) wording.push(`${slot} names a weekday (${d})`);
    if (/\b(a\.?m\.?|p\.?m\.?|noon|o'clock|midnight)\b/.test(lower))
      wording.push(`${slot} contains a time expression`);
    for (const [k, f] of Object.entries(c.facts)) {
      if (k !== "eventType" && lower.includes(f.toLowerCase()))
        wording.push(`${slot} states the fact ${k}`);
    }
    const b = brandHits(v);
    if (b.length) wording.push(`${slot} names a brand or character (${b.join(", ")})`);
  }
  const briefBrands = brandHits(JSON.stringify(design.artBrief));
  if (briefBrands.length)
    wording.push(`art brief names a brand or character (${briefBrands.join(", ")})`);
  return { kind: wording.length ? "wording" : null, problems: wording };
}

async function stageDesign(args) {
  await pool(selected(args), 6, async (c) => {
    if (has(c.id, "design.json")) return;
    const { identity } = readJson(out(c.id, "identity.json"));
    const eventFacts = { ...c.facts };
    const input = { eventIdentity: identity, eventFacts, runtimeCatalog: runtimeCatalog(identity) };
    let attempt = await structured({
      model: MODELS.text,
      instructions: designPrompt,
      content: JSON.stringify(input),
      schemaName: "CardDesign",
      schema: designSchema,
      label: `${c.id} design`,
    });
    const log = [];
    let design = attempt.value;
    let schemaOk = design && validateDesign(design);
    let check = schemaOk
      ? checkDesign(c, design, identity)
      : { kind: "schema", problems: [ajv.errorsText(validateDesign.errors)] };
    let ms = attempt.ms;
    let cost = attempt.costUsd;
    if (check.kind) {
      log.push({ attempt: 1, ...check, design });
      attempt = await structured({
        model: MODELS.text,
        instructions: designPrompt,
        content: JSON.stringify({
          ...input,
          reprompt: { kind: check.kind, feedback: check.problems.join("; ") },
        }),
        schemaName: "CardDesign",
        schema: designSchema,
        label: `${c.id} design re-prompt`,
      });
      ms += attempt.ms;
      cost += attempt.costUsd;
      design = attempt.value;
      schemaOk = design && validateDesign(design);
      check = schemaOk
        ? checkDesign(c, design, identity)
        : { kind: "schema", problems: [ajv.errorsText(validateDesign.errors)] };
    }
    writeJson(out(c.id, "design.json"), {
      design,
      ok: !check.kind,
      firstAttemptOk: log.length === 0,
      failures: log,
      finalProblems: check.problems,
      ms,
      costUsd: cost,
      artPrompt: design ? assembleArtPrompt(design) : null,
    });
    console.log(
      `${c.id} design ${design?.shape}/${design?.layout}/${design?.artMode} ${check.kind ? "FAILED " + check.problems.join("; ") : "ok"} $${readLedger().spentUsd.toFixed(3)}`,
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Stage 3: artwork (gpt-image-2.5-sunburst) + validation

const ART_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hasText", "textDescription", "hasLogoOrBrandMark", "isMockup", "description"],
  properties: {
    hasText: { type: "boolean" },
    textDescription: { type: "string" },
    hasLogoOrBrandMark: { type: "boolean" },
    isMockup: { type: "boolean" },
    description: { type: "string" },
  },
};

const ART_CHECK_PROMPT = `You are a strict print-production inspector. You are shown one piece of artwork for the front of an invitation card; typeset text will be added later by software, so the artwork itself must contain none.

Report:
- hasText: true if ANY text-like marks appear anywhere — letters, words, numbers, initials, monograms, signatures, labels, captions, lettering on objects, or pseudo-text squiggles that read as writing — however small or decorative.
- textDescription: where and what, or "" if none.
- hasLogoOrBrandMark: true if any logo, crest, emblem, wordmark or recognizable brand mark appears (for example a polo player emblem), even without legible letters.
- isMockup: true if the image is a photograph or mockup of a card, paper or envelope (an object on a surface, with hands, shadows or a frame around it) rather than flat artwork filling the canvas.
- description: one sentence describing the artwork.

Be strict: when in doubt about text, answer true.`;

async function checkArtwork(c, bytes, label) {
  const dataUrl = `data:image/png;base64,${(await sharp(bytes).resize({ width: 1024 }).png().toBuffer()).toString("base64")}`;
  const [inspection, moderation] = await Promise.all([
    structured({
      model: MODELS.text,
      instructions: ART_CHECK_PROMPT,
      content: [
        { type: "input_text", text: "Inspect this artwork." },
        { type: "input_image", image_url: dataUrl, detail: "high" },
      ],
      schemaName: "ArtworkInspection",
      schema: ART_CHECK_SCHEMA,
      label: `${label} inspection`,
      effort: "low",
    }),
    moderateImage(bytes, `${label} moderation`),
  ]);
  return {
    inspection: inspection.value,
    inspectionMs: inspection.ms,
    moderation: {
      flagged: moderation.flagged,
      categories: Object.entries(moderation.categories)
        .filter(([, v]) => v)
        .map(([k]) => k),
    },
  };
}

async function validateArt(bytes, proportion) {
  const meta = await sharp(bytes).metadata();
  const want = proportion === "5:7" ? 5 / 7 : 1;
  const ratio = meta.width / meta.height;
  const problems = [];
  if (!["png", "webp", "jpeg"].includes(meta.format)) problems.push(`format ${meta.format}`);
  if (Math.abs(ratio - want) / want > 0.01)
    problems.push(`aspect ${meta.width}x${meta.height} is not ${proportion}`);
  if (meta.width < 1000) problems.push(`width ${meta.width} below 1000`);
  return { width: meta.width, height: meta.height, format: meta.format, problems };
}

async function makeArt(c, design, { reference, file, label, promptOverride }) {
  const proportion = SHAPES[design.shape].proportion;
  const prompt = promptOverride ?? assembleArtPrompt(design);
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    const gen = await generateImage({
      prompt,
      size: RASTER[proportion],
      // PHASE3_QUALITY lets a run compare quality settings on the same designs.
      quality: process.env.PHASE3_QUALITY ?? "high",
      reference,
      label: `${label}${i ? " regen" : ""}`,
    });
    if (gen.error) {
      attempts.push({ error: gen.error, refused: gen.refused, ms: gen.ms });
      if (gen.refused) break;
      continue;
    }
    writeFileSync(out(c.id, i ? file.replace(".png", `-attempt${i + 1}.png`) : file), gen.bytes);
    const deterministic = await validateArt(gen.bytes, proportion);
    const check = await checkArtwork(c, gen.bytes, label);
    const failed = [
      ...deterministic.problems,
      ...(check.inspection?.hasText ? [`text: ${check.inspection.textDescription}`] : []),
      ...(check.inspection?.hasLogoOrBrandMark ? ["logo or brand mark"] : []),
      ...(check.inspection?.isMockup ? ["mockup rather than flat artwork"] : []),
      ...(check.moderation.flagged
        ? [`moderation: ${check.moderation.categories.join(", ")}`]
        : []),
    ];
    attempts.push({
      ms: gen.ms,
      costUsd: gen.costUsd,
      usage: gen.usage,
      deterministic,
      ...check,
      failed,
    });
    if (!failed.length) {
      if (i) writeFileSync(out(c.id, file), gen.bytes);
      return {
        ok: true,
        prompt,
        attempts,
        fitsShapes: fitsShapes(design.artMode, design.layout, design.shape),
        cropShape: cropShapeFor(design.artMode, design.layout, design.shape),
      };
    }
  }
  return { ok: false, prompt, attempts };
}

async function stageArt(args) {
  await pool(selected(args), 3, async (c) => {
    if (has(c.id, "art.json")) return;
    const { design, ok } = readJson(out(c.id, "design.json"));
    if (!design || !ok) {
      console.log(`${c.id} art skipped: no valid design`);
      return;
    }
    const result = await makeArt(c, design, { file: "art.png", label: `${c.id} art` });
    writeJson(out(c.id, "art.json"), result);
    const last = result.attempts.at(-1);
    console.log(
      `${c.id} art ${result.ok ? "ok" : "FAILED"} ${last?.ms}ms ${last?.failed?.join("; ") ?? last?.error ?? ""} $${readLedger().spentUsd.toFixed(3)}`,
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Stage 4: shape switch with the current artwork as reference (eval CA-07)

const SWITCH_TO = { "5:7": "circle", "1:1": "arch" };

async function stageSwitch(args) {
  const ids = args.length ? args : ["O-02", "CU-13"];
  for (const id of ids) {
    const c = CASES.find((x) => x.id === id);
    if (has(id, "switch.json")) continue;
    const { design } = readJson(out(id, "design.json"));
    const from = SHAPES[design.shape].proportion;
    const target = SWITCH_TO[from];
    const layout = LAYOUTS[design.layout].shapes.includes(target) ? design.layout : "art-top";
    const switched = { ...design, shape: target, layout };
    const reference = readFileSync(out(id, "art.png"));
    const prompt = `${assembleArtPrompt(switched)}\nKeep the same subject, character, medium and palette as the reference artwork — the same ${design.artBrief.subject.split(",")[0]} — rearranged for this new canvas and outline. Do not copy the reference's framing; recompose it.`;
    const result = await makeArt(c, switched, {
      reference,
      file: "switch.png",
      label: `${id} switch`,
      promptOverride: prompt,
    });
    writeJson(out(id, "switch.json"), { from: design.shape, to: target, layout, ...result });
    console.log(
      `${id} switch ${design.shape} → ${target} ${result.ok ? "ok" : "FAILED"} $${readLedger().spentUsd.toFixed(3)}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------

async function stageSummary() {
  const rows = [];
  for (const c of CASES) {
    const read = (f) => (has(c.id, f) ? readJson(out(c.id, f)) : null);
    const id = read("identity.json");
    const facts = read("facts.json");
    const design = read("design.json");
    const art = read("art.json");
    rows.push({
      id: c.id,
      identityValid: id?.valid,
      identityChecks: id?.checks,
      factChecks: facts?.checks,
      design:
        design?.design &&
        `${design.design.shape}/${design.design.layout}/${design.design.artMode}/${design.design.typography.primary}`,
      wording: design?.design?.wording,
      designFirstOk: design?.firstAttemptOk,
      designProblems: design?.finalProblems,
      artOk: art?.ok,
      artAttempts: art?.attempts?.length,
      artMs: art?.attempts?.map((a) => a.ms),
      artFailures: art?.attempts?.flatMap((a) => a.failed ?? [a.error]),
    });
  }
  writeJson(path.join(OUT_DIR, "summary.json"), { spentUsd: readLedger().spentUsd, rows });
  console.log(JSON.stringify(rows, null, 1));
}

const [stage, ...args] = process.argv.slice(2);
// ---------------------------------------------------------------------------------------------
// Latency probe: lower reasoning effort for the text calls, medium quality and Flare for the art.

async function stageLatency() {
  const ids = ["CU-03", "CU-08", "CU-11", "O-02"];
  const rows = [];
  for (const id of ids) {
    const c = CASES.find((x) => x.id === id);
    const content = JSON.stringify({
      eventPrompt: c.prompt,
      redesignFeedback: null,
      inspiration: [],
      runtimeCatalog: { typographyCategories: CATEGORIES },
    });
    const ident = await structured({
      model: MODELS.text,
      instructions: identityPrompt,
      content,
      schemaName: "EventIdentity",
      schema: identitySchema,
      label: `${id} latency identity-low`,
      effort: "low",
    });
    const identityOk = ident.value && validateIdentity(ident.value);
    const input = {
      eventIdentity: ident.value,
      eventFacts: { ...c.facts },
      runtimeCatalog: runtimeCatalog(ident.value),
    };
    const des = await structured({
      model: MODELS.text,
      instructions: designPrompt,
      content: JSON.stringify(input),
      schemaName: "CardDesign",
      schema: designSchema,
      label: `${id} latency design-low`,
      effort: "low",
    });
    const designOk =
      des.value && validateDesign(des.value) && !checkDesign(c, des.value, ident.value).kind;
    rows.push({
      id,
      identityMs: ident.ms,
      identityOk,
      designMs: des.ms,
      designOk,
      title: des.value?.wording?.title,
    });
    console.log(
      `${id} identity(low) ${ident.ms}ms ${identityOk ? "valid" : "INVALID"} · design(low) ${des.ms}ms ${designOk ? "valid" : "INVALID"}`,
    );
  }
  for (const id of ["CU-03", "O-02"]) {
    const { design } = readJson(out(id, "design.json"));
    const size = RASTER[SHAPES[design.shape].proportion];
    for (const [tag, model, quality] of [
      ["sunburst-medium", MODELS.image, "medium"],
      ["flare-high", "gpt-image-2.5-flare-2026-09-08", "high"],
    ]) {
      const gen = await generateImage({
        prompt: assembleArtPrompt(design),
        size,
        quality,
        model,
        label: `${id} latency ${tag}`,
      });
      if (gen.bytes) writeFileSync(out(id, `latency-${tag}.png`), gen.bytes);
      rows.push({ id, tag, ms: gen.ms, costUsd: gen.costUsd, error: gen.error ?? null });
      console.log(`${id} ${tag} ${gen.ms}ms $${(gen.costUsd ?? 0).toFixed(3)} ${gen.error ?? ""}`);
    }
  }
  writeJson(path.join(OUT_DIR, "latency.json"), rows);
}

function stageSchema() {
  writeFileSync(
    path.join(ROOT, "docs/model-schemas/card-design.schema.json"),
    `${JSON.stringify(designSchema, null, 2)}\n`,
  );
  console.log("wrote docs/model-schemas/card-design.schema.json");
}

const stages = {
  latency: stageLatency,
  schema: stageSchema,
  identity: stageIdentity,
  design: stageDesign,
  art: stageArt,
  switch: stageSwitch,
  summary: stageSummary,
};
if (!stages[stage]) {
  console.error(`usage: run.mjs <${Object.keys(stages).join("|")}> [caseId...]`);
  process.exit(1);
}
await stages[stage](args);
console.log(`spent so far: $${readLedger().spentUsd.toFixed(3)} of $25`);
