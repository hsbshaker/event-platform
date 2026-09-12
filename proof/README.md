# Phase A proof — does the reusable vocabulary contain twelve different sites?

Gate 1 of the renderer architecture decision. Twelve sites, one constrained brief (Ralph Lauren-inspired winter baby shower; navy, cream, forest green in every site), every visible decision traceable to a family rule, named recipe, PageSystem value, composition value, quantized parameter, or motif assignment. No per-site overrides exist in the harness.

Nothing in this folder is canonical. `spec.md`, the renderer docs, the model contracts, and `CLAUDE.md` are untouched.

## Files

| File | What |
| --- | --- |
| `vocabulary.md` | The families, eight hero recipes, page system, six surface plans, section recipes and parameters the twelve used, and the twelve resolutions with signatures. |
| `sites.js` | The twelve `ProofSiteConfig` objects plus vocabulary metadata. This is the only input to the renderer. |
| `harness.html` | Throwaway config-driven renderer. `?site=NN&w=390|1280&gray=1&vh=844|800` renders one site; no params renders the gallery. |
| `fonts.css`, `fonts/` | Self-hosted OFL fonts for the twelve pairings. |
| `shots/` | Every site at 390 (gray and color) and 1280 (gray). |
| `sheet-390-gray.png`, `sheet-1280-gray.png`, `sheet-390-color.png` | Full-page contact sheets. |
| `heroes-390-gray.png`, `heroes-1280-gray.png` | First-screen-only sheets. |
| `human-test-390-gray-unlabeled.png` | Shuffled, unlabeled mobile set for the five-reviewer test. Position-to-site map in `human-test-order.txt`; do not show it to reviewers. |
| `collision.json` | Pairwise structural similarity, all 66 pairs. |
| `critique.md` | What the renders showed, what was powerful, what was cosmetic, and the architecture changes recommended before implementation. |

## Human test protocol

Show five reviewers `human-test-390-gray-unlabeled.png`. Ask them to group anything that feels like the same underlying template. Record group counts and memberships. Repeat with a desktop sheet separately. Pass: median reviewer finds at least 9 groups, no group larger than 3. Palette is constrained by design and cannot contribute.

Predicted result from the author's own read: 9 to 10 groups, with sites 03/11 (poster) and 04/12 (masthead) as the likely merges. See `critique.md` for why and what fixes it.

## Regenerate

```
# render one site
chrome --headless=new --window-size=600,6400 --screenshot=out.png "file://$PWD/harness.html?site=05&w=390&vh=844&gray=1"
```

Sheets were composed with a short Pillow script; the shots are the source of truth.
