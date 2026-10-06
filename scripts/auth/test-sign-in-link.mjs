#!/usr/bin/env node
/**
 * A sign-in link for testing a preview deployment, without sending an email (the hosted
 * project's built-in mailer allows two emails an hour). The link opens `/auth/confirm`, which
 * verifies a one-time token hash exactly as an emailed link would, then claims the draft in that
 * browser like any sign-in (spec.md §7.2).
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/auth/test-sign-in-link.mjs <deployment-url> [email]
 *
 * Preview project only: production users sign in by email, never by a generated link. The email
 * defaults to a test host account, created on first use. The printed link is a credential for that
 * account: single-use, valid for the project's OTP lifetime (an hour), so share it only with the
 * person testing. The project's keys are read with the management token and never printed.
 */

import { createClient } from "@supabase/supabase-js";

// Node 22 strips types from .ts imports; the token is validated by the app's secret schema.
import { supabaseAccessToken } from "../../src/lib/env.ts";

/** The preview project (`docs/development-plan.md`, "Hosted databases"). Not a secret. */
const PREVIEW_REF = "ihdaifbyvlvivuctkrwn";
const DEFAULT_EMAIL = "host-test@example.com";

const [deployment, emailArg] = process.argv.slice(2);
let base;
try {
  base = new URL(deployment);
} catch {
  console.error("usage: test-sign-in-link.mjs <deployment-url> [email]");
  process.exit(2);
}
if (!["https:", "http:"].includes(base.protocol)) {
  console.error("The deployment URL must be http(s).");
  process.exit(2);
}
const email = (emailArg ?? DEFAULT_EMAIL).trim().toLowerCase();

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PREVIEW_REF}/api-keys?reveal=true`,
  {
    headers: { Authorization: `Bearer ${supabaseAccessToken()}` },
  },
);
if (!res.ok) {
  console.error(`could not read the preview project's API keys: HTTP ${res.status}`);
  process.exit(1);
}
const service = (await res.json()).find((k) => k.name === "service_role")?.api_key;
if (!service) {
  console.error("the preview project has no service_role key");
  process.exit(1);
}

const admin = createClient(`https://${PREVIEW_REF}.supabase.co`, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Create the account on first use; an existing one is fine.
const created = await admin.auth.admin.createUser({ email, email_confirm: true });
if (created.error && !/already/i.test(created.error.message)) {
  console.error(`could not create ${email}: ${created.error.message}`);
  process.exit(1);
}

const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const tokenHash = data?.properties?.hashed_token;
if (error || !tokenHash) {
  console.error(`could not make a link: ${error?.message ?? "no token returned"}`);
  process.exit(1);
}

const link = new URL("/auth/confirm", base.origin);
link.searchParams.set("token_hash", tokenHash);
link.searchParams.set("type", "magiclink");
console.log(link.toString());
