import { defineConfig, devices } from '@playwright/test';

// End-to-end test configuration for the SchedulePoint web client.
// The dev server is started automatically when running locally; in CI the
// preview build is served instead.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serialise workers in CI for determinism; use Playwright's default locally.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
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
        // Allow pointing at a pre-installed Chromium (e.g. a managed CI/dev image
        // whose browser build differs from Playwright's default). Unset → default.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
  ],
  // The API and web dev servers are started automatically for local runs (the
  // journey exercises the full stack: browser → web → /api proxy → API →
  // Postgres). Skipped when PLAYWRIGHT_SKIP_WEBSERVER is set (e.g. testing
  // against an already-running deployment). The API needs a reachable database
  // (DATABASE_URL) and its migrations applied.
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
            // No flag is pinned: this is the base journey and it runs the bundle as shipped, pen
            // layer and editing surface both on. Every spec that edits takes the pen through the UI
            // (`e2e-support/pen.ts`); `PLAN_EDIT_LOCK_ENFORCED` stays at its default (off) on the
            // API, so the pen is real on the client without refusing a write that skips it. The two
            // pins that used to sit here put this suite in a configuration no shipped bundle can
            // be in (docs/TECH_DEBT.md #121).
          },
        ],
      }),
});
