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

## Revision 6.8 — `§9.6` is a floor, and the spend controls that reading unblocks

**The change.** One sentence added to `spec.md §9.6`: *"These fields are a minimum, not an
allowlist: an implementation may persist additional server-only telemetry needed for reliability,
cost attribution, recovery and auditability, subject to the same privacy and access-control
requirements."*

**Why it was needed.** Phase 4B T9A had to give paid provider responses a durable home.
`EventIdentityError.rawResponses` exists because an `invalid_output` is a call that was answered
and billed, and the plan requires every paid response preserved — but `generation_runs` had no
field for them, and §9.6's list did not name one. Two readings were available: a record *minimum*,
or a closed allowlist. Nothing in canon closes it, its neighbour §9.5 is explicitly optional
(*"may emit"*), and the prohibitions that do exist — §7.10's *"never model reasoning or
chain-of-thought"* and §32 #41's *"do not expose backend generation/spend counters"* — govern what
the **surface shows**, not what server-only telemetry stores. The floor reading was already the one
the plan took; this records it so the question does not cost a third review round.

**What it does not do.** It does not weaken any privacy or access-control requirement, and it is
not a licence to persist reasoning content: that prohibition is separate and unchanged. The
evidence column stores `response.output_text` only, which carries no reasoning item, on a table
with RLS on, no policies, and revoked from `anon` and `authenticated`.

**Consequence in the build.** `generation_runs.provider_response_evidence` (ordered paid response
texts, 30-day retention) and the EventIdentity call-claim machinery that makes uniqueness happen
before spend. Recorded here because `CLAUDE.md §12` treats a `spec.md` edit as a product change
rather than cleanup, even a clarifying one.

## Revision 6.9 — `ChoiceGroup` joins the component system

**What changed.** `docs/design-system.md §10.5a` adds `ChoiceGroup`, the canonical single-choice
control: a real radio group named by its `<legend>`.

**Why it is canon rather than a feature component.** `§23.1` forbids page-local forks of shared
controls, and this one could not be `Field`: a group of radios is named by a `<legend>`, which
`Field`'s `<label for>` cannot provide. It was written for T11's clarification question and shipped
under `src/components/app/` from the start, with its source and README saying it was not yet
canonical — a known mismatch, and not one to freeze a phase with.

**What it does not do.** It introduces no token, colour, variant or second choice component, and
its entry documents only behaviour the component already has. It is explicitly not a
card-selection or template-picking primitive: concept selection is `ConceptCard` (`§10.14`), and a
template gallery is forbidden outright (`spec.md §32 #5`).

## Revision 6.10 — one authoritative understanding, three worthwhile choices

**What changed.** `spec.md §7.7a` adds the **concept premise** stage: one model call per concept
batch, after the deterministic sibling planner and before the three DesignIntent calls, authoring
three creative propositions **as one set**. `§7.8` gives each DesignIntent call a third input
channel — its own premise — and gives the concept card the job of saying what is different about
its choice. `§9.1` and `docs/technology-decisions.md §8` name a fourth creative capability,
`generateConceptPremiseSet(...)`. `§31` gains nine acceptance criteria and `§32` gains guardrails
`#21a` and `#21b`. `docs/product-doctrine.md §4` gains the stage in its responsibility map and `§8`
records that its own bar had been measured and missed.

**Why, and why now.** `docs/phase-4b-plan.md §E` reserved this decision in advance: *"if fresh
evidence shows blind siblings converge despite planner separation, that is a deliberate subsequent
design and spec decision argued from data, not a mechanism added on suspicion."* The T22 evidence
run is that data. Twelve batches, thirty-six DesignIntents, assignment conformance perfect and
faithfulness intact — and 12 of 12 batches failed composition-vector distinctness, 11 of 12 failed
motif overlap, `composition.ornament` took **one** value in all thirty-six responses, six batches
carried a duplicate concept name, and the independent blind review found no set that cleared the
minimum bar. `docs/designintent-sibling-convergence.md` is the causal diagnosis: three calls
received a byte-identical brief plus four enum values, nothing in the system had ever been asked
what an individual concept was *about*, and no stage ever saw two siblings at once.

