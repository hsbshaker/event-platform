"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithEmail, signInWithOAuth, type OAuthProvider } from "@/app/actions/auth";
import { AppButton } from "@/components/app/AppButton";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/app/Input";
import { InlineStatus } from "@/components/app/InlineStatus";

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
};

const ERROR_MESSAGE: Record<"provider" | "exchange" | "missing_code", string> = {
  provider: "That sign-in method had a problem. Try again, or use a different option below.",
  exchange: "We couldn't finish signing you in. Please try again.",
  missing_code: "That sign-in link looks incomplete. Please try again.",
};

function EmailSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <AppButton type="submit" variant="primary" size="lg" pending={pending} className="w-full">
      Send me a sign-in link
    </AppButton>
  );
}

export interface SignInFormProps {
  providers: OAuthProvider[];
  errorCode: "provider" | "exchange" | "missing_code" | null;
}

export function SignInForm({ providers, errorCode }: SignInFormProps) {
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleOAuth(provider: OAuthProvider) {
    setOauthError(null);
    setPendingProvider(provider);
    const result = await signInWithOAuth(provider);
    if (!result.ok) {
      setOauthError(result.error);
      setPendingProvider(null);
    }
    // On success `signInWithOAuth` redirects and this component unmounts.
  }

  async function handleEmailSubmit() {
    setEmailError(null);
    const result = await signInWithEmail(email);
    if (result.ok) {
      setSentTo(result.email);
    } else {
      setEmailError(result.error);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-(--width-narrow) flex-1 flex-col justify-center gap-8 px-4 py-16">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-heading-xl text-app-text">Your idea is ready.</h1>
        <p className="text-body-md text-app-text-secondary">
          Save it and we&apos;ll start creating your event.
        </p>
      </header>

      {errorCode && <InlineStatus variant="danger">{ERROR_MESSAGE[errorCode]}</InlineStatus>}

      {sentTo ? (
        <InlineStatus variant="success" live>
          {/* The draft lives in this browser's cookie, so a link opened elsewhere signs the
              person in but cannot restore what they wrote (spec.md §7.2). Say so before it
              happens rather than showing them an empty composer afterwards. */}
          Check your email — we sent a sign-in link to {sentTo}. Open it in this browser so we can
          keep the event you just described.
        </InlineStatus>
      ) : (
        <div className="flex flex-col gap-6 rounded-2xl border border-app-border bg-app-surface p-6 shadow-soft">
          {providers.length > 0 && (
            <div className="flex flex-col gap-3">
              {providers.map((provider) => (
                <AppButton
                  key={provider}
                  type="button"
                  variant="secondary"
                  size="lg"
                  pending={pendingProvider === provider}
                  disabled={pendingProvider !== null && pendingProvider !== provider}
                  onClick={() => void handleOAuth(provider)}
                >
                  {PROVIDER_LABEL[provider]}
                </AppButton>
              ))}
              {oauthError && <InlineStatus variant="danger">{oauthError}</InlineStatus>}
            </div>
          )}

          {providers.length > 0 && (
            <div className="flex items-center gap-3" role="separator" aria-label="or">
              <span className="h-px flex-1 bg-app-border" aria-hidden="true" />
              <span className="text-label-sm text-app-text-tertiary">OR</span>
              <span className="h-px flex-1 bg-app-border" aria-hidden="true" />
            </div>
          )}

          <form action={handleEmailSubmit} className="flex flex-col gap-4">
            <Field id="email" label="Email address" error={emailError ?? undefined} required>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              )}
            </Field>
            <EmailSubmitButton />
          </form>
        </div>
      )}

      <p className="text-center text-body-sm">
        <Link href="/" className="text-app-text-secondary underline-offset-2 hover:underline">
          ← Back to your idea
        </Link>
      </p>
    </div>
  );
}
