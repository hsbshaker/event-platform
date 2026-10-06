"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { signOut } from "@/app/actions/auth";
import { createEvent, saveDraft, type ComposerState } from "@/app/actions/draft";
import { convertHeicToJpeg, HeicDecodeError, isHeicFile } from "@/lib/drafts/heic-to-jpeg";
import { AppButton } from "./AppButton";
import { IconButton } from "./IconButton";
import { InlineStatus } from "./InlineStatus";
import { PromptComposer } from "./PromptComposer";

/**
 * Landing composer (spec.md §7.1, docs/screen-spec.md `landing-composer`, e2e H01).
 *
 * The composer is the hero: no template gallery, no signup step, no theme picker. Typing
 * mirrors into localStorage as a safety net (spec.md §7.2 step 3 / client state) and the
 * prompt autosaves to the server on a debounce and on blur so nothing depends on the submit
 * click landing. The mirror is preserved through `?restore=expired|taken` (the local copy
 * is the only surviving copy of the host's text) and is cleared only once the draft has
 * been claimed into an event, from `DetailsForm` on the create page.
 *
 * Signed in, it says whose account Create puts the idea in, with a way out (`SignedInAs`).
 */

/** Exported so the create-event page can clear this mirror once a draft is claimed. */
export const LOCAL_STORAGE_KEY = "event-platform:composer-prompt";
const AUTOSAVE_DEBOUNCE_MS = 800;
const MAX_FILES = 6;
// Mirrors MAX_FILE_BYTES in src/lib/drafts/inspiration.ts, which is server-only and cannot be
// imported here. The server rejects anything larger regardless; this only saves a round trip.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
// HEIC/HEIF may be picked (Safari decodes them) but are converted to JPEG before upload.
const ACCEPT_ATTRIBUTE = [...ALLOWED_MIME_TYPES, "image/heic", "image/heif", ".heic", ".heif"].join(
  ",",
);

type InspirationItem = ComposerState["inspiration"][number];
type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Who is signed in, when someone is. Apple and Google sign-ins carry an address; others may not. */
export interface LandingAccount {
  email: string | null;
}

export interface LandingComposerProps {
  initialState: ComposerState;
  /** From `?restore=expired|taken` — a restore failure that must never silently drop input. */
  restoreNotice: "expired" | "taken" | null;
  account: LandingAccount | null;
}

function readLocalPrompt(): string {
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLocalPrompt(value: string): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, value);
  } catch {
    // Best-effort only: the server-side draft is the real safety net.
  }
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <AppButton
      type="submit"
      variant="primary"
      size="lg"
      pending={pending}
      disabled={disabled || pending}
      className="w-full sm:w-auto"
    >
      Create my invitation ✦
    </AppButton>
  );
}

