# Phase A.1 proof and Gate 2

Expanded proof built from the frozen Phase A (`proof/`, commit `cda5fa6`), then the sixty-site seeded test. Nothing here is canonical; `spec.md`, the renderer docs, the model contracts and `CLAUDE.md` are untouched.

## Files

| File | What |
| --- | --- |
| `vocab.js` | The rules: families, 12 hero recipes with structural variants and contentFit, section recipes with requires/excludes, tagged surface plans, composition mapping, structural/cosmetic parameters, typography, motifs, signature weights. Read by the harness and the generator. |
| `vocabulary.md` | What changed from Phase A and why, including the eight Phase A configs the stricter rules repaired. |
| `sites.js` | Sixteen hand-composed sites: the Phase A twelve with variants declared, plus one site per new hero. |
| `harness.html` | Config-driven renderer. `?set=a1|gen&site=NN&w=390|1280&vh=844|800&gray=1` renders one site; `?set=a1|gen&w=` renders the gallery. |
| `generate.js` | Gate 2 selector: `node generate.js [count] [seed] [--no-reject] [--no-cap]`. Seeded selection over `vocab.js`, structural-signature rejection, silhouette cap. |
| `generated-sites.js` | The sixty the harness renders (copy of `gate2-sites.js`). |
| `gate2-sites.js`, `gate2-stats.json` | Final run: signature check plus silhouette cap. |
| `gate2-nocap-sites.js`, `gate2-nocap-stats.json` | Same seed, signature check only. |
| `gate2-raw-sites.js`, `gate2-raw-stats.json` | Same seed, no selector. The baseline the selector is measured against. |
| `gate2-results.md` | Gate 2 numbers, pass criteria, visual read, verdict. |
| `critique.md` | Post-render critique of A.1 and what Gate 2 changed. |
| `a1-collision.json` | All 120 pairs for the sixteen. |
| `shots/`, `sheet-*.png`, `heroes-*.png` | The sixteen at 390 gray, 390 color, 1280 gray. |
| `gate2-shots/`, `gate2-sheet-*.png`, `gate2-heroes-*.png` | The sixty, same formats. |
| `fonts.css`, `fonts/` | Self-hosted OFL fonts. |

## Regenerate

```
node generate.js 60 20260912 && cp gate2-sites.js generated-sites.js
chrome --headless=new --window-size=600,6400 --screenshot=out.png "file://$PWD/harness.html?set=gen&site=07&w=390&vh=844&gray=1"
```

Sheets were composed with a short Pillow script; the shots are the source of truth.
