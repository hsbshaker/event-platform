import type { ReactNode } from "react";

import { AppButton } from "@/components/app/AppButton";
import { InlineStatus } from "@/components/app/InlineStatus";
import type { GenerationFailure } from "@/lib/generation/failure-copy";
import {
  waitStatusLine,
  type DesignShown,
  type IdentityShown,
  type WaitGeneration,
} from "@/lib/generation/wait-view";

/**
 * What the wait shows (`docs/screen-spec.md` `generation`; `spec.md §7.10`;
 * `docs/design-system.md §12.1`–§12.3): one truthful status line tied to the stage the pipeline has
 * resolved, and the artifacts it has actually produced as each arrives — the creative direction,
 * tone, colours and imagery, then the design's name, description and art direction in words.
 * Nothing invented: no percentage, no step count, no timer, no model or provider name, no
 * internal vocabulary. A failure is shown honestly, with a retry only where one can help.
 *
 * Presentational: the surface (`GenerationSurface`) owns the polling; the development fixture
 * renders the same component from fixture data.
 */

export type PanelState =
  | { kind: "starting" }
  | { kind: "running"; generation: WaitGeneration | null; offline: boolean }
  | { kind: "ready" }
  | { kind: "failed"; failure: GenerationFailure; retrying: boolean };

function Facet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-md text-app-text-secondary">{label}</dt>
      <dd className="text-body-md text-app-text">{children}</dd>
    </div>
  );
}

function IdentityBlock({ identity }: { identity: IdentityShown }) {
  const { toneKeywords, palette, visualMotifs } = identity;
  return (
    <div className="flex flex-col gap-3" data-generation-artifact="identity">
      <p className="text-body-lg text-app-text">{identity.creativeDirection}</p>
      <dl className="flex flex-col gap-2">
        {toneKeywords.length > 0 && <Facet label="The feel">{toneKeywords.join(", ")}</Facet>}
        {palette.length > 0 && <Facet label="Colours">{palette.join(", ")}</Facet>}
        {visualMotifs.length > 0 && <Facet label="Imagery">{visualMotifs.join(", ")}</Facet>}
      </dl>
    </div>
  );
}

function DesignBlock({ design }: { design: DesignShown }) {
  const art = design.artDirection;
  return (
    <div
      className="flex flex-col gap-3 border-t border-app-border pt-4"
      data-generation-artifact="design"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-heading-md text-app-text">{design.name}</h3>
        <p className="text-body-md text-app-text-secondary">{design.description}</p>
      </div>
      <dl className="flex flex-col gap-2">
        <Facet label="Subject">{art.subject}</Facet>
        <Facet label="Style">{art.medium}</Facet>
        <Facet label="Mood">{art.mood}</Facet>
        <Facet label="Palette">{art.palette}</Facet>
        <Facet label="Texture">{art.texture}</Facet>
      </dl>
    </div>
  );
}

export function GenerationPanel({
  state,
  onRetry,
}: {
  state: PanelState;
  /** `Try again`; shown only for a failure that can be retried. */
  onRetry?: () => void;
}) {
  return (
    <section
      aria-labelledby="generation-panel-heading"
      className="flex flex-col gap-4 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft"
    >
      {state.kind === "failed" ? (
        <div
          className="flex flex-col gap-3"
          role="alert"
          data-generation-failure={state.failure.code}
        >
          <h2 id="generation-panel-heading" className="text-heading-md text-app-text">
            {state.failure.title}
          </h2>
          <p className="text-body-md text-app-text-secondary">{state.failure.body}</p>
          {state.failure.retry && onRetry && (
            <div>
              <AppButton
                variant="primary"
                size="md"
                onClick={onRetry}
                pending={state.retrying}
                disabled={state.retrying}
              >
                Try again
              </AppButton>
            </div>
          )}
        </div>
      ) : (
        <>
          <h2 id="generation-panel-heading" className="text-heading-md text-app-text">
            Creating your invitation
          </h2>
          <InlineStatus live>
            {state.kind === "starting"
              ? "Getting started"
              : state.kind === "ready"
                ? "Your card is ready"
                : waitStatusLine(state.generation)}
          </InlineStatus>
          {state.kind === "running" && state.offline && (
            <InlineStatus variant="warning">Can&rsquo;t reach the server — retrying</InlineStatus>
          )}
          {state.kind === "running" && state.generation?.notice && (
            <p className="text-body-md text-app-text-secondary" data-generation-notice="">
              {state.generation.notice}
            </p>
          )}
          {state.kind === "running" && state.generation?.identity && (
            <IdentityBlock identity={state.generation.identity} />
          )}
          {state.kind === "running" && state.generation?.design && (
            <DesignBlock design={state.generation.design} />
          )}
        </>
      )}
    </section>
  );
}

/** The wait: the header, the progress panel and the details form beside it. */
export function WaitLayout({ panel, form }: { panel: ReactNode; form: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col gap-8 px-4 py-10 lg:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-xl text-app-text">A few details while we create…</h1>
        <p className="text-body-md text-app-text-secondary">
          Fill in what you can — or just watch. Nothing here holds up your invitation.
        </p>
      </header>
      <div className="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
        {panel}
        {form}
      </div>
    </main>
  );
}

/** The reveal's page: the card centred, no dashboard. */
export function RevealLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col items-center gap-8 px-4 py-10 lg:py-14">
      {children}
    </main>
  );
}
