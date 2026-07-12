import { defineConfig, devices } from '@playwright/test';

// End-to-end test configuration for the Blank App web client.
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
        // Allow pointing at a pre-installed Chromium (e.g. a managed CI/dev image
        // whose browser build differs from Playwright's default). Unset → default.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
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
            // This is the FLAGS-OFF baseline suite: it pins the editing flags off
            // so the read-only TSLD surface and the role-only (no-pen) editing
            // journeys stay covered even though both now default ON in the shipped
            // bundle (apps/web/src/config/env.ts, 2026-07-12). The flags-ON editing
            // surface has its own harness, playwright.edit.config.ts (test:e2e:edit).
            env: { VITE_TSLD_EDITING: 'false', VITE_PLAN_EDIT_LOCK: 'false' },
          },
        ],
      }),
});