**What the decision is, precisely.** Diversity moves from style coordinates to **ideas**, and
correctness does not move at all. All three premises inherit the same `EventIdentity` unchanged; a
premise selects emphasis from what the brief already carries and has no field for a host fact,
relationship, conflict, motive, constraint or emotional stake. `§32 #21a` says so as a guardrail,
because the cheapest way to make three concepts differ is to invent a reason, and that outcome is
worse than the convergence it would cure.

**What it deliberately is not.** Not a critic loop: the premise set gets exactly one bounded
re-prompt and the DesignIntent stage gets no convergence re-prompt at all, which `§32 #21` now
states as a closed list. Not a distance target: `§32 #21b` forbids repairing convergence in the
design fields, because palette ΔE and composition-vector counts are the instruments that detected
the failure and never the objective — three numerically distant bad concepts are not the product.
Not a catalogue: a premise is authored from the brief, never selected from a list of lenses by
identifier, which would be `CLAUDE.md §5.1`'s template system one stage earlier. And not a silent
degradation: a set that cannot be made legal fails the batch visibly rather than reverting to the
premise-free calls the evidence run measured.

**What it costs.** A batch goes from three model calls to four — one short serial premise call ahead
of the three parallel DesignIntent calls. `src/lib/generation/concept-premise-cost.ts` derives the
bound from the request's own shape and `conceptBatchMaxUsd` states the end-to-end worst case rather
than leaving it to be inferred. The prompt, schema and input-assembly versions move to
`design_intent_v6`, `design_intent_schema_v6` and `design_intent_input_v2`; `v5` is preserved under
`history/` and the T22 evidence stays attributed to `v5`.

**What is still owed.** The rerun of the spent T22 cases is regression and diagnostic evidence only,
never fresh generalization evidence — those cases and their failures were known while this was
written. Fresh evidence needs a corpus authored by an independent process that has seen neither.

## Revision 6.11 — the premise stage reaches a host

**What changed.** `spec.md §7.7a` gains the batch's running order and its persistence;
`docs/model-contracts.md §4.8.4` records both. `20260918000000_phase4c_concept_premise_lineage.sql`
adds `concept_premise` and its three version columns to `design_intent_artifacts`, plus
`card_deviations`, and adds `concept_premise` to the `model_operation` enum.
`src/lib/generation/concept-batch.ts` is the orchestrator.

**Why.** Revision 6.10 built the premise stage and nothing on the production path called it. The
plan's Phase 4C decomposition ends at T22 and defines no orchestrator, so the stage was reachable
only through the eval seam — which means a host generating concepts would still have received three
parameterisations of one idea, however good the new stage was. A fix that cannot reach a host is
not a fix; this is the sequencer that closes the gap.

**Two decisions worth reading.** The set review runs **before** the artifacts are written, which
departs from `§G.2`'s "written the moment that DesignIntent completes": `presentation` is `not null`
with a non-empty name, so the column can only ever hold a resolved card, and duplication is
decidable only across three siblings at once. Writing per sibling would mean persisting a card the
review is about to replace, on a table whose rows cannot be updated. And the premise call is
recorded under its own `model_operation` rather than borrowed from `design_intent`, because the
spend ceiling reads `generation_runs` and a misattributed call corrupts the per-operation record
while looking fine.

**What it does not do.** It composes nothing — `design_concepts` needs a composition, which is
Phase 4D — and no UI surface calls it yet. It adds no control of its own: every cap, the ceiling,
the one-batch-in-flight rule and both idempotency keys are `batch.ts`'s, enforced by the database.

