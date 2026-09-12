# Phase A vocabulary — the reusable design space the twelve proof sites are drawn from

**Status:** proof artifact, not canonical. Nothing here edits `spec.md` or the renderer docs.
**Companions:** `sites.js` (the twelve configs and the vocabulary metadata the harness reads), `harness.html` (throwaway config-driven renderer), `critique.md` (what the renders showed).

Every visible choice in the twelve sites traces to one of: a family rule, a named recipe, a PageSystem value, a composition-intent value, a quantized parameter, or a motif assignment. The harness has no per-site branches. If you can't find a decision in this document or in `sites.js`, it isn't allowed.

---

## 1. Families

Three visual languages. A family is not a layout. It is a set of recipes, allowed page systems, and tendencies that two engineers would implement compatibly.

### Editorial

- **Philosophy:** magazine logic. Information is arranged, not centered. The page has a grain.
- **Composition:** asymmetric grids, columns, rules, panels beside text. Heroes split or offset. Sections alternate surfaces or alignment.
- **Hierarchy:** editorial or dramatic by default; restrained for masthead compositions; monumental only with the split recipe.
- **Alignment:** left or alternating. Never center.
- **Surfaces:** panels, bands, and contrast blocks are welcome. Continuous-light plans are allowed but rules must carry the rhythm.
- **Borders:** hairline or accented. Double rules only in the masthead.
- **Cards:** outlined, flat, or plate. Tinted allowed.
- **Buttons:** solid rounded, solid square, or underline.
- **Motifs:** field and band roles dominate. Plaid, stripe, gingham as panels. Line art as accents and dividers, never as frames.
- **Typography:** heritage, transitional, high-contrast, soft serif, or oldstyle display with a quiet sans body. Grotesk-led only with dramatic hierarchy.
- **Recognizably editorial:** something sits beside the title. A rule structures the meta row. Sections don't share one axis.
- **Never:** a centered symmetric hero, a decorative frame around the page, ornament in corners, all-caps monumental display without a panel.

### Invitation

- **Philosophy:** stationery logic. The site behaves like a beautifully set card.
- **Composition:** symmetric, centered, framed or contained. Rules and ornaments articulate the stack. Details read as a when/where row.
- **Hierarchy:** restrained or editorial. Dramatic only in the framed recipe. Never monumental.
- **Alignment:** center only.
- **Surfaces:** framed or continuous by default; a dark opening is allowed when the frame carries a pattern margin. A card on a field is the family's contrast move.
- **Borders:** double or hairline. Accented is forbidden. None is forbidden.
- **Cards:** outlined or plate. Tinted allowed on dark tones.
- **Buttons:** outline square or solid square. Never underline. Never rounded.
- **Motifs:** frame, divider, and accent roles dominate. Corner glyphs, rule dividers with glyphs, linen or plaid in the frame margin.
- **Typography:** high-contrast editorial, heritage, oldstyle, transitional. Grotesk-led is forbidden.
- **Recognizably invitation:** centered title inside something: a frame, a card, or a rule-articulated stack. A divider with ornament. A when/where pairing.
- **Never:** a left-aligned hero, a split panel, a sans display, an edge-to-edge interruption without a frame.

### Statement

- **Philosophy:** type is the design. Scale, weight, and whitespace do the work.
- **Composition:** one dominant typographic object per screen. Everything else is small, precise, and ruled.
- **Hierarchy:** monumental or dramatic. Editorial only with the poster recipe at compact density. Never restrained.
- **Alignment:** left or alternating. Center allowed only for the poster recipe.
- **Surfaces:** strong contrast openings, interrupted bands, or flat continuous light. Framed plans allowed only for the poster.
- **Borders:** accented, none, or double for the poster. Hairline discouraged.
- **Cards:** tinted, flat, or outlined. Plate forbidden.
- **Buttons:** solid square or underline. Never rounded.
- **Motifs:** band and accent roles only. Never field patterns behind type. One motif is usually right; zero is allowed.
- **Typography:** grotesk-led or high-contrast editorial display that holds at monumental. Body sans always.
- **Recognizably statement:** the title occupies most of the first screen. A single thick rule or band. A meta row rather than a paragraph.
- **Never:** frames, corner ornaments, multi-panel heroes, patterned fields behind display type, decorative ornament level.

