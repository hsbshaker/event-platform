import type { CohostActions } from "@/app/events/[id]/CohostsPanel";
import type { CohostMember, CohostRoster } from "@/lib/cohosts/invitations.server";

/**
 * The development fixture's stand-ins for the co-host actions (`src/app/actions/cohosts.ts`),
 * behaving as the server does: the owner first, then co-hosts; a new link adds a pending invitation
 * made now and expiring in 7 days and returns its path once; `Revoke` drops a pending one; `Remove`
 * drops a co-host and never the owner. No database.
 */

/** The links the stub hands out, in order: 43 base64url characters, as a real token is. */
export const FIXTURE_INVITE_TOKENS = [
  "fixtureInviteToken0000000000000000000000001",
  "fixtureInviteToken0000000000000000000000002",
  "fixtureInviteToken0000000000000000000000003",
] as const;

const NOW = Date.parse("2026-10-05T12:00:00Z");
const DAY_MS = 86_400_000;

const OWNER: CohostMember = {
  userId: "00000000-0000-4000-8000-0000000000a1",
  role: "owner",
  name: "Ana Lopez",
  email: "ana@example.com",
  you: true,
};

const COHOSTS: CohostMember[] = [
  {
    userId: "00000000-0000-4000-8000-0000000000b1",
    role: "cohost",
    name: "Leo Park",
    email: "leo@example.com",
    you: false,
  },
  {
    userId: "00000000-0000-4000-8000-0000000000b2",
    role: "cohost",
    name: null,
    email: "sam@example.com",
    you: false,
  },
];

export function fixtureCohostActions({
  cohosts,
  pending,
}: {
  /** How many co-hosts the event starts with (0–2). */
  cohosts: number;
  /** How many pending links it starts with. */
  pending: number;
}): CohostActions {
  let roster: CohostRoster = {
    members: [OWNER, ...COHOSTS.slice(0, cohosts)],
    pending: Array.from({ length: pending }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000c${i + 1}`,
      createdAt: new Date(NOW - (i + 2) * DAY_MS).toISOString(),
      expiresAt: new Date(NOW + (5 - i) * DAY_MS).toISOString(),
    })),
  };
  let issued = 0;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 60));
  return {
    async load() {
      await wait();
      return { ok: true, roster };
    },
    async create() {
      await wait();
      const token = FIXTURE_INVITE_TOKENS[issued % FIXTURE_INVITE_TOKENS.length];
      issued += 1;
      const invitation = {
        id: `00000000-0000-4000-8000-0000000000d${issued}`,
        createdAt: new Date(NOW).toISOString(),
        expiresAt: new Date(NOW + 7 * DAY_MS).toISOString(),
      };
      roster = { ...roster, pending: [...roster.pending, invitation] };
      return { ok: true, path: `/invite/${token}`, invitation, roster };
    },
    async revoke({ invitationId }) {
      await wait();
      if (!roster.pending.some((p) => p.id === invitationId)) {
        return {
          ok: false,
          reason: "not_pending",
          error: "That link was already used or revoked.",
        };
      }
      roster = { ...roster, pending: roster.pending.filter((p) => p.id !== invitationId) };
      return { ok: true, roster };
    },
    async remove({ userId }) {
      await wait();
      if (!roster.members.some((m) => m.userId === userId && m.role === "cohost")) {
        return { ok: false, reason: "not_found", error: "This event isn't available." };
      }
      roster = { ...roster, members: roster.members.filter((m) => m.userId !== userId) };
      return { ok: true, roster };
    },
  };
}
