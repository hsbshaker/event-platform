import type { Metadata } from "next";

import { enabledOAuthProviders } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { previewInvitation } from "@/lib/cohosts/invitations.server";
import { isWellFormedInviteToken } from "@/lib/cohosts/token";

import { InviteScreen, type InviteView } from "./InviteScreen";

/**
 * The co-host invite link, `/invite/<token>` (`docs/screen-spec.md` `cohost-invite-accept`;
 * `spec.md §6.2`, §27). See `InviteScreen` for what each state shows.
 *
 * The token is hashed before any look-up (`previewInvitation`), each look-up is rate-limited per
 * requester IP and account, and nothing here logs it. The page is never indexed and sends no
 * referrer, so the link does not leak to another site through a click or the sign-in redirect.
 * A token that is malformed, unknown, expired, revoked or used shows the same message, and nothing
 * about any event.
 */

export const metadata: Metadata = {
  title: "Co-host invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteScreen view={await viewFor(token)} token={token} />;
}

async function viewFor(token: string): Promise<InviteView> {
  if (!isWellFormedInviteToken(token)) return { kind: "invalid" };
  try {
    const user = await getCurrentUser();
    const preview = await previewInvitation(token, user?.id ?? null);
    switch (preview.status) {
      case "invalid":
        return { kind: "invalid" };
      case "rate_limited":
        return { kind: "rate_limited" };
      case "member":
        return {
          kind: "member",
          role: preview.role,
          eventId: preview.eventId,
          eventTitle: preview.eventTitle,
        };
      case "valid":
        return user
          ? { kind: "signed_in", eventTitle: preview.eventTitle, inviterName: preview.inviterName }
          : {
              kind: "signed_out",
              eventTitle: preview.eventTitle,
              inviterName: preview.inviterName,
              providers: await enabledOAuthProviders(),
            };
    }
  } catch (error) {
    // Never the token or the error's message: its name and code only.
    const e = error as { name?: unknown; code?: unknown };
    console.error("invite page: look-up failed", {
      name: typeof e?.name === "string" ? e.name : typeof error,
      code: typeof e?.code === "string" ? e.code : undefined,
    });
    return { kind: "error" };
  }
}
