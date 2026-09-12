// Phase B composition language: types, spec table, schema validation, structural validation,
// deterministic repair, content-fit estimation, canonicalization, layout resolution, skeleton signature.
// Single source of truth: the prompt's primitive spec is generated from NODE_SPEC below (specText()).
// Global script (no imports) so the same file runs in the browser harness and in node.

// ============================================================ tokens
type Ratio       = "38" | "50" | "62";
type RailWidth   = "thin" | "medium" | "wide";
type BandHeight  = "thin" | "medium" | "tall";
type Inset       = "tight" | "normal" | "deep";
type Gap         = "tight" | "normal" | "loose";
type Align       = "start" | "center" | "end";
type Justify     = "start" | "center" | "end" | "between";
type Emphasis    = "display" | "primary" | "secondary" | "caption";
type SurfaceRole = "base" | "alt" | "contrast" | "accent";
type RuleWeight  = "hairline" | "strong" | "double";
type Anchor      = "top-start" | "top-end" | "bottom-start" | "bottom-end" | "center";
type Extent      = "quarter" | "third" | "half" | "full";
type MotifId     = "plaid" | "stripe" | "gingham" | "linen" | "equestrian" | "botanical" | "celestial";
type MotifRole   = "field" | "band" | "frame" | "divider" | "accent";
interface MotifRef { id: MotifId; role: MotifRole }

// ============================================================ nodes
interface Stack   { t: "Stack";   gap?: Gap; align?: Align; children: CNode[] }
interface Cluster { t: "Cluster"; gap?: Gap; justify?: Justify; children: CNode[] }
interface Split   { t: "Split";   ratio: Ratio; align?: "start" | "center" | "stretch"; divider?: "none" | "hairline" | "strong" | "dashed"; mobile: "stack" | "stack-reverse" | "keep"; children: CNode[] }
interface Rail    { t: "Rail";    side: "start" | "end"; width: RailWidth; rail: CNode; mobile: "top" | "bottom" | "hide"; child: CNode }
interface Grid    { t: "Grid";    columns: 2 | 3 | 4; ruled?: boolean; gap?: Gap; mobile: 1 | 2; children: CNode[] }
interface Cell    { t: "Cell";    span?: 1 | 2 | 3 | 4; rowSpan?: 1 | 2; child: CNode }
interface Frame   { t: "Frame";   rule: RuleWeight | "none"; inset: Inset; motif?: MotifRef; child: CNode }
interface Surface { t: "Surface"; role: SurfaceRole; inset?: Inset; child: CNode }
interface Overlay { t: "Overlay"; content: CNode; decoration: CNode; anchor: Anchor; extent: Extent; mobile: "stack" | "keep" }
interface MotifField { t: "MotifField"; motif: MotifRef; extent?: Extent }
interface MotifBand  { t: "MotifBand";  motif?: MotifRef; height: BandHeight; fill?: "pattern" | "accent" }
interface RuleNode   { t: "Rule"; weight: RuleWeight; orientation?: "h" | "v"; glyphs?: MotifId }
interface Glyph      { t: "Glyph"; motif: MotifId; scale?: "s" | "m" | "l" }
interface Monogram   { t: "Monogram"; style: "ring" | "plain" | "watermark" }
type TextKind = "Eyebrow" | "EventTitle" | "Hosts" | "Description" | "Deadline" | "Venue" | "Location" | "Time";
interface TextNode { t: TextKind; emphasis?: Emphasis; case?: "upper" | "none"; layout?: "block" | "stagger" | "cascade" }   // layout: EventTitle only
interface DateNode { t: "Date"; form: "full" | "numeral" | "month-year" | "weekday"; emphasis?: Emphasis }
interface CTA      { t: "CTA"; target: "rsvp" | "registry"; style?: "button" | "link" }
interface Heading  { t: "SectionHeading"; for: "details" | "rsvp" | "registry"; emphasis?: "primary" | "display" }
interface RSVP         { t: "RSVP" }
interface Registry     { t: "Registry"; layout: CNode }
interface RegistryItem { t: "RegistryItem"; kind: "gift" | "external" | "cashfund"; emphasis?: "featured" | "standard" }
interface CashFund     { t: "CashFund" }
type CNode = Stack | Cluster | Split | Rail | Grid | Cell | Frame | Surface | Overlay | MotifField | MotifBand | RuleNode | Glyph | Monogram
           | TextNode | DateNode | CTA | Heading | RSVP | Registry | RegistryItem | CashFund;
type AnyNode = CNode & { id?: string };

interface Section { kind: "hero" | "details" | "rsvp" | "registry" | "band"; surface: SurfaceRole; align?: Align; fill?: "auto" | "screen"; root: CNode; id?: string }
interface CompositionTree { version: "composition_v1"; sections: Section[] }

// Capabilities: what this event actually has. The tree may only reference what is enabled.
interface Capabilities { rsvp: boolean; registry: boolean; gifts: boolean; externalRegistry: boolean; cashFund: boolean; hosts: boolean; description: boolean; time: boolean; location: boolean; deadline: boolean }
interface ContentProfile { titleWords: number; titleChars: number; hostsChars: number; venueChars: number; descriptionChars: number; capabilities: Capabilities }

interface Violation { rule: string; path: string; detail?: string }
interface Repair { rule: string; path: string; before?: string; after?: string; kind: "structural" | "coverage" | "capability" | "responsive" | "fit-estimate" | "fit-verified" }

// ============================================================ spec table (validation + prompt text)
type PropSpec = { enum?: readonly (string | number | boolean)[]; type?: "motif" | "node" | "nodes"; required?: boolean; doc?: string };
type NodeSpec = { props: Record<string, PropSpec>; kind: "container" | "decorative" | "text" | "component"; doc: string; children?: { min: number; max: number; allow: string } };

const ENUM = {
  Ratio: ["38", "50", "62"] as const, RailWidth: ["thin", "medium", "wide"] as const, BandHeight: ["thin", "medium", "tall"] as const,
  Inset: ["tight", "normal", "deep"] as const, Gap: ["tight", "normal", "loose"] as const, Align: ["start", "center", "end"] as const,
  Justify: ["start", "center", "end", "between"] as const, Emphasis: ["display", "primary", "secondary", "caption"] as const,
  SurfaceRole: ["base", "alt", "contrast", "accent"] as const, RuleWeight: ["hairline", "strong", "double"] as const,
  Anchor: ["top-start", "top-end", "bottom-start", "bottom-end", "center"] as const, Extent: ["quarter", "third", "half", "full"] as const,
  MotifId: ["plaid", "stripe", "gingham", "linen", "equestrian", "botanical", "celestial"] as const, MotifRole: ["field", "band", "frame", "divider", "accent"] as const,
};
const PATTERN_MOTIFS = ["plaid", "stripe", "gingham", "linen"], ARRANGEMENT_MOTIFS = ["equestrian", "botanical", "celestial"];
const TEXT_KINDS = ["Eyebrow", "EventTitle", "Hosts", "Description", "Deadline", "Venue", "Location", "Time"];
const INLINE_LEAVES = [...TEXT_KINDS, "Date", "CTA", "Glyph", "Rule"];
const CONTAINERS = ["Stack", "Cluster", "Split", "Rail", "Grid", "Frame", "Surface", "Overlay", "Registry"];
const ROOT_TYPES = ["Stack", "Split", "Rail", "Grid", "Frame", "Surface", "Overlay"];
const COMPONENTS = ["RSVP", "Registry", "CashFund"];
const COMPONENT_PARENTS = ["section", "Stack", "Surface", "Frame", "Split", "Cell"];