---

## 2. Hero recipes (8)

Old `editorial_split`, `framed_invitation`, and `typography_first` survive as the first recipe of their family. Their structure is unchanged; what changed is that composition, page system, and parameters now vary around them instead of being frozen inside them.

| ID | Family | Working name | Structural idea |
| --- | --- | --- | --- |
| `editorial_split` | editorial | Split | Copy block beside a patterned field panel; the split ratio and which side the field sits on are parameters. |
| `editorial_masthead` | editorial | Masthead | Newspaper masthead: ruled meta row on top, full-width title, a vertical patterned rail whose width is a parameter, a ruled divider row with glyphs and the CTA. |
| `editorial_offset` | editorial | Offset | Title pushed into the right column over empty space; meta block bottom-left; a patterned plate rises from the bottom-left and overlaps the composition. |
| `framed_invitation` | invitation | Framed | The whole hero is a ruled frame; the margin outside the frame is a pattern band whose width is a parameter; centered stack inside; corner glyphs. |
| `invitation_card` | invitation | Card | A contrast-surface card object floating on a patterned field, centered, with a glyph divider inside the card. |
| `invitation_monogram` | invitation | Monogram | Ornament first: a ringed initial, a short rule, small-caps title at reduced scale, glyph divider, then a when/where pair separated by a vertical rule. |
| `typography_first` | statement | Poster | Uppercase display block, a thick patterned band, a space-between meta row, CTA. |
| `statement_stack` | statement | Stack | Title broken into three lines with alternating alignment filling the screen; a vertical rotated date label on the left edge; meta and CTA below. |

Per-recipe detail:

**editorial_split**
- 1280: two-column grid, `heroSplit` sets the copy column width; field panel fills the other column full height. Copy vertically centered. Accent glyph above the kicker.
- 390: stacks. Field panel height from `heroHeight` (120/180/240). When `heroSplit < 0.5` the field panel comes first, otherwise last, so the flip survives on phones.
- Compatible: asymmetry gentle or strong; any hierarchy; any rhythm; any contrast; ornament none/restrained/decorative.
- Page system: axis left or alternating.
- Content fit: any title length; hosts one or two; venue simple or complex.
- Parameters: heroSplit, heroHeight, motifScale, motifOpacity.
- Slots: field, accent.
- Incompatible: axis center; asymmetry symmetric.

**editorial_masthead**
- 1280: three rows. Meta row with strong rule above and hairline below, space-between. Body grid `1fr | railWidth` where rail width = 2× `bandHeight` (48/96/192), rail carries the band pattern full height. Divider row with glyphs left and CTA right.
- 390: meta row wraps; rail becomes a horizontal band of height `bandHeight` under the title; divider row stays.
- Compatible: asymmetry gentle; hierarchy restrained or editorial; rhythm continuous or punctuated; contrast low or moderate; ornament restrained.
- Page system: axis left or alternating; border hairline or double.
- Content fit: title medium or short (full-width single line at 1280); venue any.
- Parameters: heroHeight (compact recommended), bandHeight, motifScale, motifOpacity, displayTracking.
- Slots: band, divider.
- Incompatible: hierarchy monumental; long titles.

