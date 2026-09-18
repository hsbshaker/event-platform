# Independent semantic premise-overlap review — first v3 assembly

**Verbatim report of the independent reviewer.** Preserved unchanged as the evidence that
invalidated the first Gemini half. Not a corpus, not model evidence, and never shown to any
external author.

The reviewer was restricted to the six corpus files listed below and forbidden from opening the
prompt, the schemas, `src/`, the results directories, or the plan/contract/spec — and was told
nothing about which cases anyone suspected. It confirmed reading only those six files.

Subject: `assembly/01-assembled-pre-semantic-review.json`,
sha256 `1419a89093d95c50a49c4e8d413a97d9ca42e66c6dfd678cbab3c4c77ac869a3`, 37,871 bytes.

---

INDEPENDENT PREMISE-OVERLAP REVIEW — design-intent-sealed-challenge-v3.json (12 cases)

Files read, and only these:

- /home/user/event-platform/docs/model-evals/design-intent-sealed-challenge-v3.json (new)
- /home/user/event-platform/docs/model-evals/design-intent-regression.json (DIR-*)
- /home/user/event-platform/docs/model-evals/design-intent-validation-v2.json (DIV2-*)
- /home/user/event-platform/docs/model-evals/design-intent-validation.json (DIV-*)
- /home/user/event-platform/docs/model-evals/design-intent-sealed-challenge.json (DSC-*)
- /home/user/event-platform/docs/model-evals/design-intent-sealed-challenge-v2.json (SC2-*)

Nothing under docs/model-prompts, docs/model-schemas, docs/model-evals/results, src, or the
plan/contract/spec files was opened. This is a comparison of scenarios, not a judgement of the
system.

## CLASS 3 — SUBSTANTIVE (teachable overlap; action required)

**S1. DIC3-G02 <-> DIC3-M01 (INTRA-CORPUS, across the two independent halves)**