const textProps = (doc: string): NodeSpec => ({ kind: "text", doc, props: { emphasis: { enum: ENUM.Emphasis }, case: { enum: ["upper", "none"] } } });
const NODE_SPEC: Record<string, NodeSpec> = {
  Stack:   { kind: "container", doc: "vertical column of children", props: { gap: { enum: ENUM.Gap }, align: { enum: ENUM.Align } }, children: { min: 1, max: 8, allow: "any node" } },
  Cluster: { kind: "container", doc: "inline row that wraps; small items only (text, Date, CTA, Glyph, vertical Rule)", props: { gap: { enum: ENUM.Gap }, justify: { enum: ENUM.Justify } }, children: { min: 2, max: 6, allow: "text nodes, Date, CTA, Glyph, Rule" } },
  Split:   { kind: "container", doc: "two columns; ratio is the first child's share; divider draws a rule between the columns", props: { ratio: { enum: ENUM.Ratio, required: true }, align: { enum: ["start", "center", "stretch"] }, divider: { enum: ["none", "hairline", "strong", "dashed"] }, mobile: { enum: ["stack", "stack-reverse", "keep"], required: true } }, children: { min: 2, max: 2, allow: "any node" } },
  Rail:    { kind: "container", doc: "a fixed-width column (rail) beside the main child; rail holds a MotifField or a Stack of at most 4 small leaves", props: { side: { enum: ["start", "end"], required: true }, width: { enum: ENUM.RailWidth, required: true }, rail: { type: "node", required: true }, mobile: { enum: ["top", "bottom", "hide"], required: true }, child: { type: "node", required: true } } },
  Grid:    { kind: "container", doc: "equal columns of Cells; ruled draws hairlines between cells", props: { columns: { enum: [2, 3, 4], required: true }, ruled: { enum: [true, false] }, gap: { enum: ENUM.Gap }, mobile: { enum: [1, 2], required: true } }, children: { min: 2, max: 8, allow: "Cell only" } },
  Cell:    { kind: "container", doc: "one grid cell", props: { span: { enum: [1, 2, 3, 4] }, rowSpan: { enum: [1, 2] }, child: { type: "node", required: true } } },
  Frame:   { kind: "container", doc: "a ruled box with an inset margin; rule none makes it a plain inset; motif fills the margin", props: { rule: { enum: [...ENUM.RuleWeight, "none"], required: true }, inset: { enum: ENUM.Inset, required: true }, motif: { type: "motif" }, child: { type: "node", required: true } } },
  Surface: { kind: "container", doc: "switches the surface role for its subtree (a panel, plate or card)", props: { role: { enum: ENUM.SurfaceRole, required: true }, inset: { enum: ENUM.Inset }, child: { type: "node", required: true } } },
  Overlay: { kind: "container", doc: "text-bearing content with one decorative object placed behind or beside it at an anchor; decoration may be MotifField, Monogram, Glyph, or Date numeral", props: { content: { type: "node", required: true }, decoration: { type: "node", required: true }, anchor: { enum: ENUM.Anchor, required: true }, extent: { enum: ENUM.Extent, required: true }, mobile: { enum: ["stack", "keep"], required: true } } },
  MotifField: { kind: "decorative", doc: "a patterned panel", props: { motif: { type: "motif", required: true }, extent: { enum: ENUM.Extent } } },
  MotifBand:  { kind: "decorative", doc: "a full-width strip, patterned or accent-filled", props: { motif: { type: "motif" }, height: { enum: ENUM.BandHeight, required: true }, fill: { enum: ["pattern", "accent"] } } },
  Rule:       { kind: "decorative", doc: "a rule, optionally with a glyph divider", props: { weight: { enum: ENUM.RuleWeight, required: true }, orientation: { enum: ["h", "v"] }, glyphs: { enum: ENUM.MotifId } } },
  Glyph:      { kind: "decorative", doc: "an arranged ornament from the motif library", props: { motif: { enum: ENUM.MotifId, required: true }, scale: { enum: ["s", "m", "l"] } } },
  Monogram:   { kind: "decorative", doc: "the initial", props: { style: { enum: ["ring", "plain", "watermark"], required: true } } },
  Eyebrow: textProps("short line above the title"),
  EventTitle: { kind: "text", doc: "the event title (required exactly once); layout stagger/cascade breaks it into staggered lines", props: { emphasis: { enum: ENUM.Emphasis }, case: { enum: ["upper", "none"] }, layout: { enum: ["block", "stagger", "cascade"] } } },
  Hosts: textProps("host names"),
  Description: textProps("one-paragraph description"), Deadline: textProps("RSVP deadline"), Venue: textProps("venue name"), Location: textProps("city, state"), Time: textProps("time range"),
  Date:  { kind: "text", doc: "the date in one of four forms", props: { form: { enum: ["full", "numeral", "month-year", "weekday"], required: true }, emphasis: { enum: ENUM.Emphasis } } },
  CTA:   { kind: "text", doc: "call to action", props: { target: { enum: ["rsvp", "registry"], required: true }, style: { enum: ["button", "link"] } } },
  SectionHeading: { kind: "text", doc: "the section's heading (copy is fixed)", props: { for: { enum: ["details", "rsvp", "registry"], required: true }, emphasis: { enum: ["primary", "display"] } } },
  RSVP:     { kind: "component", doc: "the RSVP form (opaque)", props: {} },
  Registry: { kind: "component", doc: "arranges the registry items; layout is a Grid, Stack or Split whose leaves are RegistryItem", props: { layout: { type: "node", required: true } } },
  RegistryItem: { kind: "component", doc: "one registry object (opaque card)", props: { kind: { enum: ["gift", "external", "cashfund"], required: true }, emphasis: { enum: ["featured", "standard"] } } },
  CashFund: { kind: "component", doc: "standalone cash fund block", props: {} },
};
const SECTION_SPEC = { kind: ["hero", "details", "rsvp", "registry", "band"], surface: ENUM.SurfaceRole, align: ENUM.Align, fill: ["auto", "screen"] };
const LIMITS = { sectionsMin: 3, sectionsMax: 6, nodesPerSection: 40, nodesPerPage: 160, depth: 5, perSection: { Overlay: 1, Rail: 1, Grid: 1, Frame: 1, MotifField: 2 }, perPage: { Overlay: 2, Frame: 2 }, bodyBytes: 12000, splitNesting: 2 };

// ============================================================ helpers
type Visit = { node: AnyNode; path: string; parent: AnyNode | null; parentKey: string; ancestors: AnyNode[]; sectionIndex: number };
function childrenOf(n: AnyNode): { key: string; node: AnyNode }[] {
  const out: { key: string; node: AnyNode }[] = [];
  const a = n as any;
  if (Array.isArray(a.children)) a.children.forEach((c: AnyNode, i: number) => out.push({ key: `children[${i}]`, node: c }));
  for (const k of ["child", "rail", "content", "decoration", "layout"]) if (a[k] && typeof a[k] === "object") out.push({ key: k, node: a[k] });
  return out;
}
function walk(tree: CompositionTree, fn: (v: Visit) => void) {
  tree.sections.forEach((s, si) => {
    const rec = (node: AnyNode, path: string, parent: AnyNode | null, parentKey: string, ancestors: AnyNode[]) => {
      fn({ node, path, parent, parentKey, ancestors, sectionIndex: si });
      for (const c of childrenOf(node)) rec(c.node, `${path}.${c.key}`, node, c.key, [...ancestors, node]);
    };
    rec(s.root as AnyNode, `sections[${si}].root`, null, "section", []);
  });
}
function count(tree: CompositionTree, pred: (v: Visit) => boolean): number { let n = 0; walk(tree, v => { if (pred(v)) n++; }); return n; }
function isText(n: AnyNode) { return TEXT_KINDS.includes(n.t) || n.t === "Date" || n.t === "SectionHeading"; }
function hasTextDescendant(n: AnyNode): boolean { if (isText(n)) return true; return childrenOf(n).some(c => hasTextDescendant(c.node)); }
function containerDepth(ancestors: AnyNode[]) { return ancestors.filter(a => CONTAINERS.includes(a.t)).length; }
function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }
function fnv(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }

