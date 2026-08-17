import { defineConfig, devices } from '@playwright/test';

/**
 * Measurement harness for the Gantt's link density (M0-T1 R5, `docs/specs/gantt-editing/`).
 *
 * A harness, **not a gate** — it is not a CI step and nothing fails a build on its output. It writes
 * JSON to `measure-output/` for a human to read, in the `measure-toolbar` tradition.
 *
 * It pins **no `VITE_` flags**, deliberately: a published image carries every flag at its default
 * (ADR-0088 D1), so the default surface is the shipped surface and is the one worth measuring. The
 * pen is enforced at the API because the seeding path holds it like any other client.
 */
export default defineConfig({
  testDir: './measure-gantt',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 900_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'off',
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
            reuseExistingServer: true,
            timeout: 180_000,
            env: {
              LOG_LEVEL: 'silent',
              PLAN_EDIT_LOCK_ENFORCED: 'true',
              // Seeding hundreds of activities through the API trips the global throttler (100/60 s),
              // which exists to deny abusive traffic and cannot tell this harness from it. Raised
              // here only — the guard is untouched and no other suite or environment sees it. Copied
              // from `playwright.gantt.config.ts`, whose scale journey hit the same wall; omitting it
              // made sign-up fail with the form still filled and NO error on screen, which reads like
              // a broken sign-up rather than a spent budget.
              RATE_LIMIT_LIMIT: '100000',
            },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: true,
            timeout: 180_000,
          },
        ],
      }),
});
