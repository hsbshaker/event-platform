"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { createEvent, saveDraft, type ComposerState } from "@/app/actions/draft";
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
 * click landing.
 */

const LOCAL_STORAGE_KEY = "event-platform:composer-prompt";
const AUTOSAVE_DEBOUNCE_MS = 800;
const MAX_FILES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

type InspirationItem = ComposerState["inspiration"][number];
type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface LandingComposerProps {
  initialState: ComposerState;
  /** From `?restore=expired|taken` — a restore failure that must never silently drop input. */
  restoreNotice: "expired" | "taken" | null;
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
      Create my event ✦
    </AppButton>
  );
}

export function LandingComposer({ initialState, restoreNotice }: LandingComposerProps) {
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

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setPrompt(event.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persistPrompt();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void persistPrompt();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    if (inspiration.length + selected.length > MAX_FILES) {
      setUploadError(`You can add up to ${MAX_FILES} images.`);
      return;
    }
    for (const file of selected) {
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        setUploadError("Add a PNG, JPEG, WebP or HEIC image.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setUploadError("Images must be 10 MB or smaller.");
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
    setInspiration((prev) => prev.filter((item) => item.id !== id));
    try {
      await fetch(`/api/inspiration?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // The thumbnail is already gone locally; a failed cleanup call is not worth surfacing.
    }
  }

  async function handleCreate() {
    setCreateError(null);
    const result = await createEvent(prompt);
    if (!result.ok) setCreateError(result.error);
    // On success `createEvent` redirects and this component unmounts.
  }

  return (
    <div className="mx-auto flex w-full max-w-(--width-standard) flex-1 flex-col justify-center gap-8 px-4 py-12 sm:py-16">
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-display-md text-app-text">
          Describe your event. We create the whole experience.
        </h1>
      </header>

      {restoreNotice && (
        <InlineStatus variant="warning" live>
          We couldn&apos;t restore your saved idea from before
          {restoreNotice === "taken" ? " — that draft was already used" : " — it had expired"}. Your
          text below is safe; look it over and continue.
        </InlineStatus>
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
                  accept={ALLOWED_MIME_TYPES.join(",")}
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
                  onRetry={() => void persistPrompt()}
                />
              </div>
              <SubmitButton disabled={!prompt.trim()} />
            </>
          }
        />
        {createError && <InlineStatus variant="danger">{createError}</InlineStatus>}
      </form>

      <p className="text-center text-body-sm text-app-text-tertiary">
        Free to create · No templates · Publish when ready
      </p>
    </div>
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
