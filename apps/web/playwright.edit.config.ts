import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration — the on-canvas editing surface and the pen.
 *
 * The editing journeys need an API with `PLAN_EDIT_LOCK_ENFORCED=true`, so the pen is really
 * required and structural writes 423 a non-holder. Because Playwright's `webServer` bakes env vars
 * at start and is global to a config, that can't live in the same config as the base run — hence
 * this second one. It runs as a **separate CI step** on the same ports; Playwright tears down the
 * base servers before this invocation starts fresh ones (TECH_DEBT #25b/#27b).
 *
 * Chromium only for now — the flag-off suite already carries firefox/webkit, and the
 * cross-browser `Alt+←/→` history-suppression check stays a manual pre-enablement
 * step (TECH_DEBT #25a, relates to #1).
 */
export default defineConfig({
  testDir: './e2e-edit',
  fullyParallel: false, // the editing journeys mutate a shared plan; keep them serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-edit' }]]
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
        // 1280 × 800, not Playwright's 1280 × 720: at 720 the workspace body (573) is under the
        // short-body line (599), so Expand would hide the diagram these journeys then drive
        // (ADR-0180; docs/specs/short-screen-vertical-budget/m0-measurement.md §3).
        viewport: { width: 1280, height: 800 },
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
            // Enforce the pen at the API so a non-holder write really 423s (the whole
            // point of the flag-on journey). LOG_LEVEL silent keeps CI output clean.
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
