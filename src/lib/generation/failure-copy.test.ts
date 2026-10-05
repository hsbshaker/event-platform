import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ModelCallRefusal } from "@/lib/ai/errors";
import type { StartGenerationOutcome } from "@/lib/supabase/database.types";

import {
  COPYRIGHT_STEP_BACK_NOTICE,
  GENERATION_FAILURE_CODES,
  generationFailure,
  generationNotice,
  PROVIDER_REFUSAL_NOTICE,
  type GenerationFailureCode,
} from "./failure-copy";
import { PROVIDER_REFUSAL_FEEDBACK } from "./run.server";
import type { StageFailureCode } from "./stage";

/**
 * Failure copy (`spec.md §7.10`, §10, §32 #42; `docs/design-system.md §12.2`, §12.3): every code
 * a generation can record, or a start can be refused with, has plain product copy — no technical
 * terms, no provider or model names, no blame on the host, no limits or counters — and a retry
 * exactly where trying again now can help.
 */

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Every code each source can record, typed so a new one fails to compile here first. */
const STAGE: Record<StageFailureCode, true> = {
  invalid_output: true,
  provider_error: true,
  artwork_invalid: true,
  provider_refusal: true,
};
const METER: Record<ModelCallRefusal, true> = {
  disabled: true,
  ceiling: true,
  not_running: true,
  invalid_context: true,
  deadline: true,
};
const REFUSED_STARTS: Record<Extract<StartGenerationOutcome, "event_cap" | "host_cap">, true> = {
  event_cap: true,
  host_cap: true,
};
const ORCHESTRATION = ["internal", "unsupported_kind", "published"];
const DATABASE = ["stale", "published"];
const STATUS_VIEW = ["stopped"];

const EXPECTED_RETRY: Record<GenerationFailureCode, boolean> = {
  invalid_output: true,
  provider_error: true,
  artwork_invalid: true,
  provider_refusal: true,
  disabled: false,
  ceiling: false,
  not_running: true,
  invalid_context: true,
  deadline: true,
  internal: true,
  unsupported_kind: true,
  published: false,
  stale: true,
  stopped: true,
  event_cap: false,
  host_cap: false,
};

/** Words the host must never see (`docs/design-system.md §12.3`, `spec.md §26`). */
const TECHNICAL =
  /\b(model|provider|api|json|schema|inference|openai|gpt|sunburst|sol|token|error code|meter|telemetry|ceiling|cap|quota|limit|credits?|counter|remaining|stale|timeout|http|server|database|stage|generation)\b/i;
/** Never blame the host. */
const BLAME = /\byou (did|entered|wrote|asked|broke|caused)\b|\byour (prompt|request|input)\b/i;

describe("generationFailure", () => {
  it("covers every code the pipeline, the database, the wait view and a refused start record", () => {
    const sources = [
      ...Object.keys(STAGE),
      ...Object.keys(METER),
      ...Object.keys(REFUSED_STARTS),
      ...ORCHESTRATION,
      ...DATABASE,
      ...STATUS_VIEW,
    ];
    expect([...new Set(sources)].sort()).toEqual([...GENERATION_FAILURE_CODES].sort());
  });

  it("finds every code written in the orchestration and the migrations among them", () => {
    const written = [
      ...read("src/lib/generation/run.server.ts").matchAll(/fail\("([a-z_]+)"/g),
      ...read("supabase/migrations/20261005000000_phase5_spend_controls.sql").matchAll(
        /error_code = '([a-z_]+)'/g,
      ),
      ...read("src/lib/generation/status.server.ts").matchAll(/"(stopped)"/g),
    ].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const code of written) {
      expect(GENERATION_FAILURE_CODES, code).toContain(code);
    }
  });

  it.each(GENERATION_FAILURE_CODES)("gives %s plain copy and the right retry", (code) => {
    const failure = generationFailure(code);
    expect(failure.code).toBe(code);
    expect(failure.retry).toBe(EXPECTED_RETRY[code]);
    for (const text of [failure.title, failure.body]) {
      expect(text.trim()).not.toBe("");
      expect(text, `${code}: ${text}`).not.toMatch(TECHNICAL);
      expect(text, `${code}: ${text}`).not.toMatch(BLAME);
      expect(text).not.toMatch(/\d|_/);
    }
    // A title, then a sentence or two.
    expect(failure.title.length).toBeLessThanOrEqual(48);
    expect(failure.body.length).toBeLessThanOrEqual(180);
  });

  it("reads an unknown or missing code as the generic failure, with a retry", () => {
    for (const code of [null, undefined, "", "something_new", "constructor", "__proto__"]) {
      expect(generationFailure(code)).toEqual(generationFailure("internal"));
    }
    expect(generationFailure("internal").retry).toBe(true);
  });

  it("offers a retry for the copyright failure, which takes the same step back", () => {
    const failure = generationFailure("provider_refusal");
    expect(failure.retry).toBe(true);
    expect(failure.body).toMatch(/copyright/);
    expect(failure.body).toMatch(/well-known character/);
  });
});

describe("generationNotice", () => {
  it("is the screen-spec's step-back note for the notice the orchestration records", () => {
    expect(COPYRIGHT_STEP_BACK_NOTICE).toBe(
      "That first take came out too close to a well-known character, so for copyright reasons we're trying a fresh take on its world.",
    );
    // run.server.ts records this constant (its tests assert the recorded `{ notice }`).
    expect(PROVIDER_REFUSAL_NOTICE).toBe("provider_refusal");
    expect(read("src/lib/generation/run.server.ts")).toContain("notice: PROVIDER_REFUSAL_NOTICE");
    expect(generationNotice("provider_refusal")).toBe(COPYRIGHT_STEP_BACK_NOTICE);
    // The note is the host's; the re-prompt's words are the model's and never shown.
    expect(COPYRIGHT_STEP_BACK_NOTICE).not.toBe(PROVIDER_REFUSAL_FEEDBACK);
  });

  it("is null for no notice or one it does not know", () => {
    for (const notice of [undefined, null, "", "other", { kind: "provider_refusal" }]) {
      expect(generationNotice(notice)).toBeNull();
    }
  });
});
