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

## Documentation hierarchy

`spec.md` Revision 6 → `technology-decisions.md` → `design-system.md` → `event-renderer-system.md` Revision 2 → `model-contracts.md` Revision 2 → `e2e-workflow.md` → `screen-spec.md` → this changelog → prototypes and proof folders as evidence. Revision 5 files are preserved unchanged where superseded text was moved, not rewritten.
