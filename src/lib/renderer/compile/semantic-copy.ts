/**
 * The compiler-owned semantic copy table.
 *
 * `docs/event-renderer-system.md §2.2` says a `SectionHeading`'s copy "comes from a compiler
 * table". This is that table. It lives in the compiler rather than in a React component for one
 * reason that matters more than tidiness: **these strings are geometry.** A longer heading is a
 * different line count, which is a different verified fit, which is a different
 * `ResolvedDesignSpec`. Copy that a component could invent locally would change rendered geometry
 * without passing through anything that re-verifies it.
 *
 * So: the renderer consumes this table, and no component may author its own copy. Changing a
 * string here is a compiler and rendering change and must re-run geometry regression
 * (`docs/event-renderer-system.md §9`), exactly as a type-scale change would.
 *
 * The MVP wording is deliberately neutral — each section's own name, and nothing invented. The
 * model never sees or influences it; it is not a creative surface.
 */

/** The sections a `SectionHeading` can name. */
export type HeadingSlot = "details" | "rsvp" | "registry";

/** The targets a `CTA` can point at. */
export type CtaTarget = "rsvp" | "registry";

export const SECTION_HEADING_COPY: Readonly<Record<HeadingSlot, string>> = {
  details: "Details",
  rsvp: "RSVP",
  registry: "Registry",
};

export const CTA_COPY: Readonly<Record<CtaTarget, string>> = {
  rsvp: "RSVP",
  registry: "Registry",
};

/**
 * Every string the table can produce, for the geometry baseline and for the test that pins it.
 * If this set changes, geometry evidence taken before the change is stale.
 */
export const SEMANTIC_COPY_STRINGS: readonly string[] = [
  ...new Set([...Object.values(SECTION_HEADING_COPY), ...Object.values(CTA_COPY)]),
].sort();
