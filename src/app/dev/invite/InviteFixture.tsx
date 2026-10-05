"use client";

import { InviteScreen, type InviteView } from "@/app/invite/[token]/InviteScreen";

/**
 * The invite page's screen with a stubbed `Join event`, as the accept action answers: joined (the
 * screen goes to the event — here the Creation Mode fixture, as a co-host), or the link is no
 * longer valid.
 */
export function InviteFixture({
  view,
  token,
  acceptOutcome,
}: {
  view: InviteView;
  token: string;
  acceptOutcome: "joined" | "invalid";
}) {
  return (
    <InviteScreen
      view={view}
      token={token}
      eventHref={() => "/dev/creation?data=full&role=cohost"}
      accept={async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return acceptOutcome === "joined"
          ? { ok: true, eventId: "fixture-event" }
          : {
              ok: false,
              reason: "invalid",
              error:
                "This invitation link isn't valid anymore. Ask the person who invited you for a new one.",
            };
      }}
    />
  );
}
