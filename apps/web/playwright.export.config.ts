import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **exported diagram** (TECH_DEBT #164, W3-M2).
 *
 * No `VITE_` flag to pin (ADR-0088 D1), so it runs against the default bundle, which IS the
 * shipped surface. The pen is enforced at the API because the setup seeds activities and
 * recalculates through the real write path. Chromium only, serial.
 *
 * This suite exists because every export UNIT suite runs in jsdom, where `getComputedStyle`
 * yields nothing and the palette resolver takes its fallbacks — so those suites can only ever
 * exercise the branch that is correct, never the branch that ships. Only a real browser
 * producing a real download can see what the artefact actually contains.
 *
 * Its npm script deliberately omits `--pass-with-no-tests`, which every sibling carries. Those
 * suites are flag-gated and legitimately skip; this one has no flag, so "no tests ran" can only
 * mean a broken `testDir` — and passing on that is exactly the vacuous-gate shape this milestone
 * is about.
 */
export default defineConfig({
  testDir: './e2e-export',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-export' }]]
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
        // 1646 CSS px — the width this product is judged on (ADR-0091's retrospective made it
        // permanent in every canvas harness; M0's measurements were taken at it).
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
          },
        ],
      }),
});