**editorial_offset**
- 1280: title block starts at `(1 − heroSplit)` of the width; plate covers the bottom 46% and the left `(1 − heroSplit) + 8%`; meta block sits bottom-left above the plate; CTA bottom-right.
- 390: title indented by 12% plus half `alignOffset`; plate becomes a full-width band of field height; meta and CTA stack under it.
- Compatible: asymmetry strong; hierarchy editorial or dramatic; rhythm alternating or punctuated; contrast moderate or high; ornament restrained.
- Page system: axis left. Border accented or hairline.
- Content fit: title medium; hosts any.
- Parameters: heroSplit (≥ 0.55), heroHeight, alignOffset, motifScale, motifOpacity.
- Slots: field, accent.
- Incompatible: axis center or alternating; asymmetry symmetric; hierarchy monumental.

**framed_invitation**
- 1280: outer padding = frame inset from `bandHeight` (14/36/64) carrying the frame pattern; inner box with rule plus outline; centered stack; corner glyphs from the accent motif.
- 390: inset × 0.75; the frame survives at full height.
- Compatible: asymmetry symmetric; hierarchy restrained, editorial, or dramatic; rhythm continuous or alternating; any contrast; ornament restrained or decorative.
- Page system: axis center; border double or hairline.
- Content fit: any.
- Parameters: heroHeight, bandHeight (as frame inset), motifScale, motifOpacity, borderWeight, displayTracking.
- Slots: frame, accent.
- Incompatible: axis left/alternating; ornament none.

**invitation_card**
- 1280: field-patterned alt surface; card object 760px max on the contrast surface, centered, with card-language border; divider glyphs between title and details.
- 390: card at full width minus 32px; same stack.
- Compatible: asymmetry symmetric; hierarchy restrained or editorial; rhythm continuous; contrast moderate or high; ornament restrained or decorative.
- Page system: axis center; card outlined or plate.
- Content fit: title short or medium.
- Parameters: heroHeight, motifScale, motifOpacity, displayTracking.
- Slots: field, divider.
- Incompatible: contrast low (card and field would not separate); ornament none.

**invitation_monogram**
- 1280: vertical stack, centered: ringed initial sized by `motifScale`, 72px rule, kicker, title at 0.62× display in small caps, hosts, glyph divider, when/where two-column with vertical rule, CTA.
- 390: when/where stacks with a horizontal rule.
- Compatible: asymmetry symmetric; hierarchy restrained or editorial; rhythm continuous; contrast low or moderate; ornament decorative.
- Page system: axis center; border double or hairline.
- Content fit: hosts any; venue any; title any (reduced scale absorbs long titles).
- Parameters: heroHeight, motifScale, displayTracking (≥ 0.06 recommended).
- Slots: accent, divider.
- Incompatible: hierarchy dramatic/monumental; ornament none.

**typography_first**
- 1280: kicker, uppercase title at 14ch max width, patterned band of `bandHeight`, space-between meta row, CTA.
- 390: same; title wraps to 3–4 lines.
- Compatible: asymmetry gentle; hierarchy monumental or dramatic; any rhythm; any contrast; ornament none or restrained.
- Page system: axis left or center; border accented, none, or double.
- Content fit: title short or medium (uppercase monumental needs ≤ 5 words).
- Parameters: heroHeight, bandHeight, motifScale, motifOpacity, displayTracking.
- Slots: band.
- Incompatible: hierarchy restrained; ornament decorative; long titles.

**statement_stack**
- 1280: three lines at 1.05× display, lines alternate left/right, third line indented by 2× `alignOffset`; vertical date label on the left edge; after-row with kicker, hosts, accent glyph, CTA.
- 390: lines still alternate; vertical label becomes a horizontal label above.
- Compatible: asymmetry strong; hierarchy monumental; rhythm alternating or punctuated; contrast high or moderate; ornament none or restrained.
- Page system: axis left or alternating; border none or accented.
- Content fit: title 5–7 words (three lines); hosts any.
- Parameters: heroHeight, alignOffset, motifScale.
- Slots: accent.
- Incompatible: axis center; hierarchy below dramatic; titles under 4 or over 8 words.

