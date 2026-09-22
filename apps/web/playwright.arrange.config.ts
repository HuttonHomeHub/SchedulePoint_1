import { defineConfig, devices } from '@playwright/test';

/**
 * Flag-ON **Auto-arrange** journey (diagram-legibility M-C2), closing `docs/TECH_DEBT.md` #363.
 *
 * `Arrange` shipped with the canvas and **nothing in this repository has ever pressed it** — the
 * row that records that was raised by grepping every `e2e*` directory for it and finding zero
 * files. Every assertion below therefore drives the real command against a real API with the pen
 * enforced, which is the only place the pen gate and the optimistic-`version` batch can be tested
 * at all (a mocked fetch accepts any version).
 *
 * `VITE_SCHEDULE_INTERCHANGE` is on because one case is a **real `.xer` import**: M-C0-T3a
 * established that a healthy import leaves nothing for the offer to say, and an absence assertion
 * that never ran against a real import proves nothing about imports.
 */
export default defineConfig({
  testDir: './e2e-arrange',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-arrange' }]]
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
        // Wide enough that `Arrange` stays inline on the command strip rather than demoting into
        // the responsive overflow — the suite locates it by role+name, and a demoted item is
        // behind a trigger (`docs/TECH_DEBT.md` #133).
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
            // The pen is ENFORCED, so the gate the offer depends on is the real one.
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              VITE_CANVAS_AUTHORING: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              VITE_SCHEDULE_INTERCHANGE: 'true',
            },
          },
        ],
      }),
});
