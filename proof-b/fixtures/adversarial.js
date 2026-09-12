// Adversarial fixtures. `structural` trees parse against the schema but break structural rules: the repair pipeline must fix every one.
// `schemaInvalid` payloads must be rejected by the schema (that is the re-prompt path, never the repair path).
(function (root) {
  const T = (t, p = {}) => ({ t, ...p });
  const stack = (children, p = {}) => ({ t: "Stack", children, ...p });
  const title = () => T("EventTitle", { emphasis: "display" });
  const heroOk = () => stack([T("Eyebrow"), title(), T("Hosts"), { t: "Cluster", children: [T("Date", { form: "full" }), T("Time"), T("Venue")] }, T("CTA", { target: "rsvp" })]);
  const rsvpOk = () => ({ kind: "rsvp", surface: "base", root: stack([T("SectionHeading", { for: "rsvp" }), T("Deadline"), T("RSVP")]) });
  const regOk = () => ({ kind: "registry", surface: "alt", root: stack([T("SectionHeading", { for: "registry" }), T("Registry", { layout: { t: "Grid", columns: 3, mobile: 1, children: [{ t: "Cell", child: T("RegistryItem", { kind: "gift" }) }, { t: "Cell", child: T("RegistryItem", { kind: "external" }) }, { t: "Cell", child: T("RegistryItem", { kind: "cashfund" }) }] } })]) });
  const page = (heroRoot, extra = {}) => ({ version: "composition_v1", sections: [{ kind: "hero", surface: "base", fill: "screen", root: heroRoot }, rsvpOk(), regOk()], ...extra });
  const nest = (n, inner) => { let x = inner; for (let i = 0; i < n; i++) x = stack([x]); return x; };
  const frame = child => T("Frame", { rule: "hairline", inset: "normal", child });
  const overlay = (content, decoration) => T("Overlay", { content, decoration, anchor: "bottom-start", extent: "half", mobile: "stack" });
  const field = () => T("MotifField", { motif: { id: "plaid", role: "field" } });

  const structural = [
    { name: "depth 9 of nested Stacks", tree: page(nest(9, heroOk())) },
    { name: "Frame in Frame in Frame", tree: page(frame(frame(frame(heroOk())))) },
    { name: "Overlay in Overlay", tree: page(overlay(stack([overlay(heroOk(), field())]), field())) },
    { name: "Grid in Grid", tree: page(T("Grid", { columns: 2, mobile: 1, children: [{ t: "Cell", child: T("Grid", { columns: 2, mobile: 1, children: [{ t: "Cell", child: title() }, { t: "Cell", child: T("Venue") }] }) }, { t: "Cell", child: T("Date", { form: "full" }) }] })) },
    { name: "Rail in Rail", tree: page(T("Rail", { side: "start", width: "wide", mobile: "top", rail: field(), child: T("Rail", { side: "end", width: "thin", mobile: "top", rail: field(), child: heroOk() }) })) },
    { name: "Split nested three deep", tree: page({ t: "Split", ratio: "50", mobile: "stack", children: [{ t: "Split", ratio: "50", mobile: "stack", children: [{ t: "Split", ratio: "50", mobile: "stack", children: [title(), T("Venue")] }, T("Date", { form: "full" })] }, field()] }) },
    { name: "RSVP inside a Cluster", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "rsvp", surface: "base", root: stack([{ t: "Cluster", children: [T("Deadline"), T("RSVP")] }]) }, regOk()] } },
    { name: "RSVP inside a Rail's rail", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "rsvp", surface: "base", root: T("Rail", { side: "start", width: "wide", mobile: "top", rail: T("RSVP"), child: stack([T("SectionHeading", { for: "rsvp" })]) }) }, regOk()] } },
    { name: "Registry in a narrow cell of a 4-column grid", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, rsvpOk(), { kind: "registry", surface: "alt", root: T("Grid", { columns: 4, mobile: 1, children: [{ t: "Cell", child: T("Registry", { layout: stack([T("RegistryItem", { kind: "gift" })]) }) }, { t: "Cell", child: T("SectionHeading", { for: "registry" }) }] }) }] } },
    { name: "RSVP on the 38 side of a Split", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "rsvp", surface: "base", root: { t: "Split", ratio: "62", mobile: "stack", children: [stack([T("SectionHeading", { for: "rsvp" }), T("Deadline")]), T("RSVP")] } }, regOk()] } },
    { name: "six Overlays on the page", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: stack([overlay(stack([title()]), field()), overlay(stack([T("Hosts")]), field()), overlay(stack([T("Venue")]), field())]) }, { kind: "details", surface: "alt", root: stack([overlay(stack([T("Date", { form: "full" })]), field()), overlay(stack([T("Time")]), field()), overlay(stack([T("Description")]), field())]) }, rsvpOk(), regOk()] } },
    { name: "three Frames in one section", tree: page(stack([frame(stack([title()])), frame(stack([T("Hosts")])), frame(stack([T("Venue"), T("Date", { form: "full" })]))])) },
    { name: "no EventTitle anywhere", tree: page(stack([T("Eyebrow"), T("Hosts"), T("Venue"), T("Date", { form: "full" })])) },
    { name: "two EventTitles", tree: page(stack([title(), T("Hosts"), title(), T("Venue"), T("Date", { form: "full" })])) },
    { name: "no rsvp section (rsvp enabled)", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "details", surface: "alt", root: stack([T("Description")]) }, regOk()] } },
    { name: "no registry section (registry enabled)", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "details", surface: "alt", root: stack([T("Description")]) }, rsvpOk()] } },
    { name: "RegistryItem outside Registry", tree: page(stack([title(), T("Venue"), T("Date", { form: "full" }), T("RegistryItem", { kind: "gift" })])) },
    { name: "Registry layout is a Cluster", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, rsvpOk(), { kind: "registry", surface: "alt", root: stack([T("Registry", { layout: { t: "Cluster", children: [T("Glyph", { motif: "botanical" }), T("Venue")] } })]) }] } },
    { name: "Overlay decoration carries text", tree: page(overlay(stack([title(), T("Venue"), T("Date", { form: "full" })]), stack([T("Hosts"), T("Description")]))) },
    { name: "Overlay content is a MotifField", tree: page(overlay(field(), T("Monogram", { style: "watermark" }))) },
    { name: "Cluster holding a Split and a Frame", tree: page(stack([title(), { t: "Cluster", children: [{ t: "Split", ratio: "50", mobile: "stack", children: [T("Venue"), T("Time")] }, frame(T("Date", { form: "full" }))] }])) },
    { name: "73 nodes in one section", tree: page(stack(Array.from({ length: 8 }, (_, i) => stack(i === 0 ? [title(), T("Venue"), T("Date", { form: "full" }), ...Array.from({ length: 5 }, () => T("Rule", { weight: "hairline" }))] : Array.from({ length: 8 }, () => T("Rule", { weight: "hairline" })))))) },
    { name: "five consecutive contrast sections", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "contrast", root: heroOk() }, { kind: "details", surface: "contrast", root: stack([T("Description")]) }, { kind: "band", surface: "contrast", root: T("MotifBand", { height: "tall" }) }, { ...rsvpOk(), surface: "contrast" }, { ...regOk(), surface: "contrast" }] } },
    { name: "hero not first", tree: { version: "composition_v1", sections: [rsvpOk(), { kind: "hero", surface: "base", root: heroOk() }, regOk()] } },
    { name: "two hero sections", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "hero", surface: "alt", root: stack([T("Description")]) }, rsvpOk(), regOk()] } },
    { name: "band section with a Stack root", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "band", surface: "alt", root: stack([T("Description")]) }, rsvpOk(), regOk()] } },
    { name: "Split keep with the RSVP inside", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "rsvp", surface: "base", root: { t: "Split", ratio: "38", mobile: "keep", children: [stack([T("SectionHeading", { for: "rsvp" })]), T("RSVP")] } }, regOk()] } },
    { name: "Rail hide with a Stack rail", tree: page(T("Rail", { side: "start", width: "wide", mobile: "hide", rail: stack([T("Date", { form: "numeral" }), T("Time")]), child: stack([title(), T("Venue")]) })) },
    { name: "Surface contrast inside a contrast section", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "contrast", root: T("Surface", { role: "contrast", child: heroOk() }) }, rsvpOk(), regOk()] } },
    { name: "Date three times, same form, in the hero", tree: page(stack([title(), T("Date", { form: "full" }), T("Date", { form: "full" }), T("Date", { form: "full" }), T("Venue")])) },
    { name: "fill screen on the details section", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "details", surface: "alt", fill: "screen", root: stack([T("Description")]) }, rsvpOk(), regOk()] } },
    { name: "seven sections", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "band", surface: "alt", root: T("MotifBand", { height: "thin" }) }, { kind: "details", surface: "base", root: stack([T("Description")]) }, rsvpOk(), regOk(), { kind: "band", surface: "alt", root: T("MotifBand", { height: "thin" }) }, { kind: "band", surface: "alt", root: T("MotifBand", { height: "thin" }) }] } },
    { name: "capabilities: Hosts, Description, CashFund and registry used on an event with none of them", caps: { rsvp: true, registry: false, gifts: false, externalRegistry: false, cashFund: false, hosts: false, description: false, time: true, location: true, deadline: true },
      tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: stack([title(), T("Hosts"), T("Description"), T("Venue"), T("Date", { form: "full" }), T("CashFund"), T("CTA", { target: "registry" })]) }, rsvpOk(), regOk()] } },
    { name: "capabilities: no rsvp on this event but an rsvp section", caps: { rsvp: false, registry: true, gifts: true, externalRegistry: true, cashFund: true, hosts: true, description: true, time: true, location: true, deadline: true },
      tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, rsvpOk(), regOk()] } },
    { name: "Grid children that are not Cells", tree: page(T("Grid", { columns: 3, mobile: 1, children: [title(), T("Venue"), T("Date", { form: "full" })] })) },
    { name: "component hoisting: RSVP nested in an Overlay decoration slot", tree: { version: "composition_v1", sections: [{ kind: "hero", surface: "base", root: heroOk() }, { kind: "rsvp", surface: "base", root: overlay(stack([T("SectionHeading", { for: "rsvp" })]), T("RSVP")) }, regOk()] } },
  ];
  const schemaInvalid = [
    { name: "unknown node type", tree: page(stack([T("Hero", { big: true }), title(), T("Venue"), T("Date", { form: "full" })])) },
    { name: "style key on a node", tree: page(stack([{ ...title(), style: "font-size: 90px" }, T("Venue"), T("Date", { form: "full" })])) },
    { name: "pixel width on a Split", tree: page({ t: "Split", ratio: "640px", mobile: "stack", children: [stack([title(), T("Venue"), T("Date", { form: "full" })]), field()] }) },
    { name: "free text copy", tree: page(stack([{ t: "EventTitle", text: "Welcome!" }, T("Venue"), T("Date", { form: "full" })])) },
    { name: "Split with three children", tree: page({ t: "Split", ratio: "50", mobile: "stack", children: [title(), T("Venue"), T("Date", { form: "full" })] }) },
    { name: "empty Stack", tree: page(stack([])) },
    { name: "children on a Frame", tree: page({ t: "Frame", rule: "hairline", inset: "normal", children: [title()] }) },
    { name: "wrong version", tree: { ...page(heroOk()), version: "composition_v2" } },
    { name: "html string instead of a tree", tree: "<section class='hero'><h1>Baby Shaker</h1></section>" },
    { name: "missing required prop (Rail without side)", tree: page(T("Rail", { width: "wide", mobile: "top", rail: field(), child: heroOk() })) },
  ];
  const ADVERSARIAL = { structural, schemaInvalid };
  root.ADVERSARIAL = ADVERSARIAL; if (typeof module !== "undefined") module.exports = ADVERSARIAL;
})(typeof window !== "undefined" ? window : globalThis);
