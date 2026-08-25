import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **command surface's fit and target sizes**
 * (`docs/specs/workspace-chrome-fit/`, M1).
 *
 * **This exists because a gate was deleted correctly and left a hole.** ADR-0109 D1 removed
 * `e2e-toolbar-fit` along with the width ladder it tested — the right call, since it asserted a row
 * that no longer exists, and a gate whose subject is gone does not become a safety net by continuing
 * to pass. But that journey's `elementFromPoint` sweep was **the only automated cover WCAG 2.2
 * §2.5.8 Target Size had in this repository**, and `docs/TECH_DEBT.md` #186 has recorded the gap
 * since.
 *
 * **axe cannot stand in for it, and "the axe scan is green" is true and meaningless here.**
 * ADR-0090 M5 established this by running axe-core directly: `target-size` is tagged `wcag22aa`
 * while every scan in this estate requests `wcag2a`/`wcag2aa`, **and** the rule ships
 * `enabled: false`. Two independent reasons it can never fire.
 *
 * Unlike its predecessor this suite has **no width ladder to drive**. A wrapping surface has no
 * demotion to model, so the question collapses to "does every command clear 24 × 24 and can a
 * pointer actually reach it", at each width, in both plan views.
 *
 * Chromium only (TECH_DEBT #25a), serial, and **run at four widths inside the spec** rather than as
 * four projects — the fixture is expensive to build and the sweep is cheap.
 */
export default defineConfig({
  testDir: './e2e-workspace-fit',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-workspace-fit' }]]
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
        // 1646 CSS px — the product owner's Surface Pro (2880×1920 at 175%), and the width every
        // measurement in this epic was taken at. The spec resizes from here.
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
            // **No `VITE_` pins**, for `playwright.workspace-chrome.config.ts`'s reason: a published
            // image carries every flag at its default (ADR-0088 D1), so the shipped surface IS the
            // default surface. Pinning them restates the defaults and quietly asserts that a
            // retired flag still exists — which `check:flags` caught once already.
          },
        ],
      }),
});
