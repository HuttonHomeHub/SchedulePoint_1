import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **narrow shell** journey (`docs/specs/narrow-shell-journey/`,
 * `docs/TECH_DEBT.md` #172) — the authenticated shell below `lg`.
 *
 * **This suite exists because no authenticated journey had ever run below `lg` (1024 px).** Every
 * other config sets 1440+ or inherits Playwright's 1280 default, so the off-canvas `Sheet` that IS
 * the Project Explorer on a narrow screen, the header hamburger that opens it, and every
 * `lg:hidden` branch in the shell had never been driven by a browser. The ADR-0114 M7 gate pass
 * found the below-`md` workspace losing the plan's facts entirely — by a specialist review,
 * because this suite did not exist to find it.
 *
 * The default viewport is a phone (390 × 844, well under `md`); the breakpoint-crossing test sets
 * its own sizes with `setViewportSize`. **The pointer stays fine** (Playwright's default): the
 * coarse-pointer axis belongs to `docs/TECH_DEBT.md` #133 and `measure-toolbar`, and mixing the
 * two axes in one new suite would blur which failure means what.
 *
 * **No `VITE_` pins at all** — the same choice `playwright.workspace-chrome.config.ts` makes and
 * for the same reason: a published image carries every flag at its default (ADR-0088 D1), so the
 * shipped surface IS the default surface. Chromium only (TECH_DEBT #25a), serial (one org's data
 * is created and navigated throughout).
 */
export default defineConfig({
  testDir: './e2e-narrow-shell',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-narrow-shell' }]]
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
        viewport: { width: 390, height: 844 },
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
