import Link from "next/link";

/**
 * The plain, non-leaking state for an event that is missing or not the viewer's: it never says
 * which (`spec.md §27`).
 */
export function EventUnavailable() {
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
