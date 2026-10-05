import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import type { InviteView } from "@/app/invite/[token]/InviteScreen";
import { FIXTURE_INVITE_TOKENS } from "../creation/cohost-stubs";
import { InviteFixture } from "./InviteFixture";

/**
 * Development-only fixture for the co-host invite page (`docs/screen-spec.md`
 * `cohost-invite-accept`): the real `InviteScreen` with each state the page can show, from
 * fixture data, no database. 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 *
 * - `?state=signed-out|signed-in|invalid|owner|cohost|rate-limited|error` (default `signed-in`);
 * - `&title=0`: an event with no title yet; `&inviter=0`: an inviter with no display name;
 * - `&accept=invalid`: `Join event` finds the link no longer valid (used or revoked meanwhile);
 *   otherwise it joins and goes to the Creation Mode fixture as a co-host.
 * The sign-in methods are the real ones, but no OAuth provider is configured here.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InviteFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const eventTitle = one("title") === "0" ? null : "Maya's Garden Shower";
  const inviterName = one("inviter") === "0" ? null : "Ana Lopez";

  const views: Record<string, InviteView> = {
    "signed-out": { kind: "signed_out", eventTitle, inviterName, providers: [] },
    "signed-in": { kind: "signed_in", eventTitle, inviterName },
    invalid: { kind: "invalid" },
    owner: { kind: "member", role: "owner", eventId: "fixture-event", eventTitle },
    cohost: { kind: "member", role: "cohost", eventId: "fixture-event", eventTitle },
    "rate-limited": { kind: "rate_limited" },
    error: { kind: "error" },
  };
  const view = views[one("state") ?? "signed-in"];
  if (!view) notFound();
  return (
    <InviteFixture
      view={view}
      token={FIXTURE_INVITE_TOKENS[0]}
      acceptOutcome={one("accept") === "invalid" ? "invalid" : "joined"}
    />
  );
}
