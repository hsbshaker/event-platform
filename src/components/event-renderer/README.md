# Event renderer components

One fixed component per composition primitive (`docs/event-renderer-system.md`). The
renderer consumes a persisted, verified `ResolvedDesignSpec` only and derives no CSS
text from model output; classes and numeric custom properties only (`spec.md §32 #19`).

Populated in Phase 3 by porting `proof-b/` without behaviour change. Nothing here may
import from `src/components/app` or `src/styles/app-tokens.css` (`design-system.md §23.7`).
