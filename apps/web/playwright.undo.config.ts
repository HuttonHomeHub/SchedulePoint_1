import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **undo / redo** (`VITE_UNDO_REDO`, ADR-0048) — the
 * user-visible surface (toolbar Undo/Redo + keybindings + announcements) layered on the canvas-first
 * authoring workspace. Serves the web bundle with `VITE_UNDO_REDO=true` plus the toolbar / workspace /
 * editing / pen flags it builds on, and the API enforcing the pen (`PLAN_EDIT_LOCK_ENFORCED=true`), so
 * a Planner can author a plan on the canvas and reverse the edits with the real controls. Like the
 * other flag-on configs the flags bake at `webServer` start, so this is a separate config on the same
 * ports; it runs as its own CI step after the prior suites tear down. Chromium only (TECH_DEBT #25a).
 */
export default defineConfig({
  testDir: './e2e-undo',
  fullyParallel: false, // the journey mutates a shared plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-undo' }]]
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
            // Undo/redo ON, plus every layer it builds on (canvas authoring → toolbar → workspace →
            // editing surface + pen). Scheduling modes is pinned OFF (like the authoring suite) to keep
            // the journey asserting the plain authoring + undo surface; its own surface is unit-covered.
            env: {
              VITE_UNDO_REDO: 'true',
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
