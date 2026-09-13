# Phase 3 — defects found in the reference engine while porting it

Found while porting `proof-b/src/composition.ts`, reproduced independently before being recorded
here. Defects 2 to 5 are reproduced in the production port **on purpose**: Phase 3 ports
`proof-b` without behaviour change, and the 72 frozen confirmation trees are the exit gate, so
correcting them inside the port would break the thing the port is supposed to prove. Defect 1
was corrected instead — see below.

This file exists so nobody later mistakes a reproduced defect for a porting slip and tidies it
up. Each is pinned by `tests/fixtures/renderer-golden/`, so an accidental fix fails the parity
suite loudly.

Fixing any of the remaining four is a deliberate behaviour change: decide it, re-capture the
affected golden entries, and record it in the changelog.

## 1. Every `Array.isArray(parent)` guard in `repair()` was dead code

**Status: found during the parity port, intentionally corrected before Phase 3 exit.** This is
the one place the production engine deliberately diverges from `proof-b`. The golden oracle was
**not** re-captured: `tests/fixtures/renderer-golden/adversarial-structural.json` still records
what the reference does, and `parity.test.ts` asserts that the reference still replays to it
byte-for-byte, so the divergence stays visible rather than being edited away.

**The defect.** Repair addresses nodes by dot-path and derived the parent as
`getAt(path.split(".").slice(0, -1).join("."))`. An array index lives *inside* one path segment
(`children[3]`), so slicing off the last segment yields the parent **node**, never the
`children` array. Reproduced directly: for `sections[0].root.children[1]` the derived parent is
the `Stack` node, so `Array.isArray(parent)` is false for every node in the tree and no
array-child repair could ever reach its removal branch.

Consequences in the reference:

- `component.parent`, `component.narrowCell` and `capability.node` always replace the node in
  place with a hairline `Rule`, never remove it from a multi-child array;
- `coverage.duplicate` always replaces rather than removes — it logs `duplicate dropped` and
  leaves a decorative `Rule` in the duplicate's slot;
- **the node-budget repair's graded path was unreachable.** `limits.sectionNodes` and
  `limits.pageNodes` are commented "drop decorative leaves first, then trailing optional text"
  and try eleven leaf kinds in order, but every attempt failed the array guard, so they always
  fell through to `s.root = { t: "Stack", children: leaves.slice(0, 8) }` — the whole
  over-budget section flattened to its first eight leaves, structure discarded.

**Why it was corrected rather than reproduced.** Both outcomes contradict the canonical
documents, which outrank frozen proof behaviour when a reproduced defect conflicts with them:

- `docs/event-renderer-system.md §2.3`: "the validator **drops** any reference to a disabled
  capability as a `capability` repair" — drops it, not substitutes a decorative stand-in the
  model never authored;
- `docs/event-renderer-system.md §3`: repair is graded, and `spec.md §32` #22 requires
  deterministic repair rather than demolition.

**The correction.** `repair()` resolves an array child's path to the `children` array (`slotOf`),
so the removal branch is reachable. The repair algorithm itself — its ordering, its guards, its
log text — is unchanged; only the lookup the existing code already expressed was fixed.

**Measured blast radius** across all 164 golden items (26 hero silhouettes, 13 section recipes,
16 A.1 pages, 37 adversarial fixtures, 72 frozen confirmation trees — 109 of which exercise
repair: the 37 adversarial fixtures and the 72 frozen trees):

| Golden set | Diverging |
| --- | --- |
| 26 hero silhouettes | 0 |
| 13 section recipes | 0 |
| 16 A.1 pages | 0 |
| **72 frozen confirmation trees** | **0** |
| 37 adversarial structural fixtures | 5 |

The five, named in `parity.test.ts` as `DEFECT_1_DIVERGENCES`:

| Fixture | What changes |
| --- | --- |
| `73 nodes in one section` | Repaired tree **identical**; seven graded drops are now logged before the flatten that the reference reached immediately. |
| `two EventTitles` | Repairs identical; the dropped duplicate no longer leaves a hairline `Rule` behind. |
| `Date three times, same form, in the hero` | Repairs identical; two leftover `Rule` placeholders gone. |
| `capabilities: Hosts, Description, CashFund and registry used on an event with none of them` | Same repair rules in the same order; repair paths renumber as siblings are actually removed; leftover `Rule` placeholders gone. |
| `capabilities: no rsvp on this event but an rsvp section` | Repairs identical; one leftover `Rule` placeholder gone. |

Every one of the five moves toward what §2.3 and §3 describe, and all five reach zero remaining
violations, as before.

> An earlier revision of this file said a fix would change exactly one golden entry. That
> measured only the node-budget path. The same guard also gates `capability.node` and
> `coverage.duplicate`, which is why five fixtures move, not one.

**Test split.** Reference parity and production conformance are separate concerns from here on:

- `parity.test.ts` holds the byte-for-byte comparisons against `proof-b` and the divergence
  ledger. It dies with `proof-b`.
