# Phase A critique — written after looking at the renders, not before

Renders: `sheet-390-gray.png`, `sheet-1280-gray.png`, `heroes-390-gray.png`, `heroes-1280-gray.png`, `sheet-390-color.png`. Human-test sheet: `human-test-390-gray-unlabeled.png` (order in `human-test-order.txt`, do not show reviewers).

## The honest read

**Desktop, grayscale, first screen:** twelve heroes read as ten distinct compositions. The two exceptions are the repeated poster (03, 11) and the repeated masthead (04, 12). Both pairs differ in tone, type, and band, and a normal person would probably call 03 "the dark poster" and 11 "the fashion one," but a careful reviewer would put them together because the skeleton is identical: uppercase block, thick band, meta row. The other two repeated heroes, split (01, 09) and framed (02, 10), no longer collide, because their structural parameters change the silhouette: the flipped split puts the field first, and the deep frame inset turns a thin frame into a margin band.

**Mobile, grayscale:** the same ten-of-twelve. My expectation for the five-reviewer test is a median of 9 to 10 groups with the poster pair and masthead pair as the likely merges. That is at the pass threshold, not comfortably above it.

**Below the fold:** surface plans and alternating axis carry more than I expected. SP4 and SP6 produce a scroll rhythm that is obviously different from SP2 or SP5 even at thumbnail scale, and the alternating axis at 390 (right-aligned even sections in 04, 08, 09) is a strong identity signal. Details recipes are visible and different. Registry recipes are visible and different. RSVP recipes converge on mobile as predicted; on desktop the split, card, two-column, and ruled-stack shells are distinguishable but not striking.

**What the twelve prove:** the vocabulary contains at least ten perceptibly different sites and the page system holds each one together. Nothing in the twelve looks like a broken combination. **What they don't prove:** that eight heroes are enough for sixty sites, or that a seed finds these twelve without a human choosing.

## Which parts were powerful

1. **Hero recipes with a structural parameter.** Split's flip and framed's inset each turned a repeat into a non-repeat. This is the single most important finding: a hero recipe earns its place only if at least one parameter changes its silhouette, not its styling.
2. **Surface plans.** Six plans gave six visibly different scroll rhythms. Cheap to author, high perceived value.
3. **Alternating axis.** Cheap, and it survives on phones.
4. **Hierarchy extremes.** Restrained versus monumental changes the page more than any motif does.
5. **Typography category.** Bodoni, Archivo, Cormorant, and Space Grotesk produce different voices at a glance, even in grayscale.

## Which parts were cosmetic

- **borderWeight, displayTracking, measure.** Invisible at thumbnail scale; barely visible at full size. Keep them, but never count them toward diversity.
- **Card and button languages.** Real at full size, near-invisible in a grayscale contact sheet. Coherence tools, not diversity tools.
- **motifScale and motifOpacity.** Perceptible only on field and frame roles. On accents and dividers they don't register.
- **State recipes.** The gate box looks like a gate box everywhere. Two recipes were one too many for the proof.

## Fake combinatorial variation

- heroSplit at .50 versus .55 is not a different site. The useful steps are .38, .50, .62; the rest are for content fit, not diversity.
- Same-hero pairs that differ only by tone and typography (03/11, 04/12) are the definition of "same site, different outfit," even though the metric scores them 0.40 to 0.50. The metric under-weights hero identity when the hero has no structural parameter.

## The likely visual bottleneck

Hero recipes without a silhouette-changing parameter. Poster and masthead each have only band size, and band size doesn't change the skeleton. For sixty sites each hero appears seven or eight times, so any hero that can't change shape will be recognized by the third repetition.

## Is Phase 1 scope enough for the sixty-site test?

**Eight hero recipes: not as authored.** Either twelve heroes, or eight where every one has a structural parameter with at least two visibly different states. I'd do both: fix the two weak recipes and add four. Concretely:
- Give **poster** a structural parameter: band position (under title, above title as a header block, or as a left rail beside the title). Three silhouettes from one recipe.
- Give **masthead** one: rail position (right rail, left rail, or full-width band above the title).
- Add four heroes: an editorial **side-rail date column** (date and venue as a tall vertical column beside a stacked title), an invitation **ticket strip** (a horizontal card with perforated rule and a stub column), a statement **numeral hero** (the date's numerals as the dominant object with the title secondary), and an editorial **rule grid** (title inside a visible column grid with meta cells).

**Four RSVP recipes: enough for mobile, thin for desktop.** Mobile convergence is accepted. On desktop, the four shells are distinguishable but the two-column and split variants are close. Add one wide-heading variant (heading as a full-width band, form beneath in a narrow column) before the sixty-site test; that's five.

**Page system: held coherence in all twelve.** No combination looked wrong. Two compatibility rules were discovered and added: no frame within a frame, and no duplicate band after a band-consuming hero. Expect a handful more from sixty sites, all of this shape.

**Verdict:** the vocabulary contains ten to twelve genuinely different sites. It does not yet contain sixty. The fix is narrow and known: structural parameters on every hero, four more heroes, one more RSVP shell. Then Gate 2.

## Changes I would make to the architecture after this proof

1. **Hero recipe admission rule.** A hero recipe must declare at least one structural parameter whose extreme values change its grayscale silhouette. Recipes without one are not admitted. This is the rule that would have caught poster and masthead before rendering.
2. **Signature metric revision.** Add a hero-structure term: same hero *and* same structural-parameter bucket scores an extra 0.15. Compute mobile and desktop signatures separately, since axis and split differences shrink at 390. Keep the 0.70 threshold.
3. **Compatibility rules live on recipes, not in prose.** The two rules found here are `requires`/`excludes` entries on recipe definitions: `rsvp_contained_card.excludes.surfaces = ["framed"]`, and a plan-level rule that a band after a band-slot hero switches to the field motif.
4. **Parameters split into structural and cosmetic.** Structural (heroSplit side, frame inset, rail width and position, band position, alignment axis) count toward diversity and are planned by the diversity engine. Cosmetic (borderWeight, tracking, measure, motif scale and opacity) are seeded but never counted.
5. **The diversity planner assigns structural parameters, not only family and tone.** For a batch of three, assign distinct hero recipes where possible, and when a hero repeats within a redesign history, force a different structural bucket.
6. **Drop state recipe variation from Phase 1.** One state recipe, styled by page system. The second added nothing.
7. **Content fit is real and cheap.** The monogram recipe's reduced-scale title and the poster's 14ch cap are content-fit rules that already exist in the CSS. Formalize `contentFit` on recipes now; it costs nothing and it's the "designed for my event" signal.
8. **Keep the harness.** It is config-driven and already renders from the same shapes the compiler will emit. Gate 2 is this harness plus a seeded selector plus the signature check, not a new tool.

None of this changes the six-field-plus-composition DesignIntent, the compiler pipeline, immutability, or the page-system idea. It changes what a hero recipe must be and how diversity is counted.
