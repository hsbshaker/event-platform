import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Service-role boundary — `AGENTS.md`, "Supabase clients".
 *
 * `admin.ts` bypasses RLS, so the rule is that it is reached "only after the caller has been
 * authorized ... and only for server-managed tables". That is a property of a handful of
 * modules, each of which establishes its own boundary first: an authenticated session, a
 * `CRON_SECRET`, the pre-auth draft cookie resolved to its stored hash.
 *
 * Lint rather than review, because the failure is quiet and one import wide: a new public route
 * that reaches for the service role reads exactly like the ones that are allowed to, and nothing
 * else in the build would notice. Adding a module to `SERVICE_ROLE_CALLERS` is the deliberate
 * act; `tests/unit/service-role-boundary.test.ts` fails if the allowlist and reality drift apart,
 * so the exemption cannot be granted quietly either.
 */
const SERVICE_ROLE = {
  group: [
    "@/lib/supabase/admin",
    "**/supabase/admin",
    "./admin",
    "../admin",
    "../supabase/admin",
    "../../supabase/admin",
    "../../../supabase/admin",
  ],
  message:
    "The service-role client bypasses RLS and is reachable only after the caller has been authorized (AGENTS.md, 'Supabase clients'). If a new module genuinely needs it, establish its authorization boundary first and add it to SERVICE_ROLE_CALLERS in eslint.config.mjs and to tests/unit/service-role-boundary.test.ts.",
};

/**
 * The modules allowed to reach the service role, each with the boundary that earns it:
 *
 * - `src/lib/auth/rate-limit.ts` — the counters table is server-only and has no user-facing
 *   read; the limiter is itself part of what authorizes everything else.
 * - `src/lib/drafts/**` — an anonymous visitor's pre-auth draft, scoped by the opaque `ep_draft`
 *   cookie resolved to its stored hash before any query.
 * - `src/app/auth/callback/route.ts` — runs after the session is established.
 * - `src/app/api/cron/purge-pre-auth/route.ts` — gated on `CRON_SECRET`, 404 without it.
 */
const SERVICE_ROLE_CALLERS = [
  "src/lib/auth/rate-limit.ts",
  "src/lib/drafts/**",
  "src/app/auth/callback/route.ts",
  "src/app/api/cron/purge-pre-auth/route.ts",
];

const restricted = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

const boundaryRules = [
  // The service role is off-limits everywhere under src/ ...
  { files: ["src/**"], rules: restricted(SERVICE_ROLE) },
  // ... except that the modules above have earned it.
  { files: SERVICE_ROLE_CALLERS, rules: { "no-restricted-imports": "off" } },
  // Tests are outside the rule.
  { files: ["src/**/*.test.ts"], rules: { "no-restricted-imports": "off" } },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaryRules,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "docs/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
export { SERVICE_ROLE_CALLERS };
