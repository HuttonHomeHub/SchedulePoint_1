import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **Float paths** surface (`VITE_FLOAT_PATHS`, audit
 * F4) — the toolbar item, the docked panel, and the path emphasis in the Diagram and the Gantt.
 *
 * Everything this suite proves needs a **real API and a real database**. That a branch carrying one
 * working day of float reads `+1d` on an eight-hour calendar — and not `0d` — is the defect the
 * whole epic descends from, and a mocked fetch cannot tell you: it echoes whatever it was handed.
 * Nor can a mock tell you that the toolbar item is live in the Gantt (the seam that was broken and
 * fixed in M1), or that the panel survives a view switch.
 *
 * Like the sibling flag-on configs the flags bake at `webServer` start, so this is its own config on
 * the same ports, run as its own CI step. Chromium only (TECH_DEBT #25a), serial (one org's plan is
 * read throughout).
 */
export default defineConfig({
  testDir: './e2e-float-paths',
  // One journey, seven claims — sign-up, an org, a calendar, a project, a plan, fifteen activities,
  // fourteen links and a recalculation before the first assertion. Playwright's 30 s default is per
  // TEST, not per action, and this is deliberately a single test (a fresh context per claim would
  // drop the session and re-seed the network five times).
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-float-paths' }]]
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
        // Wide enough that the docked panel does not push the diagram below its floor — the
        // narrow single-pane behaviour is a separate concern and is covered by unit tests.
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
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              VITE_FLOAT_PATHS: 'true',
              // The Gantt is half the claim — the item must be live there, not shaded.
              VITE_GANTT_VIEW: 'true',
              // The toolbar item lives in the TSLD registry, which the canvas workspace hosts.
              VITE_CANVAS_WORKSPACE: 'true',
              // No pen: this analysis is read-only and is NOT pen-gated. Leaving the lock off keeps
              // the journey about what it is about — a planner reading, not authoring.
              VITE_PLAN_EDIT_LOCK: 'false',
            },
          },
        ],
      }),
});
