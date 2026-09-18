# Independent semantic premise-overlap review — replacement Gemini half

**Verbatim report of the independent reviewer.** Preserved unchanged. Not a corpus, not model
evidence, and never shown to any external author.

The reviewer was restricted to the corpora listed in its own report and forbidden from opening the
DesignIntent prompt, provider, input assembly, implementation, system-aware fairness material, gate
arithmetic or any statement of a desired outcome. It confirmed reading only those files. It was not
told which cases anyone suspected, and the ceramics/gallery recurrence the mechanical pass had
noticed was **not** pre-classified for it — the comparison corpora went in and the reviewer reached
its own conclusion.

Subject: `gemini-replacement/03-final-leakage-corrected-candidate.json`,
sha256 `381c9b8ac0d7ffc2cdfae7825a752c9a56a0127e5f29512b88da6caafcebc112`, 12,366 bytes.

---

INDEPENDENT SEMANTIC PREMISE-OVERLAP REVIEW
Subject: `provenance/design-intent-sealed-challenge-v3/gemini-replacement/03-final-leakage-corrected-candidate.json` (DIC3-M01..M06)

Files read for comparison (all in `docs/model-evals/`):
`provenance/design-intent-sealed-challenge-v3/chatgpt/04-leakage-correction-normalized.json`
(DIC3-G*), `provenance/design-intent-sealed-challenge-v3/gemini/04-leakage-correction.json`
(superseded DIC3-M*), `design-intent-regression.json` (DIR), `design-intent-validation-v2.json`
(DIV2), `design-intent-validation.json` (DIV), `design-intent-sealed-challenge.json` (DSC),
`design-intent-sealed-challenge-v2.json` (SC2). Nothing under model-prompts, model-schemas, src,
results, phase-4b-plan, model-contracts, spec.md or CLAUDE.md was opened.

Headline before the itemised findings: the six new cases re-land on the superseded Gemini attempt
almost slot for slot, despite the authoring session having seen none of it. Five of six have a
direct counterpart there (ceramics-in-a-Seattle-gallery, botanical glasshouse with moss green and
aged brass, retirement dinner for a navigator/observer with an anti-cliche constraint, an
"Oak ... Neighborhood Association" street festival with zero constraints, a dark high-contrast case
with a required hex and a no-script rule), and the sixth reuses a superseded case's exact
avoidColors string. That is the strongest possible evidence that these six are the authoring
source's default repertoire rather than deliberately chosen hard cases.

## FINDINGS

**1. DIC3-M01 vs superseded gemini/04 DIC3-M04**
Shared: ceramics exhibition in Seattle, WA; venue "Kiln & Vault Gallery" vs "Kiln & Clay Gallery"
(host "KILN & CLAY Studio"); inspiration "matte stoneware vessels photographed against raw concrete
and dark slate slabs" vs "high-key gallery photographs of unglazed ceramic vessels on concrete
pedestals"; guidance "structural column grids that mirror ceramic display pedestals" vs
"grid-based layout mimics studio exhibition cataloging"; "unglazed ceramic textures"/"raw clay" vs
"matte bisque stoneware"/"raw clay beige"; families editorial+statement in both. Only the tonal
direction is inverted (dark vs light) and the eventType label changed (gallery opening vs product
launch).
Class: **SUBSTANTIVE** (whole-premise duplication; venue-name reuse too distinctive to be
coincidence; house pattern).
Reasoning: this is the same event imagined twice with the lights turned down. An author who did not
see the earlier attempt producing "Kiln & ___ Gallery, Seattle, ceramic vessels on concrete" a
second time shows the premise is a default of the source, not a chosen probe.

**2. DIC3-M01 vs DIV-12 (open studio, ceramicist)**
Shared: ceramics as the craft; kiln, raw/fired clay, matte glaze textures in the palette and texture
fields.
Class: **NOTEWORTHY**.
Reasoning: DIV-12 defines itself as "a working building and not a gallery" and forbids "artisanal";
M01 is precisely the gallery framing DIV-12 rejects. Same material vocabulary, opposite creative
problem, so it is recorded not acted on.

**3. DIC3-M02 vs DIC3-G02 (other half of the same corpus)**
Shared: a wedding held in a glasshouse/conservatory with a continuous botanical thread and a
green-anchored palette; "pressed botanical leaf silhouettes"/"dusk greenhouse glass" vs "loose
foliage groupings"/"a continuous botanical thread could connect the invitation to the
conservatory"; families invitation+editorial in both; oldstyle/soft_serif typography in both.
Class: **SUBSTANTIVE** (same central organizing device within one 12-case corpus).
Reasoning: two of the corpus's three weddings are set in a glasshouse with foliage as the motif.
The only material difference is time of day (G02 pale daylight, M02 dusk candlelight); G02's
hospitality/long-table premise has no counterpart in M02, which has no human premise at all.

