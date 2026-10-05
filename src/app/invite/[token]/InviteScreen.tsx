"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { OAuthProvider } from "@/app/actions/auth";
import { acceptCohostInvite, type AcceptCohostInviteResult } from "@/app/actions/cohosts";
import { SignInOptions } from "@/app/signin/SignInForm";
import { AppButton } from "@/components/app/AppButton";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import { InlineStatus } from "@/components/app/InlineStatus";

/**
 * The co-host invite page (`docs/screen-spec.md` `cohost-invite-accept`, `docs/design-system.md
 * §4.16`; `spec.md §6.2`): a small app-chrome flow, never card styling.
 *
 * - **Signed out:** the event's title and who invited them, then the sign-in methods, which bring
 *   the person back to this page (the token survives authentication as the callback's `next`).
 * - **Signed in:** the same, a summary of what a co-host can and can't do, and `Join event`, which
 *   goes into the existing event (`/events/[id]`), never event creation.
 * - **Already on the event:** the owner is told they own it; a co-host that they are one. Both get
 *   a way into the event.
 * - **Not valid** (unknown, expired, revoked or used — never which): one calm message.
 */

export type InviteView =
  | {
      kind: "signed_out";
      eventTitle: string | null;
      inviterName: string | null;
      providers: OAuthProvider[];
    }
  | { kind: "signed_in"; eventTitle: string | null; inviterName: string | null }
  | { kind: "member"; role: "owner" | "cohost"; eventId: string; eventTitle: string | null }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "error" };

const INVALID_HEADING = "This invitation link isn't valid anymore.";
const INVALID_BODY = "Ask the person who invited you for a new one.";

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-(--width-narrow) flex-1 flex-col justify-center gap-8 px-4 py-16">
      {children}
    </main>
  );
}

/** One calm message with a way home; says nothing about any event. */
function Notice({ heading, body }: { heading: string; body: string }) {
  return (
    <Frame>
      <div data-invite-state="notice" className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-heading-lg text-app-text">{heading}</h1>
        <p className="text-body-md text-app-text-secondary">{body}</p>
        <Link
          href="/"
          className="mt-2 inline-flex min-h-11 items-center text-body-sm text-app-text-secondary underline-offset-2 hover:underline"
        >
          Go to the home page
        </Link>
      </div>
    </Frame>
  );
}

function Invitation({
  eventTitle,
  inviterName,
}: {
  eventTitle: string | null;
  inviterName: string | null;
}) {
  return (
    <header className="flex flex-col gap-2 text-center">
      <p className="text-label-md text-app-text-secondary">
        {inviterName ? `${inviterName} invited you to co-host` : "You're invited to co-host"}
      </p>
      <h1 data-invite-title="" className="text-heading-xl break-words text-app-text">
        {eventTitle ?? "An event"}
      </h1>
    </header>
  );
}

/** What a co-host can and can't do (`spec.md §6.2`). */
function RoleSummary() {
  return (
    <section
      aria-labelledby="role-heading"
      data-role-summary=""
      className="flex flex-col gap-4 rounded-2xl border border-app-border bg-app-surface p-6 shadow-soft"
    >
      <h2 id="role-heading" className="text-heading-md text-app-text">
        As a co-host you can
      </h2>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-md text-app-text">
        <li>edit the event details and the card&apos;s wording</li>
        <li>manage privacy, the guest list and RSVPs</li>
        <li>manage the registry</li>
        <li>send invitations, reminders and announcements</li>
        <li>try other designs before the invitation is published</li>
        <li>publish once the event has been paid for</li>
      </ul>
      <p className="text-body-sm text-app-text-secondary">
        Only the owner can pay, manage co-hosts or delete the event.
      </p>
    </section>
  );
}

export function InviteScreen({
  view,
  token,
  accept = acceptCohostInvite,
  eventHref = (eventId) => `/events/${eventId}`,
}: {
  view: InviteView;
  token: string;
  /** `Join event`; the development fixture injects a stub. */
  accept?: (token: string) => Promise<AcceptCohostInviteResult>;
  /** Where an event is; the development fixture points elsewhere. */
  eventHref?: (eventId: string) => string;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  async function join() {
    setError(null);
    setJoining(true);
    try {
      const result = await accept(token);
      if (result.ok) {
        // Into the existing event; the page stays busy until it has gone.
        router.replace(eventHref(result.eventId));
        return;
      }
      if (result.reason === "invalid") setInvalid(true);
      else if (result.reason === "signed_out") router.refresh();
      else setError(result.error);
      setJoining(false);
    } catch {
      setError("Couldn't join the event. Try again.");
      setJoining(false);
    }
  }

  if (view.kind === "invalid" || invalid) {
    return <Notice heading={INVALID_HEADING} body={INVALID_BODY} />;
  }
  if (view.kind === "rate_limited") {
    return <Notice heading="Too many attempts." body="Try again a little later." />;
  }
  if (view.kind === "error") {
    return (
      <Notice
        heading="We couldn't open this invitation."
        body="Something went wrong on our side. Try again in a moment."
      />
    );
  }

  if (view.kind === "member") {
    return (
      <Frame>
        <div data-invite-state={`member-${view.role}`} className="flex flex-col gap-6">
          <header className="flex flex-col gap-2 text-center">
            <h1 className="text-heading-xl break-words text-app-text">
              {view.eventTitle ?? "Your event"}
            </h1>
            <p className="text-body-md text-app-text-secondary">
              {view.role === "owner"
                ? "You already own this event. Send this link to the person you want to co-host."
                : "You're already a co-host of this event."}
            </p>
          </header>
          <AppButtonLink href={eventHref(view.eventId)} variant="primary" size="lg">
            Open event
          </AppButtonLink>
        </div>
      </Frame>
    );
  }

  if (view.kind === "signed_out") {
    return (
      <Frame>
        <div data-invite-state="signed-out" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Invitation eventTitle={view.eventTitle} inviterName={view.inviterName} />
            <p className="text-center text-body-md text-app-text-secondary">
              Sign in to help plan the invitation together. You&apos;ll come straight back here.
            </p>
          </div>
          <SignInOptions
            providers={view.providers}
            next={`/invite/${token}`}
            sentNote="Open it to come back to this invitation."
          />
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div data-invite-state="signed-in" className="flex flex-col gap-6">
        <Invitation eventTitle={view.eventTitle} inviterName={view.inviterName} />
        <RoleSummary />
        <div className="flex flex-col gap-3">
          <AppButton
            type="button"
            variant="primary"
            size="lg"
            pending={joining}
            onClick={() => void join()}
            className="w-full"
          >
            Join event
          </AppButton>
          {error && <InlineStatus variant="danger">{error}</InlineStatus>}
        </div>
      </div>
    </Frame>
  );
}
