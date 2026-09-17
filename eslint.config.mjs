import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Import boundaries. All three are single `no-restricted-imports` rules, so they must be
 * composed per file group rather than layered: in flat config a later `files` group replaces the
 * rule for the files it matches, it does not merge the options.
 */

/** App/event styling boundary — `docs/design-system.md §23.7`. */
const EVENT_TOKENS = {
  group: ["**/styles/event-tokens.css", "@/styles/event-tokens.css"],
  message: "Event-renderer tokens must not be imported into app chrome (design-system.md §23.7).",
};
const APP_CHROME = {
  group: [
    "@/components/app/*",
    "**/components/app/*",
    "**/styles/app-tokens.css",
    "@/styles/app-tokens.css",
  ],
  message: "App chrome must not leak into the event renderer (design-system.md §23.7).",
};

/**
 * Library Boundary Invariant — `docs/event-renderer-system.md §7.1`, `CLAUDE.md §5.1`.
 *
 * The 26 legacy hero silhouettes and 13 section recipes are fixtures, not the creative space.
 * Production compiles any valid model-authored CompositionTree and never selects, matches,
 * ranks, schedules or maps one onto a fixture. So the library is unreachable from production
 * source by default — not merely from the renderer directories — and exactly two adapters are
 * exempted, each for one documented role and nothing else:
 *
 * - `src/lib/renderer/recovery/**` — the deterministic repair macros of §3 and the terminal
 *   fallback after the documented retry is exhausted;
 * - `src/lib/renderer/few-shot/**` — the rotated library examples the composition prompt carries
 *   (§4). Normal generation consumes the CompositionTrees this adapter returns; it never learns
 *   which fixtures they came from, and the adapter exposes no recipe, silhouette or template
 *   identifier that could become a candidate-choice variable.
 *
 * Keeping these separate matters: `recovery/**` must not become the generic place a module goes
 * to reach the library, which is what would happen if few-shot retrieval lived there too.
 *
 * Tests and tooling are outside this rule on purpose — regression and expressiveness fixtures and
 * signature calibration are permitted roles under §7.1.
 *
 * This is lint rather than convention because the failure it prevents is silent: a template
 * system rebuilt one convenient import at a time would still pass every other test.
 */
const LEGACY_LIBRARY = {
  group: [
    "@/lib/renderer/library",
    "@/lib/renderer/library/*",
    "**/renderer/library",
    "**/renderer/library/**",
    // `no-restricted-imports` matches the literal specifier, not a resolved path, so the
    // absolute and `**/renderer/library`-shaped spellings above miss the one a module *inside*
    // `src/lib/renderer/**` would naturally write. That is exactly the tree a "just grab a hero"
    // shortcut would live in, so the sibling-relative spellings are named explicitly.
    "./library",
    "./library/**",
    "../library",
    "../library/**",
    "../../library",
    "../../library/**",
    "../../../library",
    "../../../library/**",
    "**/proof-b/library*",
    "**/proof-a1/*",
  ],
  message:
    "The legacy fixture library is not reachable from production source (event-renderer-system.md §7.1). Its two documented roles have their own adapters: repair macros and the terminal fallback in src/lib/renderer/recovery/**, rotated few-shot examples in src/lib/renderer/few-shot/**. Consume what an adapter returns; never import, enumerate, rank, match, schedule or select from the library itself.",
};

/**
 * Service-role boundary — `AGENTS.md`, "Supabase clients".
 *
 * `admin.ts` bypasses RLS, so the rule is that it is reached "only after the caller has been
 * authorized ... and only for server-managed tables". That is a property of a handful of
 * modules, each of which establishes its own boundary first: an authenticated session, a
 * `CRON_SECRET`, the pre-auth draft cookie resolved to its stored hash, or — for the public
 * survey — a server-issued reviewer capability resolved before the write.
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
 * - `src/lib/human-test/store.ts` — the Human Test #1 survey, scoped by a server-issued reviewer
 *   capability the route resolves before calling it.
 * - `src/app/auth/callback/route.ts` — runs after the session is established.
 * - `src/app/api/cron/purge-pre-auth/route.ts` — gated on `CRON_SECRET`, 404 without it.
 * - `src/app/actions/event-identity.ts` — every export authorizes first. The three that reach
 *   EventIdentity go through `startEventIdentity` / `readEventIdentity`, which call
 *   `requireEventAccess` before anything else; the one that writes a clarification answer does
 *   **not** use this client at all, because that row is host input and `answered_by` must be a
 *   fact the database established under the host's own session. The service role is needed only
 *   because the claims table is server-only with RLS on and no policies.
 * - `src/app/api/cron/identity-housekeeping/route.ts` — the same `CRON_SECRET` gate. It releases
 *   and recovers EventIdentity call claims and ages out paid-response evidence, all of which live
 *   on server-only tables with RLS on and no policies, so there is no end-user path to reach them
 *   through.
 */
const SERVICE_ROLE_CALLERS = [
  "src/lib/auth/rate-limit.ts",
  "src/lib/drafts/**",
  "src/lib/human-test/store.ts",
  "src/app/actions/event-identity.ts",
  "src/app/auth/callback/route.ts",
  "src/app/api/cron/purge-pre-auth/route.ts",
  "src/app/api/cron/identity-housekeeping/route.ts",
];

const restricted = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

const boundaryRules = [
  // The library and the service role are off-limits everywhere under src/ ...
  { files: ["src/**"], rules: restricted(LEGACY_LIBRARY, SERVICE_ROLE) },
  {
    files: ["src/components/app/**", "src/app/**"],
    rules: restricted(LEGACY_LIBRARY, SERVICE_ROLE, EVENT_TOKENS),
  },
  {
    files: ["src/components/event-renderer/**"],
    rules: restricted(LEGACY_LIBRARY, SERVICE_ROLE, APP_CHROME),
  },
  // ... except that the modules above have earned the service role, and keep every other rule.
  {
    files: SERVICE_ROLE_CALLERS,
    rules: restricted(LEGACY_LIBRARY, EVENT_TOKENS),
  },
  // ... and except in the two adapters, and in the tests that are a permitted role under §7.1.
  {
    files: ["src/lib/renderer/recovery/**", "src/lib/renderer/few-shot/**", "src/**/*.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
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
    "proof-b/**",
    "proof-a1/**",
    "docs/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
export { SERVICE_ROLE_CALLERS };
