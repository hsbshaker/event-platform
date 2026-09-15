# Revision 6 Documentation Changelog

Revision 6 replaces the bundled-archetype renderer model of Revision 5 with the **composition language**: the model authors the page composition from a bounded set of trusted primitives; a deterministic compiler validates, repairs, fits against rendered geometry and freezes the result. Decided by three proof phases (`proof/`, `proof-a1/`, `proof-b/`), each with committed evidence.

## Renderer-architecture changes

Removed:
- `ArchetypeDefinition` bundles and the six archetype IDs;
- archetype-owned section/component treatment defaults and their enums;
- `heroArchetype` in `DesignIntent`;
- the "first three archetypes, then the remaining three" implementation gate.

Added:
- `CompositionTree`: nine layout containers, five decorative leaves, thirteen semantic nodes, enum tokens only; nesting, depth, box-depth, coverage and limit rules; capability scoping;
- `DesignIntent` v3: `family` and `composition` replace `heroArchetype`;
- a third strong-model call, `generateComposition(...)`;
- deterministic repair by kind (structural, coverage, capability, responsive, planner, fit) with no model call; re-prompts only for schema-invalid output, token-cap violations and selector collisions;
- rendered-geometry verification as the authoritative content-fit gate, with a CSS floor guaranteeing zero horizontal overflow;
- the sibling planner: distinct DesignIntents and structural directives per batch of three, attractive-token allotments (staggered titles, hero numerals, watermarks);
- the skeleton signature (structural tokens, per-breakpoint) and the .70 collision threshold;
- the library: Phase A.1 recipes as regression fixtures, few-shot examples, repair/fallback macros and calibration data;
- `ResolvedDesignSpec` v2 with the canonical tree, per-node resolved layout, verification record and version set;
- the proof harnesses as the regression suite and the confirmation-run thresholds.

Unchanged: Event Identity; the semantic palette compiler and contrast rules; typography pairing IDs and categories; motif roles, channels and caps; density; guest semantic flow; mobile convergence; immutability of generated data; imagery boundaries; every product-flow rule of Revision 5.

## Evidence

