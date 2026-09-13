/**
 * The legacy fixture library: 26 hero silhouettes and 13 section recipes (4 details, 5 rsvp, 4
 * registry), 6 surface plans, and the 16 A.1 site rows built from them.
 *
 * `docs/event-renderer-system.md §7.1` — the Library Boundary Invariant — is binding: this is a
 * library of regression/expressiveness fixtures, rotated few-shot examples, deterministic repair
 * macros, and signature calibration. It is never a selection menu for generation. Production
 * compiles any valid model-authored `CompositionTree` and never selects, matches, ranks,
 * schedules or maps a composition onto one of these fixtures. This module is inert data plus
 * `page()`; it adds no `chooseHero`, no `nearestRecipe`, no similarity or ranking helper of any
 * kind, and importing it from production `src/**` outside the two named adapters
 * (`src/lib/renderer/recovery/**`, `src/lib/renderer/few-shot/**`) is an ESLint error
 * (`eslint.config.mjs`, `CLAUDE.md §5.1`).
 *
 * Ported from `proof-b/library.js` with no behaviour change (Phase 3, item 2). This is the only
 * public surface of the directory; `heroes.ts`, `sections.ts`, `pages.ts` and `helpers.ts` are
 * implementation detail.
 */

export { HEROES, HERO_KEYS, type HeroKey } from "./heroes";
export {
  DETAILS,
  RSVPS,
  REGISTRIES,
  type DetailsKey,
  type RsvpKey,
  type RegistryKey,
} from "./sections";
export { PLANS, page, A1_SITES, type SurfacePlan, type PlanKey, type A1Site } from "./pages";
