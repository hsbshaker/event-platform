"use client";

import { useEffect, useState } from "react";

import type { EventDraftView } from "@/app/actions/event-details";
import { newEventCode, revealEventCode, setEventPrivacy } from "@/app/actions/privacy";
import { AppButton } from "@/components/app/AppButton";
import { InlineStatus } from "@/components/app/InlineStatus";
import { MAKE_EVENT_CODE_ID } from "@/lib/events/event-code";
import type { SaveTracker } from "@/lib/events/save-tracker";

/**
 * Who can see the invitation, and the private event code (`spec.md §14.1`, §14.2, §8.1;
 * `docs/screen-spec.md` `event-details-editor`), inside the details form.
 *
 * Public or Private, saved as soon as it is chosen through the privacy action — the one path for a
 * visibility change, before and after publish (`src/app/actions/privacy.ts`). Choosing Private
 * always leaves a code stored (a new one, or the one the event had), and the code is shown here to
 * the owner and co-hosts with `Copy` and `New code`, with what it is for: guests who open the
 * shared link enter it, and personal invitation links skip it. A private event with no code (one
 * made private before codes existed) offers `Make a code`, which the setup checklist's "Private
 * event code" row opens, so that row never dead-ends.
 *
 * The code is fetched when needed (`revealEventCode`) rather than carried in the page, and never
 * written anywhere but the screen and, on `Copy`, the clipboard.
 */

export interface PrivacyActions {
  setPrivacy: typeof setEventPrivacy;
  newCode: typeof newEventCode;
  reveal: typeof revealEventCode;
}

const DEFAULT_ACTIONS: PrivacyActions = {
  setPrivacy: setEventPrivacy,
  newCode: newEventCode,
  reveal: revealEventCode,
};

const FAILED = "Couldn't save that. Try again.";

type Pending = "visibility" | "code" | null;
type Notice = "saved" | "copied" | "rotated" | null;

