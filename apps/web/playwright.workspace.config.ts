import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **canvas-first plan workspace**
 * (`VITE_CANVAS_WORKSPACE`, ADR-0030).
 *
 * The default `playwright.config.ts` serves the app flag-off, so the plan surface is
 * the legacy long-scrolling page and its journeys assert that layout. The workspace
 * journey needs the opposite: a web bundle built with `VITE_CANVAS_WORKSPACE=true` so
 * the plan route renders the canvas-first workspace (canvas + drag-resizable bottom
 * activity panel + overflow menu). It also turns the editing surface + pen layer on
 * (`VITE_TSLD_EDITING` / `VITE_PLAN_EDIT_LOCK`, API `PLAN_EDIT_LOCK_ENFORCED=true`)
 * so a Planner can take the pen and drive the real edit affordances — the workspace's
 * whole point. Because Playwright's `webServer` bakes those env vars at start and is
 * global to a config, this can't share a config with the flag-off run — hence a third
 * config alongside `playwright.edit.config.ts`. It runs as a **separate CI step** on
 * the same ports; Playwright tears down the prior servers before this one starts.
 *
 * Chromium only — the flag-off suite already carries firefox/webkit (TECH_DEBT #25a).
 */
export default defineConfig({
  testDir: './e2e-workspace',
  fullyParallel: false, // the workspace journey mutates a shared plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-workspace' }]]
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
            // Canvas-first workspace ON, plus the editing surface + pen layer so the
            // Planner journey exercises the real edit affordances.
            env: {
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
            },
          },
        ],
      }),
});
