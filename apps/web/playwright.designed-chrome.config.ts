import { defineConfig, devices } from '@playwright/test';

/**
 * **The designed chrome band** (ADR-0055 S2). The flag it used to pin ON retired in Graphite
 * M2, so this now covers the shell unconditionally — which is the shipped one either way.
 *
 * A sibling of `playwright.designed-ui.config.ts`, which deliberately stays flag-OFF so the
 * shipped default surface keeps its four-theme accessibility scan. This one proves the three
 * things the band's own design turns on: the header and the toolbar rows are one surface, the
 * tab order follows the new DOM order, and axe still finds nothing on the band itself.
 *
 * Chromium only (TECH_DEBT #25a), serial (each test onboards its own org).
 */
export default defineConfig({
  testDir: './e2e-designed-chrome',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-designed-chrome' }]]
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
