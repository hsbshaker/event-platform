import { loadComposerState } from "@/app/actions/draft";
import { getCurrentUser } from "@/lib/auth/session";
import { LandingView } from "./LandingView";

/**
 * The landing page (spec.md §7.1): loads this browser's saved draft and who, if anyone, is signed
 * in; `LandingView` draws it and `LandingComposer` holds the interaction.
 */

function restoreNoticeFrom(value: string | undefined): "expired" | "taken" | null {
  return value === "expired" || value === "taken" ? value : null;
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ restore?: string }>;
}) {
  const [state, params, user] = await Promise.all([
    loadComposerState(),
    searchParams,
    getCurrentUser(),
  ]);

  return (
    <LandingView
      state={state}
      restoreNotice={restoreNoticeFrom(params.restore)}
      account={user ? { email: user.email ?? null } : null}
    />
  );
}
