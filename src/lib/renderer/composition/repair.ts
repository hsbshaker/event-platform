/* eslint-disable @typescript-eslint/no-explicit-any --
 * Repair reaches into the tree by dynamic path (`sections[0].root.children[1].child`) and
 * replaces nodes with nodes of a different primitive type. The reference implementation is
 * untyped at exactly these points; introducing types here would either change the code or
 * amount to casting every read back to `any`, and Phase 3 item 1 is a port with no behaviour
 * change. Every other module in this directory is typed.
 */

/**
 * 3. Deterministic repair (no model call; every step logged).
 *
 * Structural, coverage, capability, responsive, box, motif-kind and fit defects are repaired
 * here rather than re-prompted (`docs/event-renderer-system.md §3`, `spec.md §32` #22). The loop
 * revalidates after each fix and stops when the tree is stable or after 40 iterations; whatever
 * is left is returned as `remaining` rather than silently ignored.
 *
 * Library macros (a hero, an rsvp section, a registry section) are the only repair inputs that
 * are not rules; they come from the A.1 library, chosen by seed
 * (`docs/event-renderer-system.md §3`).
 *
 * Ported from `proof-b/src/composition.ts` (Phase 3, item 1) with one deliberate divergence: the
 * parent lookup behind every array-child repair, recorded as defect #1 in
 * `docs/phase-3-reference-defects.md`. See `slotOf` below. Everything else is byte-for-byte.
 */

import type {
  AnyNode,
  CNode,
  Capabilities,
  Cell,
  CompositionTree,
  Cluster,
  Overlay,
  Repair,
  Section,
  Split,
  Stack,
  Violation,
} from "./nodes";
import { CONTAINERS, INLINE_LEAVES } from "./tokens";
import { LIMITS } from "./spec";
import { validateStructure } from "./validate-structure";
import {
  childrenOf,
  clone,
  count,
  countNodes,
  findFirst,
  findLast,
  hasTextDescendant,
  walk,
} from "./walk";

export interface Macros {
  hero: (seed: number) => CNode;
  rsvpSection: (seed: number) => Section;
  registrySection: (seed: number, caps: Capabilities) => Section;
}

export const DEFAULT_MACROS: Macros = {
  hero: () => ({
    t: "Stack",
    gap: "normal",
    children: [
      { t: "Eyebrow" },
      { t: "EventTitle", emphasis: "display" },
      { t: "Hosts" },
      { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }] },
      { t: "CTA", target: "rsvp" },
    ],
  }),
  rsvpSection: () => ({
    kind: "rsvp",
    surface: "base",
    root: {
      t: "Stack",
      children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }],
    },
  }),
  registrySection: (_s, caps) => ({
    kind: "registry",
    surface: "alt",
    root: {
      t: "Stack",
      children: [
        { t: "SectionHeading", for: "registry" },
        {
          t: "Registry",
          layout: {
            t: "Grid",
            columns: 3,
            mobile: 1,
            children: (["gift", "external", "cashfund"] as const)
              .filter(
                (k) =>
                  (k === "gift" && caps.gifts) ||
                  (k === "external" && caps.externalRegistry) ||
                  (k === "cashfund" && caps.cashFund),
              )
              .map((k) => ({ t: "Cell" as const, child: { t: "RegistryItem" as const, kind: k } })),
          },
        },
      ],
    },
  }),
};

/**
 * Defined by the reference implementation but never called by it. Carried over so the port is
 * complete.
 */
export const contentOf = (n: AnyNode): CNode =>
  n.t === "Overlay"
    ? (n as Overlay).content
    : n.t === "Cell"
      ? (n as Cell).child
      : (n as any).child || (n as any).children?.[0] || n;

