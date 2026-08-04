import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **audit log** (`VITE_AUDIT_LOG`, ADR-0072).
 *
 * Everything this suite proves needs a **real API and a real database**, because the audit log is a
 * claim about writes that happened somewhere else: that a producer actually fired inside the
 * transaction that succeeded, that the `before` on a role change is the row's real prior value and
 * not the DTO's, that the organisation feed 403s for a member who is not an Org Admin, and that the
 * `/me` feed is scoped by **actor** rather than by subject. A mocked fetch answers all four with
 * whatever it was handed — it cannot be wrong about a row it invented.
 *
 * Like the sibling flag-on configs the flags bake at `webServer` start, so this is its own config on
 * the same ports, run as its own CI step. Chromium only (TECH_DEBT #25a), serial (two accounts and
 * one organisation are mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-audit',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-audit' }]]
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
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // The audit surface ON, and nothing else. Every action this journey audits — sign-up,
            // organisation create, invite, accept, role change, client delete — lives on the
            // ordinary hierarchy and members screens, so no canvas layer is involved and the
            // fewer flags a journey needs the fewer reasons it has to fail for something it is
            // not about.
            env: { VITE_AUDIT_LOG: 'true', VITE_AUDIT_FILTERS: 'true' },
          },
        ],
      }),
});