- Phase A (`proof/`): twelve hand-composed sites from one brief; ten distinct; two collisions traced to heroes without a structural parameter.
- Phase A.1 (`proof-a1/`): hero admission rule, twelve heroes with 27 silhouettes _(as reported at the time; the actual fixture count is 26 — see Revision 6.2 below, where the miscount is reconciled)_; Gate 2: sixty seeded sites, zero collisions, all skeleton classes distinct.
- Phase B (`proof-b/`): the language, primitive renderer, adversarial fixtures (37 repaired, 10 rejected), 152 exploratory model trees, then the six gate changes and a frozen confirmation run (`FREEZE.md`, `FINAL.md`): 72 uncurated trees in sibling batches; 72 of 72 schema-valid on the first call; 72 of 72 repair-valid with 71 raw trees breaking no rule; 58 distinct hero skeletons in 60, 78% outside the library; 0 sibling collisions; staggered titles 20, hero numerals 12, watermarks 3 of 60 under the caps; geometry clean on 71 of 72 under the frozen compiler and 72 of 72 after one renderer rule (containers and components always take a Stack's full width), re-verified over the identical trees.

## Conditions recorded with this revision

1. The one post-freeze renderer rule (compiler `proof-b-0.3`) is part of the canonical rule set; any further change to the language, validator, compiler, renderer rules or planner reruns the regression gates of `event-renderer-system.md §9`.
2. The design-quality bar (reviewers rate ≥ 70% of model first screens designed) is a **launch and design-quality gate, not a canonicalization gate**, and is not yet evidenced by humans. It runs twice: once now on the Phase B sheets for calibration against the library and to inform the production model and prompt, and again on the frozen production generation stack as the launch gate. An AI-proxy review on the prepared unlabeled sheets rated 45% of model screens designed against 35–40% of the hand-authored library screens; the model meets or exceeds the library, the instrument is harsh on grayscale thumbnails. The five-reviewer human test (`proof-b/human-test-form.md`, scored by `proof-b/score-human.js`) must run before launch, and the threshold is to be calibrated against the library's score in the same session.

## Revision 6.1 — content lifecycle and generation sequencing

Clarifications, not architecture: three separate layers (`Capabilities` = enabled features, `ContentProfile` = present content, `FeaturePresentationState` = guest visibility, never sent to the model); DesignIntent and CompositionTree immutable with content edits appending new immutable `ResolvedDesignSpec` revisions per concept and no model call; required details as publish requirements collected during generation with bounded provisional content and deterministic re-fit, never a prerequisite for concepts; end time optional; an exact RSVP-deadline default; human review run twice. See `spec.md §0b`.

## Revision 6.2 — clerical reconciliation of the hero-silhouette count

Bookkeeping, not architecture. No behaviour changes and the composition language is untouched.

The canonical library holds **26** hero silhouettes, not 27. Phase A.1's `heroRecipes` contains twelve recipes whose declared structural variants sum to 26 (`editorial_masthead` and `typography_first` have three each, the other ten have two), and `proof-b/library.js` implements exactly those 26. The "27" was a counting error that propagated from the Phase A.1 write-up into this revision's text, and the comment in `library.js` repeating it is part of the same error. No fixture is missing, and none was invented to make the number fit.

Corrected here because both statements describe the actual library:

- `event-renderer-system.md §7` — the library is 26 silhouettes and 13 section recipes;
- `event-renderer-system.md §9` — the expressiveness gate is all 26 silhouettes and 13 section recipes;
- `e2e-workflow.md` — the same gate in the generation-run checklist.

The section-recipe count of 13 was already right: four details, five RSVP, four registry.

Frozen proof evidence keeps its original wording. `proof-a1/vocabulary.md`, `proof-b/README.md` and `proof-b/PROPOSAL.md` are the record of what those phases said at the time, and `FREEZE.md` pins their hashes; rewriting them to tidy a number would damage the evidence the architecture rests on. The correction is canonical here instead.

A related count, recorded so the Phase 3 replay gate is unambiguous: the frozen confirmation set is **72 trees**, 60 full-capability and 12 reduced. Phase B made 74 composition calls, because two selector collisions were re-prompted; those two rejected attempts are evidence of the collision path working, not confirmation trees. The Phase 3 replay gate is 72 of 72.

Where frozen proof artifacts state 27 (`proof-a1/vocabulary.md`, `proof-b/README.md`, `proof-b/PROPOSAL.md`, and the comment in `proof-b/library.js`), that wording is preserved as the historical record and is the miscount this entry reconciles. Those files are pinned by `proof-b/FREEZE.md` and are not edited. Current canonical documents state 26.

## Revision 6.3 — the one intentional production correction in the Phase 3 port

Implementation history, not architecture. The CompositionTree language, the primitive set, the
planner and the creative architecture are untouched; this records a narrowly scoped correctness
fix so a later reader does not mistake it for drift.

Phase 3 ports `proof-b` to production TypeScript. It first established **exact parity**: the
reference engine's output over the library, the adversarial set and the frozen confirmation run
was captured as a golden oracle (`tests/fixtures/renderer-golden/`) before any production code
existed, so "no behaviour change" was measurable rather than asserted.

The port then exposed a defect in the reference. `repair()` addresses nodes by dot-path and
derived a node's parent by slicing off the last dot-segment. An array index lives *inside* one
segment (`children[3]`), so that always yielded the parent **node**, never the `children` array,
and `Array.isArray(parent)` was false everywhere. No array-child repair could reach its removal
branch: a duplicate or capability-disabled node was replaced in place by a hairline `Rule` the
model never authored, and the node-budget repair's graded path was unreachable, so every
over-budget section was flattened to its first eight leaves.

Production corrected it, because the reference behaviour contradicts higher-authority canonical
contracts: `event-renderer-system.md §2.3` says the validator **drops** a reference to a disabled
capability, and §3 describes graded repair, which `spec.md §32` #22 requires to be deterministic
rather than a demolition. Only the parent lookup changed; the repair ordering, guards and log
text are as ported.

The frozen proof and its oracle were **not** rewritten. `adversarial-structural.json` still
records what the reference does, and the parity suite asserts the reference still replays to it
byte-for-byte, so the divergence stays visible instead of being edited away.

Measured across all 164 golden items:

| Golden set | Diverging |
| --- | --- |
| 26 legacy hero fixtures | 0 |
| 13 section recipes | 0 |
| 16 A.1 pages | 0 |
| 72 accepted confirmation trees | 0 |
| 37 adversarial structural fixtures | **5, intentionally** |

Reference parity and production conformance are separate test concerns from here on: the
byte-for-byte comparisons live in `parity.test.ts` and die with `proof-b`; the behaviour the
canonical documents require is stated independently in `composition.test.ts` and outlives it.
Full detail, including the five fixtures by name, is in `docs/phase-3-reference-defects.md`.

## Human Test #1 — stopped early; qualitative calibration evidence

Human Test #1 was **stopped early by decision**. It is qualitative calibration evidence, not a
pass/fail gate, and **no pass/fail claim is made**. The frozen assets — both sheets,
`review.html`, the hidden key, `proof-b/human-test-form.md`, `proof-b/score-human.js` and
`scripts/human-test/score.mjs` — are unchanged. **Human Test #2, on the frozen production stack,
remains the launch design-quality gate.**

This supersedes the expectation in condition 2 above that the first run would be scored against
the library in the same session. The rest of condition 2 stands: the bar is a launch and
design-quality gate, not a canonicalization gate, and it runs twice.

**`docs/human-test-1/qualitative-findings.md` is the canonical record of the qualitative
evidence.** Findings live there and nowhere else; this entry is a pointer, not a second copy.

Four findings are recorded, in two deliberately separate classes:

*Defects in what we already ship — "stop looking broken":*

- **F1, typography composition** (high confidence, high severity, Phase 3.1). Valid layouts
  produce accidental-looking headline stagger, inconsistent continuation-line alignment and
  pathological narrow-column wrapping. Every clause of the geometry clean criteria is a
  *containment* test, so all of it passes: the renderer knows whether text physically fits, but
  not whether the resulting typography looks intentionally composed.
- **F2, decorative hierarchy** (medium-high, Phase 3.1 narrow safeguard or defer). Decoration can
  dominate spatially while semantic content becomes visually insignificant, so pages read as
  unfinished. Note for scoping: the `Monogram` is explicitly exempt from the ornament budget
  ("the initial is event content, not ornament"), so this is not an extension of an existing
  budget but a new, small hierarchy check.

*Capabilities we do not have — "raise the creative ceiling":*

- **F3, missing thematic hero imagery** (medium-high confidence, potentially high severity,
  Phase 4). Typography, layout and motifs alone often do not provide enough thematic specificity.
- **F4, ambient thematic imagery** (medium, Phase 4). Some designs may benefit from a
  low-emphasis thematic layer. Planned as one system with F3, not as a separate feature.

A synthesis worth testing rather than assuming: with no imagery, the renderer must carry all
visual interest with typography and decoration, which may partly explain F1 and F2. A thematic
anchor may let designs become simpler and more confident. That is a hypothesis for Human Test #2.

**The MVP non-goal on AI-generated site imagery is not removed here.** F3 and F4 challenge it, so
it is recorded as a product decision requiring intentional revision, with the original assumption,
the new evidence, a proposed revised decision, and the canonical documents that would need
amendment — all in the findings document. No contract, spec or guardrail is amended by this entry.

Sequence: Phase 3.1 (deterministic visual-quality hardening, no imagery, no model calls, prefer no
schema change) → Phase 4 (creative generation, with the visual-anchor architecture now explicitly
under consideration) → Human Test #2 as the launch gate. Any Phase 3.1 change re-runs the §9
regression gates.

## Revision 6.4 — Phase 3.1: composition is verified, not only containment

The response to Human Test #1's F1. It changes the *criterion* for a final spec, so it is recorded
here rather than left in an implementation note. `docs/human-test-1/qualitative-findings.md` stays
the canonical record of the evidence; this entry records the contract change.

**§3.1 gains a second question.** It asked whether text fits — page overflow, element overflow,
text overflow, all three containment tests. It now also asks whether the text is *composed*, from
rendered line boxes (`Range.getClientRects()`) rather than from a bounding box divided by a line
height. Three defects join the clean criterion, all of which must be zero:

- `textWordBroken` — line boxes exceed the node's count of unbreakable segments (runs with no
  break opportunity inside them: whitespace, hyphens, dashes and slashes all end one), which
  proves a break landed inside a segment. The minimum usable measure, stated without a threshold.
