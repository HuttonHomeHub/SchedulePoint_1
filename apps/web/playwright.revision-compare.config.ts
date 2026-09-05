import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **Compare revisions** dock (revision M2-T4) — the Analysis menu
 * item, the two side pickers, the docked comparison and the honesty footer.
 *
 * No `VITE_` flag exists for this feature (spec D7 / ADR-0088 D1), so this is the flag-on-equivalent
 * journey ADR-0081 requires: it lands with the FIRST user-facing milestone, not at the gate pass,
 * and what it proves no unit suite can — that the entry point exists in the SHIPPED layout and the
 * panel renders a real API's comparison.
 *
 * Like the sibling configs: its own CI step, Chromium only (TECH_DEBT #25a), serial (one org's plan
 * is read throughout).
 */
export default defineConfig({
  testDir: './e2e-revision-compare',
  // One journey: sign-up, an org, a project, a plan, three activities, a link, TWO recalculations
  // and a baseline capture before the first assertion — Playwright's 30 s default is per TEST.
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-revision-compare' }]]
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
        // made it permanent in the harness estate). Claim 6 then narrows to 1024, where CQ-3
        // measured the dock squeezed hardest.
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
              // No pen: the comparison is a READ and is not pen-gated, so leaving the lock off
              // keeps this journey about a planner reading rather than authoring.
              VITE_PLAN_EDIT_LOCK: 'false',
            },
          },
        ],
      }),
});
