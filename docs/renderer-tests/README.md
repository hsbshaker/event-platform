# Renderer tests

Evidence artifacts from the first renderer stress test (constrained heritage brief, Brief 1).

- `event-renderer-gallery.html` — self-contained gallery: A/B/C concepts plus a palette-only control, 390/1280 toggle, grayscale toggle, full guest-surface lab.
- `renderer-test-specs.json` — the four hand-authored specs the gallery renders.
- `event-renderer-system-skeleton.md` — the pre-test contract (Step 2A), superseded by `../event-renderer-system.md`.

These artifacts use the **pre-compiler** spec shape (fourteen-field `DesignSpec`, `primary/secondary/accent/surface` palette roles) and hard-code most dimensions in archetype CSS. They are historical evidence from before Revision 5, not product requirements, and are superseded twice over: by the Revision 5 archetype bundles and then by the Revision 6 composition language. Current renderer evidence is `../../proof-b/` (harness, primitive renderer, confirmation run) and the contracts in `../event-renderer-system.md` Revision 2.
