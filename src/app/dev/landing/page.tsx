import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { LandingView } from "@/app/LandingView";

/**
 * Development-only fixture for the landing page (`docs/screen-spec.md` `landing-composer`): the
 * real `LandingView` for a signed-in visitor, which the e2e app cannot produce without a database.
 * 404 unless ENABLE_DEV_FIXTURES=1, read at request time.
 *
 * - `?state=signed-in|no-email|signed-out` (default `signed-in`);
 * - `&email=…`: the signed-in address (default `host@example.com`).
 * `Sign out` is the real action; with no session it simply returns to the landing page.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LandingFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.ENABLE_DEV_FIXTURES !== "1") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);

  const state = one("state") ?? "signed-in";
  const accounts = {
    "signed-in": { email: one("email") ?? "host@example.com" },
    "no-email": { email: null },
    "signed-out": null,
  } as const;
  if (!(state in accounts)) notFound();

  return (
    <LandingView
      state={{ prompt: "", inspiration: [], expiresAt: null }}
      restoreNotice={null}
      account={accounts[state as keyof typeof accounts]}
    />
  );
}
