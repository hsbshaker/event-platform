import Link from "next/link";
import { loadComposerState } from "@/app/actions/draft";
import { LandingComposer } from "@/components/app/LandingComposer";

/**
 * Landing composer (spec.md §7.1, docs/screen-spec.md `landing-composer`, e2e H01).
 *
 * The composer is the visual and interaction focal point; nothing here becomes a signup
 * step, template gallery or feature matrix (spec.md §32 #3, #6). This Server Component only
 * loads the saved draft state; all interaction lives in `LandingComposer`.
 */

function restoreNoticeFrom(value: string | undefined): "expired" | "taken" | null {
  return value === "expired" || value === "taken" ? value : null;
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ restore?: string }>;
}) {
  const [state, params] = await Promise.all([loadComposerState(), searchParams]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-(--width-wide) items-center justify-between px-4 py-4">
        <span className="text-label-md text-app-text-secondary">Event Platform</span>
        <Link
          href="/signin"
          // min-h/min-w keep the touch target at 44px on phones (design-system §7.6) without
          // changing how the link reads.
          className="-mr-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-body-sm text-app-text-secondary underline-offset-2 hover:underline"
        >
          Sign in
        </Link>
      </header>
      <LandingComposer initialState={state} restoreNotice={restoreNoticeFrom(params.restore)} />
    </div>
  );
}
