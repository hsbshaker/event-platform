/**
 * Page system resolution: `DesignIntent` → borders, cards, buttons, type scale, spacing, default
 * alignment and display tracking, applied uniformly across every section so a page reads as one
 * system.
 *
 * `docs/design-system.md §15.2`: "the page system (borders, cards, buttons, type scale, spacing)
 * is compiler-owned and applied to every section." `docs/event-renderer-system.md §6` puts
 * `pageSystem` on `ResolvedDesignSpec`, never on `DesignIntent` — `../design-intent.ts`'s module
 * doc explains why, and why this file, not the model or the planner, is where it is decided.
 *
 * `proof-b/planner.js`'s `intentFor()` sampled a `pageSystem` inside a fake `DesignIntent`, and
 * `proof-b/compile.js` passed it straight through: a harness stand-in, since the proof had no
 * `generateDesignIntent()` call and bundled model simulation with compiler work. This module does
 * not replay that harness's random draws for byte parity — there is no `generateDesignIntent`
 * output to be faithful to yet, and the point of this slice is to do the resolution as the
 * compiler's own deterministic work, not to reproduce a fixture.
 *
 * # Where each admitted value comes from
 *
 * `FAMILY_PAGE_VOCAB` ports `proof-a1/vocab.js`'s `VOCAB.families[f].{axes,borders,cards,buttons}`
 * (read via `global.window = global; require("./proof-a1/sites.js"); const { VOCAB } =
 * require("./proof-a1/vocab.js")`, per this task's packet) — the only tables this module is
 * chartered to use from that file. `HIERARCHY_DISPLAY_TRACKING` ports
 * `VOCAB.mapping.hierarchy[h].displayTracking`. `BORDER_WEIGHTS` ports
 * `VOCAB.parameters.cosmetic.borderWeight`. None of `heroRecipes`, `detailsRecipes`,
 * `rsvpRecipes`, `registryRecipes` or `surfacePlans` — the legacy fixture library
 * (`docs/event-renderer-system.md §7.1`) — is read here, and no recipe, silhouette or template
 * identifier appears in this module's types or output.
 *
 * `typeScale` and `spacing` are not sampled here; they come from `./typography` and `./spacing`,
 * which resolve deterministically from `intent` alone (no seed). `resolvePageSystem` calls both
 * and embeds their results so the renderer can read a page's full system off one object; it
 * discards the `Deviation[]` `resolveTypography` returns, because that call is redundant with —
 * not instead of — the assembler's own authoritative call to `resolveTypography(intent)`
 * (`compile/spec.ts`, which owns the spec's deviation log): same `intent`, so the same
 * deterministic result, including the same deviations, surfaces from there. Nothing is silently
 * dropped; it is computed once for the log and once more, redundantly, for this embed.
 *
 * # Where this module had to decide something the tables leave open
 *
 * `resolveDefaultAlign` narrows by `intent.composition.asymmetry` only for `statement`, the one
 * family whose admitted axes include both `center` and a start-anchored axis (`left`/
 * `alternating`); `editorial` and `invitation` each admit only one axis kind, so there is nothing
 * to narrow for them. No canonical document states the asymmetry→align mapping directly; it is
 * recorded here as a compiler decision (a symmetric composition pairs with the center axis, any
 * asymmetry pairs with a start-anchored one), not read off a table, and it still only ever
 * produces a value the family's own axes admit.
 */

import { mulberry32 } from "../seeded-random";
import type { DesignIntent } from "../design-intent";
import { type Family, type Hierarchy } from "../vocabulary";
import { resolveSpacing, type Spacing } from "./spacing";
import { resolveTypography, type TypeScale } from "./typography";

export type BorderLanguage = "none" | "hairline" | "double" | "accented";
export type CardLanguage = "flat" | "outlined" | "tinted" | "plate";
export type ButtonLanguage = "solid_square" | "solid_rounded" | "outline_square" | "underline";
export type PageAlign = "start" | "center";
type Axis = "left" | "alternating" | "center";

