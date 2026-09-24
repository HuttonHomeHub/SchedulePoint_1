import { defineConfig, devices } from '@playwright/test';

/**
 * The **NetPoint grammar** journey (`docs/specs/netpoint-grammar/`, ADR-0157 when filed). It drives
 * the real canvas on the seeded NetPoint reference plan (`--tier reference`) against a real API with
 * the pen enforced.
 *
 * It lands at M0 as a scaffold and grows with each milestone (spec §4.13, ADR-0081): the grid at M1,
 * bars and nodes at M2, links and gap labels at M3, and text and tiers at M4. The canvas colour
 * traps this epic can trip (ADR-0102, ADR-0100 M4, ADR-0121) are invisible to every unit suite,
 * because jsdom resolves no custom property and has no canvas. So each milestone's assertions read
 * the tokens where the painter reads them, and read the painted pixels.
 */
export default defineConfig({
  testDir: './e2e-netpoint-grammar',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-netpoint-grammar' }]]
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
        // The product owner's own screen width (1646 CSS px), at which every NetPoint picture in
        // this epic was taken.
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
              // The pen is ENFORCED, so the seeded plan must be recalculated through the pen, as a
              // planner would.
              PLAN_EDIT_LOCK_ENFORCED: 'true',
              // Seeding a 58-activity plan through the public API is well over the global throttler's
              // 100 requests a minute. Raised for this harness only, as the arrange, gantt and measure
              // harnesses do. The guard itself is untouched.
              RATE_LIMIT_LIMIT: '100000',
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
