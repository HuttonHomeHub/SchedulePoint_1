import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **canvas-first plan authoring** (`VITE_CANVAS_AUTHORING`,
 * ADR-0032) — the layer above ADR-0031's toolbar workspace. Serves the web bundle with
 * `VITE_CANVAS_AUTHORING=true` (plus the toolbar + workspace + editing + pen flags it layers on) so a
 * Planner can build a plan directly on the canvas: draw the first activity on a blank canvas, set the
 * inline start date, auto-recalc, place milestones, and link with the two-click tool. Like the other
 * flag-on configs the flags bake at `webServer` start, so this is a separate config on the same ports;
 * it runs as its own CI step after the prior suites tear down. Chromium only (TECH_DEBT #25a).
 */
export default defineConfig({
  testDir: './e2e-authoring',
  fullyParallel: false, // the journey mutates a shared plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-authoring' }]]
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
            // Canvas-first authoring ON, plus every layer it builds on (toolbar → workspace →
            // editing surface + pen). Scheduling modes (ADR-0033) layers ON TOP of authoring and is
            // now default-on, so it's pinned OFF here to keep this journey asserting the authoring
            // surface it was written for (the single "Timeline start" control, no mode selector);
            // the scheduling-modes surface is covered by its own unit suites.
            env: {
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