**Verification gap, stated.** The migration's own DB tests
(`tests/db/phase4c-concept-premise.test.ts`, and the extended sweep in `phase4c-t17.test.ts`) could
not be executed in the environment this change was written in: `tests/db` needs a scratch
PostgreSQL on localhost and none was available. They are committed to run wherever one is. The
orchestrator's own behaviour is covered by unit tests with the provider mocked and a recording
database fake, which is what proves the sequence and the payloads; the transactional half was
already proven against a real database at T16.

## Revision 6.12 — the register gate was too strict, and the database said so

**What changed.** Two corrections found by closing the verification gap, plus the gap itself.

**The register gate.** `spec.md §7.7a` and `docs/model-contracts.md §4.8.3` restate the one gating
set-level register rule as **no two premises sitting at the same register on all three axes**,
replacing "at least one axis takes three distinct values". The stricter form was measurably wrong:
across all 19,683 register configurations of three premises over three three-valued axes it admits
52.9%, and 7,128 of its refusals have all three registers already distinct against 27 that are
genuinely one register three times. Its only escape was to move a register the idea had not asked to
move — and since a refusal costs a host the whole batch, that pressure lands at the worst moment.
Whether an axis separates all three is now telemetry. Semantic distinctness was always the
`organizingIdea` overlap ceiling's job and still is.

**The discarded convergence signals.** `runConceptBatch` computed the set review's signals and
dropped them. That mattered more than it looks: the card fallback derives a repaired card from that
concept's premise, so three fully converged concepts still present three distinct cards. A batch
could have looked like three choices at the only surface anyone reads while the convergence that
produced it went unrecorded. The signals are now returned. They are deliberately not persisted —
each is a pure function of the three persisted `design_intent` payloads — whereas `card_deviations`
is, because the substitution destroys the model's own card.

**What the database found.** `npm run test:db` had never run against the new migration. It found two
real defects on the first execution: `tests/db/phase1.test.ts`'s own artifact helper predates the
premise lineage columns and broke on their `not null` (six tests), and this task's own fixtures
omitted required columns on `events` and `event_identity_revisions`. Neither was visible to
typecheck, lint or 2,215 unit tests. The suite now covers the migration end to end, including a
ceiling test built to **discriminate**: four calls totalling 7.00 against a ceiling of 6.00, where
the three DesignIntent calls alone total exactly 6.00 — so an admitted batch would prove the premise
spend was invisible.

**Verification.** Full chain applied from a clean Postgres 16; `npm run test:db` 11 files, 393
tests; unit 103 files, 2,221 tests; component 41; proof suite green. No provider call, no eval run.

## Revision 6.13 — Phase 4B and 4C closed, and what the 4C close does not claim

**4B is unchanged and stays closed — GO.** Its evidence, clarification lifecycle, answer
provenance, orchestration, persistence and validation work all stand, and nothing here reopens it.

**4C is closed for product progression by operator decision, and the frozen §3.7 gate is not
claimed to have passed.** Two things that are routinely conflated are separated in the record:
*the implementation is complete* and *the evaluation passed*. Only the first is true. The one
authorized T22 run returned 12/12 mechanical failures, a blind review of 5 `Fail` / 7 `Borderline`
/ 0 `Good` / 0 `Excellent`, **0/12 minimum-wowable**, and S1, S2, S5, S7 and S8 present — a NO-GO
on every half of a gate frozen before the corpus existed.

**What supports progressing anyway.** The remediation — *one authoritative understanding, three
worthwhile creative choices* — materially improved the known convergence defect on spent
regression evidence at `17b2264`: composition-vector distinctness 0/12 → 7/12, sibling pairs with
zero composition difference 16/36 → 0/36, identical motif sets 25/36 → 1/36, duplicate card-name
batches 6/12 → 0/12, near-duplicate descriptions 3/12 → 0/12. Palette separation stayed 0/12 and
the motif gate stayed 1/12. No unsupported reinterpretation was found in the premise grounding.

