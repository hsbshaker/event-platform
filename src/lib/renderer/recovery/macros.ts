/**
 * Deterministic repair macros drawn from the legacy library.
 *
 * `docs/event-renderer-system.md §3`: "Library macros (a hero, an rsvp section, a registry
 * section) are the only repair inputs that are not rules; they come from the A.1 library, chosen
 * by seed." They are reached only by `repair()`, and only for the two coverage defects that
 * cannot be repaired from the tree itself — a hero with no `EventTitle`, and a missing rsvp
 * section. A tree that needs no repair never touches them.
 *
 * This is a recovery path, not a creative one: the seed picks a macro, nothing ranks or matches
 * one to the event, and the composition the model authored is otherwise untouched.
 *
 * Ported from `proof-b/compile.js`'s `macros(seed)` with no behaviour change.
 */

import type { Capabilities, Section } from "../composition/nodes";
import { DEFAULT_MACROS, type Macros } from "../composition/repair";
import { HEROES, HERO_KEYS, RSVPS } from "../library";

const RSVP_KEYS = Object.keys(RSVPS) as (keyof typeof RSVPS)[];

/**
 * The library-backed macro set for one compile. `seed` is the concept's seed; `repair()` passes
 * its own per-call seed as `s`, and the two are added so two concepts of the same batch do not
 * recover into the same hero.
 *
 * The registry macro stays the language's own generic one: the library's registry recipes assume
 * capabilities the event may not have, and `DEFAULT_MACROS` builds from the event's actual
 * capabilities instead. That is the reference's choice, kept.
 */
export function libraryMacros(seed: number): Macros {
  return {
    hero: (s: number) => HEROES[HERO_KEYS[(s + seed) % HERO_KEYS.length]](),
    rsvpSection: (s: number): Section => ({
      kind: "rsvp",
      surface: "base",
      root: RSVPS[RSVP_KEYS[(s + seed) % RSVP_KEYS.length]](),
    }),
    registrySection: (s: number, caps: Capabilities) => DEFAULT_MACROS.registrySection(s, caps),
  };
}