- `textOverMetadataLimit` — an atomic metadata value (`Date`, `Time`, `Venue`, `Location`) at
  `secondary` or `caption` past `max(2 desktop / 3 mobile, ⌈words ÷ 3⌉)` line boxes. `FIT_LIMITS`
  covered `display` and `primary` only; this covers the emphases where §3.1 was silent.
- `textEdgeIncoherent` — line boxes that do not share their aligned edge, with the two `EventTitle`
  treatments exempt.

The first is repaired by the existing ladder — demote one emphasis step, then relax the innermost
`Frame`/`Surface`/`Rail`. The second is relaxation-only, because its budget applies at and below
the demotion floor. No new repair kind, override kind or relaxation was added. The third has no
repair and is reported: a displaced line is not a narrow one.

**`EventTitle.layout` is documented rather than implicit.** The 0–1 / 2–3 / rest word slice
appeared in no document and was invisible to the model, the schema and the validator at once. The
model chooses the treatment; **where the title breaks is the compiler's**, chosen deterministically
by scoring the possible cuts. `stagger` offsets the odd lines and `cascade` ramps from the second — different lines, so the two
stay distinct on the two-line titles that are the majority — instead of flipping a line's
alignment to the opposite margin. The offsets are lengths in `em`, not percentages: CSS resolves
percentage padding to zero during intrinsic sizing, so a shrink-wrapped title was measured as
though the indent were not there and then lost exactly the indent from its longest line. That,
and not the size of the ramp, is the old `cascade` rule's real defect.

