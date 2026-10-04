import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CARD_DESIGN_PROMPT_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  FACT_EXTRACTION_PROMPT_VERSION,
} from "./versions";

/**
 * The system prompts, read from their canonical files in `docs/model-prompts/`
 * (`docs/model-contracts.md §2`, `§10`) and sent whole, as Phase 3 validation sent them.
 *
 * A prompt is used only if its header names the version `versions.ts` records with every run, so a
 * prompt edited without a version bump (or a version bumped without the prompt) fails loudly
 * instead of being recorded under the wrong version.
 *
 * Deployment: the files are read from the working directory at run time, as the card fonts are
 * (`src/lib/card/text/curated-fonts.ts`). Checked in Phase 5a with a throwaway Route Handler that
 * imported the provider: `next build` traced all three prompt files into the route's function and
 * `next start` served the request (the JSON schemas are bundled by import). The route that runs
 * generation (Phase 5b) should keep that checked after `next build`, the way
 * `scripts/card/check-traced-fonts.mjs` checks the fonts.
 */
export const SYSTEM_PROMPTS = {
  event_identity: { file: "event-identity.system.md", version: EVENT_IDENTITY_PROMPT_VERSION },
  structured_extraction: {
    file: "fact-extraction.system.md",
    version: FACT_EXTRACTION_PROMPT_VERSION,
  },
  card_design: { file: "card-design.system.md", version: CARD_DESIGN_PROMPT_VERSION },
} as const;

export type SystemPromptName = keyof typeof SYSTEM_PROMPTS;

const cache = new Map<SystemPromptName, string>();

export function systemPrompt(name: SystemPromptName): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const { file, version } = SYSTEM_PROMPTS[name];
  const text = readFileSync(path.join(process.cwd(), "docs", "model-prompts", file), "utf8");
  if (!text.includes(`**Prompt version:** \`${version}\``)) {
    throw new Error(
      `docs/model-prompts/${file} does not declare ${version} (src/lib/ai/versions.ts)`,
    );
  }
  cache.set(name, text);
  return text;
}
