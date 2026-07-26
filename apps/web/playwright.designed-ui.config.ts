import { defineConfig, devices } from '@playwright/test';

/**
 * **Theme-parametrised accessibility, flag OFF** (ADR-0055 §5, `docs/specs/designed-ui/`).
 * It boots the shell once per theme — a thing the shared `e2e` project cannot express, since the
 * theme is chosen before first paint — and scans each for WCAG violations.
 *
 * `VITE_DESIGNED_CHROME` is pinned **false** below. It used to be absent, because off was the
 * default; since the S5-T4 flip it has to be explicit, and the suite's job changed with it. This
 * is now the **rollback-parity** suite: it proves that turning the epic off still leaves an
 * accessible app in all four themes. `playwright.designed-chrome.config.ts` is its flag-ON
 * sibling and covers the shipped default. Both run in CI; deleting either would leave one side
 * of the rollback contract unproven.
 *
 * Chromium only (TECH_DEBT #25a), serial (each test onboards its own org).
 */
export default defineConfig({
  testDir: './e2e-designed-ui',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-designed-ui' }]]
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
        // Wide enough that the pinned Project Explorer rail is shown rather than the
        // below-`lg` drawer — the panel surface is half of what this suite measures.
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
            // Explicit since the S5-T4 flip made ON the default — this suite is the rollback side.
            env: { VITE_DESIGNED_CHROME: 'false', VITE_CANVAS_VISUAL_LANGUAGE: 'false' },
          },
        ],
      }),
});