No schema change, no new primitive, prop or token, no primitive-set version bump, no model call,
and nothing new exposed to the model — so `spec.md §32` #15 and #19 are untouched and the Library
Boundary Invariant is not involved.

`COMPILER_VERSION` **is** bumped, to `compiler_phase3_1_0`. The clean criterion changed, the
overrides produced for identical input changed, and `verified` carries three new counters, so a
spec stamped `compiler_phase3_0_1` is not equivalent to one stamped after this. Such a spec was
also verified against the old line breaking and the old heading wrap, so re-rendering it requires
re-verification rather than a silent recompile (`CLAUDE.md §5`).

**Gates re-run** (`event-renderer-system.md §9`): the full unit suite; the 72-tree frozen
confirmation replay through production geometry, 72 of 72 clean; `proof-b/test.js`;
`proof-b/adv-run.js`, 37 of 37 repair-valid with zero overflow at either width. Two of the 72 —
frozen 32 and frozen 51 — were clean on the old criterion and are not on the new one; both are
repaired by a structural relaxation and come out clean, and both are pinned by name as regression
cases.

Stated plainly, because the gate list can otherwise imply more than it delivers: **the two
`proof-b` harnesses exercise none of the changed code.** `proof-b` carries its own renderer,
stylesheet and verifier, including its own copy of the old word slice; the two runs prove the
language and the repair rules are undisturbed, which is what they are for, and nothing about this
change. §9's "sibling-batch confirmation run" is served here by the 72-tree replay **through
production**, which is the stronger gate for a production-renderer change and the only one that
can see it. The content sweep in `typography.test.ts` covers the axis all of these hold fixed:
every fixture in the repository renders one title, and these checks are content-dependent.

**F2 is deferred to Phase 4.** Its Phase 3.1 condition was that a safeguard be a small extension of
existing infrastructure. It is not: the `Monogram` is exempt from the ornament budget by explicit
decision, it carries no scale to bound, and reducing decoration is neither a demotion nor a box
relaxation. Reasons in full in the findings document.

**Human Test #1's evidence is now a *before* measurement.** Hardening changes rendered geometry, so
the §9 confirmation thresholds that include a human design-quality rate are carried by Human
Test #2, which remains the launch gate.

## Revision 6.5 — product doctrine, and the two Phase 4 decisions it forced

Documentation and evaluation-fixture changes only. No implementation, no model call, no prompt, no
schema, no renderer or compiler change.

**`docs/product-doctrine.md` is new and canonical for product and creative intent**, read first in
`CLAUDE.md` and `docs/README.md` and ranking last in conflict resolution: it explains what we are
trying to build, and decides nothing. `spec.md` remains the authority for requirements. It exists
because the architecture was well documented and the product was not — an agent could satisfy every
contract here and still ship the wrong product, which Human Test #1 demonstrated when every screen
reviewers called broken passed every gate we had.

**Two product decisions are now approved and canonical.**