// ============================================================ 1. schema validation (strict; unknown keys fail)
function validateSchema(json: unknown): { ok: boolean; errors: Violation[] } {
  const errors: Violation[] = [];
  const err = (rule: string, path: string, detail?: string) => errors.push({ rule, path, detail });
  const checkNode = (n: any, path: string, depth: number) => {
    if (depth > 12) { err("schema.depth", path, "nesting deeper than 12"); return; }
    if (!n || typeof n !== "object" || Array.isArray(n)) return err("schema.node", path, "not an object");
    const spec = NODE_SPEC[n.t]; if (!spec) return err("schema.type", path, `unknown node type ${JSON.stringify(n.t)}`);
    for (const k of Object.keys(n)) if (k !== "t" && !spec.props[k] && !(k === "children" && spec.children)) err("schema.key", `${path}.${k}`, `unknown key on ${n.t}`);
    for (const [k, p] of Object.entries(spec.props)) {
      const v = n[k];
      if (v === undefined) { if (p.required) err("schema.required", `${path}.${k}`, `${n.t} requires ${k}`); continue; }
      if (p.enum) { if (!p.enum.includes(v)) err("schema.enum", `${path}.${k}`, `${JSON.stringify(v)} not in ${p.enum.map(x => JSON.stringify(x)).join("|")}${typeof v === "number" && p.enum.some(x => typeof x === "string") ? " (must be a string)" : ""}`); }
      else if (p.type === "motif") { if (!v || typeof v !== "object" || !ENUM.MotifId.includes(v.id) || !ENUM.MotifRole.includes(v.role) || Object.keys(v).some(x => x !== "id" && x !== "role")) err("schema.motif", `${path}.${k}`, "motif must be {id, role} from the motif list"); }
      else if (p.type === "node") checkNode(v, `${path}.${k}`, depth + 1);
    }
    if (spec.children) {
      if (!Array.isArray(n.children)) err("schema.children", `${path}.children`, `${n.t} requires children[]`);
      else { if (n.children.length < spec.children.min || n.children.length > spec.children.max) err("schema.children.count", `${path}.children`, `${n.t} takes ${spec.children.min}..${spec.children.max} children, got ${n.children.length}`); n.children.forEach((c: any, i: number) => checkNode(c, `${path}.children[${i}]`, depth + 1)); }
    } else if (n.children !== undefined) err("schema.key", `${path}.children`, `${n.t} has no children`);
  };
  const t = json as any;
  if (!t || typeof t !== "object") return { ok: false, errors: [{ rule: "schema.root", path: "", detail: "not an object" }] };
  if (t.version !== "composition_v1") err("schema.version", "version", "must be composition_v1");
  for (const k of Object.keys(t)) if (!["version", "sections"].includes(k)) err("schema.key", k, "unknown top-level key");
  if (!Array.isArray(t.sections)) err("schema.sections", "sections", "missing sections[]");
  else t.sections.forEach((s: any, i: number) => {
    const p = `sections[${i}]`;
    if (!s || typeof s !== "object") return err("schema.section", p, "not an object");
    for (const k of Object.keys(s)) if (!["kind", "surface", "align", "fill", "root"].includes(k)) err("schema.key", `${p}.${k}`, "unknown section key");
    if (!SECTION_SPEC.kind.includes(s.kind)) err("schema.enum", `${p}.kind`, `kind must be ${SECTION_SPEC.kind.join("|")}`);
    if (!SECTION_SPEC.surface.includes(s.surface)) err("schema.enum", `${p}.surface`, "surface must be base|alt|contrast|accent");
    if (s.align !== undefined && !SECTION_SPEC.align.includes(s.align)) err("schema.enum", `${p}.align`, "align must be start|center|end");
    if (s.fill !== undefined && !SECTION_SPEC.fill.includes(s.fill)) err("schema.enum", `${p}.fill`, "fill must be auto|screen");
    if (s.root === undefined) err("schema.required", `${p}.root`, "section requires root"); else checkNode(s.root, `${p}.root`, 0);
  });
  return { ok: errors.length === 0, errors };
}

// ============================================================ 2. structural validation (returns violations; repair() fixes them)
function validateStructure(tree: CompositionTree, caps: Capabilities): Violation[] {
  const v: Violation[] = []; const add = (rule: string, path: string, detail?: string) => v.push({ rule, path, detail });
  const secs = tree.sections;
  if (secs.length < LIMITS.sectionsMin || secs.length > LIMITS.sectionsMax) add("sections.count", "sections", `${secs.length} sections; allowed ${LIMITS.sectionsMin}..${LIMITS.sectionsMax}`);
  if (secs[0] && secs[0].kind !== "hero") add("sections.heroFirst", "sections[0]", "first section must be the hero");
  const kinds = secs.map(s => s.kind);
  for (const k of ["hero", "details", "rsvp", "registry", "band"]) { const n = kinds.filter(x => x === k).length; if (n > 1) add("sections.duplicateKind", "sections", `${n} sections of kind ${k}`); }
  if (caps.rsvp && !kinds.includes("rsvp")) add("coverage.rsvpSection", "sections", "rsvp is enabled but there is no rsvp section");
  if (!caps.rsvp && kinds.includes("rsvp")) add("capability.rsvpSection", "sections", "rsvp is not enabled");
  if (caps.registry && !kinds.includes("registry")) add("coverage.registrySection", "sections", "registry is enabled but there is no registry section");
  if (!caps.registry && kinds.includes("registry")) add("capability.registrySection", "sections", "registry is not enabled");
  let run = 0; secs.forEach((s, i) => { run = s.surface === "contrast" ? run + 1 : 0; if (run > 2) add("surfaces.contrastRun", `sections[${i}]`, "more than two consecutive contrast sections"); });
  secs.forEach((s, i) => {
    if (s.kind === "band") { if (s.root.t !== "MotifBand") add("sections.bandRoot", `sections[${i}].root`, "band section root must be MotifBand"); }
    else if (!ROOT_TYPES.includes(s.root.t)) add("sections.root", `sections[${i}].root`, `${s.root.t} cannot be a section root`);
    if (s.fill === "screen" && s.kind !== "hero") add("sections.fill", `sections[${i}]`, "fill screen is hero-only");
  });
  // per-section and per-page counts
  const perSec: Record<string, number>[] = secs.map(() => ({})); const perPage: Record<string, number> = {}; const nodesPerSec = secs.map(() => 0);
  const seen: Record<string, { path: string; node: AnyNode }[]> = {};
  walk(tree, ({ node, path, parent, parentKey, ancestors, sectionIndex }) => {
    nodesPerSec[sectionIndex]++;
    const inRegistry = ancestors.some(a => a.t === "Registry");
    if (!(node.t === "Grid" && inRegistry)) { perSec[sectionIndex][node.t] = (perSec[sectionIndex][node.t] || 0) + 1; perPage[node.t] = (perPage[node.t] || 0) + 1; }
    (seen[node.t] ||= []).push({ path, node });
    const d = containerDepth(ancestors); if (d > LIMITS.depth) add("depth", path, `container depth ${d} > ${LIMITS.depth}`);
    const pt = parent ? parent.t : "section";
    // nesting matrix
    if (pt === "Cluster" && !INLINE_LEAVES.includes(node.t)) add("nesting.cluster", path, `${node.t} inside Cluster`);
    if (node.t === "Rule" && pt === "Cluster" && (node as RuleNode).orientation !== "v") add("nesting.clusterRule", path, "only vertical rules inside Cluster");
    if (parentKey === "rail") { if (node.t !== "MotifField" && node.t !== "Stack") add("nesting.rail", path, `rail must be MotifField or Stack, got ${node.t}`); else if (node.t === "Stack" && ((node as Stack).children.length > 4 || (node as Stack).children.some(c => !INLINE_LEAVES.includes(c.t)))) add("nesting.rail", path, "rail Stack holds at most 4 small leaves"); }
    if (pt === "Grid" && node.t !== "Cell") add("nesting.gridCell", path, "Grid children must be Cell");
    if (node.t === "Cell" && pt !== "Grid") add("nesting.cellParent", path, "Cell only inside Grid");
    if (pt === "Cell" && (node.t === "Grid" || node.t === "Overlay")) add("nesting.cellChild", path, `${node.t} inside Cell`);
    if (node.t === "Frame" && ancestors.some(a => a.t === "Frame")) add("nesting.frameInFrame", path, "no frame within a frame");
    if (node.t === "Overlay" && ancestors.some(a => a.t === "Overlay")) add("nesting.overlayInOverlay", path);
    if (node.t === "Grid" && !inRegistry && ancestors.some(a => a.t === "Grid" && !ancestors.some(b => b.t === "Registry"))) add("nesting.gridInGrid", path);
    if (node.t === "Rail" && ancestors.some(a => a.t === "Rail")) add("nesting.railInRail", path);
    if (node.t === "Split" && ancestors.filter(a => a.t === "Split").length >= LIMITS.splitNesting) add("nesting.splitDepth", path, "Split nested more than once");
    if (node.t === "Surface") { const eff = [...ancestors].reverse().find(a => a.t === "Surface") as Surface | undefined; const role = eff ? eff.role : secs[sectionIndex].surface; if ((node as Surface).role === role) add("nesting.surfaceSame", path, `Surface ${role} inside ${role}`); }
    if (parentKey === "content" && !(["Stack", "Frame", "Split"].includes(node.t) && hasTextDescendant(node))) add("nesting.overlayContent", path, "Overlay content must be a text-bearing Stack, Frame or Split");
    if (parentKey === "decoration") { const ok = node.t === "MotifField" || node.t === "Monogram" || node.t === "Glyph" || (node.t === "Date" && (node as DateNode).form === "numeral"); if (!ok) add("nesting.overlayDecoration", path, "decoration must be MotifField, Monogram, Glyph or Date numeral"); }
    if (parentKey === "layout" && !["Grid", "Stack", "Split"].includes(node.t)) add("nesting.registryLayout", path, "Registry layout must be Grid, Stack or Split");
    if (inRegistry && parentKey !== "layout" && !["Grid", "Cell", "Stack", "Split", "RegistryItem"].includes(node.t)) add("nesting.registryLeaf", path, `${node.t} inside Registry`);
    if (node.t === "RegistryItem" && !inRegistry) add("nesting.registryItemOutside", path, "RegistryItem only inside Registry");
    if (COMPONENTS.includes(node.t)) {
      if (!COMPONENT_PARENTS.includes(pt)) add("component.parent", path, `${node.t} inside ${pt}`);
      if (pt === "Cell") { const g = ancestors[ancestors.length - 2] as Grid; const span = (parent as Cell).span || 1; if (g && g.columns >= 3 && span < 2) add("component.narrowCell", path, "component in a narrow cell"); }
      if (pt === "Split") { const sp = parent as Split; const idx = sp.children.indexOf(node as CNode); const share = idx === 0 ? Number(sp.ratio) : 100 - Number(sp.ratio); if (share < 50) add("component.splitShare", path, `component gets ${share}% of a Split`); }
      if (node.t === "RSVP" && secs[sectionIndex].kind !== "rsvp") add("component.rsvpSection", path, "RSVP must live in the rsvp section");
      if (node.t === "Registry" && secs[sectionIndex].kind !== "registry") add("component.registrySection", path, "Registry must live in the registry section");
    }
    // responsive intent that the compiler will not honour
    if (node.t === "Split" && (node as Split).mobile === "keep") { const heavy = (node as Split).children.some(c => COMPONENTS.includes(c.t) || findFirst(c, "Description") || findFirst(c, "RSVP") || findFirst(c, "Registry")); if (heavy) add("responsive.splitKeep", path, "keep demoted: a side holds a component or the description"); }
    if (node.t === "Rail" && (node as Rail).mobile === "hide" && (node as Rail).rail.t !== "MotifField") add("responsive.railHide", path, "hide only for a MotifField rail");
    // capabilities
    if (node.t === "Hosts" && !caps.hosts) add("capability.node", path, "Hosts not available");
    if (node.t === "Description" && !caps.description) add("capability.node", path, "Description not available");
    if (node.t === "Time" && !caps.time) add("capability.node", path, "Time not available");
    if (node.t === "Location" && !caps.location) add("capability.node", path, "Location not available");
    if (node.t === "Deadline" && !caps.deadline) add("capability.node", path, "Deadline not available");
    if (node.t === "CashFund" && !caps.cashFund) add("capability.node", path, "CashFund not available");
    if (node.t === "RSVP" && !caps.rsvp) add("capability.node", path, "RSVP not available");
    if (node.t === "Registry" && !caps.registry) add("capability.node", path, "Registry not available");
    if (node.t === "CTA" && (node as CTA).target === "registry" && !caps.registry) add("capability.node", path, "CTA registry not available");
    if (node.t === "CTA" && (node as CTA).target === "rsvp" && !caps.rsvp) add("capability.node", path, "CTA rsvp not available");
    if (node.t === "SectionHeading" && (node as Heading).for === "rsvp" && !caps.rsvp) add("capability.node", path, "rsvp heading not available");
    if (node.t === "SectionHeading" && (node as Heading).for === "registry" && !caps.registry) add("capability.node", path, "registry heading not available");
    if (node.t === "RegistryItem") { const k = (node as RegistryItem).kind; if ((k === "gift" && !caps.gifts) || (k === "external" && !caps.externalRegistry) || (k === "cashfund" && !caps.cashFund)) add("capability.node", path, `registry item ${k} not available`); }
  });
  nodesPerSec.forEach((n, i) => { if (n > LIMITS.nodesPerSection) add("limits.sectionNodes", `sections[${i}]`, `${n} nodes > ${LIMITS.nodesPerSection}`); });
  const total = nodesPerSec.reduce((a, b) => a + b, 0); if (total > LIMITS.nodesPerPage) add("limits.pageNodes", "sections", `${total} nodes > ${LIMITS.nodesPerPage}`);
  perSec.forEach((c, i) => { for (const [k, max] of Object.entries(LIMITS.perSection)) if ((c[k] || 0) > max) add("limits.perSection", `sections[${i}]`, `${c[k]} ${k} > ${max}`); });
  for (const [k, max] of Object.entries(LIMITS.perPage)) if ((perPage[k] || 0) > max) add("limits.perPage", "sections", `${perPage[k]} ${k} > ${max}`);
  // coverage
  const n = (t: string) => (seen[t] || []).length;
  if (n("EventTitle") !== 1) add(n("EventTitle") ? "coverage.duplicate" : "coverage.missing", "sections", `EventTitle appears ${n("EventTitle")} times`);
  if (n("Venue") < 1) add("coverage.missing", "sections", "Venue missing");
  if (n("Date") < 1) add("coverage.missing", "sections", "Date missing");
  for (const t of ["Monogram", "CashFund", "RSVP", "Registry", "Description"]) if (n(t) > 1) add("coverage.duplicate", "sections", `${t} appears ${n(t)} times`);
  // per section: each text node at most once; Date at most twice with distinct forms; CTA at most once; one heading
  secs.forEach((_s, i) => {
    const inSec = (t: string) => (seen[t] || []).filter(x => x.path.startsWith(`sections[${i}]`));
    for (const t of ["Eyebrow", "Hosts", "Time", "Location", "Deadline", "Venue", "SectionHeading", "CTA"]) if (inSec(t).length > 1) add("coverage.duplicate", `sections[${i}]`, `${t} appears ${inSec(t).length} times in one section`);
    const dates = inSec("Date"); if (dates.length > 2 || new Set(dates.map(x => (x.node as DateNode).form)).size < dates.length) add("coverage.duplicate", `sections[${i}]`, "Date at most twice per section, with distinct forms");
  });
  if (caps.rsvp && n("RSVP") < 1) add("coverage.missing", "sections", "RSVP missing");
  if (caps.registry && n("Registry") < 1) add("coverage.missing", "sections", "Registry missing");
  const items = (seen["RegistryItem"] || []).map(x => (x.node as RegistryItem).kind);
  for (const k of ["gift", "external", "cashfund"]) if (items.filter(x => x === k).length > 1) add("coverage.duplicate", "sections", `RegistryItem ${k} repeated`);
  if (items.includes("cashfund") && n("CashFund") > 0) add("coverage.duplicate", "sections", "cash fund both in registry and standalone");
  return v;
}
function countText(n: AnyNode): number { let c = isText(n) ? 1 : 0; for (const ch of childrenOf(n)) c += countText(ch.node); return c; }

