import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **Health check** panel (health M2-T4) — the Analysis menu item,
 * the docked DCMA report, and the offender jump. No `VITE_` flag exists for this feature
 * (ADR-0088 D1), so this is the flag-on-equivalent journey ADR-0081 requires: it lands with the
 * first user-facing milestone, and what it proves no unit suite can — that the entry point exists
 * in the SHIPPED layout and the panel renders a real API's report.
 *
 * Like the sibling configs: its own CI step, Chromium only (TECH_DEBT #25a), serial (one org's
 * plan is read throughout).
 */
export default defineConfig({
  testDir: './e2e-health-check',
  // One journey: sign-up, an org, a project, a plan, four activities, two links and a
  // recalculation before the first assertion — Playwright's 30 s default is per TEST.
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-health-check' }]]
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
        // **1646, measured, not chosen**: the product owner's Surface Pro at 175 % (ADR-0091 M7
        // made it permanent in the harness estate). The deck WRAPS since ADR-0109 D1, so every
        // command is reachable at every width — this suite runs at the width the product is
        // actually judged on, where the docked panel must still leave the diagram beside it.
        viewport: { width: 1646, height: 1080 },
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
            env: {
              // Float paths ON: claim 5 proves the one-dock-at-a-time pair against the REAL
              // sibling, not a stub. No pen: the report is a read and is not pen-gated — leaving
              // the lock off keeps the journey about a planner reading, not authoring.
              VITE_FLOAT_PATHS: 'true',
              VITE_PLAN_EDIT_LOCK: 'false',
            },
          },
        ],
      }),
});
