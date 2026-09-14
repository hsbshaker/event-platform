/**
 * The eleven semantic text leaves.
 *
 * The model chose form and emphasis; the words are the event's own
 * (`docs/event-renderer-system.md §2.2`). So each of these binds one `EventContent` field and
 * carries no copy of its own — the two exceptions, `CTA` and `SectionHeading`, are noted where
 * they are defined.
 *
 * `data-t="text"` is the hook rendered-geometry verification measures line counts and bounds
 * through (§3.1). Every text leaf carries it and its canonical `data-id`, so the verifier can name
 * the node it wants demoted an emphasis step.
 *
 * That demotion arrives as an override, never as an edit to the tree: `effectiveEmphasis` returns
 * the emphasis verification settled on for this node, falling back to the one the model authored.
 * Reading `node.emphasis` directly here would render the unfitted page — and the alternative, a
 * verifier that rewrote `emphasis` in the composition, would change the `compositionHash` and with
 * it the concept's identity (`docs/event-renderer-system.md §6`,
 * `@/lib/renderer/compile/verification`).
 *
 * An absent optional field renders nothing rather than an empty box. Capabilities decide what the
 * tree may reference, but content can legitimately still be empty before the host fills it in, and
 * an empty measured element would report geometry for a line that is not there.
 */

import { CTA_COPY, SECTION_HEADING_COPY } from "@/lib/renderer/compile/semantic-copy";
import { titleLines } from "@/lib/renderer/compile/title-lines";
import { effectiveEmphasis } from "@/lib/renderer/compile/verification";

import type { ReactNode } from "react";

import type { CTA, DateNode, Heading, TextNode, TextKind } from "@/lib/renderer/composition/nodes";
import type { Emphasis } from "@/lib/renderer/composition/tokens";
import type { EventContent, RenderContext } from "../contract";
import { primitive } from "../primitive";

/** Which `EventContent` field each plain text leaf speaks for. */
const TEXT_FIELD: Record<Exclude<TextKind, "EventTitle">, keyof EventContent> = {
  Eyebrow: "eyebrow",
  Hosts: "hosts",
  Description: "description",
  Deadline: "deadline",
  Venue: "venue",
  Location: "location",
  Time: "time",
};

/**
 * Section-heading and CTA copy is compiler-owned (`docs/event-renderer-system.md §2.2`) and lives
 * in `@/lib/renderer/compile/semantic-copy`. Components consume the table and must never author
 * their own: these strings are geometry, and copy invented here would change a rendered line count
 * without passing through anything that re-verifies the fit.
 */

/**
 * The emphasis a node renders at. `ctx.overrides` wins over the authored prop; the fallback is the
 * canonicalizer's own default for a node that somehow reached here uncanonicalized.
 */
function emphasisOf(
  ctx: RenderContext,
  node: { id?: string; emphasis?: Emphasis },
  fallback: Emphasis,
): Emphasis {
  return effectiveEmphasis(ctx.overrides, node.id, node.emphasis) ?? fallback;
}

function textClass(node: { t: string; case?: string }, emphasis: Emphasis): string {
  return `ev-text ev-t-${node.t} ev-em-${emphasis} ev-case-${node.case ?? "none"}`;
}

/** One component shape for the seven leaves that differ only in which field they read. */
function plainText(kind: Exclude<TextKind, "EventTitle">) {
  return primitive<TextNode>((node, ctx) => {
    const value = ctx.content[TEXT_FIELD[kind]];
    if (!value) return null;
    return (
      <div
        className={textClass(node, emphasisOf(ctx, node, "secondary"))}
        data-id={node.id}
        data-t="text"
      >
        {value}
      </div>
    );
  });
}

export const EyebrowPrimitive = plainText("Eyebrow");
export const HostsPrimitive = plainText("Hosts");
export const DescriptionPrimitive = plainText("Description");
export const DeadlinePrimitive = plainText("Deadline");
export const VenuePrimitive = plainText("Venue");
export const LocationPrimitive = plainText("Location");
export const TimePrimitive = plainText("Time");

/**
 * `layout` stagger/cascade breaks the title into coherent lines (`@/lib/renderer/compile/title-
 * lines`) and offsets them. The break is structural, not a measurement: fitting is still the
 * geometry verifier's job, and it demotes emphasis rather than re-breaking lines.
 */
export const EventTitlePrimitive = primitive<TextNode>((node, ctx) => {
  const { title } = ctx.content;
  // `title.trim()`, not `title`: a whitespace-only title is truthy but breaks into no lines, and an
  // empty `h1` would report geometry for text that is not there.
  if (!title || !title.trim()) return null;
  const layout = node.layout ?? "block";
  let body: ReactNode = title;
  if (layout !== "block") {
    body = titleLines(title).map((line, i) => (
      <span className="ev-line" key={i}>
        {line}
      </span>
    ));
  }
  return (
    <h1
      className={`${textClass(node, emphasisOf(ctx, node, "display"))} ev-lay-${layout}`}
      data-id={node.id}
      data-t="text"
    >
      {body}
    </h1>
  );
});

/** The four date forms read four already-formatted fields; the renderer never formats a date. */
function dateText(form: DateNode["form"], content: EventContent): string {
  switch (form) {
    case "numeral":
      return content.dayNumeral;
    case "month-year":
      return `${content.monthShort} ${content.year}`;
    case "weekday":
      return content.weekday;
    default:
      return content.date;
  }
}

export const DatePrimitive = primitive<DateNode>((node, ctx) => {
  const value = dateText(node.form, ctx.content);
  if (!value) return null;
  const emphasis = emphasisOf(ctx, node, node.form === "numeral" ? "display" : "secondary");
  return (
    <div
      className={`ev-text ev-t-Date ev-form-${node.form} ev-em-${emphasis}`}
      data-id={node.id}
      data-t="text"
    >
      {value}
    </div>
  );
});

export const CTAPrimitive = primitive<CTA>((node) => (
  <div className="ev-cta" data-id={node.id}>
    {/*
      Themed, but not yet a link: the RSVP and registry routes are later phases, and a control that
      goes nowhere must not be focusable or announced as a link. The button/link language itself
      comes from the page system, on the root.
    */}
    <span
      className={node.style === "link" ? "ev-link" : "ev-button"}
      data-t="text"
      data-cta={node.target}
    >
      {CTA_COPY[node.target]}
    </span>
  </div>
));

export const SectionHeadingPrimitive = primitive<Heading>((node, ctx) => (
  <h2
    className={`ev-text ev-t-SectionHeading ev-em-${emphasisOf(ctx, node, "primary")}`}
    data-id={node.id}
    data-t="text"
  >
    {SECTION_HEADING_COPY[node.for]}
  </h2>
));
