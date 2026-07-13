import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **canvas-maximal, toolbar-hosted** plan workspace
 * (`VITE_CANVAS_TOOLBAR`, ADR-0031) — the layer above ADR-0030's canvas-first workspace.
 *
 * Serves the web bundle with `VITE_CANVAS_TOOLBAR=true` (and `VITE_CANVAS_WORKSPACE=true`, which it
 * layers on) plus the editing surface + pen so a Planner can drive the real toolbar commands. Like
 * `playwright.workspace.config.ts` / `playwright.edit.config.ts`, the flags bake at `webServer`
 * start, so this is a separate config on the same ports; it runs as its own CI step after the prior
 * suites tear down. Chromium only (the flag-off suite carries firefox/webkit; TECH_DEBT #25a).
 */
export default defineConfig({
  testDir: './e2e-toolbar',
  fullyParallel: false, // the journey mutates a shared plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-toolbar' }]]
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
            // Canvas-first workspace + the toolbar layer ON, plus the editing surface + pen.
            env: {
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
            },
          },
        ],
      }),
});
