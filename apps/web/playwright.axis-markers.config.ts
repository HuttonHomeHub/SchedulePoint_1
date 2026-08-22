import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **canvas axis markers** (`docs/specs/canvas-axis-markers/`,
 * `docs/TECH_DEBT.md` #148).
 *
 * The epic ships **no `VITE_` flag** (ADR-0088 D1: a build-time constant is inlined at build time
 * and is not an operator rollback; and this REPLACES a surface rather than adding one, so a flag
 * would mean two marker implementations maintained in parallel). Nothing is pinned: the suite runs
 * against the default bundle, which is the shipped surface.
 *
 * It lands with the **first user-facing milestone**, not at the gate pass (ADR-0081) — and its
 * subject is the assertion no unit test in this repository can make. `paint.test.ts` could ask
 * whether two constants collided; it could not ask whether a marker covers a bar, because that is a
 * question about two elements in a real layout and jsdom has none. That is why the two guards this
 * epic deletes both asked the wrong question for a year.
 *
 * The pen is enforced at the API (`PLAN_EDIT_LOCK_ENFORCED`) because the setup seeds activities and
 * recalculates through the real write path — and because the suite has to prove the markers are
 * right for a reader who does NOT hold it, which is two of the three audiences (a Viewer and an
 * External Guest never see the cursor readout at all). Chromium only (TECH_DEBT #25a), serial.
 */
export default defineConfig({
  testDir: './e2e-axis-markers',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-axis-markers' }]]
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
        // 1646 CSS px — the width this product is judged on, and the width every figure in
        // `m0-measurements.md` was taken at.
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