export function repair(
  input: CompositionTree,
  caps: Capabilities,
  seed = 1,
  macros: Macros = DEFAULT_MACROS,
): { tree: CompositionTree; repairs: Repair[]; remaining: Violation[] } {
  const tree = clone(input);
  const repairs: Repair[] = [];
  const log = (rule: string, path: string, kind: Repair["kind"], before?: string, after?: string) =>
    repairs.push({ rule, path, kind, before, after });

  // path like sections[0].root.children[1].child
  const setAt = (path: string, value: any) => {
    const parts = path.match(/[^.\[\]]+/g)!;
    let o: any = tree;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  };
  const getAt = (path: string) => {
    const parts = path.match(/[^.\[\]]+/g)!;
    let o: any = tree;
    for (const p of parts) o = o[p];
    return o;
  };
  const removeAt = (path: string) => {
    const parts = path.match(/[^.\[\]]+/g)!;
    let o: any = tree;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    const last = parts[parts.length - 1];
    if (Array.isArray(o)) o.splice(Number(last), 1);
    else delete o[last];
  };
  const leavesOf = (n: AnyNode): AnyNode[] =>
    childrenOf(n).length ? childrenOf(n).flatMap((c) => leavesOf(c.node)) : [n];

  /**
   * The slot a node occupies: the `children` array when it is an array child, otherwise the node
   * that owns the single-node slot it sits in.
   *
   * `walk` emits an array child as one path segment (`...children[2]`), so dropping the last
   * dot-segment lands on the owning node in both cases and `Array.isArray` on it is never true.
   * The array-child repairs below all test exactly that, to decide between removing a node and
   * replacing it in place; stripping the index instead of the whole segment is what makes the
   * removal branch reachable. Production divergence from `proof-b/src/composition.ts`, recorded
   * as defect #1 in `docs/phase-3-reference-defects.md`.
   */
  const slotOf = (path: string) => {
    const arrayChild = /^(.*)\[(\d+)\]$/.exec(path);
    return getAt(arrayChild ? arrayChild[1] : path.split(".").slice(0, -1).join("."));
  };

  // one full validation → fix the first fixable violation of each category → loop until stable
  const pass = () => {
    for (let iter = 0; iter < 40; iter++) {
      const vs = validateStructure(tree, caps);
      if (!vs.length) return;
      let changed = false;
      for (const vio of vs) {
        const r = vio.rule,
          p = vio.path;
        try {
          if (r === "sections.heroFirst") {
            const i = tree.sections.findIndex((s) => s.kind === "hero");
            if (i > 0) {
              const [h] = tree.sections.splice(i, 1);
              tree.sections.unshift(h);
            } else tree.sections[0].kind = "hero";
            log(r, p, "structural");
            changed = true;
          } else if (r === "sections.duplicateKind") {
            const seenK = new Set<string>();
            for (let i = 0; i < tree.sections.length; i++) {
              const k = tree.sections[i].kind;
              if (seenK.has(k)) {
                const alt = k === "hero" ? "details" : "details";
                if (seenK.has(alt) || k === "details") {
                  tree.sections.splice(i, 1);
                  log(r, `sections[${i}]`, "structural", k, "dropped");
                } else {
                  tree.sections[i].kind = alt as any;
                  log(r, `sections[${i}]`, "structural", k, alt);
                }
                changed = true;
                break;
              }
              seenK.add(k);
            }
          } else if (r === "sections.count") {
            if (tree.sections.length > LIMITS.sectionsMax) {
              const i = tree.sections.findIndex((s, i) => i > 0 && s.kind === "band");
              tree.sections.splice(i > 0 ? i : tree.sections.length - 1, 1);
              log(r, p, "structural", "dropped a section");
              changed = true;
            } else {
              tree.sections.push({
                kind: "details",
                surface: "base",
                root: {
                  t: "Stack",
                  children: [
                    { t: "SectionHeading", for: "details" },
                    { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
                  ],
                },
              });
              log(r, p, "coverage", "added details section");
              changed = true;
            }
          } else if (r === "sections.bandRoot") {
            setAt(p, { t: "MotifBand", height: "medium" });
            log(r, p, "structural");
            changed = true;
          } else if (r === "sections.root") {
            const n = getAt(p);
            setAt(p, { t: "Stack", children: [n] });
            log(r, p, "structural", n.t, "wrapped in Stack");
            changed = true;
          } else if (r === "sections.fill") {
            delete getAt(p).fill;
            log(r, p, "structural");
            changed = true;
          } else if (r === "surfaces.contrastRun") {
            getAt(p).surface = "alt";
            log(r, p, "structural", "contrast", "alt");
            changed = true;
          } else if (r === "capability.rsvpSection" || r === "capability.registrySection") {
            const k = r === "capability.rsvpSection" ? "rsvp" : "registry";
            const i = tree.sections.findIndex((s) => s.kind === k);
            tree.sections.splice(i, 1);
            log(r, `sections[${i}]`, "capability", k, "dropped section");
            changed = true;
          } else if (r === "coverage.rsvpSection") {
            tree.sections.push(macros.rsvpSection(seed));
            log(r, p, "coverage", undefined, "rsvp section macro appended");
            changed = true;
          } else if (r === "coverage.registrySection") {
            tree.sections.push(macros.registrySection(seed, caps));
            log(r, p, "coverage", undefined, "registry section macro appended");
            changed = true;
          } else if (r === "depth") {
            // walk up the path: merge the deepest Stack-in-Stack; if none, collapse the deepest container to its leaves
            const parts = p.split(".");
            let done = false;
            for (let k = parts.length - 1; k >= 2 && !done; k--) {
              const np = parts.slice(0, k).join("."),
                pp = parts.slice(0, k - 1).join(".");
              const n = getAt(np),
                par = getAt(pp);
              if (n && par && n.t === "Stack" && par.t === "Stack") {
                const idx = par.children.indexOf(n);
                par.children.splice(idx, 1, ...n.children);
                log(r, np, "structural", "Stack in Stack", "merged");
                done = true;
              }
            }
            if (!done) {
              for (let k = parts.length - 1; k >= 1 && !done; k--) {
                const np = parts.slice(0, k).join(".");
                const n = getAt(np);
                if (n && CONTAINERS.includes(n.t) && n.t !== "Registry") {
                  const l = leavesOf(n).slice(0, 8);
                  setAt(np, l.length === 1 ? l[0] : { t: "Stack", children: l });
                  log(r, np, "structural", n.t, "collapsed to leaves");
                  done = true;
                }
              }
            }
            changed = true;
          } else if (r === "nesting.cluster") {
            const n = getAt(p);
            const parts = p.split(".");
            const cl = getAt(parts.slice(0, -1).join(".")) as Cluster;
            const idx = cl.children.indexOf(n);
            const inl = leavesOf(n).filter((l) => INLINE_LEAVES.includes(l.t));
            cl.children.splice(idx, 1, ...inl);
            cl.children = cl.children.slice(0, 6);
            if (cl.children.length < 2) {
              setAt(parts.slice(0, -1).join("."), {
                t: "Stack",
                children: cl.children.length ? cl.children : [{ t: "Venue" }],
              });
            }
            log(r, p, "structural", n.t, "inlined leaves");
            changed = true;
          } else if (r === "nesting.clusterRule") {
            getAt(p).orientation = "v";
            log(r, p, "structural");
            changed = true;
          } else if (r === "nesting.rail") {
            const n = getAt(p);
            const leaves = leavesOf(n)
              .filter((l) => INLINE_LEAVES.includes(l.t))
              .slice(0, 4);
            setAt(
              p,
              leaves.length
                ? { t: "Stack", children: leaves }
                : { t: "MotifField", motif: { id: "linen", role: "field" } },
            );
            log(r, p, "structural", n.t, leaves.length ? "Stack of leaves" : "MotifField");
            changed = true;
          } else if (r === "nesting.gridCell") {
            const n = getAt(p);
            setAt(p, { t: "Cell", child: n });
            log(r, p, "structural", n.t, "wrapped in Cell");
            changed = true;
          } else if (r === "nesting.cellParent") {
            const n = getAt(p);
            setAt(p, n.child);
            log(r, p, "structural", "Cell", "unwrapped");
            changed = true;
          } else if (
            r === "nesting.cellChild" ||
            r === "nesting.gridInGrid" ||
            r === "nesting.overlayInOverlay" ||
            r === "nesting.railInRail" ||
            r === "nesting.splitDepth" ||
            r === "nesting.frameInFrame"
          ) {
            const n = getAt(p);
            const rep: any =
              n.t === "Overlay"
                ? n.content
                : n.t === "Grid"
                  ? { t: "Stack", children: n.children.map((c: Cell) => c.child) }
                  : n.t === "Rail"
                    ? n.child
                    : n.t === "Frame"
                      ? { t: "Stack", children: [n.child] }
                      : n.t === "Split"
                        ? { t: "Stack", children: n.children }
                        : n.child || n;
            setAt(p, rep);
            log(r, p, "structural", n.t, rep.t);
            changed = true;
          } else if (r === "nesting.surfaceSame") {
            const n = getAt(p);
            setAt(p, n.child);
            log(r, p, "structural", "Surface", "unwrapped");
            changed = true;
          } else if (r === "nesting.overlayContent") {
            const n = getAt(p);
            setAt(
              p,
              hasTextDescendant(n)
                ? { t: "Stack", children: [n] }
                : { t: "Stack", children: [n, { t: "EventTitle", emphasis: "display" }] },
            );
            log(r, p, "structural", n.t, "Stack");
            changed = true;
          } else if (r === "nesting.overlayDecoration") {
            const n = getAt(p);
            setAt(p, { t: "MotifField", motif: { id: "linen", role: "field" } });
            log(r, p, "structural", n.t, "MotifField linen");
            changed = true;
          } else if (r === "nesting.registryLayout") {
            const n = getAt(p);
            const items = leavesOf(n).filter((l) => l.t === "RegistryItem");
            setAt(p, {
              t: "Stack",
              children: items.length ? items : [{ t: "RegistryItem", kind: "gift" }],
            });
            log(r, p, "structural", n.t, "Stack of items");
            changed = true;
          } else if (r === "nesting.registryLeaf") {
            const n = getAt(p);
            const items = leavesOf(n).filter((l) => l.t === "RegistryItem");
            if (items.length)
              setAt(p, items.length === 1 ? items[0] : { t: "Stack", children: items });
            else removeAt(p);
            log(r, p, "structural", n.t, items.length ? "items only" : "dropped");
            changed = true;
          } else if (r === "nesting.registryItemOutside") {
            removeAt(p);
            log(r, p, "structural", "RegistryItem", "dropped");
            changed = true;
          } else if (r === "component.parent" || r === "component.narrowCell") {
            // hoist: remove and append to the section root Stack (wrapping root if needed)
            const n = getAt(p);
            const parentArr = slotOf(p);
            if (Array.isArray(parentArr) && parentArr.length > 1) removeAt(p);
            else setAt(p, { t: "Rule", weight: "hairline" });
            const si = Number(p.match(/sections\[(\d+)\]/)![1]);
            const s = tree.sections[si];
            if (s.root.t === "Stack") (s.root as Stack).children.push(n);
            else s.root = { t: "Stack", children: [s.root, n] };
            log(r, p, "structural", n.t, "hoisted to section root");
            changed = true;
          } else if (r === "component.splitShare") {
            const parts = p.split(".");
            const sp = getAt(parts.slice(0, -1).join(".")) as Split;
            sp.ratio = "50";
            log(r, p, "structural", "ratio", "50");
            changed = true;
          } else if (r === "component.rsvpSection" || r === "component.registrySection") {
            const n = getAt(p);
            const k = n.t === "RSVP" ? "rsvp" : "registry";
            removeAt(p);
            let s = tree.sections.find((x) => x.kind === k);
            if (!s) {
              s = { kind: k as any, surface: "base", root: { t: "Stack", children: [] } };
              tree.sections.push(s);
            }
            if (s.root.t === "Stack") (s.root as Stack).children.push(n);
            else s.root = { t: "Stack", children: [s.root, n] };
            log(r, p, "structural", n.t, `moved to ${k} section`);
            changed = true;
          } else if (r === "boxes.depth") {
            const n = getAt(p);
            const rep: any = n.t === "Frame" ? { t: "Stack", children: [n.child] } : n.child;
            setAt(p, rep);
            log(r, p, "structural", n.t, rep.t === "Stack" ? "Stack (box removed)" : "unwrapped");
            changed = true;
          } else if (r === "motif.kind") {
            const n = getAt(p);
            if (n.t === "Glyph") {
              log(r, p, "structural", n.motif, "celestial");
              n.motif = "celestial";
            } else if (n.t === "Rule") {
              log(r, p, "structural", n.glyphs, "celestial");
              n.glyphs = "celestial";
            } else {
              log(r, p, "structural", n.motif.id, "linen");
              n.motif = { id: "linen", role: n.motif.role };
            }
            changed = true;
          } else if (r === "responsive.splitKeep") {
            getAt(p).mobile = "stack";
            log(r, p, "responsive", "keep", "stack");
            changed = true;
          } else if (r === "responsive.railHide") {
            getAt(p).mobile = "top";
            log(r, p, "responsive", "hide", "top");
            changed = true;
          } else if (r === "capability.node") {
            const n = getAt(p);
            const parent = slotOf(p);
            if (Array.isArray(parent)) {
              if (parent.length > 1) removeAt(p);
              else setAt(p, { t: "Rule", weight: "hairline" });
            } else if (n.t === "RSVP" || n.t === "Registry" || n.t === "CashFund") {
              setAt(p, { t: "Rule", weight: "hairline" });
            } else setAt(p, { t: "Rule", weight: "hairline" });
            log(r, p, "capability", n.t, "dropped (not available for this event)");
            changed = true;
          } else if (r === "limits.sectionNodes" || r === "limits.pageNodes") {
            // drop decorative leaves first, then trailing optional text
            const si =
              r === "limits.sectionNodes"
                ? Number(p.match(/\[(\d+)\]/)![1])
                : tree.sections
                    .map((s, i) => [countNodes(s.root), i])
                    .sort((a, b) => b[0] - a[0])[0][1];
            const order = [
              "Glyph",
              "Rule",
              "MotifBand",
              "MotifField",
              "Monogram",
              "Deadline",
              "Location",
              "Eyebrow",
              "Time",
              "Description",
              "Hosts",
            ];
            let dropped = false;
            for (const t of order) {
              const target = findLast(tree, si, t);
              if (target) {
                const parent = slotOf(target);
                if (Array.isArray(parent) && parent.length > 1) {
                  removeAt(target);
                  dropped = true;
                  log(r, target, "structural", t, "dropped for node budget");
                  break;
                }
              }
            }
            if (!dropped) {
              const s = tree.sections[si];
              const l = leavesOf(s.root as AnyNode);
              s.root = { t: "Stack", children: l.slice(0, 8) };
              log(r, p, "structural", "section", "flattened to leaves");
            }
            changed = true;
          } else if (r === "limits.perSection" || r === "limits.perPage") {
            const t = vio.detail!.split(" ")[1];
            const si = r === "limits.perSection" ? Number(p.match(/\[(\d+)\]/)![1]) : -1;
            const target = findLast(tree, si, t)!;
            const n = getAt(target);
            // An over-cap Artwork is dropped rather than substituted. Every other over-cap
            // primitive has a meaningful reduction — an Overlay becomes its content, a Grid its
            // cells — but artwork carries no content to preserve, and turning it into a `Rule`
            // would invent ornament the model did not ask for (and, in a decoration slot, would
            // immediately re-violate `nesting.overlayDecoration`). Dropping is only possible where
            // a sibling remains; in a required single slot the existing substitution still
            // applies, and `nesting.overlayDecoration` then normalizes it.
            const arr = n.t === "Artwork" ? slotOf(target) : null;
            if (Array.isArray(arr) && arr.length > 1) {
              removeAt(target);
              log(r, target, "structural", "Artwork", "dropped for artwork budget");
              changed = true;
              continue;
            }
            const rep: any =
              n.t === "Overlay"
                ? n.content
                : n.t === "Frame"
                  ? { t: "Stack", children: [n.child] }
                  : n.t === "Rail"
                    ? n.child
                    : n.t === "Grid"
                      ? { t: "Stack", children: n.children.map((c: Cell) => c.child) }
                      : { t: "Rule", weight: "hairline" };
            setAt(target, rep);
            log(r, target, "structural", n.t, rep.t);
            changed = true;
          } else if (r === "coverage.duplicate") {
            const m = vio.detail!.match(/^(\w+)(?: (\w+))?/)!;
            let t = m[1];
            let filter: (n: AnyNode) => boolean = () => true;
            if (t === "RegistryItem") {
              const k = m[2];
              filter = (n) => (n as any).kind === k;
            } else if (t === "cash") {
              t = "CashFund";
            } else if (t === "Date") {
              const forms = new Set<string>();
              filter = (n) => {
                const f = (n as any).form;
                if (forms.has(f)) return true;
                forms.add(f);
                return false;
              };
            }
            const scope = p.startsWith("sections[") ? p : "";
            const paths: string[] = [];
            walk(tree, (v) => {
              if (v.node.t === t && v.path.startsWith(scope) && filter(v.node)) paths.push(v.path);
            });
            const victim =
              t === "Date" && paths.length ? paths[paths.length - 1] : paths[1] || paths[0];
            if (!victim) continue;
            const parent = slotOf(victim);
            if (Array.isArray(parent) && parent.length > 1) removeAt(victim);
            else setAt(victim, { t: "Rule", weight: "hairline" });
            log(r, victim, "coverage", t, "duplicate dropped");
            changed = true;
          } else if (r === "coverage.missing") {
            const what = vio.detail!.split(" ")[0];
            if (what === "EventTitle") {
              tree.sections[0].root = macros.hero(seed);
              log(r, "sections[0].root", "coverage", "hero without EventTitle", "hero macro");
            } else if (what === "RSVP") {
              const s = tree.sections.find((x) => x.kind === "rsvp")!;
              (s.root.t === "Stack"
                ? (s.root as Stack).children
                : ((s.root = { t: "Stack", children: [s.root] }) as Stack).children
              ).push({ t: "RSVP" });
              log(r, p, "coverage", undefined, "RSVP appended");
            } else if (what === "Registry") {
              const s = tree.sections.find((x) => x.kind === "registry")!;
              const items = (["gift", "external", "cashfund"] as const).filter(
                (k) =>
                  (k === "gift" && caps.gifts) ||
                  (k === "external" && caps.externalRegistry) ||
                  (k === "cashfund" &&
                    caps.cashFund &&
                    !count(tree, (v) => v.node.t === "CashFund")),
              );
              (s.root.t === "Stack"
                ? (s.root as Stack).children
                : ((s.root = { t: "Stack", children: [s.root] }) as Stack).children
              ).push({
                t: "Registry",
                layout: {
                  t: "Stack",
                  children: items.map((k) => ({ t: "RegistryItem" as const, kind: k })),
                },
              });
              log(r, p, "coverage", undefined, "Registry appended");
            } else {
              const node: CNode = what === "Venue" ? { t: "Venue" } : { t: "Date", form: "full" };
              let s = tree.sections.find((x) => x.kind === "details");
              if (!s) {
                s = tree.sections[0];
              }
              const root = s.root as AnyNode;
              const cl = leavesOf(root).length && findFirst(s.root, "Cluster");
              if (cl) (cl as Cluster).children.push(node);
              else if (root.t === "Stack")
                (root as Stack).children.push({
                  t: "Cluster",
                  children: [node, { t: "Time" }],
                });
              else
                s.root = {
                  t: "Stack",
                  children: [s.root, { t: "Cluster", children: [node, { t: "Time" }] }],
                };
              log(r, p, "coverage", undefined, `${what} appended`);
            }
            changed = true;
          }
        } catch {
          /* a repair that throws is skipped; the violation stays in remaining */
        }
        if (changed) break;
      }
      if (!changed) break;
    }
  };

  pass(); // the reference names this pass "main"; there has only ever been one.
  return { tree, repairs, remaining: validateStructure(tree, caps) };
}
