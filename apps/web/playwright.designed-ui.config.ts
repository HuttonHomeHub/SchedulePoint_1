import { defineConfig, devices } from '@playwright/test';

/**
 * **Theme-parametrised accessibility, flag OFF** (ADR-0055 §5, `docs/specs/designed-ui/`).
 * It boots the shell once per theme — a thing the shared `e2e` project cannot express, since the
 * theme is chosen before first paint — and scans each for WCAG violations.
 *
 * This began as a rollback-parity suite: `VITE_DESIGNED_CHROME` was pinned **false**, and the flag
 * carried token values in a `[data-designed-chrome]` layer (ADR-0055 §6), so flag-off painted a
 * different palette as well as a different shell.
 *
 * **ADR-0097 removed the colour half and Graphite M2 removed the rest.** There is one theme, the
 * flagged value layers folded into the theme block, and the flag itself is retired — so this suite
 * now runs against the shipped shell, which is strictly MORE coverage than proving a shell no
 * published bundle could produce (ADR-0088's finding, applied rather than quoted). What it proves
 * is unchanged and is the reason it survives the flag: a reader still carrying `dark`, `system` or
 * `corporate` in storage from before the collapse gets the same painted theme as everybody else.
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
            // `VITE_CANVAS_VISUAL_LANGUAGE` off keeps the diagram out of the theme sweep, which
            // is about the shell's chrome and not the plot (ADR-0097 Landing E gave the canvas its
            // own scope and its own pairs in the contrast matrix).
            env: { VITE_CANVAS_VISUAL_LANGUAGE: 'false' },
          },
        ],
      }),
});
