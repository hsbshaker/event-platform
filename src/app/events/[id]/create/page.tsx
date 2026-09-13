import Link from "next/link";
import { loadEventDraft } from "@/app/actions/event-details";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { DetailsForm } from "./DetailsForm";
import { GenerationProgress } from "./GenerationProgress";

/**
 * Generation + required details (spec.md §7.3/§7.10, docs/design-system.md §4.3,
 * docs/screen-spec.md `generation-details`, e2e H03).
 *
 * No wizard, no stepper, no percent-complete gate: this is a flat autosaving form next to an
 * honest progress panel. A missing or inaccessible event renders a plain, non-leaking state
 * rather than distinguishing "does not exist" from "not yours" (spec.md §27).
 */

export default async function CreateEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let draft;
  try {
    draft = await loadEventDraft(id);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      draft = null;
    } else {
      throw error;
    }
  }

  if (!draft) {
    return (
      <main className="mx-auto flex w-full max-w-(--width-standard) flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <h1 className="text-heading-lg text-app-text">This event isn&apos;t available</h1>
        <p className="text-body-md text-app-text-secondary">
          It may not exist, or you may not have access to it.
        </p>
        <Link
          href="/"
          className="text-body-sm text-app-text-secondary underline-offset-2 hover:underline"
        >
          Start a new event
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col gap-8 px-4 py-10 lg:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-xl text-app-text">A few details while we create…</h1>
        <p className="text-body-md text-app-text-secondary">
          Your directions are already on the way. Fill in what you can below — nothing here is
          required to see them, only to publish later.
        </p>
      </header>
      <div className="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
        <GenerationProgress generationRequestedAt={draft.generationRequestedAt} />
        <DetailsForm event={draft} />
      </div>
    </main>
  );
}
