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
 * - `src/lib/ai/generations.server.ts` — begins a generation only through `start_generation`,
 *   for the signed-in session's collaborator (`requireEventAccess`); the function refuses any
 *   user who is not the event's owner or a co-host. Touches only the server-only generation
 *   tables and counters.
 * - `src/lib/ai/meter.server.ts` — the spend ledger and model-call telemetry, both server-only;
 *   it acts only while the generation it names is running for its event (`heartbeat_generation`)
 *   and refuses a context that names none. It does not itself re-check the user.
 * - `src/lib/generation/run.server.ts` — runs one generation that `startGeneration` began for an
 *   authorized collaborator, and only while it is running for its event: it refuses a generation
 *   not requested by the user it is given, reads that event's own rows and inspiration, and
 *   writes only through the generation functions that write nothing once the generation stopped
 *   running (`record_event_identity`, `record_generation_stage`, `persist_generated_card`,
 *   `fail_generation`) and to its own key in the private `card-art` bucket.
 * - `src/lib/generation/status.server.ts` — reads the server-only `generations` table after
 *   `requireEventAccess(eventId, "view_event")`, for that event only, returning no telemetry.
 * - `src/lib/generation/reveal.server.ts` — reads a design of the event (the active one by
 *   default), its artwork and ink after `requireEventAccess(eventId, "view_event")`, for that event
 *   only, and signs a short-lived URL for that artwork in the private `card-art` bucket; returns no
 *   storage key, raw output, telemetry or cost, and writes nothing.
 * - `src/lib/generation/choose.server.ts` — makes a design the event's active one only through
 *   `choose_card_design`, after `requireEventAccess(eventId, "view_event")` and the pre-publish
 *   `choose_design` capability, for the session's own collaborator; the function checks membership
 *   and publish again under the event's lock, and touches only that event's active design.
 */
const SERVICE_ROLE_CALLERS = [
  "src/lib/auth/rate-limit.ts",
  "src/lib/drafts/**",
  "src/app/auth/callback/route.ts",
  "src/app/api/cron/purge-pre-auth/route.ts",
  "src/lib/ai/generations.server.ts",
  "src/lib/ai/meter.server.ts",
  "src/lib/generation/run.server.ts",
  "src/lib/generation/status.server.ts",
  "src/lib/generation/reveal.server.ts",
  "src/lib/generation/choose.server.ts",
];

/**
 * App / card / page boundary — `docs/design-system.md §15.1`, `§23.7`.
 *
 * App chrome (`src/components/app`) and the routes and pages (`src/app`, which hold the house-style
 * guest page) render the card only through `InvitationCard`'s data-in props. They never import the
 * card fonts or the card renderer's internals, so card styling cannot leak into app chrome or the
 * page, and the renderer's internals can change without touching them.
 */
const CARD_RENDERER = {
  group: [
    "**/card-fonts.css",
    "@/components/card/**",
    "**/components/card/**",
    "!@/components/card/InvitationCard",
    "!**/components/card/InvitationCard",
  ],
  message:
    "App chrome and the guest page take no card styling (design-system.md §15.1, §23.7): render the card through @/components/card/InvitationCard only, and never import card-fonts.css or the card renderer's internals.",
};

/**
 * From `src/components/app`, the renderer is a sibling directory: `../card/...`, or `../../card/...`
 * and so on from folders nested inside app chrome.
 */
const CARD_RENDERER_SIBLING = {
  group: [
    "../card/**",
    "../../card/**",
    "../../../card/**",
    "!../card/InvitationCard",
    "!../../card/InvitationCard",
    "!../../../card/InvitationCard",
  ],
  message: CARD_RENDERER.message,
};

/**
 * The other direction (`design-system.md §23.7`, "the card renderer does not consume app component
 * styling"): the card renderer imports no app component, app tokens or global app styles.
 */
const APP_STYLING = {
  group: [
    "@/components/app/**",
    "**/components/app/**",
    "../app/**",
    "**/app-tokens.css",
    "**/globals.css",
  ],
  message:
    "The card renderer takes no app styling (design-system.md §15.1, §23.7): no app components, app tokens or global app styles inside the card.",
};

const CARD_BOUNDARY_FILES = ["src/app/**", "src/components/app/**"];

const restricted = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

// One rule, several boundaries: a later block replaces an earlier block's options for the same
// files, so each block lists every boundary that applies to its files.
const boundaryRules = [
  // The service role is off-limits everywhere under src/ ...
  { files: ["src/**"], rules: restricted(SERVICE_ROLE) },
  // ... and app chrome and the pages also stay on their side of the card boundary ...
  { files: ["src/app/**"], rules: restricted(SERVICE_ROLE, CARD_RENDERER) },
  {
    files: ["src/components/app/**"],
    rules: restricted(SERVICE_ROLE, CARD_RENDERER, CARD_RENDERER_SIBLING),
  },
  // ... and the card renderer stays on its own side too.
  { files: ["src/components/card/**"], rules: restricted(SERVICE_ROLE, APP_STYLING) },
  // ... except that the modules above have earned the service role,
  { files: SERVICE_ROLE_CALLERS, rules: { "no-restricted-imports": "off" } },
  // though not an exemption from the card boundary.
  {
    files: SERVICE_ROLE_CALLERS.filter((file) =>
      CARD_BOUNDARY_FILES.some((dir) => file.startsWith(dir.slice(0, -2))),
    ),
    rules: restricted(CARD_RENDERER),
  },
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
export { CARD_BOUNDARY_FILES, SERVICE_ROLE_CALLERS };