- `composition.test.ts` holds `array-child repairs (production conformance)`, which states the
  behaviour the canonical documents require — the graded drop order, that a section with graded
  drops available is not flattened, that a dropped duplicate or capability-disabled node leaves
  no placeholder, and that an only child is still replaced rather than removed. Those tests do
  not reference `proof-b` and outlive it.

## 2. `sections.duplicateKind` has a ternary with identical branches

`const alt = k === "hero" ? "details" : "details";` — reads like an unfinished intent. The
effect is that a duplicate `hero` is treated exactly like any other duplicate kind.

## 3. `nesting.gridInGrid` has a redundant, misleading predicate

`ancestors.some(a => a.t === "Grid" && !ancestors.some(b => b.t === "Registry"))`. The inner
predicate ignores `a` and duplicates the `!inRegistry` guard already applied on the same line.
Harmless today; it invites a wrong reading of the rule.

## 4. `capability.node` has an if/else whose branches are identical

`if (n.t === "RSVP" || n.t === "Registry" || n.t === "CashFund") { … } else { … }` with the same
body either side.

## 5. Two helpers are defined and never called

`countText` at module level and `contentOf` inside `repair`. Both carried over as exported,
documented helpers so nothing is lost if a later change needs them.

## 6. `SIG_WEIGHTS.threshold` is read but never defined

`proof-b/run-model.js` decides a collision with
`worst >= C.SIG_WEIGHTS.threshold || worst >= 0.7`. `SIG_WEIGHTS` has no `threshold` key — in the
reference either — so the first comparison is always `worst >= undefined`, which is `false`, and
the decision falls through to the literal. Harmless, and the effective threshold is .70 exactly as
`docs/event-renderer-system.md §5` specifies.

**Disposition: named, not reproduced.** `src/lib/renderer/planner/selector.ts` exports
`COLLISION_THRESHOLD = 0.7`. The value is unchanged, so this is strictly behaviour-preserving; the
only difference is that the threshold now exists where the code reads it.

---

# Harness stand-ins that are not production contracts

Distinct from the defects above. These are places where `proof-b/` did something because it had no
production surrounding it, not because it was wrong. Porting them verbatim would be the error.

## A. `proof-b/planner.js`'s `intentFor()` returns a whole DesignIntent, page system included

The reference planner samples, by seed, a complete `DesignIntent`: family, tonal direction,
typography pairing, density, all five composition values, and a page system. `proof-b` had no
`generateDesignIntent` call, so the harness stood in for the model.

That is not the planner's contract. `spec.md §7.7` — the highest-authority source — says the
planner plans three concept **assignments** (a distinct compatible family, then tonal direction,
then typography category and hierarchy; a distinct structural directive; a token allotment), and
that "the assignment is passed to the DesignIntent call". `docs/model-contracts.md §1` draws the
same line: planner → assignment → `generateDesignIntent(...) × 3` → DesignIntent × 3. The palette,
the pairing, density, the composition object and the motifs are the strong model's output.

Porting `intentFor()` as production would let generation produce DesignIntents with no model call.
So `src/lib/renderer/planner` stops at the assignment, and nothing in production samples a
DesignIntent.

**Parity is unaffected for everything the contract keeps.** The batch seed, the per-sibling seeds,
the directives, the token allotments and all four assignment fields replay byte-identically to the
frozen confirmation run for all 72 concepts, from the two master seeds `proof-b/FREEZE.md` records
(20260921 and 20260922). The fields the port stops short of are exactly the fields the model owns.

One wrinkle worth knowing, because it looks like dead code and is not: `assignmentFor()` draws a
typography pairing and discards it. The reference drew one at that point, and the draw has to be
consumed or the tone drawn next diverges from the frozen run. It also resolves the assigned
category on the one vocabulary path where the naive category filter comes back empty and the
fallback pairing's category differs from the drawn one. The pairing itself is deliberately not
emitted; the assignment carries the narrowed *list* instead (`docs/model-contracts.md §5.2`), so
Phase 4 cannot accidentally skip the model call by reading a pairing off the plan.

---

## B. `proof-b` has no page-system resolver, no palette compiler and no motif resolution

`proof-b/compile.js` passes `pageSystem` straight through from the fake DesignIntent and sets
`typography: designIntent.typographyObject`. It produces no `tokens`, no `motifs` and no
`intentDeviations`. The colour system is three hard-coded palettes in `proof-b/renderer.js`'s
`TONES` table, for the single Ralph-Lauren-lodge brief; the fake DesignIntent has no `palette`
field at all, and `composition.ornament` is never read by anything.