Grayscale distinctness check, hero only: split (block beside panel), masthead (ruled rows + rail), offset (diagonal with plate), framed (box inside a margin band), card (object on field), monogram (ornament-first stack), poster (uppercase block + thick band), stack (staggered lines + vertical label). No two share a silhouette.

---

## 3. Page system

```ts
type PageSystem = {
  axis: "left" | "center" | "alternating"
  surfacePlan: SP1 | SP2 | SP3 | SP4 | SP5 | SP6
  border: "none" | "hairline" | "double" | "accented"
  card: "flat" | "outlined" | "tinted" | "plate"
  button: "solid_square" | "solid_rounded" | "outline_square" | "underline"
  // derived, not chosen:
  typeScale: from composition.hierarchy
  spacing: from density
}
```

**Axes.** `left`: every section's inner container anchors to a shared left edge offset by `alignOffset`; headings and paragraphs left. `center`: inner containers centered, text centered, paragraphs centered with auto margins. `alternating`: odd sections anchor left with the offset, even sections anchor right with the same offset and right-aligned headings; container width narrows to 880px so the shift is visible. At 390 the alternation survives as right-aligned even sections.

**Border languages.** `none`: rules invisible, fields underline-only. `hairline`: rules at `borderWeight` px at 30% of text color, strong rules one step heavier, fields boxed. `double`: rules at 55%, strong rules 3px double, framed surfaces get an outer outline, fields boxed. `accented`: hairline rules, strong rules 2× weight in the accent color, headings with `accent-edge` get a left accent bar, fields underline in text color.

**Card languages.** `flat`: 6% tint of text color, no border. `outlined`: transparent, rule border. `tinted`: 12% accent tint, no border. `plate`: rule border plus offset outline.

**Button languages.** `solid_square`: accent fill, no radius, uppercase tracked small. `solid_rounded`: accent fill, 8px radius, sentence case. `outline_square`: transparent, 1.5px current-color border, uppercase. `underline`: text with a 2px underline, uppercase tracked.

**Surface plans.** Roles: `base` (page surface), `alt` (one step off base), `contrast` (the tonal flip), `framed` (base with a ruled inset container), `field` (alt carrying a pattern). The band is an optional strip after the hero, 2× `bandHeight` tall.

| Plan | Hero | Band | Details | RSVP | Registry | State |
| --- | --- | --- | --- | --- | --- | --- |
| SP1 dark opening | contrast | — | base | contrast | base | base |
| SP2 continuous light | base | — | base | framed | base | alt |
| SP3 interrupted | base | field | base | contrast | alt | base |
| SP4 alternating | contrast | — | alt | base | contrast | alt |
| SP5 framed body | framed | — | framed | framed | framed | framed |
| SP6 deepening | base | — | alt | alt | contrast | contrast |

Compatibility rules discovered during the proof (now in the harness):
- Inside a `framed` surface, a contained RSVP card or state plate drops its own border. No frame within a frame.
- A plan band after a hero that consumed its band slot takes the field pattern, never the same band pattern twice.

**Why one page system holds a page together.** Every section, whatever recipe it uses, inherits the same axis, the same rule weight and style, the same card and button treatment, the same type scale, and the same spacing. A split details panel next to an edge-interruption RSVP next to an uneven registry grid still reads as one site because the rules are drawn the same way, the buttons are the same object, the headings sit on the same axis, and the surfaces follow one plan. Incoherence comes from mixing systems inside a page, not from mixing structures.

---

## 4. Section recipes used by the twelve

Only what the proof needed. The library is not specified here.

**Details.** `details_split_panel`: accent-surface lead panel (heading + description) beside a card of when/where rows; stacks at 390. `details_stacked`: centered heading and copy, then ruled when/where rows, 720px max. `details_grid`: heading with accent edge, then a three-column ruled grid (date, time, place); one column at 390 with rules between. `details_sidebar_rows`: narrow kicker column beside a wide value column, hairlines between rows; at 390 the label sits above each value.

