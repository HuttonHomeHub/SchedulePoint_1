import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **Notes** web surface (`VITE_NOTES`, Notes M3,
 * ADR-0046).
 *
 * Serves the web bundle with `VITE_NOTES=true` so a member can add, edit and delete notes on an
 * activity end-to-end, and see the per-row count badge track. It runs on the **legacy stacked
 * plan-detail page** (canvas workspace + pen pinned OFF, matching the flags-off baseline suite) so the
 * journey stays simple: no pen dance, and notes are not pen-gated anyway (ADR-0046). Like the other
 * flag-on suites the flags bake at `webServer` start, so this is a separate config on the same ports;
 * it runs as its own CI step. Chromium only.
 */
export default defineConfig({
  testDir: './e2e-notes',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-notes' }]]
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
            // Notes ON, on the legacy stacked plan-detail page (canvas + pen off) so the journey is
            // pen-free (notes are not pen-gated regardless — ADR-0046).
            env: {
              VITE_NOTES: 'true',
              VITE_TSLD_EDITING: 'false',
              VITE_PLAN_EDIT_LOCK: 'false',
              VITE_CANVAS_WORKSPACE: 'false',
            },
          },
        ],
      }),
});