**What is deferred, in the words the record uses.** *Premise-based sibling separation materially
improved the known DesignIntent convergence failure on spent regression evidence. Fresh independent
minimum-wowable validation is deferred to end-to-end rendered-product / production design-quality
validation.* The reason is that the next stage turns these intermediate semantics into
`CompositionTree`s, compiled `ResolvedDesignSpec`s and geometry-verified pages a host can react to,
and validating intermediate JSON in isolation has reached the end of what it can tell us.

**The original gate is preserved exactly.** §3.7 is not edited, the T22 result is not rewritten,
and no band distribution or minimum-wowable count is asserted. `EventIdentity`, `ConceptPremise`
and `DesignIntent` are frozen while 4D is built.

## Revision 6.14 — Phase 4D: a DesignIntent becomes a page

**What changed.** The generation backend now runs end to end: `EventIdentity` → one
`ConceptPremise` call → three `DesignIntent` calls → **three `Composition` calls** → per-sibling
compile, rendered-geometry verification at 390 and 1280, and an immutable `ResolvedDesignSpec`.
Seven provider calls per batch before bounded retries, up from four.

**The host-constraint gap, which was real.** `docs/model-contracts.md §6.1` named the Composition
call's first input `eventIdentity` and scoped it only in a comment; `src/lib/ai/provider.ts`
declared the call as `{designIntent, capabilities, directive, reprompt?}` over
`Record<string, unknown>`. Nothing in that shape carries a host constraint, so a constraint whose
subject is **structure** — no religious imagery, keep the ceremony and the reception apart — could
survive Event Identity and never reach the stage that authors structure. It could not be honoured,
and could not be found to have been broken either: `§3.7`'s S4 judges erosion where the subject is
observable.

`src/lib/ai/composition/brief.ts` is the fix. Every `hostConstraint` travels **complete and
verbatim**, because the asymmetry decides it: carrying an inapplicable constraint costs tokens, and
dropping an applicable one loses the host's instruction with no way to detect the loss. The
*obligation* is scoped instead of the evidence — prompt block 1a, now `composition_v1_p3` — and
`creativeGuidance` is withheld by having no field at all, which is what makes promotion to host law
impossible rather than merely discouraged. `BRIEF_DISPOSITION` is exhaustive over
`keyof EventIdentity`, so adding a field upstream without deciding whether Composition may see it
is a compile error.

**A sibling now makes two calls, so recording and settling split.** `record_batch_sibling_run`
settles the sibling it records, which was right while a sibling *was* one DesignIntent call.
Settling there now would mark a sibling ready whose concept does not exist and may never exist —
`§32 #24` decides that only after geometry verification. `record_sibling_stage_run` records and
settles nothing; `settle_batch_sibling` settles once the concept is persisted. The old function is
untouched and still correct for a single-stage sibling.

**Concept-level readiness is real, not aspirational.** The three composition stages run in
parallel and none waits for another: concept 0 can be ready while 1 is retrying and 2 is in the
browser. The one barrier is the set review, which canon requires — the card fallback is defined
over the set.

**The retry budget is one counter.** All three of `§6.3`'s re-prompts — schema-invalid, token-cap,
selector collision — are spent inside `generateComposition`, once each. The stage calls it once and
tells the compiler both allowances it could ask for are gone, so a surviving token violation is
neutralized deterministically and a surviving post-repair collision is reported as
`nearestSibling`. Nothing else is ever re-prompted, anywhere.

**One real bug, found by the work.** `heroNumeral.detect` reads `sections[0]` directly, and
`validateSchema` bounds a section's shape but not how many there are — so `{version, sections: []}`
is a schema-valid response that threw out of `tokenViolations`. Guarded, with a test: a sectionless
tree has no hero to cap, and what it has is a section-count defect the compiler owns.

**Verification.** typecheck, lint (0 errors), format, 110 unit files / 2,409 tests, 423 DB tests
against a disposable local PostgreSQL with the full migration chain applied from empty, 41
component tests, `proof-b/test.js` green, `adv-run.js` 37/37 repair-valid with zero overflow at
both widths, and a production build. **No provider call and no eval run.**