**RSVP.** All four wrap the same `rsvpForm()` DOM: lookup with collision error, OTP, party attendance, meal and dietary, custom question with validation error, submit. Recipes only change what surrounds it and how the form's grid places its blocks. `rsvp_contrast_split`: sticky intro column beside the form. `rsvp_contained_card`: heading and form inside one card-language card, 760px max. `rsvp_edge_interruption`: heading at 0.8× display, form as a two-column grid with lookup, OTP, custom question, and submit spanning. `rsvp_typographic_stack`: heading, then form blocks separated by rules, 680px max, no container.

**Registry.** `registry_featured`: native gift as a wide two-column feature card beside a stacked side column of external registry and cash fund. `registry_tiles`: three equal card tiles. `registry_editorial_list`: three ruled rows of thumbnail, text, button; no cards. `registry_uneven_grid`: `1.4fr 1fr 1fr` grid with the gift spanning two rows. All four append the same return prompt.

**State.** `state_quiet`: bordered gate box and a plain passed message, left on the axis. `state_plate`: gate and passed message inside one centered plate with a divider.

---

## 5. Parameters used

| ID | Steps | Bounded by | Mobile |
| --- | --- | --- | --- |
| heroSplit | .38 .45 .50 .55 .62 .68 | asymmetry: symmetric → .50; gentle → .38/.45/.55; strong → .62/.68 (offset ≥ .55) | side survives as panel order |
| heroHeight | compact / standard / full | density and hierarchy | 52/66/84% of viewport; field panel 120/180/240 |
| alignOffset | 0 / 48 / 96 / 144 px | asymmetry: symmetric 0; gentle ≤ 1; strong ≥ 2 | halved |
| measure | 52 / 62 / 72 ch | density | unchanged |
| bandHeight | 24 / 48 / 96 px | rhythm: continuous thin; punctuated medium or tall | also frame inset 14/36/64 and masthead rail 48/96/192 |
| motifScale | .75 / 1 / 1.5 / 2.25 | ornament | unchanged |
| motifOpacity | .08 / .14 / .22 / .35 | ornament: none ≤ .22; restrained ≤ .22; decorative ≤ .35 | unchanged |
| borderWeight | 1 / 2 / 3 px | border language | unchanged |
| displayTracking | −.05 −.02 0 .06 .14 em | hierarchy: monumental ≤ 0; small-caps recipes ≥ .06 | unchanged |

Dropped from the earlier candidate list: section vertical rhythm (already density), section inset (no visible effect once surfaces exist), card proportion (cosmetic), motif density (folded into scale for the proof).

Composition → compiler behavior as used here:
- **asymmetry** bounds heroSplit and alignOffset and excludes centered recipes when strong, excludes split/offset/stack when symmetric.
- **hierarchy** sets the type scale (restrained 1.2, editorial 1.333, dramatic 1.5, monumental 1.7 with uppercase display) and the display clamp; excludes masthead/monogram when monumental, excludes poster/stack when restrained.
- **rhythm** selects surface plans: continuous → SP2, SP5; alternating → SP1, SP4, SP6; punctuated → SP3.
- **sectionContrast** caps how many contrast flips the plan may contain: low ≤ 0 (SP2, SP5), moderate ≤ 2, high ≥ 2.
- **ornament** caps motif count and opacity and enables or disables arrangement glyphs (none: 1 pattern motif, no glyphs).

---

## 6. Motifs and typography, proof depth only

Patterns are CSS generators with two channels (current color at opacity, and 55% of it for minor lines): `plaid` (minor grid every 24×scale, major rule every 120×scale), `stripe` (5×scale on, 14×scale period), `gingham` (two perpendicular 50% stripes at half opacity), `linen` (1px crosshatch every 3–4×scale at low opacity). Arrangements place authored glyphs deterministically from the site seed: `equestrian` (horseshoe, bit ring), `botanical` (sprig), `celestial` (star, dot). Roles per motif are in `sites.js`. Slots without an assignment fall back to low-opacity linen because panels are never flat.