Shared: the same design problem posed twice. Both are a pale, daylit, botanical page in a
glass-roofed venue ("conservatory supper ... foliage overhead" / "heirloom glasshouse ...
conservatory glass panes"), anchored by a REQUIRED deep forest-green hex (#245B4A / #2D4030) that
the host supplies as the one non-negotiable colour, with "warm ivory" (exact phrase in both
preferredColors) as the ground, a loud-finish exclusion (metallic gold / hot pink and neon),
families {invitation, editorial} in both, tonal pools that both include "light", typography pools
overlapping on oldstyle + transitional, foliage/botanical motif sets ("loose foliage groupings" /
"pressed botanicals"), delicate-serif typography direction, and an inspiration set built from a
printed invitation plus conservatory imagery.

Reasoning: the events differ (wedding of 60 vs 50th anniversary) but the creative brief — "carry
this exact green through a pale botanical conservatory page" — is one brief written twice. A system
that satisfies one satisfies the other from the same lesson, so the corpus is paying for eleven
problems, not twelve. It also extends a prior house tendency: of the required hexes across all six
files, five are dark greens (DIR-03 #14532D, DIV2-11 #1F5A3C, SC2-09 #14543A, G02, M01). Action:
change one of the two — different venue class and a required colour that is not a dark green would
suffice; M01 is the weaker case to keep (see note under verdict).

**S2. DIC3-M03 <-> DIR-04 (design-intent-regression.json)**

Shared: the central device. DIR-04 honours "a woman who has spent thirty years repairing books for
a university library" and builds the visual language from bookbinding: "a sewn signature", "boards
left under a weight", "marbled endpaper", "laid paper, linen cloth and wheat paste", "papery",
spacing-minded type. M03 honours a "Master woodworker and rare book conservator" and builds from
"classic bookbinding typographic elegance", "bookbinder endpaper patterns", "pressmark rule lines",
"heavy felted paper stock", "blind embossed rules", small caps. "Endpaper" is a specialist term
that appears in both motif lists and nowhere else in six files.

Reasoning: this is exactly the "specific object/craft standing in for a person" trick the review is
asked to catch. Birthday vs memorial and the different register do not change the teachable part:
book-repair honoree -> bookbinding materials and endpapers as the design vocabulary. The
woodworking strand of M03 has no prior counterpart (SC2-04 taxidermy, DIV2-06 machine shop and
DIV2-11 hardware are workshops but not timber craft) and is clean. Action: drop the
rare-book-conservator half and the bookbinding motifs; keep the woodworker/guild-hall memorial.

**S3. DIC3-M04 <-> DIV-12 (design-intent-validation.json)**

Shared: the premise and its material vocabulary. DIV-12: a ceramicist opens her studio, fires the
kiln, sells seconds; palette "fired clay", "ash glaze grey"; motifs "a kiln shelf stacked for
firing", "glaze test tiles", "a wet clay handprint". M04: a ceramics studio ("KILN & CLAY Studio",
"Kiln & Clay Gallery") launches a batch; palette terracotta, cobalt glaze, raw clay beige; motifs
"pottery wheel rings", "ceramic stamp marks", "glaze drip outlines". Both are a pottery studio
receiving the public around its kiln and wares.

Reasoning: a ceramics studio is an unusual enough event subject that two occurrences in ~74 cases
is a real duplicate at the level of premise, and the earthy-matte-clay-plus-glaze-motif answer
transfers directly. Two things partly self-correct it and should be weighed: the register is
inverted (DIV-12 insists "a working building and not a gallery"; M04 is "high-key gallery
photographs ... Scandinavian pottery studios"), and M04 uses "artisanal" twice ("artisanal
precision", "authentically artisanal") — the very word DIV-12's host forbade — so a system
recalling DIV-12 would get M04's register wrong. But the shared material lesson is still teachable.
Action: keep the product-launch frame and light/no-gold constraints; change the product category
away from ceramics.

## CLASS 2 — NOTEWORTHY (real, recorded, not acted on)

**N1.** DIC3-G05 <-> DIV-06. Both are a book launch in a bookshop with a small audience and a host
prohibition on what the copy may say about the book ("must not reveal any twists or the ending" vs
"Do not describe the book as moving or as brave"). Opposite in every aesthetic respect (dark,
theatrical, suspenseful vs pale, single-ink, modest), so recall of DIV-06 would not produce G05's
answer; same event archetype and same constraint shape only.

**N2.** DIC3-G05 <-> DIC3-M05 (intra-corpus, across halves). Both are dark-only
(compatibleTonalDirections ["dark"], toneExplicitlyConstrained true), both put "midnight blue"
first in preferredColors, both carry the identical typography pool {grotesk_led,
high_contrast_editorial, transitional}, both include editorial + statement families, and both pair
the tonal lock with a literal-imagery exclusion (weapons/blood/tape vs golf clubs/rocking
chairs/clocks). Different events and organising ideas; the shared part is the "obey a dark lock
with contained highlights, and avoid the genre's clichés" shape.

**N3.** DIC3-G03 <-> DIR-07, DSC-03, DSC-06, DIV2-04, SC2-10. The warm, funny, non-solemn memorial
with a banned consolation phrase is thoroughly taught by the prior corpora (DIR-07 "do not use the
word passed", DSC-03 "nothing consoling", DSC-04 "no comfort phrases", DIV2-04 "the word
celebration not appear"). G03's "don't use phrases about closure or telling us to move on" is the
same constraint class and the same emotional problem (affection and laughter inside grief), in a
milder form. The dominoes/puns/Sunday-lunch particulars are fresh. Not disqualifying — family
memorials of this shape are common-domain — but it is the G case most answerable from prior
patterns.

**N4.** DIC3-M06 <-> DIV-09 (and DIR-09's "harvest feeling ... windfall apple reds"). Both are
community harvest gatherings. DIV-09's note warns that a system "will quietly upgrade [this] into
something charming and rustic ... three grades of countryside prettiness"; M06 asks for exactly
that answer ("woodcut rustic", "folk-inspired", bushel baskets, bunting, cider press gears).
Harvest festivals are a common archetype, so this is not a duplicate premise, but it is the prior
corpus's named failure mode presented as the target.

**N5.** DIC3-M05 name reuse: "Dr. Rosalind Vance". "Rosalind" is already the honoree in DIV2-01
("Rosalind and Deb") and DSC-02 ("Rosalind and Peter Achterberg"). Prior corpora already show name
tics (Marguerite x3 in DIV2-04, DSC-11, SC2-07; Achterberg x2 in DSC-02, SC2-02); within the M
half, adjacent surnames "Vane" (M03) and "Vance" (M05). Supplied facts are withheld from the model,
so this does not contaminate measurement, but a name this uncommon appearing in three files is a
signal that the M author and the prior authors may share a generative source or naming habit. Worth
knowing; not actionable.

**N6.** Cross-half phrase reuse, DIC3-G02 <-> DIC3-M04: hostConstraints "Please leave out gold foil
or other metallic gold effects." / "No metallic gold or foil effects.", each paired with a
pale-background constraint ("The background needs to stay pale throughout." / "The background must
remain light and clean—do not use dark backgrounds."), each with avoidColors "metallic gold". "Gold
foil" is common stationery English, but the same two-constraint pair (stay pale + no metallic
gold/foil) written by two blind authors is a coincidence worth recording.

**N7.** Tonal-lock host constraint as a house pattern: five of twelve new cases hang a host
constraint on background lightness (G02 pale, G05 dark, M02 dark, M04 light, M05 dark). The prior
corpora do this too (DSC-02, DSC-08, SC2-06, SC2-12, DIV2-05). Almost certainly an artefact of both
authors being told the identity has a toneExplicitlyConstrained field, not corpus leakage — but it
means nearly half the corpus re-poses one constraint shape.

**N8.** Shared construction and vocabulary between the new halves and the prior corpora. Both new
authors use the prior corpora's signature devices: same-type pairs (G01/G04 birthdays, with G04's
note explicitly distinguishing it from "the children's making party"; M01/M02 anniversaries, with
M02's note explicitly contrasting M01), the zero-constraint case (G01, G04, G06, M06; cf. DIR-05,
DSC-01, DSC-06, SC2-01, SC2-07, DIV2-09), and withheld suppliedFacts absent from the prose (G05's
note: "withheld facts, not information needed"). The G notes also map almost one-to-one onto the
prior corpora's dimension vocabulary ("sibling distinctness", "preservation of host authority",
"advisory", "resistance to event-type templating", "grounded personalization", "freedom from a
single aesthetic default", "downstream-only" — the last also in M03's note). This is consistent
with both authors receiving the same authoring brief rather than with reading the corpora, and the
two prose hands are clearly different (see H8). If that brief contained example cases, that is the
place to check; I cannot see it and do not need to.

## CLASS 1 — HARMLESS (common-domain; no action)

**H1.** DIC3-G01: "tomato red" also in SC2-10 preferredColors; cardboard/poster-paint children's-craft
textures recur (DIV2-03, SC2-12, DIV2-12). Ordinary colour names and materials. The cooperative
cardboard-town device itself has no prior counterpart.

**H2.** DIC3-G04: seafront setting vs prior harbour cases (DIV2-02, DSC-11, SC2-02); "a small warm
interruption in a broad cool field" echoes a recurring prior dominance idea (SC2-02 "one colour
incident", DIV2-09 "one living green that arrives late and small", SC2-11, DSC-06). Generic design
principle. The six-friends walk-to-café premise is fresh.

**H3.** DIC3-G06: a benefit for a school/community music programme also appears in SC2-07 (garage
show, "two-dollar cover ... to the school music room"), in the opposite register; "concert-program
sensibility" touches the prior "programme/running order/timetable as structure" device (DSC-02,
DSC-03, DSC-09, DSC-11, SC2-09). Ordinary.

**H4.** DIC3-G02: dietary-requirements RSVP constraint is the same downstream class as DSC-07's
allergy constraint; no-gold constraints appear in DIR-08, DSC-02, SC2-08. Ordinary.

**H5.** DIC3-G05 <-> DSC-09: bookish nocturnal interior ("night window blue", "reading-lamp
yellow"). Different event, different device.

**H6.** DIC3-M02: string lights (DIR-05, SC2-10), no-script/no-monogram constraint (DIR-08, DIV2-11,
DSC-03), flyer/stencil/wheatpaste aesthetic (DSC-03, SC2-07). All common urban-party vocabulary;
the rooftop night-market premise is fresh.

**H7.** DIC3-M05: the anti-cliché retirement constraint (golf clubs, rocking chairs, clocks) is the
same class as DIR-03 "No balloons or party-shop styling" and DIV2-03 "Balloons and confetti would
make this a retirement in general". The astronomy premise has no prior counterpart.

**H8.** Single-author tics, expected and fine: G author — "interruption(s)" in G03, G04, G05; hedged
modal voice throughout; notes closing on downstream-only status. M author — woodcut/woodblock in
M02 and M06; every case carries full US city+state facts; adjective-stacked marketing register. The
hands are distinct, which supports the independence claim.

## OVERALL VERDICT: ACTION REQUIRED

Three class-3 findings: S1 (G02/M01 duplicate the same required-green conservatory problem inside
the new corpus), S2 (M03 reproduces DIR-04's book-conservator/bookbinding device), S3 (M04
reproduces DIV-12's ceramics-studio premise and material vocabulary). All three fixes are local:
change one of G02/M01, strip the rare-book strand from M03, change M04's product category.

Does the corpus measure generalization or recall? Mostly generalization, with a lopsided split
between halves. The G half is largely fresh: G01, G04 and G06 have no prior counterpart in premise
or device; G03 and G05 lean on prior patterns only at the level of constraint shape. The M half is
where the recall risk sits: two of its six cases re-pose prior craft devices (S2, S3), one collides
with the other half (S1), and — outside the strict overlap remit but relevant to the question asked
— M01, M02, M05 and M06 are recognisable genre defaults (heirloom glasshouse anniversary, neon
rooftop, star-map astronomy, cider-press harvest) whose "correct" answer is the archetype itself, so
they reward aesthetic recall more than interpretation. After the three fixes, I would expect roughly
eleven of twelve cases to contribute fresh signal, and the corpus to be a fair generalization
measure with a mild bias toward the M half testing archetype execution rather than reading.

I found nothing that looks like copying: no reused venue names, surnames or distinctive phrases
between the new corpus and the prior five beyond the "Rosalind" name (N5) and the ordinary "metallic
gold/foil" phrasing (N6). The substantive findings are convergence on the same unusual devices,
which is exactly the thing a sealed corpus has to be free of.