export function LandingComposer({ initialState, restoreNotice, account }: LandingComposerProps) {
  const [prompt, setPrompt] = useState(initialState.prompt);
  const [inspiration, setInspiration] = useState<InspirationItem[]>(initialState.inspiration);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptRef = useRef(prompt);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Serializes every autosave (debounce + blur) behind a single chain, so at most one save is
  // ever in flight and each queued save reads the prompt at the moment it actually runs — never
  // a stale snapshot captured when it was scheduled. `Create my invitation` awaits this chain before
  // sending its own authoritative save, so an older autosave can never land after and overwrite
  // the prompt the visitor just submitted (spec.md §7.2).
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  // Restore from localStorage whenever the server had nothing to give us back — either a
  // first visit, or a restore failure after auth (`?restore=expired|taken`). This is a
  // one-time bootstrap from a browser-only external store (unavailable during SSR, so it
  // cannot be done as a lazy `useState` initializer without a server/client mismatch).
  useEffect(() => {
    if (!initialState.prompt) {
      const saved = readLocalPrompt();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage restore
      if (saved) setPrompt(saved);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror every keystroke into localStorage once the restore attempt above has settled, so a
  // second restore failure always has this browser's own copy to fall back to.
  useEffect(() => {
    if (!hydrated) return;
    writeLocalPrompt(prompt);
  }, [prompt, hydrated]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function persistPrompt() {
    const value = promptRef.current.trim();
    if (!value) {
      setSaveStatus("idle");
      return;
    }
    setSaveStatus("saving");
    try {
      const result = await saveDraft(value);
      if (result.ok) {
        setSaveStatus("saved");
        setSaveError(null);
      } else {
        setSaveStatus("error");
        setSaveError(result.error);
      }
    } catch {
      setSaveStatus("error");
      setSaveError("Couldn't save — check your connection.");
    }
  }

  /** Queues an autosave behind whatever is already in flight or queued; never overtakes it. */
  function queueAutosave(): Promise<void> {
    const next = saveChainRef.current.then(persistPrompt, persistPrompt);
    saveChainRef.current = next;
    return next;
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setPrompt(event.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void queueAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void queueAutosave();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    if (inspiration.length + selected.length > MAX_FILES) {
      setUploadError(`You can add up to ${MAX_FILES} images.`);
      return;
    }
    for (const original of selected) {
      let file = original;
      if (isHeicFile(original)) {
        try {
          file = await convertHeicToJpeg(original);
        } catch (error) {
          setUploadError(
            error instanceof HeicDecodeError ? error.message : "Could not add that image.",
          );
          continue;
        }
      }
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        setUploadError("Add a PNG, JPEG or WebP image.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setUploadError(`Images must be ${MAX_FILE_BYTES / (1024 * 1024)} MB or smaller.`);
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/inspiration", { method: "POST", body: form });
        const body = (await response.json()) as { inspiration?: InspirationItem; error?: string };
        if (!response.ok || !body.inspiration) {
          setUploadError(body.error ?? "Could not add that image.");
          continue;
        }
        setInspiration((prev) => [...prev, body.inspiration as InspirationItem]);
        setUploadError(null);
      } catch {
        setUploadError("Could not add that image. Check your connection.");
      }
    }
  }

  async function handleRemoveInspiration(id: string) {
    const removedIndex = inspiration.findIndex((item) => item.id === id);
    const removed = removedIndex >= 0 ? inspiration[removedIndex] : undefined;
    setInspiration((prev) => prev.filter((item) => item.id !== id));

    function restore() {
      if (!removed) return;
      setInspiration((prev) => {
        const next = [...prev];
        next.splice(Math.min(removedIndex, next.length), 0, removed);
        return next;
      });
      setUploadError("Could not remove that image. Try again.");
    }

    try {
      const response = await fetch(`/api/inspiration?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        restore();
        return;
      }
      setUploadError(null);
    } catch {
      restore();
    }
  }

  async function handleCreate() {
    setCreateError(null);
    // Cancel any scheduled autosave — its stale snapshot must never be the last write — and
    // wait for whatever is already in flight or queued to finish before sending our own,
    // authoritative save with the current text, so it is always the final write (spec.md §7.2).
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await saveChainRef.current;
    const result = await createEvent(prompt);
    if (!result.ok) setCreateError(result.error);
    // On success `createEvent` redirects and this component unmounts.
  }

  return (
    <div className="relative mx-auto flex w-full max-w-(--width-standard) flex-col gap-6 px-4 pb-16 pt-4 lg:pt-36">
      <header className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-display-hero text-balance text-dusk-text">
          Describe your event. Watch it light up.
        </h1>
        <p className="max-w-(--width-narrow) text-body-lg text-dusk-text-secondary">
          One invitation card, designed from your words and delivered in an envelope your guests
          open.
        </p>
      </header>

      {account && <SignedInAs email={account.email} />}

      {restoreNotice && (
        // Status text needs light paper behind it: its colours are set for light surfaces (§5.3).
        <div className="surface-lit rounded-xl px-4 py-3">
          <InlineStatus variant="warning" live>
            We couldn&apos;t restore your saved idea from before
            {restoreNotice === "taken" ? " — that draft was already used" : " — it had expired"}.
            Your text below is safe; look it over and continue.
          </InlineStatus>
        </div>
      )}

      <form action={handleCreate} className="flex flex-col gap-3">
        <PromptComposer
          id="prompt"
          label="Describe your event"
          value={prompt}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Tell us who this is for, the vibe you want, and anything that matters to you…"
          attachments={
            <div className="flex flex-col gap-2">
              {inspiration.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Inspiration images">
                  {inspiration.map((item) => (
                    <li key={item.id} className="relative">
                      {item.url ? (
                        // Signed, short-lived thumbnail preview; never a public URL (§27).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt=""
                          className="h-16 w-16 rounded-lg border border-app-border object-cover"
                        />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-app-border bg-app-surface-muted text-body-sm text-app-text-tertiary">
                          Image
                        </span>
                      )}
                      <IconButton
                        type="button"
                        label="Remove this inspiration image"
                        onClick={() => void handleRemoveInspiration(item.id)}
                        className="absolute -right-5 -top-5 border border-app-border bg-app-surface shadow-soft"
                      >
                        <span aria-hidden="true">×</span>
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
              {uploadError && <InlineStatus variant="danger">{uploadError}</InlineStatus>}
            </div>
          }
          actions={
            <>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  multiple
                  hidden
                  onChange={(event) => {
                    void handleFilesSelected(event.target.files);
                    event.target.value = "";
                  }}
                />
                <AppButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => fileInputRef.current?.click()}
                >
                  + Add inspiration
                </AppButton>
                <SaveIndicator
                  status={saveStatus}
                  error={saveError}
                  onRetry={() => void queueAutosave()}
                />
              </div>
              <SubmitButton disabled={!prompt.trim()} />
            </>
          }
        />
        {createError && (
          <div className="surface-lit rounded-xl px-4 py-3">
            <InlineStatus variant="danger">{createError}</InlineStatus>
          </div>
        )}
      </form>

      <p className="text-center text-body-sm text-dusk-text-secondary">
        Free to create · No templates · Publish when ready
      </p>
    </div>
  );
}

/**
 * Whose account Create uses (spec.md §7.1). A sign-in link works in any browser
 * (`/auth/confirm`), so a browser can be signed in by someone else's link. The full address,
 * never truncated, sits just above the composer, so it is on screen whenever Create is, at every
 * width, and the person can leave before their idea goes into that account. Its own form: it
 * must never submit the composer's.
 */
function SignedInAs({ email }: { email: string | null }) {
  return (
    <form
      action={signOut}
      data-signed-in-as=""
      className="flex flex-wrap items-center justify-center gap-x-1 text-center text-body-sm text-dusk-text-secondary"
    >
      <p className="min-w-0 wrap-anywhere">
        {email ? (
          <>
            Creating as <span className="text-dusk-text">{email}</span>. Not you?
          </>
        ) : (
          "You’re signed in. Not you?"
        )}
      </p>
      <SignOutButton />
    </form>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // min-h/min-w keep the touch target at 44px on phones (design-system §7.6).
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-dusk-text underline underline-offset-2 disabled:opacity-60"
    >
      Sign out
    </button>
  );
}

function SaveIndicator({
  status,
  error,
  onRetry,
}: {
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <InlineStatus variant="info" live>
        Saving…
      </InlineStatus>
    );
  }
  if (status === "saved") {
    return <InlineStatus variant="success">Saved</InlineStatus>;
  }
  return (
    <button
      type="button"
      onClick={onRetry}
      className="text-left text-body-sm text-app-danger underline-offset-2 hover:underline"
    >
      {error ?? "Couldn't save"} — retry
    </button>
  );
}