// ============================================================ 3. deterministic repair (no model call; every step logged)
interface Macros { hero: (seed: number) => CNode; rsvpSection: (seed: number) => Section; registrySection: (seed: number, caps: Capabilities) => Section }
const DEFAULT_MACROS: Macros = {
  hero: () => ({ t: "Stack", gap: "normal", children: [{ t: "Eyebrow" }, { t: "EventTitle", emphasis: "display" }, { t: "Hosts" }, { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }] }, { t: "CTA", target: "rsvp" }] }),
  rsvpSection: () => ({ kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }] } }),
  registrySection: (_s, caps) => ({ kind: "registry", surface: "alt", root: { t: "Stack", children: [{ t: "SectionHeading", for: "registry" }, { t: "Registry", layout: { t: "Grid", columns: 3, mobile: 1, children: (["gift", "external", "cashfund"] as const).filter(k => (k === "gift" && caps.gifts) || (k === "external" && caps.externalRegistry) || (k === "cashfund" && caps.cashFund)).map(k => ({ t: "Cell" as const, child: { t: "RegistryItem" as const, kind: k } })) } }] } }),
};
function repair(input: CompositionTree, caps: Capabilities, seed = 1, macros: Macros = DEFAULT_MACROS): { tree: CompositionTree; repairs: Repair[]; remaining: Violation[] } {
  const tree = clone(input); const repairs: Repair[] = [];
  const log = (rule: string, path: string, kind: Repair["kind"], before?: string, after?: string) => repairs.push({ rule, path, kind, before, after });
  const setAt = (path: string, value: any) => { // path like sections[0].root.children[1].child
    const parts = path.match(/[^.\[\]]+/g)!; let o: any = tree; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = value; };
  const getAt = (path: string) => { const parts = path.match(/[^.\[\]]+/g)!; let o: any = tree; for (const p of parts) o = o[p]; return o; };
  const removeAt = (path: string) => { const parts = path.match(/[^.\[\]]+/g)!; let o: any = tree; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; const last = parts[parts.length - 1]; if (Array.isArray(o)) o.splice(Number(last), 1); else delete o[last]; };
  const leavesOf = (n: AnyNode): AnyNode[] => childrenOf(n).length ? childrenOf(n).flatMap(c => leavesOf(c.node)) : [n];
  const contentOf = (n: AnyNode): CNode => n.t === "Overlay" ? (n as Overlay).content : n.t === "Cell" ? (n as Cell).child : (n as any).child || (n as any).children?.[0] || n;
  const pass = (label: string) => {
    // one full validation → fix the first fixable violation of each category → loop until stable
    for (let iter = 0; iter < 40; iter++) {
      const vs = validateStructure(tree, caps); if (!vs.length) return;
      let changed = false;
      for (const vio of vs) {
        const r = vio.rule, p = vio.path;
        try {
          if (r === "sections.heroFirst") { const i = tree.sections.findIndex(s => s.kind === "hero"); if (i > 0) { const [h] = tree.sections.splice(i, 1); tree.sections.unshift(h); } else tree.sections[0].kind = "hero"; log(r, p, "structural"); changed = true; }
          else if (r === "sections.duplicateKind") { const seenK = new Set<string>(); for (let i = 0; i < tree.sections.length; i++) { const k = tree.sections[i].kind; if (seenK.has(k)) { const alt = k === "hero" ? "details" : "details"; if (seenK.has(alt) || k === "details") { tree.sections.splice(i, 1); log(r, `sections[${i}]`, "structural", k, "dropped"); } else { tree.sections[i].kind = alt as any; log(r, `sections[${i}]`, "structural", k, alt); } changed = true; break; } seenK.add(k); } }
          else if (r === "sections.count") { if (tree.sections.length > LIMITS.sectionsMax) { const i = tree.sections.findIndex((s, i) => i > 0 && s.kind === "band"); tree.sections.splice(i > 0 ? i : tree.sections.length - 1, 1); log(r, p, "structural", "dropped a section"); changed = true; } else { tree.sections.push({ kind: "details", surface: "base", root: { t: "Stack", children: [{ t: "SectionHeading", for: "details" }, { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] }] } }); log(r, p, "coverage", "added details section"); changed = true; } }
          else if (r === "sections.bandRoot") { setAt(p, { t: "MotifBand", height: "medium" }); log(r, p, "structural"); changed = true; }
          else if (r === "sections.root") { const n = getAt(p); setAt(p, { t: "Stack", children: [n] }); log(r, p, "structural", n.t, "wrapped in Stack"); changed = true; }
          else if (r === "sections.fill") { delete getAt(p).fill; log(r, p, "structural"); changed = true; }
          else if (r === "surfaces.contrastRun") { getAt(p).surface = "alt"; log(r, p, "structural", "contrast", "alt"); changed = true; }
          else if (r === "capability.rsvpSection" || r === "capability.registrySection") { const k = r === "capability.rsvpSection" ? "rsvp" : "registry"; const i = tree.sections.findIndex(s => s.kind === k); tree.sections.splice(i, 1); log(r, `sections[${i}]`, "capability", k, "dropped section"); changed = true; }
          else if (r === "coverage.rsvpSection") { tree.sections.push(macros.rsvpSection(seed)); log(r, p, "coverage", undefined, "rsvp section macro appended"); changed = true; }
          else if (r === "coverage.registrySection") { tree.sections.push(macros.registrySection(seed, caps)); log(r, p, "coverage", undefined, "registry section macro appended"); changed = true; }
          else if (r === "depth") { // walk up the path: merge the deepest Stack-in-Stack; if none, collapse the deepest container to its leaves
            const parts = p.split("."); let done = false;
            for (let k = parts.length - 1; k >= 2 && !done; k--) { const np = parts.slice(0, k).join("."), pp = parts.slice(0, k - 1).join("."); const n = getAt(np), par = getAt(pp); if (n && par && n.t === "Stack" && par.t === "Stack") { const idx = par.children.indexOf(n); par.children.splice(idx, 1, ...n.children); log(r, np, "structural", "Stack in Stack", "merged"); done = true; } }
            if (!done) { for (let k = parts.length - 1; k >= 1 && !done; k--) { const np = parts.slice(0, k).join("."); const n = getAt(np); if (n && CONTAINERS.includes(n.t) && n.t !== "Registry") { const l = leavesOf(n).slice(0, 8); setAt(np, l.length === 1 ? l[0] : { t: "Stack", children: l }); log(r, np, "structural", n.t, "collapsed to leaves"); done = true; } } }
            changed = true; }
          else if (r === "nesting.cluster") { const n = getAt(p); const parts = p.split("."); const cl = getAt(parts.slice(0, -1).join(".")) as Cluster; const idx = cl.children.indexOf(n); const inl = leavesOf(n).filter(l => INLINE_LEAVES.includes(l.t)); cl.children.splice(idx, 1, ...inl); cl.children = cl.children.slice(0, 6); if (cl.children.length < 2) { setAt(parts.slice(0, -1).join("."), { t: "Stack", children: cl.children.length ? cl.children : [{ t: "Venue" }] }); } log(r, p, "structural", n.t, "inlined leaves"); changed = true; }
          else if (r === "nesting.clusterRule") { getAt(p).orientation = "v"; log(r, p, "structural"); changed = true; }
          else if (r === "nesting.rail") { const n = getAt(p); const leaves = leavesOf(n).filter(l => INLINE_LEAVES.includes(l.t)).slice(0, 4); setAt(p, leaves.length ? { t: "Stack", children: leaves } : { t: "MotifField", motif: { id: "linen", role: "field" } }); log(r, p, "structural", n.t, leaves.length ? "Stack of leaves" : "MotifField"); changed = true; }
          else if (r === "nesting.gridCell") { const n = getAt(p); setAt(p, { t: "Cell", child: n }); log(r, p, "structural", n.t, "wrapped in Cell"); changed = true; }
          else if (r === "nesting.cellParent") { const n = getAt(p); setAt(p, n.child); log(r, p, "structural", "Cell", "unwrapped"); changed = true; }
          else if (r === "nesting.cellChild" || r === "nesting.gridInGrid" || r === "nesting.overlayInOverlay" || r === "nesting.railInRail" || r === "nesting.splitDepth" || r === "nesting.frameInFrame") { const n = getAt(p); const rep: any = n.t === "Overlay" ? n.content : n.t === "Grid" ? { t: "Stack", children: n.children.map((c: Cell) => c.child) } : n.t === "Rail" ? n.child : n.t === "Frame" ? { t: "Stack", children: [n.child] } : n.t === "Split" ? { t: "Stack", children: n.children } : n.child || n; setAt(p, rep); log(r, p, "structural", n.t, rep.t); changed = true; }
          else if (r === "nesting.surfaceSame") { const n = getAt(p); setAt(p, n.child); log(r, p, "structural", "Surface", "unwrapped"); changed = true; }
          else if (r === "nesting.overlayContent") { const n = getAt(p); setAt(p, hasTextDescendant(n) ? { t: "Stack", children: [n] } : { t: "Stack", children: [n, { t: "EventTitle", emphasis: "display" }] }); log(r, p, "structural", n.t, "Stack"); changed = true; }
          else if (r === "nesting.overlayDecoration") { const n = getAt(p); setAt(p, { t: "MotifField", motif: { id: "linen", role: "field" } }); log(r, p, "structural", n.t, "MotifField linen"); changed = true; }
          else if (r === "nesting.registryLayout") { const n = getAt(p); const items = leavesOf(n).filter(l => l.t === "RegistryItem"); setAt(p, { t: "Stack", children: items.length ? items : [{ t: "RegistryItem", kind: "gift" }] }); log(r, p, "structural", n.t, "Stack of items"); changed = true; }
          else if (r === "nesting.registryLeaf") { const n = getAt(p); const items = leavesOf(n).filter(l => l.t === "RegistryItem"); if (items.length) setAt(p, items.length === 1 ? items[0] : { t: "Stack", children: items }); else removeAt(p); log(r, p, "structural", n.t, items.length ? "items only" : "dropped"); changed = true; }
          else if (r === "nesting.registryItemOutside") { removeAt(p); log(r, p, "structural", "RegistryItem", "dropped"); changed = true; }
          else if (r === "component.parent" || r === "component.narrowCell") { // hoist: remove and append to the section root Stack (wrapping root if needed)
            const n = getAt(p); const parentArr = getAt(p.split(".").slice(0, -1).join(".")); if (Array.isArray(parentArr) && parentArr.length > 1) removeAt(p); else setAt(p, { t: "Rule", weight: "hairline" }); const si = Number(p.match(/sections\[(\d+)\]/)![1]); const s = tree.sections[si]; if (s.root.t === "Stack") (s.root as Stack).children.push(n); else s.root = { t: "Stack", children: [s.root, n] }; log(r, p, "structural", n.t, "hoisted to section root"); changed = true; }
          else if (r === "component.splitShare") { const parts = p.split("."); const sp = getAt(parts.slice(0, -1).join(".")) as Split; sp.ratio = "50"; log(r, p, "structural", "ratio", "50"); changed = true; }
          else if (r === "component.rsvpSection" || r === "component.registrySection") { const n = getAt(p); const k = n.t === "RSVP" ? "rsvp" : "registry"; removeAt(p); let s = tree.sections.find(x => x.kind === k); if (!s) { s = { kind: k as any, surface: "base", root: { t: "Stack", children: [] } }; tree.sections.push(s); } if (s.root.t === "Stack") (s.root as Stack).children.push(n); else s.root = { t: "Stack", children: [s.root, n] }; log(r, p, "structural", n.t, `moved to ${k} section`); changed = true; }
          else if (r === "responsive.splitKeep") { getAt(p).mobile = "stack"; log(r, p, "responsive", "keep", "stack"); changed = true; }
          else if (r === "responsive.railHide") { getAt(p).mobile = "top"; log(r, p, "responsive", "hide", "top"); changed = true; }
          else if (r === "capability.node") { const n = getAt(p); const parts = p.split("."); const parent = getAt(parts.slice(0, -1).join(".")); if (Array.isArray(parent)) { if (parent.length > 1) removeAt(p); else setAt(p, { t: "Rule", weight: "hairline" }); } else if (n.t === "RSVP" || n.t === "Registry" || n.t === "CashFund") { setAt(p, { t: "Rule", weight: "hairline" }); } else setAt(p, { t: "Rule", weight: "hairline" }); log(r, p, "capability", n.t, "dropped (not available for this event)"); changed = true; }
          else if (r === "limits.sectionNodes" || r === "limits.pageNodes") { // drop decorative leaves first, then trailing optional text
            const si = r === "limits.sectionNodes" ? Number(p.match(/\[(\d+)\]/)![1]) : tree.sections.map((s, i) => [countNodes(s.root), i]).sort((a, b) => b[0] - a[0])[0][1];
            const order = ["Glyph", "Rule", "MotifBand", "MotifField", "Monogram", "Deadline", "Location", "Eyebrow", "Time", "Description", "Hosts"]; let dropped = false;
            for (const t of order) { const target = findLast(tree, si, t); if (target) { const parent = getAt(target.split(".").slice(0, -1).join(".")); if (Array.isArray(parent) && parent.length > 1) { removeAt(target); dropped = true; log(r, target, "structural", t, "dropped for node budget"); break; } } }
            if (!dropped) { const s = tree.sections[si]; const l = leavesOf(s.root as AnyNode); s.root = { t: "Stack", children: l.slice(0, 8) }; log(r, p, "structural", "section", "flattened to leaves"); } changed = true; }
          else if (r === "limits.perSection" || r === "limits.perPage") { const t = vio.detail!.split(" ")[1]; const si = r === "limits.perSection" ? Number(p.match(/\[(\d+)\]/)![1]) : -1; const target = findLast(tree, si, t)!; const n = getAt(target); const rep: any = n.t === "Overlay" ? n.content : n.t === "Frame" ? { t: "Stack", children: [n.child] } : n.t === "Rail" ? n.child : n.t === "Grid" ? { t: "Stack", children: n.children.map((c: Cell) => c.child) } : { t: "Rule", weight: "hairline" }; setAt(target, rep); log(r, target, "structural", n.t, rep.t); changed = true; }
          else if (r === "coverage.duplicate") { const m = vio.detail!.match(/^(\w+)(?: (\w+))?/)!; let t = m[1]; let filter: (n: AnyNode) => boolean = () => true; if (t === "RegistryItem") { const k = m[2]; filter = n => (n as RegistryItem).kind === k; } else if (t === "cash") { t = "CashFund"; } else if (t === "Date") { const forms = new Set<string>(); filter = n => { const f = (n as DateNode).form; if (forms.has(f)) return true; forms.add(f); return false; }; }
            const scope = p.startsWith("sections[") ? p : ""; const paths: string[] = []; walk(tree, v => { if (v.node.t === t && v.path.startsWith(scope) && filter(v.node)) paths.push(v.path); }); const victim = t === "Date" && paths.length ? paths[paths.length - 1] : paths[1] || paths[0]; if (!victim) continue; const parent = getAt(victim.split(".").slice(0, -1).join(".")); if (Array.isArray(parent) && parent.length > 1) removeAt(victim); else setAt(victim, { t: "Rule", weight: "hairline" }); log(r, victim, "coverage", t, "duplicate dropped"); changed = true; }
          else if (r === "coverage.missing") { const what = vio.detail!.split(" ")[0];
            if (what === "EventTitle") { tree.sections[0].root = macros.hero(seed); log(r, "sections[0].root", "coverage", "hero without EventTitle", "hero macro"); }
            else if (what === "RSVP") { const s = tree.sections.find(x => x.kind === "rsvp")!; (s.root.t === "Stack" ? (s.root as Stack).children : ((s.root = { t: "Stack", children: [s.root] }) as Stack).children).push({ t: "RSVP" }); log(r, p, "coverage", undefined, "RSVP appended"); }
            else if (what === "Registry") { const s = tree.sections.find(x => x.kind === "registry")!; const items = (["gift", "external", "cashfund"] as const).filter(k => (k === "gift" && caps.gifts) || (k === "external" && caps.externalRegistry) || (k === "cashfund" && caps.cashFund && !count(tree, v => v.node.t === "CashFund"))); (s.root.t === "Stack" ? (s.root as Stack).children : ((s.root = { t: "Stack", children: [s.root] }) as Stack).children).push({ t: "Registry", layout: { t: "Stack", children: items.map(k => ({ t: "RegistryItem" as const, kind: k })) } }); log(r, p, "coverage", undefined, "Registry appended"); }
            else { const node: CNode = what === "Venue" ? { t: "Venue" } : { t: "Date", form: "full" }; let s = tree.sections.find(x => x.kind === "details"); if (!s) { s = tree.sections[0]; } const root = s.root as AnyNode; const cl = leavesOf(root).length && findFirst(s.root, "Cluster"); if (cl) (cl as Cluster).children.push(node); else if (root.t === "Stack") (root as Stack).children.push({ t: "Cluster", children: [node, { t: "Time" }] }); else s.root = { t: "Stack", children: [s.root, { t: "Cluster", children: [node, { t: "Time" }] }] }; log(r, p, "coverage", undefined, `${what} appended`); }
            changed = true; }
        } catch (e) { /* a repair that throws is skipped; the violation stays in remaining */ }
        if (changed) break;
      }
      if (!changed) break;
    }
  };
  pass("main");
  return { tree, repairs, remaining: validateStructure(tree, caps) };
}
function countNodes(n: AnyNode): number { return 1 + childrenOf(n).reduce((a, c) => a + countNodes(c.node), 0); }
function findLast(tree: CompositionTree, si: number, t: string): string | null { let p: string | null = null; walk(tree, v => { if ((si < 0 || v.sectionIndex === si) && v.node.t === t) p = v.path; }); return p; }
function findFirst(n: CNode, t: string): AnyNode | null { if (n.t === t) return n; for (const c of childrenOf(n)) { const f = findFirst(c.node, t); if (f) return f; } return null; }

