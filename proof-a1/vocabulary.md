# Phase A.1 vocabulary — what changed from Phase A and why

Phase A (`proof/`, commit `cda5fa6`) is frozen. This folder is a copy with the changes the Phase A critique asked for. The rules live in one machine-readable file, `vocab.js`, which both the browser harness and the node generator read. Anything not in `vocab.js` or `sites.js` is not allowed.

## 1. Hero admission rule

A hero recipe is admitted only if it declares at least one structural parameter whose extreme values change its grayscale silhouette. In `vocab.js` this is the `variants` list on every `heroRecipes` entry. The variant is a structural parameter: it counts toward diversity and the batch planner tracks it.

| Recipe | Family | Structural variants | What changes in silhouette |
| --- | --- | --- | --- |
| `editorial_split` | editorial | `field_right`, `field_left` | which side the patterned field sits on; on mobile, whether the field comes before or after the copy |
| `editorial_masthead` | editorial | `rail_right`, `rail_left`, `band_top` | a vertical rail beside the title on either side, or a full-width band above it |
| `editorial_offset` | editorial | `plate_left`, `plate_right` | the diagonal flips: plate bottom-left with title top-right, or the mirror |
| `editorial_daterail` (new) | editorial | `rail_left`, `rail_right` | a tall date column with a strong rule on either side of a stacked title; on mobile the column becomes a ruled header row |
| `editorial_rulegrid` (new) | editorial | `cells`, `columns` | title in a 2-of-3 cell over a row of cells, or a full-width title row over four tall columns |
| `framed_invitation` | invitation | `thin_frame`, `deep_margin` | frame inset 14px or 64px (was derived from `bandHeight`; now keyed by variant) |
| `invitation_card` | invitation | `floating`, `sheet` | a 760px card floating on the field, or a full-bleed plate between two field strips |
| `invitation_monogram` | invitation | `crest`, `watermark` | a ringed initial above the stack, or a giant low-opacity initial behind it |
| `invitation_ticket` (new) | invitation | `stub_right`, `stub_left` | a wide contrast card with a dashed perforation and a stub column holding the day numeral, on either side; on mobile the stub drops below |
| `typography_first` | statement | `band_below`, `band_above`, `band_rail` | thick band under the title, a header block above it, or a vertical rail beside it |
| `statement_stack` | statement | `alternate`, `cascade` | lines alternate left/right, or step rightward |
| `statement_numeral` (new) | statement | `numeral_left`, `numeral_top` | the day numeral as a 45% column beside the copy, or as a ruled header row above it |

Twelve recipes, 27 silhouettes. Poster and masthead, the two Phase A collisions, now each have three.

## 2. Parameters, classified

```
structural: heroVariant (per recipe), heroSplit [.38, .50, .62]
cosmetic:   heroHeight, alignOffset, measure, bandHeight, motifScale, motifOpacity, borderWeight, displayTracking
```

Structural parameters count toward the signature. Cosmetic parameters are still seeded and still constrained by composition (asymmetry → heroSplit and alignOffset; rhythm → bandHeight; ornament → motif budget and opacity; hierarchy → tracking) but never count. `heroSplit` lost its .45/.55/.68 steps: they were content-fit steps, not diversity steps.

## 3. Section recipes

- **RSVP: five shells.** `rsvp_wide_heading` is new: the heading is a full-width accent band, the form sits beneath in a 560px column pushed right. Requires a left or alternating axis.
- **State: one recipe.** `state_plate` dropped. `state_quiet` is styled by the page's card language, so it still changes with the page system.
- **Details and registry: unchanged**, but each now declares its axis requirement in `vocab.js` instead of in prose.

## 4. Compatibility rules, now on recipes

- `rsvp_contained_card.excludes.surfaces = ["framed"]` — no frame within a frame. (Moved sites 02 and 11 off the contained card.)
- Band after a band-consuming hero takes the field motif (harness rule, unchanged).
- Inside a framed surface the quiet-state gate drops its card border and the wide RSVP heading does not bleed past the frame (harness rules, new).
- Surface plans carry `rhythm` and `contrast` tags. A plan is only valid for a composition whose rhythm matches; contrast is preferred and relaxed with a logged repair.
- Card and ticket heroes always sit on an alt surface with a contrast object, whatever the plan's hero surface says. Otherwise a contrast plan makes the object vanish.

Rules found while rendering this phase, all recipe-level, none per-site:
- Numeral hero: the title renders at 0.75× display (0.7× on mobile). The numeral is the dominant object; at monumental the full-size title overran the first screen.
- Stack hero: the third line's offset is halved on mobile, like every other offset. `alignOffset` 3 pushed it off a 390px screen.
- Rule-grid cells were renamed in the harness after colliding with lab chrome CSS. Harness bug, not a vocabulary rule.

## 5. Content fit, formalized

Every hero recipe declares `contentFit.titleWords: [min, max]`. `DATA.contentProfile` is derived from the content, never hand-set. `fits(recipe, profile)` gates hero selection in the generator. The brief's title is six words, so every recipe currently fits; the mechanism exists so a two-word or twelve-word title changes which heroes are eligible.

## 6. Signature, revised

```
desktop: hero .25  variant .10  plan .15  axis .10  rsvp .10  registry .10  category .10  hierarchy .05  tone .05
mobile:  hero .30  variant .10  plan .20  axis .05  rsvp .05  registry .10  category .10  hierarchy .05  tone .05
threshold .70, computed separately for each mode; a pair collides if either mode is at or above threshold
```

`variant` only scores when the hero also matches, so same hero plus same silhouette costs .35 on desktop and .40 on mobile. Axis and RSVP weigh less on mobile because they shrink at 390; hero and plan weigh more because they don't.

## 7. Phase A sites that violated A.1 rules

Carrying the twelve over against the stricter vocabulary caught eight violations, each repaired by the rule that caught it. This is the same kind of repair the compiler will make.

| Site | Violation | Repair |
| --- | --- | --- |
| 01 | heroSplit .55 not a structural step | .62 |
| 02, 11 | contained card on a framed surface | typographic stack (02), wide heading (11) |
| 02, 05, 07, 11 | state_plate dropped | state_quiet |
| 06 | SP6 is an alternating-rhythm plan; composition said continuous | rhythm alternating |
| 07 | SP2 is a low-contrast plan; composition said moderate | contrast low |
| 08 | strong asymmetry maps heroSplit to .62 | .62 (unused by stack, kept consistent) |
| 09 | outline_square is not an editorial button | solid_square |
| 10 | flat card and rounded button are not invitation languages; uneven grid needs a left/alternating axis | tinted, solid_square, editorial list |
| 11 | stacked details need a center axis | sidebar rows |

## 8. The sixteen hand-composed sites

01–12 are the Phase A twelve with variants declared (01 field_right, 02 thin_frame, 03 band_below, 04 rail_right, 05 plate_left, 06 floating, 07 crest, 08 alternate, 09 field_left, 10 deep_margin, 11 band_rail, 12 band_top). 13–16 exercise the four new heroes: Date Rail (daterail rail_left, SP4, wide-heading RSVP), Admit One (ticket stub_right, SP6, plaid frame), Nineteen (numeral_left, SP1, stripe band), Rule Grid (cells, SP2, alternating axis). `a1-collision.json` has all 120 pairs: maximum similarity .55 (07/16, both light heritage-category sites with the same RSVP and plan), no pair at or above .60.
