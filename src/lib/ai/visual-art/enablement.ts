import "server-only";

/**
 * Disabled by default, and not by a default — by having no live provider at all.
 *
 * The guarantee this module states, and `./boundary.test.ts` proves:
 *
 * > There is **no configuration, environment-variable state or default value** under which
 * > calling the artwork path in this repository reaches a network.
 *
 * A flag would not give that. `ARTWORK_ENABLED=1` in the wrong place, a `?? true` in a later edit,
 * a default that flips when `NODE_ENV` changes — every one of those is a way for the guarantee to
 * be lost silently, and this is the one boundary where losing it silently means spending money.
 * So the enforcement is structural and there are four parts to it:
 *
 * 1. **`getArtworkProvider()` throws unconditionally.** No branch, no environment read, no
 *    registry to populate. Making the live path reachable is an edit to this file, in a diff, with
 *    a review — never a deployment setting.
 * 2. **No module under `src/lib/ai/visual-art/` reads `process.env`.** Proved by a scan. With no
 *    configuration input at all, there is no configuration state to get wrong.
 * 3. **No module under `src/lib/ai/visual-art/` can reach a network.** No `fetch`, no HTTP client,
 *    no SDK import, transitively. Also proved by a scan, and by running the stub with a throwing
 *    `fetch` installed.
 * 4. **`generateVisualArt` takes its provider by injection**, and this module hands out none. A
 *    live adapter now exists — `src/lib/ai/openai/artwork.ts`, written for an authorized
 *    capability spike — but it lives outside this directory, imports this one and is never
 *    imported back, so the scans above are untouched and `getArtworkProvider()` still cannot
 *    return it. Reaching it takes an explicit construction, a named model and a live spend
 *    reservation, at a call site somebody wrote on purpose. The offline `./stub/provider.ts` is
 *    still the only provider anything in production can obtain.
 *
 * # What the next authorized task does
 *
 * `spec.md §7.6a` and `docs/technology-decisions.md` record that **no image model is selected**,
 * and `docs/product-doctrine.md §10` explains why that decision waits for measurement rather than
 * being settled by a prompt. Selecting one is a locked-stack decision (`CLAUDE.md §3`), so it is
 * not made here and is not implied by anything in this directory.
 *
 * One authorized capability spike has since run a single image through
 * `src/lib/ai/openai/artwork.ts` against a pinned, dated model, under a one-request budget. That
 * is evidence about one model from one sample, not a selection: `docs/technology-decisions.md §8`
 * still records the decision as open and names what a real selection has to measure. Nothing about
 * this module changed for it, which is the seam being complete without being live — the spike
 * needed a provider and an authorization, and no change to the interface, the classification, the
 * spend gate, the telemetry or the fallback.
 */
import type { ArtworkProvider } from "./provider";

/**
 * Is live artwork generation authorized in this repository? No.
 *
 * A `const false` rather than a function over configuration, so that every consumer narrows at
 * compile time and a conditional that assumed otherwise is dead code a reviewer can see.
 */
export const ARTWORK_GENERATION_AUTHORIZED = false as const;

/**
 * The production resolver. It throws, always, on every runtime, under every environment.
 *
 * Mirrors `getAiProvider()` in `@/lib/ai/provider`, which throws for the same reason and says so:
 * *"no code path can call a model by accident (spec.md §32 #4)"*.
 */
export function getArtworkProvider(): ArtworkProvider {
  throw new Error(
    "No image provider is configured, and none may be. spec.md §7.6a and " +
      "docs/technology-decisions.md record that no image model is selected; choosing one is a " +
      "locked-stack decision (CLAUDE.md §3), not a configuration change. The offline stub in " +
      "src/lib/ai/visual-art/stub/ is the only provider this function will ever hand out. A live " +
      "adapter exists at src/lib/ai/openai/artwork.ts for authorized spikes; reaching it takes an " +
      "explicit construction and a spend reservation, never a lookup through here.",
  );
}
