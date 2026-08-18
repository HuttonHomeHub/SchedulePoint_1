import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for **Recently deleted** (ADR-0096).
 *
 * The epic ships **unflagged** — it is a restructure of one screen plus a server-side switch, and
 * gating it would mean two copies of the same table in one file (the ADR-0061 reasoning). So this
 * is a journey rather than a flag-on journey, and it lands with the first user-facing milestone
 * because ADR-0081 says a milestone claiming user-facing capability proves it here or not at all.
 *
 * Everything it proves needs a **real API and a real database**:
 *
 * - A cascade stamps ONE `delete_batch_id` across a subtree. Grouping is built entirely on that
 *   column, and a mocked fetch hands the client whatever batch ids the test invented — it cannot be
 *   wrong about the thing under test.
 * - `blockedBy` is computed in a raw `UNION ALL` with three different parent shapes. The
 *   cross-batch case — a plan deleted on its own, then its client deleted afterwards — is the one
 *   grouping cannot dissolve, and it exists only if the SQL really compares two batch ids.
 * - `retentionActive` and `retentionDays` come from the **server's** configuration. The whole point
 *   of D2 is that a client-side constant would be wrong on any host that overrode it, so the only
 *   honest test sets the server variable and reads the screen.
 *
 * The API runs with the expiry **armed but with a 3,650-day period**. That is deliberate: it makes
 * `retentionActive` true so the countdown copy renders and can be asserted, while making every row
 * in the database ineligible, so a suite about a screen cannot permanently delete somebody's local
 * development data as a side effect.
 *
 * Chromium only (TECH_DEBT #25a), serial (one organisation is mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-recently-deleted',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-recently-deleted' }]]
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
            env: {
              LOG_LEVEL: 'silent',
              // Armed, so `retentionActive` is true and the countdown renders — with a period no
              // row can reach, so nothing is actually deleted. See the docblock above.
              RETENTION_HIERARCHY_ENABLED: 'true',
              RETENTION_HIERARCHY_DAYS: '3650',
            },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }),
});