**4. DIC3-M02 vs superseded gemini/04 DIC3-M01**
Shared: glasshouse/greenhouse venue; verbatim preferred colours "moss green" and "aged brass";
"pressed botanical leaf silhouettes" vs "pressed botanicals"; "dusk greenhouse glass" vs
"conservatory glass panes"; oldstyle+heritage typography; invitation+editorial families.
Class: **SUBSTANTIVE** (same organizing device; unusual-phrase reuse; house pattern).
Reasoning: the botanical-conservatory-with-brass mood board recurs from a session that never saw
the first one. The exact colour-phrase pairing "moss green"/"aged brass" is the tell.

**5. DIC3-M03 vs DIC3-G02**
Shared: wedding; toneExplicitlyConstrained true; compatibleTonalDirections ["light"] only; a host
constraint forbidding dark backgrounds ("The background needs to stay pale throughout" vs "Do not
use black or dark background panels anywhere"); avoidColors carrying a dark/metallic exclusion;
families include invitation.
Class: **NOTEWORTHY** (solved-design-problem reuse in constraint shape).
Reasoning: the same light-locked wedding configuration appears twice in the corpus. G02's required
hex and dietary-RSVP constraint keep it a different test, so this is dilution rather than
duplication.

**6. DIC3-M03 vs DIC3-G04**
Shared: an open horizon as the organizing visual line ("clean horizon rule" vs "horizontal
bands"/"an expansive horizon"); a host-supplied landscape photograph of a wide pale sky as the
inspiration; pale sky-blue/straw/sand palette; "ample margins"/"wide intervals".
Class: **NOTEWORTHY**.
Reasoning: a shared visual device (horizon + breathable light field + landscape photo) but
different events and different social premises; G04's six friends on a walk has no counterpart in
M03.

**7. DIC3-M03 vs superseded gemini/04 DIC3-M04**
Shared: the exact avoidColors token "dark background colors"; a light-only lock with a "no dark
backgrounds" host constraint; toneExplicitlyConstrained true.
Class: **NOTEWORTHY** (phrase reuse, house pattern).
Reasoning: an identical non-standard string in a structured field, produced independently, marks
one authorial hand; the premise itself (alpine meadow) is new.

**8. DIC3-M04 vs SC2-02 (readable prior corpus), with DSC-12 and DIC3-G05**
Shared with SC2-02: dark cold ground; a required hot-orange hex in the host's voice used as "a
signal colour and not a field: one hit ... against a lot of grey" vs "#FF3300 signal red providing
sharp focal punctuation"; grotesk_led + high_contrast_editorial typography; statement+editorial
families; heavy plain display type. Shared with DSC-12: required orange hex (#FF4F00 vs #FF3300) as
"the loudest thing on the page"; compatibleTypographyCategories exactly ["grotesk_led",
"high_contrast_editorial"]; compatibleFamilies exactly ["statement","editorial"]. Shared with G05
(same corpus): a launch event, dark-only lock, near-black field with a single narrow orange
interruption, "large, tightly set type" vs "tight-strung, compressed" type, statement+editorial.
Class: **SUBSTANTIVE** (solved-design-problem reuse).
Reasoning: strip the synth/CRT vocabulary and M04 is "dark poster, mandated signal hex, heavy
grotesk, no script" — a problem SC2-02 and DSC-12 already pose and G05 poses again in the same set.
The premise (vinyl release) is new; the design answer is not.

**9. DIC3-M04 vs superseded gemini/04 DIC3-M02**
Shared: dark statement/editorial, grotesk_led + high_contrast_editorial, urban poster/flyer/stencil
heritage, a host constraint against "formal cursive, script lettering" vs "scripted, calligraphic,
or soft cursive fonts", electric orange/#FF3300 on charcoal/tape black.
Class: **NOTEWORTHY** (house pattern).
Reasoning: different events, same slot in the author's repertoire: the "dark, loud, no-script" case.

**10. DIC3-M05 vs superseded gemini/04 DIC3-M05**
Shared: eventType "retirement dinner" verbatim; a lifetime of navigation/observation honoured
through antique charts, brass instruments and coordinate grids ("latitudinal coordinate grids",
"maritime compass rosette", "brass sextant cases", "antique navigational charts" vs "astronomical
grid lines", "constellation diagrams", "19th-century astronomical atlases, star maps"); an
anti-retirement-cliche host constraint ("Do not refer to the event as an 'old age' party or use
humorous aging tropes" vs "Avoid cliche retirement tropes like golf clubs, rocking chairs, or
retirement clocks"); "professional academic respect" vs "scholarly elegance". Note that
"professional academic respect" has no referent in M05 (the honoree is a maritime craftsman) but
fits the superseded case's professor exactly — residue of the same template.
Class: **SUBSTANTIVE** (materially the same design problem; house pattern).
Reasoning: the sea swapped for the sky; a sextant is literally an instrument of both. The
incongruous "academic" line is direct evidence the case was generated from the same slot.

**11. DIC3-M05 vs DSC-11, DIR-03, DIV2-04 (readable prior corpora)**
Shared: the constraint shape "do not use phrase X about the honoree's age/leaving" (DSC-11 "Nobody
is to call her young at heart"; DIR-03 "Do not call it a celebration of a career"; DIV2-04 "the
word celebration not appear").
Class: **NOTEWORTHY**.
Reasoning: a benchmark convention across corpora rather than a premise; recorded because M05's
version is the least specific instance of it. Separately, the prior corpora's maritime cases
(SC2-02, DIV2-02, DSC-11) name "brass, anchors, navy stripes, rope-and-anchor prettiness" as the
cliche to avoid; M05 makes that cliche the brief. Not overlap, but it shows M05 is a stock genre.

**12. DIC3-M06 vs superseded gemini/04 DIC3-M06**
Shared: host "Oak Street Neighborhood Association" vs "Oak Valley Neighborhood Association"; venue
"Oak Street between 4th & 8th Aves" vs "Main Street & 4th Ave"; community street festival,
multi-generational, bunting motif ("festive pennant bunting" vs "festive harvest bunting"),
print-craft texture (risograph vs woodblock); hostConstraints []; "No visual inspiration supplied";
families statement+invitation; light tonal direction; eventType null in facts. Also Portland, OR
reused from superseded M01, and the exact dateText "October 24, 2026" reused from superseded M06 on
new M01.
Class: **SUBSTANTIVE** (whole-premise duplication; identifier reuse too distinctive to be
coincidence; house pattern).
Reasoning: the same event with the season changed. "Oak ___ Neighborhood Association" plus "& 4th
Ave" produced independently twice is not coincidence; it is the source's default civic host.

**13. DIC3-M06 vs DIC3-G01**
Shared: identical typography pool {grotesk_led, soft_serif, transitional}; bright primary-ish
palette including "sky blue"; papery print texture; no host constraints; no inspiration; "bold,
approachable" display with playful size contrast; light ground.
Class: **NOTEWORTHY** (same design solution).
Reasoning: G01 has a real premise (twelve children building a cardboard town) and M06 has none, so
a system that solved G01 solves M06 with the same answer; different event category keeps it short
of duplication.

**14. HARMLESS** (listed for completeness): benchmark-wide conventions shared with every prior
corpus — same-eventType light/dark pairing (M02/M03, as DIR-01/02, DIV-01/02, DSC-01/02,
SC2-01/02), "No visual inspiration supplied.", enum tokens, Notes beginning
"Exercises/Tests/Evaluates"; the first name "Clara" (M03) recurring from superseded M01's "Clara
Pendelton"; generic dates and cities; M02's "dark and lit evening" register shared with
DSC-02/SC2-06/DIV-13. None of these teach anything.

## OVERALL: ACTION REQUIRED

Five of the six cases are implicated at class 3: **M01, M02, M04, M05, M06**. M03 carries only
class-2 findings.

Two qualifications the lead should weigh when deciding the action:

(a) Findings 1, 4, 10, 12 are against the superseded file. If that file is treated as outside the
readable corpus, the action is not "these leak from a corpus the system reads" but "the authoring
source has a fixed repertoire and reproduced it; the cases are its defaults, not probes." Either
way the six cannot be trusted as sealed.

(b) Findings 3, 8 (in part) and 13 are within-corpus against the G half; their effect is dilution
of coverage rather than leakage. Finding 8 also stands on readable prior corpora (SC2-02, DSC-12)
and would be class 3 on that alone.

## Generalization or recall: recall

Every one of the six is a nameable genre mood board (ceramics gallery, moody botanical greenhouse
wedding, airy alpine wedding, synthwave poster, nautical-heritage retirement, block-party bunting)
with no human situation that pushes back on the genre — no host with a reason, no rule that costs
the design something, no structural oddity. The G half and every prior corpus build their cases
from exactly such situations (a ferry that leaves at 6:40, a family that has not spoken in nineteen
years, a rota of eighty-four readers). A system that can render six recognizable genres passes
these six; that measures whether it knows the genres, which the prior corpora already establish.

Minor consistency notes observed in passing, not overlap: M03's Notes describe M02 as an
"industrial greenhouse", which M02's text never says; M05's "professional academic respect" has no
referent in M05.