So for this part of the compiler there is **nothing to port and no parity to prove**. What the
proof does hold is canonical *data* in the wrong layer: the family → border/card/button tables and
the hierarchy → tracking table (`proof-a1/vocab.js`), the type scale (`renderer.js`'s `HIER`), the
density scale (`DENS`), the motif catalog and the ornament budget (`VOCAB.motifs`,
`VOCAB.mapping.ornament`). Production moves those values into the compiler, where
`docs/design-system.md §15.2` and `docs/event-renderer-system.md §6` put them, and builds the rest
from the canonical contract.

Practical consequence for anyone reading a frozen spec: its `pageSystem` was sampled by the
harness, not resolved from a DesignIntent, so **do not treat the frozen values as a parity target
for `resolvePageSystem`**. Reproducing them would mean replaying `intentFor()`'s random draws,
which is precisely the harness/compiler entanglement the production split exists to undo.

## C. Two canonical gaps found while building the resolvers — both now closed

1. **Motif "channels" had no surviving definition.** `docs/event-renderer-system.md §8` and the
   Revision 6 changelog both said "roles, channels, opacity bounds and caps are unchanged", and no
   current document said what a channel was. **Resolved by documentation reconciliation:** the
   phrase is retired across `spec.md`, `event-renderer-system.md` and `design-system.md` in favour
   of the vocabulary that actually exists — kind, role, structural slot, bounded opacity and scale,
   ornament caps. No primitive, schema or language change; no channel system was invented.
2. **The disposition of a motif beyond the ornament budget was unwritten.** **Resolved: the budget
   is a hard rendering cap.** Motifs resolve in document order and consume the budget until `max`;
   everything past it resolves with `render: false` and a `motif.budget` deviation. The tree is
   never mutated, the evidence never leaves the spec, and the renderer must not draw a suppressed
   motif. `spec.md §32` #25 requires the suppression to be explicit and logged, not that every
   placed motif be visible.

## D. A `typographyPairing` enum that predates Revision 6

`docs/model-schemas/design-intent.schema.json` carries a six-value `typographyPairing` enum whose
values are the six typography *categories*, and whose description says "the assigned
**archetype**" — wording Revision 6 removed when it replaced archetypes with families.
`docs/model-contracts.md §5.1` requires a pairing to be "in the assigned category", and
`docs/event-renderer-system.md §8` requires a per-pairing `holdsAtMonumental`; neither is
expressible with six values that *are* the categories. Production uses the twelve concrete
pairings.

**Resolved as `design_intent_v4`.** The drift was wider than typography: the motif enum was a
retired ten-item catalog (`plaid_restrained`, `botanical_line`, `deco_border`, …) and both schema
and prompt still said `archetype`. All three were corrected together under a new prompt and schema
version rather than edited under v3, and v3 is preserved verbatim under
`docs/model-schemas/history/` and `docs/model-prompts/history/`. `tests/unit/model-contract.test.ts`
now fails if the schema and the production vocabulary ever drift again.

## E. A focus-ring constraint that follows from the contrast rules — now canonical

Requiring `focus` to clear 3:1 against **both** the page surface and the button fill is
algebraically unsatisfiable in the dark tonal direction: against the base it needs relative
luminance ≥ 0.178, against a mid-lightness button ≤ 0.077. The semantic palette therefore scopes
`focus` and `border` to the surfaces they sit on, which means **the renderer must draw the focus
ring outset on the page surface, not inside the button fill**. Written down as
`docs/design-system.md §15.6a`, binding on the renderer stylesheet and every themed guest
component.

---

## F. The semantic text copy table is named but never written down

`docs/event-renderer-system.md §2` says `SectionHeading` copy "comes from a compiler table". No
current document gives that table's contents, and `proof-b`'s is sample copy for one fictional
event ("Join us at the lodge."), not neutral production copy — so there is nothing to port.

The renderer uses the section's own names (`Details`, `RSVP`, `Registry`) and equivalently plain
CTA labels: the minimum that invents no voice. They live in one constant in
`src/components/event-renderer/primitives/text.tsx` that no component branches on, so replacing
them is a one-line change.

**This is product copy, not an engineering decision.** It needs a real table before launch, and it
is the kind of default that quietly becomes permanent if nobody looks at it.

---

# Process note: the Phase 3 independent review

`CLAUDE.md §11` routes the final independent senior review to Fable. For Phase 3 that budget was
exhausted, so the review ran on Opus instead — a one-time, explicit substitution, recorded here so
the deviation is visible rather than inferred from a commit trail.

It was a real review, not a formality. It returned two blockers, both correct:

1. the library-boundary lint rule matched literal specifiers and never named the sibling-relative
   `../library`, so a production module was importing the fixture library with lint silent — and
   the boundary test's own mutation check passed, because it enumerated only the spellings its
   author had thought of;
2. the focus ring on inverted surfaces resolved to a filled control's own ink, measured at 1.2–1.9:1
   against `surfaceAccent` where `docs/design-system.md §15.6a` requires 3:1.

Both are fixed, along with six should-fixes. The finding worth carrying forward is the first one's
shape: a guard verified only by a test that shares its blind spot is not verified. Independent
review, mutation checks against the real rule, and source-of-truth reconciliation are what caught
it — not the agent's own assertion that it was enforced.

---

## Recommended disposition

Defects 1 and 6 are settled. Keep 2 to 5 as ported until Phase 3 meets its exit gate; they are one-line
clarifications with no behavioural effect, and folding them into one change afterwards keeps the
parity oracle meaningful in the meantime. Do not infer new behaviour for any of them — cleanup
only if it is strictly behaviour-preserving.
