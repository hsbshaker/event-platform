/**
 * Route shell for the landing composer (spec.md §7.1, screen-spec `landing-composer`).
 *
 * Phase 2 replaces this with the prompt composer. Nothing here may become a signup
 * step, template gallery or feature matrix (spec.md §32 #3, #6).
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-(--width-standard) flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Describe the event you imagine.</h1>
      <p className="text-app-text-secondary">
        The event composer arrives in Phase 2. Free to create · No templates · Publish when ready.
      </p>
    </main>
  );
}