**What is not established.** `composition_v1_p3` has never been sent to a model, so every
CO-01…CO-11 threshold is unmeasured and 4D's own question — *can it turn each direction into an
excellent original composition?* — is unanswered. Imagery remains 4E and is neither built nor
diminished here.

## Revision 6.15 — Phase 4E: the whole artwork path, with no way to reach a provider

The Phase 4D live smoke proved the technical path and left one honest finding: the image-free
visual vocabulary does not yet make a theme specific or premium enough to claim minimum-wowable
output. 4E exists to test whether art-directed imagery raises that ceiling. This revision builds
everything up to the point immediately before the first paid image call, and stops there.

**The ownership direction, fixed before any code depended on it.** Composition authors the tree and
owns *where*. The compiler resolves each `Artwork` leaf into a reservation — role, extent, surface,
readability scrim and, where text crosses it, the anchor that text sits at. Only then is
`VisualArtIntent` assembled *from* that reservation to say *what*. The image model answers a brief
and never reads or writes a coordinate. The inverse — generate artwork, then lay the page out
around it — would make layout depend on an image nobody has seen and make the image model a layout
author by the back door, so `FORBIDDEN_INTENT_FIELDS` is data a test asserts on rather than a
comment that drifts.

**Optionality is a gate upstream of the model, not a hope about its judgement.** `spec.md §7.6a #1`
says "every event site gets an image" is not a product rule. The easy implementation — offer the
primitive on every call and let the model decline — fails that invisibly, because a model offered a
capability uses it. So a direction that did not ask for artwork is sent a primitive spec that does
not mention artwork at all. The rule reads the two fields where the direction already stated this,
and `docs/product-doctrine.md §10` names the exact pair of cases it has to tell apart: black-tie
wants none, botanical may need one. It is a faithful reading of a real choice, and it is still a
reading — `ARTWORK_DECISION_VERSION` records which reading produced a concept, and the honest fix
when `DesignIntent` next revs is an explicit field.

**Text readability is decided without the artwork.** §7.6a #5 is absolute and has to hold when the
image does not exist, because the spec is verified and frozen first. A motif is safe behind text
because the compiler draws it; an image is arbitrary — but its worst case is not. Every image lies
between pure black and pure white in every channel, so a scrim of the section's own surface at
alpha puts the effective background between two computable endpoints. Clear AA against both and you
have cleared it against every image that could ever arrive. Where no approved step does, the
artwork is not drawn behind that text at all.

**One real bug, found by a browser before a cent was spent.** `.ev-art` sizes itself with
`min-height`, so an in-flow image resolved `height: 100%` against an auto height, fell back to its
own aspect ratio and set the box from its intrinsic dimensions: a 64×32 stub became a 640px block
at 1280 and took a page from 1286px to 2341px. The reserved box was not the geometry — the image
was, which means a spec verified without an asset would have shipped a different page with one.
Fixed by taking the image out of flow. Worth noting what nearly hid it: an overflow-only assertion
passed throughout, because a page growing vertically overflows nothing.

**Unreachable by construction, not by configuration.** No image model is selected, no provider
implementation exists and no spend ceiling number exists. No module under `src/lib/ai/visual-art/`
reads the environment or can reach a network, `getArtworkProvider()` throws unconditionally, and a
test drives the whole boundary with `fetch` replaced by a throwing spy. A 36-case environment
matrix confirms no combination of plausible variables opens it.

**What the stubs prove, and what they do not.** Flat single-colour PNGs establish that the path runs
end to end, that all four roles compile, brief and render, that a page measures identically with an
asset and without one across five awkward shapes at 390 and 1280, and that artwork cannot enter
around the trusted primitive and compiler system. They are **not** evidence about image quality.
4E's actual question is untouched until a real smoke runs.

