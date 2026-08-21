import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **TSLD minimap** (ADR-0100, `docs/specs/tsld-minimap/`).
 *
 * The epic ships **no `VITE_` flag** (ADR-0088 D1: a build-time constant is not an operator
 * rollback), so — like `playwright.workspace-chrome.config.ts` — nothing is pinned and the
 * suite runs against the default bundle, which IS the shipped surface. The journey lands with
 * the first user-facing milestone, not at the gate pass (ADR-0081): its first steps open a
 * plan, press `View ▾`, press `Minimap` by accessible name, and assert the panel and the
 * rectangle — the entry point is the test's subject, because a capability with no entry point
 * is the register's most-repeated defect.
 *
 * The pen is enforced at the API (`PLAN_EDIT_LOCK_ENFORCED`) because the setup seeds
 * activities and recalculates through the real write path. Chromium only (TECH_DEBT #25a),
 * serial (one org's plans are mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-minimap',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-minimap' }]]
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