// ============================================================ 4. content fit (estimate; verified later against rendered geometry)
const FIT_LIMITS = { desktop: { display: 3, primary: 3 }, mobile: { display: 4, primary: 4 } };
interface FitMetrics { displayPx: Record<Emphasis, number>; avgCharEm: number; widthPx: number }
function textFor(node: AnyNode, content: Record<string, string>): string {
  if (node.t === "Date") { const d = node as DateNode; return d.form === "numeral" ? content.dayNumeral : d.form === "month-year" ? `${content.monthShort} ${content.year}` : d.form === "weekday" ? content.weekday : content.date; }
  if (node.t === "SectionHeading") return { details: "Join us at the lodge.", rsvp: "Will you be there?", registry: "A few things we love." }[(node as Heading).for];
  if (node.t === "CTA") return (node as CTA).target === "rsvp" ? "RSVP" : "Registry";
  return content[node.t.toLowerCase()] || "";
}
function widthShares(tree: CompositionTree, mode: "desktop" | "mobile"): Record<string, number> {
  // fraction of the section width available to each node, by path
  const shares: Record<string, number> = {};
  const rec = (n: AnyNode, path: string, share: number) => {
    shares[path] = share;
    const a = n as any;
    if (n.t === "Split") { const r = Number(a.ratio) / 100; const stacked = mode === "mobile" && a.mobile !== "keep"; rec(a.children[0], `${path}.children[0]`, stacked ? share : share * r); rec(a.children[1], `${path}.children[1]`, stacked ? share : share * (1 - r)); return; }
    if (n.t === "Rail") { const rw = { thin: .08, medium: .15, wide: .25 }[a.width as RailWidth]; const stacked = mode === "mobile"; rec(a.rail, `${path}.rail`, stacked ? share : share * rw); rec(a.child, `${path}.child`, stacked ? share : share * (1 - rw)); return; }
    if (n.t === "Grid") { const cols = mode === "mobile" ? a.mobile : a.columns; a.children.forEach((c: Cell, i: number) => rec(c, `${path}.children[${i}]`, share * Math.min(1, (c.span || 1) / cols))); return; }
    if (n.t === "Frame") { const ins = { tight: .04, normal: .08, deep: .14 }[a.inset as Inset]; rec(a.child, `${path}.child`, share * (1 - 2 * ins)); return; }
    if (n.t === "Overlay") { rec(a.content, `${path}.content`, share); rec(a.decoration, `${path}.decoration`, share * { quarter: .25, third: .33, half: .5, full: 1 }[a.extent as Extent]); return; }
    for (const c of childrenOf(n)) rec(c.node, `${path}.${c.key}`, share);
  };
  tree.sections.forEach((s, i) => rec(s.root as AnyNode, `sections[${i}].root`, 1));
  return shares;
}
function estimateFit(tree: CompositionTree, content: Record<string, string>, metrics: Record<"desktop" | "mobile", FitMetrics>): { tree: CompositionTree; repairs: Repair[] } {
  const out = clone(tree); const repairs: Repair[] = [];
  for (const mode of ["desktop", "mobile"] as const) {
    const m = metrics[mode]; const shares = widthShares(out, mode);
    walk(out, ({ node, path }) => {
      if (!isText(node)) return; const a = node as any; let emph: Emphasis = a.emphasis || (node.t === "EventTitle" ? "display" : node.t === "SectionHeading" ? "primary" : "secondary");
      const text = textFor(node, content); if (!text) return;
      for (let i = 0; i < 3; i++) {
        const limit = (FIT_LIMITS[mode] as any)[emph]; if (!limit) break;
        const px = m.displayPx[emph]; const width = m.widthPx * shares[path]; const charsPerLine = Math.max(4, width / (px * m.avgCharEm)); const lines = Math.ceil(text.length / charsPerLine);
        if (lines <= limit) break;
        const next: Emphasis = emph === "display" ? "primary" : emph === "primary" ? "secondary" : "caption";
        repairs.push({ rule: "fit.estimate", path, kind: "fit-estimate", before: `${emph} (${mode}: ~${lines} lines)`, after: next }); a.emphasis = next; emph = next;
      }
    });
  }
  return { tree: out, repairs };
}

