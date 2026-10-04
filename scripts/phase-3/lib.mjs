/**
 * Phase 3 model validation — shared plumbing (docs/development-plan.md, Phase 3).
 *
 * Throwaway validation tooling, outside the product. It calls the OpenAI API directly with fetch
 * (no SDK; docs/technology-decisions.md §8.1), keeps a spend ledger from the API's own usage
 * figures and refuses any call that could cross the phase budget.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export const MODELS = {
  text: "gpt-6.1-sol",
  facts: "gpt-6-luna",
  image: "gpt-image-2.5-sunburst-2026-09-08",
  moderation: "omni-moderation-latest",
};

// USD per 1M tokens (developers.openai.com model pages, 2026-10-04).
const PRICES = {
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-image-2.5-sunburst-2026-09-08": { textInput: 5, imageInput: 8, imageOutput: 30 },
  "gpt-image-2.5-flare-2026-09-08": { textInput: 5, imageInput: 8, imageOutput: 30 },
  "omni-moderation-latest": { input: 0, output: 0 },
};

// Worst-case cost reserved before a call is allowed to start.
const RESERVE = { text: 0.25, image: 0.9, moderation: 0 };

export const BUDGET_USD = 25;
export const OUT_DIR = process.env.PHASE3_OUT ?? path.resolve(process.cwd(), ".phase-3-out");
mkdirSync(OUT_DIR, { recursive: true });

const LEDGER = path.join(OUT_DIR, "ledger.json");

export function readLedger() {
  if (!existsSync(LEDGER)) return { spentUsd: 0, calls: [] };
  return JSON.parse(readFileSync(LEDGER, "utf8"));
}

function record(entry) {
  const ledger = readLedger();
  ledger.calls.push(entry);
  ledger.spentUsd = Number((ledger.spentUsd + entry.costUsd).toFixed(6));
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  return ledger.spentUsd;
}

let reserved = 0;

/** Reserve the worst case for one call; the returned function releases it when the call ends. */
function guard(kind) {
  const { spentUsd } = readLedger();
  if (spentUsd + reserved + RESERVE[kind] > BUDGET_USD) {
    throw new Error(
      `Budget guard: $${spentUsd.toFixed(2)} spent, $${reserved.toFixed(2)} in flight; a ${kind} call could cross the $${BUDGET_USD} cap.`,
    );
  }
  reserved += RESERVE[kind];
  return () => {
    reserved -= RESERVE[kind];
  };
}

function textCost(model, usage) {
  const p = PRICES[model];
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  const input = (usage?.input_tokens ?? 0) - cached;
  return (input * p.input + cached * p.cachedInput + (usage?.output_tokens ?? 0) * p.output) / 1e6;
}

function imageCost(model, usage) {
  const p = PRICES[model];
  const d = usage?.input_tokens_details ?? {};
  const textIn = d.text_tokens ?? usage?.input_tokens ?? 0;
  const imageIn = d.image_tokens ?? 0;
  return (
    (textIn * p.textInput + imageIn * p.imageInput + (usage?.output_tokens ?? 0) * p.imageOutput) /
    1e6
  );
}

const API = "https://api.openai.com/v1";

async function post(url, init, label) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ${label}: HTTP ${res.status}, retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const body = await res.json();
    if (!res.ok) {
      const err = new Error(`${label}: HTTP ${res.status} ${JSON.stringify(body.error ?? body)}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }
  throw new Error(`${label}: gave up after retries`);
}

function headers(json = true) {
  const h = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** Strip JSON Schema keywords the strict structured-output mode does not accept; ajv checks them locally. */
export function toStrictSchema(schema) {
  const drop = new Set([
    "$schema",
    "$id",
    "$comment",
    "minLength",
    "maxLength",
    "uniqueItems",
    "title",
  ]);
  // `inProperties`: the keys of a `properties` object are field names, not keywords — never drop them.
  const walk = (node, inProperties = false) => {
    if (Array.isArray(node)) return node.map((n) => walk(n));
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (!inProperties && drop.has(k)) continue;
        out[k] = walk(v, !inProperties && k === "properties");
      }
      return out;
    }
    return node;
  };
  return walk(schema);
}

/** Responses API call with a strict JSON schema. `content` is a string or input-content array. */
export async function structured({
  model,
  instructions,
  content,
  schemaName,
  schema,
  label,
  effort = "medium",
}) {
  const release = guard("text");
  try {
    return await structuredCall({
      model,
      instructions,
      content,
      schemaName,
      schema,
      label,
      effort,
    });
  } finally {
    release();
  }
}

async function structuredCall({ model, instructions, content, schemaName, schema, label, effort }) {
  const started = Date.now();
  const body = {
    model,
    instructions,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        schema: toStrictSchema(schema),
        strict: true,
      },
    },
  };
  if (effort) body.reasoning = { effort };
  const res = await post(
    `${API}/responses`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) },
    label,
  );
  const ms = Date.now() - started;
  const costUsd = textCost(model, res.usage);
  const spent = record({
    label,
    model,
    ms,
    usage: res.usage,
    costUsd,
    at: new Date().toISOString(),
  });
  const message = res.output?.find((o) => o.type === "message");
  const part = message?.content?.find((c) => c.type === "output_text" || c.type === "refusal");
  if (!part || part.type === "refusal") {
    return { refusal: part?.refusal ?? "no output", ms, costUsd, spent, raw: res };
  }
  return { value: JSON.parse(part.text), ms, costUsd, spent, model: res.model };
}

/** Image generation; returns PNG bytes. `reference` (Buffer) switches to the edits endpoint. */
export async function generateImage(args) {
  const release = guard("image");
  try {
    return await imageCall(args);
  } finally {
    release();
  }
}

async function imageCall({
  prompt,
  size,
  quality = "high",
  reference,
  label,
  model = MODELS.image,
}) {
  const started = Date.now();
  let res;
  try {
    if (reference) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality);
      form.append("output_format", "png");
      form.append("image[]", new Blob([reference], { type: "image/png" }), "reference.png");
      res = await post(
        `${API}/images/edits`,
        { method: "POST", headers: headers(false), body: form },
        label,
      );
    } else {
      res = await post(
        `${API}/images/generations`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ model, prompt, size, quality, output_format: "png", n: 1 }),
        },
        label,
      );
    }
  } catch (err) {
    record({
      label,
      model,
      ms: Date.now() - started,
      error: err.message,
      costUsd: 0,
      at: new Date().toISOString(),
    });
    return {
      error: err.message,
      refused: /moderation|safety|policy|content/i.test(err.message),
      ms: Date.now() - started,
    };
  }
  const ms = Date.now() - started;
  const costUsd = imageCost(model, res.usage);
  const spent = record({
    label,
    model,
    ms,
    usage: res.usage,
    costUsd,
    at: new Date().toISOString(),
  });
  return {
    bytes: Buffer.from(res.data[0].b64_json, "base64"),
    ms,
    costUsd,
    spent,
    usage: res.usage,
  };
}

export async function moderateImage(bytes, label) {
  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const res = await post(
    `${API}/moderations`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: MODELS.moderation,
        input: [{ type: "image_url", image_url: { url: dataUrl } }],
      }),
    },
    label,
  );
  return res.results[0];
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
