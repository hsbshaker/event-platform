# Phase 4E — artwork capability spike (locally grown)

One live image. One call. No retry. Run 2026-09-19 from
`scripts/smoke/phase4e-artwork-spike.smoke.ts`.

**This is not the Phase 4E quality gate, and it is not a provider selection.** It is a narrow
provider + transparency + renderer capability check on a single sample. `docs/technology-decisions.md §8`
still records image-model selection as open and names what a real selection has to measure.

## The question it was run to answer

Can one real image model produce one composition-aware, transparent, original thematic asset that
satisfies the `VisualArtIntent` contract, survives objective measurement, attaches through the
artwork system, and does so **without changing the geometry the spec was already verified under**?

## What is here

| File | What it is |
| --- | --- |
| `artwork.png` | The exact bytes the provider returned. Unedited, unresized, unregenerated. |
| `visual-art-intent.json` | The brief that was sent, schema-valid against the production contract. |
| `provider-request-summary.json` | Provider, pinned model, parameters. No credential, no prompt bytes. |
| `provider-response-summary.json` | Usage, cost, latency, request id, transparency verdict, telemetry. No base64. |
| `metrics.json` | Objective measurements of the returned pixels, and the geometry before and after. |
| `before-mobile.png`, `before-desktop.png` | The page with the artwork slot reserved and **no asset**. |
| `after-mobile.png`, `after-desktop.png` | The same page, same spec, same geometry, with this asset attached. |
| `index.html` | Contact sheet: the asset on a transparency checkerboard, both pairs, and every number. |

## The page

A **diagnostic derivative** of Phase 4D concept 1, *Tended Welcome*. Its hero was already an
`Overlay` whose decoration was a botanical `Glyph`; that one leaf was substituted by hand for
`{ t: "Artwork", role: "object" }` and nothing else about the tree moved. **No model authored this
tree and it is not composition evidence.**

The historical 4D evidence it was read from is untouched.

Two things differ from the historical render and neither is the artwork. The compile **seed** is a
fixed literal, because the real one derives from a persisted identity-revision id the evidence does
not carry. And the **monogram** is absent, because the meaningless-provisional-initial fix landed
after 4D ran. Before and after share both, so the comparison isolates the asset.

## Result

One call, one attempt, zero retries, no failure.

| | |
| --- | --- |
| Model | `gpt-image-2.5-sunburst-2026-09-08` (pinned, dated) |
| Request | `n=1`, `1024x1024`, `quality=high`, `background=transparent`, `output_format=png`, `partial_images=0` |
| Request id | `req_1c72bfc2455e4f569a108e116fc953d8` |
| Usage | 446 input text tokens, 1,756 output tokens |
| **Cost** | **$0.05491** against a $0.50 ceiling |
| Latency | 35.7 s provider, 35.7 s wall |
| Asset | 1024×1024 PNG, 1,595,223 bytes |
| Transparency | `verified_present` — measured from pixels, not claimed |
| Geometry | **unchanged**: 390×1474 and 1280×1907, before and after |
| Verified clean | 390 ✓ 1280 ✓ |

### Transparency, measured

60.43% of pixels fully transparent, 39.57% partial, **0% fully opaque**, all four outer edges
clear, `looksLikeOpaqueCanvas: false`. No opaque rectangle where transparency was requested.

That "0% fully opaque" needs a note. A finer histogram computed afterwards from this same file
gives a **maximum alpha of 254** — the model appears never to emit 255 — with 26.91% of pixels at
250–254, 4.80% at 200–249, 0.92% at 128–199, 1.61% at 16–127 and 5.32% at 1–15. So the subject is
effectively opaque with a soft feathered halo, and the "no fully opaque pixel" reading is a
provider characteristic rather than a translucent subject. **A transparency check keyed on
`alpha === 255` would misread this asset**; the one in `raster.ts` is not, and did not.

### Composition, measured

Centroid at (0.436, 0.390) — upper-left of centre, as the brief asked. Visual mass by quadrant:
top-left 0.416, top-right 0.343, bottom-left 0.211, **bottom-right 0.030**. The requested open
space in the lower right measures **95.7% transparent**. Bounding box margins 5.1% top, 10.9%
right, 18.2% bottom, 4.2% left — **no edge-risk flag**; nothing reaches within 2% of an edge.

### Palette, measured

Distance from the nearest opaque pixel to each intended colour: `#65704A` **0**, `#F3EAD7` **1**,
`#D6A84B` **2.2**, `#C75B3F` **5**. 34.4% of opaque pixels sit within tolerance of the olive.

### Text in image

**Requires visual operator inspection.** No reliable local detector exists in this repository, and
no second paid model was called to look at the image.

## What this does not establish

One asset from one model on one page. Nothing here is a claim about the model in general, about
whether artwork raises the design ceiling, or about whether this particular artwork is good — the
design is deliberately not scored, and that judgement is the operator's from the pictures.

## What it did expose

The desktop render shows the artwork **heavily dimmed by the readability scrim** and small. The
scrim is correct by the rules — the compiler resolved 0.65 because the overlay sets text over the
decoration region — but at that strength an `object`-role illustration reads as a faint ghost.
On mobile, where `mobile: "stack"` moves the decoration out from under the text, it renders at full
strength. Nothing was tuned after seeing the image; this is recorded as a finding.
