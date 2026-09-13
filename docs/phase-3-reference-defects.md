# Phase 3 — defects in the reference engine, ported faithfully

Found while porting `proof-b/src/composition.ts` and reproduced independently before being
recorded here. All five are present in the production port **on purpose**: Phase 3 ports
`proof-b` without behaviour change, and the 72 frozen confirmation trees are the exit gate, so
correcting any of these inside the port would break the thing the port is supposed to prove.

This file exists so nobody later mistakes one for a porting slip and tidies it up. Each is
pinned by `tests/fixtures/renderer-golden/`, so an accidental fix fails the parity suite loudly.

Fixing any of them is a deliberate behaviour change: decide it, re-capture the affected golden
entries, and record it in the changelog.

## 1. Every `Array.isArray(parent)` guard in `repair()` is dead code

**Verified.** The repair addresses nodes by dot-path and derives the parent as
`getAt(path.split(".").slice(0, -1).join("."))`. An array index lives *inside* one segment
(`children[3]`), so slicing off the last segment yields the parent **node**, never the
`children` array. Reproduced directly: for `sections[0].root.children[1]` the derived parent is
the `Stack` node.

Consequences now frozen into behaviour:

- `component.parent`, `component.narrowCell` and `capability.node` always replace the node in
  place with a hairline `Rule`, never remove it from a multi-child array;
- `coverage.duplicate` always replaces rather than removes;
- **the node-budget repair's graceful path is unreachable.** `limits.sectionNodes` and
  `limits.pageNodes` are commented "drop decorative leaves first, then trailing optional text"
  and try eleven leaf kinds in order, but every attempt fails the array guard, so they always
  fall through to `s.root = { t: "Stack", children: leaves.slice(0, 8) }` — the whole
  over-budget section flattened to its first eight leaves, structure discarded.

This is the one that matters, because `docs/event-renderer-system.md §3` describes graded
repair and what actually happens is a demolition.

**Blast radius, measured across all 109 golden items (37 adversarial fixtures + 72 frozen
trees):** the budget path fires exactly once, on the adversarial fixture `73 nodes in one
section`, which exists to trigger it. **No frozen confirmation tree reaches it.**

So a fix would change exactly one golden entry and none of the 72 replay trees — the exit gate
would survive it. That makes this cheap to correct deliberately after the port lands, and it is
the recommended follow-up.

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

Keep all five as ported until Phase 3 meets its exit gate. Then take defect 1 on its own, with
its own oracle re-capture and changelog entry, and fold 2 to 5 into the same change since they
are one-line clarifications with no behavioural effect.