// ============================================================ 5. canonicalize (defaults, ids, hash)
const DEFAULTS: Record<string, Record<string, any>> = { Stack: { gap: "normal" }, Cluster: { gap: "normal", justify: "start" }, Split: { align: "stretch", divider: "none" }, Grid: { ruled: false, gap: "normal" }, Cell: { span: 1, rowSpan: 1 }, Surface: { inset: "normal" }, MotifField: { extent: "full" }, MotifBand: { fill: "pattern" }, Rule: { orientation: "h" }, Glyph: { scale: "m" }, CTA: { style: "button" }, SectionHeading: { emphasis: "primary" }, RegistryItem: { emphasis: "standard" }, Date: { }, Eyebrow: { emphasis: "caption", case: "upper" }, EventTitle: { emphasis: "display", case: "none", layout: "block" }, Hosts: { emphasis: "secondary" }, Description: { emphasis: "secondary" }, Deadline: { emphasis: "caption" }, Venue: { emphasis: "secondary" }, Location: { emphasis: "secondary" }, Time: { emphasis: "secondary" } };
function canonicalize(tree: CompositionTree): { tree: CompositionTree; hash: string } {
  const out = clone(tree);
  out.sections.forEach((s, i) => { s.align = s.align || "start"; s.fill = s.fill || (s.kind === "hero" ? "screen" : "auto"); s.id = `s${i}`; });
  walk(out, ({ node, path, sectionIndex }) => {
    const d = DEFAULTS[node.t] || {}; for (const [k, v] of Object.entries(d)) if ((node as any)[k] === undefined) (node as any)[k] = v;
    if (node.t === "Date" && (node as any).emphasis === undefined) (node as any).emphasis = (node as DateNode).form === "numeral" ? "display" : "secondary";
    node.id = `s${sectionIndex}` + path.replace(/^sections\[\d+\]\.root/, "").replace(/\.children\[(\d+)\]/g, ".$1").replace(/\.(child|rail|content|decoration|layout)/g, (_m, k) => "." + k[0]);
  });
  const stable = (x: any): any => Array.isArray(x) ? x.map(stable) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).filter(k => k !== "id").sort().map(k => [k, stable(x[k])])) : x;
  return { tree: out, hash: fnv(JSON.stringify(stable(out))) };
}

