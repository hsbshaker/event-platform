"use client";

import { useEffect, useState } from "react";

import {
  createCohostInvite,
  loadCohosts,
  removeCohost,
  revokeCohostInvite,
  type CohostRosterResult,
  type CreateCohostInviteResult,
} from "@/app/actions/cohosts";
import { AppButton } from "@/components/app/AppButton";
import { Field } from "@/components/app/Field";
import { InlineStatus } from "@/components/app/InlineStatus";
import { Input } from "@/components/app/Input";
import type { CohostMember, CohostRoster } from "@/lib/cohosts/invitations.server";

/**
 * The owner's Co-hosts sheet body (`spec.md §6.1` "invite/remove co-hosts", §6.2, §19.2
 * "Recommended before sharing: Co-host", §25 "Manage co-host access": owner only). Drawn in the
 * shared `Sheet`, for the owner only: the page never renders it for a co-host or a guest, and every
 * action is authorized again on the server.
 *
 * It lists the owner and the co-hosts (display name, else email) and the invite links that still
 * work, with when each was made and when it expires. `Create invite link` shows the new link once,
 * with `Copy`: it works once and expires in 7 days, and only its hash is kept, so it cannot be
 * shown again. `Revoke` stops a link at once; `Remove` asks once more, inline, then takes a
 * co-host off the event. Nothing is sent by the platform: the owner passes the link on.
 */

export interface CohostActions {
  load: (eventId: string) => Promise<CohostRosterResult>;
  create: (eventId: string) => Promise<CreateCohostInviteResult>;
  revoke: (input: { eventId: string; invitationId: string }) => Promise<CohostRosterResult>;
  remove: (input: { eventId: string; userId: string }) => Promise<CohostRosterResult>;
}

export const COHOST_ACTIONS: CohostActions = {
  load: loadCohosts,
  create: createCohostInvite,
  revoke: revokeCohostInvite,
  remove: removeCohost,
};

const FAILED = "Couldn't do that. Try again.";
const LINK_ID = "new-invite-link";

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function day(iso: string): string {
  return DAY.format(new Date(iso));
}

function displayName(member: CohostMember): string {
  return member.name ?? member.email ?? "Someone";
}

/** The count of co-hosts in a roster. */
export function cohostCount(roster: CohostRoster): number {
  return roster.members.filter((m) => m.role === "cohost").length;
}

