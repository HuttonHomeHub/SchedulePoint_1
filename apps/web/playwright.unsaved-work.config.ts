import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **unsaved-work navigation guard**
 * (`docs/specs/unsaved-work-guard/`).
 *
 * **This suite exists because no unit test can reach the thing most likely to be wrong.** The
 * guard's browser half is `beforeunload`, and `@tanstack/history` attaches that listener at
 * history creation — `createMemoryHistory` does not attach it at all, so jsdom cannot exercise
 * it in principle rather than merely in practice. The M0 measurement established that the unload
 * path never consults `shouldBlockFn`: it reads `enableBeforeUnload ?? true` and treats `true` as
 * "block", so a wrong registration prompts on every reload of every page while every unit test
 * stays green.
 *
 * **The clean cases carry as much weight as the dirty ones.** Over-warning is the failure that
 * gets a guard deleted rather than fixed, so each clean case asserts positively that no dialog
 * fired AND that the navigation completed — not merely that nothing timed out.
 *
 * No `VITE_` flag (ADR-0088 D1), so nothing is pinned: this runs against the default bundle,
 * which IS the shipped surface. The pen is enforced at the API because the guard reads the
 * ADR-0028 gate to decide whether dirty work is still savable. Chromium only, serial.
 */
export default defineConfig({
  testDir: './e2e-unsaved-work',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-unsaved-work' }]]
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
        // 1646 CSS px — the width this product is judged on (ADR-0091's retrospective made it
        // permanent in every canvas harness; M0's measurements were taken at it).
        viewport: { width: 1646, height: 1097 },
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
          },
        ],
      }),
});
