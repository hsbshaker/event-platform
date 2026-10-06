import type { ReactNode } from "react";
import type { EventPageContent, PageFact } from "@/lib/events/page-content";

/**
 * The house-style page beneath the card (`spec.md §21`, `§31` — Creation Mode;
 * `docs/design-system.md §15`, §15.4 Revision 5): one look for every event, in app tokens only —
 * never the card's colours or fonts (`spec.md §32 #29`). Sections, in order: event details (the
 * title, then rows of a quiet line icon and the value: when, where, hosts, the baby's name and the
 * RSVP-by line), the description when there is one, and the footer. RSVP, registry and information
 * blocks join in their own phases.
 *
 * It draws `content` as given (`eventPageContent`): for a guest that is real values only, so a
 * missing fact renders nothing; in Creation Mode a placeholder or prompt-stated value arrives
 * flagged and is drawn with an app-styled "Needs confirming" marker.
 *
 * `collaborator` is the anchor slot (`CollaboratorActionSlot`): Creation Mode fills it, the guest
 * page leaves it out, and then no control exists at all. Giving a `description` slot with no
 * description draws the section with an empty-state line so there is somewhere to `Add` it.
 * Server-compatible.
 */

export const PRODUCT_NAME = "Revelnote";

export interface EventPageCollaborator {
  details?: ReactNode;
  description?: ReactNode;
}

export function EventPage({
  content,
  collaborator,
}: {
  content: EventPageContent;
  collaborator?: EventPageCollaborator;
}) {
  const showDescription = content.description !== null || collaborator?.description !== undefined;
  const when = [content.date, content.time].filter((fact): fact is PageFact => fact !== null);
  return (
    <div className="flex w-full max-w-(--width-narrow) flex-col gap-8" data-event-page="">
      <section data-section="details" aria-label="Event details" className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-display-md text-balance text-app-text">{content.title}</h1>
          {collaborator?.details}
        </div>
        <dl className="flex flex-col border-y border-app-border">
          {when.length > 0 && (
            <Row icon={<CalendarIcon />} label="When">
              {when.map((fact, i) => (
                <Line key={i} secondary={i > 0} needsConfirming={fact.needsConfirming}>
                  {fact.text}
                </Line>
              ))}
            </Row>
          )}
          {content.venue && (
            <Row icon={<PinIcon />} label="Where">
              {content.venue.name && (
                <Line needsConfirming={content.venue.needsConfirming && !content.venue.address}>
                  {content.venue.name}
                </Line>
              )}
              {content.venue.address && (
                <Line secondary needsConfirming={content.venue.needsConfirming}>
                  <span className="whitespace-pre-line">{content.venue.address}</span>
                </Line>
              )}
            </Row>
          )}
          {content.hosts && (
            <Row icon={<PeopleIcon />} label="Hosted by">
              <Line needsConfirming={content.hosts.needsConfirming}>
                <span aria-hidden="true">Hosted by </span>
                {content.hosts.text}
              </Line>
            </Row>
          )}
          {content.babyName && (
            <Row icon={<HeartIcon />} label="For">
              <Line needsConfirming={content.babyName.needsConfirming}>
                <span aria-hidden="true">For </span>
                {content.babyName.text}
              </Line>
            </Row>
          )}
          {content.rsvpBy && (
            <Row icon={<EnvelopeIcon />} label="RSVP" hideLabel>
              <Line needsConfirming={content.rsvpBy.needsConfirming}>{content.rsvpBy.text}</Line>
            </Row>
          )}
        </dl>
      </section>

      {showDescription && (
        <section
          data-section="description"
          aria-label="Description"
          className="flex flex-col gap-3"
        >
          {collaborator?.description && (
            <div className="flex justify-end">{collaborator.description}</div>
          )}
          {content.description !== null ? (
            <p className="text-body-lg whitespace-pre-line text-app-text">{content.description}</p>
          ) : (
            <p className="text-body-md text-app-text-secondary">
              Add a note for your guests: what to expect, what to bring, parking.
            </p>
          )}
        </section>
      )}

      <footer className="pt-4 pb-2 text-center text-body-sm text-app-text-secondary">
        Made with {PRODUCT_NAME}
      </footer>
    </div>
  );
}

/** One detail: a quiet line icon, then the value's lines. The label is for assistive tech. */
function Row({
  icon,
  label,
  hideLabel = false,
  children,
}: {
  icon: ReactNode;
  label: string;
  /** The text says it already ("RSVP by …"): the label stays for assistive tech only. */
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 border-b border-app-border py-4 last:border-b-0">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-app-text-secondary">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="sr-only">{hideLabel ? label : `${label}:`}</dt>
        <dd className="flex flex-col gap-1">{children}</dd>
      </div>
    </div>
  );
}

function Line({
  secondary = false,
  needsConfirming,
  children,
}: {
  secondary?: boolean;
  needsConfirming: boolean;
  children: ReactNode;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span
        className={
          secondary ? "text-body-md text-app-text-secondary" : "text-body-lg text-app-text"
        }
      >
        {children}
      </span>
      {needsConfirming && <NeedsConfirming />}
    </span>
  );
}

/** Creation Mode only: the value is a placeholder or came from the description and is not confirmed. */
function NeedsConfirming() {
  return (
    <span
      data-needs-confirming=""
      className="flex w-fit rounded-pill border border-dashed border-app-border-strong px-2 py-0.5 text-label-sm text-app-text-secondary"
    >
      Needs confirming
    </span>
  );
}

/* Quiet line icons for the detail rows: 24px, 1.6 stroke, the text's own colour. */
const ICON = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CalendarIcon() {
  return (
    <svg {...ICON}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg {...ICON}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg {...ICON}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7l7.5 6 7.5-6" />
    </svg>
  );
}
