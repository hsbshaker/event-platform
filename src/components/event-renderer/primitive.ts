/**
 * The one place a node is narrowed from the union to its own type.
 *
 * `PrimitiveComponent` takes `PrimitiveProps<AnyNode>` because the dispatcher holds all 29 in one
 * map and cannot know which it is calling. Each component, though, only makes sense for one node
 * type. Rather than let every component reach for its own cast — 29 chances to narrow to the wrong
 * type, unreviewed — the narrowing happens here, once, guarded by the invariant that makes it
 * sound: `PRIMITIVES` is keyed by node type and the dispatcher looks a node up by `node.t`, so the
 * component registered under `"Stack"` is only ever called with a `Stack`.
 *
 * The map-keys/`PRIMITIVE_KINDS` equality test (`docs/phase-3-invariant-obligations.md` row 10) is
 * what keeps that invariant true, which is why this cast is safe here and would not be if it were
 * scattered across 29 files.
 */

import type { ReactNode } from "react";

import type { AnyNode } from "@/lib/renderer/composition/nodes";
import type { PrimitiveComponent, RenderContext } from "./contract";

/** A canonicalized node: `canonicalize` stamped `id` on it, and the layout map is keyed by that. */
export type Identified<N> = N & { readonly id?: string };

export function primitive<N extends AnyNode>(
  render: (node: Identified<N>, ctx: RenderContext) => ReactNode,
): PrimitiveComponent {
  return ({ node, ctx }) => render(node as Identified<N>, ctx);
}
