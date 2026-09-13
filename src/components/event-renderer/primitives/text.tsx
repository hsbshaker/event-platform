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
 * An absent optional field renders nothing rather than an empty box. Capabilities decide what the
 * tree may reference, but content can legitimately still be empty before the host fills it in, and
 * an empty measured element would report geometry for a line that is not there.
 */

import { CTA_COPY, SECTION_HEADING_COPY } from "@/lib/renderer/compile/semantic-copy";

import type { ReactNode } from "react";

import type { CTA, DateNode, Heading, TextNode, TextKind } from "@/lib/renderer/composition/nodes";
import type { EventContent } from "../contract";
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

function textClass(node: { t: string; emphasis?: string; case?: string }): string {
  return `ev-text ev-t-${node.t} ev-em-${node.emphasis ?? "secondary"} ev-case-${node.case ?? "none"}`;
}

/** One component shape for the seven leaves that differ only in which field they read. */
function plainText(kind: Exclude<TextKind, "EventTitle">) {
  return primitive<TextNode>((node, ctx) => {
    const value = ctx.content[TEXT_FIELD[kind]];
    if (!value) return null;
    return (
      <div className={textClass(node)} data-id={node.id} data-t="text">
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
 * `layout` stagger/cascade breaks the title into up to three lines, at the same two word offsets
 * the reference used. The offsets are structural, not a measurement: fitting is the geometry
 * verifier's job, and it demotes emphasis rather than re-breaking lines.
 */
function titleLines(title: string): string[] {
  const words = title.split(" ");
  return [
    words.slice(0, 2).join(" "),
    words.slice(2, 4).join(" "),
    words.slice(4).join(" "),
  ].filter(Boolean);
}

export const EventTitlePrimitive = primitive<TextNode>((node, ctx) => {
  const { title } = ctx.content;
  if (!title) return null;
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
    <h1 className={`${textClass(node)} ev-lay-${layout}`} data-id={node.id} data-t="text">
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
  const emphasis = node.emphasis ?? (node.form === "numeral" ? "display" : "secondary");
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

export const SectionHeadingPrimitive = primitive<Heading>((node) => (
  <h2
    className={`ev-text ev-t-SectionHeading ev-em-${node.emphasis ?? "primary"}`}
    data-id={node.id}
    data-t="text"
  >
    {SECTION_HEADING_COPY[node.for]}
  </h2>
));
