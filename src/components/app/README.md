# Application components

Canonical product components from `docs/design-system.md §10` live here (`AppButton`,
`Field`, `Sheet`, `Dialog`, …). Feature screens import these; they never fork primitive
styling locally (§23.1, §23.4). Styling uses the semantic tokens in
`src/styles/app-tokens.css` only (§23.2).

Nothing in this directory may import from `src/components/event-renderer` or
`src/styles/event-tokens.css` (§23.7).

`ChoiceGroup` is the canonical single-choice control — a real radio group named by its `<legend>`,
which `Field`'s `<label for>` cannot provide. It is documented in `docs/design-system.md §10.5a`.
