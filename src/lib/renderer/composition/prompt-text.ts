/**
 * 8. Primitive spec text for the prompt, generated from `NODE_SPEC` and `LIMITS`.
 *
 * The prompt the model sees is generated from the same table the validator uses, so the two can
 * never drift (`docs/event-renderer-system.md §2`, `docs/model-contracts.md`). Both strings are
 * capability-scoped: a primitive the event cannot use is not offered at all
 * (`docs/event-renderer-system.md §2.3`).
 *
 * These strings are part of the prompt version. Changing a character changes what the model is
 * asked for, so the parity tests compare them byte for byte.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type { Capabilities } from "./nodes";
import { LIMITS, NODE_SPEC, type PropSpec } from "./spec";
import { ARRANGEMENT_MOTIFS, ENUM, PATTERN_MOTIFS } from "./tokens";

export function specText(caps: Capabilities): string {
  const lines: string[] = [];
  const fmt = (p: PropSpec) =>
    p.enum
      ? p.enum.map((x) => JSON.stringify(x)).join("|")
      : p.type === "motif"
        ? "{id: MotifId, role: MotifRole}"
        : p.type === "node"
          ? "Node"
          : "?";
  for (const [t, s] of Object.entries(NODE_SPEC)) {
    if (!caps.rsvp && t === "RSVP") continue;
    if (!caps.registry && (t === "Registry" || t === "RegistryItem")) continue;
    if (!caps.cashFund && t === "CashFund") continue;
    // Artwork is opt-in, and absent means disabled. A concept that may not place artwork is not
    // offered the primitive at all, exactly as with RSVP or CashFund
    // (`docs/event-renderer-system.md §2.3`, `spec.md §7.6a #1`).
    if (!caps.artwork && t === "Artwork") continue;
    if (
      (t === "Hosts" && !caps.hosts) ||
      (t === "Description" && !caps.description) ||
      (t === "Time" && !caps.time) ||
      (t === "Location" && !caps.location) ||
      (t === "Deadline" && !caps.deadline)
    )
      continue;
    const props = Object.entries(s.props).map(
      ([k, p]) => `${k}${p.required ? "" : "?"}: ${fmt(p)}`,
    );
    if (s.children)
      props.push(`children: [${s.children.allow}] (${s.children.min}..${s.children.max})`);
    lines.push(`${t} { ${props.join("; ")} }  — ${s.doc}`);
  }
  lines.push(
    `MotifId: ${ENUM.MotifId.map((x) => JSON.stringify(x)).join("|")} (patterns: ${PATTERN_MOTIFS.join(", ")}; arrangements: ${ARRANGEMENT_MOTIFS.join(", ")}). MotifRole: ${ENUM.MotifRole.map((x) => JSON.stringify(x)).join("|")}.`,
  );
  lines.push(
    `Value types: quoted tokens are JSON strings (ratio is the string "62", never the number 62); Grid.columns, Grid.mobile, Cell.span and Cell.rowSpan are JSON numbers; Grid.ruled is a JSON boolean.`,
  );
  lines.push(
    `Section { kind: hero|details|rsvp|registry|band; surface: base|alt|contrast|accent; align?: start|center|end; fill?: auto|screen (hero only); root: a container (Stack, Split, Rail, Grid, Frame, Surface, Overlay), or MotifBand for a band section }`,
  );
  lines.push(
    `CompositionTree { version: "composition_v1"; sections: Section[] (${LIMITS.sectionsMin}..${LIMITS.sectionsMax}, hero first) }`,
  );
  return lines.join("\n");
}

export function rulesText(caps: Capabilities): string {
  // Every artwork clause is capability-scoped, so a caps object without artwork produces exactly
  // the bytes it produced before the primitive existed.
  const artSection = caps.artwork ? ", 1 Artwork" : "";
  const artPage = caps.artwork ? ", 2 Artwork" : "";
  const artRule = caps.artwork
    ? `Artwork: a place for original thematic artwork, never a picture you describe. You choose whether the page wants artwork at all, what each piece is for (role) and how much room it takes (extent); you never choose what it depicts, how large it is, or where on the page it sits. It may stand among a container's children or be an Overlay's decoration, behind the text. Artwork is optional and a concept is often stronger without it. A page must read completely with no artwork present: never make it carry the title, the date or any other information.`
    : "";
  const req = [
    "EventTitle exactly once",
    "Venue exactly once",
    "Date at least once (at most twice, different forms)",
  ];
  if (caps.rsvp) req.push("one rsvp section containing RSVP exactly once");
  if (caps.registry)
    req.push(
      "one registry section containing Registry exactly once, with each RegistryItem kind at most once",
    );
  return [
    `Required: ${req.join("; ")}. Within one section each text node appears at most once (Date at most twice with different forms) and CTA at most once; the same text may reappear in another section (the hero and the details both showing the date is normal). Description and Monogram at most once per page.`,
    `Nesting: Cluster holds only text nodes, Date, CTA, Glyph, vertical Rule. Split has exactly two children. Rail's rail is a MotifField or a Stack of at most 4 small leaves. Grid children are Cells; a Cell may not hold a Grid or an Overlay. No Frame inside a Frame, no Overlay inside an Overlay, no Grid inside a Grid, no Rail inside a Rail, Split inside Split at most once. A Surface may not repeat the surface it sits on. Overlay content is a text-bearing Stack, Frame or Split; its decoration is a MotifField, Monogram, Glyph${caps.artwork ? ", Artwork" : ""} or Date numeral.`,
    `Components: RSVP, Registry and CashFund may only be children of a section root, Stack, Surface, Frame, Split (with at least half the width) or a wide Cell. RSVP lives in the rsvp section; Registry lives in the registry section. Registry.layout is a Grid, Stack or Split whose leaves are RegistryItem.`,
    `Limits: container depth at most ${LIMITS.depth}; at most ${LIMITS.nodesPerSection} nodes per section; per section at most 1 Overlay, 1 Rail, 1 Grid, 1 Frame, 2 MotifField${artSection}; per page at most 2 Overlay, 2 Frame${artPage}; at most two consecutive contrast sections.`,
    `Boxes: at most two nested boxes (Frame or Surface) on any path; a Frame inside a Surface inside a framed hero is three borders and will be unwrapped.`,
    `Motifs: pattern motifs (plaid, stripe, gingham, linen) go in MotifField, MotifBand and Frame.motif; arrangement motifs (equestrian, botanical, celestial) go in Glyph and Rule.glyphs.`,
    artRule,
    `Responsive: Split.mobile keep is only honoured when neither side holds a component or the Description (the compiler then fits the text to the narrower column). Rail.mobile hide is only honoured for a MotifField rail.`,
  ]
    .filter(Boolean)
    .join("\n");
}