export function PrivacyControl({
  event,
  actions = DEFAULT_ACTIONS,
  saves,
  onSaved,
}: {
  event: EventDraftView;
  /** The privacy actions; the development fixture injects stubs. Keep the object stable. */
  actions?: PrivacyActions;
  /** Told of every change, so a surface that closes after its saves waits for this one too. */
  saves?: SaveTracker;
  /** Called with the event after every change. */
  onSaved?: (event: EventDraftView) => void;
}) {
  const [visibility, setVisibility] = useState(event.visibility);
  const [codeSet, setCodeSet] = useState(event.accessCodeSet);
  // undefined: not fetched yet; null: nothing to show.
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [revealFailed, setRevealFailed] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const isPrivate = visibility === "private";
  const needsReveal = isPrivate && codeSet && code === undefined && !revealFailed;

  useEffect(() => {
    if (!needsReveal) return;
    let live = true;
    actions.reveal(event.id).then(
      (result) => {
        if (!live) return;
        if (result.ok) setCode(result.code);
        else setRevealFailed(true);
      },
      () => {
        if (live) setRevealFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [needsReveal, actions, event.id]);

  function track<T extends { ok: boolean }>(save: Promise<T>): Promise<T> {
    return saves ? saves.track(save, (result) => result.ok) : save;
  }

  /** Saves `next` (or, with the event already private and no code, makes its code). */
  async function choose(next: "public" | "private") {
    if (pending) return;
    const previous = visibility;
    setVisibility(next);
    setPending("visibility");
    setError(null);
    setNotice(null);
    try {
      const result = await track(actions.setPrivacy({ eventId: event.id, visibility: next }));
      if (result.ok) {
        setCodeSet(result.event.accessCodeSet);
        if (result.code !== null) {
          setCode(result.code);
          setRevealFailed(false);
        } else if (result.codeUnreadable) {
          setCode(undefined);
          setRevealFailed(true);
        }
        setNotice("saved");
        onSaved?.(result.event);
      } else {
        setVisibility(previous);
        setError(result.error);
      }
    } catch {
      setVisibility(previous);
      setError(FAILED);
    } finally {
      setPending(null);
    }
  }

  async function rotate() {
    if (pending) return;
    setPending("code");
    setError(null);
    setNotice(null);
    try {
      const result = await track(actions.newCode({ eventId: event.id }));
      if (result.ok) {
        setCode(result.code);
        setRevealFailed(false);
        setNotice("rotated");
      } else {
        setError(result.error);
      }
    } catch {
      setError(FAILED);
    } finally {
      setPending(null);
    }
  }

  async function copy() {
    if (!code) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(code);
      setNotice("copied");
    } catch {
      setNotice(null);
      setError("Couldn't copy. Select the code to copy it yourself.");
    }
  }

  return (
    <fieldset className="flex flex-col gap-2" data-privacy={visibility ?? "unset"}>
      <legend className="text-label-md text-app-text">
        Who can see this invitation?
        <span aria-hidden="true" className="text-app-danger">
          {" "}
          *
        </span>
      </legend>
      <div className="flex flex-wrap gap-4">
        {(["public", "private"] as const).map((option) => (
          <label
            key={option}
            className="flex min-h-11 items-center gap-2 text-body-md text-app-text"
          >
            <input
              id={`visibility-${option}`}
              type="radio"
              name="visibility"
              value={option}
              checked={visibility === option}
              disabled={pending !== null}
              onChange={() => void choose(option)}
              className="h-4 w-4 accent-app-action"
            />
            {option === "public" ? "Public" : "Private"}
          </label>
        ))}
      </div>

      {isPrivate && !codeSet && (
        <div className="flex flex-col items-start gap-3" data-event-code-missing="">
          <p className="text-body-sm text-app-text-secondary">
            A private invitation needs an event code. Guests who open your shared link enter it;
            personal invitation links skip it.
          </p>
          <AppButton
            id={MAKE_EVENT_CODE_ID}
            variant="secondary"
            size="sm"
            pending={pending === "visibility"}
            onClick={() => void choose("private")}
          >
            Make a code
          </AppButton>
        </div>
      )}

      {isPrivate && codeSet && (
        <div className="flex flex-col gap-3" data-event-code-panel="">
          <div className="flex flex-col gap-1">
            <span className="text-label-md text-app-text">Event code</span>
            {code ? (
              <p
                id="event-code"
                data-event-code={code}
                className="text-heading-md text-app-text select-all"
              >
                {code}
              </p>
            ) : revealFailed ? (
              <InlineStatus variant="danger">Couldn&apos;t show the event code.</InlineStatus>
            ) : (
              <InlineStatus live>Getting your code…</InlineStatus>
            )}
          </div>
          {(code || revealFailed) && (
            <div className="flex flex-wrap gap-3">
              {code ? (
                <AppButton variant="secondary" size="sm" onClick={() => void copy()}>
                  Copy
                </AppButton>
              ) : (
                // A code that cannot be shown can still be replaced: `New code` needs no old one.
                <AppButton variant="secondary" size="sm" onClick={() => setRevealFailed(false)}>
                  Show code
                </AppButton>
              )}
              <AppButton
                variant="secondary"
                size="sm"
                pending={pending === "code"}
                disabled={pending !== null}
                onClick={() => void rotate()}
              >
                New code
              </AppButton>
            </div>
          )}
          <p className="text-body-sm text-app-text-secondary">
            Guests who open your shared link enter this code to see the invitation. Personal
            invitation links skip it.
          </p>
          {event.published && (
            <p className="text-body-sm text-app-text-secondary">
              A new code replaces this one straight away, so share it again with anyone who has the
              old one.
            </p>
          )}
        </div>
      )}

      {error && <InlineStatus variant="danger">{error}</InlineStatus>}
      {!error && notice && (
        <InlineStatus variant="success" live>
          {notice === "copied"
            ? "Code copied"
            : notice === "rotated"
              ? "New code made. The old one no longer works."
              : "Saved"}
        </InlineStatus>
      )}
    </fieldset>
  );
}
