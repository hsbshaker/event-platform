import "server-only";

import { after } from "next/server";

import { runGeneration } from "./run.server";

/**
 * Runs a generation this request started, after the response (`after()`;
 * `docs/technology-decisions.md §8.1`, "Generation execution"), within the invoking page's
 * `maxDuration` (300 s, `GENERATION_MAX_DURATION_SECONDS`). Its deadline counts from `startedAt`,
 * when the request began. `runGeneration` ends every failure on the generation itself, so what is
 * caught here is only a bug, logged by name and message — never host content.
 */
export function scheduleGeneration(input: {
  generationId: string;
  eventId: string;
  userId: string;
  startedAt: number;
}): void {
  after(async () => {
    try {
      await runGeneration(input);
    } catch (error) {
      console.error("[generation] the worker stopped unexpectedly", {
        generationId: input.generationId,
        eventId: input.eventId,
        error: error instanceof Error ? { name: error.name, message: error.message } : typeof error,
      });
    }
  });
}