export function CohostsPanel({
  eventId,
  actions = COHOST_ACTIONS,
  onRoster,
}: {
  eventId: string;
  actions?: CohostActions;
  /** Told of every roster read, so the page's count of co-hosts stays current. */
  onRoster?: (roster: CohostRoster) => void;
}) {
  const [roster, setRoster] = useState<CohostRoster | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function apply(next: CohostRoster) {
    setRoster(next);
    onRoster?.(next);
  }

  async function load() {
    setLoadFailed(false);
    try {
      const result = await actions.load(eventId);
      if (result.ok) apply(result.roster);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    }
  }

  // Once per opening: the sheet's body mounts when it opens.
  useEffect(() => {
    let live = true;
    actions.load(eventId).then(
      (result) => {
        if (!live) return;
        if (result.ok) {
          setRoster(result.roster);
          onRoster?.(result.roster);
        } else {
          setLoadFailed(true);
        }
      },
      () => {
        if (live) setLoadFailed(true);
      },
    );
    return () => {
      live = false;
    };
    // `onRoster` may be a new function every render; reading the roster once per opening is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, eventId]);

  async function run(key: string, action: () => Promise<CohostRosterResult>) {
    if (pending) return;
    setPending(key);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        apply(result.roster);
        setConfirming(null);
      } else {
        setError(result.error);
        // Already used or revoked: show the list as it is now.
        if (result.reason === "not_pending") void load();
      }
    } catch {
      setError(FAILED);
    } finally {
      setPending(null);
    }
  }

  async function create() {
    if (pending) return;
    setPending("create");
    setError(null);
    setCopied(null);
    try {
      const result = await actions.create(eventId);
      if (result.ok) {
        apply(result.roster);
        setCreated({
          link: `${window.location.origin}${result.path}`,
          expiresAt: result.invitation.expiresAt,
        });
      } else {
        setError(result.error);
      }
    } catch {
      setError(FAILED);
    } finally {
      setPending(null);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied("copied");
    } catch {
      setCopied("failed");
      const input = document.getElementById(LINK_ID);
      if (input instanceof HTMLInputElement) input.select();
    }
  }

  if (!roster) {
    return loadFailed ? (
      <div className="flex flex-col items-start gap-3">
        <InlineStatus variant="danger">Couldn&apos;t load your co-hosts.</InlineStatus>
        <AppButton variant="secondary" size="sm" onClick={() => void load()}>
          Try again
        </AppButton>
      </div>
    ) : (
      <InlineStatus live>Loading…</InlineStatus>
    );
  }

  const cohosts = roster.members.filter((m) => m.role === "cohost");

  return (
    <div className="flex flex-col gap-8" data-cohosts-panel="">
      <section aria-labelledby="people-heading" className="flex flex-col gap-3">
        <h3 id="people-heading" className="text-heading-md text-app-text">
          People
        </h3>
        <ul className="flex flex-col gap-2">
          {roster.members.map((member) => (
            <li
              key={member.userId}
              data-member={member.role}
              className="flex flex-col gap-3 rounded-lg border border-app-border bg-app-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label-md break-words text-app-text">
                    {displayName(member)}
                    {member.you ? " (you)" : ""}
                  </span>
                  <span className="text-body-sm break-words text-app-text-secondary">
                    {member.role === "owner" ? "Owner" : "Co-host"}
                    {member.name && member.email ? ` · ${member.email}` : ""}
                  </span>
                </span>
                {member.role === "cohost" && confirming !== member.userId && (
                  <AppButton
                    variant="secondary"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => setConfirming(member.userId)}
                    aria-label={`Remove ${displayName(member)}`}
                  >
                    Remove
                  </AppButton>
                )}
              </div>
              {member.role === "cohost" && confirming === member.userId && (
                <div className="flex flex-col gap-2" data-confirm-remove="">
                  <p className="text-body-sm text-app-text">
                    Remove {displayName(member)}? They&apos;ll lose access to this event.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <AppButton
                      variant="destructive"
                      size="sm"
                      pending={pending === `remove:${member.userId}`}
                      disabled={pending !== null}
                      onClick={() =>
                        void run(`remove:${member.userId}`, () =>
                          actions.remove({ eventId, userId: member.userId }),
                        )
                      }
                    >
                      Remove co-host
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </AppButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {cohosts.length === 0 && (
          <p className="text-body-sm text-app-text-secondary">
            No co-hosts yet. A co-host can edit the invitation, manage guests and the registry, and
            publish once it&apos;s paid for.
          </p>
        )}
      </section>

      <section aria-labelledby="links-heading" className="flex flex-col gap-3">
        <h3 id="links-heading" className="text-heading-md text-app-text">
          Invite links
        </h3>
        <p className="text-body-sm text-app-text-secondary">
          Send a link to the person you want to co-host. Each link works once and expires after 7
          days. We don&apos;t send it for you.
        </p>

        {created && (
          <div
            data-new-invite=""
            className="flex flex-col gap-3 rounded-lg border border-app-border-strong bg-app-surface-subtle p-4"
          >
            <Field
              id={LINK_ID}
              label="New invite link"
              hint={`Copy it now: you won't see it again. It works once and expires ${day(created.expiresAt)}.`}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  readOnly
                  value={created.link}
                  onFocus={(event) => event.currentTarget.select()}
                  className="text-body-sm"
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <AppButton variant="secondary" size="sm" onClick={() => void copy()}>
                Copy
              </AppButton>
              {copied === "copied" && (
                <InlineStatus variant="success" live>
                  Copied
                </InlineStatus>
              )}
              {copied === "failed" && (
                <InlineStatus variant="danger">
                  Couldn&apos;t copy. Select the link to copy it yourself.
                </InlineStatus>
              )}
            </div>
          </div>
        )}

        {roster.pending.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {roster.pending.map((invite) => (
              <li
                key={invite.id}
                data-pending-invite={invite.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-app-border bg-app-surface px-4 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label-md text-app-text">Invite link</span>
                  <span className="text-body-sm text-app-text-secondary">
                    Made {day(invite.createdAt)} · Expires {day(invite.expiresAt)}
                  </span>
                </span>
                <AppButton
                  variant="secondary"
                  size="sm"
                  pending={pending === `revoke:${invite.id}`}
                  disabled={pending !== null}
                  onClick={() =>
                    void run(`revoke:${invite.id}`, () =>
                      actions.revoke({ eventId, invitationId: invite.id }),
                    )
                  }
                  aria-label={`Revoke the invite link made ${day(invite.createdAt)}`}
                >
                  Revoke
                </AppButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-app-text-secondary" data-no-pending="">
            No open invite links.
          </p>
        )}

        <div className="flex flex-col items-start gap-2">
          <AppButton
            variant="primary"
            size="md"
            pending={pending === "create"}
            disabled={pending !== null}
            onClick={() => void create()}
          >
            Create invite link
          </AppButton>
        </div>
      </section>

      {error && <InlineStatus variant="danger">{error}</InlineStatus>}
    </div>
  );
}
