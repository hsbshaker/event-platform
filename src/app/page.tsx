import Link from "next/link";
import { loadComposerState } from "@/app/actions/draft";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import { Wordmark } from "@/components/app/BrandSeal";
import { LandingComposer } from "@/components/app/LandingComposer";
import { ShowcaseFestoon, ShowcaseHanging } from "@/components/app/ShowcaseFestoon";
import { SHOWCASE, SHOWCASE_PHONE, SHOWCASE_STORY } from "@/components/app/showcase";
import { ComesToLife } from "@/components/app/ComesToLife";

/**
 * Landing composer (spec.md §7.1, docs/screen-spec.md `landing-composer`, e2e H01;
 * docs/design-system.md §4.1, Revision 5).
 *
 * The composer is the visual and interaction focal point, on lit paper in the dusk field. The
 * showcase cards hang beside it as pictures, never choices; nothing here becomes a signup step,
 * template gallery or feature matrix (spec.md §32 #3, #6). This Server Component only loads the
 * saved draft state; all interaction lives in `LandingComposer`.
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
      <section className="surface-dusk relative isolate overflow-hidden">
        <ShowcaseFestoon cards={SHOWCASE} />
        <header className="relative mx-auto flex w-full max-w-(--width-full) items-center justify-between px-4 py-4 sm:px-8">
          <Wordmark />
          <Link
            href="/signin"
            // min-h/min-w keep the touch target at 44px on phones (design-system §7.6) without
            // changing how the link reads.
            className="-mr-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-body-md text-dusk-text underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </header>
        <ShowcaseHanging card={SHOWCASE_PHONE} />
        <LandingComposer initialState={state} restoreNotice={restoreNoticeFrom(params.restore)} />
      </section>

      <ComesToLife card={SHOWCASE_STORY} />

      <section className="surface-dusk">
        <div className="mx-auto flex w-full max-w-(--width-wide) flex-col gap-8 px-4 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-(--width-narrow) text-display-md text-dusk-text">
            Your guests open it from an envelope and reply from their phone.
          </p>
          <AppButtonLink href="#prompt" size="lg" className="self-start lg:self-auto">
            Create my invitation ✦
          </AppButtonLink>
        </div>
        <div className="mx-auto w-full max-w-(--width-wide) border-t border-dusk-text/15 px-4 py-6 sm:px-8">
          <Wordmark size="sm" />
        </div>
      </section>
    </div>
  );
}
