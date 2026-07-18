import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **live cross-plan / programme scheduling** web surface
 * (`VITE_PROGRAMME_SCHEDULING`, inter-project M2, ADR-0045 F8).
 *
 * Serves the web bundle with `VITE_PROGRAMME_SCHEDULING=true` (plus `VITE_INTER_PROJECT_DATES=true`,
 * which it layers on — the "External" driven badge is the M1 surface's) so a planner can draw a live
 * cross-plan link and run a programme recalculate end-to-end. It runs on the **legacy stacked
 * plan-detail page** (canvas workspace + pen pinned OFF, matching the flags-off baseline suite) so the
 * journey stays simple: no pen dance, and the API's edit-lock enforcement is off by default, so the
 * cross-plan create needs no lock. Like the other flag-on suites the flags bake at `webServer` start,
 * so this is a separate config on the same ports; it runs as its own CI step. Chromium only.
 */
export default defineConfig({
  testDir: './e2e-programme',
  fullyParallel: false, // the journey creates two interdependent plans; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-programme' }]]
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
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // Programme scheduling ON (+ the M1 inter-project surface it layers on), on the legacy
            // stacked plan-detail page (canvas + pen off) so the journey is pen-free.
            env: {
              VITE_PROGRAMME_SCHEDULING: 'true',
              VITE_INTER_PROJECT_DATES: 'true',
              VITE_TSLD_EDITING: 'false',
              VITE_PLAN_EDIT_LOCK: 'false',
              VITE_CANVAS_WORKSPACE: 'false',
            },
          },
        ],
      }),
});