export interface PageSystem {
  readonly border: BorderLanguage;
  readonly borderWeight: 1 | 2 | 3;
  readonly card: CardLanguage;
  readonly button: ButtonLanguage;
  readonly typeScale: TypeScale;
  readonly spacing: Spacing;
  readonly defaultAlign: PageAlign;
  readonly displayTracking: number;
}

/** `proof-a1/vocab.js`'s `VOCAB.families[f].{axes,borders,cards,buttons}`. */
const FAMILY_PAGE_VOCAB: Record<
  Family,
  {
    readonly axes: readonly Axis[];
    readonly borders: readonly BorderLanguage[];
    readonly cards: readonly CardLanguage[];
    readonly buttons: readonly ButtonLanguage[];
  }
> = {
  editorial: {
    axes: ["left", "alternating"],
    borders: ["hairline", "accented", "double"],
    cards: ["outlined", "flat", "plate", "tinted"],
    buttons: ["solid_rounded", "solid_square", "underline"],
  },
  invitation: {
    axes: ["center"],
    borders: ["double", "hairline"],
    cards: ["outlined", "plate", "tinted"],
    buttons: ["outline_square", "solid_square"],
  },
  statement: {
    axes: ["left", "alternating", "center"],
    borders: ["accented", "none", "double"],
    cards: ["tinted", "flat", "outlined"],
    buttons: ["solid_square", "underline"],
  },
};

/** `proof-a1/vocab.js`'s `VOCAB.mapping.hierarchy[h].displayTracking`, in em. */
export const HIERARCHY_DISPLAY_TRACKING: Record<Hierarchy, readonly number[]> = {
  monumental: [-0.05, -0.02],
  dramatic: [-0.05, -0.02, 0],
  editorial: [-0.02, 0, 0.06],
  restrained: [0, 0.06, 0.14],
};

/** `proof-a1/vocab.js`'s `VOCAB.parameters.cosmetic.borderWeight`. */
export const BORDER_WEIGHTS: readonly (1 | 2 | 3)[] = [1, 2, 3];

/** A seeded, in-range pick from a non-empty candidate list. */
function pick<T>(rng: () => number, candidates: readonly T[]): T {
  const index = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  return candidates[index];
}

/** See the module doc's "decided" section. */
function resolveDefaultAlign(intent: DesignIntent, axes: readonly Axis[]): PageAlign {
  const admitsCenter = axes.includes("center");
  const admitsStart = axes.includes("left") || axes.includes("alternating");
  if (admitsCenter && !admitsStart) return "center";
  if (admitsStart && !admitsCenter) return "start";
  return intent.composition.asymmetry === "symmetric" ? "center" : "start";
}

/**
 * Resolve `intent` to a `PageSystem`. Deterministic in `(intent, seed)`: every field is either a
 * value `FAMILY_PAGE_VOCAB`/`HIERARCHY_DISPLAY_TRACKING`/`BORDER_WEIGHTS` admits for `intent`, or
 * (`typeScale`, `spacing`) the deterministic result of `resolveTypography`/`resolveSpacing`.
 */
export function resolvePageSystem(intent: DesignIntent, seed: number): PageSystem {
  const family = FAMILY_PAGE_VOCAB[intent.family];
  const rng = mulberry32(seed);

  const border = pick(rng, family.borders);
  const borderWeight = pick(rng, BORDER_WEIGHTS);
  const card = pick(rng, family.cards);
  const button = pick(rng, family.buttons);
  const displayTracking = pick(rng, HIERARCHY_DISPLAY_TRACKING[intent.composition.hierarchy]);

  return {
    border,
    borderWeight,
    card,
    button,
    typeScale: resolveTypography(intent).typography.scale,
    spacing: resolveSpacing(intent.density),
    defaultAlign: resolveDefaultAlign(intent, family.axes),
    displayTracking,
  };
}

/** Exported only so a boundary test can prove no field ever escapes its admitted table. */
export const PAGE_SYSTEM_VOCAB = { FAMILY_PAGE_VOCAB } as const;
