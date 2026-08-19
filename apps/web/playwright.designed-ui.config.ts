import { defineConfig, devices } from '@playwright/test';

/**
 * **Theme-parametrised accessibility, flag OFF** (ADR-0055 §5, `docs/specs/designed-ui/`).
 * It boots the shell once per theme — a thing the shared `e2e` project cannot express, since the
 * theme is chosen before first paint — and scans each for WCAG violations.
 *
 * `VITE_DESIGNED_CHROME` is pinned **false** below, and what that pin now proves is narrower
 * than it was. It used to be a rollback-parity suite covering STRUCTURE and COLOUR across four
 * themes: the flag carried token values in a `[data-designed-chrome]` layer (ADR-0055 §6), so
 * flag-off painted a different palette as well as a different shell.
 *
 * **ADR-0097 removed both halves of that.** There is one theme, so there are no longer four to
 * parametrise over, and the flagged value layers are folded into the theme block — so flag-off
 * and flag-on paint the same colours by construction and the colour half of the contract has
 * nothing left to assert. What survives is worth keeping and is stated rather than implied: the
 * flag still selects a SHELL, and this suite proves that shell is accessible.
 * `playwright.designed-chrome.config.ts` is its flag-ON sibling and covers the shipped default.
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
