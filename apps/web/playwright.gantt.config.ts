import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **Gantt view** (`VITE_GANTT_VIEW`, ADR-0059,
 * `docs/specs/gantt-view/`) — the view switch, the grid-and-bars projection, URL-backed view state
 * and the grid's keyboard/a11y contract. Serves the web bundle with `VITE_GANTT_VIEW=true` plus the
 * canvas-first plan-workspace layers this journey's authoring steps build on (canvas authoring →
 * toolbar → workspace → editing surface + pen; mirrors the library/interchange/share suites'
 * layering). Like the other flag-on configs the flags bake at `webServer` start, so this is a
 * separate config on the same ports; it runs as its own CI step after the prior suites tear down.
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-gantt',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-gantt' }]]
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
        // A wide desktop viewport so both halves of the tier-1 view switch stay inline as real
        // labelled buttons rather than demoting into the responsive `⋯` overflow menu.
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
            // The Gantt ON, plus every layer the canvas-first plan workspace builds on. Scheduling
            // modes is pinned OFF (mirroring the LOE / resource-view / interchange / share / library
            // suites) to keep this journey asserting the plain authoring surface it was written for.
            env: {
              VITE_GANTT_VIEW: 'true',
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