- **`spec.md §7.6a` — optional AI-generated thematic artwork in Phase 4.** This reverses Revision
  6's non-goal, deliberately and on evidence: reviewer reference invitations derived their identity
  from a coordinated theme-specific visual language, so thematic artwork is judged part of core
  design quality rather than decorative scope. Imagery is optional, art-directed to the
  composition, and placed by the compiler through the composition language — never mandatory, never
  by pixel or model-authored CSS. Host photography, galleries and stock imagery remain excluded;
  `§7.6`'s reference-translation rule governs; the image model and artwork schema are unselected.
  `§5.1`, `§5.2`, `§11.11`, `§20.1`, `§32 #32`, `§33`, `§34`, `design-system.md §15.11` and
  `event-renderer-system.md §8` are reconciled.
- **`spec.md §7.6b` — adaptive creative clarification.** Event Identity may ask a creative
  clarifying question before concepts, bounded: preferred zero, ceiling three, generated from real
  ambiguity, always offering `You decide`, never a low-level design choice, **never a logistics
  field, and never a gate on concepts appearing.** The wizard prohibition stands; `§32 #9` now names
  this as the one permitted pre-concept question. The question schema, the model contract and the
  surface are undesigned.

**`spec.md §7.5` now states Event Identity's responsibility**: the only stage that receives the raw
prompt, and the holder of the boundary between facts — quoted from the host or absent — and
aesthetic inference, which is expected and generous.

**The creative-understanding gap is closed on paper.** `model-contracts.md §4.5` defines the
evaluation contract over a fourteen-case corpus (`docs/model-evals/creative-understanding.json`):
vague and taste-heavy prompts, negative constraints, prompts already clear enough that zero
questions is correct, fact-bearing prompts, one open delegation, one genuinely ambiguous case. Ten
rubric dimensions, each labelled deterministic, mixed or qualitative — fact discipline is fully
mechanical, cliché avoidance and clarification judgment and reference translation are mechanical
only in their negative half, and understanding itself needs a human. No runner exists yet.

**Phase 4 gains a creative exit criterion.** It is no longer complete on valid JSON, validating
schemas, compiling trees and acceptable latency; it requires evidence against §4.5 that the system
understands representative prompts, invents no facts, clarifies selectively, produces materially
distinct directions faithful to the identity, and reaches *personalization rather than rescue*.

**The ≥ 70% human design-quality bar is removed from both regression-threshold lists**
(`spec.md §11.9`, `event-renderer-system.md §9`) and its status made unambiguous. It is a launch
gate, not a regression threshold — a code change cannot re-run it. Human Test #1 was stopped early,
produced calibration evidence only and established no pass/fail result; no score is claimed from
it. Human Test #2 is the launch-quality human gate and calibrates its own threshold rather than
inheriting a number that was never approved as settled. This resolves the standing contradiction
between `spec.md §11.9` and condition 2 above.

**Clerical:** the `spec.md` header now reads Revision 6.1 rather than Revision 5; `§11.11` states
the imagery boundary directly instead of citing Revision 5 sections absent from the file; and
`event-renderer-system.md §8`/`§9` cite it rather than an absent Revision 1. Still open, and not
invented: `model-contracts.md §4` and `§5.2` defer to a Revision 1 not in this repository for the
EventIdentity field list and the DesignIntent input contract — the requirements survive in the
committed schemas and `spec.md §7.5`, so nothing is lost, but the citations are dead pointers.

## Revision 6.6 — the wait is a product surface

Documentation only, and an addendum to Revision 6.5.

**Generation is a product surface, not a loading state to hide** (`spec.md §7.10`, intent in
`docs/product-doctrine.md §8a`). The host should feel "I'm watching my event come to life", not
"I'm waiting for AI to finish" — which is never an argument for slowing anything down: the moment
useful output is genuinely ready, it is revealed.

Three behaviours are now approved:

- **Concept-level readiness.** Each concept becomes available as soon as its resolved spec exists;
  no concept waits on its siblings, and there is no single monolithic "generation complete".
- **Real artifacts, never theater.** The surface may show structured creative output the pipeline
  actually produced — interpreted signals, palette territory, visual vocabulary, concept names, art
  direction, fragments, previews, readiness. **Never model reasoning or chain-of-thought, and never
  fabricated progress**: no invented percentages, no simulated "thoughts", no stage claiming work
  that has not happened.
- **Optional detail entry during generation.** The host may fill in facts only they know while
  generation runs — the §7.3 form offered rather than demanded. Watching and filling in are equally
  valid. Missing logistics still never block generation, are never asked during creative
  clarification (§7.6b), and are never invented (§7.5). §4.1 still governs: the wait never becomes a
  mood-board picker, font or palette chooser, layout selector or questionnaire.

