import Link from "next/link";
import { loadEventDraft } from "@/app/actions/event-details";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { loadEventIdentityView } from "@/app/actions/event-identity";
import { DetailsForm } from "./DetailsForm";
import { EventIdentityPanel } from "./EventIdentityPanel";

/**
 * Generation + required details (spec.md §7.3/§7.10, docs/design-system.md §4.3,
 * docs/screen-spec.md `generation-details`, e2e H03).
 *
 * No wizard, no stepper, no percent-complete gate: this is a flat autosaving form next to the
 * live EventIdentity panel. A missing or inaccessible event renders a plain, non-leaking state
 * rather than distinguishing "does not exist" from "not yours" (spec.md §27).
 *
 * The two halves are deliberately side by side rather than sequential. `spec.md §7.10` calls
 * filling details in and watching generation "equally valid", and the host may switch between them
 * freely — which is also why a Route A question never takes the page over.
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

  // Read, never started, on the server: a page render must not be a spend decision, and a
  // prefetch or a double render would then be two. The panel starts generation from the client,
  // once, through the canonical path.
  const identity = await loadEventIdentityView(id);

  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col gap-8 px-4 py-10 lg:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-xl text-app-text">Your event</h1>
        <p className="text-body-md text-app-text-secondary">
          Fill in what you can below — nothing here is required to see your design directions, only
          to publish later.
        </p>
      </header>
      <div className="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
        {identity && <EventIdentityPanel eventId={id} initial={identity} />}
        <DetailsForm event={draft} />
      </div>
    </main>
  );
}
