import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for **sub-day durations and lags**
 * (ADR-0070) — the `d`/`h`/`m` grammar in the activity duration field and
 * the signed lag field, and the table read-outs that show them back.
 *
 * Everything this suite proves needs a **real API and a real database**: that a four-hour duration
 * is stored as 240 minutes and not as a third of a 24-hour day, that a bare number still converts on
 * the plan calendar's own day, that an unrelated edit does not flatten a sub-day value through the
 * full-definition PATCH, and that a lag switched to the 24-hour calendar is re-measured as elapsed
 * time. A mocked fetch can tell you none of that — it echoes whatever it was handed.
 *
 * Like the sibling configs the flags bake at `webServer` start, so this is its own config on
 * the same ports, run as its own CI step. Chromium only (TECH_DEBT #25a), serial (one org's plan is
 * mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-sub-day',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-sub-day' }]]
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
        viewport: { width: 1920, height: 1080 },
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
            // No flags pinned: the activities table and the Logic dialog are reachable without any
            // canvas layer, and the fewer flags a journey needs the fewer reasons it has to fail
            // for something it is not about. The tabbed editor is what every shipped bundle
            // contains, so that is the surface the duration field is proved on.
          },
        ],
      }),
});
