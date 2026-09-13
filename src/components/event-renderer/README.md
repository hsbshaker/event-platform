# Event renderer components

One fixed component per composition primitive (`docs/event-renderer-system.md §6`). The renderer
consumes resolved, verified, persisted design data only and derives no CSS text from model output;
classes and numeric custom properties only (`spec.md §32 #19`).

```text
contract.ts          what a primitive may see; PRIMITIVE_KINDS, cssVars/cssNumbers, renderableMotif
primitive.ts         the single audited narrow from the node union to one node type
resolved-layout.ts   the shapes `resolveLayout` puts in `spec.layout`, typed where they are read
page.tsx             EventPage, the section shell, CollaboratorActionSlot, the dispatcher
primitives/          the 29 components, grouped by the four kinds NODE_SPEC declares
  containers.tsx  9  Stack Cluster Split Rail Grid Cell Frame Surface Overlay
  decorative.tsx  5  MotifField MotifBand Rule Glyph Monogram
  text.tsx       11  Eyebrow EventTitle Hosts Description Deadline Venue Location Time Date
                     CTA SectionHeading
  components.tsx  4  RSVP Registry RegistryItem CashFund  (opaque; shells until later phases)
  index.ts           PRIMITIVES — its keys must equal PRIMITIVE_KINDS exactly
```

Styling lives in `src/styles/event-tokens.css`, which the consuming route must import; every
declaration there is hand-written and keyed by the classes and numbers these components emit.

Invariants enforced by `renderer.test.ts`: the map's keys equal the primitive allowlist, no
suppressed motif is drawn, no raw creative palette value or library fixture identifier reaches the
output, and a guest page contains no collaborator markup at all — absent, not hidden.

Nothing here may import from `src/components/app` or `src/styles/app-tokens.css`
(`design-system.md §23.7`), and no component branches on a recipe, silhouette or template
identifier (`event-renderer-system.md §7.1`).
