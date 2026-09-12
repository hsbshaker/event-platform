# Renderer tests

Evidence artifacts from the first renderer stress test (constrained heritage brief, Brief 1).

- `event-renderer-gallery.html` — self-contained gallery: A/B/C concepts plus a palette-only control, 390/1280 toggle, grayscale toggle, full guest-surface lab.
- `renderer-test-specs.json` — the four hand-authored specs the gallery renders.
- `event-renderer-system-skeleton.md` — the pre-test contract (Step 2A), superseded by `../event-renderer-system.md`.

These artifacts use the **pre-compiler** spec shape (fourteen-field `DesignSpec`, `primary/secondary/accent/surface` palette roles) and hard-code most dimensions in archetype CSS. They are historical evidence, not product requirements. The next gallery must consume six-field `DesignIntent` through the compiler as defined in `../event-renderer-system.md`.