**Verification.** typecheck, lint (0 errors), format, unit, component, e2e, 480 DB tests against a
disposable local PostgreSQL, `proof-b/test.js` green and `adv-run.js` 37/37 repair-valid with zero
overflow at both breakpoints — identical to the pre-artwork baseline, which is the claim that
image-free trees are undisturbed, holding in practice.

---

## Revision 6.16 — artwork treatments, and readability that is spatial rather than global

The first live Phase 4E image answered its question: the model can produce useful, bespoke,
theme-specific visual material. The renderer then threw most of it away, and this revision is about
why.

**Three things compounded.** The decoration box was 42%×36% of the overlay, in a corner.
`object-fit: contain` shrank a square asset to that box's short side — 312×312 inside 527×312, so
nearly half the reservation was empty. And a flat 0.65 scrim covered all of it, because every
decoration counted as "under text" whether or not any text was there. A faint watermark was the sum
of the three; fixing any one alone would have moved almost nothing.

**Treatments.** The compiler now resolves one of four — `contained`, `side-anchor`, `field`,
`framed` — from the role, the extent and the position the composition gave the leaf. They are
resolved, never authored. The model already says what the artwork is for, how much of a section it
is for and where it sits; `spec.md §7.6a #3` gives realizing that to the compiler. So the
composition language, its schema and its prompt are untouched and `PRIMITIVE_SET_VERSION` does not
move — only `COMPILER_VERSION`, because the same tree now compiles to a different page.

**Readability became spatial.** The AA guarantee is unchanged and `field` still pays it in full:
the lightest approved scrim that clears AA against both a pure black and a pure white asset,
computed before any image exists. What changed is who pays. A zone puts the artwork in a column of
its own with the overlay's content padded out of it, so text and artwork occupy different pixels
and there is nothing to protect. Measured at 1280 the text ends at 602px and the artwork starts at
752px. **No legibility was traded: the scrim is gone because the overlap is gone.**

Nothing in that decision looks at a pixel, and the asset's own measured centroid deliberately is
not an input. The spec is frozen and verified before any image exists, so a layout that moved with
the image would make the verified spec provisional. Those measurements act in the brief, which asks
for negative space before the image is made — which is the only place they can act honestly.

**Two bugs the spike had hidden.** `ResolvedArtwork.textAnchor` was misnamed and misread:
`Overlay.anchor` positions the *decoration*, not the text, and an overlay's content is in normal
flow across the whole box rather than gathered at a corner — so the brief was asking the image model
to leave open the very side the artwork was anchored to. And crop safety came from the leaf's
`extent`, which says how much of a *section* the artwork is for and nothing about the box it lands
in. Both now read the resolved reservation, which is what §7.6a #2 meant by the brief following the
layout.

`VISUAL_ART_INTENT_VERSION` bumps to `v2`: `composition` is assembled from the resolved reservation
and carries five facts, including the shape of the frame at **both** breakpoints, which did not fit
in v1's 400 characters. Dropping one to keep the bound would have meant briefing an asset for one of
the two pages it appears on.

**Evidence, at zero cost.** `docs/model-evals/results/phase-4e-artwork-placement-hardening-locally-grown/`
renders the capability spike's exact image bytes through the improved system — same concept, same
content, same DesignIntent, same palette, same typography, no provider call. The artwork box at 1280
goes from 527×312 to 528×873, the rendered image from 312×312 to 528×528, the scrim from 0.65 to
none; at 390 from a 160px strip letterboxing the asset to a 240px band filling it. The asset still
cannot move the page: removing it leaves both breakpoints byte-identical.

Nothing is scored. Whether the result is *good* is the operator's, and the contact sheet puts the
questions next to the pictures rather than answering them.

**Verification.** typecheck, lint, format, unit, component, e2e, DB against a disposable local
PostgreSQL, `proof-b/test.js` and `adv-run.js` at 37/37 repair-valid with zero overflow, rendered
geometry clean at 390 and 1280, production build.

---

