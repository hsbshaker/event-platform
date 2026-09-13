/**
 * Attractive tokens: devices the model over-selects (staggered titles, hero numerals, watermark
 * decorations). They are diversity controls, scoped to a sibling batch by the planner: at most
 * one sibling in three may use each. The allotment is prompt text; a violation earns the one
 * re-prompt and then deterministic neutralization logged as a `planner` repair
 * (`docs/event-renderer-system.md §5`).
 *
 * The mechanism is generic — `{ id, detect(tree), neutralize(tree) }` — and the list is data, so
 * adding a token is a data change, never renderer code (`spec.md §32` #29).
 *
 * Neutralizers mutate the tree in place, as the reference does; the caller owns cloning.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type { CompositionTree, DateNode, Overlay, Repair, TextNode } from "./nodes";
import { walk } from "./walk";

export const ATTRACTIVE_TOKENS: {
  id: string;
  doc: string;
  detect: (tree: CompositionTree) => boolean;
  neutralize: (tree: CompositionTree) => Repair[];
}[] = [
  {
    id: "staggerTitle",
    doc: "EventTitle.layout stagger or cascade",
    detect: (t) => {
      let f = false;
      walk(t, ({ node }) => {
        if (
          node.t === "EventTitle" &&
          (node as TextNode).layout &&
          (node as TextNode).layout !== "block"
        )
          f = true;
      });
      return f;
    },
    neutralize: (t) => {
      const out: Repair[] = [];
      walk(t, ({ node, path }) => {
        const n = node as TextNode;
        if (node.t === "EventTitle" && n.layout && n.layout !== "block") {
          out.push({
            rule: "planner.attractiveToken",
            path,
            kind: "planner",
            before: n.layout,
            after: "block",
          });
          n.layout = "block";
        }
      });
      return out;
    },
  },
  {
    id: "heroNumeral",
    doc: "a Date numeral in the hero",
    detect: (t) => {
      let f = false;
      // A shallow wrapper over the hero section only: the section object itself is shared, so a
      // neutralizer that walks this wrapper mutates the real tree.
      walk({ version: t.version, sections: [t.sections[0]] }, ({ node }) => {
        if (node.t === "Date" && (node as DateNode).form === "numeral") f = true;
      });
      return f;
    },
    neutralize: (t) => {
      const out: Repair[] = [];
      const seen = new Set<string>();
      walk({ version: t.version, sections: [t.sections[0]] }, ({ node }) => {
        if (node.t === "Date") seen.add((node as DateNode).form);
      });
      walk({ version: t.version, sections: [t.sections[0]] }, ({ node, path }) => {
        if (node.t === "Date" && (node as DateNode).form === "numeral") {
          const next = (["month-year", "weekday", "full"] as const).find((f) => !seen.has(f));
          const n = node as DateNode;
          if (!next) {
            // No free Date form left in the hero, so the numeral becomes a hairline Rule. The
            // node is rewritten in place (type first, then props) exactly as the reference does.
            out.push({
              rule: "planner.attractiveToken",
              path,
              kind: "planner",
              before: "numeral",
              after: "dropped",
            });
            const mut = node as unknown as {
              t: string;
              weight?: string;
              form?: string;
              emphasis?: string;
            };
            mut.t = "Rule";
            mut.weight = "hairline";
            delete mut.form;
            delete mut.emphasis;
            return;
          }
          seen.add(next);
          out.push({
            rule: "planner.attractiveToken",
            path,
            kind: "planner",
            before: "numeral",
            after: next,
          });
          n.form = next;
          if (n.emphasis === "display") n.emphasis = "primary";
        }
      });
      return out;
    },
  },
  {
    id: "watermark",
    doc: "a watermark Monogram or a decorative Date behind the title",
    detect: (t) => {
      let f = false;
      walk(t, ({ node, parentKey }) => {
        if (parentKey === "decoration" && (node.t === "Monogram" || node.t === "Date")) f = true;
      });
      return f;
    },
    neutralize: (t) => {
      const out: Repair[] = [];
      walk(t, ({ node, path, parentKey, parent }) => {
        if (parentKey === "decoration" && (node.t === "Monogram" || node.t === "Date")) {
          out.push({
            rule: "planner.attractiveToken",
            path,
            kind: "planner",
            before: node.t,
            after: "MotifField linen",
          });
          (parent as Overlay).decoration = {
            t: "MotifField",
            motif: { id: "linen", role: "field" },
          };
        }
      });
      return out;
    },
  },
];
