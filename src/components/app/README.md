# Application components

Canonical product components from `docs/design-system.md §10` live here (`AppButton`,
`Field`, `Sheet`, `Dialog`, …). Feature screens import these; they never fork primitive
styling locally (§23.1, §23.4). Styling uses the semantic tokens in
`src/styles/app-tokens.css` only (§23.2).

Nothing in this directory may import card-renderer styling such as `src/styles/card-fonts.css`
(§23.7).

`RangeField` is the canonical slider (`docs/design-system.md §4.10a`): a labelled
`<input type="range">` with its paired numeric `Field`, keyboard-operable, 44px tall. Use it for
any bounded number the host adjusts (the card editor's text background opacity and padding);
never style a bare range input locally.
