/**
 * 2. Structural validation.
 *
 * Returns violations; `repair()` fixes them. Nothing here re-prompts the model: nesting, depth,
 * limits, coverage, capability, responsive, box and motif-kind defects are all repaired
 * deterministically and logged by kind (`docs/event-renderer-system.md §3`, `spec.md §32` #22).
 *
 * The order violations are emitted in is observable — `repair()` fixes the first fixable
 * violation of each pass — so the emission order below must not change.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type {
  AnyNode,
  CNode,
  Capabilities,
  Cell,
  CompositionTree,
  CTA,
  DateNode,
  Frame,
  Glyph,
  Grid,
  Heading,
  MotifBand,
  MotifField,
  RegistryItem,
  Rail,
  RuleNode,
  Split,
  Stack,
  Surface,
  Violation,
} from "./nodes";
import { LIMITS } from "./spec";
import {
  ARRANGEMENT_MOTIFS,
  COMPONENTS,
  COMPONENT_PARENTS,
  INLINE_LEAVES,
  PATTERN_MOTIFS,
  ROOT_TYPES,
} from "./tokens";
import { containerDepth, findFirst, hasTextDescendant, walk } from "./walk";

export function validateStructure(tree: CompositionTree, caps: Capabilities): Violation[] {
  const v: Violation[] = [];
  const add = (rule: string, path: string, detail?: string) => v.push({ rule, path, detail });
  const secs = tree.sections;

  // ---- page shape: 3..6 sections, hero first, one of each kind, contrast runs bounded
  if (secs.length < LIMITS.sectionsMin || secs.length > LIMITS.sectionsMax)
    add(
      "sections.count",
      "sections",
      `${secs.length} sections; allowed ${LIMITS.sectionsMin}..${LIMITS.sectionsMax}`,
    );
  if (secs[0] && secs[0].kind !== "hero")
    add("sections.heroFirst", "sections[0]", "first section must be the hero");
  const kinds = secs.map((s) => s.kind);
  for (const k of ["hero", "details", "rsvp", "registry", "band"]) {
    const n = kinds.filter((x) => x === k).length;
    if (n > 1) add("sections.duplicateKind", "sections", `${n} sections of kind ${k}`);
  }
  if (caps.rsvp && !kinds.includes("rsvp"))
    add("coverage.rsvpSection", "sections", "rsvp is enabled but there is no rsvp section");
  if (!caps.rsvp && kinds.includes("rsvp"))
    add("capability.rsvpSection", "sections", "rsvp is not enabled");
  if (caps.registry && !kinds.includes("registry"))
    add(
      "coverage.registrySection",
      "sections",
      "registry is enabled but there is no registry section",
    );
  if (!caps.registry && kinds.includes("registry"))
    add("capability.registrySection", "sections", "registry is not enabled");
  let run = 0;
  secs.forEach((s, i) => {
    run = s.surface === "contrast" ? run + 1 : 0;
    if (run > 2)
      add("surfaces.contrastRun", `sections[${i}]`, "more than two consecutive contrast sections");
  });
  secs.forEach((s, i) => {
    if (s.kind === "band") {
      if (s.root.t !== "MotifBand")
        add("sections.bandRoot", `sections[${i}].root`, "band section root must be MotifBand");
    } else if (!ROOT_TYPES.includes(s.root.t))
      add("sections.root", `sections[${i}].root`, `${s.root.t} cannot be a section root`);
    if (s.fill === "screen" && s.kind !== "hero")
      add("sections.fill", `sections[${i}]`, "fill screen is hero-only");
  });

  // ---- per-section and per-page counts
  const perSec: Record<string, number>[] = secs.map(() => ({}));
  const perPage: Record<string, number> = {};
  const nodesPerSec = secs.map(() => 0);
  const seen: Record<string, { path: string; node: AnyNode }[]> = {};
  walk(tree, ({ node, path, parent, parentKey, ancestors, sectionIndex }) => {
    nodesPerSec[sectionIndex]++;
    const inRegistry = ancestors.some((a) => a.t === "Registry");
    // A Registry's own layout Grid is compiler-owned, so it does not spend the section's Grid budget.
    if (!(node.t === "Grid" && inRegistry)) {
      perSec[sectionIndex][node.t] = (perSec[sectionIndex][node.t] || 0) + 1;
      perPage[node.t] = (perPage[node.t] || 0) + 1;
    }
    (seen[node.t] ||= []).push({ path, node });
    const d = containerDepth(ancestors);
    if (d > LIMITS.depth) add("depth", path, `container depth ${d} > ${LIMITS.depth}`);
    const pt = parent ? parent.t : "section";

    // nesting matrix (docs/event-renderer-system.md §2.4)
    if (pt === "Cluster" && !INLINE_LEAVES.includes(node.t))
      add("nesting.cluster", path, `${node.t} inside Cluster`);
    if (node.t === "Rule" && pt === "Cluster" && (node as RuleNode).orientation !== "v")
      add("nesting.clusterRule", path, "only vertical rules inside Cluster");
    if (parentKey === "rail") {
      if (node.t !== "MotifField" && node.t !== "Stack")
        add("nesting.rail", path, `rail must be MotifField or Stack, got ${node.t}`);
      else if (
        node.t === "Stack" &&
        ((node as Stack).children.length > 4 ||
          (node as Stack).children.some((c) => !INLINE_LEAVES.includes(c.t)))
      )
        add("nesting.rail", path, "rail Stack holds at most 4 small leaves");
    }
    if (pt === "Grid" && node.t !== "Cell")
      add("nesting.gridCell", path, "Grid children must be Cell");
    if (node.t === "Cell" && pt !== "Grid")
      add("nesting.cellParent", path, "Cell only inside Grid");
    if (pt === "Cell" && (node.t === "Grid" || node.t === "Overlay"))
      add("nesting.cellChild", path, `${node.t} inside Cell`);
    if (node.t === "Frame" && ancestors.some((a) => a.t === "Frame"))
      add("nesting.frameInFrame", path, "no frame within a frame");
    if (node.t === "Overlay" && ancestors.some((a) => a.t === "Overlay"))
      add("nesting.overlayInOverlay", path);
    if (
      node.t === "Grid" &&
      !inRegistry &&
      ancestors.some((a) => a.t === "Grid" && !ancestors.some((b) => b.t === "Registry"))
    )
      add("nesting.gridInGrid", path);
    if (node.t === "Rail" && ancestors.some((a) => a.t === "Rail")) add("nesting.railInRail", path);
    if (
      node.t === "Split" &&
      ancestors.filter((a) => a.t === "Split").length >= LIMITS.splitNesting
    )
      add("nesting.splitDepth", path, "Split nested more than once");
    if (node.t === "Surface") {
      const eff = [...ancestors].reverse().find((a) => a.t === "Surface") as Surface | undefined;
      const role = eff ? eff.role : secs[sectionIndex].surface;
      if ((node as Surface).role === role)
        add("nesting.surfaceSame", path, `Surface ${role} inside ${role}`);
    }
    if (
      parentKey === "content" &&
      !(["Stack", "Frame", "Split"].includes(node.t) && hasTextDescendant(node))
    )
      add(
        "nesting.overlayContent",
        path,
        "Overlay content must be a text-bearing Stack, Frame or Split",
      );
    if (parentKey === "decoration") {
      const ok =
        node.t === "MotifField" ||
        node.t === "Monogram" ||
        node.t === "Glyph" ||
        (node.t === "Date" && (node as DateNode).form === "numeral");
      if (!ok)
        add(
          "nesting.overlayDecoration",
          path,
          "decoration must be MotifField, Monogram, Glyph or Date numeral",
        );
    }
    if (parentKey === "layout" && !["Grid", "Stack", "Split"].includes(node.t))
      add("nesting.registryLayout", path, "Registry layout must be Grid, Stack or Split");
    if (
      inRegistry &&
      parentKey !== "layout" &&
      !["Grid", "Cell", "Stack", "Split", "RegistryItem"].includes(node.t)
    )
      add("nesting.registryLeaf", path, `${node.t} inside Registry`);
    if (node.t === "RegistryItem" && !inRegistry)
      add("nesting.registryItemOutside", path, "RegistryItem only inside Registry");

    if (COMPONENTS.includes(node.t)) {
      if (!COMPONENT_PARENTS.includes(pt)) add("component.parent", path, `${node.t} inside ${pt}`);
      if (pt === "Cell") {
        const g = ancestors[ancestors.length - 2] as Grid;
        const span = (parent as Cell).span || 1;
        if (g && g.columns >= 3 && span < 2)
          add("component.narrowCell", path, "component in a narrow cell");
      }
      if (pt === "Split") {
        const sp = parent as Split;
        const idx = sp.children.indexOf(node as CNode);
        const share = idx === 0 ? Number(sp.ratio) : 100 - Number(sp.ratio);
        if (share < 50) add("component.splitShare", path, `component gets ${share}% of a Split`);
      }
      if (node.t === "RSVP" && secs[sectionIndex].kind !== "rsvp")
        add("component.rsvpSection", path, "RSVP must live in the rsvp section");
      if (node.t === "Registry" && secs[sectionIndex].kind !== "registry")
        add("component.registrySection", path, "Registry must live in the registry section");
    }

    // responsive intent that the compiler will not honour (docs/event-renderer-system.md §2.5)
    if (node.t === "Split" && (node as Split).mobile === "keep") {
      const heavy = (node as Split).children.some(
        (c) =>
          COMPONENTS.includes(c.t) ||
          findFirst(c, "Description") ||
          findFirst(c, "RSVP") ||
          findFirst(c, "Registry"),
      );
      if (heavy)
        add(
          "responsive.splitKeep",
          path,
          "keep demoted: a side holds a component or the description",
        );
    }
    if (
      node.t === "Rail" &&
      (node as Rail).mobile === "hide" &&
      (node as Rail).rail.t !== "MotifField"
    )
      add("responsive.railHide", path, "hide only for a MotifField rail");

    // box depth: a Frame or Surface inside a Frame or Surface inside a Frame or Surface is three borders
    if (node.t === "Frame" || node.t === "Surface") {
      const boxes = ancestors.filter((a) => a.t === "Frame" || a.t === "Surface").length;
      if (boxes >= 2) add("boxes.depth", path, `${node.t} nested inside ${boxes} boxes`);
    }

    // motif kind must match its slot: patterns fill fields, bands and frames; arrangements are glyphs and dividers
    if (node.t === "MotifField" || node.t === "MotifBand" || node.t === "Frame") {
      const m = (node as MotifField | MotifBand | Frame).motif;
      if (m && !PATTERN_MOTIFS.includes(m.id))
        add("motif.kind", path, `${m.id} is an arrangement, not a pattern`);
    }
    if (node.t === "Glyph" && !ARRANGEMENT_MOTIFS.includes((node as Glyph).motif))
      add("motif.kind", path, `${(node as Glyph).motif} is a pattern, not an arrangement`);
    if (
      node.t === "Rule" &&
      (node as RuleNode).glyphs &&
      !ARRANGEMENT_MOTIFS.includes((node as RuleNode).glyphs!)
    )
      add("motif.kind", path, `${(node as RuleNode).glyphs} is a pattern, not an arrangement`);

    // capabilities: the tree may reference only what the event has (docs/event-renderer-system.md §1.4)
    if (node.t === "Hosts" && !caps.hosts) add("capability.node", path, "Hosts not available");
    if (node.t === "Description" && !caps.description)
      add("capability.node", path, "Description not available");
    if (node.t === "Time" && !caps.time) add("capability.node", path, "Time not available");
    if (node.t === "Location" && !caps.location)
      add("capability.node", path, "Location not available");
    if (node.t === "Deadline" && !caps.deadline)
      add("capability.node", path, "Deadline not available");
    if (node.t === "CashFund" && !caps.cashFund)
      add("capability.node", path, "CashFund not available");
    if (node.t === "RSVP" && !caps.rsvp) add("capability.node", path, "RSVP not available");
    if (node.t === "Registry" && !caps.registry)
      add("capability.node", path, "Registry not available");
    if (node.t === "CTA" && (node as CTA).target === "registry" && !caps.registry)
      add("capability.node", path, "CTA registry not available");
    if (node.t === "CTA" && (node as CTA).target === "rsvp" && !caps.rsvp)
      add("capability.node", path, "CTA rsvp not available");
    if (node.t === "SectionHeading" && (node as Heading).for === "rsvp" && !caps.rsvp)
      add("capability.node", path, "rsvp heading not available");
    if (node.t === "SectionHeading" && (node as Heading).for === "registry" && !caps.registry)
      add("capability.node", path, "registry heading not available");
    if (node.t === "RegistryItem") {
      const k = (node as RegistryItem).kind;
      if (
        (k === "gift" && !caps.gifts) ||
        (k === "external" && !caps.externalRegistry) ||
        (k === "cashfund" && !caps.cashFund)
      )
        add("capability.node", path, `registry item ${k} not available`);
    }
  });

  nodesPerSec.forEach((n, i) => {
    if (n > LIMITS.nodesPerSection)
      add("limits.sectionNodes", `sections[${i}]`, `${n} nodes > ${LIMITS.nodesPerSection}`);
  });
  const total = nodesPerSec.reduce((a, b) => a + b, 0);
  if (total > LIMITS.nodesPerPage)
    add("limits.pageNodes", "sections", `${total} nodes > ${LIMITS.nodesPerPage}`);
  perSec.forEach((c, i) => {
    for (const [k, max] of Object.entries(LIMITS.perSection))
      if ((c[k] || 0) > max) add("limits.perSection", `sections[${i}]`, `${c[k]} ${k} > ${max}`);
  });
  for (const [k, max] of Object.entries(LIMITS.perPage))
    if ((perPage[k] || 0) > max) add("limits.perPage", "sections", `${perPage[k]} ${k} > ${max}`);

  // ---- coverage (docs/event-renderer-system.md §2.4)
  const n = (t: string) => (seen[t] || []).length;
  if (n("EventTitle") !== 1)
    add(
      n("EventTitle") ? "coverage.duplicate" : "coverage.missing",
      "sections",
      `EventTitle appears ${n("EventTitle")} times`,
    );
  if (n("Venue") < 1) add("coverage.missing", "sections", "Venue missing");
  if (n("Date") < 1) add("coverage.missing", "sections", "Date missing");
  for (const t of ["Monogram", "CashFund", "RSVP", "Registry", "Description"])
    if (n(t) > 1) add("coverage.duplicate", "sections", `${t} appears ${n(t)} times`);
  // per section: each text node at most once; Date at most twice with distinct forms; CTA at most once; one heading
  secs.forEach((_s, i) => {
    const inSec = (t: string) => (seen[t] || []).filter((x) => x.path.startsWith(`sections[${i}]`));
    for (const t of [
      "Eyebrow",
      "Hosts",
      "Time",
      "Location",
      "Deadline",
      "Venue",
      "SectionHeading",
      "CTA",
    ])
      if (inSec(t).length > 1)
        add(
          "coverage.duplicate",
          `sections[${i}]`,
          `${t} appears ${inSec(t).length} times in one section`,
        );
    const dates = inSec("Date");
    if (
      dates.length > 2 ||
      new Set(dates.map((x) => (x.node as DateNode).form)).size < dates.length
    )
      add(
        "coverage.duplicate",
        `sections[${i}]`,
        "Date at most twice per section, with distinct forms",
      );
  });
  if (caps.rsvp && n("RSVP") < 1) add("coverage.missing", "sections", "RSVP missing");
  if (caps.registry && n("Registry") < 1) add("coverage.missing", "sections", "Registry missing");
  const items = (seen["RegistryItem"] || []).map((x) => (x.node as RegistryItem).kind);
  for (const k of ["gift", "external", "cashfund"])
    if (items.filter((x) => x === k).length > 1)
      add("coverage.duplicate", "sections", `RegistryItem ${k} repeated`);
  if (items.includes("cashfund") && n("CashFund") > 0)
    add("coverage.duplicate", "sections", "cash fund both in registry and standalone");
  return v;
}
