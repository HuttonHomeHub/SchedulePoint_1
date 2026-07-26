import { defineConfig, devices } from '@playwright/test';

/**
 * **Theme-parametrised accessibility** configuration (ADR-0055 §5,
 * `docs/specs/designed-ui/`). Unlike the other extra suites this one gates no flag — the
 * surface-scope work it covers is unflagged, because it is an accessibility fix. What makes it
 * a separate suite is the *parametrisation*: it boots the shell once per theme, and the theme
 * is chosen before first paint, which the shared `e2e` project has no way to express.
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
          },
        ],
      }),
});
