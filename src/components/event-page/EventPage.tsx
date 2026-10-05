import type { ReactNode } from "react";
import type { EventPageContent, PageFact } from "@/lib/events/page-content";

/**
 * The house-style page beneath the card (`spec.md §21`, `§31` — Creation Mode;
 * `docs/design-system.md §15`): one look for every event, in app tokens only — never the card's
 * colours or fonts (`spec.md §32 #29`). Sections, in order: event details (the title, hosts, baby's
 * name, date, time, venue, address and the RSVP-by line), the description when there is one, and
 * the footer. RSVP, registry and information blocks join in their own phases.
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

export const PRODUCT_NAME = "Event Platform";

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
  return (
    <div className="flex w-full max-w-(--width-narrow) flex-col gap-4" data-event-page="">
      <section
        data-section="details"
        aria-label="Event details"
        className="flex flex-col gap-4 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-label-sm tracking-widest text-app-text-secondary uppercase">
            Event details
          </p>
          {collaborator?.details}
        </div>
        <h1 className="text-heading-lg text-app-text">{content.title}</h1>
        <dl className="flex flex-col gap-4">
          <Fact label="Hosted by" fact={content.hosts} />
          <Fact label="For" fact={content.babyName} />
          <Fact label="Date" fact={content.date} />
          <Fact label="Time" fact={content.time} />
          {content.venue && (
            <Row label="Where" needsConfirming={content.venue.needsConfirming}>
              {content.venue.name && <span className="block">{content.venue.name}</span>}
              {content.venue.address && (
                <span className="block whitespace-pre-line text-app-text-secondary">
                  {content.venue.address}
                </span>
              )}
            </Row>
          )}
          <Fact label="RSVP" fact={content.rsvpBy} hideLabel />
        </dl>
      </section>

      {showDescription && (
        <section
          data-section="description"
          aria-label="Description"
          className="flex flex-col gap-3 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-label-sm tracking-widest text-app-text-secondary uppercase">
              Description
            </h2>
            {collaborator?.description}
          </div>
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

function Fact({
  label,
  fact,
  hideLabel = false,
}: {
  label: string;
  fact: PageFact | null;
  /** The text says it already ("RSVP by …"): the label stays for assistive tech only. */
  hideLabel?: boolean;
}) {
  if (!fact) return null;
  return (
    <Row label={label} needsConfirming={fact.needsConfirming} hideLabel={hideLabel}>
      {fact.text}
    </Row>
  );
}

function Row({
  label,
  needsConfirming,
  hideLabel = false,
  children,
}: {
  label: string;
  needsConfirming: boolean;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={hideLabel ? "sr-only" : "text-label-sm text-app-text-secondary"}>{label}</dt>
      <dd className="text-body-lg text-app-text">
        {children}
        {needsConfirming && <NeedsConfirming />}
      </dd>
    </div>
  );
}

/** Creation Mode only: the value is a placeholder or came from the description and is not confirmed. */
function NeedsConfirming() {
  return (
    <span
      data-needs-confirming=""
      className="mt-1 flex w-fit rounded-pill border border-dashed border-app-action px-2 py-0.5 text-label-sm text-app-text-secondary"
    >
      Needs confirming
    </span>
  );
}
