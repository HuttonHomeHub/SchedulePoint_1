import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **per-assignment join lag**
 * (`VITE_ASSIGNMENT_LAG`, ADR-0071 M4) — the "Joins after" control on the assign form and on each
 * assignment row.
 *
 * Everything this suite proves needs a **real API and a real database**. That `1d` on an eight-hour
 * calendar stores **480 minutes and not 1,440** is the epic's central risk, and a mocked fetch
 * cannot tell you: it echoes whatever it was handed. Nor can a mock tell you that the write is
 * pen-gated, that the optimistic `version` round-trips (a mock accepts any), or — the one that
 * caught ADR-0070 twice — that the calendar the factor is read from actually reaches the control on
 * the surface where the work is really done.
 *
 * Like the sibling flag-on configs the flags bake at `webServer` start, so this is its own config on
 * the same ports, run as its own CI step. Chromium only (TECH_DEBT #25a), serial (one org's plan is
 * mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-assignment-lag',
  // One journey, five claims — sign-up, an org, a calendar, a resource, a plan, an activity, four
  // saves and a pen release. Playwright's 30 s default is per TEST, not per action, and this is
  // deliberately a single test (a fresh context per claim would drop the session and the pen).
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-assignment-lag' }]]
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
            env: {
              VITE_ASSIGNMENT_LAG: 'true',
              // The resources surface the control lives on.
              VITE_RESOURCES: 'true',
              // The legacy stacked plan page and the flag-off Resources DIALOG, not the tabbed
              // editor: this suite is about one field, and driving it through a canvas and a tab
              // rail would add a dozen reasons to fail for something the epic is not about. The
              // panel is the SAME component either way (ADR-0062), which is what makes that safe.
              VITE_CANVAS_WORKSPACE: 'false',
              VITE_ACTIVITY_EDITOR_TABS: 'false',
              VITE_ACTIVITY_EDITOR_CONVERGENCE: 'false',
              // The pen must be real: an assignment write is pen-gated (ADR-0028), and a lag that
              // saves without the lock is not the thing being tested.
              // `VITE_LIBRARY_SCOPING` is deliberately NOT pinned. It is default-on, so the
              // resource picker is the shared APG `Combobox` — leaving it at its default is what
              // makes this journey drive the control a planner actually meets, and the shared
              // `e2e/combobox.ts` driver already knows how.
            },
          },
        ],
      }),
});