**Human Test #2's protocol and pass threshold are frozen and recorded before the production results
are reviewed** (`spec.md §11.9`, Phase 10). Calibration against the library happens in the same
session; the bar is never chosen or adjusted after the outcome is known. Moving the goalposts
post-result voids the gate.

**One latency conflict is recorded rather than resolved.** `spec.md §7.10`'s p75 targets — identity
≤ 5 s, first concept ≤ 15 s, all three ≤ 45 s — predate the artwork decision and budget nothing for
image generation, while the product intent expects the first concept in ~15–20 s and heavy imagery
cases at 60–90 s. **The canonical numbers are unchanged.** §7.10 now records that imagery is
unbudgeted there, and they are re-set deliberately against a measured imagery path rather than
widened quietly to match what gets built. `product-doctrine.md §14` conflict 9.

## Revision 6.7 — Phase 4A closed GO; Event Identity is in production at `v5`

**Status change, not a requirements change.** No product requirement, guardrail, acceptance
criterion, prompt, schema or line of production code moves in this revision. What changes is what
canon *says is true*.

**`event_identity_v5` / `event_identity_schema_v5` is the accepted production interpretation
contract.** Phase 4A closed **GO** on 2026-09-15 after six live evidence runs: `v3` against the
fourteen-case regression suite (13/14 mechanical) and `v4` against the first sealed challenge
(11/12), both of which failed their independent qualitative gate and produced the `v4` and `v5`
remediations; then four at `v5` — regression 14/14, the spent-challenge diagnostic 11/12, the
pre-registered holdout 12/12, and a freshly authored sealed challenge at 11/12 with a blind review
of 7 Excellent, 5 Good, 0 Borderline, 0 Fail. The go/no-go record, its six SHAs and the numbers are
in `model-contracts.md §4.6`; `development-plan.md` carries the status; `product-doctrine.md §15`
carries what it means against the product bar.

**Stale text corrected.** `model-contracts.md` advertised Event Identity at `v2`, headed its result
envelope `event_identity_schema_v4`, listed the fresh sealed corpus as *(pending)* and *(not yet
authored)*, described its runner slot as dormant, and counted two protected evidence directories.
All six statements were true when written and are now false. The evidence-class table gains the
`sealed_challenge_v2` row, marked spent by the run that carried the GO.

**Every eval set is spent.** `sealed_challenge_v1` was spent at `v4`; `sealed_challenge_v2` was
spent by its single run. All five eval sets now point at protected directories and none can write.
That is the intended terminal state: a future prompt version needs a newly authored sealed corpus
and its own slot, and the cost of authoring one is exactly what stops a rerun of known cases from
being accepted as generalization.

**SC2-04 stands as recorded.** The fresh challenge's one mechanical failure — a host's compound
prohibition faithfully split into two constraints, which the frozen containment rule cannot
recognise — is preserved at 11/12. The reading that it is a checker/contract edge rather than an
authority failure lives in `§4.6`, never in the artifact.

**What the GO does not license.** 7/12 Excellent is a pass, not a standing target. Four recurring
qualities — unsupported anti-sentimental and anti-theatrical restriction, reusable finishing
language, a verbal identity thinner than the visual idea, and a visible preference for polish and
emotional moderation — are recorded as **excellence watch** items to be observed through
DesignIntent, Composition and rendered concepts, not as `v5` defects to remediate now. Event
Identity's ~30 s median is recorded as **latency debt** against `spec.md §7.10`, addressed after the
creative pipeline is proven. Neither reopens `v5`.

**`phase-4b-plan.md` is added**, planning the clarification lifecycle, the deterministic sibling
planner and `DesignIntent × 3`, with that phase's evidence strategy designed before its prompt is
written and four decisions listed as requiring approval. It orders work and defines no
requirements.

## Documentation hierarchy

`spec.md` Revision 6 → `technology-decisions.md` → `design-system.md` → `event-renderer-system.md` Revision 2 → `model-contracts.md` Revision 2 → `e2e-workflow.md` → `screen-spec.md` → this changelog → `development-plan.md` and `phase-4b-plan.md` (which order work and define no requirements) → prototypes and proof folders as evidence. Revision 5 files are preserved unchanged where superseded text was moved, not rewritten.
