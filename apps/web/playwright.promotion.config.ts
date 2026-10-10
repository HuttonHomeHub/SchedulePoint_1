import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for **the promotion ladder** (`docs/specs/toolbar-redesign/`, M5): the
 * journey that drives the real deck at the six stages the product is judged at, on both pointers,
 * and sweeps 1192-2600 for the SC-17 gap (`e2e-workspace-fit/promotion.spec.ts`).
 *
 * **Its own config because it is two minutes of a suite that was one.** The spec lives beside the
 * target-size sweep it grew out of, and `playwright.workspace-fit.config.ts` ignores it, but running
 * it as part of that step put ~125 s on a shard already at its budget (`scripts/e2e-durations.json`,
 * `pnpm check:e2e-roster` prints the packing). A separate script is a separate CI step, and a step is
 * what the roster places on a shard.
 *
 * No `VITE_` pins, for `playwright.workspace-chrome.config.ts`'s reason: a published image carries
 * every flag at its default, so the shipped surface IS the default surface. Chromium only (TECH_DEBT
 * #25a), serial: the fixture is expensive to build and the sweep is cheap.
 */
export default defineConfig({
  testDir: './e2e-workspace-fit',
  testMatch: 'promotion.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-promotion' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 1646 CSS px — the product owner's Surface Pro (2880×1920 at 175%), and the width every
        // measurement in this epic was taken at. The spec resizes from here.
        viewport: { width: 1646, height: 1097 },
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: [
          {
            command: 'pnpm --filter @repo/api exec nest start',
            url: 'http://localhost:3000/api/v1/health',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // **No `VITE_` pins**, for `playwright.workspace-chrome.config.ts`'s reason: a published
            // image carries every flag at its default (ADR-0088 D1), so the shipped surface IS the
            // default surface. Pinning them restates the defaults and quietly asserts that a
            // retired flag still exists — which `check:flags` caught once already.
          },
        ],
      }),
});
