import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **live cross-plan / programme scheduling** web surface
 * (inter-project M2, ADR-0045 F8).
 *
 * Serves the web bundle with its defaults, so a planner can draw a live
 * cross-plan link and run a programme recalculate end-to-end. It runs on the **legacy stacked
 * plan-detail page** (canvas workspace + pen pinned OFF, matching the flags-off baseline suite) so the
 * journey stays simple: no pen dance, and the API's edit-lock enforcement is off by default, so the
 * cross-plan create needs no lock. Like the other suites the flags bake at `webServer` start,
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
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // No flag is pinned: the journey runs the pen layer as shipped and takes the pen
            // through the UI (`e2e-support/pen.ts`) before it adds an activity or a link.
          },
        ],
      }),
});
