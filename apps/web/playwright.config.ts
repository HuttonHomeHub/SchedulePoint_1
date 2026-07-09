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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // The dev server is started automatically for local runs. It is skipped when
  // PLAYWRIGHT_SKIP_WEBSERVER is set (e.g. before the web app has an entry
  // point, or when testing against an already-running deployment).
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
