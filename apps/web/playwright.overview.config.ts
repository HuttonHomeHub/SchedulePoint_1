import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **organisation overview** — the landing every sign-in reaches
 * (ADR-0098, `docs/specs/organisation-landing/`).
 *
 * **There is no flag** (spec §4.8 D7): this screen replaces its predecessor rather than sitting
 * beside it, and ADR-0088 D1 established that a `VITE_` constant is inlined at build time and is
 * therefore not an operator rollback whatever a docblock claims. So this config carries no flag for
 * the feature under test — it exists because the journey needs its own web/API pair and its own CI
 * step, which is ADR-0081 §2's enforcement half: a milestone claiming user-facing capability lands
 * with the journey that drives it, not at some later enablement.
 *
 * The flags it does set are the workspace layers the journey walks THROUGH to make a plan change —
 * it opens a plan, edits it, and comes back to assert the overview noticed. Chromium only
 * (TECH_DEBT #25a), serial (one organisation is built up throughout).
 */
export default defineConfig({
  testDir: './e2e-overview',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-overview' }]]
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
        viewport: { width: 1646, height: 1000 },
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
              // The pen is enforced, because the journey's whole point is that a real edit by a
              // real actor turns up on the overview. A journey against an unenforced lock would
              // pass without ever exercising the write path the read model reports on.
              PLAN_EDIT_LOCK_ENFORCED: 'true',
            },
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
            },
          },
        ],
      }),
});
