import { enabledOAuthProviders } from "@/app/actions/auth";
import { SignInForm } from "./SignInForm";

/**
 * Auth/save (spec.md §7.2 step 4, docs/design-system.md §4.2, docs/screen-spec.md
 * `auth-save`, e2e H02). Google/Apple/email only — no profile wizard, nothing else on the
 * page. The draft cookie itself is untouched here; it is what survives the redirect.
 */

const KNOWN_ERRORS = ["provider", "exchange", "missing_code"] as const;
type AuthErrorCode = (typeof KNOWN_ERRORS)[number];

function errorCodeFrom(value: string | undefined): AuthErrorCode | null {
  return (KNOWN_ERRORS as readonly string[]).includes(value ?? "")
    ? (value as AuthErrorCode)
    : null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [providers, params] = await Promise.all([enabledOAuthProviders(), searchParams]);
  return <SignInForm providers={providers} errorCode={errorCodeFrom(params.error)} />;
}
