# Application components

Canonical product components from `docs/design-system.md §10` live here (`AppButton`,
`Field`, `Sheet`, `Dialog`, …). Feature screens import these; they never fork primitive
styling locally (§23.1, §23.4). Styling uses the semantic tokens in
`src/styles/app-tokens.css` only (§23.2).

Nothing in this directory may import from `src/components/event-renderer` or
`src/styles/event-tokens.css` (§23.7).

`ChoiceGroup` is here by the same rule and is **not yet in `docs/design-system.md §10`**: it is the
canonical single-choice control (a real radio group with a `<legend>`, which `Field` cannot label),
built only from existing semantic tokens and the existing 44px target. Adding it to §10 is a
canonical change under `CLAUDE.md §12`, so it is proposed rather than assumed.
