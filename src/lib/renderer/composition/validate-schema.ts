/**
 * 1. Schema validation (strict; unknown keys fail).
 *
 * A schema-invalid response is one of only three reasons the composition call is ever
 * re-prompted, and it is allowed at most once (`docs/event-renderer-system.md §1.5`,
 * `spec.md §32` #22). Every other defect is repaired deterministically, so this validator must
 * stay strict: an unknown key, an unknown node type or a number where a token string belongs is
 * a rejection, not something to tidy up.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type { Violation } from "./nodes";
import { NODE_SPEC, SECTION_SPEC } from "./spec";
import { ENUM } from "./tokens";

export function validateSchema(json: unknown): { ok: boolean; errors: Violation[] } {
  const errors: Violation[] = [];
  const err = (rule: string, path: string, detail?: string) => errors.push({ rule, path, detail });

  const checkNode = (n: unknown, path: string, depth: number) => {
    if (depth > 12) {
      err("schema.depth", path, "nesting deeper than 12");
      return;
    }
    if (!n || typeof n !== "object" || Array.isArray(n))
      return err("schema.node", path, "not an object");
    // The payload is untrusted JSON, so every read is a dynamic read.
    const node = n as Record<string, unknown>;
    const spec = NODE_SPEC[node.t as string];
    if (!spec) return err("schema.type", path, `unknown node type ${JSON.stringify(node.t)}`);
    for (const k of Object.keys(node))
      if (k !== "t" && !spec.props[k] && !(k === "children" && spec.children))
        err("schema.key", `${path}.${k}`, `unknown key on ${node.t}`);
    for (const [k, p] of Object.entries(spec.props)) {
      const v = node[k];
      if (v === undefined) {
        if (p.required) err("schema.required", `${path}.${k}`, `${node.t} requires ${k}`);
        continue;
      }
      if (p.enum) {
        if (!(p.enum as readonly unknown[]).includes(v))
          err(
            "schema.enum",
            `${path}.${k}`,
            `${JSON.stringify(v)} not in ${p.enum.map((x) => JSON.stringify(x)).join("|")}${
              typeof v === "number" && p.enum.some((x) => typeof x === "string")
                ? " (must be a string)"
                : ""
            }`,
          );
      } else if (p.type === "motif") {
        const motif = v as Record<string, unknown>;
        if (
          !v ||
          typeof v !== "object" ||
          !(ENUM.MotifId as readonly unknown[]).includes(motif.id) ||
          !(ENUM.MotifRole as readonly unknown[]).includes(motif.role) ||
          Object.keys(v).some((x) => x !== "id" && x !== "role")
        )
          err("schema.motif", `${path}.${k}`, "motif must be {id, role} from the motif list");
      } else if (p.type === "node") checkNode(v, `${path}.${k}`, depth + 1);
    }
    if (spec.children) {
      if (!Array.isArray(node.children))
        err("schema.children", `${path}.children`, `${node.t} requires children[]`);
      else {
        if (node.children.length < spec.children.min || node.children.length > spec.children.max)
          err(
            "schema.children.count",
            `${path}.children`,
            `${node.t} takes ${spec.children.min}..${spec.children.max} children, got ${node.children.length}`,
          );
        node.children.forEach((c: unknown, i: number) =>
          checkNode(c, `${path}.children[${i}]`, depth + 1),
        );
      }
    } else if (node.children !== undefined)
      err("schema.key", `${path}.children`, `${node.t} has no children`);
  };

  const t = json as Record<string, unknown> | null;
  if (!t || typeof t !== "object")
    return { ok: false, errors: [{ rule: "schema.root", path: "", detail: "not an object" }] };
  if (t.version !== "composition_v1") err("schema.version", "version", "must be composition_v1");
  for (const k of Object.keys(t))
    if (!["version", "sections"].includes(k)) err("schema.key", k, "unknown top-level key");
  if (!Array.isArray(t.sections)) err("schema.sections", "sections", "missing sections[]");
  else
    t.sections.forEach((s: unknown, i: number) => {
      const p = `sections[${i}]`;
      if (!s || typeof s !== "object") return err("schema.section", p, "not an object");
      const section = s as Record<string, unknown>;
      for (const k of Object.keys(section))
        if (!["kind", "surface", "align", "fill", "root"].includes(k))
          err("schema.key", `${p}.${k}`, "unknown section key");
      if (!(SECTION_SPEC.kind as readonly unknown[]).includes(section.kind))
        err("schema.enum", `${p}.kind`, `kind must be ${SECTION_SPEC.kind.join("|")}`);
      if (!(SECTION_SPEC.surface as readonly unknown[]).includes(section.surface))
        err("schema.enum", `${p}.surface`, "surface must be base|alt|contrast|accent");
      if (
        section.align !== undefined &&
        !(SECTION_SPEC.align as readonly unknown[]).includes(section.align)
      )
        err("schema.enum", `${p}.align`, "align must be start|center|end");
      if (
        section.fill !== undefined &&
        !(SECTION_SPEC.fill as readonly unknown[]).includes(section.fill)
      )
        err("schema.enum", `${p}.fill`, "fill must be auto|screen");
      if (section.root === undefined) err("schema.required", `${p}.root`, "section requires root");
      else checkNode(section.root, `${p}.root`, 0);
    });
  return { ok: errors.length === 0, errors };
}
