import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **swimlanes by hand** journey (`docs/specs/swimlanes/`, M2-T11 —
 * the entry point and the journey, ADR-0081).
 *
 * It drives the real product against a real API: `View ▾ ▸ Structure ▸ Set up swimlanes…`, Move to
 * swimlane…, the grouped listbox, the lens round trip against the lanes the API stored, and the
 * focus each dialog and delete leaves behind. Those last are statements about a real focus ring that
 * jsdom cannot make (ADR-0111), which is why the unit tiers could pass while this was wrong.
 *
 * **No `VITE_` flag** (ADR-0088 D1): the lens is lit in the shipped bundle, so nothing is pinned and
 * this runs against the default build, which IS the surface. The pen is **enforced at the API**
 * because every swimlane write is pen-gated, and a mocked `fetch` accepts a stale version from
 * anybody; only a real lock refuses one.
 *
 * The seeded plan `plan:capability-swimlanes` is created through the public REST API by
 * `schedulepoint-seed` (ADR-0066), after the actor signs up — the seeder gets no privileged path.
 * Chromium only (TECH_DEBT #25a), serial (each case onboards its own organisation).
 */
export default defineConfig({
  testDir: './e2e-swimlanes',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-swimlanes' }]]
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
        // 1646 CSS px — the width this product is judged on (ADR-0091's retrospective). The
        // floor cases resize to 1024 x 600 themselves.
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
              PLAN_EDIT_LOCK_ENFORCED: 'true',
              // Each case seeds a catalogue family through the public API, which is well over the
              // global throttler's 100 requests a minute (the NetPoint grammar suite's measurement
              // and reasoning, `playwright.netpoint-grammar.config.ts`). Raised for this harness
              // only; the guard is untouched and no other suite or environment sees this value.
              // Measured 2026-10-30 (E2E_THROTTLE_CENSUS=1, 28 cases): the browser's peak was 58
              // requests per 60 s on one handler (the activity list). The census cannot see the seeder,
              // which is its own client: `plan:capability-codes-wide` posts 201 code values and 101
              // activities in one run, the busiest handler at 201, which is why 300 stays and the
              // default of 100 would not do.
              RATE_LIMIT_LIMIT: '300',
            },
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