## Revision 6.17 — the first full batch, and an answer nobody ordered

One live three-concept batch from the frozen locally-grown identity, authorized as exactly one. It
was meant to be the first evidence of generated artwork in a real batch. It is not, because all
three siblings composed without artwork, and the interesting part is that they were not prevented
from using it.

**Artwork was on the table three times.** `decideArtwork` allowed it on every concept, from every
concept's own `DesignIntent` — `restrained` with motifs on two, `decorative` on the third. Block 2
of each request listed `thematic artwork` as enabled. Blocks 4 and 5 carried the `Artwork`
primitive, its nesting inside `Overlay`, its limits of one per section and two per page, and the
paragraph explaining what the node is for, all generated from the same `NODE_SPEC` table the
validator uses and all present precisely because `caps.artwork` was true. The composition call
sends no provider-side schema, so those blocks are the entire language the model has. No raw tree
carried an `Artwork` node, so nothing was stripped by repair either. Editorial, statement and
invitation gave the same answer.

**What that is worth.** It establishes that artwork is optional end to end — offered, affordable,
declined, and the pages finished anyway, verified clean at 390 and 1280 with no re-prompt, no
fallback, no demotion. It establishes nothing about artwork itself. Placement, treatment,
readability and brief quality in a real batch remain untested; the single-asset capability spike and
the placement hardening are still the only artwork evidence this project has.

**One sentence for the operator, deliberately not acted on.** The artwork rules end "Artwork is
optional and a concept is often stronger without it." That is right as product rule (`spec.md
§7.6a #1`, `§32 #31`). Whether it also reads as a recommendation is a judgement about the
composition prompt, it is a `COMPOSITION_PROMPT_VERSION` bump to change, and only another live
batch could measure the effect. The run was authorized as one, so the wording stands.

**Three defects the zero-cost rehearsal caught first**, each of which would otherwise have been
found by spending money. `subject` and `medium` were bounded below the sum of the `EventIdentity`
fields they concatenate — 400 against a derivable 804, and 240 against 323 — so a contract-valid
identity was unbriefable and the locally grown one was; `VISUAL_ART_INTENT_VERSION` goes to `v3`
and `assemble.test.ts` now holds assembly total over the widest legal identity. A brief that would
not assemble escaped `runCompositionStage` unsettled and took two unrelated siblings down with it;
it now costs its slot and is logged. And every artwork slot recorded as free, because `lineage` was
built before the provider call and reused after it — a batch that spent money would have reported
zero.

**Verification.** typecheck, lint (0 errors), format, 2,685 unit, 41 component, 480 DB against a
disposable local PostgreSQL, 71 e2e, `proof-b/test.js` green and `adv-run.js` 37/37 repair-valid
with zero overflow at both breakpoints, production build. Evidence:
`docs/model-evals/results/phase-4e-full-smoke-locally-grown/`; the three earlier directories are
byte-identical, all 32 files.

---

## Revision 6.18 — the generation experience, and the first run from a host's own words

Two phases in one workstream. 4F built the surface a host watches their event come to life on; 4G
ran the whole system from a raw prompt for the first time and left the result for a person to judge.

**4F: the wait as a product surface.** `generation-view.ts` is the boundary and it is shaped so the
forbidden thing cannot be said — no percentage, ratio, step counter or ETA exists anywhere in the
type, and every creative field is absent until its row exists. `generation-state.ts` projects it
from rows the pipeline already writes, so reload and reconnect are a query rather than a
job-tracking system, and durability needed no new infrastructure: the start returns once the batch
is admitted, the work continues past the response, and the database's in-flight unique index stays
the only control over a second batch. A crashed process used to block an event for ever, so an
event-scoped recovery RPC now sweeps on read, as identity claims already did.

Readiness is per concept. `previewable` follows that concept's own verified spec and never its
siblings', and a concept whose artwork is still coming is shown as the finished page it already is
— the spec is verified and frozen before any image is requested. The preview renders the real
`EventPage`; a test refuses a thumbnail or an iframe in its place.

