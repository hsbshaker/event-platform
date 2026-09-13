/**
 * The four opaque guest components.
 *
 * `docs/event-renderer-system.md §8`: "guest components are the opaque `RSVP`, `Registry`,
 * `RegistryItem`, `CashFund` ... they take width from their container, surface from the nearest
 * `Surface`, and card/button/border language from the page system." Opaque means the model
 * authored the slot and nothing inside it: their internals are compiler-owned.
 *
 * # Why these are shells
 *
 * The RSVP flow, registry data and gift state are later phases. What this phase owes them is the
 * structure and theming — the right box, at the right width, on the right surface, in the page's
 * own card and button language — so that rendered-geometry verification measures the real shape of
 * the page rather than a gap where a component will later appear.
 *
 * So the placeholder regions are sized by the stylesheet, not filled with stand-in copy. Inventing
 * guest-visible wording here would be product behavior with no acceptance criterion behind it, and
 * `proof-b`'s wording is sample copy for one fictional event. Each region is labelled with the
 * component's own name, which is the least that can make it announceable.
 */

import { SECTION_HEADING_COPY } from "@/lib/renderer/compile/semantic-copy";

import type { CashFund, Registry, RegistryItem, RSVP } from "@/lib/renderer/composition/nodes";
import { primitive } from "../primitive";

/**
 * A sized, themed stand-in for content a later phase fills in. `aria-hidden` because it is a box,
 * not information: the labelled region around it is what a screen reader announces.
 */
function Placeholder({ lines }: { lines: number }) {
  return (
    <div className="ev-placeholder" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span className="ev-placeholder-line" key={i} />
      ))}
    </div>
  );
}

export const RSVPPrimitive = primitive<RSVP>((node) => (
  <div className="ev-rsvp" data-id={node.id} role="region" aria-label={SECTION_HEADING_COPY.rsvp}>
    <Placeholder lines={4} />
  </div>
));

export const RegistryPrimitive = primitive<Registry>((node, ctx) => (
  // `layout` is a real subtree — a Grid, Stack or Split of RegistryItems — so it renders through
  // the dispatcher like any other child. Only the items themselves are opaque.
  <div
    className={`ev-registry${node.layout.t === "Stack" ? " ev-registry-list" : ""}`}
    data-id={node.id}
    role="region"
    aria-label={SECTION_HEADING_COPY.registry}
  >
    {ctx.renderNode(node.layout)}
  </div>
));

export const RegistryItemPrimitive = primitive<RegistryItem>((node) => (
  <div
    className={`ev-registry-item ev-item-${node.kind}${node.emphasis === "featured" ? " ev-featured" : ""}`}
    data-id={node.id}
  >
    <div className="ev-card">
      <div className="ev-thumb" aria-hidden="true" />
      <div className="ev-card-body">
        <Placeholder lines={3} />
      </div>
    </div>
  </div>
));

export const CashFundPrimitive = primitive<CashFund>((node) => (
  <div
    className="ev-cashfund ev-registry-item ev-item-cashfund"
    data-id={node.id}
    role="region"
    aria-label="Cash fund"
  >
    <div className="ev-card">
      <div className="ev-thumb" aria-hidden="true" />
      <div className="ev-card-body">
        <Placeholder lines={3} />
      </div>
    </div>
  </div>
));
