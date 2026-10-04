import { existsSync } from "node:fs";

import { chromium, type Browser } from "playwright-core";

/**
 * Chromium for the layout fixtures, through `playwright-core` (`docs/technology-decisions.md §8.2`:
 * a real browser at test time only). An explicit executable wins (`CARD_FIXTURES_CHROMIUM`, or the
 * e2e suite's `E2E_CHROMIUM`); then the preinstalled development browser; otherwise the browser
 * `npx playwright-core install chromium` put in Playwright's own cache (CI).
 */
const PREINSTALLED = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export function chromiumExecutable(): string | undefined {
  const explicit = process.env.CARD_FIXTURES_CHROMIUM ?? process.env.E2E_CHROMIUM;
  if (explicit) return explicit;
  return existsSync(PREINSTALLED) ? PREINSTALLED : undefined;
}

export function launchChromium(): Promise<Browser> {
  return chromium.launch({
    executablePath: chromiumExecutable(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
