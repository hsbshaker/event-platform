import type { NextConfig } from "next";

/**
 * File tracing for the geometry-verification runtime.
 *
 * Two sets, keyed differently on purpose.
 *
 * **The browser packages** are traced *whole*. Both read files by path at runtime that static
 * tracing does not see — the compressed Chromium archives, `playwright-core/browsers.json`, its
 * bundled driver scripts — and the Phase 0 spike's first deployed invocation failed with "Cannot
 * find module" for exactly that reason (`docs/spike/README.md`, "Packaging finding"). Listing
 * individual files inside these packages is the regression; never do it.
 *
 * They are keyed per route rather than globally because they cost ~81 MB, and a function that
 * never launches a browser should not carry Chromium: on Fluid compute that is bundle bytes on
 * every cold start, and the landing page is the most latency-sensitive surface the product has.
 * **Any route or server action that calls `verifyGeometry` must add its own key spreading
 * `GEOMETRY_BROWSER_PACKAGES`.** Forgetting to is not silent — `src/lib/renderer/verify/browser.ts`
 * turns the failed import into an explicit `infrastructure` verification failure rather than a
 * measurement — but it is still a broken deploy, so add the key with the route.
 *
 * **A server action's key is its page's route, not a path of its own.** These keys are matched
 * against the normalized app route of every built entry (`build/collect-build-traces.ts`), and a
 * server action has no entry of its own: it is compiled into the page whose client component
 * imports it, and it is invoked by POSTing to that page's own URL. So the function that executes
 * `startConceptGenerationForEvent` — and therefore `after()` → `runConceptBatch` →
 * `compileConcept` → `verifyGeometry` — is the one built for `/events/[id]/create`, which
 * `.next/server/app-paths-manifest.json` names exactly that way. Its `maxDuration` lives in the
 * same place, in that page's segment config.
 *
 * **A dynamic segment's brackets must be escaped, and getting that wrong fails silently.** These
 * keys are globs, so an unescaped `[id]` is a character class — "one of i or d" — and matches no
 * route at all. Nothing warns: the build succeeds, the page renders, and the function ships
 * without Chromium. Measured on this repository, with the three spellings built in turn: the
 * traced file list for `/events/[id]/create` carries `@sparticuz/chromium/bin/chromium.br` under
 * the escaped spelling below, and under a single-wildcard segment in place of `[id]`, and does
 * **not** under the bare `"/events/[id]/create"`. The escaped form is the one used, because it
 * names one route rather than a shape of route. **To check a key after changing one**, build and
 * look for that `.br` file in
 * `.next/server/app/<route>/page.js.nft.json`; six chromium entries means only the static trace
 * found the package, twenty-one means this include applied.
 *
 * **The renderer assets** are traced globally. `src/lib/renderer/verify/html.ts` reads the event
 * stylesheet and the woff2 files from disk at render time (`process.cwd()`-relative: server code is
 * bundled, so a module URL would point at a chunk), and a missing font is an infrastructure failure
 * by design rather than a silent fall back to system typography. They are ~2 MB, they belong to the
 * renderer rather than to one route, and they are the half most likely to be missed — no
 * package-level intuition covers a stylesheet and a font directory — so the cheap, wide key is the
 * right one for them.
 */
const GEOMETRY_BROWSER_PACKAGES = [
  "./node_modules/@sparticuz/chromium/**",
  "./node_modules/playwright-core/**",
  // `verify/html.ts` loads `react-dom/server.node` through `createRequire` at runtime, because
  // inside the App Router graph the `react-server` export condition resolves it to a build with no
  // `renderToStaticMarkup`. A runtime require is invisible to static tracing, so trace it here.
  "./node_modules/react-dom/**",
];

const EVENT_RENDERER_ASSETS = ["./src/styles/event-tokens.css", "./public/fonts/event/**"];

/**
 * The Human Test #1 reviewer survey is a static page under `public/human-test-1/`, published
 * from `docs/human-test-1/` by `scripts/human-test/publish-review.mjs`. This makes it reachable
 * as one clean link a reviewer can be sent — `/human-test-1` — without a second copy of the
 * questionnaire living in the app. Deliberately a redirect rather than a rewrite: the page loads
 * its sheets with relative `src="sheets/..."`, so the browser must end up on the real path for
 * them to resolve. Temporary (307) rather than permanent, because nothing should cache this into
 * a reviewer's browser past the test.
 */
const HUMAN_TEST_1_SURVEY = {
  source: "/human-test-1",
  destination: "/human-test-1/review.html",
  permanent: false,
};

const nextConfig: NextConfig = {
  // Serverless Chromium ships native binaries; keep both packages out of the bundler
  // and make sure the compressed browser archives are traced into the function.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/spike/geometry": [...GEOMETRY_BROWSER_PACKAGES, "./src/spike/fixture.generated.html"],
    // The deployed proof that the finished verifier runs on this runtime. Needs the browser
    // packages for the same reason the spike does.
    "/api/internal/verify-geometry": [...GEOMETRY_BROWSER_PACKAGES],
    // The generation surface. `GenerationPanel` calls the `startConceptGenerationForEvent` server
    // action, which schedules `runConceptBatch` with `after()`; that reaches `verifyGeometry` for
    // every one of the batch's three concepts, in the same function that served this page.
    "/events/\\[id\\]/create": [...GEOMETRY_BROWSER_PACKAGES],
    "/**": EVENT_RENDERER_ASSETS,
  },
  redirects: async () => [HUMAN_TEST_1_SURVEY],
};

export default nextConfig;
