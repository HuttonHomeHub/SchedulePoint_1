import { defineConfig, devices } from '@playwright/test';

/**
 * The **toolbar fit gate** (ADR-0090 M1). It holds one invariant: **a command a planner can see is a
 * command a planner can click**, at every viewport this product targets.
 *
 * **Why a new suite rather than an addition to `e2e-toolbar`.** That config pins
 * `VITE_CANVAS_AUTHORING: 'false'` (`playwright.toolbar.config.ts:67`) — deliberately, because its
 * journey asserts the ADR-0031 plain Add toggle — and `tsld-toolbar-items.tsx` branches on
 * `CANVAS_AUTHORING_ENABLED` for Row 2's `add-activity` and `link-tool`. That flag is default-**on**
 * in production, so `e2e-toolbar` is exercising an *off*-branch composition, not a lighter version
 * of the shipped one. Row 2 is exactly where `print` clipped at 960, so measuring the wrong Row 2
 * would have been worse than not measuring it.
 *
 * **This config therefore pins no `VITE_` flags at all**, which is its defining property: ADR-0088
 * D1 established that a published image carries every flag at its default, so the shipped surface
 * *is* the default surface. (`playwright.calendar-shifts.config.ts` and `playwright.staff.config.ts`
 * also pin none, for unrelated reasons — the plan's claim that no other config had this property was
 * wrong, and is corrected here rather than repeated.)
 *
 * The API runs with the pen enforced, because the toolbar's composition depends on it.
 *
 * Sibling: `playwright.measure-toolbar.config.ts` + `measure-toolbar/`, which **reports and asserts
 * nothing** (ADR-0081 §3). That is the harness; this is the gate.
 */
export default defineConfig({
  testDir: './e2e-toolbar-fit',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 180_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-toolbar-fit' }]]
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
            timeout: 180_000,
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
          },
        ],
      }),
});
