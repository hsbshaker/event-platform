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

**Measured blast radius** across all 127 golden items (26 hero silhouettes, 13 section recipes,
16 A.1 pages, 37 adversarial fixtures, 72 frozen confirmation trees — 109 of which exercise
repair):

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

## Recommended disposition

Defect 1 is settled. Keep 2 to 5 as ported until Phase 3 meets its exit gate; they are one-line
clarifications with no behavioural effect, and folding them into one change afterwards keeps the
parity oracle meaningful in the meantime. Do not infer new behaviour for any of them — cleanup
only if it is strictly behaviour-preserving.
