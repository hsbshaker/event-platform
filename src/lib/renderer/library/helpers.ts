/**
 * Internal node-builder helpers, mirroring the small factory functions defined inline at the top
 * of `proof-b/library.js`. Not part of this directory's public surface (only `./index` is); kept
 * here purely so `heroes.ts`, `sections.ts` and `pages.ts` can share them without repeating the
 * transcription.
 *
 * Ported from `proof-b/library.js` with no behaviour change (Phase 3, item 2).
 */

import type {
  CashFund,
  Cell,
  CNode,
  Cluster,
  CTA,
  DateNode,
  Frame,
  Glyph,
  Grid,
  Heading,
  Monogram,
  MotifBand,
  MotifField,
  Overlay,
  Rail,
  Registry,
  RegistryItem,
  RSVP,
  RuleNode,
  Split,
  Stack,
  Surface,
  TextNode,
} from "../composition/nodes";
import type { MotifId, MotifRole } from "../composition/tokens";

/**
 * Maps each node tag to its concrete interface. Needed because `Extract<CNode, { t: K }>` cannot
 * recover the right shape for the eight `TextKind` tags (`Eyebrow`, `EventTitle`, `Hosts`,
 * `Description`, `Deadline`, `Venue`, `Location`, `Time`): they all share one `TextNode`
 * interface whose own `t` field is typed as the whole `TextKind` union, not the individual
 * literal, so a structural `Extract` against a single literal tag resolves to `never` for any of
 * them. This table names each interface directly instead.
 */
type NodeOf<K extends CNode["t"]> = K extends
  "Eyebrow" | "EventTitle" | "Hosts" | "Description" | "Deadline" | "Venue" | "Location" | "Time"
  ? TextNode
  : K extends "Date"
    ? DateNode
    : K extends "CTA"
      ? CTA
      : K extends "SectionHeading"
        ? Heading
        : K extends "RSVP"
          ? RSVP
          : K extends "Registry"
            ? Registry
            : K extends "RegistryItem"
              ? RegistryItem
              : K extends "CashFund"
                ? CashFund
                : K extends "Stack"
                  ? Stack
                  : K extends "Cluster"
                    ? Cluster
                    : K extends "Split"
                      ? Split
                      : K extends "Rail"
                        ? Rail
                        : K extends "Grid"
                          ? Grid
                          : K extends "Cell"
                            ? Cell
                            : K extends "Frame"
                              ? Frame
                              : K extends "Surface"
                                ? Surface
                                : K extends "Overlay"
                                  ? Overlay
                                  : K extends "MotifField"
                                    ? MotifField
                                    : K extends "MotifBand"
                                      ? MotifBand
                                      : K extends "Rule"
                                        ? RuleNode
                                        : K extends "Glyph"
                                          ? Glyph
                                          : K extends "Monogram"
                                            ? Monogram
                                            : never;

/**
 * The reference's generic `T(t, p)` node builder. `p` is typed as a partial of the node's own
 * (non-`t`) fields — every call site below supplies whatever fields that node actually requires,
 * exactly as the untyped reference does; the single cast is this file's only concession to that
 * genericity and is not exposed to callers of `./index`.
 */
export function T<K extends CNode["t"]>(t: K, p: Partial<Omit<NodeOf<K>, "t">> = {}): NodeOf<K> {
  return { t, ...p } as NodeOf<K>;
}

export function stack(children: CNode[], p: Partial<Omit<Stack, "t" | "children">> = {}): Stack {
  return { t: "Stack", children, ...p };
}

export function cluster(
  children: CNode[],
  p: Partial<Omit<Cluster, "t" | "children">> = {},
): Cluster {
  return { t: "Cluster", children, ...p };
}

export function split(
  ratio: Split["ratio"],
  children: CNode[],
  mobile: Split["mobile"] = "stack",
  p: Partial<Omit<Split, "t" | "ratio" | "mobile" | "children">> = {},
): Split {
  return { t: "Split", ratio, mobile, children, ...p };
}

export function cell(child: CNode, p: Partial<Omit<Cell, "t" | "child">> = {}): Cell {
  return { t: "Cell", child, ...p };
}

export function field(
  id: MotifId,
  role: MotifRole = "field",
  p: Partial<Omit<MotifField, "t" | "motif">> = {},
): MotifField {
  return { t: "MotifField", motif: { id, role }, ...p };
}

export function title(p: Partial<Omit<TextNode, "t">> = {}): TextNode {
  return { t: "EventTitle", emphasis: "display", ...p };
}

export function meta(): Cluster {
  return cluster([T("Date", { form: "full" }), T("Time"), T("Venue")]);
}

export function copy(extra: CNode[] = []): Stack {
  return stack([...extra, T("Eyebrow"), title(), T("Hosts"), meta(), T("CTA", { target: "rsvp" })]);
}
