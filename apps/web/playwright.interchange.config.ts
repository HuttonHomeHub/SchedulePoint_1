import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **schedule interchange (XER import)**
 * (`VITE_SCHEDULE_INTERCHANGE`, Stage C2 M1, ADR-0050, `docs/specs/schedule-interchange/`) — the
 * project plan-create surface's "Import from file…" review dialog (dry-run → report → confirm →
 * commit), landing on the newly created plan. Serves the web bundle with
 * `VITE_SCHEDULE_INTERCHANGE=true` plus the canvas-first plan-workspace layers the payoff (opening the
 * committed plan) lands on (canvas authoring → toolbar → workspace → editing surface + pen; both on by
 * default already, pinned here explicitly for clarity — mirrors the on-canvas activity types / resource
 * view suites). Like the other flag-on configs the flags bake at `webServer` start, so this is a
 * separate config on the same ports; it runs as its own CI step after the prior suites tear down.
 * Chromium only (TECH_DEBT #25a).
 */
export default defineConfig({
  testDir: './e2e-interchange',
  fullyParallel: false, // the journey creates and navigates to a plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-interchange' }]]
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
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // Schedule interchange ON, plus every layer the committed plan's landing page builds on
            // (canvas authoring → toolbar → workspace → editing surface + pen). Scheduling modes is
            // pinned OFF (mirroring the LOE / resource-view suites) to keep this journey asserting the
            // plain import loop it was written for.
            env: {
              VITE_SCHEDULE_INTERCHANGE: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