// ============================================================ 6. skeleton + signature
function skeletonTokens(n: AnyNode, mode: "desktop" | "mobile"): string[] {
  const a = n as any; const kids = (arr: AnyNode[]) => arr.flatMap(c => skeletonTokens(c, mode));
  switch (n.t) {
    case "Split": { if (mode === "mobile" && a.mobile !== "keep") { const ch = a.mobile === "stack-reverse" ? [a.children[1], a.children[0]] : a.children; return ["Stack(", ...kids(ch), ")"]; } return [`Split:${a.ratio}(`, ...kids(a.children), ")"]; }
    case "Rail": { if (mode === "mobile") { if (a.mobile === "hide") return skeletonTokens(a.child, mode); const ch = a.mobile === "top" ? [a.rail, a.child] : [a.child, a.rail]; return ["Stack(", ...kids(ch), ")"]; } return [`Rail:${a.side}:${a.width}(`, ...skeletonTokens(a.rail, mode), "|", ...skeletonTokens(a.child, mode), ")"]; }
    case "Grid": { if (mode === "mobile" && a.mobile === 1) return ["Stack(", ...kids(a.children.map((c: Cell) => c.child)), ")"]; return [`Grid:${mode === "mobile" ? a.mobile : a.columns}${a.ruled ? ":ruled" : ""}(`, ...a.children.flatMap((c: Cell) => [`Cell:${c.span || 1}${(c.rowSpan || 1) > 1 ? ":tall" : ""}(`, ...skeletonTokens(c.child, mode), ")"]), ")"]; }
    case "Overlay": { if (mode === "mobile" && a.mobile === "stack") return ["Stack(", ...skeletonTokens(a.content, mode), "MotifBand", ")"]; return [`Overlay:${a.anchor}:${a.extent}(`, ...skeletonTokens(a.content, mode), "|", ...skeletonTokens(a.decoration, mode), ")"]; }
    case "Frame": return [`Frame:${a.rule === "none" ? "inset" : "ruled"}:${a.inset}(`, ...skeletonTokens(a.child, mode), ")"];
    case "Surface": return [`Surface:${a.role}(`, ...skeletonTokens(a.child, mode), ")"];
    case "Stack": return ["Stack(", ...kids(a.children), ")"];
    case "Cluster": return [];
    case "Cell": return skeletonTokens(a.child, mode);
    case "MotifField": return [`MotifField:${a.motif.role}`];
    case "MotifBand": return [`MotifBand:${a.height}`];
    case "Date": return [`Date:${a.form}`];
    case "EventTitle": return [a.layout && a.layout !== "block" ? `Title:${a.layout}` : "Title"];
    case "Monogram": return [`Monogram:${a.style}`];
    case "Registry": return ["Registry(", ...skeletonTokens(a.layout, mode), ")"];
    case "RegistryItem": return [`Item:${a.kind}`];
    case "RSVP": return ["RSVP"];
    case "CashFund": return ["CashFund"];
    default: return [];   // plain text, CTA, Rule, Glyph, headings are not structural
  }
}
function levenshtein(a: string[], b: string[]): number { const m = a.length, n = b.length; const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function seqSim(a: string[], b: string[]) { const L = Math.max(a.length, b.length); return L ? 1 - levenshtein(a, b) / L : 1; }
function compress(tokens: string[]) { // drop empty containers left after removing plain text
  const out: string[] = []; for (const t of tokens) { if (t === ")" && /\($/.test(out[out.length - 1] || "")) { out.pop(); continue; } out.push(t); } return out; }
interface Skeleton { hero: string[]; surfaces: string[]; rsvp: string[]; registry: string[]; align: string; heroString: string }
function skeleton(tree: CompositionTree, mode: "desktop" | "mobile"): Skeleton {
  const sec = (k: string) => tree.sections.find(s => s.kind === k);
  const hero = compress(skeletonTokens(sec("hero")!.root as AnyNode, mode)); const r = sec("rsvp"), g = sec("registry");
  return { hero, surfaces: tree.sections.map(s => s.surface), rsvp: r ? compress(skeletonTokens(r.root as AnyNode, mode)) : [], registry: g ? compress(skeletonTokens(g.root as AnyNode, mode)) : [], align: sec("hero")!.align || "start", heroString: hero.join(" ") };
}
const SIG_WEIGHTS = { desktop: { hero: .45, surfaces: .15, rsvp: .10, registry: .10, align: .05, category: .10, tone: .05 }, mobile: { hero: .50, surfaces: .20, rsvp: .05, registry: .10, align: 0, category: .10, tone: .05 } };
interface SigInput { tree: CompositionTree; category?: string; tone?: string }
function similarity(a: SigInput, b: SigInput, mode: "desktop" | "mobile"): number {
  const w = SIG_WEIGHTS[mode]; const sa = skeleton(a.tree, mode), sb = skeleton(b.tree, mode);
  const heroTerm = Math.max(0, (seqSim(sa.hero, sb.hero) - 0.5) / 0.5);   // partial overlap below .5 (every hero has a title stack) earns nothing
  let s = w.hero * heroTerm + w.surfaces * (sa.surfaces.join() === sb.surfaces.join() ? 1 : 0) + w.rsvp * seqSim(sa.rsvp, sb.rsvp) + w.registry * seqSim(sa.registry, sb.registry) + w.align * (sa.align === sb.align ? 1 : 0);
  if (a.category !== undefined) s += w.category * (a.category === b.category ? 1 : 0) + w.tone * (a.tone === b.tone ? 1 : 0); else s += w.category + w.tone; // tree-only comparison assumes the rest matches (conservative)
  return Math.round(s * 100) / 100;
}
function heroSimilarity(a: CompositionTree, b: CompositionTree, mode: "desktop" | "mobile" = "desktop") { return Math.round(seqSim(skeleton(a, mode).hero, skeleton(b, mode).hero) * 100) / 100; }

// ============================================================ 7. layout resolution (tokens → values; the renderer reads only this)
const SCALES = { railPx: { thin: 48, medium: 96, wide: 192 }, bandPx: { thin: 24, medium: 48, tall: 96 }, insetPx: { tight: 14, normal: 36, deep: 64 }, gapPx: { compact: { tight: 8, normal: 16, loose: 24 }, balanced: { tight: 10, normal: 22, loose: 34 }, spacious: { tight: 14, normal: 30, loose: 44 } }, extentPct: { quarter: 25, third: 33, half: 50, full: 100 } };
function resolveLayout(tree: CompositionTree, density: "compact" | "balanced" | "spacious"): Record<string, any> {
  const out: Record<string, any> = {};
  walk(tree, ({ node }) => {
    const a = node as any; const id = node.id!;
    switch (node.t) {
      case "Split": out[id] = { first: Number(a.ratio), mobile: a.mobile, align: a.align }; break;
      case "Rail": out[id] = { side: a.side, widthPx: SCALES.railPx[a.width as RailWidth], mobile: a.mobile }; break;
      case "Grid": out[id] = { columns: a.columns, mobileColumns: a.mobile, ruled: !!a.ruled, gapPx: SCALES.gapPx[density][a.gap as Gap] }; break;
      case "Cell": out[id] = { span: a.span, rowSpan: a.rowSpan }; break;
      case "Frame": out[id] = { rule: a.rule, insetPx: SCALES.insetPx[a.inset as Inset], motif: a.motif || null }; break;
      case "Surface": out[id] = { role: a.role, insetPx: SCALES.insetPx[a.inset as Inset] }; break;
      case "Overlay": out[id] = { anchor: a.anchor, extentPct: SCALES.extentPct[a.extent as Extent], mobile: a.mobile }; break;
      case "Stack": out[id] = { gapPx: SCALES.gapPx[density][a.gap as Gap], align: a.align || null }; break;
      case "Cluster": out[id] = { gapPx: SCALES.gapPx[density][a.gap as Gap], justify: a.justify }; break;
      case "MotifField": out[id] = { motif: a.motif, extentPct: SCALES.extentPct[a.extent as Extent] }; break;
      case "MotifBand": out[id] = { heightPx: SCALES.bandPx[a.height as BandHeight], motif: a.motif || null, fill: a.fill }; break;
      default: out[id] = { emphasis: a.emphasis || null };
    }
  });
  return out;
}

// ============================================================ 8. primitive spec text for the prompt (generated from NODE_SPEC)
function specText(caps: Capabilities): string {
  const lines: string[] = [];
  const fmt = (p: PropSpec) => p.enum ? p.enum.map(x => JSON.stringify(x)).join("|") : p.type === "motif" ? "{id: MotifId, role: MotifRole}" : p.type === "node" ? "Node" : "?";
  for (const [t, s] of Object.entries(NODE_SPEC)) {
    if (!caps.rsvp && t === "RSVP") continue; if (!caps.registry && (t === "Registry" || t === "RegistryItem")) continue; if (!caps.cashFund && t === "CashFund") continue;
    if ((t === "Hosts" && !caps.hosts) || (t === "Description" && !caps.description) || (t === "Time" && !caps.time) || (t === "Location" && !caps.location) || (t === "Deadline" && !caps.deadline)) continue;
    const props = Object.entries(s.props).map(([k, p]) => `${k}${p.required ? "" : "?"}: ${fmt(p)}`);
    if (s.children) props.push(`children: [${s.children.allow}] (${s.children.min}..${s.children.max})`);
    lines.push(`${t} { ${props.join("; ")} }  — ${s.doc}`);
  }
  lines.push(`MotifId: ${ENUM.MotifId.map(x => JSON.stringify(x)).join("|")} (patterns: ${PATTERN_MOTIFS.join(", ")}; arrangements: ${ARRANGEMENT_MOTIFS.join(", ")}). MotifRole: ${ENUM.MotifRole.map(x => JSON.stringify(x)).join("|")}.`);
  lines.push(`Value types: quoted tokens are JSON strings (ratio is the string "62", never the number 62); Grid.columns, Grid.mobile, Cell.span and Cell.rowSpan are JSON numbers; Grid.ruled is a JSON boolean.`);
  lines.push(`Section { kind: hero|details|rsvp|registry|band; surface: base|alt|contrast|accent; align?: start|center|end; fill?: auto|screen (hero only); root: a container (Stack, Split, Rail, Grid, Frame, Surface, Overlay), or MotifBand for a band section }`);
  lines.push(`CompositionTree { version: "composition_v1"; sections: Section[] (${LIMITS.sectionsMin}..${LIMITS.sectionsMax}, hero first) }`);
  return lines.join("\n");
}
function rulesText(caps: Capabilities): string {
  const req = ["EventTitle exactly once", "Venue exactly once", "Date at least once (at most twice, different forms)"];
  if (caps.rsvp) req.push("one rsvp section containing RSVP exactly once"); if (caps.registry) req.push("one registry section containing Registry exactly once, with each RegistryItem kind at most once");
  return [
    `Required: ${req.join("; ")}. Within one section each text node appears at most once (Date at most twice with different forms) and CTA at most once; the same text may reappear in another section (the hero and the details both showing the date is normal). Description and Monogram at most once per page.`,
    `Nesting: Cluster holds only text nodes, Date, CTA, Glyph, vertical Rule. Split has exactly two children. Rail's rail is a MotifField or a Stack of at most 4 small leaves. Grid children are Cells; a Cell may not hold a Grid or an Overlay. No Frame inside a Frame, no Overlay inside an Overlay, no Grid inside a Grid, no Rail inside a Rail, Split inside Split at most once. A Surface may not repeat the surface it sits on. Overlay content is a text-bearing Stack, Frame or Split; its decoration is a MotifField, Monogram, Glyph or Date numeral.`,
    `Components: RSVP, Registry and CashFund may only be children of a section root, Stack, Surface, Frame, Split (with at least half the width) or a wide Cell. RSVP lives in the rsvp section; Registry lives in the registry section. Registry.layout is a Grid, Stack or Split whose leaves are RegistryItem.`,
    `Limits: container depth at most ${LIMITS.depth}; at most ${LIMITS.nodesPerSection} nodes per section; per section at most 1 Overlay, 1 Rail, 1 Grid, 1 Frame, 2 MotifField; per page at most 2 Overlay, 2 Frame; at most two consecutive contrast sections.`,
    `Responsive: Split.mobile keep is only honoured when neither side holds a component or the Description (the compiler then fits the text to the narrower column). Rail.mobile hide is only honoured for a MotifField rail.`,
  ].join("\n");
}

const Composition = { ENUM, NODE_SPEC, LIMITS, FIT_LIMITS, SCALES, SIG_WEIGHTS, DEFAULT_MACROS, validateSchema, validateStructure, repair, estimateFit, canonicalize, skeleton, skeletonTokens, similarity, heroSimilarity, seqSim, resolveLayout, specText, rulesText, walk, childrenOf, countNodes, widthShares, textFor, fnv };
declare const module: any; if (typeof module !== "undefined") module.exports = Composition;
