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
            env: {
              LOG_LEVEL: 'silent',
              PLAN_EDIT_LOCK_ENFORCED: 'true',
              // Measured 2026-10-05 (E2E_THROTTLE_CENSUS=1, all nine journeys green, zero 429s): the
              // busiest handler, GET …/plans/:id/activities, peaks at 102 requests per 60 s — over the
              // product's 100. Undo now re-reads what it is about to undo (ADR-0176) and every journey
              // polls the REST API for what was stored, so the suite crossed the limit and a journey
              // failed by name on a 429 (the throttle-visibility guard, ADR-0175). Ceiling 450 is about
              // 4x that peak, rounded up to the next 50, matching the other suites' margin for CI
              // runners. Raised for this harness only; the product default stays 100/60 s.
              RATE_LIMIT_LIMIT: '450',
            },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // Undo/redo ON, plus every layer it builds on (canvas authoring → toolbar → workspace →
            // editing surface + pen).
            //
            // **`VITE_SCHEDULING_MODES` is no longer pinned off** (one-planning-surface M-B-T1). It
            // was, "to keep the journey asserting the plain authoring + undo surface; its own
            // surface is unit-covered" — a reason that was locally sound and collectively produced
            // the coverage inversion that epic exists to remove: thirteen configs pinning off the
            // surface the collapse makes universal, so almost nothing drove it end to end. The flag
            // now takes its default, which is what a shipped bundle carries (ADR-0088 D1).
            env: {
              VITE_UNDO_REDO: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
            },
          },
        ],
      }),
});
