// Emits the canonical JSON Schema for composition_v1 from NODE_SPEC (single source of truth). Usage: node gen-schema.js > composition.schema.json
const C = require("./dist/composition.js");
const def = (t, s) => { const props = { t: { const: t } }; const required = ["t"];
  for (const [k, p] of Object.entries(s.props)) { if (p.enum) props[k] = { enum: [...p.enum] }; else if (p.type === "motif") props[k] = { $ref: "#/$defs/MotifRef" }; else if (p.type === "node") props[k] = { $ref: "#/$defs/Node" }; if (p.required) required.push(k); }
  if (s.children) { props.children = { type: "array", minItems: s.children.min, maxItems: s.children.max, items: { $ref: "#/$defs/Node" } }; required.push("children"); }
  return { type: "object", additionalProperties: false, required, properties: props, description: s.doc }; };
const $defs = { MotifRef: { type: "object", additionalProperties: false, required: ["id", "role"], properties: { id: { enum: [...C.ENUM.MotifId] }, role: { enum: [...C.ENUM.MotifRole] } } } };
for (const [t, s] of Object.entries(C.NODE_SPEC)) $defs[t] = def(t, s);
$defs.Node = { oneOf: Object.keys(C.NODE_SPEC).map(t => ({ $ref: `#/$defs/${t}` })) };
$defs.Section = { type: "object", additionalProperties: false, required: ["kind", "surface", "root"], properties: { kind: { enum: ["hero", "details", "rsvp", "registry", "band"] }, surface: { enum: [...C.ENUM.SurfaceRole] }, align: { enum: [...C.ENUM.Align] }, fill: { enum: ["auto", "screen"] }, root: { $ref: "#/$defs/Node" } } };
const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://event-platform.local/schemas/composition.schema.json", title: "CompositionTree", description: "Canonical schema for the composition model response (composition_v1). Structural rules (nesting, depth, coverage, capabilities, limits) are validated by the application after schema validation; see docs/event-renderer-system.md.", type: "object", additionalProperties: false, required: ["version", "sections"], properties: { version: { const: "composition_v1" }, sections: { type: "array", items: { $ref: "#/$defs/Section" }, description: "Section count, order and kinds are structural rules (repaired), not schema rules." } }, $defs };
process.stdout.write(JSON.stringify(schema, null, 2) + "\n");