**Two access decisions, both tightened from the obvious answer.** The preview route and the
generation read each reached for a capability that is guest-allowed and survives publish, and what
they return is the set of *unselected* concepts. Both now require `browse_select_concepts`, which is
collaborator-only and pre-publish-only, so the surface closes when the choice is made (`§25`).

**A defect worth keeping.** An artwork slot sits in `reserved` from the moment the compiler admits
it, and with no artwork provider nothing ever requests it — so the surface said *Artwork is still
being made for this one* for ever, about work that had stopped. A note that never resolves is the
"stage claiming work that has not happened" `§31` forbids. Settlement follows the sibling's terminal
state now.

**4G: one prompt, one run.** A real host's words about an old-world Mediterranean garden, frozen in
its own commit before the harness existed. 8 text calls, three concepts, clean at 390 and 1280,
$0.1814, zero image calls, 71.8s — every stage schema-valid first time, no re-prompts, no fallbacks.
The interpretation held: the three exclusions survived verbatim, facts present were extracted, facts
absent stayed absent, and "November" was not mistaken for the event date.

**Three findings, recorded rather than acted on.** Artwork was offered to all three and taken by
none, for the second consecutive batch. The concepts did not arrive one at a time — partly because
three compositions genuinely finished together, partly because the DesignIntent artifacts are
written in a single insert, which forecloses staggered per-concept naming by construction. And every
latency target was missed, with the single premise call costing 35.5s and blocking all three
siblings. `§32 #45` says measure rather than hide; this is the measurement `product-doctrine.md §14`
conflict 9 was waiting for, and no number was moved to match it.

**Nothing is scored, and no new creative stage was introduced.** The hypothesis that major visual
decisions are too independent — that pages read as good pieces stitched together rather than one
system — is recorded as an open product question. No `VisualSystemPlan`, no `PageBlueprint`, no
art-direction or title call, no taste critic. The 4G review is the first look at the finished
product; acting before it would make the architecture change a guess instead of a finding.

**Three defects an independent review found after all of this was first called finished**, every
one of them in the seam between the panel and the orchestrator, and every one invisible to 2,709
passing tests because none drove that seam. A successful start never began polling, so a host
clicked and nothing happened until a reload. `Try again` after a failure was a no-op, because no
retry passed `newRound` — which also meant the stale-batch recovery released the database index
while leaving the host with a dead button. And the deployed path was a broken deploy by this
repository's own rule: `after()` reaches `verifyGeometry`, which imports Chromium, and the tracing
key was keyed only to two API routes.

The third carries a trap worth keeping: `outputFileTracingIncludes` keys are globs, so a bare
`"/events/[id]/create"` reads `[id]` as a character class, matches nothing, and silently traces six
files with no browser archive. The escaped spelling traces twenty-two, including all four `.br`
archives — identical to the already-deployed verify-geometry route. `next.config.ts` now carries the
measurement to re-run after any Next upgrade.

The lesson is not the three bugs; it is that the tests were green. A suite can be thorough about a
projection and a state machine and say nothing at all about whether pressing the button works.

**Verification.** typecheck, lint (0 errors), format, 2,721 unit, 66 component, 498 DB against a
disposable local PostgreSQL, 71 e2e, `proof-b/test.js` and `adv-run.js` at 37/37 repair-valid with
zero overflow, rendered geometry clean at 390 and 1280, production build with the browser trace
verified per route.

---

## Documentation hierarchy

`spec.md` Revision 6 → `technology-decisions.md` → `design-system.md` → `event-renderer-system.md` Revision 2 → `model-contracts.md` Revision 2 → `e2e-workflow.md` → `screen-spec.md` → this changelog → `development-plan.md` and `phase-4b-plan.md` (which order work and define no requirements) → prototypes and proof folders as evidence. Revision 5 files are preserved unchanged where superseded text was moved, not rewritten.