Twelve pairings across six categories, all self-hosted OFL fonts, listed in `sites.js`. Categories: heritage, high-contrast editorial, oldstyle, transitional, soft serif, grotesk-led. Oldstyle pairings do not hold at monumental and are excluded from that hierarchy.

---

## 7. The twelve sites

Full configs are in `sites.js`. Structural signature is `hero · plan · axis · rsvp · registry · typography category · hierarchy · tone`.

| # | Name | Signature | Should feel like |
| --- | --- | --- | --- |
| 01 | Deep Editorial | split · SP1 · left · contrast_split · featured · heritage · editorial · dark | Navy page opened by a cream hero beside a plaid field; the RSVP arrives as a cream interruption. Tailored, quiet, classic. |
| 02 | Winter Invitation | framed · SP5 · center · contained_card · tiles · high_contrast · restrained · light | A card set inside a double-ruled frame, every section boxed in the same frame. Bodoni, small, formal. |
| 03 | Modern Club | poster · SP3 · left · typographic_stack · uneven_grid · grotesk · monumental · mid | Forest-dark poster with a heavy grotesk title, a striped band, accent-bar cards, compact rhythm. Loud but disciplined. |
| 04 | Lodge Gazette | masthead · SP2 · alternating · edge_interruption · editorial_list · transitional · editorial · light | A newspaper front page: ruled meta row, wide title, striped rail; sections swing left and right. Underlined links. |
| 05 | Night Paddock | offset · SP4 · left · contained_card · uneven_grid · high_contrast · dramatic · dark | Playfair title pushed right over a gingham plate; strictly alternating dark and cream sections; plate cards with accent edges. |
| 06 | Evergreen Card | card · SP6 · center · typographic_stack · tiles · oldstyle · restrained · mid | A cream card floating on a linen forest field, Cormorant small caps, the page darkening toward the end. |
| 07 | Letterhead | monogram · SP2 · center · edge_interruption · featured · heritage · editorial · light | A ringed B, small-caps title, celestial divider, when/where pair; formal stationery that stays light and airy. |
| 08 | Big Sky Stack | stack · SP4 · alternating · edge_interruption · editorial_list · grotesk · monumental · dark | Three staggered Space Grotesk lines fill the first screen; a vertical date; hard alternating navy/cream blocks. |
| 09 | Cream Editorial | split (flipped .38) · SP6 · alternating · typographic_stack · tiles · soft_serif · dramatic · light | Linen field first, then a narrow Fraunces copy column; sections alternate axis and deepen to navy. |
| 10 | Midnight Frame | framed (deep plaid margin) · SP1 · center · typographic_stack · uneven_grid · transitional · dramatic · dark | A cream framed panel set inside a wide plaid margin band, Instrument Serif large; navy body. |
| 11 | Cream Poster | poster · SP5 · left · contained_card · featured · high_contrast · monumental · light | Bodoni uppercase at monumental scale, a gingham strip, the body framed section by section, underlined links. |
| 12 | Forest Masthead | masthead (wide plaid rail) · SP3 · left · contrast_split · uneven_grid · oldstyle · restrained · mid | Dark masthead with a wide plaid rail, then a plaid band, then cream interruption for RSVP; Garamond, compact. |

Pairwise structural similarity (weights: hero .35, plan .15, axis .10, RSVP .10, registry .10, typography category .10, hierarchy .05, tone .05): 66 pairs, maximum 0.50, none at or above 0.70. Nearest neighbors: 03–11 and 02–10 at 0.50 (same hero, same category or axis), 12–04 at 0.40, all others at 0.35 or below. Each hero appears at most twice, each surface plan exactly twice, no typography category more than three times. The raw table is in `collision.json`.
