# Phase 4E — artwork placement hardening (locally grown)

**Zero provider calls.** No image was generated and no text model was called. The asset is the exact
PNG the one authorized capability spike returned, read off disk and never regenerated, repainted,
recropped, recoloured or upscaled.

Run from `scripts/smoke/phase4e-placement-hardening.smoke.ts`.

## What this compares

The same concept — Phase 4D's *Tended Welcome* diagnostic derivative — with the same content, the
same `DesignIntent`, the same palette and typography, and the same image bytes. **The artwork
treatment system is the only variable.**

`baseline-mobile.png` and `baseline-desktop.png` are the capability spike's own `after-*.png`,
copied rather than re-rendered. They are not an approximation of how head `5287be` drew this asset;
they *are* that drawing.

## The problem

The spike produced a usable, theme-specific asset and the renderer threw most of it away. Three
things compounded, and no one of them was the cause:

1. The decoration box was **42% × 36%** of the overlay, anchored in a corner.
2. `object-fit: contain` then shrank a 1024×1024 asset to that box's **short side** — 312×312
   inside 527×312, so nearly half the reservation was empty.
3. A flat **0.65 scrim** covered the whole box, because every decoration counted as "under text"
   whether or not any text was actually there.

A faint watermark was the sum.

## The change

The compiler now resolves an artwork **treatment** — `contained`, `side-anchor`, `field` or
`framed` — from the role, the extent and the position the composition already gave it. Treatments
are *resolved*, not authored: the model says what the artwork is for and where it sits, and
realizing that is the compiler's under `spec.md §7.6a #3`. The composition language, its schema and
its prompt are untouched.

`contained` and `side-anchor` stop being watermarks. The decoration becomes a full-height column on
its own side, and the overlay's content is padded out of it, so text and artwork occupy different
pixels. **That is what earns `protection: none`** — the scrim is gone because the overlap is gone,
not because legibility was traded away. `field` keeps the old behaviour exactly: ground under text,
cropped to fill, scrimmed at the lightest step that clears AA against both a pure black and a pure
white asset.

## Measured

| | baseline | improved |
| --- | --- | --- |
| Artwork box, 1280 | 527 × 312 | **528 × 873** |
| Rendered image, 1280 | 312 × 312 (`contain`, letterboxed) | **528 × 528** (`contain`, fills the column) |
| Scrim over the artwork | 0.65 | **none** |
| Artwork box, 390 | 374 × 160 (image letterboxed to 160 × 160) | **374 × 240**, `cover` |
| Page, 390 / 1280 | 390×1474 / 1280×1907 | 390×1512 / 1280×1913 |
| Verified clean, 390 / 1280 | ✓ / ✓ | ✓ / ✓ |

At 1280 the text now ends at **602px** and the artwork starts at **752px** — the separation the
missing scrim is paid for by. Rendered artwork area is about **2.9×** the baseline's, at full
opacity instead of 35%.

**The asset still cannot move the page.** Removing it from the improved spec leaves both
breakpoints byte-identical in document dimensions — the reserved box is the geometry, which is the
invariant every artwork claim rests on.

## What is not claimed

Nothing here is scored. Whether the result is *good* — integral rather than appended, important but
not overbearing, closer to a finished invitation than a design-system demo — is the operator's
judgement from the pictures, and `index.html` puts those questions next to them. No model was asked.

One sample, one concept, one asset. This says the placement system can use a good asset well; it
does not say anything about a population of concepts or a population of assets.
